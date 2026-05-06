/**
 * Preenche `projects.totalPrice/totalCostDirect/totalCostIndirect` em
 * projetos antigos que rodaram pipeline antes do fix em confirmProposal.
 *
 * Antes do fix, quando Board pedia confirmação (requiresUserConfirmation)
 * e o user aprovava via UI, o status virava `approved` mas os totais não
 * eram gravados — campos ficavam null.
 *
 * Este script lê o output do agente Comercial (que sempre tem finalPrice
 * correto, fonte de verdade) e popula a tabela projects.
 *
 * Uso:
 *   DATABASE_URL='mysql://...' node scripts/backfill-total-prices.mjs
 *
 * Idempotente: só atualiza projetos com totalPrice null. Roda quantas
 * vezes precisar sem efeito colateral.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não setada");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

// Acha projetos com status final mas totalPrice null
const [projects] = await conn.query(`
  SELECT id, name, status, totalPrice
  FROM projects
  WHERE totalPrice IS NULL
    AND status IN ('approved', 'review', 'pending_confirmation')
`);

if (projects.length === 0) {
  console.log("Nenhum projeto pra fazer backfill. Tudo OK.");
  await conn.end();
  process.exit(0);
}

console.log(`${projects.length} projetos com totalPrice null:\n`);

for (const project of projects) {
  // Pega output do agente comercial
  const [comercialRows] = await conn.query(
    `SELECT output FROM agent_executions
     WHERE projectId = ? AND agentType = 'comercial' AND status = 'completed'
     LIMIT 1`,
    [project.id]
  );

  if (comercialRows.length === 0 || !comercialRows[0].output) {
    console.log(
      `  [${project.id}] ${project.name}: SKIP — sem output do Comercial`
    );
    continue;
  }

  const comercialOutput = comercialRows[0].output;
  const finalPrice = comercialOutput?.finalPrice;
  if (typeof finalPrice !== "number" || finalPrice <= 0) {
    console.log(
      `  [${project.id}] ${project.name}: SKIP — finalPrice ausente ou zero`
    );
    continue;
  }

  // Recalcula custo direto e logística a partir das tabelas persistidas
  const [budgetRows] = await conn.query(
    `SELECT COALESCE(SUM(totalCost), 0) AS total FROM budget_items WHERE projectId = ?`,
    [project.id]
  );
  const [logRows] = await conn.query(
    `SELECT COALESCE(SUM(totalCost), 0) AS total FROM logistics_costs WHERE projectId = ?`,
    [project.id]
  );

  const directCost = Number(budgetRows[0].total) || 0;
  const logisticsCost = Number(logRows[0].total) || 0;

  await conn.query(
    `UPDATE projects
     SET totalPrice = ?, totalCostDirect = ?, totalCostIndirect = ?
     WHERE id = ?`,
    [
      String(Math.round(finalPrice * 100) / 100),
      String(Math.round(directCost * 100) / 100),
      String(Math.round(logisticsCost * 100) / 100),
      project.id,
    ]
  );

  console.log(
    `  [${project.id}] ${project.name}: totalPrice=R$${finalPrice.toFixed(2)}, direto=R$${directCost.toFixed(2)}, logística=R$${logisticsCost.toFixed(2)} ✓`
  );
}

console.log("\nBackfill concluído.");
await conn.end();
