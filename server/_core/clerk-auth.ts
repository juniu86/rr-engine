/**
 * Autenticação Clerk no backend tRPC.
 *
 * Substitui o fluxo OAuth Manus (server/_core/sdk.ts:authenticateRequest).
 *
 * Contrato: lê o header `Authorization: Bearer <clerkSessionToken>`, valida o
 * JWT contra o Clerk e retorna o `User` do banco (criando-o no primeiro acesso).
 *
 * O frontend (Next.js + @clerk/nextjs) injeta o token automaticamente via tRPC
 * link customizado — ver client side em rr-engine-app/lib/trpc.ts.
 *
 * Variáveis de ambiente requeridas:
 *   - CLERK_SECRET_KEY (sk_test_* ou sk_live_*)
 *   - CLERK_PUBLISHABLE_KEY (pk_test_* ou pk_live_*)
 */

import type { Request } from "express";
import { createClerkClient, verifyToken } from "@clerk/backend";
import * as db from "../db";
import type { User } from "../../drizzle/schema";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

if (!CLERK_SECRET_KEY) {
  console.warn(
    "[clerk-auth] CLERK_SECRET_KEY ausente. Auth vai falhar em produção."
  );
}

const clerkClient = CLERK_SECRET_KEY
  ? createClerkClient({
      secretKey: CLERK_SECRET_KEY,
      publishableKey: CLERK_PUBLISHABLE_KEY,
    })
  : null;

class UnauthorizedError extends Error {
  code = "UNAUTHORIZED" as const;
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Extrai o token Bearer do header Authorization.
 * Formato: `Authorization: Bearer eyJhbGciOiJSUzI1NiIs...`
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Valida o JWT do Clerk e retorna o User do banco.
 *
 * Cria o user no primeiro acesso (auto-sync). Se o token for inválido,
 * lança UnauthorizedError.
 */
export async function authenticateRequestWithClerk(
  req: Request
): Promise<User> {
  if (!clerkClient || !CLERK_SECRET_KEY) {
    throw new UnauthorizedError("Clerk nao configurado no backend");
  }

  const token = extractBearerToken(req);
  if (!token) {
    throw new UnauthorizedError("Authorization header ausente");
  }

  // verifyToken valida assinatura, expiração e issuer.
  // Retorna os claims do JWT (sub = clerk user ID).
  let payload;
  try {
    payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
  } catch (err) {
    throw new UnauthorizedError(
      `Token Clerk invalido: ${(err as Error).message}`
    );
  }

  const clerkUserId = payload.sub;
  if (!clerkUserId) {
    throw new UnauthorizedError("Token sem sub (clerk user id)");
  }

  // Busca user existente. A coluna openId armazena o Clerk user ID.
  let user = await db.getUserByOpenId(clerkUserId);

  // Auto-criação no primeiro acesso (sync com Clerk).
  if (!user) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const primaryEmail =
        clerkUser.emailAddresses.find(
          e => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress ?? null;

      const fullName = [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      await db.upsertUser({
        openId: clerkUserId,
        name: fullName || null,
        email: primaryEmail,
        loginMethod: "clerk",
        lastSignedIn: new Date(),
      });

      user = await db.getUserByOpenId(clerkUserId);
    } catch (err) {
      console.error("[clerk-auth] Falha ao sincronizar user do Clerk:", err);
      throw new UnauthorizedError("Falha ao sincronizar user");
    }
  }

  if (!user) {
    throw new UnauthorizedError("User nao encontrado apos sync");
  }

  // Atualiza lastSignedIn (best-effort, não bloqueia).
  db.upsertUser({
    openId: user.openId,
    lastSignedIn: new Date(),
  }).catch(err => {
    console.warn("[clerk-auth] Falha ao atualizar lastSignedIn:", err);
  });

  return user;
}
