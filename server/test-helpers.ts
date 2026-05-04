import type { BudgetItemDetail } from "../shared/agents";

/**
 * Gera N itens de orçamento mock para uso em testes. Distribui entre 4
 * categorias e 3 unidades para cobrir variação típica de obra real.
 *
 * Usado por P0.4 (auditor chunking, gestao summarizer) e P1.3 (dedup).
 */
export function generateMockBudgetItems(count: number): BudgetItemDetail[] {
  const categories = ["Estrutura", "Instalações", "Acabamento", "Logística"];
  const units = ["m²", "un", "m³"];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    category: categories[i % categories.length],
    code: `SINAPI-${1000 + i}`,
    description: `Item teste ${i + 1}`,
    unit: units[i % units.length],
    quantity: 10 + i,
    unitCostMaterial: 50,
    unitCostLabor: 30,
    unitCostLogistics: 5,
    unitCostTotal: 85,
    totalCost: 85 * (10 + i),
    taxType: "iss",
    taxAmount: 0,
    bdiAmount: 0,
    finalPrice: 0,
    source: "sinapi",
    sourceCode: `SINAPI-${1000 + i}`,
    sourceDate: "2025-01-01",
  }));
}

/**
 * Gera N itens com uma duplicata plantada na posição `duplicateIndex`.
 * O item duplicado tem a mesma `description` que o item da posição 0 —
 * útil para validar que o Auditor com chunking ainda detecta duplicatas
 * que caem em chunks diferentes (depende de P1.3 para dedup pós-merge,
 * mas o Auditor já pode flaggar).
 */
export function generateMockBudgetItemsWithPlantedDuplicate(
  count: number,
  duplicateIndex: number
): BudgetItemDetail[] {
  const items = generateMockBudgetItems(count);
  if (duplicateIndex > 0 && duplicateIndex < items.length) {
    items[duplicateIndex] = {
      ...items[duplicateIndex],
      description: items[0].description,
      category: items[0].category,
      unit: items[0].unit,
    };
  }
  return items;
}
