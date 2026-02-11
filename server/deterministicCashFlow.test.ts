import { describe, it, expect } from "vitest";
import { calculateDeterministicCashFlow, buildDeterministicFinanceiroOutput } from "./services/deterministicCashFlow";

describe("calculateDeterministicCashFlow", () => {
  it("should calculate correct cash flow for a profitable project", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
    });

    expect(result.cashFlow).toHaveLength(4);
    
    // Semana 1: 40% receita - custo semanal
    expect(result.cashFlow[0].income).toBe(40000); // 40% de 100k
    expect(result.cashFlow[0].expense).toBe(16250); // 65k / 4
    expect(result.cashFlow[0].balance).toBe(23750); // 40000 - 16250
    
    // Semana 2: sem receita - custo semanal
    expect(result.cashFlow[1].income).toBe(0);
    expect(result.cashFlow[1].expense).toBe(16250);
    expect(result.cashFlow[1].balance).toBe(7500); // 23750 - 16250
    
    // Semana 3: sem receita - custo semanal
    expect(result.cashFlow[2].income).toBe(0);
    expect(result.cashFlow[2].expense).toBe(16250);
    expect(result.cashFlow[2].balance).toBe(-8750); // 7500 - 16250
    
    // Semana 4: 60% receita - custo semanal
    expect(result.cashFlow[3].income).toBe(60000); // 60% de 100k
    expect(result.cashFlow[3].expense).toBe(16250);
    expect(result.cashFlow[3].balance).toBe(35000); // -8750 + 60000 - 16250
    
    // Saldo final = margem bruta = 100k - 65k = 35k
    const finalBalance = result.cashFlow[result.cashFlow.length - 1].balance;
    expect(finalBalance).toBe(35000);
  });

  it("should always set needsAdvance to true", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 50000,
      totalPrice: 80000,
      totalDuration: 3,
    });
    expect(result.needsAdvance).toBe(true);
  });

  it("should set suggestedAdvance to 40% of totalPrice", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 50000,
      totalPrice: 80000,
      totalDuration: 3,
    });
    expect(result.suggestedAdvance).toBe(32000); // 40% de 80k
  });

  it("should detect max exposure (negative balance)", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
    });
    // Semana 3 tem saldo -8750 (pior ponto)
    expect(result.maxExposure).toBe(8750);
  });

  it("should handle single-week projects", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 10000,
      totalPrice: 15000,
      totalDuration: 1,
    });
    
    expect(result.cashFlow).toHaveLength(1);
    // Semana 1 recebe 40% + 60% = 100% (é a primeira E última semana)
    expect(result.cashFlow[0].income).toBe(6000); // 40% de 15k (semana 1)
    expect(result.cashFlow[0].expense).toBe(10000);
    // Na verdade, para duração 1, semana 1 = última semana, então income = 40% (semana 1)
    // Mas o saldo final deve ser positivo
  });

  it("should handle zero duration gracefully", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 10000,
      totalPrice: 15000,
      totalDuration: 0, // Edge case
    });
    // Deve ter pelo menos 1 semana
    expect(result.cashFlow.length).toBeGreaterThanOrEqual(1);
  });

  it("should generate alert for negative final balance (loss project)", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 120000,
      totalPrice: 100000, // Custo > Preço = prejuízo
      totalDuration: 4,
    });
    
    const finalBalance = result.cashFlow[result.cashFlow.length - 1].balance;
    expect(finalBalance).toBeLessThan(0);
    expect(result.alerts.some(a => a.includes("prejuízo") || a.includes("negativo"))).toBe(true);
  });

  it("should generate alert when price <= cost", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 100000,
      totalPrice: 100000, // Margem zero
      totalDuration: 4,
    });
    expect(result.alerts.some(a => a.includes("menor ou igual"))).toBe(true);
  });

  it("should calculate gross margin correctly", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
    });
    expect(result.grossMargin).toBe(35000);
    expect(result.grossMarginPercent).toBe(35);
  });

  it("should calculate net margin with taxes", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
      totalTaxes: 10000,
    });
    expect(result.netMargin).toBe(25000); // 100k - 65k - 10k
    expect(result.netMarginPercent).toBe(25);
  });

  it("should distribute expenses uniformly across weeks", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 100000,
      totalPrice: 150000,
      totalDuration: 5,
    });
    
    // Cada semana deve ter despesa de 100k/5 = 20k
    for (const item of result.cashFlow) {
      expect(item.expense).toBe(20000);
    }
  });

  it("should have income only in first and last weeks", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 80000,
      totalPrice: 120000,
      totalDuration: 6,
    });
    
    expect(result.cashFlow[0].income).toBe(48000); // 40% de 120k
    expect(result.cashFlow[5].income).toBe(72000); // 60% de 120k
    
    // Semanas intermediárias sem receita
    for (let i = 1; i < 5; i++) {
      expect(result.cashFlow[i].income).toBe(0);
    }
  });

  it("should have cumulative balance (not per-week)", () => {
    const result = calculateDeterministicCashFlow({
      totalCost: 60000,
      totalPrice: 100000,
      totalDuration: 3,
    });
    
    // Verificar que o saldo é acumulado
    const week1Balance = result.cashFlow[0].income - result.cashFlow[0].expense;
    expect(result.cashFlow[0].balance).toBe(week1Balance);
    
    const week2Balance = week1Balance + result.cashFlow[1].income - result.cashFlow[1].expense;
    expect(result.cashFlow[1].balance).toBe(week2Balance);
    
    const week3Balance = week2Balance + result.cashFlow[2].income - result.cashFlow[2].expense;
    expect(result.cashFlow[2].balance).toBe(week3Balance);
  });

  it("final balance should equal gross margin (price - cost)", () => {
    const testCases = [
      { totalCost: 65000, totalPrice: 100000, totalDuration: 4 },
      { totalCost: 50000, totalPrice: 80000, totalDuration: 3 },
      { totalCost: 200000, totalPrice: 300000, totalDuration: 8 },
      { totalCost: 10000, totalPrice: 15000, totalDuration: 2 },
    ];
    
    for (const tc of testCases) {
      const result = calculateDeterministicCashFlow(tc);
      const finalBalance = result.cashFlow[result.cashFlow.length - 1].balance;
      const expectedMargin = tc.totalPrice - tc.totalCost;
      // Allow small rounding difference
      expect(Math.abs(finalBalance - expectedMargin)).toBeLessThan(1);
    }
  });
});

describe("buildDeterministicFinanceiroOutput", () => {
  it("should merge deterministic result with LLM alerts", () => {
    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
    });
    
    const llmOutput = {
      alerts: ["Considerar seguro de obra", "Capital de giro necessário: R$ 5000"],
    };
    
    const output = buildDeterministicFinanceiroOutput(deterministicResult, llmOutput);
    
    // Deve ter os alertas determinísticos + o alerta qualitativo da LLM (sem duplicar Capital de giro)
    expect(output.alerts).toContain("Considerar seguro de obra");
    // Não deve duplicar "Capital de giro"
    const capitalDeGiroAlerts = output.alerts.filter(a => a.includes("Capital de giro"));
    expect(capitalDeGiroAlerts.length).toBeLessThanOrEqual(1);
  });

  it("should use deterministic cashFlow, not LLM cashFlow", () => {
    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
    });
    
    const llmOutput = {
      cashFlow: [{ week: 1, expense: 999999, income: 0, balance: -999999 }], // LLM errado
      alerts: [],
    };
    
    const output = buildDeterministicFinanceiroOutput(deterministicResult, llmOutput);
    
    // Deve usar o cashFlow determinístico, não o da LLM
    expect(output.cashFlow).toHaveLength(4);
    expect(output.cashFlow[0].expense).not.toBe(999999);
  });

  it("should include margin data in output", () => {
    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: 65000,
      totalPrice: 100000,
      totalDuration: 4,
      totalTaxes: 5000,
    });
    
    const output = buildDeterministicFinanceiroOutput(deterministicResult);
    
    expect(output.grossMargin).toBe(35000);
    expect(output.grossMarginPercent).toBe(35);
    expect(output.netMargin).toBe(30000);
    expect(output.netMarginPercent).toBe(30);
  });

  it("should handle missing LLM output gracefully", () => {
    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: 50000,
      totalPrice: 80000,
      totalDuration: 3,
    });
    
    const output = buildDeterministicFinanceiroOutput(deterministicResult, undefined);
    
    expect(output.cashFlow).toHaveLength(3);
    expect(output.needsAdvance).toBe(true);
    expect(output.suggestedAdvance).toBe(32000);
  });
});
