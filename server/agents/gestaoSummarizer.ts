import type { BudgetItemDetail } from "../../shared/agents";

export interface CategorySummary {
  category: string;
  itemCount: number;
  totalCost: number;
  totalQuantityByUnit: Record<string, number>;
  topItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    totalCost: number;
  }>;
}

/**
 * P0.4: substituto do `slice(0, 30)` do Gestão de Projetos. Agrupa
 * `budgetItems` por categoria e retorna agregados (count, custo total,
 * quantidades por unidade, top N itens por custo).
 *
 * O Gestão usa essa visão agregada para estimar prazo via SINAPI sem
 * precisar ver cada item individual — em obras grandes, isso reduz tokens
 * sem truncar dados.
 *
 * Itens com `isSummaryItem === true` são pulados (são pais hierárquicos
 * já contabilizados pelos filhos).
 */
export function summarizeByCategory(
  budgetItems: BudgetItemDetail[],
  topN = 5
): CategorySummary[] {
  const groups = new Map<string, BudgetItemDetail[]>();

  for (const item of budgetItems) {
    if ((item as { isSummaryItem?: boolean }).isSummaryItem) continue;
    const cat = item.category || "Sem categoria";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }

  return Array.from(groups.entries()).map(([category, items]) => {
    const sorted = [...items].sort((a, b) => b.totalCost - a.totalCost);
    const topItems = sorted.slice(0, topN).map(i => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      totalCost: i.totalCost,
    }));

    const totalQuantityByUnit: Record<string, number> = {};
    for (const i of items) {
      totalQuantityByUnit[i.unit] =
        (totalQuantityByUnit[i.unit] ?? 0) + i.quantity;
    }

    return {
      category,
      itemCount: items.length,
      totalCost: items.reduce((s, i) => s + i.totalCost, 0),
      totalQuantityByUnit,
      topItems,
    };
  });
}
