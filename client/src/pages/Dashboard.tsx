import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import MoneyValue from "@/components/MoneyValue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Wallet
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { projectStatusConfig } from "@/lib/constants";

const statusConfig = projectStatusConfig;

export default function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const { data: hasCustomSettings } = trpc.settings.hasCustomSettings.useQuery();

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
              Bem-vindo, {user?.name || "Usuário"}. Gerencie seus orçamentos aqui.
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="gradient-brand text-white border-0 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Button>
          </Link>
        </div>

        {/* Onboarding Checklist for new users */}
        <OnboardingChecklist
          hasSettings={hasCustomSettings !== false}
          hasProjects={(projects?.length || 0) > 0}
        />

        {/* Stats Cards - Glass morphism */}
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
          {/* Value highlight card */}
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Projetos Recentes</CardTitle>
                <CardDescription>
                  Lista de todos os seus orçamentos e propostas
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
                {projects.map(project => {
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
                            {project.description || "Sem descrição"}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-xs">
                              {project.contractType === "obra" ? "Obra" : "Manutenção"}
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
                })}
              </div>
            ) : (
              <EmptyState
                variant="projects"
                title="Nenhum projeto ainda"
                description="Crie seu primeiro orçamento para começar a usar o poder dos 10 agentes de IA especializados."
                actionLabel="Criar Primeiro Orçamento"
                actionHref="/projects/new"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
