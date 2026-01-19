import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Users,
  FolderKanban,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Calendar,
  DollarSign,
  FileText,
} from "lucide-react";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // Fetch admin stats
  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery(undefined, {
    enabled: !!user,
  });
  
  // Fetch users list
  const { data: users, isLoading: usersLoading } = trpc.admin.getUsers.useQuery(undefined, {
    enabled: !!user,
  });
  
  // Fetch projects list
  const { data: projects, isLoading: projectsLoading } = trpc.admin.getProjects.useQuery(undefined, {
    enabled: !!user,
  });

  if (authLoading || statsLoading) {
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
      approved: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Aprovado" },
      review: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "Em Revisão" },
      rejected: { variant: "destructive", icon: <XCircle className="h-3 w-3" />, label: "Rejeitado" },
      draft: { variant: "outline", icon: <AlertCircle className="h-3 w-3" />, label: "Rascunho" },
      processing: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "Processando" },
      blocked: { variant: "destructive", icon: <XCircle className="h-3 w-3" />, label: "Bloqueado" },
      pending_confirmation: { variant: "secondary", icon: <AlertCircle className="h-3 w-3" />, label: "Aguardando Confirmação" },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Dashboard Administrativo</h1>
              <p className="text-sm text-muted-foreground">Métricas de uso e gestão do sistema</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeUsersLast30Days || 0} ativos nos últimos 30 dias
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Projetos</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalProjects || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.approvedProjects || 0} aprovados ({stats?.approvalRate || 0}%)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total Orçado</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.totalBudgetValue || 0)}</div>
              <p className="text-xs text-muted-foreground">
                Média: {formatCurrency(stats?.averageBudgetValue || 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documentos Gerados</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalDocuments || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.proposalsGenerated || 0} propostas comerciais
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Users and Projects */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Atividade
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Usuários Cadastrados</CardTitle>
                <CardDescription>
                  Lista de todos os usuários que acessaram a plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Projetos</TableHead>
                        <TableHead>Aprovados</TableHead>
                        <TableHead>Último Acesso</TableHead>
                        <TableHead>Cadastro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{u.projectCount}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-500/10 text-green-500">
                              {u.approvedCount}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(u.lastLogin)}</TableCell>
                          <TableCell>{formatDate(u.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                      {(!users || users.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhum usuário encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects">
            <Card>
              <CardHeader>
                <CardTitle>Projetos Recentes</CardTitle>
                <CardDescription>
                  Últimos orçamentos criados na plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projectsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Projeto</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Valor Final</TableHead>
                        <TableHead>Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects?.map((p) => (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/projects/${p.id}`)}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.userName}</TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell>{p.finalValue ? formatCurrency(p.finalValue) : "-"}</TableCell>
                          <TableCell>{formatDate(p.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                      {(!projects || projects.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhum projeto encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Resumo de Atividade</CardTitle>
                <CardDescription>
                  Métricas de uso da plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Projects by Status */}
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <FolderKanban className="h-4 w-4" />
                      Projetos por Status
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Aprovados</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${stats?.approvalRate || 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{stats?.approvedProjects || 0}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Em Revisão</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${((stats?.reviewProjects || 0) / (stats?.totalProjects || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{stats?.reviewProjects || 0}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Rejeitados</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-red-500 rounded-full"
                              style={{ width: `${((stats?.rejectedProjects || 0) / (stats?.totalProjects || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{stats?.rejectedProjects || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Atividade Recente
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-green-500/10 rounded-full">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Projetos esta semana</p>
                          <p className="text-xs text-muted-foreground">{stats?.projectsThisWeek || 0} novos orçamentos</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-blue-500/10 rounded-full">
                          <Users className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Usuários ativos</p>
                          <p className="text-xs text-muted-foreground">{stats?.activeUsersLast30Days || 0} nos últimos 30 dias</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Documentos gerados</p>
                          <p className="text-xs text-muted-foreground">{stats?.documentsThisWeek || 0} esta semana</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
