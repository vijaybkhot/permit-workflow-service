import Fastify, { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import { Job, QueueEvents, Worker } from "bullmq";
import fs from "fs";
import submissionRoutes from "./routes";
import { packetQueue } from "../../core/queues/packetQueue";
import { processor } from "../../workers/packetProcessor";
import { apiKeyAuth } from "../../hooks/auth";

const prisma = new PrismaClient();

describe("Submissions API", () => {
  // Changed the describe to be more general
  let server: FastifyInstance;
  let worker: Worker;

  beforeAll(async () => {
    server = Fastify();
    server.addHook("preValidation", apiKeyAuth);
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
    // Clean up database and storage before each test
    const packets = await prisma.packet.findMany({});
    for (const packet of packets) {
      if (fs.existsSync(packet.filePath)) {
        fs.unlinkSync(packet.filePath); // Delete the physical file
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

    const response = await supertest(server.server)
      .post("/submissions")
      .set("x-api-key", process.env.API_KEY as string)
      .send(payload);

    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.completenessScore).toBe(1);

    const submissionInDb = await prisma.permitSubmission.findUnique({
      where: { id: response.body.id },
      include: { ruleResults: true },
    });

    expect(submissionInDb).not.toBeNull();
    expect(submissionInDb?.projectName).toBe(payload.projectName);
    expect(submissionInDb?.ruleResults.length).toBe(5);
    expect(submissionInDb?.ruleResults.every((r) => r.passed)).toBe(true);
  });

  it("should fetch a single submission by its ID", async () => {
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Fetch Me Project" },
    });

    const response = await supertest(server.server)
      .get(`/submissions/${submission.id}`)
      .set("x-api-key", process.env.API_KEY as string);

    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(submission.id);
    expect(response.body.projectName).toBe("Fetch Me Project");
  });

  it("should return a 404 error for a non-existent submission ID", async () => {
    const fakeId = "clwz00000000000000000000";

    const response = await supertest(server.server)
      .get(`/submissions/${fakeId}`)
      .set("x-api-key", process.env.API_KEY as string);

    expect(response.statusCode).toBe(404);
  });

  it("should successfully transition a submission from DRAFT to VALIDATED", async () => {
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "Transition Me", state: "DRAFT" },
    });

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("x-api-key", process.env.API_KEY as string)
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
      data: { projectName: "Bad Transition", state: "DRAFT" },
    });

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/transition`)
      .set("x-api-key", process.env.API_KEY as string)
      .send({ targetState: "APPROVED" });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("INVALID_TRANSITION");
  });

  it("should queue a packet generation job and verify the result", async () => {
    const submission = await prisma.permitSubmission.create({
      data: { projectName: "PDF Test Project" },
    });

    const queueEvents = new QueueEvents("packet-generation");

    const response = await supertest(server.server)
      .post(`/submissions/${submission.id}/generate-packet`)
      .set("x-api-key", process.env.API_KEY as string)
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
});
