import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Check, 
  CreditCard, 
  Zap, 
  Crown, 
  ArrowRight, 
  ExternalLink,
  Loader2,
  AlertCircle,
  BarChart3,
  FileText
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useEffect } from "react";
import { useSearch } from "wouter";

export default function Planos() {
  const { user } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentStatus = params.get("payment");

  const { data: plans, isLoading: plansLoading } = trpc.stripe.getPlans.useQuery();
  const { data: planInfo, isLoading: planInfoLoading } = trpc.stripe.getPlanInfo.useQuery();
  const { data: budgetCheck } = trpc.stripe.canCreateBudget.useQuery();

  const subscriptionCheckout = trpc.stripe.createSubscriptionCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err) => {
      toast.error("Erro ao iniciar checkout: " + err.message);
    },
  });

  const singleCheckout = trpc.stripe.createSingleBudgetCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err) => {
      toast.error("Erro ao iniciar checkout: " + err.message);
    },
  });

  const portalSession = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Mostrar toast de sucesso/cancelamento ao retornar do checkout
  useEffect(() => {
    if (paymentStatus === "success") {
      toast.success("Pagamento realizado com sucesso! Seu plano já está ativo.");
    } else if (paymentStatus === "canceled") {
      toast.info("Checkout cancelado. Você pode tentar novamente quando quiser.");
    }
  }, [paymentStatus]);

  const isLoading = plansLoading || planInfoLoading;

  const hasActiveSubscription = planInfo?.subscription?.status === "active" && planInfo?.subscription?.plan === "mensal";
  const creditsAvailable = planInfo?.credits?.available || 0;

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Planos e Pagamentos</h1>
          <p className="text-muted-foreground mt-1">
            Escolha o plano ideal para sua operação de engenharia.
          </p>
        </div>

        {/* Status atual do plano */}
        {!isLoading && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">
                      {hasActiveSubscription
                        ? "Plano Profissional Ativo"
                        : creditsAvailable > 0
                        ? `${creditsAvailable} crédito(s) avulso(s) disponível(is)`
                        : "Sem plano ativo"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {hasActiveSubscription && planInfo?.subscription
                        ? `${planInfo.subscription.quotaUsed}/${planInfo.subscription.quotaLimit} orçamentos usados neste período`
                        : creditsAvailable > 0
                        ? "Cada crédito permite gerar 1 orçamento completo"
                        : "Assine um plano ou compre créditos para criar orçamentos"}
                    </p>
                  </div>
                </div>
                {hasActiveSubscription && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-green-500 text-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => portalSession.mutate()}
                      disabled={portalSession.isPending}
                    >
                      {portalSession.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-1" />
                      )}
                      Gerenciar Assinatura
                    </Button>
                  </div>
                )}
              </div>

              {/* Barra de uso para assinatura mensal */}
              {hasActiveSubscription && planInfo?.subscription && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Orçamentos utilizados</span>
                    <span className="font-medium">
                      {planInfo.subscription.quotaUsed} de {planInfo.subscription.quotaLimit}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          ((planInfo.subscription.quotaUsed || 0) / (planInfo.subscription.quotaLimit || 10)) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  {planInfo.subscription.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Renova em {new Date(planInfo.subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
          </div>
        )}

        {/* Cards de planos */}
        {!isLoading && plans && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plano Mensal */}
            <Card className={`relative overflow-hidden transition-all hover:shadow-lg ${
              hasActiveSubscription ? "border-primary ring-1 ring-primary/20" : "border-border"
            }`}>
              {/* Badge de destaque */}
              <div className="absolute top-0 right-0">
                <div className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-lg">
                  Mais Popular
                </div>
              </div>

              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">{plans.mensal.name}</CardTitle>
                </div>
                <CardDescription>{plans.mensal.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">R$ 450</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {plans.mensal.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter>
                {hasActiveSubscription ? (
                  <Button className="w-full" variant="outline" disabled>
                    <Check className="h-4 w-4 mr-2" />
                    Plano Atual
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => subscriptionCheckout.mutate()}
                    disabled={subscriptionCheckout.isPending}
                  >
                    {subscriptionCheckout.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Assinar Agora
                  </Button>
                )}
              </CardFooter>
            </Card>

            {/* Orçamento Avulso */}
            <Card className="relative overflow-hidden transition-all hover:shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-5 w-5 text-accent" />
                  <CardTitle className="text-xl">{plans.avulso.name}</CardTitle>
                </div>
                <CardDescription>{plans.avulso.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">R$ 89</span>
                  <span className="text-lg font-bold">,90</span>
                  <span className="text-muted-foreground"> /orçamento</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {plans.avulso.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => singleCheckout.mutate({ quantity: 1 })}
                  disabled={singleCheckout.isPending}
                >
                  {singleCheckout.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Comprar 1 Orçamento
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Comparativo de planos */}
        {!isLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Comparativo de Planos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Recurso</th>
                      <th className="text-center py-3 px-2 font-medium">Profissional</th>
                      <th className="text-center py-3 px-2 font-medium">Avulso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: "Orçamentos por mês", pro: "Até 10", avulso: "1 por compra" },
                      { feature: "Agentes de IA", pro: "10 especializados", avulso: "10 especializados" },
                      { feature: "SINAPI em tempo real", pro: "Sim", avulso: "Sim" },
                      { feature: "PINI TCPO", pro: "Sim", avulso: "Sim" },
                      { feature: "Exportação XLSX/PDF", pro: "Sim", avulso: "Sim" },
                      { feature: "Histórico de interações", pro: "Completo", avulso: "Completo" },
                      { feature: "Suporte prioritário", pro: "Sim", avulso: "Não" },
                      { feature: "Custo por orçamento", pro: "R$ 45,00", avulso: "R$ 89,90" },
                    ].map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 px-2 text-muted-foreground">{row.feature}</td>
                        <td className="py-3 px-2 text-center">
                          {row.pro === "Sim" ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : row.pro === "Não" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="font-medium">{row.pro}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {row.avulso === "Sim" ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : row.avulso === "Não" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="font-medium">{row.avulso}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Créditos avulsos */}
        {!isLoading && creditsAvailable > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Créditos Avulsos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{creditsAvailable}</p>
                  <p className="text-sm text-muted-foreground">crédito(s) disponível(is)</p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>Total comprado: {planInfo?.credits?.total || 0}</p>
                  <p>Já utilizado: {planInfo?.credits?.used || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
