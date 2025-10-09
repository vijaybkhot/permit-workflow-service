import { FastifyRequest, FastifyReply, DoneFuncWithErrOrRes } from "fastify";

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: DoneFuncWithErrOrRes
) {
  const apiKey = request.headers["x-api-key"];

  const publicRoutes = ["/metrics", "/healthz", "/documentation"];

  const pathOnly: string = request.raw.url?.split("?")[0] || "";

  // 2. Check the path against our public routes.
  const isPublic = publicRoutes.some((route) => pathOnly.startsWith(route));
  if (isPublic) {
    return done();
  }

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  done();
}
