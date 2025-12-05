import { PrismaClient, PermitSubmission } from "@prisma/client";
import { UserPayload } from "../hooks/jwtAuth";
import { evaluateRules } from "../core/rules/evaluateRules";
import { RuleContext } from "../core/rules/types";
import { packetQueue } from "../core/queues/packetQueue";

const prisma = new PrismaClient();

export const submissionService = {
  /**
   * Finds all submissions for a given user's organization.
   */
  async findAllForUser(user: UserPayload): Promise<PermitSubmission[]> {
    return prisma.permitSubmission.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },

  /**
   * Finds a single submission by ID, ensuring it belongs to the user's organization.
   */
  async findOneForUser(
    id: string,
    user: UserPayload
  ): Promise<PermitSubmission | null> {
    return prisma.permitSubmission.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { ruleResults: true },
    });
  },

  async transitionState(id: string, targetState: any, user: UserPayload) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current submission
      const currentSubmission = await tx.permitSubmission.findUniqueOrThrow({
        where: { id, organizationId: user.organizationId },
      });
      // 2. Log event
      await tx.workflowEvent.create({
        data: {
          submissionId: id,
          eventType: "STATE_TRANSITION",
          fromState: currentSubmission.state,
          toState: targetState,
        },
      });

      // 2. Update state
      return tx.permitSubmission.update({
        where: { id, organizationId: user.organizationId },
        data: { state: targetState },
      });
    });
  },

  async generatePacketForSubmission(
    id: string,
    user: UserPayload
  ): Promise<{ jobId: string }> {
    // 1. Validate submission exists and belongs to user
    const submission = await prisma.permitSubmission.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!submission) {
      throw new Error("Submission not found");
    }

    // 2. Add validation logic here if needed (e.g. state check)
    // if (submission.state !== 'VALIDATED') ...

    // 3. Queue Job
    const job = await packetQueue.add("generate-pdf", { submissionId: id });

    return { jobId: job.id as string };
  },

  /**
   * Creates a new submission.
   * NOW ASYNC: Looks up jurisdiction and fetches rules from DB.
   */
  async createForUser(
    submissionData: RuleContext,
    jurisdictionCode: string, // <-- NEW PARAMETER
    user: UserPayload
  ): Promise<PermitSubmission> {
    // 1. Look up the Jurisdiction by code (e.g. "ATX")
    const jurisdiction = await prisma.jurisdiction.findUnique({
      where: { code: jurisdictionCode },
    });

    if (!jurisdiction) {
      throw new Error(`Invalid Jurisdiction Code: ${jurisdictionCode}`);
    }

    // 2. Evaluate Rules (Now Async!)
    // We pass the ID so the engine knows which rules to fetch from the DB
    const ruleResults = await evaluateRules(submissionData, jurisdiction.id);

    // 3. Calculate Score
    const requiredRules = ruleResults.filter((r) => r.severity === "REQUIRED");
    const passedRequiredRules = requiredRules.filter((r) => r.passed).length;

    // Avoid division by zero if there are no required rules
    const completenessScore =
      requiredRules.length > 0 ? passedRequiredRules / requiredRules.length : 1;

    // 4. Transactional Save
    const newSubmission = await prisma.$transaction(async (tx) => {
      const submission = await tx.permitSubmission.create({
        data: {
          projectName: submissionData.projectName,
          completenessScore: parseFloat(completenessScore.toFixed(2)),
          organizationId: user.organizationId,
          jurisdictionId: jurisdiction.id, // <-- NEW: Link to Jurisdiction
        },
      });

      // Save results
      if (ruleResults.length > 0) {
        await tx.ruleResult.createMany({
          data: ruleResults.map((result) => ({
            submissionId: submission.id,
            ruleKey: result.ruleKey,
            passed: result.passed,
            message: result.message,
            severity: result.severity,
          })),
        });
      }

      return submission;
    });

    return newSubmission;
  },
};
