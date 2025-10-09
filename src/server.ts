import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import submissionRoutes from "./api/submissions/routes";
import { apiKeyAuth } from "./hooks/auth";
import { registry } from "./core/metrics";

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

async function start() {
  try {
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

    server.addHook("preValidation", apiKeyAuth);

    server.get("/metrics", async (request, reply) => {
      reply.header("Content-Type", registry.contentType);
      return registry.metrics();
    });

    server.get("/healthz", async (request, reply) => {
      return { status: "ok" };
    });

    server.register(submissionRoutes);

    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
