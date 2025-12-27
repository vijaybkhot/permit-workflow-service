import {
  PrismaClient,
  RuleSeverity,
  RuleSeverity as Severity,
} from "@prisma/client";
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

  // 5. SEED COMPREHENSIVE SUBMISSIONS FOR TESTING
  console.log("\n📋 Seeding submissions...");

  const adminUser = demoOrg.users[0];

  // Austin submissions with various states
  const atxSubmissions = [];

  // Draft submission
  const draftSubmission = await prisma.permitSubmission.create({
    data: {
      projectName: "Downtown Lofts Renovation",
      submissionDetails: {
        description: "Converting historic warehouse into residential lofts",
      },
      jurisdictionId: austin.id,
      organizationId: demoOrg.id,
      state: "DRAFT",
    },
  });
  atxSubmissions.push(draftSubmission);

  // Validated submission
  const validatedSubmission = await prisma.permitSubmission.create({
    data: {
      projectName: "East Austin Single-Family Home",
      submissionDetails: {
        description: "New residential construction in SF-3 zone",
      },
      jurisdictionId: austin.id,
      organizationId: demoOrg.id,
      state: "VALIDATED",
    },
  });
  atxSubmissions.push(validatedSubmission);

  // Add rule results for validated submission
  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: validatedSubmission.id,
        ruleKey: "ATX_HEIGHT_RESIDENTIAL",
        passed: true,
        message: "Building height: 32 feet (within 35-foot limit)",
        severity: "REQUIRED",
      },
      {
        submissionId: validatedSubmission.id,
        ruleKey: "ARCHITECTURAL_PLANS_SUBMITTED",
        passed: true,
        message: "Plans reviewed and approved",
        severity: "REQUIRED",
      },
      {
        submissionId: validatedSubmission.id,
        ruleKey: "STRUCTURAL_CALCS_INCLUDED",
        passed: true,
        message: "Structural engineer stamp verified",
        severity: "REQUIRED",
      },
    ],
  });

  // Add workflow events for validated submission
  await prisma.workflowEvent.create({
    data: {
      submissionId: validatedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "DRAFT",
      toState: "VALIDATED",
    },
  });

  // Packet-ready submission
  const packetReadySubmission = await prisma.permitSubmission.create({
    data: {
      projectName: "South Congress Commercial Development",
      submissionDetails: {
        description: "Mixed-use development with retail and office",
      },
      jurisdictionId: austin.id,
      organizationId: demoOrg.id,
      state: "PACKET_READY",
    },
  });
  atxSubmissions.push(packetReadySubmission);

  // Add rule results
  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: packetReadySubmission.id,
        ruleKey: "ATX_IMPERVIOUS_COVER",
        passed: true,
        message: "Impervious cover: 42% (within 45% limit)",
        severity: "REQUIRED",
      },
      {
        submissionId: packetReadySubmission.id,
        ruleKey: "ARCHITECTURAL_PLANS_SUBMITTED",
        passed: true,
        message: "3D renderings and floor plans submitted",
        severity: "REQUIRED",
      },
    ],
  });

  // Add workflow events
  await prisma.workflowEvent.create({
    data: {
      submissionId: packetReadySubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "DRAFT",
      toState: "VALIDATED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: packetReadySubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "VALIDATED",
      toState: "PACKET_READY",
    },
  });

  // Create a packet for this submission
  await prisma.packet.create({
    data: {
      submissionId: packetReadySubmission.id,
      filePath: "/storage/packets/south-congress-dev.pdf",
      sizeBytes: 2500000,
    },
  });

  // Submitted submission
  const submittedSubmission = await prisma.permitSubmission.create({
    data: {
      projectName: "Mueller Neighborhood Expansion",
      submissionDetails: {
        description: "New residential community with 250 units",
      },
      jurisdictionId: austin.id,
      organizationId: demoOrg.id,
      state: "SUBMITTED",
    },
  });
  atxSubmissions.push(submittedSubmission);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: submittedSubmission.id,
        ruleKey: "ATX_IMPERVIOUS_COVER",
        passed: true,
        message: "Impervious cover: 38%",
        severity: "REQUIRED",
      },
      {
        submissionId: submittedSubmission.id,
        ruleKey: "ATX_HERITAGE_TREE",
        passed: false,
        message:
          "3 heritage trees flagged for removal - forestry permit required",
        severity: "WARNING",
      },
      {
        submissionId: submittedSubmission.id,
        ruleKey: "ATX_VISITABILITY",
        passed: true,
        message: "All units meet visitability standards",
        severity: "WARNING",
      },
    ],
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: submittedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "DRAFT",
      toState: "VALIDATED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: submittedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "VALIDATED",
      toState: "PACKET_READY",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: submittedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "PACKET_READY",
      toState: "SUBMITTED",
    },
  });

  await prisma.packet.create({
    data: {
      submissionId: submittedSubmission.id,
      filePath: "/storage/packets/mueller-neighborhood.pdf",
      sizeBytes: 4200000,
    },
  });

  // Approved submission
  const approvedSubmission = await prisma.permitSubmission.create({
    data: {
      projectName: "Tech Hub Campus",
      submissionDetails: {
        description: "New tech office park with 4 buildings",
      },
      jurisdictionId: austin.id,
      organizationId: demoOrg.id,
      state: "APPROVED",
    },
  });
  atxSubmissions.push(approvedSubmission);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: approvedSubmission.id,
        ruleKey: "ATX_IMPERVIOUS_COVER",
        passed: true,
        message: "Impervious cover: 40%",
        severity: "REQUIRED",
      },
      {
        submissionId: approvedSubmission.id,
        ruleKey: "ARCHITECTURAL_PLANS_SUBMITTED",
        passed: true,
        message: "All architectural documents approved",
        severity: "REQUIRED",
      },
      {
        submissionId: approvedSubmission.id,
        ruleKey: "STRUCTURAL_CALCS_INCLUDED",
        passed: true,
        message: "Engineering review complete",
        severity: "REQUIRED",
      },
    ],
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: approvedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "DRAFT",
      toState: "VALIDATED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: approvedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "VALIDATED",
      toState: "PACKET_READY",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: approvedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "PACKET_READY",
      toState: "SUBMITTED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: approvedSubmission.id,
      eventType: "STATE_TRANSITION",
      fromState: "SUBMITTED",
      toState: "APPROVED",
    },
  });

  await prisma.packet.create({
    data: {
      submissionId: approvedSubmission.id,
      filePath: "/storage/packets/tech-hub-campus.pdf",
      sizeBytes: 3800000,
    },
  });

  console.log(`🤠 Austin: Created ${atxSubmissions.length} submissions`);

  // NYC submissions with various states
  const nycSubmissions = [];

  // NYC - Draft
  const nycDraft = await prisma.permitSubmission.create({
    data: {
      projectName: "Greenwich Village Renovation",
      submissionDetails: {
        description: "Historic brownstone restoration",
      },
      jurisdictionId: nyc.id,
      organizationId: demoOrg.id,
      state: "DRAFT",
    },
  });
  nycSubmissions.push(nycDraft);

  // NYC - Validated
  const nycValidated = await prisma.permitSubmission.create({
    data: {
      projectName: "Midtown Office Tower",
      submissionDetails: {
        description: "New 45-story office building",
      },
      jurisdictionId: nyc.id,
      organizationId: demoOrg.id,
      state: "VALIDATED",
    },
  });
  nycSubmissions.push(nycValidated);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: nycValidated.id,
        ruleKey: "NYC_ZONING_USE",
        passed: true,
        message: "Commercial use permitted in C6-4 district",
        severity: "REQUIRED",
      },
      {
        submissionId: nycValidated.id,
        ruleKey: "NYC_FIRE_STANDPIPE",
        passed: true,
        message: "Building height 480 feet - standpipe system included",
        severity: "REQUIRED",
      },
      {
        submissionId: nycValidated.id,
        ruleKey: "NYC_ENERGY_CODE",
        passed: true,
        message: "NYCECC 2020 compliance verified",
        severity: "REQUIRED",
      },
    ],
  });

  // NYC - Packet Ready
  const nycPacketReady = await prisma.permitSubmission.create({
    data: {
      projectName: "Brooklyn Waterfront Development",
      submissionDetails: {
        description: "Mixed-use development with 500 residential units",
      },
      jurisdictionId: nyc.id,
      organizationId: demoOrg.id,
      state: "PACKET_READY",
    },
  });
  nycSubmissions.push(nycPacketReady);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: nycPacketReady.id,
        ruleKey: "NYC_ZONING_USE",
        passed: true,
        message: "Mixed-use permitted in R10A district",
        severity: "REQUIRED",
      },
      {
        submissionId: nycPacketReady.id,
        ruleKey: "NYC_ASBESTOS_FORM",
        passed: true,
        message: "ACP-5 form filed with DEP",
        severity: "WARNING",
      },
    ],
  });

  await prisma.packet.create({
    data: {
      submissionId: nycPacketReady.id,
      filePath: "/storage/packets/brooklyn-waterfront-dev.pdf",
      sizeBytes: 5100000,
    },
  });

  // NYC - Submitted
  const nycSubmitted = await prisma.permitSubmission.create({
    data: {
      projectName: "Upper West Side Residential",
      submissionDetails: {
        description: "Luxury residential condominium with 120 units",
      },
      jurisdictionId: nyc.id,
      organizationId: demoOrg.id,
      state: "SUBMITTED",
    },
  });
  nycSubmissions.push(nycSubmitted);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: nycSubmitted.id,
        ruleKey: "NYC_ZONING_USE",
        passed: true,
        message: "Residential use permitted in R10 zone",
        severity: "REQUIRED",
      },
      {
        submissionId: nycSubmitted.id,
        ruleKey: "NYC_ENERGY_CODE",
        passed: true,
        message: "Energy Star rated HVAC system",
        severity: "REQUIRED",
      },
    ],
  });

  await prisma.packet.create({
    data: {
      submissionId: nycSubmitted.id,
      filePath: "/storage/packets/uws-residential.pdf",
      sizeBytes: 2800000,
    },
  });

  // NYC - Approved
  const nycApproved = await prisma.permitSubmission.create({
    data: {
      projectName: "Hudson Yards Phase 2",
      submissionDetails: {
        description: "Commercial office and retail complex",
      },
      jurisdictionId: nyc.id,
      organizationId: demoOrg.id,
      state: "APPROVED",
    },
  });
  nycSubmissions.push(nycApproved);

  await prisma.ruleResult.createMany({
    data: [
      {
        submissionId: nycApproved.id,
        ruleKey: "NYC_ZONING_USE",
        passed: true,
        message: "Commercial use permitted in C6-6M district",
        severity: "REQUIRED",
      },
      {
        submissionId: nycApproved.id,
        ruleKey: "NYC_FIRE_STANDPIPE",
        passed: true,
        message: "560-foot tower with integrated standpipe",
        severity: "REQUIRED",
      },
      {
        submissionId: nycApproved.id,
        ruleKey: "NYC_ENERGY_CODE",
        passed: true,
        message: "LEED Gold certification target",
        severity: "REQUIRED",
      },
      {
        submissionId: nycApproved.id,
        ruleKey: "NYC_ASBESTOS_FORM",
        passed: true,
        message: "Pre-construction asbestos survey complete",
        severity: "WARNING",
      },
    ],
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: nycApproved.id,
      eventType: "STATE_TRANSITION",
      fromState: "DRAFT",
      toState: "VALIDATED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: nycApproved.id,
      eventType: "STATE_TRANSITION",
      fromState: "VALIDATED",
      toState: "PACKET_READY",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: nycApproved.id,
      eventType: "STATE_TRANSITION",
      fromState: "PACKET_READY",
      toState: "SUBMITTED",
    },
  });

  await prisma.workflowEvent.create({
    data: {
      submissionId: nycApproved.id,
      eventType: "STATE_TRANSITION",
      fromState: "SUBMITTED",
      toState: "APPROVED",
    },
  });

  await prisma.packet.create({
    data: {
      submissionId: nycApproved.id,
      filePath: "/storage/packets/hudson-yards-phase2.pdf",
      sizeBytes: 6200000,
    },
  });

  console.log(`🍎 NYC: Created ${nycSubmissions.length} submissions`);
  console.log(
    `\n✅ Seeding complete: ${
      atxSubmissions.length + nycSubmissions.length
    } total submissions created`
  );
  console.log(
    "📊 Ready for testing with Jaeger (tracing) and Prometheus (metrics)"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
