import Fastify from "fastify";
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
server.addHook("preHandler", apiKeyAuth);

server.get("/metrics", async (request, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});

server.get("/healthz", async (request, reply) => {
  return { status: "ok" };
});

server.register(submissionRoutes);

const start = async () => {
  try {
    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
