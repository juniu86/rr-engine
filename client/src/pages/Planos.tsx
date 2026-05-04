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
  FileText,
  Receipt,
  Clock,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import Breadcrumbs from "@/components/Breadcrumbs";
import { cn } from "@/lib/utils";

export default function Planos() {
  const { user } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentStatus = params.get("payment");

  const [showComparison, setShowComparison] = useState(false);
  const [showFAQ, setShowFAQ] = useState<string | null>(null);

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

  useEffect(() => {
    if (paymentStatus === "success") {
      toast.success("Pagamento realizado com sucesso! Seu plano ja esta ativo.");
    } else if (paymentStatus === "canceled") {
      toast.info("Checkout cancelado. Voce pode tentar novamente quando quiser.");
    }
  }, [paymentStatus]);

  const isLoading = plansLoading || planInfoLoading;

  const hasActiveSubscription = planInfo?.subscription?.status === "active" && planInfo?.subscription?.plan === "mensal";
  const creditsAvailable = planInfo?.credits?.available || 0;

  const FAQ_ITEMS = [
    {
      id: "cancel",
      question: "Posso cancelar a assinatura a qualquer momento?",
      answer: "Sim! Voce pode cancelar pelo portal de gerenciamento. O acesso continua ate o fim do periodo pago."
    },
    {
      id: "credits",
      question: "Os creditos avulsos expiram?",
      answer: "Nao, creditos avulsos nao expiram. Voce pode usa-los quando quiser."
    },
    {
      id: "upgrade",
      question: "Posso trocar de plano no meio do mes?",
      answer: "Sim, ao assinar o plano Profissional voce ganha acesso imediato. O valor e proporcional ao periodo restante."
    },
    {
      id: "error",
      question: "Se um orcamento falhar, perco o credito?",
      answer: "Nao. O credito so e consumido quando o orcamento e processado com sucesso por todos os agentes."
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Planos e Pagamentos" },
        ]} />

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Planos e Pagamentos</h1>
          <p className="text-muted-foreground mt-1">
            Escolha o plano ideal para sua operacao de engenharia.
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
                        ? `${creditsAvailable} credito(s) avulso(s) disponivel(is)`
                        : "Sem plano ativo"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {hasActiveSubscription && planInfo?.subscription
                        ? `${planInfo.subscription.quotaUsed}/${planInfo.subscription.quotaLimit} orcamentos usados neste periodo`
                        : creditsAvailable > 0
                        ? "Cada credito permite gerar 1 orcamento completo"
                        : "Assine um plano ou compre creditos para criar orcamentos"}
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

              {hasActiveSubscription && planInfo?.subscription && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Orcamentos utilizados</span>
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

        {/* Cards de planos - section principal de conversao */}
        {!isLoading && plans && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plano Mensal */}
            <Card className={`relative overflow-hidden transition-all hover:shadow-lg ${
              hasActiveSubscription ? "border-primary ring-1 ring-primary/20" : "border-border"
            }`}>
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
                  <span className="text-muted-foreground">/mes</span>
                </div>
                <p className="text-xs text-primary mt-1">Custo por orcamento: R$ 45,00</p>
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

            {/* Orcamento Avulso */}
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
                  <span className="text-muted-foreground"> /orcamento</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Sem compromisso mensal</p>
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
                  Comprar 1 Orcamento
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Comparativo colapsavel */}
        {!isLoading && (
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setShowComparison(!showComparison)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Comparativo de Planos
                </CardTitle>
                {showComparison ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showComparison && (
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
                        { feature: "Orcamentos por mes", pro: "Ate 10", avulso: "1 por compra" },
                        { feature: "Agentes de IA", pro: "10 especializados", avulso: "10 especializados" },
                        { feature: "Base de referencia atualizada", pro: "Sim", avulso: "Sim" },
                        { feature: "Composicoes de servico (mao de obra + material)", pro: "Sim", avulso: "Sim" },
                        { feature: "Exportacao XLSX/PDF", pro: "Sim", avulso: "Sim" },
                        { feature: "Historico de interacoes", pro: "Completo", avulso: "Completo" },
                        { feature: "Suporte prioritario", pro: "Sim", avulso: "Nao" },
                        { feature: "Custo por orcamento", pro: "R$ 45,00", avulso: "R$ 89,90" },
                      ].map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3 px-2 text-muted-foreground">{row.feature}</td>
                          <td className="py-3 px-2 text-center">
                            {row.pro === "Sim" ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : row.pro === "Nao" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="font-medium">{row.pro}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {row.avulso === "Sim" ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : row.avulso === "Nao" ? (
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
            )}
          </Card>
        )}

        {/* FAQ */}
        {!isLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Perguntas Frequentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {FAQ_ITEMS.map((item) => (
                <div key={item.id} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowFAQ(showFAQ === item.id ? null : item.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-medium text-sm">{item.question}</span>
                    {showFAQ === item.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {showFAQ === item.id && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-muted-foreground">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Creditos avulsos */}
        {!isLoading && creditsAvailable > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Creditos Avulsos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{creditsAvailable}</p>
                  <p className="text-sm text-muted-foreground">credito(s) disponivel(is)</p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>Total comprado: {planInfo?.credits?.total || 0}</p>
                  <p>Ja utilizado: {planInfo?.credits?.used || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historico de Faturas - colapsavel */}
        <PaymentHistorySection />
      </div>
    </DashboardLayout>
  );
}

function PaymentHistorySection() {
  const { data: payments, isLoading } = trpc.stripe.getPaymentHistory.useQuery();
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setShowHistory(!showHistory)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Historico de Pagamentos
            </CardTitle>
            <CardDescription>
              Todos os pagamentos realizados na plataforma.
            </CardDescription>
          </div>
          {showHistory ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {showHistory && (
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !payments || payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nenhum pagamento registrado</p>
              <p className="text-sm mt-1">Seus pagamentos aparecerao aqui apos a primeira compra.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Data</th>
                    <th className="text-left py-3 px-2 font-medium">Descricao</th>
                    <th className="text-right py-3 px-2 font-medium">Valor</th>
                    <th className="text-center py-3 px-2 font-medium">Status</th>
                    <th className="text-center py-3 px-2 font-medium">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 text-muted-foreground">
                        {new Date(payment.date * 1000).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {payment.type === "subscription" ? (
                            <Crown className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                          )}
                          <span>{payment.description}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">
                        {(payment.amount / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: payment.currency.toUpperCase(),
                        })}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge
                          variant={payment.status === "succeeded" ? "default" : "secondary"}
                          className={payment.status === "succeeded" ? "bg-green-500/10 text-green-600 border-green-500/20" : ""}
                        >
                          {payment.status === "succeeded" ? "Pago" : payment.status === "pending" ? "Pendente" : payment.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {payment.receiptUrl ? (
                          <a
                            href={payment.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ver
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
