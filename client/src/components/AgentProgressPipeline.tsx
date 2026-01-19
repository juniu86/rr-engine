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
  Clock,
  Loader2,
  XCircle,
  AlertCircle,
  ClipboardCheck
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AgentExecution {
  id: number;
  agentType: string;
  agentOrder: number;
  status: string;
  output?: any;
  errors?: any;
}

interface AgentProgressPipelineProps {
  executions: AgentExecution[];
  className?: string;
}

const agentConfig = [
  { 
    type: "engenheiro_tecnico", 
    name: "Engenheiro Técnico", 
    icon: FileText,
    description: "Extrai e especifica itens do memorial",
    details: "Interpreta o memorial descritivo, identificando todos os serviços com especificações técnicas e quantitativos.",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10"
  },
  { 
    type: "orcamentista", 
    name: "Orçamentista", 
    icon: Calculator,
    description: "Precifica com bases SINAPI e PINI",
    details: "Consulta bases oficiais para obter composições de custos atualizadas de material e mão de obra.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10"
  },
  { 
    type: "logistica", 
    name: "Logística", 
    icon: Truck,
    description: "Calcula custos indiretos",
    details: "Estima custos de mobilização, frete, caçambas e aluguel de equipamentos.",
    color: "text-amber-400",
    bgColor: "bg-primary/10"
  },
  { 
    type: "tributario", 
    name: "Tributário", 
    icon: Receipt,
    description: "Classifica incidência fiscal",
    details: "Analisa cada item quanto à incidência de ISS, ICMS, PIS, COFINS e demais tributos.",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10"
  },
  { 
    type: "comercial", 
    name: "Comercial", 
    icon: TrendingUp,
    description: "Aplica BDI e preço de venda",
    details: "Aplica o BDI configurado sobre o custo base e define o preço de venda final.",
    color: "text-green-400",
    bgColor: "bg-green-500/10"
  },
  { 
    type: "gestao_projetos", 
    name: "Gestão de Projetos", 
    icon: Calendar,
    description: "Cria cronograma físico",
    details: "Calcula prazo de execução baseado em índices de produtividade SINAPI.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10"
  },
  { 
    type: "financeiro", 
    name: "Financeiro", 
    icon: DollarSign,
    description: "Analisa fluxo de caixa",
    details: "Projeta fluxo de caixa com faturamento 40% entrada e 60% ao final.",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10"
  },
  { 
    type: "juridico", 
    name: "Jurídico", 
    icon: Scale,
    description: "Redige cláusulas contratuais",
    details: "Elabora proposta comercial com cláusulas de objeto, preço e condições.",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10"
  },
  { 
    type: "board", 
    name: "Board", 
    icon: Users,
    description: "Aprova e emite parecer",
    details: "Revisa todos os outputs e emite parecer final de aprovação.",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10"
  },
  { 
    type: "auditor", 
    name: "Auditor", 
    icon: ClipboardCheck,
    description: "Validação matemática",
    details: "Executa auditoria de consistência entre todos os documentos e valores calculados. Emite selo de aprovação.",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10"
  },
];

const statusConfig = {
  pending: { 
    statusColor: "text-slate-500", 
    statusBgColor: "bg-slate-500/10", 
    borderColor: "border-slate-500/30",
    icon: Clock,
    label: "Pendente"
  },
  running: { 
    statusColor: "text-primary", 
    statusBgColor: "bg-primary/20", 
    borderColor: "border-primary",
    icon: Loader2,
    label: "Executando"
  },
  completed: { 
    statusColor: "text-emerald-500", 
    statusBgColor: "bg-emerald-500/20", 
    borderColor: "border-emerald-500",
    icon: CheckCircle2,
    label: "Concluído"
  },
  failed: { 
    statusColor: "text-red-500", 
    statusBgColor: "bg-red-500/20", 
    borderColor: "border-red-500",
    icon: XCircle,
    label: "Falhou"
  },
  needs_review: { 
    statusColor: "text-primary", 
    statusBgColor: "bg-primary/20", 
    borderColor: "border-primary",
    icon: AlertCircle,
    label: "Revisão"
  },
};

export default function AgentProgressPipeline({ executions, className }: AgentProgressPipelineProps) {
  // Criar mapa de execuções por tipo de agente
  const executionMap = new Map(executions.map(e => [e.agentType, e]));
  
  // Encontrar o agente atualmente em execução
  const runningAgent = executions.find(e => e.status === "running");
  const runningIndex = runningAgent 
    ? agentConfig.findIndex(a => a.type === runningAgent.agentType)
    : -1;

  // Calcular progresso
  const completedCount = executions.filter(e => e.status === "completed").length;
  const totalAgents = agentConfig.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("w-full", className)}>
        {/* Progress bar header */}
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-xs text-slate-500">Pipeline de Processamento</span>
          <span className="text-xs text-slate-400">
            {completedCount}/{totalAgents} concluídos
          </span>
        </div>

        {/* Desktop: Grid Layout 5x2 */}
        <div className="hidden lg:block">
          {/* Top row - agents 1-5 */}
          <div className="grid grid-cols-5 gap-3 mb-3">
            {agentConfig.slice(0, 5).map((agent, idx) => {
              const execution = executionMap.get(agent.type);
              const status = execution?.status || "pending";
              const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = config.icon;
              const AgentIcon = agent.icon;
              const isRunning = status === "running";
              const isCompleted = status === "completed";
              const isPending = status === "pending";
              
              return (
                <Tooltip key={agent.type}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex flex-col items-center p-3 rounded-xl border cursor-pointer group transition-all duration-300",
                      "bg-[oklch(0.18_0.012_250)]",
                      isRunning && "border-primary/50 shadow-lg shadow-primary/10",
                      isCompleted && "border-emerald-500/30",
                      isPending && "border-white/5",
                      status === "failed" && "border-red-500/30"
                    )}>
                      {/* Icon with status */}
                      <div className="relative mb-2">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                          isRunning && "bg-primary/20",
                          isCompleted && "bg-emerald-500/20",
                          isPending && agent.bgColor,
                          status === "failed" && "bg-red-500/20"
                        )}>
                          <AgentIcon className={cn(
                            "w-5 h-5 transition-colors",
                            isRunning && "text-primary",
                            isCompleted && "text-emerald-400",
                            isPending && agent.color,
                            status === "failed" && "text-red-400"
                          )} />
                        </div>
                        {/* Status badge */}
                        <div className={cn(
                          "absolute -right-1 -bottom-1 p-0.5 rounded-full",
                          config.statusBgColor
                        )}>
                          <StatusIcon className={cn(
                            "h-3 w-3",
                            config.statusColor,
                            isRunning && "animate-spin"
                          )} />
                        </div>
                      </div>
                      
                      {/* Number */}
                      <div className={cn(
                        "text-lg font-light tabular-nums mb-1 transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      
                      {/* Agent name */}
                      <h3 className={cn(
                        "font-medium text-[11px] text-center leading-tight transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-400",
                        status === "failed" && "text-red-400"
                      )}>
                        {agent.name}
                      </h3>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="bottom" 
                    className="max-w-xs bg-[oklch(0.22_0.012_250)] border-white/10 p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AgentIcon className={cn("h-4 w-4", agent.color)} />
                        <span className="font-medium text-white">{agent.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", config.statusBgColor, config.statusColor)}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{agent.details}</p>
                      {execution?.output && isCompleted && (
                        <div className="text-xs text-emerald-400 pt-2 border-t border-white/10">
                          ✓ Processamento concluído
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-white/10">
                          ✗ {(execution.errors as any)?.message || "Erro no processamento"}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          
          {/* Connection line with progress */}
          <div className="relative h-6 my-2 mx-4">
            {/* Background line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
            
            {/* Progress line */}
            <div 
              className="absolute top-1/2 left-0 h-px bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500"
              style={{ 
                width: `${Math.min((completedCount / totalAgents) * 100, 100)}%`
              }}
            />
            
            {/* Arrow indicator */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-r-2 border-b-2 border-primary/40 rotate-45 translate-x-1" />
            </div>
          </div>

          {/* Bottom row - agents 6-10 */}
          <div className="grid grid-cols-5 gap-3">
            {agentConfig.slice(5).map((agent, idx) => {
              const actualIdx = idx + 5;
              const execution = executionMap.get(agent.type);
              const status = execution?.status || "pending";
              const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = config.icon;
              const AgentIcon = agent.icon;
              const isRunning = status === "running";
              const isCompleted = status === "completed";
              const isPending = status === "pending";
              
              return (
                <Tooltip key={agent.type}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex flex-col items-center p-3 rounded-xl border cursor-pointer group transition-all duration-300",
                      "bg-[oklch(0.18_0.012_250)]",
                      isRunning && "border-primary/50 shadow-lg shadow-primary/10",
                      isCompleted && "border-emerald-500/30",
                      isPending && "border-white/5",
                      status === "failed" && "border-red-500/30"
                    )}>
                      {/* Icon with status */}
                      <div className="relative mb-2">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                          isRunning && "bg-primary/20",
                          isCompleted && "bg-emerald-500/20",
                          isPending && agent.bgColor,
                          status === "failed" && "bg-red-500/20"
                        )}>
                          <AgentIcon className={cn(
                            "w-5 h-5 transition-colors",
                            isRunning && "text-primary",
                            isCompleted && "text-emerald-400",
                            isPending && agent.color,
                            status === "failed" && "text-red-400"
                          )} />
                        </div>
                        {/* Status badge */}
                        <div className={cn(
                          "absolute -right-1 -bottom-1 p-0.5 rounded-full",
                          config.statusBgColor
                        )}>
                          <StatusIcon className={cn(
                            "h-3 w-3",
                            config.statusColor,
                            isRunning && "animate-spin"
                          )} />
                        </div>
                      </div>
                      
                      {/* Number */}
                      <div className={cn(
                        "text-lg font-light tabular-nums mb-1 transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(actualIdx + 1).padStart(2, '0')}
                      </div>
                      
                      {/* Agent name */}
                      <h3 className={cn(
                        "font-medium text-[11px] text-center leading-tight transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-400",
                        status === "failed" && "text-red-400"
                      )}>
                        {agent.name}
                      </h3>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="max-w-xs bg-[oklch(0.22_0.012_250)] border-white/10 p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AgentIcon className={cn("h-4 w-4", agent.color)} />
                        <span className="font-medium text-white">{agent.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", config.statusBgColor, config.statusColor)}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{agent.details}</p>
                      {execution?.output && isCompleted && (
                        <div className="text-xs text-emerald-400 pt-2 border-t border-white/10">
                          ✓ Processamento concluído
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-white/10">
                          ✗ {(execution.errors as any)?.message || "Erro no processamento"}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Mobile/Tablet: Vertical List */}
        <div className="lg:hidden space-y-2">
          {agentConfig.map((agent, idx) => {
            const execution = executionMap.get(agent.type);
            const status = execution?.status || "pending";
            const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
            const StatusIcon = config.icon;
            const AgentIcon = agent.icon;
            const isRunning = status === "running";
            const isCompleted = status === "completed";
            const isPending = status === "pending";
            
            return (
              <div 
                key={agent.type}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  "bg-[oklch(0.18_0.012_250)]",
                  isRunning && "border-primary/50 shadow-lg shadow-primary/10",
                  isCompleted && "border-emerald-500/30",
                  isPending && "border-white/5",
                  status === "failed" && "border-red-500/30"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  isRunning && "bg-primary/20",
                  isCompleted && "bg-emerald-500/20",
                  isPending && agent.bgColor,
                  status === "failed" && "bg-red-500/20"
                )}>
                  <AgentIcon className={cn(
                    "w-4 h-4",
                    isRunning && "text-primary",
                    isCompleted && "text-emerald-400",
                    isPending && agent.color,
                    status === "failed" && "text-red-400"
                  )} />
                </div>
                
                {/* Number */}
                <div className={cn(
                  "text-xl font-light tabular-nums w-8 text-center",
                  isRunning && "text-primary",
                  isCompleted && "text-emerald-400",
                  isPending && "text-slate-600",
                  status === "failed" && "text-red-400"
                )}>
                  {String(idx + 1).padStart(2, '0')}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className={cn(
                    "font-medium text-sm",
                    isRunning && "text-primary",
                    isCompleted && "text-emerald-400",
                    isPending && "text-slate-400",
                    status === "failed" && "text-red-400"
                  )}>
                    {agent.name}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {agent.description}
                  </p>
                </div>
                
                {/* Status icon */}
                <StatusIcon className={cn(
                  "h-5 w-5 shrink-0",
                  config.statusColor,
                  isRunning && "animate-spin"
                )} />
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
