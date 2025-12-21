import { evaluateRules } from "./evaluateRules";
import { RuleContext } from "./types";
import { PrismaClient, RuleSeverity } from "@prisma/client";

const prisma = new PrismaClient();

describe("evaluateRules Engine (Integration)", () => {
  let jurisdictionId: string;

  beforeAll(async () => {
    // 1. Setup a real Jurisdiction
    const jurisdiction = await prisma.jurisdiction.create({
      data: { name: "Test City", code: "TST" },
    });
    jurisdictionId = jurisdiction.id;

    // 2. Setup the RuleSet
    const ruleSet = await prisma.ruleSet.create({
      data: {
        version: 1,
        jurisdictionId: jurisdiction.id,
        effectiveDate: new Date(),
      },
    });

    // 3. Seed ALL the rules we plan to test below
    // We must ensure the keys here match keys in ruleImplementations.ts
    await prisma.rule.createMany({
      data: [
        {
          ruleSetId: ruleSet.id,
          key: "ATX_IMPERVIOUS_COVER",
          severity: RuleSeverity.REQUIRED,
          description: "Impervious cover check",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ATX_HEIGHT_RESIDENTIAL", // Using the specific ATX key
          severity: RuleSeverity.REQUIRED,
          description: "Height check",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ARCHITECTURAL_PLANS_SUBMITTED",
          severity: RuleSeverity.REQUIRED,
          description: "Plans check",
        },
      ],
    });
  });

  afterAll(async () => {
    // Cleanup

    // 1. Delete child records first (those with foreign keys)
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({});
    await prisma.ruleResult.deleteMany({});

    // 2. Then delete PermitSubmission (references Jurisdiction)
    await prisma.permitSubmission.deleteMany({});

    // 3. Then delete RuleSet & Rule (references Jurisdiction & RuleSet)
    await prisma.rule.deleteMany({});
    await prisma.ruleSet.deleteMany({});

    // 4. Finally delete parent records
    await prisma.jurisdiction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});

    await prisma.$disconnect();
  });

  // --- TEST 1: Impervious Cover (Passing) ---
  it("should correctly evaluate the IMPERVIOUS_COVER rule (Pass)", async () => {
    const context: RuleContext = {
      projectName: "Test",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 10,
      setbackFront: 10,
      setbackSide: 10,
      setbackRear: 10,
      fireEgressCount: 2,
      // Domain data:
      lotArea: 1000,
      imperviousArea: 400, // 40% -> Should Pass (< 45%)
    };

    const results = await evaluateRules(context, jurisdictionId);

    // We expect to find results for all 3 seeded rules
    const imperviousResult = results.find(
      (r) => r.ruleKey === "ATX_IMPERVIOUS_COVER"
    );
    expect(imperviousResult?.passed).toBe(true);
  });

  // --- TEST 2: Impervious Cover (Failing) ---
  it("should fail if impervious cover is too high", async () => {
    const context: RuleContext = {
      projectName: "Test",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 10,
      setbackFront: 10,
      setbackSide: 10,
      setbackRear: 10,
      fireEgressCount: 2,
      // Domain data:
      lotArea: 1000,
      imperviousArea: 500, // 50% -> Should Fail (> 45%)
    };

    const results = await evaluateRules(context, jurisdictionId);

    const imperviousResult = results.find(
      (r) => r.ruleKey === "ATX_IMPERVIOUS_COVER"
    );
    expect(imperviousResult?.passed).toBe(false);
    expect(imperviousResult?.message).toContain("exceeds");
  });

  // --- TEST 3: Height Limit (Using ATX Rule) ---
  it("should fail if building is too tall", async () => {
    const context: RuleContext = {
      projectName: "Too Tall Tower",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 45, // Exceeds 35ft limit for ATX_HEIGHT_RESIDENTIAL
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 3,
    };

    const results = await evaluateRules(context, jurisdictionId);

    const heightResult = results.find(
      (r) => r.ruleKey === "ATX_HEIGHT_RESIDENTIAL"
    );
    expect(heightResult?.passed).toBe(false);
    expect(heightResult?.message).toContain("exceeds");
  });

  // --- TEST 4: Missing Plans ---
  it("should fail if architectural plans are missing", async () => {
    const context: RuleContext = {
      projectName: "No Plans",
      hasArchitecturalPlans: false, // <-- Fail
      hasStructuralCalcs: true,
      buildingHeight: 20,
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 3,
    };

    const results = await evaluateRules(context, jurisdictionId);

    const planResult = results.find(
      (r) => r.ruleKey === "ARCHITECTURAL_PLANS_SUBMITTED"
    );
    expect(planResult?.passed).toBe(false);
  });
});
