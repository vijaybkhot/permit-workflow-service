import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { SubmissionState } from "@prisma/client";
import { RuleContext } from "../../core/rules/types";
import {
  submissionsCreatedCounter,
  stateTransitionCounter,
} from "../../core/metrics";
import { submissionService } from "../../services/submissionService";
import { canTransition } from "../../core/workflow/stateMachine";

// shape of the incoming request body
interface CreateSubmissionBody {
  projectName: string;
  jurisdictionCode: string;
  hasArchitecturalPlans: boolean;
  hasStructuralCalcs: boolean;
  buildingHeight: number;
  setbackFront: number;
  setbackSide: number;
  setbackRear: number;
  fireEgressCount: number;

  lotArea?: number;
  imperviousArea?: number;
  heritageTreesRemoved?: boolean;
  zoningDistrict?: string;
  proposedUse?: string;
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
        "jurisdictionCode",
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
        jurisdictionCode: { type: "string", minLength: 3 },
        hasArchitecturalPlans: { type: "boolean" },
        hasStructuralCalcs: { type: "boolean" },
        buildingHeight: { type: "number" },
        setbackFront: { type: "number" },
        setbackSide: { type: "number" },
        setbackRear: { type: "number" },
        fireEgressCount: { type: "number" },

        lotArea: { type: "number" },
        imperviousArea: { type: "number" },
        heritageTreesRemoved: { type: "boolean" },
        zoningDistrict: { type: "string" },
        proposedUse: { type: "string" },
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
        // Extract jurisdictionCode separately
        const { jurisdictionCode, ...submissionData } = request.body;

        const newSubmission = await submissionService.createForUser(
          submissionData as RuleContext,
          jurisdictionCode, // <-- Pass code to service
          request.user
        );

        submissionsCreatedCounter.inc();

        reply.code(201).send({
          id: newSubmission.id,
          completenessScore: newSubmission.completenessScore,
          jurisdictionId: newSubmission.jurisdictionId,
        });
      } catch (error: any) {
        // Handle specific "Invalid Jurisdiction" error from service
        if (
          error.message &&
          error.message.includes("Invalid Jurisdiction Code")
        ) {
          server.log.warn(error);
          return reply.code(400).send({ error: error.message });
        }

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
        const currentSubmission = await submissionService.findOneForUser(
          id,
          request.user
        );

        if (!currentSubmission) {
          return reply.code(404).send({ error: "Submission not found" });
        }

        if (!canTransition(currentSubmission.state, targetState)) {
          return reply.code(400).send({
            error: "INVALID_TRANSITION",
            message: `Cannot transition from ${currentSubmission.state} to ${targetState}`,
          });
        }
        const updatedSubmission = await submissionService.transitionState(
          id,
          targetState,
          request.user
        );

        stateTransitionCounter.inc({
          from: currentSubmission.state,
          to: targetState,
        });

        reply.send(updatedSubmission);
      } catch (error) {
        server.log.error(error, `Failed to transition submission ${id}`);
        reply.code(500).send({ error: "Internal Server Error" });
      }
    }
  );

  // --- POST to generate a packet for a submission ---
  server.post("/submissions/:id/generate-packet", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { jobId } = await submissionService.generatePacketForSubmission(
        id,
        request.user
      );
      reply.send({ message: `Packet generation queued. Job ID: ${jobId}` });
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
    const submission = await submissionService.findOneForUser(id, request.user);

    if (!submission) {
      return reply.code(404).send({ error: "Submission not found" });
    }
    reply.send(submission);
  });

  // --- GET all submissions for a user's organization ---
  server.get("/submissions", async (request, reply) => {
    try {
      const submissions = await submissionService.findAllForUser(request.user);
      reply.send(submissions);
    } catch (error) {
      server.log.error(error, "Failed to fetch submissions.");
      reply.code(500).send({ error: "Internal Server Error" });
    }
  });
}
