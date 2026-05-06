/**
 * Sprint 5 (P1.7): catálogo de tiers Stripe.
 *
 * Tabela canônica:
 *
 * | Tier     | Preço/mês (BRL) | Quota orçamentos | Cap por obra (BRL) |
 * | -------- | --------------- | ---------------- | ------------------ |
 * | Starter  |        199,00   | 5 / mês          | 500.000,00         |
 * | Pro      |        499,00   | 20 / mês         | 5.000.000,00       |
 * | Business |       1499,00   | ilimitado        | sem cap            |
 *
 * Price IDs vêm das variáveis de ambiente STRIPE_PRICE_{STARTER,PRO,BUSINESS}.
 * Em dev/test essas vars podem ficar vazias — só são exigidas pelo
 * createCheckout em produção.
 *
 * Legados: `mensal` (R$ 450 / 10 orç.) e `avulso` (R$ 89,90 por orçamento)
 * permanecem aqui para checkout pelos endpoints antigos
 * (createSubscriptionCheckout / createSingleBudgetCheckout). Não são listados
 * em listPlans — apenas Starter/Pro/Business são oferecidos a novos
 * assinantes.
 */

export type Tier = "starter" | "pro" | "business";

export interface TierDefinition {
  tier: Tier;
  name: string;
  description: string;
  priceMonthlyCents: number;
  currency: "BRL";
  /** null = ilimitado */
  quota: number | null;
  /** null = sem cap. Em centavos para evitar float. */
  capCents: number | null;
  features: string[];
  /** Lookup por env. Lazy: ler em tempo de uso, não no import. */
  envVar: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_BUSINESS";
}

export const TIERS: Record<Tier, TierDefinition> = {
  starter: {
    tier: "starter",
    name: "Starter",
    description:
      "Para profissionais autônomos e escritórios pequenos validando o produto.",
    priceMonthlyCents: 19900,
    currency: "BRL",
    quota: 5,
    capCents: 50_000_000, // R$ 500.000,00
    features: [
      "5 orçamentos por mês",
      "Cap de R$ 500.000 por obra",
      "10 agentes de IA especializados",
      "Exportação PDF/XLSX",
      "Suporte por e-mail",
    ],
    envVar: "STRIPE_PRICE_STARTER",
  },
  pro: {
    tier: "pro",
    name: "Pro",
    description:
      "Para construtoras e escritórios de orçamento com volume mensal médio.",
    priceMonthlyCents: 49900,
    currency: "BRL",
    quota: 20,
    capCents: 500_000_000, // R$ 5.000.000,00
    features: [
      "20 orçamentos por mês",
      "Cap de R$ 5.000.000 por obra",
      "10 agentes de IA especializados",
      "Exportação PDF/XLSX",
      "Suporte prioritário",
    ],
    envVar: "STRIPE_PRICE_PRO",
  },
  business: {
    tier: "business",
    name: "Business",
    description:
      "Para construtoras médias/grandes com volume alto e obras de qualquer porte.",
    priceMonthlyCents: 149900,
    currency: "BRL",
    quota: null,
    capCents: null,
    features: [
      "Orçamentos ilimitados",
      "Sem cap de valor por obra",
      "10 agentes de IA especializados",
      "Exportação PDF/XLSX",
      "Suporte dedicado",
      "Onboarding assistido",
    ],
    envVar: "STRIPE_PRICE_BUSINESS",
  },
};

/**
 * Resolve o Price ID configurado para um tier. Lança se a env var não
 * está configurada — chamado em createCheckout, momento em que faltar
 * o Price ID é falha de configuração crítica.
 */
export function getStripePriceId(tier: Tier): string {
  const def = TIERS[tier];
  const id = process.env[def.envVar];
  if (!id) {
    throw new Error(
      `${def.envVar} não configurado. Configure o Price ID do tier ${tier} no ambiente.`
    );
  }
  return id;
}

/**
 * Catálogo público para listPlans (sem segredos, com priceFormatted).
 */
export function listPublicTiers() {
  return (Object.values(TIERS) as TierDefinition[]).map(t => ({
    tier: t.tier,
    name: t.name,
    description: t.description,
    priceMonthly: t.priceMonthlyCents / 100,
    priceFormatted: formatBRL(t.priceMonthlyCents),
    currency: t.currency,
    quota: t.quota,
    cap: t.capCents === null ? null : t.capCents / 100,
    features: t.features,
    priceId: process.env[t.envVar] ?? null,
  }));
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// ─── Legados (Sprint 5 mantém para compat com checkouts antigos) ──────────────

export const PLANS = {
  mensal: {
    name: "Plano Profissional",
    description: "Até 10 orçamentos por mês com todos os agentes de IA",
    priceInCents: 45000,
    currency: "brl",
    interval: "month" as const,
    quotaLimit: 10,
    features: [
      "Até 10 orçamentos por mês",
      "10 agentes de IA especializados",
      "Base de referência atualizada de mercado",
      "Exportação XLSX e PDF",
      "Histórico completo de interações",
      "Suporte prioritário",
    ],
  },
  avulso: {
    name: "Orçamento Avulso",
    description: "Pagamento único por orçamento individual",
    priceInCents: 8990,
    currency: "brl",
    features: [
      "1 orçamento completo",
      "10 agentes de IA especializados",
      "Base de referência atualizada de mercado",
      "Exportação XLSX e PDF",
      "Histórico de interações",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;
