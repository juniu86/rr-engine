/**
 * Extrai os totais finais de um projeto a partir dos outputs dos agentes.
 *
 * Por que não somar `budget_items` direto da DB:
 * o LLM frequentemente coloca itens de logística (frete, container, tapume)
 * dentro de `budget_items`, e o split correto só roda na hora de gerar o
 * XLSX (via `splitBudgetAndLogistics`). Somar a tabela direto duplica os
 * valores: aparece no "custo direto" e a logística sai zerada.
 *
 * Solução: usar os outputs dos agentes — o Orçamentista expõe
 * `totalDirectCost` e o agente Logística expõe `totalLogisticsCost` já
 * separados. Esses são a fonte canônica.
 */

export interface ProjectFinalTotals {
  /** Soma dos itens de custo direto (sem BDI, sem logística). */
  totalCostDirect: number;
  /** Soma dos itens de logística (sem BDI). */
  totalCostIndirect: number;
  /** Markup completo aplicado (BDI consolidado em R$, inclui tributos por dentro). */
  totalBdi: number;
  /** Tributos calculados pelo Tributário (referência fiscal). */
  totalTaxes: number;
  /** Preço final de venda (cliente paga este valor — tributos já dentro). */
  totalPrice: number;
}

interface AgentExecutionRecord {
  agentType: string;
  status: string;
  output: any;
}

/**
 * Extrai totais finais a partir das execuções dos agentes. Retorna `null`
 * quando agentes essenciais ainda não rodaram (Orçamentista, Logística,
 * Tributário, Comercial). O caller decide o que fazer com isso —
 * tipicamente, não gravar nada e logar.
 */
export function extractFinalTotalsFromExecutions(
  executions: AgentExecutionRecord[]
): ProjectFinalTotals | null {
  const findOutput = (type: string): any => {
    const exec = executions.find(
      e => e.agentType === type && e.status === "completed" && e.output
    );
    return exec?.output ?? null;
  };

  const orcOutput = findOutput("orcamentista");
  const logOutput = findOutput("logistica");
  const tribOutput = findOutput("tributario");
  const comercialOutput = findOutput("comercial");

  if (!orcOutput || !logOutput || !comercialOutput) {
    return null;
  }

  const totalCostDirect = Number(orcOutput.totalDirectCost) || 0;
  const totalCostIndirect =
    Number(logOutput.totalLogisticsCost ?? logOutput.totalCost) || 0;
  const totalTaxes = tribOutput ? Number(tribOutput.totalTaxes) || 0 : 0;
  const totalPrice = Number(comercialOutput.finalPrice) || 0;
  const totalBdi = Number(comercialOutput.totalBdiAmount) || 0;

  return {
    totalCostDirect: round2(totalCostDirect),
    totalCostIndirect: round2(totalCostIndirect),
    totalBdi: round2(totalBdi),
    totalTaxes: round2(totalTaxes),
    totalPrice: round2(totalPrice),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
