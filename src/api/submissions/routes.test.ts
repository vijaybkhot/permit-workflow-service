import Fastify, { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import { Job, QueueEvents } from "bullmq";
import fs from "fs";
import submissionRoutes from "./routes";
import { packetQueue } from "../../core/queues/packetQueue";

const prisma = new PrismaClient();

describe("POST /submissions API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    server.register(submissionRoutes);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    await packetQueue.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    const packets = await prisma.packet.findMany({});
    for (const packet of packets) {
      if (fs.existsSync(packet.filePath)) {
        fs.unlinkSync(packet.filePath); // Delete the file
      }
    }
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({});
    await prisma.ruleResult.deleteMany({});
    await prisma.permitSubmission.deleteMany({});
  });

  it("should return a 401 error if no API key is provided", async () => {
    const response = await supertest(server.server)
      .post("/submissions")
      .send({});

    expect(response.statusCode).toBe(401);
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
      .set("x-api-key", process.env.API_KEY as string)
      .post("/submissions")
      .send(payload);

    // 3. ASSERT (HTTP Response): Check the response from the API
    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.completenessScore).toBe(1); // All required rules passed
    // 4. ASSERT (Database State): Check the database directly to be 100% sure
    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: response.body.id },
      include: { ruleResults: true },
    });

    expect(submissionInDb).not.toBeNull();
    expect(submissionInDb?.projectName).toBe(payload.projectName);
    expect(submissionInDb?.ruleResults.length).toBe(5); // Currently 5 rules total

    expect(submissionInDb?.ruleResults.every((r) => r.passed)).toBe(true);
  });

  it("should fetch a single submission by its ID", async () => {
    // ARRANGE: First, create a submission to fetch.
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Fetch Me Project" },
    });

    // ACT: Make a GET request to the new endpoint
    const response = await supertest(server.server)
      .get(`/submissions/${submission.id}`)
      .set("x-api-key", process.env.API_KEY as string);

    // ASSERT
    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(submission.id);
    expect(response.body.projectName).toBe("Fetch Me Project");
  });

  it("should return a 404 error for a non-existent submission ID", async () => {
    // ARRANGE: A fake ID that doesn't exist in the database
    const fakeId = "clwz00000000000000000000";

    // ACT: Make a GET request to the non-existent endpoint
    const response = await supertest(server.server)
      .get(`/submissions/${fakeId}`)
      .set("x-api-key", process.env.API_KEY as string);

    // ASSERT
    expect(response.statusCode).toBe(404);
  });

  it("should successfully transition a submission from DRAFT to VALIDATED", async () => {
    // ARRANGE: Create a submission in the DRAFT state
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Transition Me", state: "DRAFT" },
    });

    // ACT: Call the transition endpoint
    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("x-api-key", process.env.API_KEY as string)
      .send({ targetState: "VALIDATED" });

    // ASSERT: Check the HTTP response and the database state
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
    // ARRANGE: Create a submission in the DRAFT state
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Bad Transition", state: "DRAFT" },
    });

    // ACT: Attempt to transition directly to APPROVED, which is not allowed
    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("x-api-key", process.env.API_KEY as string)
      .send({ targetState: "APPROVED" });

    // ASSERT
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("INVALID_TRANSITION");
  });

  it("should queue a packet generation job and verify the result", async () => {
    // 1. ARRANGE: Create a submission to generate a packet for.
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "PDF Test Project" },
    });

    // Create a listener to wait for the job to complete
    const queueEvents = new QueueEvents("packet-generation");

    // 2. ACT: Call the endpoint to queue the job.
    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/generate-packet`)
      .set("x-api-key", process.env.API_KEY as string)
      .send();

    // The API should respond instantly.
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toContain("Packet generation queued");

    // 3. WAIT: Get the job ID from the response and wait for it to finish.
    const jobId = response.body.message.split(": ")[1];
    const job = await Job.fromId(packetQueue, jobId); // Get the Job object

    expect(job).toBeDefined();

    // Call the correct method on the Job object
    await job!.waitUntilFinished(queueEvents, 20000);

    // 4. ASSERT: Check that the worker did its job correctly.
    // Check that a packet record was created in the database.
    const packetInDb = await prisma.packet.findUnique({
      where: { submissionId: submission.id },
    });
    expect(packetInDb).not.toBeNull();
    expect(packetInDb?.filePath).toContain(`${submission.id}.pdf`);

    // Check that the PDF file was actually created on disk.
    expect(fs.existsSync(packetInDb!.filePath)).toBe(true);

    await queueEvents.close();
  }, 25000);
});
