import { drizzle } from "drizzle-orm/mysql2";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { 
  InsertUser, users, 
  projects, InsertProject, Project,
  agentExecutions, InsertAgentExecution,
  budgetItems, InsertBudgetItem,
  logisticsCosts, InsertLogisticsCost,
  scheduleItems, InsertScheduleItem,
  cashFlowItems, InsertCashFlowItem,
  generatedDocuments, InsertGeneratedDocument,
  priceCache, InsertPriceCache,
  companySettings, InsertCompanySettings, CompanySettings
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USER QUERIES ====================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== PROJECT QUERIES ====================
export async function createProject(data: InsertProject): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(projects).values(data);
  return Number(result[0].insertId);
}

export async function getProjectById(id: number): Promise<Project | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function getProjectsByUserId(userId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function updateProject(id: number, data: Partial<InsertProject>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(projects).where(eq(projects.id, id));
}

// ==================== AGENT EXECUTION QUERIES ====================
export async function createAgentExecution(data: InsertAgentExecution): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(agentExecutions).values(data);
  return Number(result[0].insertId);
}

export async function getAgentExecutionsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(agentExecutions).where(eq(agentExecutions.projectId, projectId)).orderBy(agentExecutions.agentOrder);
}

export async function updateAgentExecution(id: number, data: Partial<InsertAgentExecution>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(agentExecutions).set(data).where(eq(agentExecutions.id, id));
}

// ==================== BUDGET ITEM QUERIES ====================
export async function createBudgetItems(items: InsertBudgetItem[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (items.length > 0) {
    await db.insert(budgetItems).values(items);
  }
}

export async function getBudgetItemsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(budgetItems).where(eq(budgetItems.projectId, projectId));
}

export async function deleteBudgetItemsByProjectId(projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(budgetItems).where(eq(budgetItems.projectId, projectId));
}

// ==================== LOGISTICS COST QUERIES ====================
export async function createLogisticsCosts(costs: InsertLogisticsCost[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (costs.length > 0) {
    await db.insert(logisticsCosts).values(costs);
  }
}

export async function getLogisticsCostsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(logisticsCosts).where(eq(logisticsCosts.projectId, projectId));
}

// ==================== SCHEDULE ITEM QUERIES ====================
export async function createScheduleItems(items: InsertScheduleItem[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (items.length > 0) {
    await db.insert(scheduleItems).values(items);
  }
}

export async function getScheduleItemsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
}

// ==================== CASH FLOW QUERIES ====================
export async function createCashFlowItems(items: InsertCashFlowItem[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (items.length > 0) {
    await db.insert(cashFlowItems).values(items);
  }
}

export async function getCashFlowItemsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(cashFlowItems).where(eq(cashFlowItems.projectId, projectId)).orderBy(cashFlowItems.weekNumber);
}

// ==================== GENERATED DOCUMENTS QUERIES ====================
export async function createGeneratedDocument(data: InsertGeneratedDocument): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(generatedDocuments).values(data);
  return Number(result[0].insertId);
}

export async function getGeneratedDocumentsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(generatedDocuments).where(eq(generatedDocuments.projectId, projectId)).orderBy(desc(generatedDocuments.createdAt));
}

// ==================== PRICE CACHE QUERIES ====================
export async function getCachedPrice(source: "sinapi" | "pini" | "mercado", code: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(priceCache)
    .where(and(eq(priceCache.source, source), eq(priceCache.code, code)))
    .limit(1);
  
  return result[0];
}

export async function setCachedPrice(data: InsertPriceCache): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(priceCache).values(data).onDuplicateKeyUpdate({
    set: {
      price: data.price,
      description: data.description,
      rawData: data.rawData,
      expiresAt: data.expiresAt,
    }
  });
}


// ==================== PROJECT REVISION QUERIES ====================
export async function getProjectRevisions(parentProjectId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(projects)
    .where(eq(projects.parentProjectId, parentProjectId))
    .orderBy(desc(projects.revisionNumber));
}

export async function getNextRevisionNumber(projectId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  
  // Buscar o projeto original
  const project = await getProjectById(projectId);
  if (!project) return 1;
  
  // Se o projeto já é uma revisão, buscar o parent
  const parentId = project.parentProjectId || project.id;
  
  // Contar revisões existentes
  const revisions = await db.select().from(projects)
    .where(eq(projects.parentProjectId, parentId));
  
  return revisions.length + 1;
}

export async function createProjectRevision(
  originalProjectId: number, 
  newMemorial: string,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar projeto original
  const originalProject = await getProjectById(originalProjectId);
  if (!originalProject) throw new Error("Projeto original não encontrado");
  
  // Determinar o ID do projeto pai (original)
  const parentId = originalProject.parentProjectId || originalProject.id;
  
  // Buscar o projeto pai para pegar o nome original
  const parentProject = originalProject.parentProjectId 
    ? await getProjectById(originalProject.parentProjectId) 
    : originalProject;
  
  // Calcular próximo número de revisão
  const nextRevision = await getNextRevisionNumber(parentId);
  
  // Nome original (sem sufixo de revisão)
  const originalName = parentProject?.originalName || parentProject?.name || originalProject.name;
  
  // Criar nome da revisão: "Nome Original_REV_01"
  const revisionName = `${originalName}_REV_${String(nextRevision).padStart(2, '0')}`;
  
  // Criar novo projeto como revisão
  const newProjectData: InsertProject = {
    userId,
    name: revisionName,
    description: originalProject.description,
    contractType: originalProject.contractType,
    location: originalProject.location,
    restrictions: originalProject.restrictions,
    memorialDescritivo: newMemorial,
    memorialFileUrl: originalProject.memorialFileUrl,
    status: "draft",
    currentAgentId: 1,
    parentProjectId: parentId,
    revisionNumber: nextRevision,
    originalName: originalName,
  };
  
  const newProjectId = await createProject(newProjectData);
  
  return newProjectId;
}

export async function getAllProjectsWithRevisions(userId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar todos os projetos do usuário
  const allProjects = await db.select().from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
  
  return allProjects;
}


// ==================== COMPANY SETTINGS QUERIES ====================
export async function getCompanySettingsByUserId(userId: number): Promise<CompanySettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
  return result[0];
}

export async function createCompanySettings(data: InsertCompanySettings): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(companySettings).values(data);
  return Number(result[0].insertId);
}

export async function updateCompanySettings(userId: number, data: Partial<InsertCompanySettings>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(companySettings).set(data).where(eq(companySettings.userId, userId));
}

export async function upsertCompanySettings(userId: number, data: Partial<InsertCompanySettings>): Promise<CompanySettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getCompanySettingsByUserId(userId);
  
  if (existing) {
    await updateCompanySettings(userId, data);
    const updated = await getCompanySettingsByUserId(userId);
    return updated!;
  } else {
    await createCompanySettings({ userId, ...data } as InsertCompanySettings);
    const created = await getCompanySettingsByUserId(userId);
    return created!;
  }
}

// Função para obter configurações com valores padrão
export async function getCompanySettingsOrDefault(userId: number): Promise<CompanySettings> {
  const settings = await getCompanySettingsByUserId(userId);
  
  if (settings) {
    return settings;
  }
  
  // Retornar valores padrão se não existir configuração
  return {
    id: 0,
    userId,
    companyName: null,
    cnpj: null,
    priceRegion: "SP",
    taxaLeisSociais: "128.23",
    bdiPercentual: "25.00",
    lucroPercentual: "8.00",
    issPercentual: "5.00",
    pisPercentual: "0.65",
    cofinsPercentual: "3.00",
    irpjPercentual: "1.20",
    csllPercentual: "1.08",
    adminCentralPercentual: "4.00",
    despesasFinanceirasPercentual: "1.00",
    riscosPercentual: "1.00",
    regimeTributario: "lucro_presumido",
    dataReferenciaPrecos: "2025/01",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}


// ==================== ADMIN DASHBOARD QUERIES ====================
export async function getAdminStats() {
  const db = await getDb();
  if (!db) return {
    totalUsers: 0,
    activeUsersLast30Days: 0,
    totalProjects: 0,
    approvedProjects: 0,
    reviewProjects: 0,
    rejectedProjects: 0,
    approvalRate: 0,
    totalBudgetValue: 0,
    averageBudgetValue: 0,
    totalDocuments: 0,
    proposalsGenerated: 0,
    projectsThisWeek: 0,
    documentsThisWeek: 0,
  };
  
  // Total users
  const usersResult = await db.select({ count: sql<number>`count(*)` }).from(users);
  const totalUsers = Number(usersResult[0]?.count || 0);
  
  // Active users in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activeUsersResult = await db.select({ count: sql<number>`count(distinct ${projects.userId})` })
    .from(projects)
    .where(gte(projects.createdAt, thirtyDaysAgo));
  const activeUsersLast30Days = Number(activeUsersResult[0]?.count || 0);
  
  // Projects stats
  const projectsResult = await db.select({ count: sql<number>`count(*)` }).from(projects);
  const totalProjects = Number(projectsResult[0]?.count || 0);
  
  const approvedResult = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.status, "approved"));
  const approvedProjects = Number(approvedResult[0]?.count || 0);
  
  const reviewResult = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.status, "review"));
  const reviewProjects = Number(reviewResult[0]?.count || 0);
  
  const rejectedResult = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.status, "rejected"));
  const rejectedProjects = Number(rejectedResult[0]?.count || 0);
  
  const approvalRate = totalProjects > 0 ? Math.round((approvedProjects / totalProjects) * 100) : 0;
  
  // Budget values from agent executions (comercial output)
  const budgetResult = await db.select({ 
    totalValue: sql<number>`COALESCE(SUM(CAST(JSON_EXTRACT(output, '$.finalPrice') AS DECIMAL(15,2))), 0)`,
    avgValue: sql<number>`COALESCE(AVG(CAST(JSON_EXTRACT(output, '$.finalPrice') AS DECIMAL(15,2))), 0)`,
  })
    .from(agentExecutions)
    .where(and(
      eq(agentExecutions.agentType, "comercial"),
      eq(agentExecutions.status, "completed")
    ));
  const totalBudgetValue = Number(budgetResult[0]?.totalValue || 0);
  const averageBudgetValue = Number(budgetResult[0]?.avgValue || 0);
  
  // Documents count
  const docsResult = await db.select({ count: sql<number>`count(*)` }).from(generatedDocuments);
  const totalDocuments = Number(docsResult[0]?.count || 0);
  
  const proposalsResult = await db.select({ count: sql<number>`count(*)` })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.documentType, "proposta_comercial"));
  const proposalsGenerated = Number(proposalsResult[0]?.count || 0);
  
  // Projects this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const projectsWeekResult = await db.select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(gte(projects.createdAt, oneWeekAgo));
  const projectsThisWeek = Number(projectsWeekResult[0]?.count || 0);
  
  // Documents this week
  const docsWeekResult = await db.select({ count: sql<number>`count(*)` })
    .from(generatedDocuments)
    .where(gte(generatedDocuments.createdAt, oneWeekAgo));
  const documentsThisWeek = Number(docsWeekResult[0]?.count || 0);
  
  return {
    totalUsers,
    activeUsersLast30Days,
    totalProjects,
    approvedProjects,
    reviewProjects,
    rejectedProjects,
    approvalRate,
    totalBudgetValue,
    averageBudgetValue,
    totalDocuments,
    proposalsGenerated,
    projectsThisWeek,
    documentsThisWeek,
  };
}

export async function getAdminUsers() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    createdAt: users.createdAt,
    lastLogin: users.updatedAt,
  }).from(users).orderBy(desc(users.createdAt));
  
  // Get project counts for each user
  const usersWithCounts = await Promise.all(result.map(async (u) => {
    const projectCountResult = await db.select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.userId, u.id));
    const projectCount = Number(projectCountResult[0]?.count || 0);
    
    const approvedCountResult = await db.select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(eq(projects.userId, u.id), eq(projects.status, "approved")));
    const approvedCount = Number(approvedCountResult[0]?.count || 0);
    
    return {
      ...u,
      projectCount,
      approvedCount,
    };
  }));
  
  return usersWithCounts;
}

export async function getAdminProjects() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    id: projects.id,
    name: projects.name,
    status: projects.status,
    createdAt: projects.createdAt,
    userId: projects.userId,
  }).from(projects).orderBy(desc(projects.createdAt)).limit(50);
  
  // Get user names and final values
  const projectsWithDetails = await Promise.all(result.map(async (p) => {
    const userResult = await db.select({ name: users.name }).from(users).where(eq(users.id, p.userId)).limit(1);
    const userName = userResult[0]?.name || "Desconhecido";
    
    // Get final value from comercial agent
    const comercialResult = await db.select({ output: agentExecutions.output })
      .from(agentExecutions)
      .where(and(
        eq(agentExecutions.projectId, p.id),
        eq(agentExecutions.agentType, "comercial"),
        eq(agentExecutions.status, "completed")
      ))
      .limit(1);
    
    let finalValue = null;
    if (comercialResult[0]?.output) {
      const output = comercialResult[0].output as any;
      finalValue = output.finalPrice || null;
    }
    
    return {
      ...p,
      userName,
      finalValue,
    };
  }));
  
  return projectsWithDetails;
}
