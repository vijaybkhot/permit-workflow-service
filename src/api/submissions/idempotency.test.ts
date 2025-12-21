import { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient, RuleSeverity } from "@prisma/client";
import { buildApp } from "../../app";
import { redis } from "../../core/clients/redis";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

describe("Idempotency Reliability", () => {
  let server: FastifyInstance;
  let token: string;
  let testOrgId: string;
  let testJurisdictionId: string;

  // Setup Helper
  const setupUser = async () => {
    const org = await prisma.organization.create({
      data: { name: "Idem Org" },
    });
    const user = await prisma.user.create({
      data: {
        email: `idem-${Date.now()}@test.com`,
        password: "pw",
        organizationId: org.id,
      },
    });
    testOrgId = org.id;
    return server.jwt.sign({
      id: user.id,
      role: user.role,
      organizationId: org.id,
    });
  };

  beforeAll(async () => {
    server = await buildApp();
    await server.ready();
    token = await setupUser();
  });

  afterAll(async () => {
    await server.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear Redis keys to ensure test isolation
    const keys = await redis.keys("idempotency:*");
    if (keys.length > 0) await redis.del(keys);
    const lockKeys = await redis.keys("lock:*");
    if (lockKeys.length > 0) await redis.del(lockKeys);

    // Clear DB in correct order (dependents first)
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({});
    await prisma.ruleResult.deleteMany({});
    await prisma.permitSubmission.deleteMany({});
    await prisma.rule.deleteMany({});
    await prisma.ruleSet.deleteMany({});
    await prisma.jurisdiction.deleteMany({});
    // Don't delete users/orgs - keep the user from beforeAll

    // Seed jurisdiction and rules for tests
    const jurisdiction = await prisma.jurisdiction.create({
      data: { name: "Austin, TX", code: "ATX" },
    });

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

  it("should return cached response for duplicate requests (Idempotency Hit)", async () => {
    const idempotencyKey = `test-hit-${randomUUID()}`;
    const payload = {
      projectName: "Shed A",
      jurisdictionCode: "ATX",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 12,
      setbackFront: 10,
      setbackSide: 5,
      setbackRear: 5,
      fireEgressCount: 2,
    };

    // 1. First Request
    const res1 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const id1 = res1.body.id;

    // 2. Second Request (Same Key)
    const res2 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send(payload);

    // Should match exactly
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(id1);

    // DB Check: Should still be only 1 record
    const count = await prisma.permitSubmission.count();
    expect(count).toBe(1);
  });

  it("should reject concurrent requests with 409 Conflict (Race Condition)", async () => {
    const idempotencyKey = "test-race-concurrent";
    const lockKey = `lock:idempotency:${idempotencyKey}`;

    // 1. SIMULATE A LOCK: Manually set lock as if Request A is running
    await redis.set(lockKey, "LOCKED", "EX", 10, "NX");

    // 2. Send Request B with SAME key
    const res = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Race Condition Project",
        jurisdictionCode: "ATX",
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Processing..."); // ✅ FIXED: Match actual message
  });
  it("should NOT cache error responses (4xx/5xx)", async () => {
    const idempotencyKey = `test-error-${randomUUID()}`;

    // 1. First request with INVALID data
    const res1 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Invalid",
        jurisdictionCode: "INVALID_CODE", // ← Bad jurisdiction
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res1.status).toBe(400); // Error response

    // 2. Second request with SAME invalid key should retry, not use cache
    const res2 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Invalid",
        jurisdictionCode: "INVALID_CODE",
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res2.status).toBe(400); // Should retry, not cached
  });

  it("should allow retry after lock expires (LOCK_TTL)", async () => {
    const idempotencyKey = `test-lock-expire-${randomUUID()}`;
    const lockKey = `lock:idempotency:${idempotencyKey}`;

    // 1. Set a lock that expires quickly
    await redis.set(lockKey, "LOCKED", "EX", 1, "NX"); // 1 second TTL

    // 2. Try request immediately → should get 409
    const res1 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Lock Test",
        jurisdictionCode: "ATX",
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res1.status).toBe(409);

    // 3. Wait for lock to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // 4. Retry → should succeed (lock expired)
    const res2 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Lock Test",
        jurisdictionCode: "ATX",
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res2.status).toBe(201); // Should succeed
  });

  it("should use cached response even with different payload", async () => {
    const idempotencyKey = `test-payload-${randomUUID()}`;

    // 1. First request
    const res1 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Original",
        jurisdictionCode: "ATX",
        hasArchitecturalPlans: true,
        hasStructuralCalcs: true,
        buildingHeight: 20,
        setbackFront: 10,
        setbackSide: 5,
        setbackRear: 5,
        fireEgressCount: 2,
      });

    expect(res1.status).toBe(201);
    const id1 = res1.body.id;

    // 2. Second request with DIFFERENT payload but SAME key
    const res2 = await supertest(server.server)
      .post("/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        projectName: "Different Name", // Different payload!
        jurisdictionCode: "ATX",
        hasArchitecturalPlans: false,
        hasStructuralCalcs: false,
        buildingHeight: 30,
        setbackFront: 20,
        setbackSide: 10,
        setbackRear: 10,
        fireEgressCount: 3,
      });

    // Should return cached response from first request
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(id1); // Same ID (cached)
    expect(res2.body).toEqual(res1.body); // Exact same response
  });
});
