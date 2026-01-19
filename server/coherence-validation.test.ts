import { describe, it, expect } from "vitest";
import { validateAgentCoherence } from "./routers";

describe("Validação Cruzada entre Agentes", () => {
  describe("validateAgentCoherence", () => {
    it("deve retornar válido quando todos os valores estão consistentes", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [
            { quantity: 10, unitCostTotal: 500 },
            { quantity: 5, unitCostTotal: 1000 },
          ],
        },
        logistica: {
          totalCost: 2000,
          costs: [
            { totalCost: 1200 },
            { totalCost: 800 },
          ],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 15600, // (10000 + 2000) * 1.30 = 15600
        },
        financeiro: {
          netMargin: 2400, // 15600 - 10000 - 2000 - 1200 = 2400
        },
      };

      const validation = validateAgentCoherence(results);
      
      expect(validation.isValid).toBe(true);
      expect(validation.inconsistencies.length).toBe(0);
      expect(validation.summary).toContain("OK");
    });

    it("deve detectar inconsistência no preço final", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [{ quantity: 10, unitCostTotal: 1000 }],
        },
        logistica: {
          totalCost: 2000,
          costs: [{ totalCost: 2000 }],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 20000, // Deveria ser 15600, erro de ~28%
        },
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      expect(validation.isValid).toBe(false);
      const priceInconsistency = validation.inconsistencies.find(i => i.field === "Preço Final");
      expect(priceInconsistency).toBeDefined();
      expect(priceInconsistency?.severity).toBe("error");
    });

    it("deve detectar inconsistência na margem líquida", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [{ quantity: 10, unitCostTotal: 1000 }],
        },
        logistica: {
          totalCost: 2000,
          costs: [{ totalCost: 2000 }],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 15600,
        },
        financeiro: {
          netMargin: 5000, // Deveria ser 2400, erro de ~108%
        },
      };

      const validation = validateAgentCoherence(results);
      
      const marginInconsistency = validation.inconsistencies.find(i => i.field === "Margem Líquida");
      expect(marginInconsistency).toBeDefined();
      expect(marginInconsistency?.severity).toBe("error");
    });

    it("deve detectar inconsistência no total de custos diretos", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 15000, // Declarado 15000
          budgetItems: [
            { quantity: 10, unitCostTotal: 500 }, // Soma = 5000
            { quantity: 5, unitCostTotal: 1000 }, // Soma = 5000
            // Total dos itens = 10000, mas declarado 15000
          ],
        },
        logistica: {
          totalCost: 2000,
          costs: [{ totalCost: 2000 }],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 22100, // (15000 + 2000) * 1.30
        },
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      const budgetInconsistency = validation.inconsistencies.find(i => i.field === "Total Custo Direto");
      expect(budgetInconsistency).toBeDefined();
    });

    it("deve detectar inconsistência no total de logística", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [{ quantity: 10, unitCostTotal: 1000 }],
        },
        logistica: {
          totalCost: 5000, // Declarado 5000
          costs: [
            { totalCost: 1000 },
            { totalCost: 1000 },
            // Total dos custos = 2000, mas declarado 5000
          ],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 19500, // (10000 + 5000) * 1.30
        },
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      const logInconsistency = validation.inconsistencies.find(i => i.field === "Total Logística");
      expect(logInconsistency).toBeDefined();
    });

    it("deve classificar erros pequenos como warning", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [{ quantity: 10, unitCostTotal: 1000 }],
        },
        logistica: {
          totalCost: 2000,
          costs: [{ totalCost: 2000 }],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 16000, // Deveria ser 15600, erro de ~2.5%
        },
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      const priceInconsistency = validation.inconsistencies.find(i => i.field === "Preço Final");
      expect(priceInconsistency?.severity).toBe("warning");
    });

    it("deve lidar com valores zerados ou ausentes", () => {
      const results = {
        orcamentista: {},
        logistica: {},
        tributario: {},
        comercial: {},
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      // Não deve lançar erro, apenas retornar válido (sem dados para validar)
      expect(validation.isValid).toBe(true);
    });

    it("deve calcular percentual de erro corretamente", () => {
      const results = {
        orcamentista: {
          totalDirectCost: 10000,
          budgetItems: [{ quantity: 10, unitCostTotal: 1000 }],
        },
        logistica: {
          totalCost: 2000,
          costs: [{ totalCost: 2000 }],
        },
        tributario: {
          totalTaxes: 1200,
        },
        comercial: {
          adjustedBdi: 0.30,
          finalPrice: 17160, // 10% a mais que 15600
        },
        financeiro: {},
      };

      const validation = validateAgentCoherence(results);
      
      const priceInconsistency = validation.inconsistencies.find(i => i.field === "Preço Final");
      expect(priceInconsistency?.percentError).toBeCloseTo(10, 0);
    });
  });
});

describe("Cálculo de Margem Líquida", () => {
  it("deve calcular margem bruta corretamente", () => {
    // Margem Bruta = Preço - Custo Base
    const preco = 15600;
    const custoBase = 12000; // Direto + Logística
    const margemBruta = preco - custoBase;
    const margemBrutaPercent = (margemBruta / preco) * 100;
    
    expect(margemBruta).toBe(3600);
    expect(margemBrutaPercent).toBeCloseTo(23.08, 1);
  });

  it("deve calcular margem líquida corretamente", () => {
    // Margem Líquida = Preço - Custo Base - Impostos
    const preco = 15600;
    const custoBase = 12000;
    const impostos = 1200;
    const margemLiquida = preco - custoBase - impostos;
    const margemLiquidaPercent = (margemLiquida / preco) * 100;
    
    expect(margemLiquida).toBe(2400);
    expect(margemLiquidaPercent).toBeCloseTo(15.38, 1);
  });

  it("deve diferenciar margem bruta de margem líquida", () => {
    const preco = 100000;
    const custoBase = 70000;
    const impostos = 10000;
    
    const margemBruta = preco - custoBase; // 30000
    const margemLiquida = preco - custoBase - impostos; // 20000
    
    expect(margemBruta).toBeGreaterThan(margemLiquida);
    expect(margemBruta - margemLiquida).toBe(impostos);
  });
});
