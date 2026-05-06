/**
 * Adiciona 10 créditos de teste pra todos os users já cadastrados no banco.
 * Uso:
 *   DATABASE_URL='mysql://...' node scripts/seed-credits.mjs
 *
 * Útil em dev/staging pra desbloquear criação de projetos sem assinatura
 * Stripe. Em produção real, créditos vêm via webhook Stripe.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não setada");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const [users] = await conn.query("SELECT id, openId, email FROM users");
console.log("Users no banco:", users);

if (users.length === 0) {
  console.log("Nenhum user no banco. Faça login no /dashboard primeiro pra criar o registro.");
  await conn.end();
  process.exit(0);
}

for (const u of users) {
  await conn.query(
    "INSERT INTO budget_credits (userId, creditsTotal, creditsUsed, status) VALUES (?, 10, 0, ?)",
    [u.id, "paid"]
  );
  console.log(`10 créditos adicionados pra user ${u.id} (${u.email || u.openId})`);
}

console.log("Concluído.");
await conn.end();
