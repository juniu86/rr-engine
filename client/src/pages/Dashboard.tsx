import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import MoneyValue from "@/components/MoneyValue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  ArrowRight,
  Building2,
  TrendingUp,
  Settings,
  Wallet,
  Search,
  X,
  Filter
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { projectStatusConfig } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusConfig = projectStatusConfig;

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "processing", label: "Processando" },
  { value: "approved", label: "Aprovados" },
  { value: "draft", label: "Rascunhos" },
  { value: "rejected", label: "Rejeitados" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const { data: hasCustomSettings } = trpc.settings.hasCustomSettings.useQuery();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => {
      const matchesSearch = searchQuery === "" ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.location || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const stats = {
    total: projects?.length || 0,
    processing: projects?.filter(p => p.status === "processing").length || 0,
    approved: projects?.filter(p => p.status === "approved").length || 0,
    draft: projects?.filter(p => p.status === "draft").length || 0,
  };

  const totalValue = projects?.reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl">Dashboard</h1>
            <p className="text-muted-foreground">
              Bem-vindo, {user?.name || "Usuario"}. Gerencie seus orcamentos aqui.
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="gradient-brand text-white border-0 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orcamento
            </Button>
          </Link>
        </div>

        {/* Onboarding Checklist for new users */}
        <OnboardingChecklist
          hasSettings={hasCustomSettings !== false}
          hasProjects={(projects?.length || 0) > 0}
        />

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">projetos criados</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Processando</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-primary">{stats.processing}</div>
              <p className="text-xs text-muted-foreground mt-1">em andamento</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-emerald-400">{stats.approved}</div>
              <p className="text-xs text-muted-foreground mt-1">finalizados</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rascunhos</CardTitle>
              <FileText className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">{stats.draft}</div>
              <p className="text-xs text-muted-foreground mt-1">pendentes</p>
            </CardContent>
          </Card>
          <Card className="glass border-primary/20 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total em Propostas</CardTitle>
              <Wallet className="h-4 w-4 text-warm" />
            </CardHeader>
            <CardContent>
              {totalValue > 0 ? (
                <MoneyValue value={totalValue} size="md" className="text-warm" />
              ) : (
                <div className="text-2xl font-bold font-display text-muted-foreground">—</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">valor acumulado</p>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Projetos Recentes</CardTitle>
                <CardDescription>
                  Lista de todos os seus orcamentos e propostas
                </CardDescription>
              </div>
              {projects && projects.length > 0 && (
                <Link href="/projects/new">
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1 h-3 w-3" />
                    Novo
                  </Button>
                </Link>
              )}
            </div>

            {/* Search and filter bar */}
            {projects && projects.length > 3 && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, descricao ou localizacao..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setStatusFilter(filter.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                        statusFilter === filter.value
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {filter.label}
                      {filter.value !== "all" && projects && (
                        <span className="ml-1 opacity-60">
                          {projects.filter(p => p.status === filter.value).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="space-y-3">
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhum projeto encontrado</p>
                    <p className="text-sm mt-1">
                      {searchQuery
                        ? `Nenhum resultado para "${searchQuery}"`
                        : "Nenhum projeto com o filtro selecionado"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                    >
                      Limpar filtros
                    </Button>
                  </div>
                ) : (
                  filteredProjects.map(project => {
                    const status = statusConfig[project.status as keyof typeof statusConfig] ||
                      { label: project.status || "Desconhecido", color: "bg-slate-500", icon: FileText };
                    const StatusIcon = status.icon;
                    const agentProgress = (project as any).completedAgents || 0;
                    return (
                      <Link key={project.id} href={`/projects/${project.id}`}>
                        <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 cursor-pointer group">
                          <div className={`h-12 w-12 rounded-xl ${status.color}/20 flex items-center justify-center shrink-0`}>
                            <StatusIcon className={`h-6 w-6 ${status.color.replace('bg-', 'text-')}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{project.name}</h3>
                              {project.status === "processing" && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {project.description || "Sem descricao"}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className="text-xs">
                                {project.contractType === "obra" ? "Obra" : "Manutencao"}
                              </Badge>
                              {project.location && (
                                <span className="text-xs text-muted-foreground">
                                  {project.location}
                                </span>
                              )}
                              {project.status === "processing" && agentProgress > 0 && (
                                <div className="flex items-center gap-1.5 ml-2">
                                  <Progress value={(agentProgress / 10) * 100} className="w-16 h-1.5" />
                                  <span className="text-xs text-muted-foreground">{agentProgress}/10</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <Badge className={status.color}>
                              {status.label}
                            </Badge>
                            {project.totalPrice && (
                              <MoneyValue value={Number(project.totalPrice)} size="sm" />
                            )}
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            ) : (
              <EmptyState
                variant="projects"
                title="Nenhum projeto ainda"
                description="Crie seu primeiro orcamento para comecar a usar o poder dos 10 agentes de IA especializados."
                actionLabel="Criar Primeiro Orcamento"
                actionHref="/projects/new"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
