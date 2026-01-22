import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { 
  Plus, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Building2,
  Calculator,
  TrendingUp
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings } from "lucide-react";

const statusConfig = {
  draft: { label: "Rascunho", color: "bg-slate-500", icon: FileText },
  processing: { label: "Processando", color: "bg-blue-500", icon: Clock },
  review: { label: "Em Revisão", color: "bg-primary", icon: AlertCircle },
  approved: { label: "Aprovado", color: "bg-green-500", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "bg-red-500", icon: AlertCircle },
  blocked: { label: "Bloqueado", color: "bg-red-600", icon: AlertCircle },
  pending_confirmation: { label: "Aguardando Confirmação", color: "bg-orange-500", icon: AlertCircle },
  waiting_for_input: { label: "Aguardando Dados", color: "bg-amber-500", icon: AlertCircle },
};

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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Bem-vindo, {user?.name || "Usuário"}. Gerencie seus orçamentos aqui.
            </p>
          </div>
          <Link href="/projects/new">
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Button>
          </Link>
        </div>

        {/* Banner de Alerta - Configurações Não Personalizadas */}
        {hasCustomSettings === false && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <Settings className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-500">Configure sua Empresa</AlertTitle>
            <AlertDescription>
              Você ainda não personalizou suas configurações de impostos e BDI. 
              Orçamentos gerados usarão valores padrão, o que pode afetar a precisão.
              <Link href="/settings" className="ml-2 text-primary hover:underline font-medium">
                Configurar agora →
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Projetos</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Em Processamento</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rascunhos</CardTitle>
              <FileText className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.draft}</div>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle>Projetos Recentes</CardTitle>
            <CardDescription>
              Lista de todos os seus orçamentos e propostas
            </CardDescription>
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
              <div className="space-y-4">
                {projects.map(project => {
                  const status = statusConfig[project.status as keyof typeof statusConfig] || 
                    { label: project.status || "Desconhecido", color: "bg-slate-500", icon: FileText };
                  const StatusIcon = status.icon;
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className={`h-12 w-12 rounded-full ${status.color}/20 flex items-center justify-center`}>
                          <StatusIcon className={`h-6 w-6 ${status.color.replace('bg-', 'text-')}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{project.name}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {project.description || "Sem descrição"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {project.contractType === "obra" ? "Obra" : "Manutenção"}
                            </Badge>
                            {project.location && (
                              <span className="text-xs text-muted-foreground">
                                {project.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge className={status.color}>
                            {status.label}
                          </Badge>
                          {project.totalPrice && (
                            <span className="font-semibold text-green-600">
                              R$ {Number(project.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum projeto ainda</h3>
                <p className="text-muted-foreground mb-4">
                  Crie seu primeiro orçamento para começar
                </p>
                <Link href="/projects/new">
                  <Button className="bg-primary hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Orçamento
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
