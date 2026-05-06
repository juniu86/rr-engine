import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequestWithClerk } from "./clerk-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Cria o contexto tRPC para cada request.
 *
 * A autenticação é feita via Clerk JWT no header `Authorization: Bearer <token>`.
 * Procedures públicas funcionam sem token (user = null); procedures protegidas
 * exigem que `ctx.user` exista (validação em `protectedProcedure`).
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequestWithClerk(opts.req);
  } catch (error) {
    // Auth opcional para public procedures. Se o token vier inválido em uma
    // protected procedure, o middleware do tRPC barra com FORBIDDEN.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
