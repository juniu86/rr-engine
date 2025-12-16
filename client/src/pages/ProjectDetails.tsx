import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import { toast } from "sonner";
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  XCircle,
  FileText,
  Calculator,
  Truck,
  Receipt,
  TrendingUp,
  Calendar,
  DollarSign,
  Scale,
  Users,
  ArrowLeft,
  Loader2,
  Download,
  RefreshCw
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";

const agentIcons: Record<string, any> = {
  engenheiro_tecnico: FileText,
  logistica: Truck,
  orcamentista: Calculator,
  tributario: Receipt,
  comercial: TrendingUp,
  gestao_projetos: Calendar,
  financeiro: DollarSign,
  juridico: Scale,
  board: Users,
};

const statusConfig = {
  pending: { label: "Pendente", color: "bg-slate-500", icon: Clock },
  running: { label: "Executando", color: "bg-blue-500", icon: Loader2 },
  completed: { label: "Concluído", color: "bg-green-500", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "bg-red-500", icon: XCircle },
  needs_review: { label: "Revisão", color: "bg-amber-500", icon: AlertCircle },
};

export default function ProjectDetails() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  
  const { data: details, isLoading, refetch } = trpc.project.getDetails.useQuery(
    { id: projectId },
    { enabled: projectId > 0, refetchInterval: 5000 }
  );
  
  const executeAll = trpc.agent.executeAll.useMutation({
    onSuccess: () => {
      toast.success("Processamento concluído!");
      refetch();
    },
    onError: (error) => {
      toast.error("Erro no processamento: " + error.message);
      refetch();
    },
  });

  const executeSingle = trpc.agent.execute.useMutation({
    onSuccess: () => {
      toast.success("Agente executado com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
      refetch();
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  if (!details) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Projeto não encontrado</h2>
          <Link href="/dashboard">
            <Button className="mt-4">Voltar ao Dashboard</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const { project, agentExecutions, budgetItems, cashFlowItems, documents } = details;
  
  const completedAgents = agentExecutions.filter(e => e.status === "completed").length;
  const progress = (completedAgents / 9) * 100;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-muted-foreground">{project.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {project.contractType === "obra" ? "Obra" : "Manutenção"}
            </Badge>
            <Badge className={statusConfig[project.status as keyof typeof statusConfig]?.color || "bg-slate-500"}>
              {statusConfig[project.status as keyof typeof statusConfig]?.label || project.status}
            </Badge>
          </div>
        </div>

        {/* Progress Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Progresso do Processamento</CardTitle>
              <span className="text-sm text-muted-foreground">{completedAgents}/9 agentes</span>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="h-2 mb-4" />
            <div className="flex gap-2">
              <Button 
                onClick={() => executeAll.mutate({ projectId })}
                disabled={executeAll.isPending || project.status === "approved"}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {executeAll.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Executar Todos os Agentes
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="agents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="budget">Orçamento</TabsTrigger>
            <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {agentExecutions.map((execution) => {
                const Icon = agentIcons[execution.agentType] || FileText;
                const status = statusConfig[execution.status as keyof typeof statusConfig];
                const StatusIcon = status?.icon || Clock;
                const output = execution.output as any;
                
                return (
                  <Card key={execution.id} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${status?.color || "bg-slate-500"}`} />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-amber-500" />
                          <CardTitle className="text-sm font-medium">
                            {execution.agentOrder}. {getAgentName(execution.agentType)}
                          </CardTitle>
                        </div>
                        <StatusIcon className={`h-4 w-4 ${execution.status === "running" ? "animate-spin" : ""} ${status?.color.replace("bg-", "text-")}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-2">
                        {getAgentDescription(execution.agentType)}
                      </p>
                      {execution.status === "completed" && output && (
                        <div className="text-xs space-y-1">
                          {renderAgentSummary(execution.agentType, output)}
                        </div>
                      )}
                      {execution.status === "failed" && (
                        <p className="text-xs text-red-500">
                          {(execution.errors as any)?.message || "Erro desconhecido"}
                        </p>
                      )}
                      {execution.status === "pending" && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-2 w-full"
                          onClick={() => executeSingle.mutate({ projectId, agentType: execution.agentType as any })}
                          disabled={executeSingle.isPending}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Executar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="budget">
            <Card>
              <CardHeader>
                <CardTitle>Itens do Orçamento</CardTitle>
                <CardDescription>
                  {budgetItems.length} itens orçados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {budgetItems.length > 0 ? (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {budgetItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.description}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">{item.source}</Badge>
                              {item.sourceCode && <span>Cód: {item.sourceCode}</span>}
                              <span>{item.quantity} {item.unit}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              R$ {Number(item.finalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Unit: R$ {Number(item.unitCostTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum item orçado ainda.</p>
                    <p className="text-sm">Execute os agentes para gerar o orçamento.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cash Flow Tab */}
          <TabsContent value="cashflow">
            <Card>
              <CardHeader>
                <CardTitle>Fluxo de Caixa</CardTitle>
                <CardDescription>
                  Projeção semanal de despesas e receitas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cashFlowItems.length > 0 ? (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {cashFlowItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">Semana {item.weekNumber}</p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-red-500">
                              - R$ {Number(item.plannedExpense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-green-500">
                              + R$ {Number(item.plannedIncome || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className={Number(item.cashBalance) < 0 ? "text-red-500 font-bold" : "font-semibold"}>
                              = R$ {Number(item.cashBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            {item.hasAlert && (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Fluxo de caixa não disponível.</p>
                    <p className="text-sm">Execute o agente Financeiro para gerar a projeção.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documentos Gerados</CardTitle>
                <CardDescription>
                  Propostas comerciais e memórias de cálculo
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-amber-500" />
                          <div>
                            <p className="font-medium">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.documentType === "proposta_comercial" ? "Proposta Comercial" : "Memória de Cálculo"}
                            </p>
                          </div>
                        </div>
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum documento gerado.</p>
                    <p className="text-sm">Complete o processamento para gerar os documentos.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Summary Cards */}
        {project.totalPrice && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Custo Direto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  R$ {Number(project.totalCostDirect || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Custo Indireto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  R$ {Number(project.totalCostIndirect || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Impostos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  R$ {Number(project.totalTaxes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/10 border-amber-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Preço Final</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">
                  R$ {Number(project.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function getAgentName(type: string): string {
  const names: Record<string, string> = {
    engenheiro_tecnico: "Engenheiro Técnico",
    logistica: "Logística",
    orcamentista: "Orçamentista",
    tributario: "Tributário",
    comercial: "Comercial",
    gestao_projetos: "Gestão",
    financeiro: "Financeiro",
    juridico: "Jurídico",
    board: "Board",
  };
  return names[type] || type;
}

function getAgentDescription(type: string): string {
  const descriptions: Record<string, string> = {
    engenheiro_tecnico: "Traduz memorial em tarefas técnicas",
    logistica: "Calcula custos de mobilização",
    orcamentista: "Precifica com SINAPI/PINI",
    tributario: "Classifica ISS/ICMS",
    comercial: "Define BDI e preço de venda",
    gestao_projetos: "Cria cronograma físico",
    financeiro: "Analisa fluxo de caixa",
    juridico: "Redige proposta técnica",
    board: "Aprovação final",
  };
  return descriptions[type] || "";
}

function renderAgentSummary(type: string, output: any): React.ReactNode {
  switch (type) {
    case "engenheiro_tecnico":
      return (
        <>
          <p><strong>{output.items?.length || 0}</strong> itens identificados</p>
          <p><strong>{output.pendingItems?.length || 0}</strong> pendentes de vistoria</p>
        </>
      );
    case "logistica":
      return (
        <>
          <p><strong>{output.costs?.length || 0}</strong> custos logísticos</p>
          <p>Total: <strong>R$ {(output.totalLogisticsCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
        </>
      );
    case "orcamentista":
      return (
        <>
          <p>Direto: <strong>R$ {(output.totalDirectCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
          <p>Indireto: <strong>R$ {(output.totalIndirectCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
        </>
      );
    case "tributario":
      return (
        <>
          <p>Total impostos: <strong>R$ {(output.totalTaxes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
          <p><strong>{output.alerts?.length || 0}</strong> alertas</p>
        </>
      );
    case "comercial":
      return (
        <>
          <p>BDI: <strong>{((output.adjustedBdi || 0) * 100).toFixed(1)}%</strong></p>
          <p>Preço: <strong>R$ {(output.finalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
        </>
      );
    case "gestao_projetos":
      return (
        <>
          <p>Duração: <strong>{output.totalDuration || 0} semanas</strong></p>
          <p><strong>{output.milestones?.length || 0}</strong> marcos</p>
        </>
      );
    case "financeiro":
      return (
        <>
          <p>Exposição máx: <strong>R$ {(output.maxExposure || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
          {output.needsAdvance && <p className="text-amber-500">Requer adiantamento</p>}
        </>
      );
    case "juridico":
      return (
        <>
          <p>Validade: <strong>{output.validityDays || 0} dias</strong></p>
          <p><strong>{output.clauses?.length || 0}</strong> cláusulas</p>
        </>
      );
    case "board":
      return (
        <>
          <p>Status: <strong className={output.approved ? "text-green-500" : "text-amber-500"}>
            {output.approved ? "Aprovado" : "Em revisão"}
          </strong></p>
          <p><strong>{output.issues?.length || 0}</strong> observações</p>
        </>
      );
    default:
      return null;
  }
}
