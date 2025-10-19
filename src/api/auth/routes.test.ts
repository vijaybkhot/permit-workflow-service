import Fastify, { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import jwt from "@fastify/jwt";
import authRoutes from "./routes";
import { jwtAuth } from "../../hooks/jwtAuth";

const prisma = new PrismaClient();

describe("Auth API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(jwt, { secret: "test-secret" });
    server.register(authRoutes);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 1. Delete all records that are children of PermitSubmission
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({});
    await prisma.ruleResult.deleteMany({});

    // 2. Now delete PermitSubmission records
    await prisma.permitSubmission.deleteMany({});

    // 3. Delete all Users (children of Organization)
    await prisma.user.deleteMany({});

    // 4. Finally, delete the parent Organization records
    await prisma.organization.deleteMany({});
  });

  it("should register a new user and organization", async () => {
    const response = await supertest(server.server)
      .post("/auth/register")
      .send({
        orgName: "Test Org",
        email: "test@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.token).toBeDefined();

    const orgInDb = await prisma.organization.findFirst({
      where: { name: "Test Org" },
    });
    expect(orgInDb).not.toBeNull();
  });

  it("should log in an existing user", async () => {
    // First, register a user to test against
    await supertest(server.server).post("/auth/register").send({
      orgName: "Test Org",
      email: "login@example.com",
      password: "password123",
    });

    // Now, try to log in
    const response = await supertest(server.server).post("/auth/login").send({
      email: "login@example.com",
      password: "password123",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it("should fail to log in with an incorrect password", async () => {
    await supertest(server.server).post("/auth/register").send({
      orgName: "Test Org",
      email: "fail@example.com",
      password: "password123",
    });

    const response = await supertest(server.server).post("/auth/login").send({
      email: "fail@example.com",
      password: "wrong-password", // Incorrect password
    });

    expect(response.statusCode).toBe(401);
  });
});
