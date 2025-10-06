import { PrismaClient, RuleSeverity } from "@prisma/client";

// Initialize the Prisma Client
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // --- Start with a clean slate ---
  // The order of deletion is important to avoid foreign key constraint errors.
  await prisma.ruleResult.deleteMany({});
  await prisma.permitSubmission.deleteMany({});
  await prisma.rule.deleteMany({});
  await prisma.ruleSet.deleteMany({});
  await prisma.jurisdiction.deleteMany({});
  console.log("Cleared existing data.");

  // --- Create Jurisdiction ---
  const jerseyCity = await prisma.jurisdiction.create({
    data: {
      name: "Jersey City",
    },
  });
  console.log(
    `Created jurisdiction: ${jerseyCity.name} (ID: ${jerseyCity.id})`
  );

  // --- Create RuleSet for the Jurisdiction ---
  const v1RuleSet = await prisma.ruleSet.create({
    data: {
      version: 1,
      jurisdictionId: jerseyCity.id, // Link to the jurisdiction we just created
    },
  });
  console.log(
    `Created RuleSet version ${v1RuleSet.version} for ${jerseyCity.name}`
  );

  // --- Create More Realistic Rules for the RuleSet ---
  // Using createMany for efficiency to insert all rules in a single database query.
  const rulesToCreate = [
    {
      ruleSetId: v1RuleSet.id,
      key: "ARCHITECTURAL_PLANS_SUBMITTED",
      severity: RuleSeverity.REQUIRED,
      description:
        "A full set of architectural plans must be attached to the submission.",
    },
    {
      ruleSetId: v1RuleSet.id,
      key: "STRUCTURAL_CALCS_INCLUDED",
      severity: RuleSeverity.REQUIRED,
      description:
        "Structural engineering calculations must be provided for all load-bearing elements.",
    },
    {
      ruleSetId: v1RuleSet.id,
      key: "SETBACK_REQUIREMENT_MET",
      severity: RuleSeverity.REQUIRED,
      description:
        "Building must respect the front, side, and rear setback distances from property lines as per zoning laws.",
    },
    {
      ruleSetId: v1RuleSet.id,
      key: "BUILDING_HEIGHT_LIMIT",
      severity: RuleSeverity.REQUIRED,
      description:
        "Proposed building height must not exceed the maximum limit for the designated zone.",
    },
    {
      ruleSetId: v1RuleSet.id,
      key: "FIRE_SAFETY_EGRESS_COMPLIANT",
      severity: RuleSeverity.REQUIRED,
      description:
        "The design must include at least two means of egress as per fire safety code.",
    },
    {
      ruleSetId: v1RuleSet.id,
      key: "PLUMBING_FIXTURE_COUNT_SUBMITTED",
      severity: RuleSeverity.WARNING,
      description:
        "A detailed count of all plumbing fixtures (sinks, toilets, etc.) should be provided for impact fee assessment.",
    },
  ];

  await prisma.rule.createMany({
    data: rulesToCreate,
  });
  console.log(
    `Created ${rulesToCreate.length} rules for RuleSet v${v1RuleSet.version}.`
  );

  console.log("✅ Seeding complete.");
}

// Execute the main function and handle potential errors
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Close the database connection
    await prisma.$disconnect();
  });
