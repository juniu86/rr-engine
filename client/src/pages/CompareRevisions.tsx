import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  GitCompare,
  FileText,
  DollarSign,
  Clock,
  Package,
} from "lucide-react";

interface RevisionData {
  id: number;
  name: string;
  revisionNumber: number;
  status: string;
  createdAt: Date;
  totalPrice: number | null;
  totalItems: number;
  duration: number | null;
  budgetItems: Array<{
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
  }>;
}

export default function CompareRevisions() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const { user, loading: authLoading } = useAuth();
  
  const [leftRevisionId, setLeftRevisionId] = useState<string>("");
  const [rightRevisionId, setRightRevisionId] = useState<string>("");
  
  // Fetch project with revisions
  const { data: projectDetails, isLoading: projectLoading } = trpc.project.getDetails.useQuery(
    { id: projectId },
    { enabled: !!user && projectId > 0 }
  );
  const project = projectDetails?.project;
  
  // Fetch all revisions
  const { data: revisions, isLoading: revisionsLoading } = trpc.project.getRevisions.useQuery(
    { projectId },
    { enabled: !!user && projectId > 0 }
  );
  
  // Fetch left revision details
  const { data: leftDetails } = trpc.project.getDetails.useQuery(
    { id: parseInt(leftRevisionId) },
    { enabled: !!leftRevisionId }
  );
  const leftProject = leftDetails?.project;
  
  const { data: leftBudget } = trpc.budget.getItems.useQuery(
    { projectId: parseInt(leftRevisionId) },
    { enabled: !!leftRevisionId }
  );
  
  const { data: leftAgents } = trpc.agent.getExecutions.useQuery(
    { projectId: parseInt(leftRevisionId) },
    { enabled: !!leftRevisionId }
  );
  
  // Fetch right revision details
  const { data: rightDetails } = trpc.project.getDetails.useQuery(
    { id: parseInt(rightRevisionId) },
    { enabled: !!rightRevisionId }
  );
  const rightProject = rightDetails?.project;
  
  const { data: rightBudget } = trpc.budget.getItems.useQuery(
    { projectId: parseInt(rightRevisionId) },
    { enabled: !!rightRevisionId }
  );
  
  const { data: rightAgents } = trpc.agent.getExecutions.useQuery(
    { projectId: parseInt(rightRevisionId) },
    { enabled: !!rightRevisionId }
  );

  // Set default selections when revisions load
  useEffect(() => {
    if (revisions) {
      const allRevisions = [
        ...(revisions.original ? [revisions.original] : []),
        ...revisions.revisions
      ];
      
      if (allRevisions.length >= 2) {
        // Select original and latest revision by default
        if (revisions.original) {
          setLeftRevisionId(String(revisions.original.id));
        }
        if (revisions.revisions.length > 0) {
          const latest = revisions.revisions[revisions.revisions.length - 1];
          setRightRevisionId(String(latest.id));
        }
      }
    }
  }, [revisions]);

  if (authLoading || projectLoading || revisionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  const formatCurrency = (value: number | string | null) => {
    if (!value) return "R$ 0,00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const getLeftPrice = () => {
    const comercial = leftAgents?.find(a => a.agentType === "comercial");
    if (comercial?.output) {
      const output = comercial.output as any;
      return output.finalPrice || 0;
    }
    return 0;
  };

  const getRightPrice = () => {
    const comercial = rightAgents?.find(a => a.agentType === "comercial");
    if (comercial?.output) {
      const output = comercial.output as any;
      return output.finalPrice || 0;
    }
    return 0;
  };

  const getLeftDuration = () => {
    const gestao = leftAgents?.find(a => a.agentType === "gestao_projetos");
    if (gestao?.output) {
      const output = gestao.output as any;
      return output.totalDuration || 0;
    }
    return 0;
  };

  const getRightDuration = () => {
    const gestao = rightAgents?.find(a => a.agentType === "gestao_projetos");
    if (gestao?.output) {
      const output = gestao.output as any;
      return output.totalDuration || 0;
    }
    return 0;
  };

  const leftPrice = getLeftPrice();
  const rightPrice = getRightPrice();
  const priceDiff = rightPrice - leftPrice;
  const priceDiffPercent = leftPrice > 0 ? ((priceDiff / leftPrice) * 100).toFixed(1) : "0";

  const leftDuration = getLeftDuration();
  const rightDuration = getRightDuration();
  const durationDiff = rightDuration - leftDuration;

  const leftItemCount = leftBudget?.length || 0;
  const rightItemCount = rightBudget?.length || 0;
  const itemDiff = rightItemCount - leftItemCount;

  const getDiffIcon = (diff: number) => {
    if (diff > 0) return <ArrowUpRight className="h-4 w-4 text-red-500" />;
    if (diff < 0) return <ArrowDownRight className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getDiffColor = (diff: number, inverse = false) => {
    if (diff === 0) return "text-muted-foreground";
    if (inverse) {
      return diff > 0 ? "text-red-500" : "text-green-500";
    }
    return diff > 0 ? "text-green-500" : "text-red-500";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-primary" />
                Comparativo de Revisões
              </h1>
              <p className="text-sm text-muted-foreground">{project?.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Revision Selectors */}
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Revisões</CardTitle>
            <CardDescription>
              Escolha duas versões do projeto para comparar lado a lado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Versão Base (Esquerda)</label>
                <Select value={leftRevisionId} onValueChange={setLeftRevisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma versão" />
                  </SelectTrigger>
                  <SelectContent>
                    {revisions?.original && (
                      <SelectItem key={revisions.original.id} value={String(revisions.original.id)} disabled={String(revisions.original.id) === rightRevisionId}>
                        Original - {revisions.original.name}
                      </SelectItem>
                    )}
                    {revisions?.revisions?.map((rev: any) => (
                      <SelectItem key={rev.id} value={String(rev.id)} disabled={String(rev.id) === rightRevisionId}>
                        REV_{String(rev.revisionNumber).padStart(2, '0')} - {rev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-center pt-6">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>
              
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Versão Comparada (Direita)</label>
                <Select value={rightRevisionId} onValueChange={setRightRevisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma versão" />
                  </SelectTrigger>
                  <SelectContent>
                    {revisions?.original && (
                      <SelectItem key={revisions.original.id} value={String(revisions.original.id)} disabled={String(revisions.original.id) === leftRevisionId}>
                        Original - {revisions.original.name}
                      </SelectItem>
                    )}
                    {revisions?.revisions?.map((rev: any) => (
                      <SelectItem key={rev.id} value={String(rev.id)} disabled={String(rev.id) === leftRevisionId}>
                        REV_{String(rev.revisionNumber).padStart(2, '0')} - {rev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comparison Summary */}
        {leftRevisionId && rightRevisionId && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Price Comparison */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Valor Final</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Base</p>
                      <p className="text-lg font-bold">{formatCurrency(leftPrice)}</p>
                    </div>
                    <div className="text-center">
                      <div className={`flex items-center gap-1 ${getDiffColor(priceDiff, true)}`}>
                        {getDiffIcon(priceDiff)}
                        <span className="text-sm font-medium">{priceDiffPercent}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Comparada</p>
                      <p className="text-lg font-bold">{formatCurrency(rightPrice)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t">
                    <p className={`text-sm ${getDiffColor(priceDiff, true)}`}>
                      Diferença: {formatCurrency(Math.abs(priceDiff))} {priceDiff > 0 ? "a mais" : priceDiff < 0 ? "a menos" : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Duration Comparison */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Prazo</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Base</p>
                      <p className="text-lg font-bold">{leftDuration} semanas</p>
                    </div>
                    <div className="text-center">
                      <div className={`flex items-center gap-1 ${getDiffColor(durationDiff, true)}`}>
                        {getDiffIcon(durationDiff)}
                        <span className="text-sm font-medium">{Math.abs(durationDiff)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Comparada</p>
                      <p className="text-lg font-bold">{rightDuration} semanas</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t">
                    <p className={`text-sm ${getDiffColor(durationDiff, true)}`}>
                      Diferença: {Math.abs(durationDiff)} semanas {durationDiff > 0 ? "a mais" : durationDiff < 0 ? "a menos" : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Items Comparison */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Itens de Orçamento</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Base</p>
                      <p className="text-lg font-bold">{leftItemCount} itens</p>
                    </div>
                    <div className="text-center">
                      <div className={`flex items-center gap-1 ${getDiffColor(itemDiff)}`}>
                        {getDiffIcon(itemDiff)}
                        <span className="text-sm font-medium">{Math.abs(itemDiff)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Comparada</p>
                      <p className="text-lg font-bold">{rightItemCount} itens</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t">
                    <p className={`text-sm ${getDiffColor(itemDiff)}`}>
                      Diferença: {Math.abs(itemDiff)} itens {itemDiff > 0 ? "adicionados" : itemDiff < 0 ? "removidos" : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side by Side Budget Items */}
            <Card>
              <CardHeader>
                <CardTitle>Itens de Orçamento - Comparativo</CardTitle>
                <CardDescription>
                  Comparação lado a lado dos itens de cada versão
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* Left Side */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">
                      {leftProject?.revisionNumber === 0 ? "Original" : `REV_${String(leftProject?.revisionNumber).padStart(2, '0')}`}
                    </h4>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {leftBudget?.map((item, idx) => (
                        <div key={idx} className="p-3 bg-muted/50 rounded-lg text-sm">
                          <p className="font-medium truncate">{item.description}</p>
                          <div className="flex justify-between mt-1 text-muted-foreground">
                            <span>{item.quantity} {item.unit}</span>
                            <span className="font-medium text-foreground">{formatCurrency(item.totalCost)}</span>
                          </div>
                        </div>
                      ))}
                      {(!leftBudget || leftBudget.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Nenhum item encontrado
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Side */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">
                      {rightProject?.revisionNumber === 0 ? "Original" : `REV_${String(rightProject?.revisionNumber).padStart(2, '0')}`}
                    </h4>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {rightBudget?.map((item, idx) => (
                        <div key={idx} className="p-3 bg-muted/50 rounded-lg text-sm">
                          <p className="font-medium truncate">{item.description}</p>
                          <div className="flex justify-between mt-1 text-muted-foreground">
                            <span>{item.quantity} {item.unit}</span>
                            <span className="font-medium text-foreground">{formatCurrency(item.totalCost)}</span>
                          </div>
                        </div>
                      ))}
                      {(!rightBudget || rightBudget.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Nenhum item encontrado
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {(!revisions || (revisions.revisions.length === 0 && !revisions.original)) && (
          <Card>
            <CardContent className="py-12 text-center">
              <GitCompare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Sem revisões para comparar</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Este projeto ainda não possui revisões. Edite o memorial descritivo para criar uma nova revisão.
              </p>
              <Button onClick={() => navigate(`/projects/${projectId}`)}>
                Voltar ao Projeto
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
