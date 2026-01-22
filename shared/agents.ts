// Agent Types
export type AgentType = 
  | "engenheiro_tecnico"
  | "orcamentista"
  | "logistica"
  | "tributario"
  | "comercial"
  | "gestao_projetos"
  | "financeiro"
  | "juridico"
  | "board"
  | "auditor";

export const AGENT_ORDER: Record<AgentType, number> = {
  engenheiro_tecnico: 1,
  orcamentista: 2,
  logistica: 3,
  tributario: 4,
  comercial: 5,
  gestao_projetos: 6,
  financeiro: 7,
  juridico: 8,
  board: 9,
  auditor: 10,
};

export const AGENT_NAMES: Record<AgentType, string> = {
  engenheiro_tecnico: "Engenheiro Técnico",
  orcamentista: "Orçamentista & Suprimentos",
  logistica: "Logística e Mobilização",
  tributario: "Tributário",
  comercial: "Comercial",
  gestao_projetos: "Gestão de Projetos",
  financeiro: "Financeiro",
  juridico: "Jurídico",
  board: "Board de Aprovação",
  auditor: "Auditor de Consistência",
};

export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  engenheiro_tecnico: "Traduz o Memorial Descritivo em tarefas de engenharia específicas baseadas em NBRs",
  orcamentista: "Precifica com realidade de mercado usando SINAPI, PINI e cotações atuais",
  logistica: "Calcula custos invisíveis de execução: fretes, bota-fora, deslocamento, hospedagem",
  tributario: "Otimiza a classificação fiscal entre Serviço (ISS) e Material (ICMS)",
  comercial: "Define o preço de venda aplicando BDI adequado ao tipo de contrato",
  gestao_projetos: "Estima tempo de execução e cria cronograma físico",
  financeiro: "Analisa fluxo de caixa e identifica necessidade de adiantamento",
  juridico: "Redige proposta técnica com cláusulas de proteção",
  board: "Auditoria geral e aprovação final com consenso unânime",
  auditor: "Validação matemática e consistência entre todos os documentos",
};

// Contract Types (deprecated - BDI agora vem das configurações da empresa)
export type ContractType = "manutencao" | "obra";

// Tax Types
export type TaxType = "iss" | "icms" | "both" | "none";

// Budget Item Sources
export type PriceSource = "sinapi" | "pini" | "mercado";

// Project Status
export type ProjectStatus = "draft" | "processing" | "review" | "approved" | "rejected";

// Agent Execution Status
export type AgentStatus = "pending" | "running" | "completed" | "failed" | "needs_review" | "waiting_for_user_input";

// ========================================
// INTERATIVIDADE DO AGENTE (v2.1)
// ========================================

/**
 * Tipo de input esperado para uma solicitação de informação faltante
 */
export type MissingInfoInputType = "number" | "text" | "select" | "textarea";

/**
 * Representa uma solicitação de informação faltante que o agente precisa do usuário
 */
export interface MissingInfoRequest {
  /** ID único para o campo, ex: "area_pintura_sala" */
  fieldId: string;
  /** A pergunta para o usuário, ex: "Qual a área em m² da parede da sala a ser pintada?" */
  question: string;
  /** Tipo de input esperado */
  type: MissingInfoInputType;
  /** Unidade de medida, ex: "m²" */
  unit?: string;
  /** Opções para o tipo 'select' */
  options?: string[];
  /** Valor padrão sugerido */
  defaultValue?: string | number;
  /** Se o campo é obrigatório */
  required?: boolean;
  /** Contexto adicional para ajudar o usuário */
  hint?: string;
}

/**
 * Resposta genérica de um agente que pode pausar para solicitar informações
 */
export interface AgentResponse<T> {
  /** Status da execução do agente */
  status: "completed" | "waiting_for_user_input" | "failed";
  /** Dados de saída quando status = "completed" */
  data?: T;
  /** Lista de informações faltantes quando status = "waiting_for_user_input" */
  missingInfoRequests?: MissingInfoRequest[];
  /** Mensagem de erro quando status = "failed" */
  error?: string;
  /** Mensagem explicativa para o usuário */
  message?: string;
}

/**
 * Respostas do usuário para as solicitações de informação faltante
 * Mapeamento de fieldId para o valor fornecido
 */
export type UserResponses = Record<string, string | number>;

/**
 * Estado persistido do agente para retomada
 */
export interface AgentState {
  /** Tipo do agente que está aguardando input */
  agentType: AgentType;
  /** Solicitações de informação pendentes */
  pendingRequests: MissingInfoRequest[];
  /** Respostas já fornecidas pelo usuário */
  userResponses: UserResponses;
  /** Número de iterações de solicitação (para evitar loops infinitos) */
  iterationCount: number;
  /** Timestamp da última atualização */
  updatedAt: number;
}

// ========================================
// FIM INTERATIVIDADE DO AGENTE
// ========================================

// Memorial Item (parsed from memorial descritivo)
export interface MemorialItem {
  description: string;
  quantity?: number;
  unit?: string;
  specifications?: string;
  nbrReference?: string;
  isPendingVistoria: boolean;
}

// Budget Item with full details
export interface BudgetItemDetail {
  id: number;
  category: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitCostMaterial: number;
  unitCostLabor: number;
  unitCostLogistics: number;
  unitCostTotal: number;
  totalCost: number;
  taxType: TaxType;
  taxAmount: number;
  bdiAmount: number;
  finalPrice: number;
  source: PriceSource;
  sourceCode: string;
  sourceDate: string;
}

// Agent Input/Output Types
export interface EngenheiroTecnicoInput {
  memorialDescritivo: string;
  location: string;
  restrictions: string;
  /** Respostas do usuário para dados faltantes (v2.1) */
  userResponses?: UserResponses;
}

export interface EngenheiroTecnicoOutput {
  items: MemorialItem[];
  pendingItems: string[];
  nbrReferences: string[];
  criticalNotes: string[];
  /** Solicitações de informação faltante para interatividade (v2.1) */
  missingInfoRequests?: MissingInfoRequest[];
  /** Status da análise: completed = dados suficientes, waiting = precisa de mais dados */
  analysisStatus?: "completed" | "waiting_for_user_input";
  /** Grupos de serviços processados */
  groupsProcessed?: string[];
  /** Total de itens extraídos */
  totalItemsExtracted?: number;
}

export interface LogisticaInput {
  items: MemorialItem[];
  location: string;
  restrictions: string;
  estimatedDuration: number;
}

export interface LogisticaOutput {
  costs: {
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    isOptional?: boolean;
  }[];
  optionalItems: {
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    reason: string;
  }[];
  totalLogisticsCost: number;
  totalOptionalCost: number;
  restrictions: string[];
}

export interface OrcamentistaInput {
  items: MemorialItem[];
  logisticsCosts: LogisticaOutput;
  region: string;
}

export interface OrcamentistaOutput {
  budgetItems: BudgetItemDetail[];
  totalDirectCost: number;
  totalIndirectCost: number;
  curvaAItems: string[];
  curvaCItems: string[];
}

export interface TributarioInput {
  budgetItems: BudgetItemDetail[];
  contractType?: ContractType;
}

export interface TributarioOutput {
  classifiedItems: {
    itemId: number;
    taxType: TaxType;
    taxAmount: number;
    retentions: string[];
  }[];
  totalTaxes: number;
  alerts: string[];
}

export interface ComercialInput {
  budgetItems: BudgetItemDetail[];
  totalDirectCost: number;
  totalIndirectCost: number;
  totalTaxes: number;
  contractType?: ContractType;
  logisticsComplexity: "low" | "medium" | "high";
  fiscalRisk: "low" | "medium" | "high";
}

export interface ComercialOutput {
  baseBdi: number;
  adjustedBdi: number;
  bdiJustification: string;
  totalBdiAmount: number;
  finalPrice: number;
  pricePerUnit: Record<string, number>;
}

export interface GestaoProjInput {
  budgetItems: BudgetItemDetail[];
  logisticsCosts: LogisticaOutput;
  restrictions: string;
}

export interface GestaoProjOutput {
  scheduleItems: {
    phase: string;
    description: string;
    startWeek: number;
    endWeek: number;
    duration: number;
  }[];
  totalDuration: number;
  criticalPath: string[];
  milestones: { week: number; description: string }[];
}

export interface FinanceiroInput {
  scheduleItems: GestaoProjOutput["scheduleItems"];
  budgetItems: BudgetItemDetail[];
  totalPrice: number;
  paymentTerms: string;
}

export interface FinanceiroOutput {
  cashFlow: {
    week: number;
    expense: number;
    income: number;
    balance: number;
  }[];
  maxExposure: number;
  needsAdvance: boolean;
  suggestedAdvance: number;
  alerts: string[];
  // Campos de margem líquida calculados programaticamente (não pela LLM)
  netMargin?: number; // Preço de venda - Custo base - Impostos
  netMarginPercent?: number; // (netMargin / Preço de venda) * 100
  grossMargin?: number; // Preço de venda - Custo base
  grossMarginPercent?: number; // (grossMargin / Preço de venda) * 100
}

export interface JuridicoInput {
  projectName: string;
  contractType?: ContractType;
  totalPrice: number;
  paymentTerms: string;
  duration: number;
  restrictions: string[];
  financialAlerts: string[];
}

export interface JuridicoOutput {
  proposalText: string;
  clauses: {
    title: string;
    content: string;
  }[];
  validityDays: number;
  confidentialityTerms: string;
}

export interface BoardInput {
  allAgentOutputs: {
    engenheiro: EngenheiroTecnicoOutput;
    logistica: LogisticaOutput;
    orcamentista: OrcamentistaOutput;
    tributario: TributarioOutput;
    comercial: ComercialOutput;
    gestao: GestaoProjOutput;
    financeiro: FinanceiroOutput;
    juridico: JuridicoOutput;
  };
  projectSummary: {
    name: string;
    totalPrice: number;
    duration: number;
    contractType?: ContractType;
  };
}

export interface BoardOutput {
  approved: boolean;
  blockProposal: boolean;
  requiresUserConfirmation: boolean;
  blockReason: string;
  warningMessages: string[];
  projectViability: {
    isViable: boolean;
    profitMargin: string;
    riskLevel: "baixo" | "medio" | "alto" | "critico";
    recommendation: "aprovar" | "aprovar_com_ressalvas" | "revisar" | "rejeitar";
  };
  decisions: {
    issue: string;
    agentsInvolved: string;
    businessImpact: string;
    decision: string;
    justification: string;
    actionRequired: string;
    responsible: string;
  }[];
  executiveSummary: string;
  finalApproval: {
    ceo: boolean;
    ceoNotes: string;
    cfo: boolean;
    cfoNotes: string;
    coo: boolean;
    cooNotes: string;
  };
  conditionsForApproval: string;
  // Campos de auto-correção financeira
  requestFinancialRevision: boolean; // Se true, solicita ciclo de revisão automático
  financialRevisionReason: string; // Motivo da solicitação de revisão
  financialRevisionInstructions: {
    orcamentista: string; // Instruções para o Orçamentista
    logistica: string; // Instruções para a Logística
    tributario: string; // Instruções para o Tributário
    comercial: string; // Instruções para o Comercial
  };
  isFinancialOnlyRejection: boolean; // Se a rejeição é exclusivamente por motivos financeiros
}

// Tipo para instruções de revisão financeira armazenadas no projeto
export interface FinancialRevisionInstructions {
  reason: string;
  targetMargin: number;
  instructions: {
    orcamentista: string;
    logistica: string;
    tributario: string;
    comercial: string;
  };
  originalBoardOutput: BoardOutput;
}

// Auditor Agent Types
export interface AuditorInput {
  allAgentOutputs: {
    engenheiro: EngenheiroTecnicoOutput;
    logistica: LogisticaOutput;
    orcamentista: OrcamentistaOutput;
    tributario: TributarioOutput;
    comercial: ComercialOutput;
    gestao: GestaoProjOutput;
    financeiro: FinanceiroOutput;
    juridico: JuridicoOutput;
    board: BoardOutput;
  };
  projectConfig: {
    name: string;
    bdiPercentual: number;
    contractType?: ContractType;
  };
  hasCustomSettings: boolean; // Se o usuário já salvou configurações personalizadas
}

export interface AuditorValidation {
  rule: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
  severity: "critical" | "warning" | "info";
  recommendation?: string;
}

export interface AuditorOutput {
  isValid: boolean;
  validationScore: number; // 0-100
  criticalErrors: number;
  warnings: number;
  validations: AuditorValidation[];
  crossAgentChecks: {
    check: string;
    agents: string[];
    consistent: boolean;
    details: string;
  }[];
  financialSummary: {
    directCost: number;
    logisticsCost: number;
    baseCost: number;
    bdiAmount: number;
    taxes: number;
    finalPrice: number;
    grossMargin: number;
    grossMarginPercent: number;
    netMargin: number;
    netMarginPercent: number;
  };
  auditSeal: "approved" | "approved_with_warnings" | "rejected";
  auditTimestamp: string;
  auditNotes: string;
}
