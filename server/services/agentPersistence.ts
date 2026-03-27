/**
 * Shared agent persistence logic.
 *
 * Extracted from routers.ts to eliminate 4x duplicated code for saving
 * budget items, logistics costs, schedule items, and cash flow.
 */

import * as db from "../db";
import type { AgentType } from "../../shared/agents";

// ==================== LOGISTICS CATEGORY MAPPING ====================

type LogisticsCategory = 'frete' | 'bota_fora' | 'deslocamento' | 'hospedagem' | 'alimentacao' | 'equipamentos' | 'outros';

export function mapLogisticsCategory(rawCategory: string): LogisticsCategory {
  const lower = (rawCategory || '').toLowerCase();
  if (lower.includes('frete') || lower.includes('transporte')) return 'frete';
  if (lower.includes('bota') || lower.includes('resíduo') || lower.includes('entulho')) return 'bota_fora';
  if (lower.includes('desloc') || lower.includes('viagem')) return 'deslocamento';
  if (lower.includes('hosped') || lower.includes('hotel')) return 'hospedagem';
  if (lower.includes('aliment') || lower.includes('refeiç')) return 'alimentacao';
  if (lower.includes('equip') || lower.includes('ferramenta')) return 'equipamentos';
  return 'outros';
}

// ==================== BUDGET ITEMS ====================

export async function persistBudgetItems(
  projectId: number,
  rawItems: any[],
  bdiPercent: number,
): Promise<void> {
  await db.deleteBudgetItemsByProjectId(projectId);

  // Passo 1: Filtrar itens PAI/RESUMO (isSummaryItem=true) para evitar duplicação
  const filteredItems = rawItems.filter((item: any) => !item.isSummaryItem);

  // Passo 4: Deduplicar por description+unit+category
  const deduplicatedItems = deduplicateBudgetItems(filteredItems);

  // Correção C: Garantir itemNumber/code único (sufixo para duplicatas)
  const pricingItems = deduplicateItemNumbers(deduplicatedItems);

  const items = pricingItems.map((item: any) => {
    const quantity = Number(item.quantity) || 0;
    const unitCostTotal = Number(item.unitCostTotal) || 0;
    const totalCost = quantity * unitCostTotal;
    const bdiAmount = totalCost * bdiPercent;
    const finalPrice = totalCost + bdiAmount;
    return {
      projectId,
      category: item.category || 'Geral',
      code: item.code || '',
      description: item.description,
      unit: (item.unit || '').substring(0, 20),
      quantity: String(quantity),
      unitCostMaterial: String(item.unitCostMaterial || 0),
      unitCostLabor: String(item.unitCostLabor || 0),
      unitCostLogistics: String(item.unitCostLogistics || 0),
      unitCostTotal: String(unitCostTotal),
      totalCost: String(totalCost),
      bdiAmount: String(bdiAmount),
      finalPrice: String(finalPrice),
      taxAmount: String(item.taxAmount || 0),
      source: item.source || 'Estimativa',
      sourceCode: item.sourceCode || null,
      sourceDate: (item.sourceDate || '').substring(0, 20) || null,
    };
  });
  await db.createBudgetItems(items);
}

// ==================== LOGISTICS COSTS ====================

export async function persistLogisticsCosts(
  projectId: number,
  rawCosts: any[],
): Promise<void> {
  await db.deleteLogisticsCostsByProjectId(projectId);
  const costs = rawCosts.map((cost: any) => ({
    projectId,
    category: mapLogisticsCategory(cost.category),
    description: String(cost.description || 'Custo logístico').substring(0, 1000),
    quantity: String(Number(cost.quantity) || 1),
    unit: String(cost.unit || 'un').substring(0, 20),
    unitCost: String(Number(cost.unitCost) || 0),
    totalCost: String(Number(cost.totalCost) || 0),
  }));
  await db.createLogisticsCosts(costs);
}

// ==================== SCHEDULE ITEMS ====================

export async function persistScheduleItems(
  projectId: number,
  rawSchedule: any[],
): Promise<void> {
  await db.deleteScheduleItemsByProjectId(projectId);
  const items = rawSchedule.map((item: any) => {
    const startDay = item.startDay || item.startWeek || 1;
    const endDay = item.endDay || item.endWeek || startDay;
    const startWeek = Math.ceil(startDay / 7) || 1;
    const endWeek = Math.ceil(endDay / 7) || startWeek;
    return {
      projectId,
      description: item.activity || item.description || item.phase || 'Atividade',
      startWeek,
      duration: endWeek - startWeek + 1,
      dependencies: item.dependencies ? JSON.stringify(item.dependencies) : null,
    };
  });
  await db.createScheduleItems(items);
}

// ==================== CASH FLOW ====================

export async function persistCashFlowItems(
  projectId: number,
  cashFlowItems: Array<{ week: number; expense: number; income: number; balance: number }>,
): Promise<void> {
  await db.deleteCashFlowItemsByProjectId(projectId);
  const items = cashFlowItems.map((item) => ({
    projectId,
    weekNumber: item.week,
    plannedExpense: String(item.expense),
    plannedIncome: String(item.income),
    actualExpense: null,
    actualIncome: null,
    cashBalance: String(item.balance),
    hasAlert: item.balance < 0,
  }));
  await db.createCashFlowItems(items);
}

// ==================== PERSIST ALL AGENT OUTPUTS ====================

/**
 * Persists the derived data for an agent execution.
 * Call after each agent completes to save its side-effect data to the DB.
 */
export async function persistAgentOutput(
  agentType: AgentType,
  projectId: number,
  output: any,
  opts: {
    bdiPercent: number;
    executions?: any[];
    agentInput?: any;
  },
): Promise<any> {
  let finalOutput = output;

  if (agentType === 'orcamentista' && output?.budgetItems) {
    await persistBudgetItems(projectId, output.budgetItems, opts.bdiPercent);
  }

  if (agentType === 'logistica' && output?.costs) {
    try {
      await persistLogisticsCosts(projectId, output.costs);
    } catch (err) {
      console.error('[Logistica] Error saving costs:', err);
    }
  }

  if (agentType === 'gestao_projetos' && output?.schedule) {
    await persistScheduleItems(projectId, output.schedule);
  }

  if (agentType === 'financeiro') {
    const { calculateDeterministicCashFlow, buildDeterministicFinanceiroOutput } = await import('./deterministicCashFlow');
    const finInput = opts.agentInput || {};
    const tributarioExec = opts.executions?.find((e: any) => e.agentType === 'tributario');
    const totalTaxes = tributarioExec?.output ? Number((tributarioExec.output as any).totalTaxes) || 0 : 0;

    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: finInput.totalCost || 0,
      totalPrice: finInput.totalPrice || 0,
      totalDuration: finInput.cashFlow?.length || 4,
      totalTaxes,
    });

    finalOutput = buildDeterministicFinanceiroOutput(deterministicResult, output);
    await persistCashFlowItems(projectId, deterministicResult.cashFlow);

    console.log(`[Financeiro] Determinístico: Saldo final R$ ${deterministicResult.cashFlow[deterministicResult.cashFlow.length - 1]?.balance.toFixed(2)}`);
  }

  return finalOutput;
}

// ==================== DEDUPLICATION ====================

/**
 * Remove duplicate budget items based on normalized description + unit + category.
 * Keeps the item with the highest totalCost when duplicates are found.
 */
function deduplicateBudgetItems(items: any[]): any[] {
  const seen = new Map<string, { item: any; index: number }>();
  const result: any[] = [];

  for (const item of items) {
    const key = `${normalizeForDedup(item.description || '')}|${(item.unit || '').toLowerCase()}|${(item.category || '').toLowerCase()}`;

    const existing = seen.get(key);
    if (existing) {
      // Keep the item with higher total cost (more detailed pricing)
      const existingCost = Number(existing.item.totalCost) || Number(existing.item.quantity || 0) * Number(existing.item.unitCostTotal || 0);
      const newCost = Number(item.totalCost) || Number(item.quantity || 0) * Number(item.unitCostTotal || 0);

      if (newCost > existingCost) {
        result[existing.index] = item;
        seen.set(key, { item, index: existing.index });
      }
      continue; // Skip duplicate
    }

    seen.set(key, { item, index: result.length });
    result.push(item);
  }

  return result;
}

/**
 * Normalize description text for deduplication comparison.
 * Removes accents, common prefixes, and punctuation.
 */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\b(fornecimento|instalacao|execucao|servico|pacote)\s*(de|e|do|da|dos|das)?\s*/g, '');
}

/**
 * Ensure unique itemNumber/code for all budget items.
 * When two items share the same code but have different descriptions,
 * the duplicate gets a numeric suffix (.1, .2, etc.).
 */
function deduplicateItemNumbers(items: any[]): any[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const code = item.code || '';
    if (!code) return item;
    const count = seen.get(code) || 0;
    seen.set(code, count + 1);
    if (count > 0) {
      return { ...item, code: `${code}.${count}` };
    }
    return item;
  });
}
