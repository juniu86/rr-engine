import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { stripeWebhookHandler } from "../stripe/webhook";
import { shutdownTracing } from "../services/tracing";

// Marker pra confirmar nos Deploy Logs do Railway que o build atual subiu.
// Trocar valor a cada investigação de "build cacheado".
console.log("[boot] BUILD_MARKER=2026-05-07-applyAuditCorrections-fix");

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * CORS manual — permite requests do frontend Vercel (engine.rres.com.br) e
 * de origins de dev (localhost). Lista controlada via env CORS_ORIGINS
 * (CSV de origins). Default cobre prod + dev local.
 */
function getAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS;
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [
    "https://engine.rres.com.br",
    "https://www.engine.rres.com.br",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // CORS — antes de qualquer middleware de body/auth.
  const allowedOrigins = getAllowedOrigins();
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Stripe webhook MUST be registered BEFORE express.json() for signature verification
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    stripeWebhookHandler
  );
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Healthcheck (Railway usa pra verificar liveness)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Modo de servir frontend:
  //  - development: Vite dev server (HMR) — quando rodando local sem Next.
  //  - production:  API-only por padrão. Para servir SPA legacy, setar
  //    SERVE_FRONTEND=true (não usado em prod nova).
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (process.env.SERVE_FRONTEND === "true") {
    serveStatic(app);
  } else {
    // API-only: rota raiz responde algo amigável.
    app.get("/", (_req, res) => {
      res.json({
        service: "rr-engine API",
        version: process.env.npm_package_version || "3.1.0",
        docs: "https://engine.rres.com.br",
      });
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // P1.4 Fase 4: registra cron job mensal de refresh de preços.
  // No-op em NODE_ENV=test (guard interno em scheduleRefreshJob).
  const { scheduleRefreshJob } = await import("../jobs/refreshPriceDatabases");
  scheduleRefreshJob();

  // P2.2: graceful shutdown — flush dos eventos pendentes do Langfuse antes
  // do processo encerrar. SIGTERM (orquestrador) e SIGINT (Ctrl+C local).
  const gracefulShutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, shutting down gracefully...`);
    try {
      await shutdownTracing();
    } catch (err) {
      console.warn("[Server] shutdownTracing falhou, ignorando:", err);
    }
    server.close(() => process.exit(0));
    // Hard cap caso server.close trave em conexões ativas.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch(console.error);
