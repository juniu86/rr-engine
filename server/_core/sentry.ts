/**
 * Re-export do Sentry pra captureException explícito em handlers tRPC,
 * agents etc. A inicialização real (Sentry.init) está em
 * `server/instrument.ts` — carregado via `node --import` antes deste
 * módulo. Isso garante auto-instrumentação de Express, HTTP, Anthropic.
 *
 * Não chamar Sentry.init aqui. Se Sentry.init rodar depois do Express
 * ter sido carregado, perde a auto-instrumentação (era o warning antigo
 * "express is not instrumented" — corrigido 11/05/2026).
 */
import * as Sentry from "@sentry/node";

export { Sentry };
