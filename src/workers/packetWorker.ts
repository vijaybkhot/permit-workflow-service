import { Worker } from "bullmq";
import nunjucks from "nunjucks";
import { processor } from "./packetProcessor";

const redisConnection = {
  host: "localhost",
  port: 6379,
};

// Configure Nunjucks
nunjucks.configure("templates", { autoescape: true });

console.log("🚀 Packet worker started. Waiting for jobs...");

const worker = new Worker("packet-generation", processor, {
  connection: redisConnection,
});

worker.on("completed", (job) => {
  console.log(`Job ${job.id} has completed!`);
});
worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
