/**
 * P2 Adendo — dedup semântica do Auditor.
 *
 * Reproduz o caso do smoke test PAA DGOA (06/05/2026): 3 itens descrevendo
 * a mesma "Remoção de 2 tanques de 15.000 L" com vocabulário diferente
 * (Desativação / Remoção corte içamento / Remoção acessórios bases).
 * dedupUtils (Jaccard ≥ 0.85) NÃO pega — descrições lexicalmente distantes.
 * O Auditor (LLM) DEVE detectar a sobreposição semântica e popular
 * `corrections.budgetItemsToRemove` com 2 itens (mantendo 1).
 *
 * Cobre:
 *  - LLM populando 2 itens em budgetItemsToRemove: caller mescla com
 *    determinísticos sem dedupar (não há overlap → 2 mantidos).
 *  - LLM populando 0 itens (regressão antiga): auditNotes mencionando
 *    sobreposição → warning loggado, mas não trava o pipeline.
 *  - LLM populando duplicado de algum determinístico: dedup por
 *    description normalizada — fica 1 só.
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

import { AuditorAgent } from "./agents";
import type { AuditorInput, AuditorOutput } from "../shared/agents";
import type { AuditorBudgetItem } from "./agents/dedupUtils";

const baseAuditorInput = (
  budgetItems: AuditorBudgetItem[],
  totalDirectCost: number,
  totalLogisticsCost = 0
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
    projectConfig: { name: "PAA DGOA — Remoção de tanques", bdiPercentual: 25 },
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
          auditTimestamp: "2026-05-06T00:00:00Z",
          auditNotes: "ok",
          ...output,
        }),
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

const ITEM_2 =
  "Desativação completa: esgotamento, drenagem, inertização N2, desgaseificação, limpeza interna";
const ITEM_3 =
  "Remoção dos 2 tanques: corte, içamento, transporte interno e destinação";
const ITEM_30 =
  "Remoção de 2 tanques: acessórios, bases, fixações, desgaseificação e preparação";

const TANK_ITEMS: AuditorBudgetItem[] = [
  {
    description: ITEM_2,
    unit: "vb",
    quantity: 1,
    unitCostTotal: 38000,
    totalCost: 38000,
    category: "Desativação",
  },
  {
    description: ITEM_3,
    unit: "vb",
    quantity: 1,
    unitCostTotal: 25000,
    totalCost: 25000,
    category: "Remoção",
  },
  {
    description: ITEM_30,
    unit: "vb",
    quantity: 1,
    unitCostTotal: 24000,
    totalCost: 24000,
    category: "Remoção",
  },
];

describe("Dedup semântica do Auditor (P2 ADENDO — caso PAA DGOA)", () => {
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

  it("merge LLM + determinístico: LLM detecta 2 itens semanticamente sobrepostos não pegos pelo Jaccard", async () => {
    // dedupUtils Jaccard ≥ 0.85 NÃO pega ITEM_3 vs ITEM_30 (vocabulário muito
    // diverso); por isso o LLM tem de popular o que faltou.
    mockForge({
      auditNotes:
        "Sobreposição de escopo entre itens 2, 3 e 30 (remoção dos mesmos 2 tanques). Decisão tomada.",
      validations: [
        {
          rule: "scope_overlap_decision",
          description: "Sobreposição de escopo: remoção de tanques",
          expected: "1 item descritivo único",
          actual: "3 itens com escopo sobreposto",
          passed: false,
          severity: "critical",
          recommendation: "Aprovar remoção via AuditCorrectionsModal",
        },
      ],
      auditSeal: "approved_with_warnings",
      corrections: {
        budgetItemsToRemove: [
          {
            description: ITEM_3,
            reason:
              "Sobreposição com Item 2 (desativação completa engloba remoção)",
            estimatedImpact: 25000,
          },
          {
            description: ITEM_30,
            reason: "Sobreposição com Item 2 — desgaseificação já incluída",
            estimatedImpact: 24000,
          },
        ],
        logisticsToRemove: [],
        totalImpact: 49000,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(TANK_ITEMS, 87000));

    expect(out.corrections?.budgetItemsToRemove).toHaveLength(2);
    const descs =
      out.corrections?.budgetItemsToRemove.map(c => c.description) ?? [];
    expect(descs).toContain(ITEM_3);
    expect(descs).toContain(ITEM_30);
    expect(descs).not.toContain(ITEM_2);

    expect(out.corrections?.totalImpact).toBe(49000);
    expect(out.corrections?.correctedDirectCost).toBe(87000 - 49000);
  });

  it("dedup contra determinístico: LLM e algoritmo apontam o mesmo item → conta uma vez só", async () => {
    // 2 itens lexicalmente idênticos (Jaccard 1.0 → algoritmo pega) MAIS
    // o ITEM_3 que o algoritmo não pega. LLM aponta tanto a duplicata
    // exata (já no determinístico) quanto a semântica.
    const itemsWithExactDup: AuditorBudgetItem[] = [
      {
        description: "Pintura acrílica dupla demão",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
      {
        description: "Pintura acrílica dupla demão",
        unit: "m²",
        quantity: 50,
        unitCostTotal: 30,
        totalCost: 1500,
      },
      {
        description: ITEM_3,
        unit: "vb",
        quantity: 1,
        unitCostTotal: 25000,
        totalCost: 25000,
      },
    ];

    mockForge({
      corrections: {
        budgetItemsToRemove: [
          // LLM duplica a duplicata exata (que algoritmo já pegou):
          {
            description: "Pintura acrílica dupla demão",
            reason: "LLM percebeu duplicata também",
            estimatedImpact: 1500,
          },
          // E adiciona uma semântica que o algoritmo não pega:
          {
            description: ITEM_3,
            reason: "Sobreposição com outro item",
            estimatedImpact: 25000,
          },
        ],
        logisticsToRemove: [],
        totalImpact: 26500,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const auditor = new AuditorAgent();
    const out = await auditor.execute(
      baseAuditorInput(itemsWithExactDup, 28000)
    );

    // 2 itens removidos: 1 do determinístico (pintura) + 1 do LLM (ITEM_3).
    // A "Pintura acrílica" do LLM foi deduplicada contra a do determinístico.
    expect(out.corrections?.budgetItemsToRemove).toHaveLength(2);
    const descs = (out.corrections?.budgetItemsToRemove ?? []).map(
      c => c.description
    );
    expect(descs.filter(d => d.toLowerCase().includes("pintura"))).toHaveLength(
      1
    );
    expect(descs).toContain(ITEM_3);
  });

  it("LLM falha em popular: notes menciona sobreposição mas array vazio (regressão)", async () => {
    // Cenário pré-fix: LLM percebe overlap mas só fala em texto livre.
    // O caller não vai forçar nada (decisão é da LLM); apenas verifica
    // que a saída sai com 0 itens nesse caso.
    mockForge({
      auditNotes:
        "Sobreposição de escopo entre itens 2, 3 e 30: não são duplicatas exatas, mas podem representar dupla contagem.",
      corrections: {
        budgetItemsToRemove: [],
        logisticsToRemove: [],
        totalImpact: 0,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(TANK_ITEMS, 87000));

    // Sem dedup determinístico ativada (Jaccard não pega ITEM_3 vs ITEM_30):
    // budgetItemsToRemove fica vazio e o pipeline NÃO bloqueia. O warning
    // é emitido em agentPersistence.ts (testado separadamente).
    expect(out.corrections?.budgetItemsToRemove).toHaveLength(0);
    expect(out.corrections?.totalImpact).toBe(0);
    expect(out.corrections?.correctedDirectCost).toBe(87000);
  });

  it("respeita feature flag AUDITOR_USE_LLM_DEDUP=true (LLM passa intacto)", async () => {
    process.env.AUDITOR_USE_LLM_DEDUP = "true";
    mockForge({
      corrections: {
        budgetItemsToRemove: [
          {
            description: ITEM_3,
            reason: "LLM dedup",
            estimatedImpact: 25000,
          },
        ],
        logisticsToRemove: [],
        totalImpact: 25000,
        correctedDirectCost: 0,
        correctedLogisticsCost: 0,
      },
    });

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput(TANK_ITEMS, 87000));

    // Com flag ativa, output da LLM passa direto — não há merge nem dedup.
    expect(out.corrections?.budgetItemsToRemove).toHaveLength(1);
    expect(out.corrections?.totalImpact).toBe(25000);
  });
});
