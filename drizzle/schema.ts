import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  json,
  boolean,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/mysql-core";

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
export const projects = mysqlTable(
  "projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    contractType: mysqlEnum("contractType", ["manutencao", "obra"]).notNull(),
    location: varchar("location", { length: 500 }),
    restrictions: text("restrictions"),
    memorialDescritivo: text("memorialDescritivo"),
    memorialFileUrl: varchar("memorialFileUrl", { length: 1000 }),
    status: mysqlEnum("status", [
      "draft",
      "processing",
      "review",
      "approved",
      "rejected",
      "blocked",
      "pending_confirmation",
      "waiting_for_input",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    blockReason: text("blockReason"),
    warningMessages: text("warningMessages"),
    currentAgentId: int("currentAgentId").default(1),
    totalCostDirect: decimal("totalCostDirect", { precision: 15, scale: 2 }),
    totalCostIndirect: decimal("totalCostIndirect", {
      precision: 15,
      scale: 2,
    }),
    totalTaxes: decimal("totalTaxes", { precision: 15, scale: 2 }),
    totalBdi: decimal("totalBdi", { precision: 15, scale: 2 }),
    totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }),
    estimatedDuration: int("estimatedDuration"),
    // Campos de revisão
    parentProjectId: int("parentProjectId"), // ID do projeto original (null se for o original)
    revisionNumber: int("revisionNumber").default(0), // 0 = original, 1 = REV_01, 2 = REV_02, etc.
    originalName: varchar("originalName", { length: 255 }), // Nome original antes das revisões
    // BDI configurável por projeto
    bdiPercentual: decimal("bdiPercentual", { precision: 6, scale: 2 }), // BDI específico do projeto (null = usar configuração da empresa)
    bdiPreset: mysqlEnum("bdiPreset", [
      "padrao",
      "reduzido",
      "majorado",
      "personalizado",
    ]).default("padrao"), // Preset de BDI selecionado

    // Campos de auto-correção financeira do Board
    financialRevisionCycle: int("financialRevisionCycle").default(0), // 0 = sem revisão, 1 = em revisão financeira
    financialRevisionReason: text("financialRevisionReason"), // Motivo da revisão financeira (instruções do Board)
    financialRevisionInstructions: json("financialRevisionInstructions"), // Instruções detalhadas para cada agente
    // Cronograma de pagamento por projeto (sugerido pelo Board ou configurado pelo usuário)
    billingInstallments: json("billingInstallments"), // [{name: "Entrada", percentage: 30}, {name: "Medição", percentage: 40}, {name: "Final", percentage: 30}]
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("projects_userId_idx").on(table.userId),
    index("projects_status_idx").on(table.status),
  ]
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ==================== AGENT EXECUTIONS ====================
export const agentExecutions = mysqlTable(
  "agent_executions",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    agentType: mysqlEnum("agentType", [
      "engenheiro_tecnico",
      "logistica",
      "orcamentista",
      "tributario",
      "comercial",
      "gestao_projetos",
      "financeiro",
      "juridico",
      "board",
      "auditor",
    ]).notNull(),
    agentOrder: int("agentOrder").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "running",
      "completed",
      "failed",
      "needs_review",
      "waiting_for_user_input",
      "cancelled",
    ])
      .default("pending")
      .notNull(),
    input: json("input"),
    output: json("output"),
    errors: json("errors"),
    // Campos para interatividade do agente (v2.1)
    missingInfoRequests: json("missingInfoRequests"), // Lista de MissingInfoRequest quando status = waiting_for_user_input
    userResponses: json("userResponses"), // Respostas do usuário (Record<string, string | number>)
    iterationCount: int("iterationCount").default(0), // Número de iterações de solicitação
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("agent_executions_projectId_idx").on(table.projectId),
    index("agent_executions_agentType_idx").on(table.agentType),
  ]
);

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = typeof agentExecutions.$inferInsert;

// ==================== AGENT LLM CALLS (telemetria de tokens/custo) ====================
// Uma linha por chamada a invokeLLM. Múltiplas linhas por agentExecution
// (chunking, retries). FK opcional para agentExecutionId — abre espaço
// para chamadas LLM fora do pipeline de agentes.
export const agentLlmCalls = mysqlTable(
  "agent_llm_calls",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    agentExecutionId: int("agentExecutionId").references(
      () => agentExecutions.id
    ),
    agentType: mysqlEnum("agentType", [
      "engenheiro_tecnico",
      "logistica",
      "orcamentista",
      "tributario",
      "comercial",
      "gestao_projetos",
      "financeiro",
      "juridico",
      "board",
      "auditor",
    ]).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    promptTokens: int("promptTokens").notNull().default(0),
    completionTokens: int("completionTokens").notNull().default(0),
    totalTokens: int("totalTokens").notNull().default(0),
    costUsd: decimal("costUsd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    costBrl: decimal("costBrl", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    latencyMs: int("latencyMs").notNull().default(0),
    finishReason: varchar("finishReason", { length: 30 }),
    attemptNumber: int("attemptNumber").notNull().default(1),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("agent_llm_calls_projectId_idx").on(table.projectId),
    index("agent_llm_calls_agentType_idx").on(table.agentType),
    index("agent_llm_calls_agentExecutionId_idx").on(table.agentExecutionId),
    index("agent_llm_calls_createdAt_idx").on(table.createdAt),
  ]
);

export type AgentLlmCall = typeof agentLlmCalls.$inferSelect;
export type InsertAgentLlmCall = typeof agentLlmCalls.$inferInsert;

// ==================== DETERMINISTIC ENGINE RUNS (validação cruzada P0.1) ====================
// Uma linha por execução do engine determinístico. Compara o total LLM com
// o total calculado de forma independente para detectar alucinação.
// llmTotal/divergencePercent/divergenceClass são preenchidos APÓS o Auditor
// rodar (recordDivergence).
export const deterministicEngineRuns = mysqlTable(
  "deterministic_engine_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    totalDirectCost: decimal("totalDirectCost", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalLogisticsCost: decimal("totalLogisticsCost", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalBaseCost: decimal("totalBaseCost", {
      precision: 12,
      scale: 2,
    }).notNull(),
    totalItemsParsed: int("totalItemsParsed").notNull(),
    warningsJson: json("warningsJson"),
    rawOutputJson: json("rawOutputJson"),
    llmTotal: decimal("llmTotal", { precision: 12, scale: 2 }),
    divergencePercent: decimal("divergencePercent", { precision: 6, scale: 2 }),
    // 'info' | 'warning' | 'critical' | null
    divergenceClass: varchar("divergenceClass", { length: 20 }),
    latencyMs: int("latencyMs").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("deterministic_engine_runs_projectId_idx").on(table.projectId),
    index("deterministic_engine_runs_createdAt_idx").on(table.createdAt),
  ]
);

export type DeterministicEngineRun =
  typeof deterministicEngineRuns.$inferSelect;
export type InsertDeterministicEngineRun =
  typeof deterministicEngineRuns.$inferInsert;

// ==================== BUDGET ITEMS ====================
export const budgetItems = mysqlTable(
  "budget_items",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    parentId: int("parentId"),
    category: varchar("category", { length: 100 }),
    code: varchar("code", { length: 50 }),
    description: text("description").notNull(),
    unit: varchar("unit", { length: 20 }),
    quantity: decimal("quantity", { precision: 15, scale: 4 }),
    unitCostMaterial: decimal("unitCostMaterial", { precision: 15, scale: 2 }),
    unitCostLabor: decimal("unitCostLabor", { precision: 15, scale: 2 }),
    unitCostLogistics: decimal("unitCostLogistics", {
      precision: 15,
      scale: 2,
    }),
    unitCostTotal: decimal("unitCostTotal", { precision: 15, scale: 2 }),
    totalCost: decimal("totalCost", { precision: 15, scale: 2 }),
    taxType: mysqlEnum("taxType", ["iss", "icms", "both", "none"]).default(
      "none"
    ),
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
  },
  table => [index("budget_items_projectId_idx").on(table.projectId)]
);

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

// ==================== LOGISTICS COSTS ====================
export const logisticsCosts = mysqlTable(
  "logistics_costs",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    category: mysqlEnum("category", [
      "frete",
      "bota_fora",
      "deslocamento",
      "hospedagem",
      "alimentacao",
      "equipamentos",
      "outros",
    ]).notNull(),
    description: text("description").notNull(),
    quantity: decimal("quantity", { precision: 15, scale: 4 }),
    unit: varchar("unit", { length: 20 }),
    unitCost: decimal("unitCost", { precision: 15, scale: 2 }),
    totalCost: decimal("totalCost", { precision: 15, scale: 2 }),
    source: varchar("source", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("logistics_costs_projectId_idx").on(table.projectId)]
);

export type LogisticsCost = typeof logisticsCosts.$inferSelect;
export type InsertLogisticsCost = typeof logisticsCosts.$inferInsert;

// ==================== SCHEDULE ITEMS ====================
export const scheduleItems = mysqlTable(
  "schedule_items",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    budgetItemId: int("budgetItemId"),
    phase: varchar("phase", { length: 100 }),
    description: text("description").notNull(),
    startWeek: int("startWeek"),
    endWeek: int("endWeek"),
    duration: int("duration"),
    percentComplete: decimal("percentComplete", {
      precision: 5,
      scale: 2,
    }).default("0"),
    dependencies: json("dependencies"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("schedule_items_projectId_idx").on(table.projectId)]
);

export type ScheduleItem = typeof scheduleItems.$inferSelect;
export type InsertScheduleItem = typeof scheduleItems.$inferInsert;

// ==================== CASH FLOW ====================
export const cashFlowItems = mysqlTable(
  "cash_flow_items",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    weekNumber: int("weekNumber").notNull(),
    plannedExpense: decimal("plannedExpense", { precision: 15, scale: 2 }),
    plannedIncome: decimal("plannedIncome", { precision: 15, scale: 2 }),
    cumulativeExpense: decimal("cumulativeExpense", {
      precision: 15,
      scale: 2,
    }),
    cumulativeIncome: decimal("cumulativeIncome", { precision: 15, scale: 2 }),
    cashBalance: decimal("cashBalance", { precision: 15, scale: 2 }),
    hasAlert: boolean("hasAlert").default(false),
    alertMessage: text("alertMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("cash_flow_items_projectId_idx").on(table.projectId)]
);

export type CashFlowItem = typeof cashFlowItems.$inferSelect;
export type InsertCashFlowItem = typeof cashFlowItems.$inferInsert;

// ==================== GENERATED DOCUMENTS ====================
export const generatedDocuments = mysqlTable(
  "generated_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    documentType: mysqlEnum("documentType", [
      "proposta_comercial",
      "memoria_calculo",
      "cronograma",
    ]).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
    fileKey: varchar("fileKey", { length: 500 }).notNull(),
    version: int("version").default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("generated_documents_projectId_idx").on(table.projectId)]
);

export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;

// ==================== PRICE DATABASE ENTRIES (P1.4) ====================
// Tabela versionada de preços SINAPI/PINI. Substitui as constantes
// SINAPI_DB e PINI_DATABASE como fonte de verdade. Permite múltiplas
// referenceDate por código — apenas a mais recente fica isActive=true.
export const priceDatabaseEntries = mysqlTable(
  "price_database_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    source: varchar("source", { length: 20 }).notNull(), // 'sinapi' | 'pini'
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    price: decimal("price", { precision: 12, scale: 4 }).notNull(),
    state: varchar("state", { length: 5 }), // SP, RJ, etc. NULL = sem regionalização
    category: varchar("category", { length: 100 }),
    referenceDate: date("referenceDate").notNull(),
    componentsJson: json("componentsJson"), // decomposição mão de obra/material/equipamento
    /** Origem da última atualização (orcamentor.com, tcpoweb.com.br, manual_seed). */
    dataSource: varchar("dataSource", { length: 50 }),
    scrapedAt: timestamp("scrapedAt").defaultNow().notNull(),
    isActive: boolean("isActive").default(true).notNull(),
  },
  table => [
    // uniqueIndex permite múltiplas versões da mesma composição em datas diferentes.
    uniqueIndex("price_db_uq_source_code_state_date").on(
      table.source,
      table.code,
      table.state,
      table.referenceDate
    ),
    index("price_db_search_idx").on(table.source, table.state, table.isActive),
    index("price_db_description_idx").on(table.description),
    index("price_db_active_source_idx").on(table.isActive, table.source),
  ]
);

export type PriceDatabaseEntry = typeof priceDatabaseEntries.$inferSelect;
export type InsertPriceDatabaseEntry = typeof priceDatabaseEntries.$inferInsert;

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
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ])
    .default("SP")
    .notNull(),

  // Taxa de Leis Sociais (LS) - Encargos Trabalhistas
  // Valores típicos: 80% a 130% dependendo do regime tributário
  taxaLeisSociais: decimal("taxaLeisSociais", { precision: 6, scale: 2 })
    .default("128.23")
    .notNull(),

  // BDI - Bonificação e Despesas Indiretas
  // Composição típica: Administração Central + Despesas Financeiras + Riscos + Tributos + Lucro
  bdiPercentual: decimal("bdiPercentual", { precision: 6, scale: 2 })
    .default("25.00")
    .notNull(),

  // Lucro Esperado (já incluso no BDI, mas editável separadamente)
  lucroPercentual: decimal("lucroPercentual", { precision: 6, scale: 2 })
    .default("8.00")
    .notNull(),

  // Tributos (composição detalhada)
  // ISS - Imposto Sobre Serviços (2% a 5%)
  issPercentual: decimal("issPercentual", { precision: 6, scale: 2 })
    .default("5.00")
    .notNull(),

  // PIS - Programa de Integração Social (0.65% ou 1.65%)
  pisPercentual: decimal("pisPercentual", { precision: 6, scale: 2 })
    .default("0.65")
    .notNull(),

  // COFINS - Contribuição para Financiamento da Seguridade Social (3% ou 7.6%)
  cofinsPercentual: decimal("cofinsPercentual", { precision: 6, scale: 2 })
    .default("3.00")
    .notNull(),

  // IRPJ - Imposto de Renda Pessoa Jurídica (1.2% sobre faturamento presumido)
  irpjPercentual: decimal("irpjPercentual", { precision: 6, scale: 2 })
    .default("1.20")
    .notNull(),

  // CSLL - Contribuição Social sobre Lucro Líquido (1.08% sobre faturamento presumido)
  csllPercentual: decimal("csllPercentual", { precision: 6, scale: 2 })
    .default("1.08")
    .notNull(),

  // Administração Central (%)
  adminCentralPercentual: decimal("adminCentralPercentual", {
    precision: 6,
    scale: 2,
  })
    .default("4.00")
    .notNull(),

  // Despesas Financeiras (%)
  despesasFinanceirasPercentual: decimal("despesasFinanceirasPercentual", {
    precision: 6,
    scale: 2,
  })
    .default("1.00")
    .notNull(),

  // Riscos e Imprevistos (%)
  riscosPercentual: decimal("riscosPercentual", { precision: 6, scale: 2 })
    .default("1.00")
    .notNull(),

  // Seguros (%) — componente S da fórmula NBR 12721
  seguroPercentual: decimal("seguroPercentual", { precision: 6, scale: 2 })
    .default("0.80")
    .notNull(),

  // Garantias (%) — componente G da fórmula NBR 12721
  garantiaPercentual: decimal("garantiaPercentual", { precision: 6, scale: 2 })
    .default("0.40")
    .notNull(),

  // Override manual da alíquota I (tributos sobre faturamento, %).
  // Quando NULL, o sistema resolve I pelo regime fiscal:
  //   - Simples Nacional: tabela do Anexo IV pela faixa
  //   - Lucro Presumido/Real: ISS + PIS + COFINS + IRPJ + CSLL
  // Permite empresas com benefício fiscal específico ajustarem sem mexer
  // nos campos individuais.
  aliquotaTributosOverride: decimal("aliquotaTributosOverride", {
    precision: 6,
    scale: 2,
  }),

  // Regime Tributário
  regimeTributario: mysqlEnum("regimeTributario", [
    "simples_nacional",
    "lucro_presumido",
    "lucro_real",
  ])
    .default("lucro_presumido")
    .notNull(),

  // P1.5.1: faixa do Simples Nacional (1-6). NULL para regimes diferentes.
  // Validação cruzada (regime=simples_nacional → faixa obrigatória) é feita
  // no input Zod do tRPC e em isCompleteTaxSettings (shared/types.ts).
  faixaSimples: int("faixaSimples"),

  // Data de referência dos preços (formato YYYY/MM)
  dataReferenciaPrecos: varchar("dataReferenciaPrecos", { length: 10 }).default(
    "2025/01"
  ),

  // Configurações de Faturamento - Parcelas dinâmicas
  // JSON array: [{name: "Entrada", percentage: 40}, {name: "Final", percentage: 60}]
  billingInstallments: json("billingInstallments"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;

// ==================== AGENT INTERACTIONS (Histórico de Perguntas/Respostas) ====================
// Armazena o histórico completo de interações entre agentes e usuários
export const agentInteractions = mysqlTable(
  "agent_interactions",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    agentExecutionId: int("agentExecutionId")
      .notNull()
      .references(() => agentExecutions.id),
    agentType: mysqlEnum("agentType", [
      "engenheiro_tecnico",
      "logistica",
      "orcamentista",
      "tributario",
      "comercial",
      "gestao_projetos",
      "financeiro",
      "juridico",
      "board",
      "auditor",
    ]).notNull(),
    iterationNumber: int("iterationNumber").notNull(), // 1, 2, 3...

    // Perguntas feitas pelo agente nesta iteração
    questions: json("questions"), // Array de MissingInfoRequest

    // Respostas do usuário para esta iteração
    responses: json("responses"), // Record<string, string | number>

    // Contexto adicional
    reasonForQuestions: text("reasonForQuestions"), // Por que o agente precisou perguntar

    // Timestamps
    questionedAt: timestamp("questionedAt").defaultNow().notNull(), // Quando as perguntas foram feitas
    respondedAt: timestamp("respondedAt"), // Quando o usuário respondeu (null se ainda não respondeu)

    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("agent_interactions_projectId_idx").on(table.projectId),
    index("agent_interactions_executionId_idx").on(table.agentExecutionId),
  ]
);

export type AgentInteraction = typeof agentInteractions.$inferSelect;
export type InsertAgentInteraction = typeof agentInteractions.$inferInsert;

// ==================== STRIPE: SUBSCRIPTIONS & PAYMENTS ====================
// Armazena apenas IDs do Stripe + dados de negócio locais (seguindo princípio de não duplicar)
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),

    // Status local cacheado (atualizado via webhook)
    status: mysqlEnum("status", [
      "active",
      "canceled",
      "past_due",
      "trialing",
      "incomplete",
    ])
      .default("incomplete")
      .notNull(),

    // Plano. Sprint 5 (P1.7): tiers `starter`/`pro`/`business`. Legados
    // `mensal`/`avulso`/`free` mantidos no enum para preservar linhas
    // antigas de produção até migração final.
    plan: mysqlEnum("plan", [
      "mensal",
      "avulso",
      "free",
      "starter",
      "pro",
      "business",
    ])
      .default("free")
      .notNull(),

    // Controle de uso mensal. Para `business`, quotaLimit=0 sinaliza
    // ilimitado (canCreateBudget trata como bypass).
    quotaUsed: int("quotaUsed").default(0).notNull(),
    quotaLimit: int("quotaLimit").default(0).notNull(),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),

    // Sprint 5 (P1.7): cap por orçamento. Comparar com comercial.finalPrice
    // ao final do pipeline e gerar warning não-bloqueante se exceder.
    // null = sem cap (Business / planos legados).
    obraValueCap: decimal("obraValueCap", { precision: 15, scale: 2 }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("subscriptions_userId_idx").on(table.userId)]
);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// Créditos avulsos (pagamento por orçamento)
export const budgetCredits = mysqlTable(
  "budget_credits",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
    stripeSessionId: varchar("stripeSessionId", { length: 255 }),

    // Quantidade de créditos comprados e usados
    creditsTotal: int("creditsTotal").default(1).notNull(),
    creditsUsed: int("creditsUsed").default(0).notNull(),

    // Status do pagamento (cacheado via webhook)
    status: mysqlEnum("status", ["pending", "paid", "failed", "refunded"])
      .default("pending")
      .notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("budget_credits_userId_idx").on(table.userId)]
);

export type BudgetCredit = typeof budgetCredits.$inferSelect;
export type InsertBudgetCredit = typeof budgetCredits.$inferInsert;
