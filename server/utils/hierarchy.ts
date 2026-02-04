/**
 * Utilitários para hierarquia de itens de orçamento
 * 
 * Resolve o problema de duplicação de orçamentos quando o memorial
 * contém itens PAI (resumo) e FILHOS (componentes).
 */

export interface HierarchicalItem {
  itemNumber?: string;
  groupNumber?: string;
  description: string;
  quantity?: number;
  isSummaryItem?: boolean;
  parentGroupNumber?: string | null;
  totalCost?: number;
}

/**
 * Valida a hierarquia de itens, verificando se:
 * - Itens filhos referenciam pais existentes
 * - Itens resumo têm filhos
 * 
 * @param items - Lista de itens com hierarquia
 * @returns Resultado da validação com erros encontrados
 */
export function validateItemHierarchy(items: HierarchicalItem[]): { 
  isValid: boolean; 
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Criar mapa de itens por número
  const itemMap = new Map<string, HierarchicalItem>();
  for (const item of items) {
    const key = item.itemNumber || item.groupNumber || '';
    if (key) {
      itemMap.set(key, item);
    }
  }
  
  // Validar que itens pai existem para itens filhos
  for (const item of items) {
    if (item.parentGroupNumber) {
      const parentExists = itemMap.has(item.parentGroupNumber);
      if (!parentExists) {
        errors.push(`Item ${item.itemNumber || item.groupNumber} referencia pai ${item.parentGroupNumber} inexistente`);
      }
    }
  }
  
  // Validar que itens resumo têm filhos
  for (const item of items) {
    if (item.isSummaryItem) {
      const itemKey = item.itemNumber || item.groupNumber || '';
      const hasChildren = items.some(i => i.parentGroupNumber === itemKey);
      if (!hasChildren) {
        warnings.push(`Item resumo ${itemKey} não tem filhos declarados`);
      }
    }
  }
  
  return { 
    isValid: errors.length === 0, 
    errors,
    warnings,
  };
}

/**
 * Filtra itens para precificação, removendo itens resumo (PAI).
 * Apenas itens com isSummaryItem=false ou undefined devem ser precificados.
 * 
 * @param items - Lista completa de itens
 * @returns Lista de itens que devem ser precificados
 */
export function filterItemsForPricing(items: HierarchicalItem[]): HierarchicalItem[] {
  return items.filter(item => !item.isSummaryItem);
}

/**
 * Calcula o custo total considerando hierarquia.
 * Apenas itens que NÃO são resumo são somados.
 * 
 * @param items - Lista de itens com custos
 * @returns Custo total (apenas itens não-resumo)
 */
export function calculateTotalCostWithHierarchy(items: HierarchicalItem[]): number {
  return items
    .filter(item => !item.isSummaryItem)
    .reduce((sum, item) => sum + (item.totalCost || 0), 0);
}

/**
 * Identifica itens duplicados (mesmo item aparece como PAI e FILHO).
 * Útil para diagnóstico de problemas de hierarquia.
 * 
 * @param items - Lista de itens
 * @returns Lista de descrições potencialmente duplicadas
 */
export function findPotentialDuplicates(items: HierarchicalItem[]): string[] {
  const duplicates: string[] = [];
  const descriptions = new Map<string, number>();
  
  for (const item of items) {
    const desc = item.description.toLowerCase().trim();
    const count = descriptions.get(desc) || 0;
    descriptions.set(desc, count + 1);
  }
  
  descriptions.forEach((count, desc) => {
    if (count > 1) {
      duplicates.push(desc);
    }
  });
  
  return duplicates;
}

/**
 * Gera estatísticas de hierarquia para debug.
 * 
 * @param items - Lista de itens
 * @returns Estatísticas de hierarquia
 */
export function getHierarchyStats(items: HierarchicalItem[]): {
  totalItems: number;
  summaryItems: number;
  childItems: number;
  orphanItems: number;
} {
  const summaryItems = items.filter(i => i.isSummaryItem).length;
  const childItems = items.filter(i => i.parentGroupNumber).length;
  const orphanItems = items.filter(i => !i.isSummaryItem && !i.parentGroupNumber).length;
  
  return {
    totalItems: items.length,
    summaryItems,
    childItems,
    orphanItems,
  };
}
