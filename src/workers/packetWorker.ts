import { Worker, Job } from "bullmq";

const redisConnection = {
  host: "localhost",
  port: 6379,
};

console.log("🚀 Packet worker started. Waiting for jobs...");

// The worker's main job is to process jobs from the 'packet-generation' queue.
const worker = new Worker(
  "packet-generation",
  async (job: Job) => {
    console.log(
      `Processing job ${job.id} for submission: ${job.data.submissionId}`
    );

    // --- PDF GENERATION HERE LATER ---
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(`✅ Finished processing job ${job.id}`);

    //return a result if needed
    return { status: "complete", submissionId: job.data.submissionId };
  },
  { connection: redisConnection }
);

// Listen for events on the worker
worker.on("completed", (job) => {
  console.log(`Job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
