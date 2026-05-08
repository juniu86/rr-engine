/**
 * Sentry — captura de erros em produção.
 *
 * Inicializado no topo do entrypoint do Express (`server/_core/index.ts`)
 * antes de qualquer outro import. Sem isso, Sentry não consegue
 * instrumentar libs como Express, Anthropic, Drizzle automaticamente.
 *
 * Env var necessária: `SENTRY_DSN`. Quando ausente, Sentry fica desligado
 * silenciosamente — útil em dev local.
 */
import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_DEPLOYMENT_ID || "local",
    // Tracing apenas em prod e com taxa baixa pra não estourar quota free.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    // Captura erros não tratados de promise rejection automaticamente.
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    // Filtro pra reduzir ruído — não capturar 4xx do cliente.
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
  console.log(`[Sentry] Initialized (env=${process.env.NODE_ENV})`);
} else {
  console.log("[Sentry] DSN not set — error reporting disabled");
}

export { Sentry };
