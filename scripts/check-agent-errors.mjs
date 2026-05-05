/**
 * Lista as últimas execuções de agentes com falha pra debug.
 * Uso:
 *   DATABASE_URL='mysql://...' node scripts/check-agent-errors.mjs
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não setada");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const [rows] = await conn.query(`
  SELECT
    ae.id,
    ae.projectId,
    ae.agentType,
    ae.status,
    ae.errors,
    ae.input,
    ae.startedAt,
    ae.completedAt,
    p.name AS projectName
  FROM agent_executions ae
  LEFT JOIN projects p ON p.id = ae.projectId
  WHERE ae.status = 'failed'
  ORDER BY ae.id DESC
  LIMIT 10
`);

if (rows.length === 0) {
  console.log("Nenhuma execução de agente com status='failed'.");
} else {
  console.log(`${rows.length} execuções com falha encontradas:\n`);
  for (const r of rows) {
    console.log(`---`);
    console.log(`Project: ${r.projectName} (id ${r.projectId})`);
    console.log(`Agent: ${r.agentType}`);
    console.log(`Started: ${r.startedAt}`);
    console.log(`Completed: ${r.completedAt}`);
    console.log(`Error:`);
    console.log(r.error || "(sem mensagem)");
  }
  console.log(`---`);
}

await conn.end();
