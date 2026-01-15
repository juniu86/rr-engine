import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, boolean } from "drizzle-orm/mysql-core";

// ==================== USERS ====================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ==================== PROJECTS ====================
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  contractType: mysqlEnum("contractType", ["manutencao", "obra"]).notNull(),
  location: varchar("location", { length: 500 }),
  restrictions: text("restrictions"),
  memorialDescritivo: text("memorialDescritivo"),
  memorialFileUrl: varchar("memorialFileUrl", { length: 1000 }),
  status: mysqlEnum("status", ["draft", "processing", "review", "approved", "rejected"]).default("draft").notNull(),
  currentAgentId: int("currentAgentId").default(1),
  totalCostDirect: decimal("totalCostDirect", { precision: 15, scale: 2 }),
  totalCostIndirect: decimal("totalCostIndirect", { precision: 15, scale: 2 }),
  totalTaxes: decimal("totalTaxes", { precision: 15, scale: 2 }),
  totalBdi: decimal("totalBdi", { precision: 15, scale: 2 }),
  totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }),
  estimatedDuration: int("estimatedDuration"),
  // Campos de revisão
  parentProjectId: int("parentProjectId"), // ID do projeto original (null se for o original)
  revisionNumber: int("revisionNumber").default(0), // 0 = original, 1 = REV_01, 2 = REV_02, etc.
  originalName: varchar("originalName", { length: 255 }), // Nome original antes das revisões
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ==================== AGENT EXECUTIONS ====================
export const agentExecutions = mysqlTable("agent_executions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  agentType: mysqlEnum("agentType", [
    "engenheiro_tecnico",
    "logistica",
    "orcamentista",
    "tributario",
    "comercial",
    "gestao_projetos",
    "financeiro",
    "juridico",
    "board"
  ]).notNull(),
  agentOrder: int("agentOrder").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "needs_review"]).default("pending").notNull(),
  input: json("input"),
  output: json("output"),
  errors: json("errors"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = typeof agentExecutions.$inferInsert;

// ==================== BUDGET ITEMS ====================
export const budgetItems = mysqlTable("budget_items", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  parentId: int("parentId"),
  category: varchar("category", { length: 100 }),
  code: varchar("code", { length: 50 }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }),
  unitCostMaterial: decimal("unitCostMaterial", { precision: 15, scale: 2 }),
  unitCostLabor: decimal("unitCostLabor", { precision: 15, scale: 2 }),
  unitCostLogistics: decimal("unitCostLogistics", { precision: 15, scale: 2 }),
  unitCostTotal: decimal("unitCostTotal", { precision: 15, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }),
  taxType: mysqlEnum("taxType", ["iss", "icms", "both", "none"]),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }),
  bdiAmount: decimal("bdiAmount", { precision: 15, scale: 2 }),
  finalPrice: decimal("finalPrice", { precision: 15, scale: 2 }),
  source: varchar("source", { length: 100 }),
  sourceCode: varchar("sourceCode", { length: 50 }),
  sourceDate: varchar("sourceDate", { length: 20 }),
  isPendingReview: boolean("isPendingReview").default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

// ==================== LOGISTICS COSTS ====================
export const logisticsCosts = mysqlTable("logistics_costs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  category: mysqlEnum("category", ["frete", "bota_fora", "deslocamento", "hospedagem", "alimentacao", "equipamentos", "outros"]).notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }),
  unit: varchar("unit", { length: 20 }),
  unitCost: decimal("unitCost", { precision: 15, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 15, scale: 2 }),
  source: varchar("source", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LogisticsCost = typeof logisticsCosts.$inferSelect;
export type InsertLogisticsCost = typeof logisticsCosts.$inferInsert;

// ==================== SCHEDULE ITEMS ====================
export const scheduleItems = mysqlTable("schedule_items", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  budgetItemId: int("budgetItemId"),
  phase: varchar("phase", { length: 100 }),
  description: text("description").notNull(),
  startWeek: int("startWeek"),
  endWeek: int("endWeek"),
  duration: int("duration"),
  percentComplete: decimal("percentComplete", { precision: 5, scale: 2 }).default("0"),
  dependencies: json("dependencies"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduleItem = typeof scheduleItems.$inferSelect;
export type InsertScheduleItem = typeof scheduleItems.$inferInsert;

// ==================== CASH FLOW ====================
export const cashFlowItems = mysqlTable("cash_flow_items", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  weekNumber: int("weekNumber").notNull(),
  plannedExpense: decimal("plannedExpense", { precision: 15, scale: 2 }),
  plannedIncome: decimal("plannedIncome", { precision: 15, scale: 2 }),
  cumulativeExpense: decimal("cumulativeExpense", { precision: 15, scale: 2 }),
  cumulativeIncome: decimal("cumulativeIncome", { precision: 15, scale: 2 }),
  cashBalance: decimal("cashBalance", { precision: 15, scale: 2 }),
  hasAlert: boolean("hasAlert").default(false),
  alertMessage: text("alertMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CashFlowItem = typeof cashFlowItems.$inferSelect;
export type InsertCashFlowItem = typeof cashFlowItems.$inferInsert;

// ==================== GENERATED DOCUMENTS ====================
export const generatedDocuments = mysqlTable("generated_documents", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  documentType: mysqlEnum("documentType", ["proposta_comercial", "memoria_calculo"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  version: int("version").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;

// ==================== PRICE CACHE ====================
export const priceCache = mysqlTable("price_cache", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["sinapi", "pini", "mercado"]).notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 20 }),
  price: decimal("price", { precision: 15, scale: 2 }),
  region: varchar("region", { length: 100 }),
  referenceDate: varchar("referenceDate", { length: 20 }),
  rawData: json("rawData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type PriceCache = typeof priceCache.$inferSelect;
export type InsertPriceCache = typeof priceCache.$inferInsert;

// ==================== COMPANY SETTINGS ====================
// Configurações personalizadas de impostos e BDI por usuário/empresa
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // Um registro por usuário
  
  // Informações da Empresa
  companyName: varchar("companyName", { length: 255 }),
  cnpj: varchar("cnpj", { length: 20 }),
  
  // Região de Preços (SINAPI/PINI)
  priceRegion: mysqlEnum("priceRegion", [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ]).default("SP").notNull(),
  
  // Taxa de Leis Sociais (LS) - Encargos Trabalhistas
  // Valores típicos: 80% a 130% dependendo do regime tributário
  taxaLeisSociais: decimal("taxaLeisSociais", { precision: 6, scale: 2 }).default("128.23").notNull(),
  
  // BDI - Bonificação e Despesas Indiretas
  // Composição típica: Administração Central + Despesas Financeiras + Riscos + Tributos + Lucro
  bdiPercentual: decimal("bdiPercentual", { precision: 6, scale: 2 }).default("25.00").notNull(),
  
  // Lucro Esperado (já incluso no BDI, mas editável separadamente)
  lucroPercentual: decimal("lucroPercentual", { precision: 6, scale: 2 }).default("8.00").notNull(),
  
  // Tributos (composição detalhada)
  // ISS - Imposto Sobre Serviços (2% a 5%)
  issPercentual: decimal("issPercentual", { precision: 6, scale: 2 }).default("5.00").notNull(),
  
  // PIS - Programa de Integração Social (0.65% ou 1.65%)
  pisPercentual: decimal("pisPercentual", { precision: 6, scale: 2 }).default("0.65").notNull(),
  
  // COFINS - Contribuição para Financiamento da Seguridade Social (3% ou 7.6%)
  cofinsPercentual: decimal("cofinsPercentual", { precision: 6, scale: 2 }).default("3.00").notNull(),
  
  // IRPJ - Imposto de Renda Pessoa Jurídica (1.2% sobre faturamento presumido)
  irpjPercentual: decimal("irpjPercentual", { precision: 6, scale: 2 }).default("1.20").notNull(),
  
  // CSLL - Contribuição Social sobre Lucro Líquido (1.08% sobre faturamento presumido)
  csllPercentual: decimal("csllPercentual", { precision: 6, scale: 2 }).default("1.08").notNull(),
  
  // Administração Central (%)
  adminCentralPercentual: decimal("adminCentralPercentual", { precision: 6, scale: 2 }).default("4.00").notNull(),
  
  // Despesas Financeiras (%)
  despesasFinanceirasPercentual: decimal("despesasFinanceirasPercentual", { precision: 6, scale: 2 }).default("1.00").notNull(),
  
  // Riscos e Imprevistos (%)
  riscosPercentual: decimal("riscosPercentual", { precision: 6, scale: 2 }).default("1.00").notNull(),
  
  // Regime Tributário
  regimeTributario: mysqlEnum("regimeTributario", [
    "simples_nacional",
    "lucro_presumido",
    "lucro_real"
  ]).default("lucro_presumido").notNull(),
  
  // Data de referência dos preços (formato YYYY/MM)
  dataReferenciaPrecos: varchar("dataReferenciaPrecos", { length: 10 }).default("2025/01"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;
