import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  createAuditorChunkedInputs,
  mergeAuditorOutputs,
  needsAuditorChunking,
} from "./agents/auditorChunking";
import type { AuditorInput, AuditorOutput } from "../shared/agents";
import { generateMockBudgetItems } from "./test-helpers";

const buildAuditorInput = (itemCount: number): AuditorInput =>
  ({
    allAgentOutputs: {
      engenheiro: {} as AuditorInput["allAgentOutputs"]["engenheiro"],
      logistica: {} as AuditorInput["allAgentOutputs"]["logistica"],
      orcamentista: {
        budgetItems: generateMockBudgetItems(itemCount),
        totalDirectCost: 100_000,
        totalCostByCategory: {},
        totalCostBySource: {},
        criticalItems: [],
        recommendations: [],
        priceJustifications: [],
        budgetCount: itemCount,
        curvaAItems: [],
        curvaCItems: [],
      } as unknown as AuditorInput["allAgentOutputs"]["orcamentista"],
      tributario: {} as AuditorInput["allAgentOutputs"]["tributario"],
      comercial: {} as AuditorInput["allAgentOutputs"]["comercial"],
      gestao: {} as AuditorInput["allAgentOutputs"]["gestao"],
      financeiro: {} as AuditorInput["allAgentOutputs"]["financeiro"],
      juridico: {} as AuditorInput["allAgentOutputs"]["juridico"],
      board: {} as AuditorInput["allAgentOutputs"]["board"],
    },
    projectConfig: {
      name: "Projeto teste",
      bdiPercentual: 25,
    },
    hasCustomSettings: false,
  }) as AuditorInput;

const buildAuditorOutput = (
  overrides: Partial<AuditorOutput> = {}
): AuditorOutput =>
  ({
    isValid: true,
    validationScore: 95,
    criticalErrors: 0,
    warnings: 0,
    validations: [],
    crossAgentChecks: [],
    financialSummary: {
      directCost: 100_000,
      logisticsCost: 0,
      baseCost: 100_000,
      bdiAmount: 25_000,
      taxes: 0,
      finalPrice: 125_000,
      grossMargin: 25_000,
      grossMarginPercent: 20,
      netMargin: 25_000,
      netMarginPercent: 20,
    },
    auditSeal: "approved",
    auditTimestamp: "2026-05-04T00:00:00Z",
    auditNotes: "ok",
    ...overrides,
  }) as AuditorOutput;

describe("needsAuditorChunking (P0.4)", () => {
  it("retorna false quando há <= CHUNK_SIZE itens", () => {
    expect(needsAuditorChunking(buildAuditorInput(10))).toBe(false);
    expect(needsAuditorChunking(buildAuditorInput(CHUNK_SIZE))).toBe(false);
  });

  it("retorna true quando há > CHUNK_SIZE itens", () => {
    expect(needsAuditorChunking(buildAuditorInput(CHUNK_SIZE + 1))).toBe(true);
    expect(needsAuditorChunking(buildAuditorInput(250))).toBe(true);
  });

  it("retorna false para input sem budgetItems", () => {
    const input = {
      allAgentOutputs: {
        orcamentista: { budgetItems: [] },
      },
    } as unknown as AuditorInput;
    expect(needsAuditorChunking(input)).toBe(false);
  });
});

describe("createAuditorChunkedInputs (P0.4)", () => {
  it("divide 250 itens em chunks de CHUNK_SIZE", () => {
    const input = buildAuditorInput(250);
    const chunks = createAuditorChunkedInputs(input);

    expect(chunks).toHaveLength(Math.ceil(250 / CHUNK_SIZE));
    const totalItemsAcrossChunks = chunks.reduce(
      (acc, c) =>
        acc + (c.allAgentOutputs.orcamentista?.budgetItems?.length ?? 0),
      0
    );
    expect(totalItemsAcrossChunks).toBe(250);
  });

  it("anexa _chunkInfo com isFirst=true só no primeiro chunk", () => {
    const chunks = createAuditorChunkedInputs(buildAuditorInput(180));
    const infos = chunks.map(
      c =>
        (
          c as unknown as {
            _chunkInfo: { index: number; total: number; isFirst: boolean };
          }
        )._chunkInfo
    );

    expect(infos[0]).toEqual({ index: 1, total: 3, isFirst: true });
    expect(infos[1]).toEqual({ index: 2, total: 3, isFirst: false });
    expect(infos[2]).toEqual({ index: 3, total: 3, isFirst: false });
  });

  it("preserva os outros agentOutputs em todos os chunks", () => {
    const input = buildAuditorInput(120);
    const chunks = createAuditorChunkedInputs(input);

    for (const chunk of chunks) {
      expect(chunk.projectConfig).toEqual(input.projectConfig);
      expect(chunk.hasCustomSettings).toBe(input.hasCustomSettings);
      // Apenas budgetItems é particionado; o resto da struct vem inteiro
      expect(chunk.allAgentOutputs.orcamentista).toBeDefined();
    }
  });

  it("retorna [input] quando não há itens", () => {
    const empty = buildAuditorInput(0);
    expect(createAuditorChunkedInputs(empty)).toHaveLength(1);
  });
});

describe("mergeAuditorOutputs (P0.4)", () => {
  it("retorna o output único quando há só 1 chunk", () => {
    const out = buildAuditorOutput({ auditNotes: "single" });
    expect(mergeAuditorOutputs([out])).toBe(out);
  });

  it("lança quando não há outputs", () => {
    expect(() => mergeAuditorOutputs([])).toThrow();
  });

  it("concatena validations de todos os chunks", () => {
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({
        validations: [
          {
            rule: "r1",
            description: "d1",
            expected: "e1",
            actual: "a1",
            passed: true,
            severity: "info",
          },
        ],
      }),
      buildAuditorOutput({
        validations: [
          {
            rule: "r2",
            description: "d2",
            expected: "e2",
            actual: "a2",
            passed: false,
            severity: "warning",
          },
        ],
      }),
    ]);

    expect(merged.validations).toHaveLength(2);
    expect(merged.validations.map(v => v.rule)).toEqual(["r1", "r2"]);
  });

  it("aplica pior caso ao auditSeal (rejected > approved_with_warnings > approved)", () => {
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({ auditSeal: "approved" }),
      buildAuditorOutput({ auditSeal: "rejected" }),
      buildAuditorOutput({ auditSeal: "approved_with_warnings" }),
    ]);
    expect(merged.auditSeal).toBe("rejected");

    const merged2 = mergeAuditorOutputs([
      buildAuditorOutput({ auditSeal: "approved" }),
      buildAuditorOutput({ auditSeal: "approved_with_warnings" }),
    ]);
    expect(merged2.auditSeal).toBe("approved_with_warnings");
  });

  it("soma criticalErrors e warnings, isValid=false se algum chunk tem critical", () => {
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({ criticalErrors: 0, warnings: 1, isValid: true }),
      buildAuditorOutput({ criticalErrors: 2, warnings: 3, isValid: false }),
    ]);

    expect(merged.criticalErrors).toBe(2);
    expect(merged.warnings).toBe(4);
    expect(merged.isValid).toBe(false);
  });

  it("usa financialSummary, crossAgentChecks e deterministicValidation do primeiro chunk", () => {
    const firstSummary = {
      directCost: 99_999,
      logisticsCost: 0,
      baseCost: 99_999,
      bdiAmount: 0,
      taxes: 0,
      finalPrice: 99_999,
      grossMargin: 0,
      grossMarginPercent: 0,
      netMargin: 0,
      netMarginPercent: 0,
    };
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({
        financialSummary: firstSummary,
        crossAgentChecks: [
          {
            check: "global",
            agents: ["a", "b"],
            consistent: true,
            details: "ok",
          },
        ],
        deterministicValidation: {
          deterministicTotal: 100_000,
          llmTotal: 99_999,
          divergencePercent: 0,
          severity: "info",
          notes: "match",
        },
      }),
      buildAuditorOutput({
        financialSummary: {
          ...firstSummary,
          directCost: 0,
        },
        crossAgentChecks: [], // chunks subsequentes não rodam globais
      }),
    ]);

    expect(merged.financialSummary.directCost).toBe(99_999);
    expect(merged.crossAgentChecks).toHaveLength(1);
    expect(merged.deterministicValidation?.severity).toBe("info");
  });

  it("concatena corrections.budgetItemsToRemove e recalcula totalImpact", () => {
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({
        corrections: {
          budgetItemsToRemove: [
            {
              description: "Item 1 dup",
              reason: "dup do item 0",
              estimatedImpact: 100,
            },
          ],
          logisticsToRemove: [],
          totalImpact: 100,
          correctedDirectCost: 99_900,
          correctedLogisticsCost: 0,
        },
      }),
      buildAuditorOutput({
        corrections: {
          budgetItemsToRemove: [
            {
              description: "Item 150 dup",
              reason: "dup do item 0",
              estimatedImpact: 200,
            },
          ],
          logisticsToRemove: [
            {
              description: "Frete embutido",
              reason: "ja em SINAPI",
              estimatedImpact: 50,
            },
          ],
          totalImpact: 250,
          correctedDirectCost: 0,
          correctedLogisticsCost: 0,
        },
      }),
    ]);

    expect(merged.corrections?.budgetItemsToRemove).toHaveLength(2);
    expect(merged.corrections?.logisticsToRemove).toHaveLength(1);
    expect(merged.corrections?.totalImpact).toBe(350); // 100 + 200 + 50
    // Custos corrigidos vêm do primeiro chunk
    expect(merged.corrections?.correctedDirectCost).toBe(99_900);
  });

  it("calcula validationScore como média dos chunks", () => {
    const merged = mergeAuditorOutputs([
      buildAuditorOutput({ validationScore: 100 }),
      buildAuditorOutput({ validationScore: 80 }),
      buildAuditorOutput({ validationScore: 60 }),
    ]);
    expect(merged.validationScore).toBe(80);
  });
});
