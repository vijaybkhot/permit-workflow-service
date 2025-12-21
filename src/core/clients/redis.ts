import Redis from "ioredis";

// Use environment variable or default to local
// NOTE: In production, ensure REDIS_URL is set in your .env
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility if shared
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on("error", (err) => console.error("Redis Client Error", err));
redis.on("connect", () => {
  if (process.env.NODE_ENV !== "test") {
    console.log("Redis Client Connected");
  }
});
