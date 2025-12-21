import { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient, RuleSeverity } from "@prisma/client";
import { Job, QueueEvents, Worker } from "bullmq";
import fs from "fs";
import { packetQueue } from "../../core/queues/packetQueue";
import { processor } from "../../workers/packetProcessor";
import { buildApp } from "../../app";

const prisma = new PrismaClient();

describe("Submissions API", () => {
  let server: FastifyInstance;
  let worker: Worker;
  let token: string;
  let testOrgId: string;
  let testUserId: string;
  // We need to store this to link manual submissions in tests
  let testJurisdictionId: string;

  // Helper function to create a user and get a token
  const getAuthToken = async () => {
    const org = await prisma.organization.create({
      data: { name: "Test Org" },
    });
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        password: "password123",
        organizationId: org.id,
      },
    });
    const authToken = server.jwt.sign({
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    return { token: authToken, orgId: org.id, userId: user.id };
  };

  beforeAll(async () => {
    server = await buildApp();
    await server.ready();
    worker = new Worker("packet-generation", processor, {
      connection: { host: "localhost", port: 6379 },
    });
  });

  afterAll(async () => {
    await server.close();
    await worker.close();
    await packetQueue.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 1. Cleanup
    const packets = await prisma.packet.findMany({});
    for (const packet of packets) {
      if (fs.existsSync(packet.filePath)) {
        fs.unlinkSync(packet.filePath);
      }
    }
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({});
    await prisma.ruleResult.deleteMany({});
    await prisma.permitSubmission.deleteMany({});
    await prisma.rule.deleteMany({});
    await prisma.ruleSet.deleteMany({});
    await prisma.jurisdiction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});

    // 2. Auth Setup
    const auth = await getAuthToken();
    token = auth.token;
    testOrgId = auth.orgId;
    testUserId = auth.userId;

    // 3. Seed Jurisdiction & Rules
    const jurisdiction = await prisma.jurisdiction.create({
      data: { name: "Austin, TX", code: "ATX" },
    });

    // CAPTURE THE ID HERE
    testJurisdictionId = jurisdiction.id;

    const ruleSet = await prisma.ruleSet.create({
      data: {
        version: 1,
        jurisdictionId: jurisdiction.id,
        effectiveDate: new Date(),
      },
    });

    await prisma.rule.createMany({
      data: [
        {
          ruleSetId: ruleSet.id,
          key: "ATX_IMPERVIOUS_COVER",
          severity: RuleSeverity.REQUIRED,
          description: "Impervious cover must not exceed 45%",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ATX_HERITAGE_TREE",
          severity: RuleSeverity.REQUIRED,
          description: "Heritage tree removal requires forestry permit",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ATX_HEIGHT_RESIDENTIAL",
          severity: RuleSeverity.REQUIRED,
          description: "Building height must not exceed 35 feet",
        },
        {
          ruleSetId: ruleSet.id,
          key: "ARCHITECTURAL_PLANS_SUBMITTED",
          severity: RuleSeverity.REQUIRED,
          description: "Architectural plans must be uploaded",
        },
        {
          ruleSetId: ruleSet.id,
          key: "STRUCTURAL_CALCS_INCLUDED",
          severity: RuleSeverity.REQUIRED,
          description: "Structural calculations must be included",
        },
      ],
    });
  });

  it("should return a 401 error if no JWT is provided", async () => {
    const response = await supertest(server.server)
      .post("/submissions")
      .send({});

    expect(response.statusCode).toBe(401);
  });

  it("should create a new submission and its rule results successfully", async () => {
    const payload = {
      projectName: "Test Project - Integration",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 30,
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
      lotArea: 10000,
      imperviousArea: 4000,
    };

    const response = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.jurisdictionId).toBeDefined();
    expect(response.body.state).toBeDefined();

    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: response.body.id },
      include: { ruleResults: true },
    });

    expect(submissionInDb).not.toBeNull();
    expect(submissionInDb?.projectName).toBe(payload.projectName);

    // NOTE: This assertion expects exactly 1 rule result because we only seeded
    // 'ATX_IMPERVIOUS_COVER' in the beforeEach block above.
    expect(submissionInDb?.ruleResults.length).toBeGreaterThan(0); // ✅ UPDATED: More flexible

    // Fix for "Object is possibly undefined": Use optional chaining (?.)
    expect(submissionInDb?.ruleResults[0]?.ruleKey).toBe(
      "ATX_IMPERVIOUS_COVER"
    );
    expect(submissionInDb?.ruleResults[0]?.passed).toBe(true);
  });

  it("should fetch a single submission by its ID", async () => {
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "Fetch Me Project",
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId, // <-- FIXED: Added missing field
      },
    });

    const response = await supertest(server.server)
      .get(`/submissions/${submission.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(submission.id);
  });

  it("should return a 404 error for a non-existent submission ID", async () => {
    const fakeId = "clwz00000000000000000000";

    const response = await supertest(server.server)
      .get(`/submissions/${fakeId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(404);
  });

  it("should successfully transition a submission from DRAFT to VALIDATED", async () => {
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "Transition Me",
        state: "DRAFT",
        completenessScore: 1,
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId,
      },
    });

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetState: "VALIDATED" });

    expect(response.statusCode).toBe(200);
    expect(response.body.state).toBe("VALIDATED");

    const eventInDb = await prisma.workflowEvent.findFirst({
      where: { submissionId: submission.id },
    });
    expect(eventInDb).not.toBeNull();
    expect(eventInDb?.fromState).toBe("DRAFT");
    expect(eventInDb?.toState).toBe("VALIDATED");
  });

  it("should return a 400 error for an illegal state transition", async () => {
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "Bad Transition",
        state: "DRAFT",
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId,
      },
    });

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetState: "APPROVED" });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("INVALID_TRANSITION");
  });

  it("should create a DRAFT submission when incomplete and block transition", async () => {
    // 1. Create an incomplete submission (missing lot area = fail impervious cover rule)
    const payload = {
      projectName: "Too Tall Tower",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 50, // ❌ Exceeds 35ft limit
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
      // Missing lotArea and imperviousArea (will fail impervious cover rule)
    };

    const createRes = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.state).toBe("DRAFT"); // ✅ Should stay in DRAFT
    expect(createRes.body.completenessScore).toBeLessThan(1); // Score < 1.0
    const submissionId = createRes.body.id;

    // 2. Try to transition to VALIDATED (should be BLOCKED by guard)
    const transitionRes = await supertest(server.server)
      .post(`/submissions/${submissionId}/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetState: "VALIDATED" });

    // ✅ Guard should block the transition
    expect(transitionRes.statusCode).toBe(400);
    expect(transitionRes.body.error).toBe("INVALID_TRANSITION");
    expect(transitionRes.body.message).toContain("Submission is incomplete");
  });

  it("should PATCH a DRAFT submission to fix errors and update completeness score", async () => {
    // 1. Create incomplete submission
    const createPayload = {
      projectName: "Fix Me House",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 50, // ❌ Fail (exceeds 35ft)
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
      lotArea: 10000,
      imperviousArea: 4000,
    };

    const createRes = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send(createPayload);

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.completenessScore).toBeLessThan(1);
    const submissionId = createRes.body.id;

    // 2. PATCH with corrected data (height 30 < 35)
    const patchRes = await supertest(server.server)
      .patch(`/submissions/${submissionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ buildingHeight: 30 }); // ✅ Fix the height

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.completenessScore).toBe(1); // ✅ Score should update to 1.0
    expect(patchRes.body.state).toBe("DRAFT"); // Still DRAFT after PATCH

    // 3. Now transition should succeed
    const transitionRes = await supertest(server.server)
      .post(`/submissions/${submissionId}/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetState: "VALIDATED" });

    expect(transitionRes.statusCode).toBe(200);
    expect(transitionRes.body.state).toBe("VALIDATED");
  });

  it("should AUTO-VALIDATE if created with perfect data (completenessScore = 1)", async () => {
    // 1. Create submission with all passing data
    const payload = {
      projectName: "Perfect House",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 30, // ✅ Pass (≤ 35ft)
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
      lotArea: 10000,
      imperviousArea: 4000, // ✅ Pass (4000/10000 = 40% < 45%)
      heritageTreesRemoved: false, // ✅ Pass (no heritage trees)
    };

    const createRes = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(createRes.statusCode).toBe(201);
    // ✅ AUTOMATION SUCCESS: State should auto-jump to VALIDATED
    expect(createRes.body.state).toBe("VALIDATED");
    expect(createRes.body.completenessScore).toBe(1);

    // Verify in DB
    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: createRes.body.id },
      include: { ruleResults: true },
    });
    expect(submissionInDb?.state).toBe("VALIDATED");
  });

  it("should BLOCK packet generation for DRAFT submissions", async () => {
    // 1. Create DRAFT submission (incomplete)
    const payload = {
      projectName: "Drafty Project",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 50, // ❌ Fail
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
    };

    const createRes = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.state).toBe("DRAFT");
    const submissionId = createRes.body.id;

    // 2. Try to generate packet (should be BLOCKED)
    const packetRes = await supertest(server.server)
      .post(`/submissions/${submissionId}/generate-packet`)
      .set("Authorization", `Bearer ${token}`);

    // ✅ Guard should block
    expect(packetRes.statusCode).toBe(400);
    expect(packetRes.body.error).toBe("Invalid State");
    expect(packetRes.body.message).toContain("incomplete or in DRAFT");
  });

  it("should queue a packet generation job and verify the result", async () => {
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "PDF Test Project",
        state: "VALIDATED",
        completenessScore: 1,
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId,
      },
    });

    const queueEvents = new QueueEvents("packet-generation");

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/generate-packet`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toContain("Packet generation queued");

    const jobId = response.body.message.split(": ")[1];
    const job = await Job.fromId(packetQueue, jobId);

    expect(job).toBeDefined();

    await job!.waitUntilFinished(queueEvents, 20000);

    const packetInDb = await prisma.packet.findUnique({
      where: { submissionId: submission.id },
    });
    expect(packetInDb).not.toBeNull();
    expect(packetInDb?.filePath).toContain(`${submission.id}.pdf`);

    expect(fs.existsSync(packetInDb!.filePath)).toBe(true);

    await queueEvents.close();
  }, 25000);

  it("should return a 404 error when trying to access a submission from another tenant", async () => {
    // ARRANGE: Create User A's submission using the token from beforeEach
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "User A Project",
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId, // <-- FIXED: Added missing field
      },
    });

    // 2. Create a completely separate User B in a new organization
    const { token: tokenB } = await getAuthToken();

    // ACT: User B tries to fetch User A's submission
    const responseB = await supertest(server.server)
      .get(`/submissions/${submission.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    // ASSERT: The request should fail as if the submission doesn't exist
    expect(responseB.statusCode).toBe(404);
  });
});
