import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
// Import the actual engine for Guardrail checks
import { evaluateRules } from "../core/rules/evaluateRules";
import { RuleContext } from "../core/rules/types";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

const JURISDICTION_CODE = "AIED_2026_RESEARCH";
const EXAM_ORG_NAME = "AIED Research Lab";

async function main() {
  const caseType = (process.argv[2] || "").toUpperCase();
  if (!["A", "B", "C"].includes(caseType)) {
    console.error("❌ Usage: npx ts-node src/scripts/seed_exam.ts <A|B|C>");
    process.exit(1);
  }

  console.log(`\n🧪 GENERATING EXAM CONTEXT: CASE [${caseType}]...`);

  // 1. Setup Infrastructure (Idempotent)
  let org = await prisma.organization.findFirst({
    where: { name: EXAM_ORG_NAME },
  });
  if (!org) {
    org = await prisma.organization.create({ data: { name: EXAM_ORG_NAME } });
  }

  const email = `actor_${caseType}_${Date.now()}@research.aied`;
  const user = await prisma.user.create({
    data: { email, password: "hash", organizationId: org.id, role: "MEMBER" },
  });

  const jurisdiction = await prisma.jurisdiction.upsert({
    where: { code: JURISDICTION_CODE },
    update: {},
    create: { name: "AIED Virtual City", code: JURISDICTION_CODE },
  });

  // 2. Ensure Rules Exist (Same as before)
  const existingRules = await prisma.ruleSet.findFirst({
    where: { jurisdictionId: jurisdiction.id },
  });

  if (!existingRules) {
    const ruleSet = await prisma.ruleSet.create({
      data: { jurisdictionId: jurisdiction.id, version: 1 },
    });

    await prisma.rule.createMany({
      data: [
        {
          ruleSetId: ruleSet.id,
          key: "ATX_IMPERVIOUS_COVER",
          severity: "REQUIRED",
          description: "Impervious cover <= 45%",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ARCHITECTURAL_PLANS_SUBMITTED",
          severity: "REQUIRED",
          description: "Plans required",
        },
        {
          ruleSetId: ruleSet.id,
          key: "STRUCTURAL_CALCS_INCLUDED",
          severity: "REQUIRED",
          description: "Calcs required",
        },
      ],
    });
    console.log("   ✅ Seeded Ruleset");
  }

  // 3. Construct Payload
  let submissionPayload: RuleContext = {
    projectName: `Sim Run ${Date.now()} [Case ${caseType}]`,
    jurisdictionId: jurisdiction.id,
    lotArea: 10000,
    imperviousArea: 4000, // Default 40% (Pass)
    hasArchitecturalPlans: true,
    hasStructuralCalcs: true,
    buildingHeight: 20,
    setbackFront: 30,
    setbackSide: 10,
    setbackRear: 20,
    fireEgressCount: 2,
  };

  // Inject Traps
  if (caseType === "B") {
    submissionPayload.hasArchitecturalPlans = false; // Constraint Trap
  } else if (caseType === "C") {
    submissionPayload.imperviousArea = 6000; // Numeric Trap (60%)
  }

  // --- GUARDRAIL 1: PRE-FLIGHT CHECK ---
  console.log("   🛡️  Running Pre-Flight Guardrail Check...");

  const results = await evaluateRules(submissionPayload, jurisdiction.id);
  const failures = results.filter(
    (r) => !r.passed && r.severity === "REQUIRED",
  );

  console.log(`      Found ${failures.length} failures.`);

  // Assertions
  if (caseType === "A") {
    if (failures.length !== 0)
      throw new Error(
        `Case A must have 0 failures. Found: ${failures.map((f) => f.ruleKey).join(", ")}`,
      );
  } else if (caseType === "B") {
    if (failures.length !== 1)
      throw new Error(
        `Case B must have exactly 1 failure. Found: ${failures.length}`,
      );
    if (failures[0]!.ruleKey !== "ARCHITECTURAL_PLANS_SUBMITTED")
      throw new Error(`Case B failing wrong rule: ${failures[0]!.ruleKey}`);
  } else if (caseType === "C") {
    if (failures.length !== 1)
      throw new Error(
        `Case C must have exactly 1 failure. Found: ${failures.length}`,
      );
    if (failures[0]!.ruleKey !== "ATX_IMPERVIOUS_COVER")
      throw new Error(`Case C failing wrong rule: ${failures[0]!.ruleKey}`);
  }
  console.log("   ✅ Guardrails Passed.");

  // --- CALCULATE SCORE ---
  // If no failures, score is 1.0. If failures, score is 0.0 (simplification for research)
  const initialScore = failures.length === 0 ? 1.0 : 0.0;

  // 4. Save to DB
  const submission = await prisma.permitSubmission.create({
    data: {
      projectName: submissionPayload.projectName,
      organizationId: org.id,
      jurisdictionId: jurisdiction.id,
      state: "DRAFT",
      completenessScore: initialScore, // <--- NOW CORRECTLY SEEDED
      submissionDetails: {
        ...submissionPayload,
        research_metadata: {
          case_id: caseType,
          experiment: "AIED_2026_PHASE_2",
        },
      },
    },
  });

  // 5. Token & Output
  const token = jwt.sign(
    { id: user.id, role: user.role, organizationId: org.id },
    JWT_SECRET,
    { expiresIn: "1d" },
  );

  console.log(`\n✅ EXAM READY: ${submission.id} (Score: ${initialScore})`);

  console.log("\n--- JSON OUTPUT START ---");
  console.log(
    JSON.stringify({
      submissionId: submission.id,
      userId: user.id,
      token: token,
      caseType: caseType,
      jurisdictionId: jurisdiction.id,
      initialScore: initialScore,
    }),
  );
  console.log("--- JSON OUTPUT END ---");
}

main()
  .catch((e) => {
    console.error(`\n⛔ CRITICAL SEEDING ERROR: ${e.message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
