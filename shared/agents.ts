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
  | "board";

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
};

// Contract Types
export type ContractType = "manutencao" | "obra";

export const CONTRACT_BDI: Record<ContractType, number> = {
  manutencao: 0.40,
  obra: 0.55,
};

// Tax Types
export type TaxType = "iss" | "icms" | "both" | "none";

export const TAX_RATES = {
  iss: 0.05,
  icms: 0.18,
  pis_cofins: 0.0365,
  inss: 0.11,
};

// Budget Item Sources
export type PriceSource = "sinapi" | "pini" | "mercado";

// Project Status
export type ProjectStatus = "draft" | "processing" | "review" | "approved" | "rejected";

// Agent Execution Status
export type AgentStatus = "pending" | "running" | "completed" | "failed" | "needs_review";

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
}

export interface EngenheiroTecnicoOutput {
  items: MemorialItem[];
  pendingItems: string[];
  nbrReferences: string[];
  criticalNotes: string[];
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
  }[];
  totalLogisticsCost: number;
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
}
