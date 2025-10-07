import Fastify from "fastify";
import submissionRoutes from "./api/submissions/routes";

// Initialize Fastify
const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

// Declare a simple health check route
server.get("/healthz", async (request, reply) => {
  return { status: "ok" };
});

// Register our submission routes
server.register(submissionRoutes);

// Start the server
const start = async () => {
  try {
    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
