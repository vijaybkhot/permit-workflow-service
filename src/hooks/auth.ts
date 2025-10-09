import { FastifyRequest, FastifyReply, DoneFuncWithErrOrRes } from "fastify";

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: DoneFuncWithErrOrRes
) {
  const apiKey = request.headers["x-api-key"];

  if (request.url === "/metrics" || request.url === "/healthz") {
    return done();
  }

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  done();
}
