import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import AgentProgressPipeline from "@/components/AgentProgressPipeline";
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
  RefreshCw,
  Eye,
  Table,
  Edit3,
  GitBranch,
  History,
  Save,
  X
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useLocation } from "wouter";

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
  const [, navigate] = useLocation();
  
  // Estados para edição do memorial
  const [isEditingMemorial, setIsEditingMemorial] = useState(false);
  const [editedMemorial, setEditedMemorial] = useState("");
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  
  const { data: details, isLoading, refetch } = trpc.project.getDetails.useQuery(
    { id: projectId },
    { enabled: projectId > 0, refetchInterval: 5000 }
  );
  
  // Query para obter próximo número de revisão
  const { data: revisionInfo } = trpc.project.getNextRevisionNumber.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  
  // Query para obter revisões existentes
  const { data: revisionsData } = trpc.project.getRevisions.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  
  // Mutation para criar revisão
  const createRevision = trpc.project.createRevision.useMutation({
    onSuccess: (data) => {
      toast.success("Revisão criada com sucesso!");
      setShowRevisionDialog(false);
      setIsEditingMemorial(false);
      // Navegar para o novo projeto
      navigate(`/projects/${data.newProjectId}`);
    },
    onError: (error) => {
      toast.error("Erro ao criar revisão: " + error.message);
    },
  });
  
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

  const generateProposal = trpc.document.generateProposal.useMutation({
    onSuccess: (data) => {
      toast.success("Proposta Comercial gerada com sucesso!");
      if (data.url) window.open(data.url, '_blank');
      refetch();
    },
    onError: (error) => {
      toast.error("Erro ao gerar proposta: " + error.message);
    },
  });

  const generateMemoria = trpc.document.generateMemoria.useMutation({
    onSuccess: (data) => {
      toast.success("Memória de Cálculo gerada com sucesso!");
      if (data.url) window.open(data.url, '_blank');
      refetch();
    },
    onError: (error) => {
      toast.error("Erro ao gerar memória: " + error.message);
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

        {/* Progress Card with Visual Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Pipeline de Processamento</CardTitle>
              <span className="text-sm text-muted-foreground">{completedAgents}/9 agentes concluídos</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Visual Agent Pipeline */}
            <AgentProgressPipeline executions={agentExecutions} />
            
            {/* Progress bar */}
            <div className="pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Progresso geral</span>
                <span className="text-xs font-medium text-amber-500">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-2 pt-4">
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
        <Tabs defaultValue="memorial" className="space-y-4">
          <TabsList>
            <TabsTrigger value="memorial">Memorial</TabsTrigger>
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="budget">Orçamento</TabsTrigger>
            <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          {/* Memorial Tab */}
          <TabsContent value="memorial" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Memorial Descritivo */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-amber-500" />
                      <CardTitle>Memorial Descritivo</CardTitle>
                    </div>
                    {!isEditingMemorial ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setEditedMemorial(project.memorialDescritivo || "");
                          setIsEditingMemorial(true);
                        }}
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Editar Memorial
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setIsEditingMemorial(false);
                            setEditedMemorial("");
                          }}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancelar
                        </Button>
                        <Button 
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700"
                          onClick={() => {
                            if (editedMemorial !== project.memorialDescritivo) {
                              setShowRevisionDialog(true);
                            } else {
                              toast.info("Nenhuma alteração detectada.");
                              setIsEditingMemorial(false);
                            }
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Salvar como Revisão
                        </Button>
                      </div>
                    )}
                  </div>
                  <CardDescription>
                    {project.revisionNumber && project.revisionNumber > 0 ? (
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        Revisão {String(project.revisionNumber).padStart(2, '0')} do projeto original
                      </span>
                    ) : (
                      "Documento base para geração do orçamento"
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isEditingMemorial ? (
                    <Textarea
                      value={editedMemorial}
                      onChange={(e) => setEditedMemorial(e.target.value)}
                      className="min-h-[400px] font-mono text-sm"
                      placeholder="Digite o memorial descritivo..."
                    />
                  ) : (
                    <ScrollArea className="h-[400px] rounded-md border p-4">
                      {project.memorialDescritivo ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{project.memorialDescritivo}</Streamdown>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          Nenhum memorial descritivo cadastrado.
                        </p>
                      )}
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Histórico de Revisões */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-5 w-5 text-amber-500" />
                      <CardTitle>Histórico de Revisões</CardTitle>
                    </div>
                    {revisionsData && (revisionsData.revisions.length > 0 || revisionsData.original) && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/projects/${projectId}/compare`)}
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        Comparar
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    Versões anteriores do orçamento
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {revisionsData?.original && (
                      <div className="space-y-2">
                        {/* Projeto Original */}
                        <div 
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            revisionsData.original.id === projectId 
                              ? 'border-amber-500 bg-amber-500/10' 
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => navigate(`/projects/${revisionsData.original!.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {revisionsData.original.originalName || revisionsData.original.name}
                            </span>
                            <Badge variant="outline" className="text-xs">Original</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Criado em {new Date(revisionsData.original.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                          {revisionsData.original.totalPrice && (
                            <p className="text-xs text-amber-500 mt-1">
                              R$ {Number(revisionsData.original.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>

                        {/* Revisões */}
                        {revisionsData.revisions.map((rev) => (
                          <div 
                            key={rev.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              rev.id === projectId 
                                ? 'border-amber-500 bg-amber-500/10' 
                                : 'hover:bg-muted'
                            }`}
                            onClick={() => navigate(`/projects/${rev.id}`)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">
                                REV_{String(rev.revisionNumber).padStart(2, '0')}
                              </span>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  rev.status === 'approved' ? 'border-green-500 text-green-500' :
                                  rev.status === 'rejected' ? 'border-red-500 text-red-500' :
                                  ''
                                }`}
                              >
                                {statusConfig[rev.status as keyof typeof statusConfig]?.label || rev.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Criado em {new Date(rev.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                            {rev.totalPrice && (
                              <p className="text-xs text-amber-500 mt-1">
                                R$ {Number(rev.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        ))}

                        {revisionsData.revisions.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma revisão criada ainda.
                          </p>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Dialog de Confirmação de Revisão */}
            <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-amber-500" />
                    Criar Nova Revisão
                  </DialogTitle>
                  <DialogDescription>
                    Ao confirmar, será criado um novo orçamento com o memorial editado.
                    O orçamento atual será mantido inalterado.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm font-medium">Nova revisão:</p>
                    <p className="text-lg font-bold text-amber-500">
                      {revisionInfo?.nextRevisionName || 'Carregando...'}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Após criar a revisão, você precisará executar os agentes novamente
                    para processar o novo memorial.
                  </p>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowRevisionDialog(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => createRevision.mutate({
                      projectId,
                      newMemorialDescritivo: editedMemorial,
                    })}
                    disabled={createRevision.isPending}
                  >
                    {createRevision.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Criar Revisão
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

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
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="mt-2 w-full text-amber-500 hover:text-amber-400">
                                <Eye className="mr-1 h-3 w-3" />
                                Ver Detalhes
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Icon className="h-5 w-5 text-amber-500" />
                                  {execution.agentOrder}. {getAgentName(execution.agentType)}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="mt-4">
                                {renderAgentDetails(execution.agentType, output)}
                              </div>
                            </DialogContent>
                          </Dialog>
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
                    <p className="text-sm mb-4">Clique no botão abaixo para gerar os documentos.</p>
                  </div>
                )}

                {/* Botões de Geração de Documentos */}
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold mb-4">Gerar Documentos</h4>
                  <div className="flex flex-wrap gap-4">
                    <Button 
                      onClick={() => {
                        generateProposal.mutate({ projectId });
                        generateMemoria.mutate({ projectId });
                      }}
                      disabled={generateProposal.isPending || generateMemoria.isPending}
                      className="bg-amber-500 hover:bg-amber-600"
                    >
                      {(generateProposal.isPending || generateMemoria.isPending) ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Gerar Proposta + Planilha
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => generateProposal.mutate({ projectId })}
                      disabled={generateProposal.isPending}
                    >
                      {generateProposal.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Apenas Proposta
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => generateMemoria.mutate({ projectId })}
                      disabled={generateMemoria.isPending}
                    >
                      {generateMemoria.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Table className="mr-2 h-4 w-4" />
                      )}
                      Apenas Planilha (Excel)
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    A proposta comercial mostra os valores de venda (sem custos abertos). A planilha contém o detalhamento completo de custos.
                  </p>
                </div>
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
      // BDI pode vir como decimal (0.55) ou percentual (55)
      const bdiValue = output.adjustedBdi || output.baseBdi || 0;
      const bdiPercent = bdiValue > 1 ? bdiValue : bdiValue * 100;
      return (
        <>
          <p>BDI: <strong>{bdiPercent.toFixed(1)}%</strong></p>
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
      const recommendation = output.projectViability?.recommendation || 'revisar';
      const recommendationColors: Record<string, string> = {
        aprovar: 'text-green-500',
        aprovar_com_ressalvas: 'text-amber-500',
        revisar: 'text-amber-500',
        rejeitar: 'text-red-500'
      };
      const recommendationLabels: Record<string, string> = {
        aprovar: 'Aprovado',
        aprovar_com_ressalvas: 'Aprovado c/ Ressalvas',
        revisar: 'Em Revisão',
        rejeitar: 'Não Recomendado'
      };
      return (
        <>
          <p>Parecer: <strong className={recommendationColors[recommendation] || 'text-amber-500'}>
            {recommendationLabels[recommendation] || 'Em Revisão'}
          </strong></p>
          <p><strong>{output.decisions?.length || 0}</strong> decisões tomadas</p>
          <p>Risco: <strong>{output.projectViability?.riskLevel || 'N/A'}</strong></p>
        </>
      );
    default:
      return null;
  }
}

function renderAgentDetails(type: string, output: any): React.ReactNode {
  switch (type) {
    case "engenheiro_tecnico":
      return (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Itens Identificados ({output.items?.length || 0})</h4>
            <div className="space-y-2">
              {output.items?.map((item: any, i: number) => (
                <div key={i} className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    Unidade: {item.unit} | Quantidade: {item.quantity} | Complexidade: {item.complexity}
                  </p>
                  {item.nbr && <p className="text-xs text-amber-500">NBR: {item.nbr}</p>}
                </div>
              ))}
            </div>
          </div>
          {output.pendingItems?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-amber-500">Pendentes de Vistoria ({output.pendingItems?.length})</h4>
              <ul className="list-disc list-inside space-y-1">
                {output.pendingItems?.map((item: string, i: number) => (
                  <li key={i} className="text-sm">{item}</li>
                ))}
              </ul>
            </div>
          )}
          {output.technicalNotes && (
            <div>
              <h4 className="font-semibold mb-2">Notas Técnicas</h4>
              <p className="text-sm text-muted-foreground">{output.technicalNotes}</p>
            </div>
          )}
        </div>
      );

    case "logistica":
      return (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Custos Logísticos ({output.costs?.length || 0})</h4>
            <div className="space-y-2">
              {output.costs?.map((cost: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{cost.description}</p>
                    <p className="text-xs text-muted-foreground">{cost.category}</p>
                  </div>
                  <p className="font-semibold">R$ {(cost.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-amber-500/10 rounded-lg">
            <p className="text-lg font-bold">Total Logística: R$ {(output.totalLogisticsCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          {output.mobilizationDays && (
            <p className="text-sm">Prazo de Mobilização: <strong>{output.mobilizationDays} dias</strong></p>
          )}
        </div>
      );

    case "orcamentista":
      return (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Itens Orçados ({output.items?.length || 0})</h4>
            <div className="space-y-2">
              {output.items?.map((item: any, i: number) => (
                <div key={i} className="p-3 bg-muted rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Fonte: {item.source} | Código: {item.sourceCode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">R$ {(item.totalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} x R$ {item.unitPrice}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Custo Direto</p>
              <p className="text-xl font-bold">R$ {(output.totalDirectCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Custo Indireto</p>
              <p className="text-xl font-bold">R$ {(output.totalIndirectCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      );

    case "tributario":
      return (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Classificação Tributária</h4>
            <div className="space-y-2">
              {output.taxes?.map((tax: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{tax.type}</p>
                    <p className="text-xs text-muted-foreground">Alíquota: {(tax.rate * 100).toFixed(2)}%</p>
                  </div>
                  <p className="font-semibold">R$ {(tax.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-amber-500/10 rounded-lg">
            <p className="text-lg font-bold">Total Impostos: R$ {(output.totalTaxes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          {output.alerts?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-amber-500">Alertas Fiscais ({output.alerts?.length})</h4>
              <ul className="list-disc list-inside space-y-1">
                {output.alerts?.map((alert: string, i: number) => (
                  <li key={i} className="text-sm">{alert}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );

    case "comercial":
      const bdiValue = output.adjustedBdi || output.baseBdi || 0;
      const bdiPercent = bdiValue > 1 ? bdiValue : bdiValue * 100;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">BDI Base</p>
              <p className="text-xl font-bold">{((output.baseBdi || 0) > 1 ? output.baseBdi : (output.baseBdi || 0) * 100).toFixed(1)}%</p>
            </div>
            <div className="p-4 bg-amber-500/10 rounded-lg">
              <p className="text-sm text-muted-foreground">BDI Ajustado</p>
              <p className="text-xl font-bold text-amber-500">{bdiPercent.toFixed(1)}%</p>
            </div>
          </div>
          {output.bdiJustification && (
            <div>
              <h4 className="font-semibold mb-2">Justificativa do BDI</h4>
              <p className="text-sm text-muted-foreground">{output.bdiJustification}</p>
            </div>
          )}
          <div className="p-4 bg-green-500/10 rounded-lg">
            <p className="text-sm text-muted-foreground">Preço Final de Venda</p>
            <p className="text-2xl font-bold text-green-500">R$ {(output.finalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      );

    case "gestao_projetos":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Duração Total</p>
              <p className="text-xl font-bold">{output.totalDuration || 0} semanas</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Marcos</p>
              <p className="text-xl font-bold">{output.milestones?.length || 0}</p>
            </div>
          </div>
          {output.milestones?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Marcos do Projeto</h4>
              <div className="space-y-2">
                {output.milestones?.map((milestone: any, i: number) => (
                  <div key={i} className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">{milestone.name}</p>
                    <p className="text-xs text-muted-foreground">Semana {milestone.week}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {output.schedule?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Cronograma</h4>
              <div className="space-y-2">
                {output.schedule?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <p className="font-medium">{item.activity}</p>
                    <p className="text-sm">Semanas {item.startWeek} - {item.endWeek}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );

    case "financeiro":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Exposição Máxima</p>
              <p className="text-xl font-bold">R$ {(output.maxExposure || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className={`p-4 rounded-lg ${output.needsAdvance ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              <p className="text-sm text-muted-foreground">Adiantamento</p>
              <p className={`text-xl font-bold ${output.needsAdvance ? 'text-amber-500' : 'text-green-500'}`}>
                {output.needsAdvance ? `R$ ${(output.suggestedAdvance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Não necessário'}
              </p>
            </div>
          </div>
          {output.cashFlow?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Fluxo de Caixa Semanal</h4>
              <div className="space-y-2">
                {output.cashFlow?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <p className="font-medium">Semana {item.week}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-red-500">- R$ {(item.expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-green-500">+ R$ {(item.income || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className={item.balance < 0 ? 'text-red-500 font-bold' : 'font-semibold'}>
                        = R$ {(item.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {output.alerts?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-amber-500">Alertas Financeiros</h4>
              <ul className="list-disc list-inside space-y-1">
                {output.alerts?.map((alert: string, i: number) => (
                  <li key={i} className="text-sm">{alert}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );

    case "juridico":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Validade da Proposta</p>
              <p className="text-xl font-bold">{output.validityDays || 0} dias</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Cláusulas</p>
              <p className="text-xl font-bold">{output.clauses?.length || 0}</p>
            </div>
          </div>
          {output.clauses?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Cláusulas Contratuais</h4>
              <div className="space-y-3">
                {output.clauses?.map((clause: any, i: number) => (
                  <div key={i} className="p-3 bg-muted rounded-lg">
                    <p className="font-medium text-amber-500">{clause.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{clause.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {output.riskMitigations?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Mitigação de Riscos</h4>
              <ul className="list-disc list-inside space-y-1">
                {output.riskMitigations?.map((risk: string, i: number) => (
                  <li key={i} className="text-sm">{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );

    case "board":
      const viability = output.projectViability || {};
      const recColors: Record<string, string> = {
        aprovar: 'bg-green-500/10 text-green-500',
        aprovar_com_ressalvas: 'bg-amber-500/10 text-amber-500',
        revisar: 'bg-amber-500/10 text-amber-500',
        rejeitar: 'bg-red-500/10 text-red-500'
      };
      const recLabels: Record<string, string> = {
        aprovar: 'PROJETO APROVADO',
        aprovar_com_ressalvas: 'APROVADO COM RESSALVAS',
        revisar: 'REQUER REVISÃO',
        rejeitar: 'PROJETO NÃO RECOMENDADO'
      };
      const riskColors: Record<string, string> = {
        baixo: 'text-green-500',
        medio: 'text-amber-500',
        alto: 'text-orange-500',
        critico: 'text-red-500'
      };
      return (
        <div className="space-y-4">
          {/* Parecer Executivo */}
          <div className={`p-4 rounded-lg ${recColors[viability.recommendation] || 'bg-amber-500/10'}`}>
            <p className="text-sm text-muted-foreground">Parecer do Board Executivo</p>
            <p className={`text-2xl font-bold`}>
              {recLabels[viability.recommendation] || 'EM ANÁLISE'}
            </p>
          </div>

          {/* Viabilidade do Projeto */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Margem de Lucro</p>
              <p className="text-xl font-bold">{viability.profitMargin || 'N/A'}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Nível de Risco</p>
              <p className={`text-xl font-bold ${riskColors[viability.riskLevel] || ''}`}>
                {viability.riskLevel?.toUpperCase() || 'N/A'}
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Viável</p>
              <p className={`text-xl font-bold ${viability.isViable ? 'text-green-500' : 'text-red-500'}`}>
                {viability.isViable ? 'SIM' : 'NÃO'}
              </p>
            </div>
          </div>

          {/* Resumo Executivo */}
          {output.executiveSummary && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Resumo Executivo</h4>
              <p className="text-sm text-muted-foreground">{output.executiveSummary}</p>
            </div>
          )}

          {/* Decisões Tomadas */}
          {output.decisions?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 text-amber-500">Decisões Executivas ({output.decisions?.length})</h4>
              <div className="space-y-3">
                {output.decisions?.map((decision: any, i: number) => (
                  <div key={i} className="p-4 bg-muted rounded-lg border-l-4 border-amber-500">
                    <p className="font-medium text-amber-500">{decision.issue}</p>
                    <p className="text-xs text-muted-foreground mt-1">Agentes: {decision.agentsInvolved}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm"><strong>Impacto:</strong> {decision.businessImpact}</p>
                      <p className="text-sm"><strong>Decisão:</strong> {decision.decision}</p>
                      <p className="text-sm"><strong>Justificativa:</strong> {decision.justification}</p>
                      <p className="text-sm text-amber-500"><strong>Ação Requerida:</strong> {decision.actionRequired}</p>
                      <p className="text-xs text-muted-foreground">Responsável: {decision.responsible}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aprovação dos Executivos */}
          <div>
            <h4 className="font-semibold mb-2">Aprovação dos Executivos</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className={`p-3 rounded-lg ${output.finalApproval?.ceo ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <p className="font-medium">CEO</p>
                <p className={`text-sm ${output.finalApproval?.ceo ? 'text-green-500' : 'text-red-500'}`}>
                  {output.finalApproval?.ceo ? '✓ Aprovado' : '✗ Não Aprovado'}
                </p>
                {output.finalApproval?.ceoNotes && (
                  <p className="text-xs text-muted-foreground mt-1">{output.finalApproval.ceoNotes}</p>
                )}
              </div>
              <div className={`p-3 rounded-lg ${output.finalApproval?.cfo ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <p className="font-medium">CFO</p>
                <p className={`text-sm ${output.finalApproval?.cfo ? 'text-green-500' : 'text-red-500'}`}>
                  {output.finalApproval?.cfo ? '✓ Aprovado' : '✗ Não Aprovado'}
                </p>
                {output.finalApproval?.cfoNotes && (
                  <p className="text-xs text-muted-foreground mt-1">{output.finalApproval.cfoNotes}</p>
                )}
              </div>
              <div className={`p-3 rounded-lg ${output.finalApproval?.coo ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <p className="font-medium">COO</p>
                <p className={`text-sm ${output.finalApproval?.coo ? 'text-green-500' : 'text-red-500'}`}>
                  {output.finalApproval?.coo ? '✓ Aprovado' : '✗ Não Aprovado'}
                </p>
                {output.finalApproval?.cooNotes && (
                  <p className="text-xs text-muted-foreground mt-1">{output.finalApproval.cooNotes}</p>
                )}
              </div>
            </div>
          </div>

          {/* Condições para Aprovação */}
          {output.conditionsForApproval && (
            <div className="p-4 bg-amber-500/10 rounded-lg">
              <h4 className="font-semibold mb-2 text-amber-500">Condições para Aprovação</h4>
              <p className="text-sm">{output.conditionsForApproval}</p>
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="p-4 bg-muted rounded-lg">
          <pre className="text-xs overflow-auto">{JSON.stringify(output, null, 2)}</pre>
        </div>
      );
  }
}
