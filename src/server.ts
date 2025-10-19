import Fastify from "fastify";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import submissionRoutes from "./api/submissions/routes";
import { registry } from "./core/metrics";
import authRoutes from "./api/auth/routes";
import { jwtAuth } from "./hooks/jwtAuth";

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

async function start() {
  try {
    await server.register(jwt, {
      secret: process.env.JWT_SECRET as string,
    });

    await server.register(swagger, {
      openapi: {
        info: {
          title: "Permit Workflow Service API",
          description:
            "API for managing permit submissions and their lifecycle.",
          version: "1.0.0",
        },
        components: {
          securitySchemes: {
            apiKey: {
              type: "apiKey",
              name: "x-api-key",
              in: "header",
            },
          },
        },
        security: [
          {
            apiKey: [],
          },
        ],
      },
    });

    await server.register(swaggerUi, {
      routePrefix: "/documentation",
    });

    server.addHook("onRequest", async (request, reply) => {
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

    server.get("/metrics", async (request, reply) => {
      reply.header("Content-Type", registry.contentType);
      return registry.metrics();
    });

    server.get("/healthz", async (request, reply) => {
      return { status: "ok" };
    });

    server.register(authRoutes);
    server.register(submissionRoutes);

    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
