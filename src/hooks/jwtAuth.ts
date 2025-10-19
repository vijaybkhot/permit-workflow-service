import { FastifyRequest, FastifyReply } from "fastify";

export interface UserPayload {
  id: string;
  role: string;
  organizationId: string;
}

// Extend FastifyJWT to specify the payload shape
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: UserPayload;
  }
}

export async function jwtAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
}
