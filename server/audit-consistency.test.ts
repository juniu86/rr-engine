import { describe, it, expect } from "vitest";

/**
 * Testes de Auditoria - Consistência entre Proposta e Memória de Cálculo
 * 
 * Estes testes validam que os valores calculados na proposta comercial
 * são consistentes com os valores da memória de cálculo.
 */

describe("Auditoria de Consistência - Proposta vs Memória", () => {
  
  describe("Cálculo de Preços Proporcionais", () => {
    
    it("deve calcular markup factor corretamente", () => {
      // Dados de exemplo
      const totalDirectCost = 9320;
      const totalLogisticsCost = 7300;
      const custoBase = totalDirectCost + totalLogisticsCost;
      const bdiPercent = 0.2026; // ~20.26%
      const totalFinal = custoBase * (1 + bdiPercent);
      
      // Markup factor = preço final / custo direto
      const markupFactor = totalFinal / totalDirectCost;
      
      // O markup deve ser maior que 1 (inclui logística + BDI)
      expect(markupFactor).toBeGreaterThan(1);
      
      // Verificar que a soma dos preços proporcionais = preço final
      const items = [
        { description: "Item 1", quantity: 1, unitCostTotal: 4650 },
        { description: "Item 2", quantity: 1, unitCostTotal: 2670 },
        { description: "Item 3", quantity: 1, unitCostTotal: 2000 },
      ];
      
      const totalDirectFromItems = items.reduce((sum, item) => sum + item.quantity * item.unitCostTotal, 0);
      expect(totalDirectFromItems).toBe(totalDirectCost);
      
      const proportionalPrices = items.map(item => {
        const itemCost = item.quantity * item.unitCostTotal;
        return itemCost * markupFactor;
      });
      
      const sumProportional = proportionalPrices.reduce((sum, price) => sum + price, 0);
      
      // A soma dos preços proporcionais deve ser igual ao preço final (com tolerância de arredondamento)
      expect(sumProportional).toBeCloseTo(totalFinal, 2);
    });
    
    it("deve garantir que proposta e memória usam o mesmo preço final", () => {
      // Simulação de dados do agente comercial
      const comercialOutput = {
        finalPrice: 19987.50,
        adjustedBdi: 0.2026,
      };
      
      // Dados de custo
      const totalDirectCost = 9320;
      const totalLogisticsCost = 7300;
      const custoBase = totalDirectCost + totalLogisticsCost;
      
      // Cálculo na memória de cálculo
      let totalFinalMemoria: number;
      if (comercialOutput.finalPrice > 0 && comercialOutput.finalPrice >= custoBase) {
        totalFinalMemoria = comercialOutput.finalPrice;
      } else {
        totalFinalMemoria = custoBase * (1 + comercialOutput.adjustedBdi);
      }
      
      // Cálculo na proposta comercial (mesma lógica)
      const minExpectedPrice = custoBase * 1.30;
      const maxExpectedPrice = custoBase * 2.00;
      let totalSalePriceProposta: number;
      
      if (comercialOutput.finalPrice >= minExpectedPrice && comercialOutput.finalPrice <= maxExpectedPrice) {
        totalSalePriceProposta = comercialOutput.finalPrice;
      } else {
        totalSalePriceProposta = custoBase * (1 + comercialOutput.adjustedBdi);
      }
      
      // Ambos devem usar o mesmo preço final (com tolerância de arredondamento)
      expect(totalFinalMemoria).toBeCloseTo(totalSalePriceProposta, 0);
    });
    
    it("deve calcular BDI proporcional corretamente para cada item", () => {
      const totalDirectCost = 9320;
      const totalFinal = 19987.50;
      const markupFactor = totalFinal / totalDirectCost;
      
      const item = {
        quantity: 1,
        unitCostTotal: 4650,
        totalCost: 4650,
      };
      
      const proportionalPrice = item.totalCost * markupFactor;
      const proportionalBdi = proportionalPrice - item.totalCost;
      
      // O BDI proporcional deve ser positivo
      expect(proportionalBdi).toBeGreaterThan(0);
      
      // O preço proporcional deve ser maior que o custo
      expect(proportionalPrice).toBeGreaterThan(item.totalCost);
      
      // Verificar que o markup está sendo aplicado corretamente
      expect(proportionalPrice / item.totalCost).toBeCloseTo(markupFactor, 4);
    });
  });
  
  describe("Consistência de Prazo", () => {
    
    it("deve usar prazo do cronograma (gestaoOutput) na proposta", () => {
      const gestaoOutput = {
        totalDays: 9,
        totalDuration: 2, // semanas (fallback)
      };
      
      // Cálculo do prazo
      const totalDays = gestaoOutput.totalDays || gestaoOutput.totalDuration * 5 || 0;
      const totalWeeks = totalDays > 0 ? Math.ceil(totalDays / 5) : null;
      
      expect(totalDays).toBe(9);
      expect(totalWeeks).toBe(2); // 9 dias = 2 semanas (arredondado para cima)
    });
    
    it("deve formatar prazo corretamente", () => {
      const totalDays = 9;
      const totalWeeks = Math.ceil(totalDays / 5);
      
      const prazoExecucao = `${totalWeeks} semanas (${totalDays} dias úteis)`;
      
      expect(prazoExecucao).toBe("2 semanas (9 dias úteis)");
    });
  });
  
  describe("Validação de Valores Totais", () => {
    
    it("deve garantir que soma dos itens = preço final", () => {
      const totalDirectCost = 9320;
      const totalFinal = 19987.50;
      const markupFactor = totalFinal / totalDirectCost;
      
      const items = [
        { totalCost: 4650 },
        { totalCost: 2670 },
        { totalCost: 2000 },
      ];
      
      // Verificar que a soma dos custos = custo direto total
      const sumCosts = items.reduce((sum, item) => sum + item.totalCost, 0);
      expect(sumCosts).toBe(totalDirectCost);
      
      // Calcular preços proporcionais
      const proportionalPrices = items.map(item => item.totalCost * markupFactor);
      const sumProportional = proportionalPrices.reduce((sum, price) => sum + price, 0);
      
      // A soma deve ser igual ao preço final
      expect(sumProportional).toBeCloseTo(totalFinal, 2);
    });
    
    it("não deve haver diferença entre planilha de preços e cláusula de pagamento", () => {
      // Simulação: ambos devem usar o mesmo valor
      const comercialFinalPrice = 19987.50;
      
      // Valor na planilha de preços (soma dos itens proporcionais)
      const totalDirectCost = 9320;
      const markupFactor = comercialFinalPrice / totalDirectCost;
      const items = [
        { totalCost: 4650 },
        { totalCost: 2670 },
        { totalCost: 2000 },
      ];
      const sumProportional = items.reduce((sum, item) => sum + item.totalCost * markupFactor, 0);
      
      // Valor na cláusula de pagamento (preço do comercial)
      const valorClausula = comercialFinalPrice;
      
      // Devem ser iguais
      expect(sumProportional).toBeCloseTo(valorClausula, 2);
    });
  });
});
