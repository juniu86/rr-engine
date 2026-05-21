import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequestWithClerk } from "./clerk-auth";

/**
 * P3 — Subset estrutural do `Request` do Express usado pelas procedures.
 *
 * Usar `CreateExpressContextOptions["req"]` direto fazia o tsc emitir
 * referências profundas a `@types/express-serve-static-core` e `@types/qs`
 * no `dist/index.d.ts` do `packages/api-types`, quebrando a portabilidade
 * (TS2742). Como o cliente tRPC NUNCA acessa `ctx.req`/`ctx.res`, basta
 * um shape mínimo cobrindo o que `routers.ts` realmente usa.
 *
 * Em runtime, o objeto continua sendo o `Request` completo do Express —
 * usamos cast `as unknown as TrpcRequest` em `createContext`.
 */
export interface TrpcRequest {
  headers: {
    authorization?: string;
    origin?: string;
    cookie?: string;
  } & Record<string, string | string[] | undefined>;
  protocol: string;
  get(name: string): string | undefined;
  cookies?: Record<string, string>;
  body?: unknown;
  ip?: string;
  url?: string;
}

/** Subset estrutural do `Response` do Express. */
export interface TrpcResponse {
  clearCookie(name: string, options?: Record<string, unknown>): TrpcResponse;
  cookie(
    name: string,
    value: string,
    options?: Record<string, unknown>
  ): TrpcResponse;
  status(code: number): TrpcResponse;
  json(data: unknown): TrpcResponse;
}

export type TrpcContext = {
  req: TrpcRequest;
  res: TrpcResponse;
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
  } catch {
    // Auth opcional para public procedures. Se o token vier inválido em uma
    // protected procedure, o middleware do tRPC barra com FORBIDDEN.
    user = null;
  }

  return {
    // Cast estrutural — em runtime são os objetos completos do Express.
    // O subset `TrpcRequest`/`TrpcResponse` cobre só o que routers.ts usa.
    req: opts.req as unknown as TrpcRequest,
    res: opts.res as unknown as TrpcResponse,
    user,
  };
}
