import { PrismaClient, RuleSeverity } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // 1. CLEANUP: Wipe all data to start fresh
  // Delete children first to respect Foreign Keys
  await prisma.packet.deleteMany({});
  await prisma.workflowEvent.deleteMany({});
  await prisma.ruleResult.deleteMany({});
  await prisma.permitSubmission.deleteMany({});

  await prisma.rule.deleteMany({});
  await prisma.ruleSet.deleteMany({});
  await prisma.jurisdiction.deleteMany({});

  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  console.log("🧹 Database cleared.");

  // 2. CREATE TENANT: A default organization and user for testing
  const hashedPassword = await bcrypt.hash("password123", 10);

  const demoOrg = await prisma.organization.create({
    data: {
      name: "City Builders Inc.",
      users: {
        create: {
          email: "admin@citybuilders.com",
          password: hashedPassword,
          role: "ADMIN",
        },
      },
    },
    include: { users: true },
  });

  console.log(`🏢 Created Org: ${demoOrg.name}`);
  console.log(`👤 Created User: admin@citybuilders.com / password123`);

  // 3. CREATE JURISDICTION: Austin, TX (Residential Focus)
  const austin = await prisma.jurisdiction.create({
    data: {
      name: "Austin, TX",
      code: "ATX", // Critical for lookups
    },
  });

  const atxRuleSet = await prisma.ruleSet.create({
    data: {
      version: 1,
      jurisdictionId: austin.id,
      effectiveDate: new Date("2024-01-01"),
    },
  });

  await prisma.rule.createMany({
    data: [
      {
        ruleSetId: atxRuleSet.id,
        key: "ATX_IMPERVIOUS_COVER",
        severity: RuleSeverity.REQUIRED,
        description:
          "Impervious cover must not exceed 45% of the total lot area (LDC 25-2-492).",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "ATX_HERITAGE_TREE",
        severity: RuleSeverity.REQUIRED,
        description:
          "Removal of Heritage Trees (19 inches+ diameter) requires a separate forestry permit.",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "ATX_HEIGHT_RESIDENTIAL",
        severity: RuleSeverity.REQUIRED,
        description:
          "Building height must not exceed 35 feet in SF-3 zoning districts.",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "ATX_VISITABILITY",
        severity: RuleSeverity.WARNING,
        description:
          "New single-family construction must comply with Visitability Ordinance (no-step entrance, wide doors).",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "ARCHITECTURAL_PLANS_SUBMITTED",
        severity: RuleSeverity.REQUIRED,
        description: "Architectural plans must be uploaded.",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "STRUCTURAL_CALCS_INCLUDED",
        severity: RuleSeverity.REQUIRED,
        description: "Structural calculations must be included.",
      },
    ],
  });
  console.log(`🤠 Created Jurisdiction: Austin (ATX) with rules.`);

  // 4. CREATE JURISDICTION: New York, NY (High-Density/Safety Focus)
  const nyc = await prisma.jurisdiction.create({
    data: {
      name: "New York, NY",
      code: "NYC",
    },
  });

  const nycRuleSet = await prisma.ruleSet.create({
    data: {
      version: 1,
      jurisdictionId: nyc.id,
      effectiveDate: new Date("2022-11-07"), // Example effective date
    },
  });

  await prisma.rule.createMany({
    data: [
      {
        ruleSetId: nycRuleSet.id,
        key: "NYC_ZONING_USE",
        severity: RuleSeverity.REQUIRED,
        description:
          "Proposed use must be permitted in the underlying Zoning District (e.g., Residential in R-Zone).",
      },
      {
        ruleSetId: nycRuleSet.id,
        key: "NYC_FIRE_STANDPIPE",
        severity: RuleSeverity.REQUIRED,
        description:
          "Standpipe system required for buildings exceeding 75 feet in height (BC 905).",
      },
      {
        ruleSetId: nycRuleSet.id,
        key: "NYC_ENERGY_CODE",
        severity: RuleSeverity.REQUIRED,
        description:
          "Must demonstrate compliance with the 2020 NYC Energy Conservation Code (NYCECC).",
      },
      {
        ruleSetId: nycRuleSet.id,
        key: "NYC_ASBESTOS_FORM",
        severity: RuleSeverity.WARNING,
        description:
          "ACP-5 form (Asbestos) must be filed with DEP prior to any demolition work.",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "ARCHITECTURAL_PLANS_SUBMITTED",
        severity: RuleSeverity.REQUIRED,
        description: "Architectural plans must be uploaded.",
      },
      {
        ruleSetId: atxRuleSet.id,
        key: "STRUCTURAL_CALCS_INCLUDED",
        severity: RuleSeverity.REQUIRED,
        description: "Structural calculations must be included.",
      },
    ],
  });
  console.log(`🍎 Created Jurisdiction: New York (NYC) with rules.`);

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
