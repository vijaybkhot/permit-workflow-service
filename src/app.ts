import Fastify, { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jwtAuth } from "./hooks/jwtAuth";
import { registry } from "./core/metrics";
import authRoutes from "./api/auth/routes";
import submissionRoutes from "./api/submissions/routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
      },
    },
  });

  // 1. Register Plugins
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "development-secret",
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Permit Workflow Service API",
        description: "API for managing permit submissions and their lifecycle.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
  });

  app.addHook("onRequest", async (request, reply) => {
    // public routes that do not require authentication
    const publicRoutes = [
      "/documentation",
      "/metrics",
      "/healthz",
      "/auth/register",
      "/auth/login",
    ];

    const rawUrl: string = request.raw.url ?? "";
    const pathOnly: string = rawUrl.split("?")[0] ?? "";
    const isPublic = publicRoutes.some((route) => pathOnly.startsWith(route));

    if (!isPublic) {
      // If it's not a public route, run our jwtAuth hook
      await jwtAuth(request, reply);
    }
  });

  // 3. Register Routes
  app.get("/metrics", async (request, reply) => {
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });

  app.get("/healthz", async (request, reply) => {
    return { status: "ok" };
  });

  await app.register(authRoutes);
  await app.register(submissionRoutes);

  return app;
}
