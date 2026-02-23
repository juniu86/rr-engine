/**
 * v2.10 - Cálculo Determinístico de Fluxo de Caixa
 * 
 * Resolve o problema do Agente Financeiro (LLM) que confundia preço de venda com custo,
 * gerando saldo final negativo em projetos lucrativos.
 * 
 * Agora o fluxo de caixa é calculado no backend de forma determinística:
 * - Custos distribuídos uniformemente por semana
 * - Receitas: 40% na semana 1 (adiantamento) + 60% na última semana (saldo final)
 * - Saldo acumulado semana a semana
 * - Validação: saldo final = margem bruta (preço - custo)
 */

import type { FinanceiroOutput } from "../../shared/agents";

export interface BillingInstallment {
  name: string;
  percentage: number; // 0-100
}

export interface DeterministicCashFlowInput {
  totalCost: number;      // Custo direto + logística
  totalPrice: number;     // Preço de venda (do Comercial)
  totalDuration: number;  // Duração em semanas
  totalTaxes?: number;    // Impostos (para cálculo de margem líquida)
  billingInstallments?: BillingInstallment[]; // Parcelas de faturamento (default: 40% entrada + 60% final)
}

export interface CashFlowItem {
  week: number;
  expense: number;
  income: number;
  balance: number;
}

export interface DeterministicCashFlowResult {
  cashFlow: CashFlowItem[];
  maxExposure: number;
  needsAdvance: boolean;
  suggestedAdvance: number;
  alerts: string[];
  // Margens calculadas
  grossMargin: number;
  grossMarginPercent: number;
  netMargin: number;
  netMarginPercent: number;
}

/**
 * Calcula o fluxo de caixa de forma determinística (sem LLM).
 * Regra de faturamento: 40% adiantamento (semana 1) + 60% saldo final (última semana).
 * Custos distribuídos uniformemente ao longo das semanas.
 */
export function calculateDeterministicCashFlow(input: DeterministicCashFlowInput): DeterministicCashFlowResult {
  const { totalCost, totalPrice, totalDuration, totalTaxes = 0, billingInstallments } = input;

  // Garantir duração mínima de 1 semana
  const duration = Math.max(1, totalDuration);

  // Distribuir custos uniformemente por semana
  const weeklyExpense = totalCost / duration;

  // Receitas distribuídas conforme parcelas configuradas
  // Default: 40% semana 1, 60% última semana
  const installments = (billingInstallments && billingInstallments.length >= 2)
    ? billingInstallments
    : [{ name: "Entrada", percentage: 40 }, { name: "Final", percentage: 60 }];

  // Distribuir parcelas uniformemente ao longo das semanas
  const incomeByWeek = new Map<number, number>();
  installments.forEach((inst, idx) => {
    // First installment → week 1, last → last week, middle → evenly distributed
    let week: number;
    if (idx === 0) week = 1;
    else if (idx === installments.length - 1) week = duration;
    else week = Math.max(1, Math.round((idx / (installments.length - 1)) * duration));
    const amount = totalPrice * (inst.percentage / 100);
    incomeByWeek.set(week, (incomeByWeek.get(week) || 0) + amount);
  });

  const adiantamento = incomeByWeek.get(1) || 0;
  
  // Calcular fluxo de caixa semanal
  const cashFlow: CashFlowItem[] = [];
  let cumulativeBalance = 0;
  let maxExposure = 0;
  
  for (let week = 1; week <= duration; week++) {
    const expense = Math.round(weeklyExpense * 100) / 100;
    const income = incomeByWeek.get(week) || 0;
    cumulativeBalance += income - expense;
    
    cashFlow.push({
      week,
      expense: Math.round(expense * 100) / 100,
      income: Math.round(income * 100) / 100,
      balance: Math.round(cumulativeBalance * 100) / 100,
    });
    
    if (cumulativeBalance < maxExposure) {
      maxExposure = cumulativeBalance;
    }
  }
  
  // Validar saldo final = margem bruta
  const expectedFinalBalance = totalPrice - totalCost;
  if (Math.abs(cumulativeBalance - expectedFinalBalance) > 1) {
    console.warn(`[Financeiro] Saldo final com arredondamento: ${cumulativeBalance.toFixed(2)} vs. esperado ${expectedFinalBalance.toFixed(2)}`);
  }
  
  // Gerar alertas
  const alerts: string[] = [];
  if (maxExposure < 0) {
    alerts.push(`Capital de giro necessário: R$ ${Math.abs(maxExposure).toFixed(2)}`);
  }
  if (cumulativeBalance < 0) {
    alerts.push(`ALERTA: Saldo final negativo (R$ ${cumulativeBalance.toFixed(2)}). Projeto com prejuízo.`);
  }
  if (totalPrice <= totalCost) {
    alerts.push(`ALERTA: Preço de venda (R$ ${totalPrice.toFixed(2)}) menor ou igual ao custo (R$ ${totalCost.toFixed(2)}). Margem negativa.`);
  }
  
  // Calcular margens
  const grossMargin = totalPrice - totalCost;
  const grossMarginPercent = totalPrice > 0 ? (grossMargin / totalPrice) * 100 : 0;
  const netMargin = totalPrice - totalCost - totalTaxes;
  const netMarginPercent = totalPrice > 0 ? (netMargin / totalPrice) * 100 : 0;
  
  return {
    cashFlow,
    maxExposure: Math.round(Math.abs(maxExposure) * 100) / 100,
    needsAdvance: maxExposure < 0, // True se há exposição negativa de caixa
    suggestedAdvance: Math.round(adiantamento * 100) / 100,
    alerts,
    grossMargin: Math.round(grossMargin * 100) / 100,
    grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
    netMargin: Math.round(netMargin * 100) / 100,
    netMarginPercent: Math.round(netMarginPercent * 100) / 100,
  };
}

/**
 * Constrói o output determinístico do Financeiro, substituindo o output da LLM.
 * Preserva campos de análise qualitativa da LLM quando disponíveis.
 */
export function buildDeterministicFinanceiroOutput(
  deterministicResult: DeterministicCashFlowResult,
  llmOutput?: any
): FinanceiroOutput {
  return {
    cashFlow: deterministicResult.cashFlow,
    maxExposure: deterministicResult.maxExposure,
    needsAdvance: deterministicResult.needsAdvance,
    suggestedAdvance: deterministicResult.suggestedAdvance,
    alerts: [
      ...deterministicResult.alerts,
      ...(llmOutput?.alerts || []).filter((a: string) => 
        !a.includes("Capital de giro") && !a.includes("Saldo final")
      ),
    ],
    grossMargin: deterministicResult.grossMargin,
    grossMarginPercent: deterministicResult.grossMarginPercent,
    netMargin: deterministicResult.netMargin,
    netMarginPercent: deterministicResult.netMarginPercent,
  };
}
