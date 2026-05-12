/**
 * Sentry instrumentation — carregado via `node --import ./dist/instrument.js`
 * ANTES de qualquer outro módulo. Sem isso, Sentry/Node 8+ em ESM não
 * consegue auto-instrumentar Express (warning visível no log:
 * "express is not instrumented").
 *
 * Esse arquivo precisa ficar isolado do resto do código — só Sentry.init,
 * nenhum import de Express, tRPC, Drizzle ou qualquer lib instrumentada.
 *
 * Build: esbuild compila este arquivo para `dist/instrument.js` junto
 * com `dist/index.js`. Comando de start usa `--import` pra carregar
 * primeiro.
 */
import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_DEPLOYMENT_ID || "local",
    // Tracing apenas em prod com taxa baixa pra não estourar quota free.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    // Filtra 4xx do cliente — só captura erros reais (5xx + uncaught).
    beforeSend(event, hint) {
      const error = hint.originalException as
        | { statusCode?: number; status?: number }
        | undefined;
      const status = error?.statusCode || error?.status;
      if (status && status >= 400 && status < 500) {
        return null;
      }
      return event;
    },
  });
  console.log(
    `[Sentry] Initialized via --import (env=${process.env.NODE_ENV})`
  );
} else {
  console.log("[Sentry] DSN not set — error reporting disabled");
}
