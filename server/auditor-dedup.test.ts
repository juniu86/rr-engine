/**
 * P2.6 — Dedup determinístico no Auditor.
 *
 * Cobre:
 * - findBudgetDuplicates: detecção exata, alta similaridade, mesmo grupo,
 *   itens diferentes da mesma categoria não entram.
 * - findInvalidSummaryItems: item PAI com totalCost > 0 vira finding.
 * - AuditorAgent.execute end-to-end: corrections.budgetItemsToRemove
 *   é populado pelo algoritmo, não pelo que a LLM retornar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    appId: "",
    cookieSecret: "",
    databaseUrl: "",
    oAuthServerUrl: "",
    ownerOpenId: "",
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "test-forge-key",
    anthropicApiKey: "",
  },
}));

vi.mock("./services/llmTelemetry", () => ({
  recordLlmCall: vi.fn().mockResolvedValue(undefined),
}));

import { invokeLLM } from "./_core/llm";
import {
  findBudgetDuplicates,
  findInvalidSummaryItems,
  type AuditorBudgetItem,
} from "./agents/dedupUtils";
import { AuditorAgent } from "./agents";
import type { AuditorInput, AuditorOutput } from "../shared/agents";

describe("findBudgetDuplicates (P2.6)", () => {
  it("detecta duplicata exata (descrição idêntica após normalização)", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Pintura acrílica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
      {
        description: "pintura acrilica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
    ];
    const findings = findBudgetDuplicates(items);
    expect(findings).toHaveLength(1);
    expect(findings[0].estimatedImpact).toBe(1500);
    expect(findings[0].reason).toContain("Duplicata exata");
  });

  it("detecta alta similaridade entre descrições verbosas", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Tomada elétrica simples 10A 2P+T branca padrão Brasil",
        unit: "un",
        quantity: 10,
        unitCostTotal: 12,
        totalCost: 120,
      },
      {
        description: "Tomada elétrica simples 10A 2P+T branca padrão",
        unit: "un",
        quantity: 8,
        unitCostTotal: 12,
        totalCost: 96,
      },
    ];
    const findings = findBudgetDuplicates(items);
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toMatch(/Alta similaridade|Duplicata exata/);
  });

  it("não confunde itens diferentes da mesma categoria", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Tomada elétrica simples",
        unit: "un",
        quantity: 10,
        unitCostTotal: 5,
        totalCost: 50,
        category: "Elétrica",
      },
      {
        description: "Tomada elétrica USB dupla",
        unit: "un",
        quantity: 5,
        unitCostTotal: 15,
        totalCost: 75,
        category: "Elétrica",
      },
    ];
    expect(findBudgetDuplicates(items)).toHaveLength(0);
  });

  it("retorna lista vazia para input com menos de 2 itens", () => {
    expect(findBudgetDuplicates([])).toEqual([]);
    expect(
      findBudgetDuplicates([
        { description: "Único item", unit: "un", quantity: 1, totalCost: 10 },
      ])
    ).toEqual([]);
  });

  it("usa totalCost como fallback quando quantity ou unitCostTotal estão ausentes", () => {
    const items: AuditorBudgetItem[] = [
      { description: "Limpeza pós obra", unit: "vb", totalCost: 800 },
      { description: "Limpeza pós-obra", unit: "vb", totalCost: 800 },
    ];
    const findings = findBudgetDuplicates(items);
    expect(findings).toHaveLength(1);
    expect(findings[0].estimatedImpact).toBe(800);
  });
});

describe("findInvalidSummaryItems (P2.6)", () => {
  it("detecta item PAI com totalCost > 0", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Sistema VRF completo",
        isSummaryItem: true,
        totalCost: 75_000,
      },
      {
        description: "Condensadora VRF",
        isSummaryItem: false,
        totalCost: 35_000,
      },
      { description: "Fan coil VRF", isSummaryItem: false, totalCost: 40_000 },
    ];
    const findings = findInvalidSummaryItems(items);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toBe("Sistema VRF completo");
    expect(findings[0].estimatedImpact).toBe(75_000);
  });

  it("ignora item PAI com custo zero (correto por convenção)", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Sistema VRF completo",
        isSummaryItem: true,
        totalCost: 0,
      },
    ];
    expect(findInvalidSummaryItems(items)).toEqual([]);
  });

  it("ignora itens não-PAI mesmo com custo positivo", () => {
    const items: AuditorBudgetItem[] = [
      {
        description: "Pintura interna",
        isSummaryItem: false,
        totalCost: 5_000,
      },
    ];
    expect(findInvalidSummaryItems(items)).toEqual([]);
  });
});

const baseAuditorInput = (
  budgetItems: AuditorBudgetItem[],
  totalDirectCost: number,
  totalLogisticsCost: number
): AuditorInput =>
  ({
    allAgentOutputs: {
      engenheiro: {} as never,
      logistica: { totalLogisticsCost, costs: [] } as never,
      orcamentista: { budgetItems, totalDirectCost } as never,
      tributario: { totalTaxes: 0 } as never,
      comercial: { finalPrice: 0 } as never,
      gestao: { totalDuration: 30 } as never,
      financeiro: { cashFlow: [] } as never,
      juridico: { validityDays: 30 } as never,
      board: { approved: true, blockProposal: false } as never,
    },
    projectConfig: { name: "Teste P2.6", bdiPercentual: 25 },
    hasCustomSettings: true,
  }) as AuditorInput;

const buildLlmAuditorResponse = (output: Partial<AuditorOutput>) => ({
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: JSON.stringify({
          isValid: true,
          validationScore: 80,
          criticalErrors: 0,
          warnings: 0,
          validations: [],
          crossAgentChecks: [],
          financialSummary: {
            directCost: 0,
            logisticsCost: 0,
            baseCost: 0,
            bdiAmount: 0,
            taxes: 0,
            finalPrice: 0,
            grossMargin: 0,
            grossMarginPercent: 0,
            netMargin: 0,
            netMarginPercent: 0,
          },
          auditSeal: "approved",
          auditTimestamp: "2026-05-04T00:00:00Z",
          auditNotes: "ok",
          ...output,
        }),
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

describe("AuditorAgent.execute (P2.6 — dedup determinístico)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.AUDITOR_USE_LLM_DEDUP;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  const mockForge = (auditorOutput: Partial<AuditorOutput>) => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(buildLlmAuditorResponse(auditorOutput)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  };

  it("merge LLM ∪ determinístico: ambos sobrevivem (P2 ADENDO atualiza P2.6)", async () => {
    // P2.6 original sobrescrevia totalmente o output da LLM com o
    // resultado determinístico — premissa: LLM podia alucinar, melhor
    // descartar. P2 ADENDO inverteu a política para acomodar dedup
    // SEMÂNTICA: LLM agora detecta sobreposições que Jaccard não pega
    // (ex.: "Desativação" vs "Remoção corte içamento" — mesmo objeto,
    // descrições lexicalmente distantes). Trade-off conhecido: itens
    // novos da LLM podem ser falsos positivos, mas o usuário revisa
    // via AuditCorrectionsModal antes de aplicar.
    mockForge({
      corrections: {
        budgetItemsToRemove: [
          {
            description: "Item adicional detectado pela LLM",
            reason: "Sobreposição semântica fora do alcance do Jaccard",
            estimatedImpact: 9_999,
          },
        ],
        logisticsToRemove: [],
        totalImpact: 9_999,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    // Orçamento com 1 duplicata real (mesmo descrição lower/upper).
    const items: AuditorBudgetItem[] = [
      {
        description: "Pintura acrílica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
      {
        description: "pintura acrilica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
    ];

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(items, 3000, 500));

    // Determinístico (Pintura) + LLM (Item adicional) = 2 findings.
    expect(out.corrections?.budgetItemsToRemove).toHaveLength(2);
    const descs =
      out.corrections?.budgetItemsToRemove?.map(c => c.description) ?? [];
    expect(descs.some(d => /pintura/i.test(d))).toBe(true);
    expect(descs.some(d => d.includes("Item adicional"))).toBe(true);

    // Logística da LLM preservada
    expect(out.corrections?.logisticsToRemove).toEqual([]);

    // Total = 1500 (Pintura) + 9999 (LLM) = 11499
    expect(out.corrections?.totalImpact).toBe(11499);
    expect(out.corrections?.correctedDirectCost).toBe(3000 - 11499);
    expect(out.corrections?.correctedLogisticsCost).toBe(500);
  });

  it("preserva logisticsToRemove gerado pela LLM e soma no totalImpact", async () => {
    mockForge({
      corrections: {
        budgetItemsToRemove: [],
        logisticsToRemove: [
          {
            description: "Frete já incluso na composição SINAPI",
            reason: "Sobreposição com BDI base",
            estimatedImpact: 200,
          },
        ],
        totalImpact: 200,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const items: AuditorBudgetItem[] = [
      {
        description: "Bloco cerâmico 9x19x39",
        unit: "un",
        quantity: 100,
        totalCost: 250,
      },
    ];
    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(items, 250, 1000));

    expect(out.corrections?.budgetItemsToRemove).toEqual([]);
    expect(out.corrections?.logisticsToRemove).toHaveLength(1);
    expect(out.corrections?.totalImpact).toBe(200);
    expect(out.corrections?.correctedLogisticsCost).toBe(800);
  });

  it("respeita feature flag AUDITOR_USE_LLM_DEDUP=true (caminho legado)", async () => {
    process.env.AUDITOR_USE_LLM_DEDUP = "true";
    mockForge({
      corrections: {
        budgetItemsToRemove: [
          {
            description: "Item detectado pela LLM",
            reason: "LLM dedup",
            estimatedImpact: 500,
          },
        ],
        logisticsToRemove: [],
        totalImpact: 500,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const items: AuditorBudgetItem[] = [
      {
        description: "Pintura acrílica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
      {
        description: "pintura acrilica",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
    ];

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(items, 3000, 500));

    // Com flag ativa, o output da LLM passa intacto
    expect(out.corrections?.budgetItemsToRemove).toHaveLength(1);
    expect(out.corrections?.budgetItemsToRemove?.[0].description).toBe(
      "Item detectado pela LLM"
    );
    expect(out.corrections?.totalImpact).toBe(500);
  });

  it("retorna lista vazia quando não há duplicatas reais", async () => {
    mockForge({
      corrections: {
        budgetItemsToRemove: [],
        logisticsToRemove: [],
        totalImpact: 0,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const items: AuditorBudgetItem[] = [
      {
        description: "Bloco cerâmico",
        unit: "un",
        quantity: 100,
        unitCostTotal: 2.5,
        totalCost: 250,
      },
      {
        description: "Argamassa AC-I",
        unit: "kg",
        quantity: 50,
        unitCostTotal: 1,
        totalCost: 50,
      },
    ];
    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(items, 300, 100));

    expect(out.corrections?.budgetItemsToRemove).toEqual([]);
    expect(out.corrections?.totalImpact).toBe(0);
    expect(out.corrections?.correctedDirectCost).toBe(300);
  });

  // chamada invokeLLM é exercitada implicitamente pelos testes acima via fetchSpy
  it("invokeLLM exportado continua disponível (sanity)", () => {
    expect(typeof invokeLLM).toBe("function");
  });
});
