/**
 * P2 — testes para os 3 fixes de qualidade pós-Sprint-5.
 *
 * Cobre:
 *  - Fix 1 (Tributário): few-shot está presente no prompt; instrução
 *    proibindo `taxClassification`/`classification`.
 *  - Fix 2 (Auditor): few-shot com 2 exemplos; fórmula determinista
 *    do validationScore presente no prompt.
 *  - Fix 3 (Stripe webhook): getSubscriptionPeriod resolve raiz,
 *    items.data[0], retorna null quando ambos faltam.
 */
import { describe, expect, it } from "vitest";

// ─── Fix 1 — Tributário prompt few-shot ─────────────────────────────────────

describe("Tributário prompt — few-shot do schema (Fix 1)", () => {
  it("inclui exemplo do shape canônico no system prompt", async () => {
    const { TributarioAgent } = await import("./agents/index");
    const prompt = new TributarioAgent().getSystemPrompt();
    expect(prompt).toMatch(/FORMATO DE OUTPUT/);
    expect(prompt).toMatch(/classifiedItems/);
    expect(prompt).toMatch(/totalTaxes/);
    expect(prompt).toMatch(/EXEMPLO DE OUTPUT CORRETO/);
  });

  it("proíbe explicitamente taxClassification e classification", async () => {
    const { TributarioAgent } = await import("./agents/index");
    const prompt = new TributarioAgent().getSystemPrompt();
    expect(prompt).toMatch(/NÃO use.*taxClassification.*classification/);
  });
});

// ─── Fix 2 — Auditor prompt few-shot + fórmula ──────────────────────────────

describe("Auditor prompt — few-shot e fórmula determinista (Fix 2)", () => {
  it("inclui fórmula explícita do validationScore", async () => {
    const { AuditorAgent } = await import("./agents/index");
    const prompt = new AuditorAgent().getSystemPrompt();
    expect(prompt).toMatch(/round\(\(passed_count \/ total_count\) × 100\)/);
  });

  it("inclui exemplo passed=true e exemplo passed=false", async () => {
    const { AuditorAgent } = await import("./agents/index");
    const prompt = new AuditorAgent().getSystemPrompt();
    expect(prompt).toMatch(/EXEMPLO 1.*OK/i);
    expect(prompt).toMatch(/EXEMPLO 2.*divergência/i);
    expect(prompt).toMatch(/"passed": true/);
    expect(prompt).toMatch(/"passed": false/);
  });

  it("proíbe expected/actual vazios", async () => {
    const { AuditorAgent } = await import("./agents/index");
    const prompt = new AuditorAgent().getSystemPrompt();
    expect(prompt).toMatch(/SEMPRE preencha.*expected.*actual/i);
    expect(prompt).toMatch(/NÃO crie validações com.*expected.*""/);
  });
});

// ─── Fix 3 — getSubscriptionPeriod resolve dual-shape ───────────────────────

describe("getSubscriptionPeriod (Fix 3) — Stripe period dates", () => {
  it("resolve campos do nível raiz (compat com API antiga)", async () => {
    const { getSubscriptionPeriod } = await import("./stripe/stripeService");
    const sub = {
      id: "sub_legacy",
      current_period_start: 1_700_000_000,
      current_period_end: 1_705_000_000,
    };
    const period = getSubscriptionPeriod(sub);
    expect(period).toEqual({ start: 1_700_000_000, end: 1_705_000_000 });
  });

  it("resolve campos de items.data[0] quando raiz vem undefined", async () => {
    const { getSubscriptionPeriod } = await import("./stripe/stripeService");
    const sub = {
      id: "sub_modern",
      items: {
        data: [
          {
            id: "si_x",
            current_period_start: 1_710_000_000,
            current_period_end: 1_712_000_000,
          },
        ],
      },
    };
    const period = getSubscriptionPeriod(sub);
    expect(period).toEqual({ start: 1_710_000_000, end: 1_712_000_000 });
  });

  it("retorna null quando ambos os caminhos vêm vazios", async () => {
    const { getSubscriptionPeriod } = await import("./stripe/stripeService");
    expect(getSubscriptionPeriod({})).toBeNull();
    expect(getSubscriptionPeriod({ items: { data: [] } })).toBeNull();
    expect(
      getSubscriptionPeriod({ items: { data: [{ id: "si_y" }] } })
    ).toBeNull();
  });

  it("prefere raiz sobre items quando ambos têm valor (evita drift)", async () => {
    const { getSubscriptionPeriod } = await import("./stripe/stripeService");
    const sub = {
      current_period_start: 100,
      current_period_end: 200,
      items: {
        data: [{ current_period_start: 999, current_period_end: 1000 }],
      },
    };
    const period = getSubscriptionPeriod(sub);
    expect(period).toEqual({ start: 100, end: 200 });
  });

  it("trata input inválido sem lançar", async () => {
    const { getSubscriptionPeriod } = await import("./stripe/stripeService");
    expect(getSubscriptionPeriod(null)).toBeNull();
    expect(getSubscriptionPeriod(undefined)).toBeNull();
    expect(getSubscriptionPeriod("not-an-object")).toBeNull();
    expect(getSubscriptionPeriod(42)).toBeNull();
  });
});
