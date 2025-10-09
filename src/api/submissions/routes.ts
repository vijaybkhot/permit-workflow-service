import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, SubmissionState } from "@prisma/client";
import { evaluateRules } from "../../core/rules/evaluateRules";
import { RuleContext } from "../../core/rules/types";
import { canTransition } from "../../core/workflow/stateMachine";
import { packetQueue } from "../../core/queues/packetQueue";
import {
  submissionsCreatedCounter,
  stateTransitionCounter,
} from "../../core/metrics";

const prisma = new PrismaClient();

// shape of the incoming request body
interface CreateSubmissionBody {
  projectName: string;
  hasArchitecturalPlans: boolean;
  hasStructuralCalcs: boolean;
  buildingHeight: number;
  setbackFront: number;
  setbackSide: number;
  setbackRear: number;
  fireEgressCount: number;
}

export default async function (
  server: FastifyInstance,
  options: FastifyPluginOptions
) {
  // JSON schema for request body validation
  const createSubmissionSchema = {
    body: {
      type: "object",
      required: [
        "projectName",
        "hasArchitecturalPlans",
        "hasStructuralCalcs",
        "buildingHeight",
        "setbackFront",
        "setbackSide",
        "setbackRear",
        "fireEgressCount",
      ],
      properties: {
        projectName: { type: "string" },
        hasArchitecturalPlans: { type: "boolean" },
        hasStructuralCalcs: { type: "boolean" },
        buildingHeight: { type: "number" },
        setbackFront: { type: "number" },
        setbackSide: { type: "number" },
        setbackRear: { type: "number" },
        fireEgressCount: { type: "number" },
      },
    },
  };

  // --- schema for the transition endpoint ---
  const transitionSubmissionSchema = {
    body: {
      type: "object",
      required: ["targetState"],
      properties: {
        targetState: { type: "string", enum: Object.values(SubmissionState) },
      },
    },
    params: { type: "object", properties: { id: { type: "string" } } },
  };

  server.post<{ Body: CreateSubmissionBody }>(
    "/submissions",
    { schema: createSubmissionSchema },
    async (request, reply) => {
      try {
        const submissionData = request.body;

        // 1. Call core rule engine
        const ruleResults = evaluateRules(submissionData as RuleContext);

        // 2. Calculate the completeness score
        const requiredRules = ruleResults.filter(
          (r) => r.severity === "REQUIRED"
        );
        const passedRequiredRules = requiredRules.filter(
          (r) => r.passed
        ).length;
        const completenessScore =
          requiredRules.length > 0
            ? passedRequiredRules / requiredRules.length
            : 1;

        // 3. Use a transaction to save the submission and its results
        const newSubmission = await prisma.$transaction(async (tx) => {
          // Create the main submission record
          const submission = await tx.permitSubmission.create({
            data: {
              projectName: submissionData.projectName,
              completenessScore: parseFloat(completenessScore.toFixed(2)),
              //add state logic in a later ticket
            },
          });

          // Create the associated rule results
          await tx.ruleResult.createMany({
            data: ruleResults.map((result) => ({
              submissionId: submission.id,
              ruleKey: result.ruleKey,
              passed: result.passed,
              message: result.message,
              severity: result.severity,
            })),
          });

          return submission;
        });

        submissionsCreatedCounter.inc();

        // 4. Send back a success response
        reply.code(201).send({
          id: newSubmission.id,
          completenessScore: newSubmission.completenessScore,
        });
      } catch (error) {
        server.log.error(error, "Failed to create submission");
        reply.code(500).send({ error: "Internal Server Error" });
      }
    }
  );
  // --- POST to transition a submission's state ---
  server.post(
    "/submissions/:id/transition",
    { schema: transitionSubmissionSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { targetState } = request.body as { targetState: SubmissionState };

      try {
        // 1. Fetch the current submission
        const currentSubmission =
          await prisma.permitSubmission.findUniqueOrThrow({
            where: { id },
          });

        // 2. Ask the "referee" if the move is legal
        if (!canTransition(currentSubmission.state, targetState)) {
          return reply.code(400).send({
            error: "INVALID_TRANSITION",
            message: `Cannot transition from ${currentSubmission.state} to ${targetState}`,
          });
        }

        // 3. Perform the update and create the event in a single transaction
        const updatedSubmission = await prisma.$transaction(async (tx) => {
          // Create the event log first
          await tx.workflowEvent.create({
            data: {
              submissionId: id,
              eventType: "STATE_TRANSITION",
              fromState: currentSubmission.state,
              toState: targetState,
            },
          });

          // Then, update the submission's state
          return tx.permitSubmission.update({
            where: { id },
            data: { state: targetState },
          });
        });

        stateTransitionCounter.inc({
          from: currentSubmission.state,
          to: targetState,
        });

        reply.send(updatedSubmission);
      } catch (error) {
        server.log.error(error, `Failed to transition submission ${id}`);
        // This will catch the error from findUniqueOrThrow if the ID doesn't exist
        reply.code(404).send({ error: "Submission not found" });
      }
    }
  );

  // --- POST to generate a packet for a submission ---
  server.post("/submissions/:id/generate-packet", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      // 1. Validate that the submission exists before queueing the job
      const submission = await prisma.permitSubmission.findUnique({
        where: { id },
      });

      if (!submission) {
        return reply.code(404).send({ error: "Submission not found" });
      }

      const job = await packetQueue.add("generate-pdf", { submissionId: id });

      reply.send({ message: `Packet generation queued. Job ID: ${job.id}` });
    } catch (error) {
      server.log.error(
        error,
        `Failed to queue packet generation for submission ${id}`
      );
      reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  server.get("/submissions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const submission = await prisma.permitSubmission.findUniqueOrThrow({
        where: { id },
        include: {
          ruleResults: true,
        },
      });
      reply.send(submission);
    } catch (error) {
      server.log.error(error, `Submission with ID ${id} not found.`);
      reply.code(404).send({ error: "Submission not found" });
    }
  });

  // --- GET all submissions ---
  server.get("/submissions", async (request, reply) => {
    try {
      const submissions = await prisma.permitSubmission.findMany({
        // For now, just get the 10 most recent.
        // Pagination would be added here later.
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      reply.send(submissions);
    } catch (error) {
      server.log.error(error, "Failed to fetch submissions.");
      reply.code(500).send({ error: "Internal Server Error" });
    }
  });
}
