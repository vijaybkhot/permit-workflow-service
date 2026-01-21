import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { SubmissionState } from "@prisma/client";
import { RuleContext } from "../../core/rules/types";
import { submissionService } from "../../services/submissionService";
import { metrics } from "../../core/observability/MetricsManager";

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
  options: FastifyPluginOptions,
) {
  // --- SCHEMAS (KEPT EXACTLY AS IS) ---
  const createSubmissionSchema = {
    headers: {
      type: "object",
      required: ["idempotency-key"],
      properties: {
        "idempotency-key": { type: "string" },
      },
    },
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

  const transitionSubmissionSchema = {
    headers: {
      type: "object",
      required: ["idempotency-key"],
      properties: {
        "idempotency-key": { type: "string" },
      },
    },
    body: {
      type: "object",
      required: ["targetState"],
      properties: {
        targetState: { type: "string", enum: Object.values(SubmissionState) },
      },
    },
    params: { type: "object", properties: { id: { type: "string" } } },
  };

  const updateSubmissionSchema = {
    headers: {
      type: "object",
      required: ["idempotency-key"],
      properties: {
        "idempotency-key": { type: "string" },
      },
    },
    params: {
      type: "object",
      properties: { id: { type: "string" } },
    },
    body: {
      type: "object",
      properties: {
        projectName: { type: "string" },
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

  const packetGenerationSchema = {
    headers: {
      type: "object",
      required: ["idempotency-key"],
      properties: {
        "idempotency-key": { type: "string" },
      },
    },
  };

  const getSubmissionSchema = {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  };

  const getAllSubmissionsSchema = {
    querystring: {
      type: "object",
      properties: {
        skip: { type: "integer", minimum: 0 },
        take: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  };

  // --- ROUTES ---

  server.post<{ Body: CreateSubmissionBody }>(
    "/submissions",
    { schema: createSubmissionSchema },
    async (request, reply) => {
      try {
        const { jurisdictionCode, ...submissionData } = request.body;
        const newSubmission = await submissionService.createForUser(
          submissionData as RuleContext,
          jurisdictionCode,
          request.user,
        );
        metrics.incrementSubmissions();
        return reply.code(201).send({
          id: newSubmission.id,
          completenessScore: newSubmission.completenessScore,
          jurisdictionId: newSubmission.jurisdictionId,
          state: newSubmission.state,
        });
      } catch (error: any) {
        if (reply.sent) return;
        if (
          error.message &&
          error.message.includes("Invalid Jurisdiction Code")
        ) {
          return reply.code(400).send({ error: error.message });
        }
        server.log.error(error, "Failed to create submission");
        reply.code(500).send({ error: "Internal Server Error" });
      }
    },
  );

  // --- THE PADT "TRANSITION" ENDPOINT (UPDATED) ---
  server.post(
    "/submissions/:id/transition",
    { schema: transitionSubmissionSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { targetState } = request.body as { targetState: SubmissionState };

      try {
        // --- RESEARCH INSTRUMENTATION CHANGE ---
        // We NO LONGER check "canTransition" here.
        // We ask the Service -> Engine to do it.
        // The Engine will log the failure and throw an error if invalid.

        const updatedSubmission = await submissionService.transitionState(
          id,
          targetState,
          request.user,
        );

        // If we get here, it succeeded!
        metrics.recordStateTransition(updatedSubmission.state, targetState); // Note: updatedSubmission.state is the NEW state
        return reply.send(updatedSubmission);
      } catch (error: any) {
        // If the Engine blocked it (Process Twin logic), it throws an error.
        // We catch it here and return 400.
        server.log.warn(`Transition blocked: ${error.message}`);

        return reply.code(400).send({
          error: "INVALID_TRANSITION",
          message: error.message,
        });
      }
    },
  );

  server.post(
    "/submissions/:id/generate-packet",
    { schema: packetGenerationSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const { jobId } = await submissionService.generatePacketForSubmission(
          id,
          request.user,
        );
        return reply.send({
          message: `Packet generation queued. Job ID: ${jobId}`,
        });
      } catch (error: any) {
        if (
          error.message.includes("Cannot generate packet") ||
          error.message.includes("Invalid State")
        ) {
          return reply
            .code(400)
            .send({ error: "Invalid State", message: error.message });
        }
        if (error.message.includes("Packet already exists")) {
          return reply
            .code(409)
            .send({ error: "Conflict", message: error.message });
        }
        server.log.error(error);
        return reply.code(500).send({ error: "Internal Server Error" });
      }
    },
  );

  server.get(
    "/submissions/:id",
    { schema: getSubmissionSchema },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const submission = await submissionService.findOneForUser(
        id,
        request.user,
      );
      if (!submission)
        return reply.code(404).send({ error: "Submission not found" });
      reply.send(submission);
    },
  );

  server.get(
    "/submissions",
    { schema: getAllSubmissionsSchema },
    async (request, reply) => {
      try {
        const submissions = await submissionService.findAllForUser(
          request.user,
        );
        reply.send(submissions);
      } catch (error) {
        server.log.error(error);
        reply.code(500).send({ error: "Internal Server Error" });
      }
    },
  );

  server.patch<{ Params: { id: string }; Body: Partial<RuleContext> }>(
    "/submissions/:id",
    { schema: updateSubmissionSchema },
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;
      if (!updates || Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "No update data provided" });
      }
      try {
        const updated = await submissionService.updateSubmission(
          id,
          updates,
          request.user,
        );
        return reply.send(updated);
      } catch (error: any) {
        if (error.message === "Only DRAFT submissions can be edited.") {
          return reply.code(400).send({ error: error.message });
        }
        server.log.error(error);
        return reply.code(500).send({ error: "Internal Server Error" });
      }
    },
  );
}
