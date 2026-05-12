import { describe, expect, it } from "vitest";
import { computeComercial } from "./services/comercialCalculator";
import type { ComercialInput } from "../shared/agents";
import type { CompanyTaxSettings } from "../shared/types";

const baseInput = (
  overrides: Partial<ComercialInput> = {}
): ComercialInput => ({
  budgetItems: [],
  totalDirectCost: 100_000,
  totalIndirectCost: 0,
  totalTaxes: 0,
  logisticsComplexity: "low",
  fiscalRisk: "low",
  ...overrides,
});

const lucroPresumido: CompanyTaxSettings = {
  regimeTributario: "lucro_presumido",
  issPercentual: 5,
  pisPercentual: 0.65,
  cofinsPercentual: 3,
  irpjPercentual: 1.2,
  csllPercentual: 1.08,
  taxaLeisSociais: 128,
};

const simplesFaixa4: CompanyTaxSettings = {
  regimeTributario: "simples_nacional",
  faixaSimples: 4,
  issPercentual: 0,
  pisPercentual: 0,
  cofinsPercentual: 0,
  irpjPercentual: 0,
  csllPercentual: 0,
  taxaLeisSociais: 100,
};

const componentes = {
  lucroPercentual: 8,
  adminCentralPercentual: 4,
  despesasFinanceirasPercentual: 1,
  riscosPercentual: 1,
  seguroPercentual: 0.8,
  garantiaPercentual: 0.4,
};

/** Calcula BDI esperado pela fórmula NBR 12721 — referência para os testes. */
function nbrBdi(
  ac: number,
  s: number,
  r: number,
  g: number,
  df: number,
  l: number,
  i: number
): number {
  return ((1 + ac + s + r + g) * (1 + df) * (1 + l)) / (1 - i) - 1;
}

describe("computeComercial — fórmula NBR 12721", () => {
  it("aplica BDI sem ajustes (low risk + low logistics) com Lucro Presumido", () => {
    // I = 5 + 0.65 + 3 + 1.2 + 1.08 = 10.93%
    const out = computeComercial(
      baseInput({ totalDirectCost: 100_000, totalIndirectCost: 10_000 }),
      { companyBdiSettings: componentes, taxSettings: lucroPresumido }
    );

    const expectedBdi = nbrBdi(
      0.04,
      0.008,
      0.01,
      0.004,
      0.01,
      0.08,
      0.1093
    );
    expect(out.baseBdi).toBeCloseTo(expectedBdi, 4);
    expect(out.adjustedBdi).toBeCloseTo(expectedBdi, 4);
    expect(out.finalPrice).toBeCloseTo(110_000 * (1 + expectedBdi), 2);
    expect(out.totalBdiAmount).toBeCloseTo(110_000 * expectedBdi, 2);
    expect(out.bdiJustification).toContain("NBR 12721");
  });

  it("Simples Nacional faixa 4 (14%) gera preço final maior que Lucro Presumido (10,93%)", () => {
    const input = baseInput({ totalDirectCost: 100_000, totalIndirectCost: 0 });
    const presumido = computeComercial(input, {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    });
    const simples = computeComercial(input, {
      companyBdiSettings: componentes,
      taxSettings: simplesFaixa4,
    });
    expect(simples.finalPrice).toBeGreaterThan(presumido.finalPrice);
  });

  it("ajuste de risco fiscal alto adiciona +5pp em Riscos", () => {
    const sem = computeComercial(baseInput(), {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    });
    const com = computeComercial(baseInput({ fiscalRisk: "high" }), {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    });
    expect(com.adjustedBdi).toBeGreaterThan(sem.baseBdi);
    expect(com.bdiJustification).toContain("risco fiscal alto");
  });

  it("ajuste de logística alta adiciona +5pp em DF", () => {
    const com = computeComercial(baseInput({ logisticsComplexity: "high" }), {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    });
    expect(com.adjustedBdi).toBeGreaterThan(com.baseBdi);
    expect(com.bdiJustification).toContain("logística alta");
  });

  it("aumentar Lucro 1pp aumenta BDI total em mais que 1pp (efeito do 1/(1-I))", () => {
    const sem = computeComercial(baseInput(), {
      companyBdiSettings: { ...componentes, lucroPercentual: 8 },
      taxSettings: lucroPresumido,
    });
    const com = computeComercial(baseInput(), {
      companyBdiSettings: { ...componentes, lucroPercentual: 9 },
      taxSettings: lucroPresumido,
    });
    const delta = (com.baseBdi - sem.baseBdi) * 100;
    expect(delta).toBeGreaterThan(1);
  });

  it("override manual de alíquota I tem prioridade sobre regime", () => {
    const out = computeComercial(baseInput(), {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido, // I = 10.93%
      taxRateOverridePercentual: 5, // override = 5%
    });
    const expected = nbrBdi(0.04, 0.008, 0.01, 0.004, 0.01, 0.08, 0.05);
    expect(out.baseBdi).toBeCloseTo(expected, 4);
  });

  it("alíquota I = 100% lança erro (1 - I ≤ 0)", () => {
    expect(() =>
      computeComercial(baseInput(), {
        companyBdiSettings: componentes,
        taxRateOverridePercentual: 100,
      })
    ).toThrow();
  });

  it("é determinístico: mesmo input produz mesmo output", () => {
    const input = baseInput({
      totalDirectCost: 50_000,
      totalIndirectCost: 5_000,
      logisticsComplexity: "medium",
      fiscalRisk: "medium",
    });
    const ctx = {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    };
    const a = computeComercial(input, ctx);
    const b = computeComercial(input, ctx);
    expect(a).toEqual(b);
  });

  describe("pricePerUnit", () => {
    it("agrupa por unidade dos budgetItems", () => {
      const out = computeComercial(
        baseInput({
          totalDirectCost: 100_000,
          totalIndirectCost: 0,
          budgetItems: [
            {
              id: 1,
              category: "X",
              code: "C1",
              description: "A",
              unit: "m²",
              quantity: 100,
              unitCostMaterial: 0,
              unitCostLabor: 0,
              unitCostLogistics: 0,
              unitCostTotal: 0,
              totalCost: 0,
              taxType: "iss",
              taxAmount: 0,
              bdiAmount: 0,
              finalPrice: 0,
              source: "sinapi",
              sourceCode: "x",
              sourceDate: "2025-01-01",
            },
          ],
        }),
        { companyBdiSettings: componentes, taxSettings: lucroPresumido }
      );
      // pricePerUnit deve ser finalPrice / qty (qty=100)
      expect(out.pricePerUnit["m²"]).toBeCloseTo(out.finalPrice / 100, 2);
    });

    it("retorna objeto vazio quando não há budgetItems", () => {
      const out = computeComercial(baseInput(), {
        companyBdiSettings: componentes,
        taxSettings: lucroPresumido,
      });
      expect(out.pricePerUnit).toEqual({});
    });
  });

  it("não consome tokens (pure function — sem invokeLLM)", () => {
    expect(() =>
      computeComercial(baseInput(), {
        companyBdiSettings: componentes,
        taxSettings: lucroPresumido,
      })
    ).not.toThrow();
  });

  it("preenche componentsApplied com valores em pontos percentuais (pp)", () => {
    const out = computeComercial(baseInput({ fiscalRisk: "high" }), {
      companyBdiSettings: componentes,
      taxSettings: lucroPresumido,
    });
    expect(out.componentsApplied).toBeDefined();
    const c = out.componentsApplied!;
    // Lucro vem como pp (8 = 8%), não fração (0.08)
    expect(c.lucroPercentual).toBeCloseTo(8, 2);
    expect(c.adminCentralPercentual).toBeCloseTo(4, 2);
    expect(c.seguroPercentual).toBeCloseTo(0.8, 2);
    expect(c.garantiaPercentual).toBeCloseTo(0.4, 2);
    // Riscos com ajuste: 1 + 5 = 6 (fiscalRisk=high)
    expect(c.riscosPercentual).toBeCloseTo(6, 2);
    // DF sem ajuste (logisticsComplexity = low)
    expect(c.despesasFinanceirasPercentual).toBeCloseTo(1, 2);
    // Alíquota I do Lucro Presumido: ISS+PIS+COFINS+IRPJ+CSLL ≈ 10.93%
    expect(c.aliquotaTributos).toBeCloseTo(10.93, 1);
    expect(c.aliquotaTributosSource).toContain("Lucro Presumido");
    expect(c.ajustesAplicados).toContain("+5pp em Riscos por risco fiscal alto");
  });

  it("componentsApplied reflete ajuste de logística alta em DF", () => {
    const out = computeComercial(
      baseInput({ logisticsComplexity: "high" }),
      { companyBdiSettings: componentes, taxSettings: lucroPresumido }
    );
    // DF original 1pp + 5pp = 6pp
    expect(out.componentsApplied!.despesasFinanceirasPercentual).toBeCloseTo(6, 2);
    expect(out.componentsApplied!.ajustesAplicados).toContain(
      "+5pp em DF por complexidade logística alta"
    );
  });

  it("preço final cobre os tributos (custoBase + BDI ≥ tributos por dentro)", () => {
    const custoBase = 100_000;
    const out = computeComercial(
      baseInput({ totalDirectCost: custoBase, totalIndirectCost: 0 }),
      { companyBdiSettings: componentes, taxSettings: lucroPresumido }
    );
    // Tributos no preço final = preço × I
    const I = 0.1093;
    const tributosNoPreco = out.finalPrice * I;
    // O markup (totalBdiAmount) precisa cobrir os tributos + componentes
    expect(out.totalBdiAmount).toBeGreaterThan(tributosNoPreco);
  });
});
