import { describe, expect, it } from "vitest";
import { analyzeFinanceiro } from "./services/financeiroAnalyzer";
import type { FinanceiroInput } from "../shared/agents";

const baseInput = (
  overrides: Partial<FinanceiroInput> = {}
): FinanceiroInput => ({
  scheduleItems: [],
  budgetItems: [],
  totalPrice: 100_000,
  totalCost: 80_000,
  paymentTerms: "À vista",
  cashFlow: [],
  ...overrides,
});

describe("analyzeFinanceiro (P1.2)", () => {
  it("detecta exposição máxima e cita a semana correta", () => {
    const out = analyzeFinanceiro(
      baseInput({
        cashFlow: [
          { week: 1, expense: 20_000, income: 40_000, balance: 20_000 },
          { week: 2, expense: 30_000, income: 0, balance: -10_000 },
          { week: 3, expense: 10_000, income: 0, balance: -20_000 }, // pico
          { week: 4, expense: 0, income: 60_000, balance: 40_000 },
        ],
      })
    );

    expect(out.maxExposure).toBe(20_000);
    expect(out.alerts.some(a => a.includes("semana 3"))).toBe(true);
    expect(out.alerts.some(a => a.includes("medição intermediária"))).toBe(
      true
    );
  });

  it("não emite alerta de exposição quando saldo nunca fica negativo", () => {
    const out = analyzeFinanceiro(
      baseInput({
        cashFlow: [
          { week: 1, expense: 10_000, income: 40_000, balance: 30_000 },
          { week: 2, expense: 5_000, income: 60_000, balance: 85_000 },
        ],
      })
    );
    expect(out.maxExposure).toBe(0);
    expect(
      out.alerts.find(a => a.includes("Exposição máxima"))
    ).toBeUndefined();
  });

  it("alerta margem CRÍTICA quando margem bruta < 5%", () => {
    const out = analyzeFinanceiro(
      baseInput({ totalPrice: 100_000, totalCost: 97_000 })
    );
    expect(out.grossMarginPercent).toBeLessThan(5);
    expect(out.alerts.some(a => a.includes("crítica"))).toBe(true);
  });

  it("alerta margem BAIXA (warning) quando entre 5% e 10%", () => {
    const out = analyzeFinanceiro(
      baseInput({ totalPrice: 100_000, totalCost: 92_000 })
    );
    expect(out.grossMarginPercent).toBeGreaterThanOrEqual(5);
    expect(out.grossMarginPercent).toBeLessThan(10);
    expect(out.alerts.some(a => a.includes("baixa"))).toBe(true);
    expect(out.alerts.some(a => a.includes("crítica"))).toBe(false);
  });

  it("não alerta margem quando >= 10%", () => {
    const out = analyzeFinanceiro(
      baseInput({ totalPrice: 100_000, totalCost: 80_000 }) // 20% margem
    );
    expect(out.alerts.some(a => /margem/i.test(a))).toBe(false);
  });

  it("gera adiantamento sugerido como 40% do totalPrice", () => {
    const out = analyzeFinanceiro(baseInput({ totalPrice: 250_000 }));
    expect(out.suggestedAdvance).toBe(100_000);
    expect(out.needsAdvance).toBe(true);
  });

  it("alerta capital de giro para paymentTerms com '30 dias'", () => {
    const out = analyzeFinanceiro(
      baseInput({ paymentTerms: "Faturamento 30 dias após medição" })
    );
    expect(out.alerts.some(a => a.includes("capital de giro"))).toBe(true);
  });

  it("alerta capital de giro para paymentTerms com '60 dias'", () => {
    const out = analyzeFinanceiro(
      baseInput({ paymentTerms: "Boleto 60 dias" })
    );
    expect(out.alerts.some(a => a.includes("capital de giro"))).toBe(true);
  });

  it("calcula grossMargin/netMargin corretamente", () => {
    const out = analyzeFinanceiro(
      baseInput({ totalPrice: 100_000, totalCost: 75_000 })
    );
    expect(out.grossMargin).toBe(25_000);
    expect(out.grossMarginPercent).toBe(25);
    expect(out.netMargin).toBe(25_000); // sem totalTaxes no input do Financeiro
  });

  it("retorna o cashFlow exatamente como recebido, sem alterar números", () => {
    const cashFlow = [
      { week: 1, expense: 100, income: 200, balance: 100 },
      { week: 2, expense: 50, income: 0, balance: 50 },
    ];
    const out = analyzeFinanceiro(baseInput({ cashFlow }));
    expect(out.cashFlow).toEqual(cashFlow);
  });
});
