import { FastifyRequest, FastifyReply } from "fastify";

// Extend the FastifyRequest interface to include our user property
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      role: string;
      organizationId: string;
    };
    user: {
      id: string;
      role: string;
      organizationId: string;
    };
  }
}

export async function jwtAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    // This is a built-in method from the @fastify/jwt plugin
    // It automatically verifies the token from the "Authorization: Bearer ..." header
    // and attaches the decoded payload to request.user
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
}
