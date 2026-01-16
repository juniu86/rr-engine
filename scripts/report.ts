import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users, projects, agentExecutions } from "../drizzle/schema";
import { sql, desc } from "drizzle-orm";

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  // Consulta de usuários
  const usersData = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    loginMethod: users.loginMethod,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.lastSignedIn));

  console.log("=== USUÁRIOS ===");
  console.log(JSON.stringify(usersData, null, 2));

  // Consulta de projetos
  const projectsData = await db.select({
    id: projects.id,
    name: projects.name,
    status: projects.status,
    totalPrice: projects.totalPrice,
    estimatedDuration: projects.estimatedDuration,
    createdAt: projects.createdAt,
    userId: projects.userId,
  }).from(projects).orderBy(desc(projects.createdAt)).limit(30);

  console.log("\n=== PROJETOS ===");
  console.log(JSON.stringify(projectsData, null, 2));

  // Estatísticas por usuário
  const stats = await db.execute(sql`
    SELECT 
      u.id, u.name, u.email, u.lastSignedIn,
      COUNT(DISTINCT p.id) as total_projects,
      SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN p.status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END) as draft
    FROM users u
    LEFT JOIN projects p ON u.id = p.userId
    GROUP BY u.id, u.name, u.email, u.lastSignedIn
    ORDER BY total_projects DESC
  `);

  console.log("\n=== ESTATÍSTICAS POR USUÁRIO ===");
  console.log(JSON.stringify(stats[0], null, 2));

  await connection.end();
}

main().catch(console.error);
