import Fastify, { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient, RuleSeverity } from "@prisma/client";
import { Job, QueueEvents, Worker } from "bullmq";
import fs from "fs";
import submissionRoutes from "./routes";
import { packetQueue } from "../../core/queues/packetQueue";
import { processor } from "../../workers/packetProcessor";
import { jwtAuth } from "../../hooks/jwtAuth";
import jwt from "@fastify/jwt";

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
    server = Fastify();
    await server.register(jwt, { secret: "test-secret-for-jwt" });
    server.addHook("onRequest", jwtAuth);
    server.register(submissionRoutes);
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
          description: "Impervious cover check",
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

    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: response.body.id },
      include: { ruleResults: true },
    });

    expect(submissionInDb).not.toBeNull();
    expect(submissionInDb?.projectName).toBe(payload.projectName);

    // NOTE: This assertion expects exactly 1 rule result because we only seeded
    // 'ATX_IMPERVIOUS_COVER' in the beforeEach block above.
    expect(submissionInDb?.ruleResults.length).toBe(1);

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
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId, // <-- FIXED: Added missing field
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
        jurisdictionId: testJurisdictionId, // <-- FIXED: Added missing field
      },
    });

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetState: "APPROVED" });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("INVALID_TRANSITION");
  });

  it("should queue a packet generation job and verify the result", async () => {
    const submission = await prisma.permitSubmission.create({
      data: {
        projectName: "PDF Test Project",
        organizationId: testOrgId,
        jurisdictionId: testJurisdictionId, // <-- FIXED: Added missing field
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
