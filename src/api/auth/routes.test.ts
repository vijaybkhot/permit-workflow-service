import { FastifyInstance } from "fastify";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { buildApp } from "../../app";

const prisma = new PrismaClient();

describe("Auth API", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildApp();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 1. Delete all records that are children of PermitSubmission
    await prisma.packet.deleteMany({});
    await prisma.workflowEvent.deleteMany({}); // <-- Add this missing line
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
    // ARRANGE: Create the user directly in the database.
    const hashedPassword = await bcrypt.hash("password123", 10);
    await prisma.organization.create({
      data: {
        name: "Test Org",
        users: {
          create: {
            email: "login@example.com",
            password: hashedPassword,
          },
        },
      },
    });

    // ACT: Now, try to log in with the correct credentials.
    const response = await supertest(server.server).post("/auth/login").send({
      email: "login@example.com",
      password: "password123",
    });

    // ASSERT
    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it("should fail to log in with an incorrect password", async () => {
    // ARRANGE: Create the user directly in the database.
    const hashedPassword = await bcrypt.hash("password123", 10);
    await prisma.organization.create({
      data: {
        name: "Test Org",
        users: {
          create: {
            email: "fail@example.com",
            password: hashedPassword,
          },
        },
      },
    });

    // ACT: Try to log in with the wrong password.
    const response = await supertest(server.server).post("/auth/login").send({
      email: "fail@example.com",
      password: "wrong-password",
    });

    // ASSERT
    expect(response.statusCode).toBe(401);
  });
});
