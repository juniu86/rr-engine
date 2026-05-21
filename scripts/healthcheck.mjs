/**
 * Healthcheck de produção — mapa rápido do que está vivo e do que caiu.
 *
 * RODAR ISTO PRIMEIRO quando a produção quebrar. Embute a ordem de
 * diagnóstico (status das plataformas → saúde dos serviços) em código,
 * pra não depender de lembrar a sequência sob pressão.
 *
 * Uso:
 *   node scripts/healthcheck.mjs
 *
 * Lê DATABASE_URL do .env (use a MYSQL_PUBLIC_URL pra testar o banco de fora).
 * Sem DATABASE_URL, pula só o teste de MySQL — o resto roda igual.
 *
 * Origem: incident 20/05/2026, em que o MySQL do Railway travou por pane da
 * plataforma e levou horas pra ser identificado. Um comando destes apontaria
 * "MySQL: down" + "Railway: incident ativo" em 30 segundos.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const API = process.env.API_URL || "https://api.rres.com.br";

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    ),
  ]);
}

async function main() {
  console.log("=== STATUS DAS PLATAFORMAS ===");
  // Dois provedores: statuspage.io (Vercel, Clerk) usa {status:{indicator}};
  // instatus (Railway) usa {page:{status}}. Tratados separadamente.
  const statusPages = [
    { name: "Railway", url: "https://railway.instatus.com/summary.json", kind: "instatus" },
    { name: "Vercel", url: "https://www.vercel-status.com/api/v2/status.json", kind: "statuspage" },
    { name: "Clerk", url: "https://status.clerk.com/api/v2/status.json", kind: "statuspage" },
  ];
  for (const { name, url, kind } of statusPages) {
    try {
      const r = await withTimeout(fetch(url), 10000);
      const j = await r.json();
      if (kind === "instatus") {
        const s = j.page?.status ?? "UNKNOWN"; // UP | HASISSUES | UNDERMAINTENANCE
        report(`Status ${name}`, s === "UP", s);
      } else {
        const indicator = j.status?.indicator ?? "unknown"; // none|minor|major|critical
        report(
          `Status ${name}`,
          indicator === "none",
          `${indicator} — ${j.status?.description ?? ""}`
        );
      }
    } catch (e) {
      report(`Status ${name}`, false, e.message);
    }
  }

  console.log("\n=== SAÚDE DOS SERVIÇOS ===");

  // Backend: healthcheck simples (não toca banco).
  try {
    const r = await withTimeout(
      fetch(`${API}/api/health`, { cache: "no-store" }),
      10000
    );
    const j = await r.json().catch(() => ({}));
    report(
      "Backend /api/health",
      r.ok && j.status === "ok",
      `HTTP ${r.status}`
    );
  } catch (e) {
    report("Backend /api/health", false, e.message);
  }

  // Backend tRPC: rota protegida sem token deve dar 401. 401 = backend vivo
  // e middleware de auth funcionando. Outra coisa (500/timeout) = problema.
  try {
    const url =
      `${API}/api/trpc/project.list?batch=1&input=` +
      encodeURIComponent('{"0":{"json":null}}');
    const r = await withTimeout(fetch(url), 10000);
    report(
      "Backend tRPC (auth gate)",
      r.status === 401,
      `HTTP ${r.status} (401 esperado = backend vivo + auth ativo)`
    );
  } catch (e) {
    report("Backend tRPC (auth gate)", false, e.message);
  }

  // MySQL: conexão direta + contagem de usuários (prova que o banco responde).
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    report(
      "MySQL",
      false,
      "DATABASE_URL ausente no .env (use a MYSQL_PUBLIC_URL pra testar de fora)"
    );
  } else if (dbUrl.includes("railway.internal")) {
    report(
      "MySQL",
      false,
      "DATABASE_URL é a interna (mysql.railway.internal) — não resolve de fora. Use MYSQL_PUBLIC_URL."
    );
  } else {
    let conn;
    try {
      conn = await withTimeout(mysql.createConnection(dbUrl), 10000);
      const [[row]] = await conn.query("SELECT COUNT(*) AS users FROM users");
      report("MySQL", true, `conectou — ${row.users} usuários na base`);
    } catch (e) {
      report("MySQL", false, e.code || e.message);
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }

  const down = results.filter(r => !r.ok);
  console.log("");
  if (down.length === 0) {
    console.log("✓ Tudo OK.");
  } else {
    console.log(
      `✗ ${down.length} peça(s) com problema: ${down.map(d => d.name).join(", ")}`
    );
    console.log(
      "  → Se um 'Status <plataforma>' está vermelho, é pane externa: não mexer no código, aguardar."
    );
    console.log(
      "  → Se 'MySQL' está vermelho mas o resto OK: banco travado. No Railway, Redeploy (não Restart)."
    );
  }
  process.exit(down.length === 0 ? 0 : 1);
}

main();
