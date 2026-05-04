/**
 * P1.2: Financeiro determinístico — substitui o agente LLM.
 *
 * O agente Financeiro original recebia o cashFlow já calculado pelo backend
 * e usava a LLM apenas para gerar `alerts` em texto. Esta função pura aplica
 * regras de negócio explícitas — mesmo output, custo zero de tokens.
 */

import type { FinanceiroInput, FinanceiroOutput } from "../../shared/agents";

/**
 * Gera o output do Financeiro de forma 100% determinística.
 *
 * Regras de alerta:
 *   - Exposição máxima > 0 → alerta com a semana de pico, sugere medição.
 *   - Margem bruta entre 5% e 10% → warning.
 *   - Margem bruta < 5% → critical.
 *   - paymentTerms contém "30 dias" ou "60 dias" → alerta de capital de giro.
 *
 * `needsAdvance` é sempre `true` no modelo padrão da RR (40/60).
 * `suggestedAdvance` = totalPrice * 0.40.
 */
export function analyzeFinanceiro(input: FinanceiroInput): FinanceiroOutput {
  const cashFlow = input.cashFlow ?? [];
  const alerts: string[] = [];

  // Exposição máxima = magnitude do mínimo negativo do balance.
  const minBalance =
    cashFlow.length > 0 ? Math.min(...cashFlow.map(c => c.balance)) : 0;
  const maxExposure = minBalance < 0 ? Math.abs(minBalance) : 0;

  // Adiantamento sugerido (modelo padrão 40/60).
  const suggestedAdvance = input.totalPrice * 0.4;

  // Margens.
  const grossMargin = input.totalPrice - input.totalCost;
  const grossMarginPercent =
    input.totalPrice > 0 ? (grossMargin / input.totalPrice) * 100 : 0;
  // Tributos não vêm neste input — o Auditor recalcula com o totalTaxes
  // do agente Tributário. Aqui mantemos netMargin = grossMargin como
  // melhor estimativa local.
  const netMargin = grossMargin;
  const netMarginPercent = grossMarginPercent;

  // Regra: exposição.
  if (maxExposure > 0) {
    const week = cashFlow.find(c => c.balance === minBalance)?.week;
    alerts.push(
      `Exposição máxima de R$ ${maxExposure.toFixed(2)} prevista${
        week ? ` na semana ${week}` : ""
      }. Considerar medição intermediária.`
    );
  }

  // Regra: margem.
  if (grossMarginPercent < 5) {
    alerts.push(
      `Margem bruta crítica (${grossMarginPercent.toFixed(1)}%). Projeto inviável sem revisão.`
    );
  } else if (grossMarginPercent < 10) {
    alerts.push(
      `Margem bruta baixa (${grossMarginPercent.toFixed(1)}%). Revisar custos antes de fechar a proposta.`
    );
  }

  // Regra: prazo de recebimento estendido.
  if (input.paymentTerms) {
    const lower = input.paymentTerms.toLowerCase();
    if (lower.includes("30 dias") || lower.includes("60 dias")) {
      alerts.push(
        "Prazo de recebimento estendido. Considerar capital de giro suficiente para cobrir o ciclo."
      );
    }
  }

  return {
    cashFlow,
    maxExposure,
    needsAdvance: true,
    suggestedAdvance,
    alerts,
    grossMargin,
    grossMarginPercent,
    netMargin,
    netMarginPercent,
  };
}
