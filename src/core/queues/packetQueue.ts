import { Queue } from "bullmq";

const redisConnection = {
  host: "localhost",
  port: 6379,
};

// new queue instance for packet generation
export const packetQueue = new Queue("packet-generation", {
  connection: redisConnection,
});
