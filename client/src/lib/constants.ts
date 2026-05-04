import {
  FileText,
  Calculator,
  Truck,
  Receipt,
  TrendingUp,
  Calendar,
  DollarSign,
  Scale,
  Users,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ==================== Agent Types ====================

export const AGENT_TYPES = {
  ENGENHEIRO_TECNICO: "engenheiro_tecnico",
  ORCAMENTISTA: "orcamentista",
  LOGISTICA: "logistica",
  TRIBUTARIO: "tributario",
  COMERCIAL: "comercial",
  GESTAO_PROJETOS: "gestao_projetos",
  FINANCEIRO: "financeiro",
  JURIDICO: "juridico",
  BOARD: "board",
  AUDITOR: "auditor",
} as const;

// ==================== Agent Icons ====================

export const agentIcons: Record<string, LucideIcon> = {
  engenheiro_tecnico: FileText,
  orcamentista: Calculator,
  logistica: Truck,
  tributario: Receipt,
  comercial: TrendingUp,
  gestao_projetos: Calendar,
  financeiro: DollarSign,
  juridico: Scale,
  board: Users,
  auditor: CheckCircle2,
};

// ==================== Agent Config (Pipeline) ====================

export interface AgentConfigItem {
  type: string;
  name: string;
  icon: LucideIcon;
  description: string;
  details: string;
  color: string;
  bgColor: string;
  /** P1.2: agente é determinístico (TS puro, sem LLM). UI mostra badge. */
  isDeterministic?: boolean;
}

export const agentConfig: AgentConfigItem[] = [
  {
    type: "engenheiro_tecnico",
    name: "Engenheiro Técnico",
    icon: FileText,
    description: "Extrai e especifica itens do memorial",
    details: "Interpreta o memorial descritivo, identificando todos os serviços com especificações técnicas e quantitativos.",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
  },
  {
    type: "orcamentista",
    name: "Orçamentista",
    icon: Calculator,
    description: "Precifica com bases SINAPI e PINI",
    details: "Consulta bases oficiais para obter composições de custos atualizadas de material e mão de obra.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    type: "logistica",
    name: "Logística",
    icon: Truck,
    description: "Calcula custos indiretos",
    details: "Estima custos de mobilização, frete, caçambas e aluguel de equipamentos.",
    color: "text-amber-400",
    bgColor: "bg-primary/10",
  },
  {
    type: "tributario",
    name: "Tributário",
    icon: Receipt,
    description: "Classifica incidência fiscal",
    details: "Analisa cada item quanto à incidência de ISS, ICMS, PIS, COFINS e demais tributos.",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    type: "comercial",
    name: "Comercial",
    icon: TrendingUp,
    description: "Aplica BDI e preço de venda",
    details: "Aplica o BDI configurado sobre o custo base e define o preço de venda final. Cálculo determinístico — não consome tokens de LLM.",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    isDeterministic: true,
  },
  {
    type: "gestao_projetos",
    name: "Gestão de Projetos",
    icon: Calendar,
    description: "Cria cronograma físico",
    details: "Calcula prazo de execução baseado em índices de produtividade SINAPI.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    type: "financeiro",
    name: "Financeiro",
    icon: DollarSign,
    description: "Analisa fluxo de caixa",
    details: "Projeta fluxo de caixa com faturamento 40% entrada e 60% ao final. Análise determinística — não consome tokens de LLM.",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    isDeterministic: true,
  },
  {
    type: "juridico",
    name: "Jurídico",
    icon: Scale,
    description: "Redige cláusulas contratuais",
    details: "Elabora proposta comercial com cláusulas de objeto, preço e condições.",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
  },
  {
    type: "board",
    name: "Board",
    icon: Users,
    description: "Aprova e emite parecer",
    details: "Revisa todos os outputs e emite parecer final de aprovação.",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
  },
  {
    type: "auditor",
    name: "Auditor",
    icon: ClipboardCheck,
    description: "Validação matemática",
    details: "Executa auditoria de consistência entre todos os documentos e valores calculados. Emite selo de aprovação.",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
];

// ==================== Status Configs ====================

export const agentStatusConfig: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  pending: { label: "Pendente", color: "bg-slate-500", icon: Clock },
  running: { label: "Executando", color: "bg-blue-500", icon: Loader2 },
  completed: { label: "Concluído", color: "bg-green-500", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "bg-red-500", icon: XCircle },
  needs_review: { label: "Revisão", color: "bg-primary", icon: AlertCircle },
  waiting_for_user_input: { label: "Aguardando Dados", color: "bg-orange-500", icon: AlertCircle },
};

export const projectStatusConfig: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: "Rascunho", color: "bg-slate-500", icon: FileText },
  processing: { label: "Processando", color: "bg-blue-500", icon: Clock },
  review: { label: "Em Revisão", color: "bg-primary", icon: AlertCircle },
  approved: { label: "Aprovado", color: "bg-green-500", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "bg-red-500", icon: XCircle },
  blocked: { label: "Bloqueado", color: "bg-red-600", icon: XCircle },
  pending_confirmation: { label: "Aguardando Confirmação", color: "bg-orange-500", icon: AlertCircle },
  waiting_for_input: { label: "Aguardando Dados", color: "bg-amber-500", icon: AlertCircle },
};

// ==================== Pipeline Status Config ====================

export const pipelineStatusConfig: Record<string, {
  statusColor: string;
  statusBgColor: string;
  borderColor: string;
  icon: LucideIcon;
  label: string;
}> = {
  pending: {
    statusColor: "text-slate-500",
    statusBgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/30",
    icon: Clock,
    label: "Pendente",
  },
  running: {
    statusColor: "text-primary",
    statusBgColor: "bg-primary/20",
    borderColor: "border-primary",
    icon: Loader2,
    label: "Executando",
  },
  completed: {
    statusColor: "text-emerald-500",
    statusBgColor: "bg-emerald-500/20",
    borderColor: "border-emerald-500",
    icon: CheckCircle2,
    label: "Concluído",
  },
  failed: {
    statusColor: "text-red-500",
    statusBgColor: "bg-red-500/20",
    borderColor: "border-red-500",
    icon: XCircle,
    label: "Falhou",
  },
  needs_review: {
    statusColor: "text-primary",
    statusBgColor: "bg-primary/20",
    borderColor: "border-primary",
    icon: AlertCircle,
    label: "Revisão",
  },
};

// ==================== Utilities ====================

export function formatCurrency(value: number | string | null | undefined): string {
  if (!value) return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}
