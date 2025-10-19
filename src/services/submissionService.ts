import {
  PrismaClient,
  PermitSubmission,
  SubmissionState,
} from "@prisma/client";
import { UserPayload } from "../hooks/jwtAuth";
import { evaluateRules } from "../core/rules/evaluateRules";
import { RuleContext } from "../core/rules/types";
import { canTransition } from "../core/workflow/stateMachine";
import { packetQueue } from "../core/queues/packetQueue";

const prisma = new PrismaClient();

// This object contains all our business logic for submissions.
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

  /**
   * Creates a new submission for a user's organization after evaluating rules.
   */
  async createForUser(
    submissionData: RuleContext,
    user: UserPayload
  ): Promise<PermitSubmission> {
    const ruleResults = evaluateRules(submissionData);

    const requiredRules = ruleResults.filter((r) => r.severity === "REQUIRED");
    const passedRequiredRules = requiredRules.filter((r) => r.passed).length;
    const completenessScore =
      requiredRules.length > 0 ? passedRequiredRules / requiredRules.length : 1;

    const newSubmission = await prisma.$transaction(async (tx) => {
      const submission = await tx.permitSubmission.create({
        data: {
          projectName: submissionData.projectName,
          completenessScore: parseFloat(completenessScore.toFixed(2)),
          organizationId: user.organizationId,
        },
      });

      await tx.ruleResult.createMany({
        data: ruleResults.map((result) => ({
          submissionId: submission.id,
          // ... copy other result properties
          ruleKey: result.ruleKey,
          passed: result.passed,
          message: result.message,
          severity: result.severity,
        })),
      });

      return submission;
    });

    return newSubmission;
  },

  async transitionStateForUser(
    permitSubmissionId: string,
    targetState: SubmissionState,
    user: UserPayload
  ): Promise<PermitSubmission> {
    // 1. Fetch the current submission, ensuring org match
    const currentSubmission = await prisma.permitSubmission.findFirst({
      where: { id: permitSubmissionId, organizationId: user.organizationId },
    });

    if (!currentSubmission) {
      throw new Error("NOT_FOUND");
    }

    // 2. Check if transition is legal
    if (!canTransition(currentSubmission.state, targetState)) {
      throw new Error(
        `INVALID_TRANSITION:${currentSubmission.state}->${targetState}`
      );
    }

    // 3. Perform the update and create the event in a transaction
    const updatedSubmission = await prisma.$transaction(async (tx) => {
      await tx.workflowEvent.create({
        data: {
          submissionId: permitSubmissionId,
          eventType: "STATE_TRANSITION",
          fromState: currentSubmission.state,
          toState: targetState,
        },
      });

      return tx.permitSubmission.update({
        where: { id: permitSubmissionId, organizationId: user.organizationId },
        data: { state: targetState },
      });
    });

    return updatedSubmission;
  },

  async generatePacketForSubmission(
    submissionId: string,
    user: UserPayload
  ): Promise<{ jobId: string }> {
    // Validate submission exists and belongs to user's org
    const submission = await prisma.permitSubmission.findUnique({
      where: { id: submissionId, organizationId: user.organizationId },
    });

    if (!submission) {
      throw new Error("NOT_FOUND");
    }

    const job = await packetQueue.add("generate-pdf", { submissionId });
    if (!job.id) {
      throw new Error("Failed to queue packet: job ID missing");
    }
    return { jobId: job.id };
  },
};
