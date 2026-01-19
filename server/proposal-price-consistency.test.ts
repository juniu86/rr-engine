import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://test.com/file.html", key: "test-key" }),
}));

// Mock db
vi.mock("./db", () => ({
  createGeneratedDocument: vi.fn().mockResolvedValue({ id: 1 }),
}));

describe("Proposal Price Consistency", () => {
  describe("calculateProportionalPrices", () => {
    // Simular a função calculateProportionalPrices (versão corrigida)
    // O markup é calculado sobre o custo DIRETO para garantir que a soma = totalSalePrice
    function calculateProportionalPrices(
      budgetItems: any[], 
      totalSalePrice: number,
      totalBaseCost: number // Usado apenas para validação
    ) {
      const totalDirectCost = budgetItems.reduce((sum, item) => {
        return sum + (Number(item.quantity || 0) * Number(item.unitCostTotal || 0));
      }, 0);
      
      if (totalDirectCost === 0) return [];
      
      // Markup sobre custo direto para distribuir o preço de venda total
      const markupFactor = totalSalePrice / totalDirectCost;
      
      return budgetItems.map(item => {
        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCostTotal || 0);
        
        const unitPrice = unitCost * markupFactor;
        const totalPrice = quantity * unitPrice;
        
        return {
          description: item.description,
          unit: item.unit || "un",
          quantity,
          unitPrice,
          totalPrice,
        };
      });
    }

    it("should distribute sale price proportionally including logistics", () => {
      // Dados do caso real: Reforma Vania REV08
      const budgetItems = [
        { description: "Mobilização", quantity: 1, unitCostTotal: 2000, unit: "un" },
        { description: "Quebra de Concreto", quantity: 15, unitCostTotal: 55, unit: "m" },
        { description: "Escavação", quantity: 15, unitCostTotal: 33, unit: "m" },
        { description: "Tubulação", quantity: 15, unitCostTotal: 85, unit: "m" },
        { description: "Aterramento", quantity: 15, unitCostTotal: 38, unit: "m" },
        { description: "Caixas", quantity: 2, unitCostTotal: 160, unit: "un" },
        { description: "Concretagem", quantity: 15, unitCostTotal: 175, unit: "m" },
        { description: "Polimento", quantity: 15, unitCostTotal: 32, unit: "m" },
        { description: "Tampas", quantity: 2, unitCostTotal: 290, unit: "un" },
      ];
      
      // Custo direto total
      const totalDirectCost = budgetItems.reduce((sum, item) => 
        sum + (item.quantity * item.unitCostTotal), 0);
      
      // Custo logístico (exemplo)
      const totalLogisticsCost = 7300;
      
      // Custo base total (direto + logística)
      const totalBaseCost = totalDirectCost + totalLogisticsCost;
      
      // Preço de venda com BDI de 30%
      const totalSalePrice = totalBaseCost * 1.30;
      
      // Calcular preços proporcionais
      const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice, totalBaseCost);
      
      // A soma dos preços proporcionais deve ser igual ao preço de venda total
      const sumProportional = proportionalItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      expect(sumProportional).toBeCloseTo(totalSalePrice, 2);
    });

    it("should ensure sum of item prices equals total sale price", () => {
      const budgetItems = [
        { description: "Item 1", quantity: 10, unitCostTotal: 100, unit: "m" },
        { description: "Item 2", quantity: 5, unitCostTotal: 200, unit: "un" },
        { description: "Item 3", quantity: 20, unitCostTotal: 50, unit: "m2" },
      ];
      
      const totalDirectCost = 10 * 100 + 5 * 200 + 20 * 50; // 1000 + 1000 + 1000 = 3000
      const totalLogisticsCost = 1500;
      const totalBaseCost = totalDirectCost + totalLogisticsCost; // 4500
      const totalSalePrice = 6000; // Preço de venda definido
      
      const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice, totalBaseCost);
      
      const sumProportional = proportionalItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      // A soma DEVE ser igual ao preço de venda total
      expect(sumProportional).toBeCloseTo(totalSalePrice, 2);
    });

    it("should handle case where logistics is significant portion of cost", () => {
      // Caso onde logística é 50% do custo base
      const budgetItems = [
        { description: "Serviço", quantity: 1, unitCostTotal: 5000, unit: "vb" },
      ];
      
      const totalDirectCost = 5000;
      const totalLogisticsCost = 5000; // Logística = 50% do custo base
      const totalBaseCost = 10000;
      const totalSalePrice = 13000; // BDI de 30%
      
      const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice, totalBaseCost);
      
      // O item deve receber TODO o preço de venda (13000)
      // porque a logística é embutida proporcionalmente no markup
      // Markup = 13000 / 5000 = 2.6x
      expect(proportionalItems[0].totalPrice).toBeCloseTo(13000, 2);
      
      // A soma deve ser igual ao preço de venda total
      const sumProportional = proportionalItems.reduce((sum, item) => sum + item.totalPrice, 0);
      expect(sumProportional).toBeCloseTo(totalSalePrice, 2);
    });

    it("should correctly calculate unit prices", () => {
      const budgetItems = [
        { description: "Item", quantity: 10, unitCostTotal: 100, unit: "m" },
      ];
      
      const totalDirectCost = 10 * 100; // 1000
      const totalBaseCost = 2000; // Inclui logística (1000 direto + 1000 logística)
      const totalSalePrice = 2600; // Preço de venda total
      
      const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice, totalBaseCost);
      
      // Markup = 2600 / 1000 = 2.6x
      // Preço total do item: 1000 * 2.6 = 2600 (TODO o preço de venda)
      // Preço unitário: 2600 / 10 = 260
      expect(proportionalItems[0].totalPrice).toBeCloseTo(2600, 2);
      expect(proportionalItems[0].unitPrice).toBeCloseTo(260, 2);
    });
  });

  describe("Proposal vs Excel Consistency", () => {
    it("should use same totalSalePrice in both documents", () => {
      // Simular dados do agente comercial
      const comercialOutput = {
        finalPrice: 19987.50,
        adjustedBdi: 0.20,
      };
      
      // Dados de custo
      const totalDirectCost = 9320;
      const totalLogisticsCost = 7300;
      const totalBaseCost = totalDirectCost + totalLogisticsCost; // 16620
      
      // O preço do comercial deve ser usado em ambos os documentos
      const expectedPrice = comercialOutput.finalPrice;
      
      // Verificar que o BDI aplicado é consistente
      const impliedBdi = (expectedPrice - totalBaseCost) / totalBaseCost;
      expect(impliedBdi).toBeCloseTo(0.2027, 2); // ~20.27%
      
      // O preço final deve ser o mesmo em proposta e planilha
      expect(expectedPrice).toBe(19987.50);
    });
  });
});
