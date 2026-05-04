/**
 * Produtos e Preços do RR-Engine
 * 
 * Plano Mensal: R$ 450/mês - até 10 orçamentos por mês
 * Avulso: R$ 89,90 por orçamento individual
 */

export const PLANS = {
  mensal: {
    name: "Plano Profissional",
    description: "Até 10 orçamentos por mês com todos os agentes de IA",
    priceInCents: 45000, // R$ 450,00
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
    priceInCents: 8990, // R$ 89,90
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
