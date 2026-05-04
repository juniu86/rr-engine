/**
 * P1.1: Suite de regressão antes/depois da migração Opus → Sonnet em
 * Tributário, Jurídico e Board.
 *
 * **NÃO roda em CI por default** — chamadas LLM reais custam tokens.
 * Para rodar, use:
 *   RUN_REGRESSION=1 ANTHROPIC_API_KEY=... pnpm test agents-regression
 *
 * Roteiro recomendado pelo ticket:
 * 1. Faça checkout do estado pré-PR (modelo = Opus em todos os 3).
 * 2. RUN_REGRESSION=1 pnpm test agents-regression — capture latências
 *    e outputs.
 * 3. Volte ao estado pós-PR (Sonnet).
 * 4. RUN_REGRESSION=1 pnpm test agents-regression novamente.
 * 5. Compare: outputs estruturalmente equivalentes, valores numéricos
 *    dentro de ±2%, latência igual ou menor, custo via P0.3 caindo
 *    40-70%.
 */

import { describe, expect, it } from "vitest";
import { agents } from "./agents";
import casos from "./agents/__regression__/casos.json";
import type {
  TributarioInput,
  JuridicoInput,
  BoardInput,
} from "../shared/agents";

const SHOULD_RUN = process.env.RUN_REGRESSION === "1";
const TIMEOUT_MS = 60_000;

const describeRegression = SHOULD_RUN ? describe : describe.skip;

describeRegression("Regressão Tributário (P1.1)", () => {
  for (const caso of casos.tributario) {
    it(
      `${caso.id} — ${caso.description}`,
      async () => {
        const out = await agents.tributario.execute(caso.input as TributarioInput);
        expect(out.classifiedItems.length).toBeGreaterThan(0);
        const totalCost = caso.input.budgetItems.reduce(
          (s, i) => s + i.totalCost,
          0
        );
        const ratio = totalCost > 0 ? out.totalTaxes / totalCost : 0;
        expect(ratio).toBeGreaterThanOrEqual(caso.expectedTaxRange[0]);
        expect(ratio).toBeLessThanOrEqual(caso.expectedTaxRange[1]);
      },
      TIMEOUT_MS
    );
  }
});

describeRegression("Regressão Jurídico (P1.1)", () => {
  for (const caso of casos.juridico) {
    it(
      `${caso.id} — ${caso.description}`,
      async () => {
        const out = await agents.juridico.execute(caso.input as unknown as JuridicoInput);
        expect(out).toBeDefined();
        // Estrutura mínima: contrato deve ter texto não vazio.
        const flat = JSON.stringify(out).toLowerCase();
        for (const kw of caso.expectedKeywords) {
          expect(flat).toContain(kw.toLowerCase());
        }
      },
      TIMEOUT_MS
    );
  }
});

describeRegression("Regressão Board (P1.1)", () => {
  for (const caso of casos.board) {
    it(
      `${caso.id} — ${caso.description}`,
      async () => {
        const out = await agents.board.execute(caso.input as unknown as BoardInput);
        expect(out).toBeDefined();

        const c = caso as Record<string, unknown>;
        if (c.expectedDecision === "approved") {
          expect(out.approved).toBe(true);
        }
        if (c.expectedDecisionNotApproved) {
          // Margem baixa: ou não aprovado ou aprovado_com_warnings (warnings > 0)
          const warnings = (out.warningMessages?.length ?? 0) > 0;
          expect(out.approved === false || warnings).toBe(true);
        }
        if (c.expectsBillingScheduleSuggestion) {
          expect(out.suggestedBillingSchedule).toBeDefined();
        }
        if (c.expectsWarning) {
          expect((out.warningMessages?.length ?? 0)).toBeGreaterThan(0);
        }
      },
      TIMEOUT_MS
    );
  }
});

// Sentinela: garante que o arquivo não fica completamente vazio quando a flag
// não está setada — assim o vitest sempre tem ao menos 1 teste para reportar.
describe("agents-regression sentinela", () => {
  it("flag RUN_REGRESSION controla se a suite real roda", () => {
    expect(typeof SHOULD_RUN).toBe("boolean");
  });
});
