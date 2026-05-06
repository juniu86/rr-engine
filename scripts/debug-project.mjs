/**
 * Dump completo das execuções de agentes de um projeto, mostrando
 * outputs em JSON pra debugar o que entra no agente que falhou.
 *
 * Uso:
 *   DATABASE_URL='mysql://...' node scripts/debug-project.mjs <projectId>
 */
import mysql from "mysql2/promise";

const projectId = Number(process.argv[2]);
if (!projectId || Number.isNaN(projectId)) {
  console.error("Uso: node scripts/debug-project.mjs <projectId>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não setada");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const [project] = await conn.query("SELECT * FROM projects WHERE id = ?", [projectId]);
if (project.length === 0) {
  console.log(`Projeto ${projectId} não encontrado`);
  await conn.end();
  process.exit(0);
}
console.log("=== PROJETO ===");
console.log(`Nome: ${project[0].name}`);
console.log(`Status: ${project[0].status}`);
console.log(`Memorial (primeiros 300 chars):`, (project[0].memorialDescritivo || "").substring(0, 300));
console.log();

const [executions] = await conn.query(
  "SELECT id, agentType, status, input, output, errors, startedAt, completedAt FROM agent_executions WHERE projectId = ? ORDER BY agentOrder",
  [projectId]
);

for (const e of executions) {
  console.log(`=== ${e.agentType} (id ${e.id}, status ${e.status}) ===`);
  console.log(`Started: ${e.startedAt} | Completed: ${e.completedAt}`);
  if (e.errors) {
    console.log("ERRORS:", JSON.stringify(e.errors, null, 2));
  }
  if (e.output) {
    const out = e.output;
    console.log(`OUTPUT keys:`, Object.keys(out));
    // Mostra valores de chaves que parecem totais/agregados
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (typeof v === "number" || typeof v === "string" || v === null) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      } else if (Array.isArray(v)) {
        console.log(`  ${k}: [${v.length} items]`);
      } else if (typeof v === "object") {
        console.log(`  ${k}: { ${Object.keys(v).join(", ")} }`);
      }
    }
  } else {
    console.log("OUTPUT: null");
  }
  console.log();
}

await conn.end();
