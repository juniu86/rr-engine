import { describe, expect, it, vi } from "vitest";
import {
  computeComercial,
  normalizeBdiPercent,
} from "./services/comercialCalculator";
import type { ComercialInput } from "../shared/agents";

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

describe("computeComercial (P1.2)", () => {
  it("aplica BDI base sem ajustes (low risk + low logistics)", () => {
    const out = computeComercial(
      baseInput({ totalDirectCost: 100_000, totalIndirectCost: 10_000 }),
      { projectBdi: 25 }
    );
    expect(out.baseBdi).toBe(0.25);
    expect(out.adjustedBdi).toBe(0.25);
    // (100k + 10k) * 1.25 = 137.5k
    expect(out.finalPrice).toBe(137_500);
    expect(out.totalBdiAmount).toBe(27_500);
    expect(out.bdiJustification).toContain("sem ajustes");
  });

  it("aplica +5% para risco fiscal alto", () => {
    const out = computeComercial(baseInput({ fiscalRisk: "high" }), {
      projectBdi: 25,
    });
    expect(out.baseBdi).toBe(0.25);
    expect(out.adjustedBdi).toBe(0.3);
    expect(out.finalPrice).toBe(130_000);
    expect(out.bdiJustification).toContain("risco fiscal alto");
  });

  it("aplica +5% para complexidade logística alta", () => {
    const out = computeComercial(baseInput({ logisticsComplexity: "high" }), {
      projectBdi: 25,
    });
    expect(out.adjustedBdi).toBe(0.3);
    expect(out.finalPrice).toBe(130_000);
    expect(out.bdiJustification).toContain("logística alta");
  });

  it("aplica ambos ajustes (alto risco fiscal e logística alta)", () => {
    const out = computeComercial(
      baseInput({ fiscalRisk: "high", logisticsComplexity: "high" }),
      { projectBdi: 25 }
    );
    expect(out.adjustedBdi).toBe(0.35);
    expect(out.finalPrice).toBe(135_000);
    expect(out.bdiJustification).toContain("risco fiscal alto");
    expect(out.bdiJustification).toContain("logística alta");
  });

  it("é determinístico: mesmo input produz mesmo output", () => {
    const input = baseInput({
      totalDirectCost: 50_000,
      totalIndirectCost: 5_000,
      logisticsComplexity: "medium",
      fiscalRisk: "medium",
    });
    const a = computeComercial(input, { projectBdi: 22 });
    const b = computeComercial(input, { projectBdi: 22 });
    expect(a).toEqual(b);
  });

  describe("resolução de BDI base", () => {
    it("ordem 1: projectBdi vence", () => {
      const out = computeComercial(baseInput(), {
        projectBdi: 30,
        bdiPreset: "reduzido",
        companyBdiSettings: { bdiPercentual: 15 },
      });
      expect(out.baseBdi).toBe(0.3);
    });

    it("ordem 2: bdiPreset vence quando projectBdi ausente", () => {
      const out = computeComercial(baseInput(), {
        bdiPreset: "majorado",
        companyBdiSettings: { bdiPercentual: 15 },
      });
      // majorado = 35
      expect(out.baseBdi).toBe(0.35);
    });

    it("ordem 3: companyBdiSettings vence quando projectBdi e preset ausentes", () => {
      const out = computeComercial(baseInput(), {
        companyBdiSettings: { bdiPercentual: 18 },
      });
      expect(out.baseBdi).toBe(0.18);
    });

    it("ordem 4: fallback 25% sem nenhum contexto", () => {
      const out = computeComercial(baseInput(), {});
      expect(out.baseBdi).toBe(0.25);
    });
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
        { projectBdi: 25 }
      );
      // finalPrice = 125k, qty=100 m² → 1250/m²
      expect(out.pricePerUnit["m²"]).toBe(1250);
    });

    it("retorna objeto vazio quando não há budgetItems", () => {
      const out = computeComercial(baseInput(), { projectBdi: 25 });
      expect(out.pricePerUnit).toEqual({});
    });
  });

  it("não consome tokens (não chama invokeLLM por construção — pure function)", () => {
    // Smoke test: chamada síncrona retorna sem throw e sem side-effects
    expect(() =>
      computeComercial(baseInput(), { projectBdi: 25 })
    ).not.toThrow();
  });

  // P0 (07/05/2026) — projeto 12 (BDI 0,13%) — confusão decimal vs percent.
  describe("normalizeBdiPercent", () => {
    it("mantém valor em percent quando válido (33 → 33)", () => {
      expect(normalizeBdiPercent(33)).toEqual({ value: 33 });
      expect(normalizeBdiPercent("33.00")).toEqual({ value: 33 });
      expect(normalizeBdiPercent(1)).toEqual({ value: 1 });
      expect(normalizeBdiPercent(200)).toEqual({ value: 200 });
    });

    it("normaliza decimal-como-percent: 0.33 → 33% com warning", () => {
      const r = normalizeBdiPercent(0.33);
      expect(r.value).toBe(33);
      expect(r.warning).toMatch(/decimal/);
    });

    it("normaliza projeto 12 caso real: 0.13 (stored decimal) → 13%", () => {
      const r = normalizeBdiPercent(0.13);
      expect(r.value).toBe(13);
      expect(r.warning).toBeDefined();
    });

    it("normaliza string '0.33' → 33% com warning", () => {
      const r = normalizeBdiPercent("0.33");
      expect(r.value).toBe(33);
      expect(r.warning).toBeDefined();
    });

    it("retorna null para valores ausentes/inválidos (caller decide fallback)", () => {
      expect(normalizeBdiPercent(null).value).toBeNull();
      expect(normalizeBdiPercent(undefined).value).toBeNull();
      expect(normalizeBdiPercent("").value).toBeNull();
      expect(normalizeBdiPercent(0).value).toBeNull();
      expect(normalizeBdiPercent(NaN).value).toBeNull();
      expect(normalizeBdiPercent("abc").value).toBeNull();
    });

    it("rejeita BDI negativo com warning", () => {
      const r = normalizeBdiPercent(-5);
      expect(r.value).toBeNull();
      expect(r.warning).toMatch(/negativo/);
    });

    it("rejeita BDI absurdo (> 200%) com warning", () => {
      const r = normalizeBdiPercent(500);
      expect(r.value).toBeNull();
      expect(r.warning).toMatch(/200/);
    });

    it("warning inclui o label informado pelo caller", () => {
      const r = normalizeBdiPercent(0.33, "applyAuditCorrections.projectBdi");
      expect(r.warning).toContain("applyAuditCorrections.projectBdi");
    });
  });

  describe("computeComercial — robustez contra BDI mal-formado (projeto 12)", () => {
    it("normaliza projectBdi=0.13 (stored decimal) e produz 13% BDI", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const out = computeComercial(
        baseInput({ totalDirectCost: 181_473.82, totalIndirectCost: 0 }),
        { projectBdi: 0.13 }
      );
      // baseBdi normalizado: 0.13 → 13% → output em decimal: 0.13
      expect(out.baseBdi).toBeCloseTo(0.13, 4);
      // finalPrice = 181473.82 × 1.13 ≈ 205065
      expect(out.finalPrice).toBeCloseTo(181_473.82 * 1.13, 2);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it("ignora projectBdi=0 e cai pro preset", () => {
      const out = computeComercial(baseInput(), {
        projectBdi: 0,
        bdiPreset: "majorado",
      });
      expect(out.baseBdi).toBe(0.35); // majorado=35%
    });

    it("ignora projectBdi inválido (>200) e cai pro company", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const out = computeComercial(baseInput(), {
        projectBdi: 500,
        companyBdiSettings: { bdiPercentual: 22 },
      });
      expect(out.baseBdi).toBe(0.22);
      consoleWarnSpy.mockRestore();
    });

    it("normaliza companyBdiSettings.bdiPercentual=0.25 (decimal mistake) → 25%", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const out = computeComercial(baseInput(), {
        companyBdiSettings: { bdiPercentual: 0.25 },
      });
      expect(out.baseBdi).toBe(0.25); // normalizado para 25% → decimal 0.25
      consoleWarnSpy.mockRestore();
    });
  });
});
