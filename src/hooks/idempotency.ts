import { FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../core/clients/redis";

const IDEMPOTENCY_HEADER = "idempotency-key";
const LOCK_TTL_SECONDS = 10;
const CACHE_TTL_SECONDS = 60 * 60 * 24;

export const idempotencyHooks = {
  async check(request: FastifyRequest, reply: FastifyReply) {
    if (request.method !== "POST" && request.method !== "PATCH") {
      return;
    }

    const key = request.headers[IDEMPOTENCY_HEADER] as string;
    if (!key) return;

    const redisKey = `idempotency:${key}`;
    const lockKey = `lock:idempotency:${key}`;

    try {
      if (!redis) throw new Error("Redis client is UNDEFINED in check()");

      const cachedResponse = await redis.get(redisKey);

      if (cachedResponse) {
        request.log.info({ key }, "Idempotency Hit");
        const { statusCode, body, headers } = JSON.parse(cachedResponse);
        reply.status(statusCode).headers(headers).send(body);
        return reply;
      }

      // Try to acquire a distributed lock to prevent concurrent processing
      const acquiredLock = await redis.set(
        lockKey,
        "LOCKED",
        "EX",
        LOCK_TTL_SECONDS,
        "NX"
      );

      if (acquiredLock !== "OK") {
        // Another request is already processing this idempotency key
        reply.code(409).send({ error: "Conflict", message: "Processing..." });
        return reply;
      }

      // Attach lock key to request for cleanup in save hook
      (request as any).idempotencyLockKey = lockKey;
    } catch (err) {
      request.log.error({ err }, "Idempotency Check Failed");
    }
  },

  async save(request: FastifyRequest, reply: FastifyReply, payload: any) {
    // Only execute for POST/PATCH requests with idempotency key
    const key = request.headers[IDEMPOTENCY_HEADER] as string;
    const lockKey = (request as any).idempotencyLockKey;

    if (!lockKey || !key) {
      return;
    }

    try {
      if (!redis) throw new Error("Redis client is UNDEFINED in save()");

      // ✅ FIX: Use reply property to track if we've already processed this hook
      // The onSend hook can be called multiple times in Fastify's lifecycle
      if ((reply as any)._idempotencySaveHookProcessed) {
        return;
      }
      (reply as any)._idempotencySaveHookProcessed = true;

      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const redisKey = `idempotency:${key}`;
        const cacheData = {
          statusCode: reply.statusCode,
          headers: reply.getHeaders(),
          body: payload,
        };

        await Promise.all([
          redis.setex(redisKey, CACHE_TTL_SECONDS, JSON.stringify(cacheData)),
          redis.del(lockKey),
        ]);
      } else {
        // If the request failed (4xx/5xx), release the lock without caching
        await redis.del(lockKey);
      }
    } catch (err) {
      // If error occurs, still try to release the lock
      try {
        await redis?.del(lockKey);
      } catch (e) {
        // Ignore lock cleanup errors
      }
    }
  },
};
