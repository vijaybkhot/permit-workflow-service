import { Queue } from "bullmq";
import { redis } from "../clients/redis";

// new queue instance for packet generation
export const packetQueue = new Queue("packet-generation", {
  connection: redis,
});
