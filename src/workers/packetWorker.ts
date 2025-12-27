import "../core/observability/TracingManager";
import Fastify from "fastify";
import { Worker } from "bullmq";
import nunjucks from "nunjucks";
import { processor } from "./packetProcessor";
import { redis } from "../core/clients/redis";
import { metrics } from "../core/observability/MetricsManager";

// Configure Nunjucks
nunjucks.configure("templates", { autoescape: true });

console.log("🚀 Packet worker started. Waiting for jobs...");

const worker = new Worker("packet-generation", processor, {
  connection: redis,
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} has failed with error: ${err.message}`);
});

worker.on("error", (err) => {
  console.error(`❌ Worker error: ${err.message}`);
});

// Start Metrics Server
const app = Fastify();

app.get("/metrics", async (request, reply) => {
  reply.header("Content-Type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.listen({ port: 3001, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(`❌ Metrics server error: ${err.message}`);
    process.exit(1);
  }
  console.log(`📊 Worker Metrics listening on ${address}`);
});

// Graceful Shutdown
process.on("SIGTERM", async () => {
  console.log("⏹️  SIGTERM received, shutting down gracefully...");
  await worker.close();
  await app.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("⏹️  SIGINT received, shutting down gracefully...");
  await worker.close();
  await app.close();
  process.exit(0);
});
