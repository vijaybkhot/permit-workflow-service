import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { SubmissionState } from "@prisma/client";
import { RuleContext } from "../../core/rules/types";
import {
  submissionsCreatedCounter,
  stateTransitionCounter,
} from "../../core/metrics";
import { submissionService } from "../../services/submissionService";

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
        const newSubmission = await submissionService.createForUser(
          request.body as RuleContext,
          request.user
        );
        submissionsCreatedCounter.inc();
        reply.code(201).send(newSubmission);
      } catch (error) {
        console.log(error); // <-- Add this for test debugging
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
        const updatedSubmission =
          await submissionService.transitionStateForUser(
            id,
            targetState,
            request.user
          );

        stateTransitionCounter.inc({
          from: updatedSubmission.state,
          to: targetState,
        });

        reply.send(updatedSubmission);
      } catch (error: any) {
        server.log.error(error, `Failed to transition submission ${id}`);
        if (error.message === "NOT_FOUND") {
          reply.code(404).send({ error: "Submission not found" });
        } else if (error.message.startsWith("INVALID_TRANSITION")) {
          reply.code(400).send({
            error: "INVALID_TRANSITION",
            message: error.message,
          });
        } else {
          reply.code(500).send({ error: "Internal Server Error" });
        }
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

    try {
      const submission = await submissionService.findOneForUser(
        id,
        request.user
      );

      if (!submission) {
        return reply.code(404).send({ error: "Submission not found" });
      }
      reply.send(submission);
    } catch (error) {
      server.log.error(error, `Error fetching submission with ID ${id}`);
      reply.code(500).send({ error: "Internal Server Error" });
    }
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
