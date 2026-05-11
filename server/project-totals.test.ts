import { describe, expect, it, vi } from "vitest";
import {
  extractFinalTotalsFromExecutions,
  persistFinalTotals,
} from "./services/projectTotals";

/**
 * Cenários cobertos:
 * - Outputs completos → totais corretos (com split de logística aplicado)
 * - Orçamentista ausente → null
 * - Comercial ausente → null
 * - Logística zero (LLM enfia logística em budget_items) → split corrige
 * - persistFinalTotals grava no banco quando há totais
 * - persistFinalTotals retorna null sem gravar quando outputs incompletos
 * - persistFinalTotals não joga erro quando db falha
 */

const mkExec = (agentType: string, output: any) => ({
  agentType,
  status: "completed",
  output,
});

const baseOutputs = () => [
  mkExec("orcamentista", {
    budgetItems: [
      {
        description: "Concreto fck 25 lançado em fundação",
        unit: "m³",
        quantity: 38,
        totalCost: 17100,
      },
      {
        description: "Alvenaria bloco cerâmico",
        unit: "m²",
        quantity: 720,
        totalCost: 36000,
      },
      // Item que parece logística enfiado pelo LLM no budget_items —
      // split determinístico vai mover pra logística.
      {
        description: "Mobilização de canteiro + container administrativo",
        unit: "vb",
        quantity: 1,
        totalCost: 25000,
      },
    ],
    totalDirectCost: 78100,
  }),
  mkExec("logistica", {
    costs: [
      {
        category: "Geral",
        description: "Locação de container vestiário NR-18",
        quantity: 8,
        unit: "mês",
        unitCost: 1850,
        totalCost: 14800,
      },
    ],
    totalLogisticsCost: 14800,
  }),
  mkExec("tributario", { totalTaxes: 5500 }),
  mkExec("comercial", {
    finalPrice: 110000,
    totalBdiAmount: 110000 - (78100 - 25000 + 14800 + 25000),
  }),
];

describe("extractFinalTotalsFromExecutions", () => {
  it("retorna totais com split aplicado (logística movida do budget_items)", () => {
    const totals = extractFinalTotalsFromExecutions(baseOutputs());
    expect(totals).not.toBeNull();
    // Mobilização (R$ 25.000) saiu de budget e foi pra logística.
    // Direto = 17.100 + 36.000 = 53.100
    expect(totals!.totalCostDirect).toBe(53100);
    // Logística = 14.800 (do agente) + 25.000 (split) = 39.800
    expect(totals!.totalCostIndirect).toBeCloseTo(39800, 0);
    expect(totals!.totalPrice).toBe(110000);
    expect(totals!.totalTaxes).toBe(5500);
  });

  it("retorna null quando Orçamentista ausente", () => {
    const totals = extractFinalTotalsFromExecutions([
      mkExec("logistica", { costs: [], totalLogisticsCost: 0 }),
      mkExec("comercial", { finalPrice: 100, totalBdiAmount: 20 }),
    ]);
    expect(totals).toBeNull();
  });

  it("retorna null quando Comercial ausente", () => {
    const totals = extractFinalTotalsFromExecutions([
      mkExec("orcamentista", {
        budgetItems: [
          { description: "X", unit: "un", quantity: 1, totalCost: 100 },
        ],
        totalDirectCost: 100,
      }),
    ]);
    expect(totals).toBeNull();
  });

  it("tolera Tributário ausente (totalTaxes = 0)", () => {
    const outs = baseOutputs().filter(o => o.agentType !== "tributario");
    const totals = extractFinalTotalsFromExecutions(outs);
    expect(totals).not.toBeNull();
    expect(totals!.totalTaxes).toBe(0);
  });

  it("tolera Logística ausente (split ainda separa itens dos budget_items)", () => {
    const outs = baseOutputs().filter(o => o.agentType !== "logistica");
    const totals = extractFinalTotalsFromExecutions(outs);
    expect(totals).not.toBeNull();
    // Mobilização (R$ 25.000) movida do budget pra logística mesmo sem
    // output do agente Logística.
    expect(totals!.totalCostIndirect).toBeCloseTo(25000, 0);
  });
});

describe("persistFinalTotals", () => {
  it("grava totais quando outputs completos", async () => {
    const updateProject = vi.fn().mockResolvedValue(undefined);
    const getAgentExecutionsByProjectId = vi
      .fn()
      .mockResolvedValue(baseOutputs());
    const result = await persistFinalTotals(
      42,
      { updateProject, getAgentExecutionsByProjectId },
      undefined,
      "test"
    );
    expect(result).not.toBeNull();
    expect(updateProject).toHaveBeenCalledTimes(1);
    const patch = updateProject.mock.calls[0][1];
    expect(patch.totalCostDirect).toBeDefined();
    expect(patch.totalCostIndirect).toBeDefined();
    expect(patch.totalBdi).toBeDefined();
    expect(patch.totalTaxes).toBeDefined();
    expect(patch.totalPrice).toBeDefined();
  });

  it("não grava quando Orçamentista ausente", async () => {
    const updateProject = vi.fn().mockResolvedValue(undefined);
    const getAgentExecutionsByProjectId = vi
      .fn()
      .mockResolvedValue([mkExec("comercial", { finalPrice: 100 })]);
    const result = await persistFinalTotals(
      42,
      { updateProject, getAgentExecutionsByProjectId },
      undefined,
      "test"
    );
    expect(result).toBeNull();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("não joga erro quando updateProject falha — retorna null", async () => {
    const updateProject = vi.fn().mockRejectedValue(new Error("DB down"));
    const getAgentExecutionsByProjectId = vi
      .fn()
      .mockResolvedValue(baseOutputs());
    const result = await persistFinalTotals(
      42,
      { updateProject, getAgentExecutionsByProjectId },
      undefined,
      "test"
    );
    expect(result).toBeNull();
  });

  it("aceita executions pré-carregadas (não consulta db.getAgentExecutionsByProjectId)", async () => {
    const updateProject = vi.fn().mockResolvedValue(undefined);
    const getAgentExecutionsByProjectId = vi
      .fn()
      .mockResolvedValue([]); // não deveria ser chamada
    const result = await persistFinalTotals(
      42,
      { updateProject, getAgentExecutionsByProjectId },
      baseOutputs(),
      "test"
    );
    expect(result).not.toBeNull();
    expect(getAgentExecutionsByProjectId).not.toHaveBeenCalled();
  });
});
