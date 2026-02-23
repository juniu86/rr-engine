import { useState } from "react";
import { Loader2, AlertCircle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { agentConfig, pipelineStatusConfig } from "@/lib/constants";

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
  onRetry?: (agentType: string) => void;
}

const statusConfig = pipelineStatusConfig;

export default function AgentProgressPipeline({ executions, className, onRetry }: AgentProgressPipelineProps) {
  const executionMap = new Map(executions.map(e => [e.agentType, e]));
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const completedCount = executions.filter(e => e.status === "completed").length;
  const runningAgent = executions.find(e => e.status === "running");
  const totalAgents = agentConfig.length;

  // ETA estimate: ~30 seconds per agent
  const remainingAgents = totalAgents - completedCount - (runningAgent ? 1 : 0);
  const estimatedMinutes = Math.ceil((remainingAgents * 30 + (runningAgent ? 15 : 0)) / 60);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("w-full", className)}>
        {/* Progress bar header with ETA */}
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-xs text-slate-500">Pipeline de Processamento</span>
          <div className="flex items-center gap-3">
            {runningAgent && (
              <span className="text-xs text-primary animate-pulse">
                ~{estimatedMinutes} min restante{estimatedMinutes !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-slate-400">
              {completedCount}/{totalAgents} concluidos
            </span>
          </div>
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
                      isRunning && "border-primary/50 shadow-lg shadow-primary/10 animate-pulse",
                      isCompleted && "border-emerald-500/30",
                      isPending && "border-white/5",
                      status === "failed" && "border-red-500/30"
                    )}>
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

                      <div className={cn(
                        "text-lg font-light tabular-nums mb-1 transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(idx + 1).padStart(2, '0')}
                      </div>

                      <h3 className={cn(
                        "font-medium text-xs text-center leading-tight transition-colors",
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
                          Processamento concluido
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-white/10">
                          {(execution.errors as any)?.message || "Erro no processamento"}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Connection line with animated progress */}
          <div className="relative h-8 my-1 mx-4">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
            <div
              className="absolute top-1/2 left-0 h-[2px] rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min((completedCount / totalAgents) * 100, 100)}%`,
                background: 'linear-gradient(90deg, #34d399, oklch(0.55 0.14 220))',
                boxShadow: completedCount < totalAgents ? '0 0 8px oklch(0.55 0.14 220 / 0.5)' : 'none',
              }}
            />
            {completedCount > 0 && completedCount < totalAgents && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary animate-pulse transition-all duration-1000"
                style={{ left: `${Math.min((completedCount / totalAgents) * 100, 100)}%` }}
              />
            )}
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-r-[1.5px] border-b-[1.5px] border-primary/40 rotate-45 translate-x-1" />
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
                      isRunning && "border-primary/50 shadow-lg shadow-primary/10 animate-pulse",
                      isCompleted && "border-emerald-500/30",
                      isPending && "border-white/5",
                      status === "failed" && "border-red-500/30"
                    )}>
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

                      <div className={cn(
                        "text-lg font-light tabular-nums mb-1 transition-colors",
                        isRunning && "text-primary",
                        isCompleted && "text-emerald-400",
                        isPending && "text-slate-600",
                        status === "failed" && "text-red-400"
                      )}>
                        {String(actualIdx + 1).padStart(2, '0')}
                      </div>

                      <h3 className={cn(
                        "font-medium text-xs text-center leading-tight transition-colors",
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
                          Processamento concluido
                        </div>
                      )}
                      {execution?.errors && status === "failed" && (
                        <div className="text-xs text-red-400 pt-2 border-t border-white/10">
                          {(execution.errors as any)?.message || "Erro no processamento"}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Mobile/Tablet: Expandable Card List */}
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
            const isFailed = status === "failed";
            const isExpanded = expandedAgent === agent.type;

            return (
              <div key={agent.type}>
                <button
                  type="button"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.type)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                    "bg-[oklch(0.18_0.012_250)]",
                    isRunning && "border-primary/50 shadow-lg shadow-primary/10",
                    isCompleted && "border-emerald-500/30",
                    isPending && "border-white/5",
                    isFailed && "border-red-500/30",
                    isExpanded && "rounded-b-none"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    isRunning && "bg-primary/20",
                    isCompleted && "bg-emerald-500/20",
                    isPending && agent.bgColor,
                    isFailed && "bg-red-500/20"
                  )}>
                    <AgentIcon className={cn(
                      "w-5 h-5",
                      isRunning && "text-primary",
                      isCompleted && "text-emerald-400",
                      isPending && agent.color,
                      isFailed && "text-red-400"
                    )} />
                  </div>

                  {/* Number */}
                  <div className={cn(
                    "text-xl font-light tabular-nums w-8 text-center shrink-0",
                    isRunning && "text-primary",
                    isCompleted && "text-emerald-400",
                    isPending && "text-slate-600",
                    isFailed && "text-red-400"
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
                      isFailed && "text-red-400"
                    )}>
                      {agent.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {agent.description}
                    </p>
                  </div>

                  {/* Status badge + expand icon */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      config.statusBgColor,
                      config.statusColor
                    )}>
                      {config.label}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className={cn(
                    "p-4 rounded-b-xl border border-t-0 space-y-3",
                    "bg-[oklch(0.16_0.012_250)]",
                    isRunning && "border-primary/50",
                    isCompleted && "border-emerald-500/30",
                    isPending && "border-white/5",
                    isFailed && "border-red-500/30"
                  )}>
                    <p className="text-sm text-slate-300">{agent.details}</p>

                    {execution?.output && isCompleted && (
                      <div className="text-sm text-emerald-400 flex items-center gap-2">
                        <StatusIcon className="h-4 w-4" />
                        Processamento concluido com sucesso
                      </div>
                    )}

                    {execution?.errors && isFailed && (
                      <div className="space-y-2">
                        <p className="text-sm text-red-400">
                          {(execution.errors as any)?.message || "Erro no processamento"}
                        </p>
                        {onRetry && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRetry(agent.type);
                            }}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Tentar novamente
                          </button>
                        )}
                      </div>
                    )}

                    {isRunning && (
                      <div className="text-sm text-primary flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processando... aguarde
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
