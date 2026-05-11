/**
 * Extrai os totais finais de um projeto a partir dos outputs dos agentes,
 * aplicando o `splitBudgetAndLogistics` determinístico antes de calcular.
 *
 * Por que aplicar o split aqui (e não confiar só nos outputs do LLM):
 * o agente Orçamentista frequentemente enfia itens de logística
 * (mobilização, container, frete, taxa horário aeroportuário) dentro do
 * array `budgetItems`. O agente Logística depois reporta `totalLogisticsCost`
 * baixo ou zero — porque a "logística real" já vai como custo direto.
 *
 * Resultado sem split: `confirmProposal` grava `totalCostDirect` inflado
 * (custo + logística somados) e `totalCostIndirect = 0`. Foi exatamente
 * o bug que aparecia no dashboard: "Logística R$ 0,00".
 *
 * O `splitBudgetAndLogistics` é o mesmo algoritmo que o gerador de XLSX
 * usa — classifica por palavra-chave (frete, container, mobilização, taxa
 * horário, etc) e separa em duas listas. Aplicando aqui, o card do
 * dashboard passa a refletir a mesma separação da planilha.
 *
 * Fonte do `totalPrice`: `comercialOutput.finalPrice` continua sendo a
 * fonte canônica (custo base × (1 + BDI NBR 12721) com tributos por
 * dentro). O split só corrige a apresentação dos subtotais.
 */

import { splitBudgetAndLogistics } from "./xlsx/budgetLogisticsSplit";

export interface ProjectFinalTotals {
  /** Soma dos itens de custo direto **após split** (sem BDI, sem logística). */
  totalCostDirect: number;
  /** Soma dos itens de logística **após split** (sem BDI). */
  totalCostIndirect: number;
  /** Markup completo (BDI consolidado em R$, inclui tributos por dentro). */
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
 * quando agentes essenciais ainda não rodaram. O caller decide o que
 * fazer — tipicamente, não gravar nada e logar.
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

  if (!orcOutput || !comercialOutput) {
    return null;
  }

  // Aplica split determinístico — mesmo algoritmo do gerador de XLSX.
  // Sem isso, totalCostDirect vinha somando logística que o LLM enfiou
  // nos budget_items, e totalCostIndirect vinha zerado.
  const budgetItems = Array.isArray(orcOutput.budgetItems)
    ? orcOutput.budgetItems
    : [];
  const logisticsList =
    logOutput && Array.isArray(logOutput.costs)
      ? logOutput.costs
      : logOutput && Array.isArray(logOutput.logisticsCosts)
        ? logOutput.logisticsCosts
        : [];

  const split = splitBudgetAndLogistics(budgetItems as any, logisticsList);

  const totalCostDirect = split.cleanBudgetItems.reduce(
    (sum, item: any) => sum + Number(item.totalCost ?? 0),
    0
  );
  const totalCostIndirect = split.consolidatedLogistics.reduce(
    (sum, cost: any) => sum + Number(cost.totalCost ?? 0),
    0
  );

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
