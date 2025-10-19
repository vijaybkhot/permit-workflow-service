import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import { RegisterBody, LoginBody } from "./types";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

export default async function (server: FastifyInstance) {
  // --- Define the validation schemas ---
  const registerSchema = {
    body: {
      type: "object",
      required: ["orgName", "email", "password"],
      properties: {
        orgName: { type: "string", minLength: 2 },
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 8 },
      },
    },
  };

  const loginSchema = {
    body: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string" },
      },
    },
  };
  // --- User Registration ---
  server.post<{ Body: RegisterBody }>(
    "/auth/register",
    { schema: registerSchema },
    async (request, reply) => {
      const { orgName, email, password } = request.body as any;

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      try {
        // Create the organization and the first user in a transaction
        const newOrg = await prisma.organization.create({
          data: {
            name: orgName,
            users: {
              create: {
                email,
                password: hashedPassword,
                role: "ADMIN", // First user is an admin
              },
            },
          },
          include: { users: true },
        });

        const user = newOrg.users[0];
        if (!user) {
          reply.code(500).send({ error: "User creation failed." });
          return;
        }
        const token = server.jwt.sign({
          id: user.id,
          role: user.role,
          organizationId: user.organizationId,
        });

        reply.code(201).send({ token });
      } catch (error) {
        // Handle cases where email might already exist
        server.log.error(error, "Registration failed");
        reply
          .code(409)
          .send({ error: "Registration failed. Email may already be in use." });
      }
    }
  );

  // --- User Login ---
  server.post<{ Body: LoginBody }>(
    "/auth/login",
    { schema: loginSchema },
    async (request, reply) => {
      const { email, password } = request.body as any;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const token = server.jwt.sign({
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      });

      reply.send({ token });
    }
  );
}
