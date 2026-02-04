/**
 * Testes para hierarquia de itens de orçamento
 * 
 * Verifica que itens PAI (resumo) não são somados no total,
 * evitando duplicação de valores.
 */

import { describe, it, expect } from "vitest";
import { 
  validateItemHierarchy, 
  filterItemsForPricing,
  calculateTotalCostWithHierarchy,
  findPotentialDuplicates,
  getHierarchyStats,
  type HierarchicalItem 
} from "./hierarchy";

describe("validateItemHierarchy", () => {
  it("deve validar hierarquia correta", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo", isSummaryItem: true },
      { itemNumber: "3.1.1", description: "Estrutura", isSummaryItem: false, parentGroupNumber: "3.1" },
      { itemNumber: "3.1.2", description: "Telhas", isSummaryItem: false, parentGroupNumber: "3.1" },
    ];
    
    const result = validateItemHierarchy(items);
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("deve detectar pai inexistente", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1.1", description: "Estrutura", parentGroupNumber: "3.1" },
    ];
    
    const result = validateItemHierarchy(items);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Item 3.1.1 referencia pai 3.1 inexistente");
  });

  it("deve avisar sobre item resumo sem filhos", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo", isSummaryItem: true },
    ];
    
    const result = validateItemHierarchy(items);
    
    expect(result.warnings).toContain("Item resumo 3.1 não tem filhos declarados");
  });
});

describe("filterItemsForPricing", () => {
  it("deve remover itens resumo", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo", isSummaryItem: true },
      { itemNumber: "3.1.1", description: "Estrutura", isSummaryItem: false },
      { itemNumber: "3.1.2", description: "Telhas", isSummaryItem: false },
    ];
    
    const filtered = filterItemsForPricing(items);
    
    expect(filtered).toHaveLength(2);
    expect(filtered.map(i => i.itemNumber)).toEqual(["3.1.1", "3.1.2"]);
  });

  it("deve manter itens sem isSummaryItem definido", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "1.1", description: "Item normal" },
      { itemNumber: "1.2", description: "Outro item" },
    ];
    
    const filtered = filterItemsForPricing(items);
    
    expect(filtered).toHaveLength(2);
  });
});

describe("calculateTotalCostWithHierarchy", () => {
  it("deve somar apenas itens não-resumo", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo", isSummaryItem: true, totalCost: 15000 },
      { itemNumber: "3.1.1", description: "Estrutura", isSummaryItem: false, totalCost: 7500 },
      { itemNumber: "3.1.2", description: "Telhas", isSummaryItem: false, totalCost: 7500 },
    ];
    
    const total = calculateTotalCostWithHierarchy(items);
    
    // Deve somar apenas os filhos (7500 + 7500 = 15000)
    // NÃO deve somar o pai (que seria 15000 + 15000 = 30000 - ERRADO)
    expect(total).toBe(15000);
  });

  it("deve retornar 0 se todos forem resumo", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo", isSummaryItem: true, totalCost: 15000 },
    ];
    
    const total = calculateTotalCostWithHierarchy(items);
    
    expect(total).toBe(0);
  });
});

describe("findPotentialDuplicates", () => {
  it("deve encontrar descrições duplicadas", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado completo" },
      { itemNumber: "3.1.1", description: "Telhado completo" },
    ];
    
    const duplicates = findPotentialDuplicates(items);
    
    expect(duplicates).toContain("telhado completo");
  });

  it("deve retornar vazio se não houver duplicatas", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado" },
      { itemNumber: "3.2", description: "Piso" },
    ];
    
    const duplicates = findPotentialDuplicates(items);
    
    expect(duplicates).toHaveLength(0);
  });
});

describe("getHierarchyStats", () => {
  it("deve calcular estatísticas corretamente", () => {
    const items: HierarchicalItem[] = [
      { itemNumber: "3.1", description: "Telhado", isSummaryItem: true },
      { itemNumber: "3.1.1", description: "Estrutura", isSummaryItem: false, parentGroupNumber: "3.1" },
      { itemNumber: "3.1.2", description: "Telhas", isSummaryItem: false, parentGroupNumber: "3.1" },
      { itemNumber: "4.1", description: "Piso avulso" },
    ];
    
    const stats = getHierarchyStats(items);
    
    expect(stats.totalItems).toBe(4);
    expect(stats.summaryItems).toBe(1);
    expect(stats.childItems).toBe(2);
    expect(stats.orphanItems).toBe(1); // Piso avulso não tem pai nem é resumo
  });
});

describe("Cenário real: Orçamento com hierarquia", () => {
  it("deve evitar duplicação de valores", () => {
    // Cenário: Memorial com telhado que tem itens detalhados
    const items: HierarchicalItem[] = [
      // Item PAI (resumo) - NÃO deve ser somado
      { 
        itemNumber: "3.1", 
        description: "Cobertura completa", 
        quantity: 150,
        isSummaryItem: true, 
        totalCost: 22500 // R$ 150/m² x 150m² = R$ 22.500
      },
      // Itens FILHOS - DEVEM ser somados
      { 
        itemNumber: "3.1.1", 
        description: "Estrutura de madeira", 
        quantity: 150,
        isSummaryItem: false, 
        parentGroupNumber: "3.1",
        totalCost: 7500 // R$ 50/m² x 150m²
      },
      { 
        itemNumber: "3.1.2", 
        description: "Telhas cerâmicas", 
        quantity: 150,
        isSummaryItem: false, 
        parentGroupNumber: "3.1",
        totalCost: 10500 // R$ 70/m² x 150m²
      },
      { 
        itemNumber: "3.1.3", 
        description: "Calhas e rufos", 
        quantity: 30,
        isSummaryItem: false, 
        parentGroupNumber: "3.1",
        totalCost: 4500 // R$ 150/m x 30m
      },
    ];
    
    // Validar hierarquia
    const validation = validateItemHierarchy(items);
    expect(validation.isValid).toBe(true);
    
    // Filtrar para precificação
    const itemsToPrice = filterItemsForPricing(items);
    expect(itemsToPrice).toHaveLength(3); // Apenas os filhos
    
    // Calcular total CORRETO (sem duplicação)
    const totalCorreto = calculateTotalCostWithHierarchy(items);
    expect(totalCorreto).toBe(22500); // 7500 + 10500 + 4500 = 22500
    
    // Se somasse TUDO (incluindo pai), seria ERRADO:
    const totalErrado = items.reduce((sum, i) => sum + (i.totalCost || 0), 0);
    expect(totalErrado).toBe(45000); // 22500 + 22500 = 45000 (DUPLICADO!)
    
    // Confirmar que evitamos duplicação
    expect(totalCorreto).toBe(totalErrado / 2);
  });
});
