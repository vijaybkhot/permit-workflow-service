import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import { evaluateRules } from "../../core/rules/evaluateRules";
import { RuleContext } from "../../core/rules/types";

const prisma = new PrismaClient();

// Define the shape of the incoming request body
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
  // Define the JSON schema for request body validation
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

  server.post<{ Body: CreateSubmissionBody }>(
    "/submissions",
    { schema: createSubmissionSchema },
    async (request, reply) => {
      try {
        const submissionData = request.body;

        // 1. Call our core rule engine
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
              // We'll add state logic in a later ticket
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
}
