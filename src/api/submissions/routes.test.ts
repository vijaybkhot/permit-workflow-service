import Fastify, { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import submissionRoutes from "./routes";

// Initialize a Prisma Client for test database interactions
const prisma = new PrismaClient();

describe("POST /submissions API", () => {
  let server: FastifyInstance;

  // Before all tests, build our Fastify server and register the plugin
  beforeAll(async () => {
    server = Fastify();
    server.register(submissionRoutes);
    await server.ready();
  });

  // After all tests, close the server connection
  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  // After each test, clean up the database to ensure tests are isolated
  afterEach(async () => {
    await prisma.ruleResult.deleteMany({});
    await prisma.permitSubmission.deleteMany({});
  });

  it("should create a new submission and its rule results successfully", async () => {
    // 1. ARRANGE: Define the payload for our request
    const payload = {
      projectName: "Test Project - Integration",
      hasArchitecturalPlans: true,
      hasStructuralCalcs: true,
      buildingHeight: 30,
      setbackFront: 25,
      setbackSide: 10,
      setbackRear: 30,
      fireEgressCount: 2,
    };

    // 2. ACT: Send an HTTP request to the server
    const response = await supertest(server.server)
      .post("/submissions")
      .send(payload);

    // 3. ASSERT (HTTP Response): Check the response from the API
    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.completenessScore).toBe(1); // Since all required rules should pass

    // 4. ASSERT (Database State): Check the database directly to be 100% sure
    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: response.body.id },
      include: { ruleResults: true },
    });

    expect(submissionInDb).not.toBeNull();
    expect(submissionInDb?.projectName).toBe(payload.projectName);
    // Our rule registry has 5 rules, so we expect 5 results
    expect(submissionInDb?.ruleResults.length).toBe(5);
    // Check that all results were marked as "passed" for this valid payload
    expect(submissionInDb?.ruleResults.every((r) => r.passed)).toBe(true);
  });

  it("should fetch a single submission by its ID", async () => {
    // ARRANGE: First, create a submission to fetch.
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Fetch Me Project" },
    });

    // ACT: Make a GET request to the new endpoint
    const response = await supertest(server.server).get(
      `/submissions/${submission.id}`
    );

    // ASSERT
    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(submission.id);
    expect(response.body.projectName).toBe("Fetch Me Project");
  });

  it("should return a 404 error for a non-existent submission ID", async () => {
    // ARRANGE: A fake ID that doesn't exist in the database
    const fakeId = "clwz00000000000000000000";

    // ACT: Make a GET request to the non-existent endpoint
    const response = await supertest(server.server).get(
      `/submissions/${fakeId}`
    );

    // ASSERT
    expect(response.statusCode).toBe(404);
  });
});
