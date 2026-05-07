/**
 * P2 — robustez de parsing JSON dos agentes.
 *
 * Cobre:
 *  - escapeUnescapedQuotes: aspas não-escapadas dentro de strings.
 *  - tolerantJsonParse: caminhos progressivos (literals, commas, quotes,
 *    combinado).
 *  - tryTolerantJsonParse: retorna null em vez de lançar.
 *  - BaseAgent retry de correção: 1ª chamada quebrada → 2ª corrigida →
 *    sucesso. Retry falha duas vezes → propaga erro original.
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

import {
  escapeUnescapedQuotes,
  tolerantJsonParse,
  tryTolerantJsonParse,
} from "./agents/jsonRepair";

describe("escapeUnescapedQuotes (P2)", () => {
  it("não toca em JSON válido (idempotente)", () => {
    const valid = '{"a":"valor","b":42,"c":true}';
    expect(escapeUnescapedQuotes(valid)).toBe(valid);
  });

  it("escapa aspas internas em descrição longa (caso DGOA real)", () => {
    // Reproduz o padrão que quebrou na posição 6589: aspas em torno
    // de uma palavra dentro de uma string mais longa.
    const broken =
      '{"description":"Item com aspas "internas" no meio","valor":1}';
    const fixed = escapeUnescapedQuotes(broken);
    // Após escape, JSON.parse deve funcionar.
    const parsed = JSON.parse(fixed) as { description: string; valor: number };
    expect(parsed.description).toBe('Item com aspas "internas" no meio');
    expect(parsed.valor).toBe(1);
  });

  it('preserva sequências de escape existentes (\\n, \\", \\\\)', () => {
    const valid = '{"line":"primeiro\\nsegundo","quote":"ele disse \\"oi\\""}';
    const out = escapeUnescapedQuotes(valid);
    expect(JSON.parse(out)).toEqual({
      line: "primeiro\nsegundo",
      quote: 'ele disse "oi"',
    });
  });

  it("não confunde aspas de fechamento legítimas (seguidas de , } : ])", () => {
    const valid = '[{"a":"x"},{"b":"y"}]';
    expect(escapeUnescapedQuotes(valid)).toBe(valid);
  });

  it("escapa aspas em strings com várias palavras quotadas", () => {
    const broken =
      '{"recommendation":"Revisar regime "Lucro Presumido" ou faixa do "Simples""}';
    const fixed = escapeUnescapedQuotes(broken);
    const parsed = JSON.parse(fixed) as { recommendation: string };
    expect(parsed.recommendation).toContain("Lucro Presumido");
    expect(parsed.recommendation).toContain("Simples");
  });
});

describe("tolerantJsonParse (P2)", () => {
  it("parse direto quando JSON é válido", () => {
    expect(tolerantJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("recupera de undefined / NaN / Infinity como valores", () => {
    expect(tolerantJsonParse('{"a":undefined,"b":NaN,"c":Infinity}')).toEqual({
      a: null,
      b: null,
      c: null,
    });
  });

  it("recupera de trailing commas em arrays e objetos", () => {
    expect(tolerantJsonParse('{"items":[1,2,3,],}')).toEqual({
      items: [1, 2, 3],
    });
  });

  it("recupera de aspas não-escapadas em strings", () => {
    expect(
      tolerantJsonParse(
        '{"description":"Item com aspas "internas" aqui","valor":42}'
      )
    ).toEqual({
      description: 'Item com aspas "internas" aqui',
      valor: 42,
    });
  });

  it("recupera de combinação aspas + literals + trailing commas", () => {
    const broken = '{"items":[{"name":"obra "Hangar"","cost":undefined,},],}';
    const parsed = tolerantJsonParse(broken) as any;
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].name).toBe('obra "Hangar"');
    expect(parsed.items[0].cost).toBeNull();
  });

  it("lança quando o output é fundamentalmente inválido", () => {
    expect(() => tolerantJsonParse("{ não é JSON ")).toThrow();
  });
});

describe("tryTolerantJsonParse (P2)", () => {
  it("retorna o valor parseado quando OK", () => {
    expect(tryTolerantJsonParse('{"x":1}')).toEqual({ x: 1 });
  });

  it("retorna null em vez de lançar quando irrecuperável", () => {
    expect(tryTolerantJsonParse("{ não é JSON ")).toBeNull();
  });
});

// ─── Integração: retry de correção via LLM ─────────────────────────────────

import { AuditorAgent } from "./agents";
import type { AuditorInput, AuditorOutput } from "../shared/agents";

const baseAuditorInput = (): AuditorInput =>
  ({
    allAgentOutputs: {
      engenheiro: {} as never,
      logistica: { totalLogisticsCost: 0, costs: [] } as never,
      orcamentista: { budgetItems: [], totalDirectCost: 0 } as never,
      tributario: { totalTaxes: 0 } as never,
      comercial: { finalPrice: 0 } as never,
      gestao: { totalDuration: 30 } as never,
      financeiro: { cashFlow: [] } as never,
      juridico: { validityDays: 30 } as never,
      board: { approved: true, blockProposal: false } as never,
    },
    projectConfig: { name: "JSON robustness test", bdiPercentual: 25 },
    hasCustomSettings: true,
  }) as AuditorInput;

const wellFormedOutput: Partial<AuditorOutput> = {
  isValid: true,
  validationScore: 90,
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
};

const buildResponse = (rawContent: string) => ({
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: rawContent },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

describe("BaseAgent retry de correção (P2 — caso DGOA)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.AUDITOR_USE_LLM_DEDUP;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("recupera de JSON malformado via retry de correção", async () => {
    // 1ª chamada: aspas não-escapadas (Sonnet vazou aspas em "Hangar").
    // tolerantJsonParse vai recuperar via escapeUnescapedQuotes — não
    // chega no retry. Cobre o caso comum.
    const brokenContent = JSON.stringify(wellFormedOutput).replace(
      '"auditNotes":"ok"',
      '"auditNotes":"obra "Hangar Avjet" — sem alertas"'
    );

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(buildResponse(brokenContent)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput());
    expect(out.auditNotes).toContain("Hangar Avjet");
    // Apenas 1 fetch — escapeUnescapedQuotes resolveu sem retry.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("dispara retry de correção quando tolerantJsonParse falha completamente", async () => {
    // Conteúdo tão quebrado que nenhum saneamento progressivo resolve.
    // 1ª chamada: lixo. 2ª chamada (correção): JSON limpo.
    const irreparable = '{"isValid": true broken syntax}';
    const cleanCorrection = JSON.stringify(wellFormedOutput);

    let callCount = 0;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      const content = callCount === 1 ? irreparable : cleanCorrection;
      return new Response(JSON.stringify(buildResponse(content)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const auditor = new AuditorAgent();
    const out = await auditor.execute(baseAuditorInput());
    expect(out.isValid).toBe(true);
    // 2 chamadas: original + retry de correção.
    expect(callCount).toBe(2);
  });

  it("propaga erro quando retry de correção também falha", async () => {
    // JSON FECHADO ({...}) mas sintaticamente irreparável — distingue
    // do caso de truncamento que tem branch dedicado.
    const irreparable = '{"isValid": broken-token-here unparseable}';
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(buildResponse(irreparable)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const auditor = new AuditorAgent();
    await expect(auditor.execute(baseAuditorInput())).rejects.toThrow(
      /invalid JSON|retry de correção/i
    );
  });
});
