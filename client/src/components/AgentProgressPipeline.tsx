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
  AlertCircle
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
    details: "Interpreta o memorial descritivo, identificando todos os serviços com especificações técnicas e quantitativos."
  },
  { 
    type: "orcamentista", 
    name: "Orçamentista", 
    icon: Calculator,
    description: "Precifica com bases SINAPI e PINI",
    details: "Consulta bases oficiais para obter composições de custos atualizadas de material e mão de obra."
  },
  { 
    type: "logistica", 
    name: "Logística", 
    icon: Truck,
    description: "Calcula custos indiretos",
    details: "Estima custos de mobilização, frete, caçambas e aluguel de equipamentos."
  },
  { 
    type: "tributario", 
    name: "Tributário", 
    icon: Receipt,
    description: "Classifica incidência fiscal",
    details: "Analisa cada item quanto à incidência de ISS, ICMS, PIS, COFINS e demais tributos."
  },
  { 
    type: "comercial", 
    name: "Comercial", 
    icon: TrendingUp,
    description: "Aplica BDI e preço de venda",
    details: "Aplica o BDI configurado sobre o custo base e define o preço de venda final."
  },
  { 
    type: "gestao_projetos", 
    name: "Gestão de Projetos", 
    icon: Calendar,
    description: "Cria cronograma físico",
    details: "Calcula prazo de execução baseado em índices de produtividade SINAPI."
  },
  { 
    type: "financeiro", 
    name: "Financeiro", 
    icon: DollarSign,
    description: "Analisa fluxo de caixa",
    details: "Projeta fluxo de caixa com faturamento 40% entrada e 60% ao final."
  },
  { 
    type: "juridico", 
    name: "Jurídico", 
    icon: Scale,
    description: "Redige cláusulas contratuais",
    details: "Elabora proposta comercial com cláusulas de objeto, preço e condições."
  },
  { 
    type: "board", 
    name: "Board", 
    icon: Users,
    description: "Aprova e emite parecer",
    details: "Revisa todos os outputs e emite parecer final de aprovação."
  },
];

const statusConfig = {
  pending: { 
    color: "text-slate-500", 
    bgColor: "bg-slate-500/10", 
    borderColor: "border-slate-500/30",
    icon: Clock,
    label: "Pendente"
  },
  running: { 
    color: "text-blue-500", 
    bgColor: "bg-blue-500/20", 
    borderColor: "border-blue-500",
    icon: Loader2,
    label: "Executando"
  },
  completed: { 
    color: "text-green-500", 
    bgColor: "bg-green-500/20", 
    borderColor: "border-green-500",
    icon: CheckCircle2,
    label: "Concluído"
  },
  failed: { 
    color: "text-red-500", 
    bgColor: "bg-red-500/20", 
    borderColor: "border-red-500",
    icon: XCircle,
    label: "Falhou"
  },
  needs_review: { 
    color: "text-amber-500", 
    bgColor: "bg-amber-500/20", 
    borderColor: "border-amber-500",
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("w-full", className)}>
        {/* Desktop: Horizontal Pipeline */}
        <div className="hidden lg:block">
          {/* Top row - agents 1-5 */}
          <div className="flex justify-between items-start mb-2">
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
                    <div className="flex flex-col items-center w-36 cursor-pointer group">
                      {/* Number with status indicator */}
                      <div className={cn(
                        "relative text-4xl font-extralight tabular-nums mb-2 transition-all duration-300",
                        isRunning && "text-blue-400 animate-pulse",
                        isCompleted && "text-green-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(idx + 1).padStart(2, '0')}
                        {/* Status icon overlay */}
                        <div className={cn(
                          "absolute -right-2 -top-1 p-1 rounded-full",
                          config.bgColor
                        )}>
                          <StatusIcon className={cn(
                            "h-3 w-3",
                            config.color,
                            isRunning && "animate-spin"
                          )} />
                        </div>
                      </div>
                      
                      {/* Agent name */}
                      <h3 className={cn(
                        "font-medium text-xs text-center mb-1 transition-colors",
                        isRunning && "text-blue-400",
                        isCompleted && "text-green-400",
                        isPending && "text-slate-500",
                        status === "failed" && "text-red-400"
                      )}>
                        {agent.name}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-slate-600 text-[10px] text-center leading-relaxed">
                        {agent.description}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="bottom" 
                    className="max-w-xs bg-slate-800 border-slate-700 p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AgentIcon className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-white">{agent.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", config.bgColor, config.color)}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{agent.details}</p>
                      {execution?.output && isCompleted && (
                        <div className="text-xs text-green-400 pt-2 border-t border-slate-700">
                          ✓ Processamento concluído
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-slate-700">
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
          <div className="relative h-12 my-4">
            {/* Background line */}
            <div className="absolute top-1/2 left-[8%] right-[8%] h-px bg-slate-800" />
            
            {/* Progress line */}
            <div 
              className="absolute top-1/2 left-[8%] h-px bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
              style={{ 
                width: runningIndex >= 0 
                  ? `${Math.min((runningIndex / 4) * 84, 84)}%`
                  : executions.filter(e => e.status === "completed").length >= 5 
                    ? "84%" 
                    : `${(executions.filter(e => e.status === "completed" && agentConfig.slice(0, 5).some(a => a.type === e.agentType)).length / 5) * 84}%`
              }}
            />
            
            {/* Dots on the line */}
            <div className="absolute top-1/2 left-[8%] right-[8%] flex justify-between -translate-y-1/2">
              {agentConfig.slice(0, 5).map((agent, i) => {
                const execution = executionMap.get(agent.type);
                const status = execution?.status || "pending";
                const isCompleted = status === "completed";
                const isRunning = status === "running";
                
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "w-3 h-3 rounded-full transition-all duration-300 border-2",
                      isCompleted && "bg-green-500 border-green-500",
                      isRunning && "bg-blue-500 border-blue-500 animate-pulse",
                      status === "pending" && "bg-slate-900 border-slate-700",
                      status === "failed" && "bg-red-500 border-red-500"
                    )}
                  />
                );
              })}
            </div>
            
            {/* Arrow pointing down-right */}
            <div className="absolute right-[8%] top-1/2 w-6 h-6 border-r border-b border-slate-700 -translate-y-1/2 translate-x-3" />
          </div>

          {/* Bottom row - agents 6-9 (reversed for flow) */}
          <div className="flex justify-end items-start gap-6 pr-[8%]">
            {agentConfig.slice(5).reverse().map((agent, idx) => {
              const actualIdx = 8 - idx; // 9, 8, 7, 6
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
                    <div className="flex flex-col items-center w-36 cursor-pointer group">
                      <div className={cn(
                        "relative text-4xl font-extralight tabular-nums mb-2 transition-all duration-300",
                        isRunning && "text-blue-400 animate-pulse",
                        isCompleted && "text-green-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(actualIdx).padStart(2, '0')}
                        <div className={cn(
                          "absolute -right-2 -top-1 p-1 rounded-full",
                          config.bgColor
                        )}>
                          <StatusIcon className={cn(
                            "h-3 w-3",
                            config.color,
                            isRunning && "animate-spin"
                          )} />
                        </div>
                      </div>
                      
                      <h3 className={cn(
                        "font-medium text-xs text-center mb-1 transition-colors",
                        isRunning && "text-blue-400",
                        isCompleted && "text-green-400",
                        isPending && "text-slate-500",
                        status === "failed" && "text-red-400"
                      )}>
                        {agent.name}
                      </h3>
                      
                      <p className="text-slate-600 text-[10px] text-center leading-relaxed">
                        {agent.description}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="max-w-xs bg-slate-800 border-slate-700 p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AgentIcon className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-white">{agent.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", config.bgColor, config.color)}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{agent.details}</p>
                      {execution?.output && isCompleted && (
                        <div className="text-xs text-green-400 pt-2 border-t border-slate-700">
                          ✓ Processamento concluído
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-slate-700">
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
            
            return (
              <div 
                key={agent.type}
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg border transition-all",
                  isRunning && "border-blue-500 bg-blue-500/10",
                  isCompleted && "border-green-500/30 bg-green-500/5",
                  status === "pending" && "border-slate-800 bg-slate-900/50",
                  status === "failed" && "border-red-500/30 bg-red-500/5"
                )}
              >
                {/* Number */}
                <div className={cn(
                  "text-2xl font-extralight tabular-nums w-10 text-center",
                  isRunning && "text-blue-400",
                  isCompleted && "text-green-400",
                  status === "pending" && "text-slate-600",
                  status === "failed" && "text-red-400"
                )}>
                  {String(idx + 1).padStart(2, '0')}
                </div>
                
                {/* Divider */}
                <div className={cn(
                  "h-8 w-px",
                  isRunning && "bg-blue-500",
                  isCompleted && "bg-green-500",
                  status === "pending" && "bg-slate-700",
                  status === "failed" && "bg-red-500"
                )} />
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <AgentIcon className={cn(
                      "h-4 w-4",
                      isRunning && "text-blue-400",
                      isCompleted && "text-green-400",
                      status === "pending" && "text-slate-500",
                      status === "failed" && "text-red-400"
                    )} />
                    <h3 className={cn(
                      "font-medium text-sm",
                      isRunning && "text-blue-400",
                      isCompleted && "text-green-400",
                      status === "pending" && "text-slate-400",
                      status === "failed" && "text-red-400"
                    )}>
                      {agent.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {agent.description}
                  </p>
                </div>
                
                {/* Status icon */}
                <StatusIcon className={cn(
                  "h-5 w-5",
                  config.color,
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
