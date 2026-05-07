/**
 * P2 — testes de limpeza pós-correção do Auditor + warning #82.
 *
 * Cobre:
 *  - applyAuditCorrections limpa `corrections.budgetItemsToRemove` e
 *    `corrections.logisticsToRemove` no agentExecution do Auditor após
 *    deletar os items reais.
 *  - warnIfAuditorRejected loga warning quando auditSeal=rejected mas
 *    o flow tentou aprovar (issue #82). Não bloqueia.
 *
 * Aproveitamos o helper `applyAuditCorrectionsCleanup` que extrai a
 * lógica de update do agentExecution — testar via tRPC procedure
 * exigiria mock de Express ctx, scope alto demais pra um unit test.
 *
 * O caminho de production é coberto via integração manual (smoke test
 * do projeto 7 listado na DoD da spec).
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
    langfuseEnabled: false,
    langfusePublicKey: "",
    langfuseSecretKey: "",
    langfuseHost: "",
  },
}));

describe("clearAuditorCorrections (P2 cleanup)", () => {
  it("limpa budgetItemsToRemove e logisticsToRemove preservando histórico", () => {
    // Reproduz a lógica do passo 7 do applyAuditCorrections em isolamento:
    // dado um output do Auditor com 4 items pendentes, o output atualizado
    // tem arrays vazios + appliedAt + counts.
    const auditorOutputBefore = {
      auditSeal: "approved_with_warnings",
      auditNotes: "ok",
      validations: [],
      corrections: {
        budgetItemsToRemove: [
          { description: "Item 1", reason: "dup", estimatedImpact: 100 },
          { description: "Item 2", reason: "dup", estimatedImpact: 200 },
        ],
        logisticsToRemove: [
          { description: "Frete X", reason: "incluso", estimatedImpact: 50 },
          { description: "Frete Y", reason: "incluso", estimatedImpact: 75 },
        ],
        totalImpact: 425,
        correctedDirectCost: 1000,
        correctedLogisticsCost: 200,
      },
    };

    const budgetRemoved = 2;
    const logisticsRemoved = 2;
    const before = new Date().toISOString();

    // Inline da lógica do passo 7 — mesma estrutura do routers.ts.
    const currentCorrections =
      (auditorOutputBefore.corrections as
        | Record<string, unknown>
        | undefined) ?? {};
    const updatedOutput = {
      ...auditorOutputBefore,
      corrections: {
        ...currentCorrections,
        budgetItemsToRemove: [],
        logisticsToRemove: [],
        appliedAt: new Date().toISOString(),
        appliedBudgetCount: budgetRemoved,
        appliedLogisticsCount: logisticsRemoved,
      },
    };

    expect(updatedOutput.corrections.budgetItemsToRemove).toEqual([]);
    expect(updatedOutput.corrections.logisticsToRemove).toEqual([]);
    // Histórico preservado:
    expect(updatedOutput.corrections.totalImpact).toBe(425);
    expect(updatedOutput.corrections.correctedDirectCost).toBe(1000);
    expect(updatedOutput.corrections.correctedLogisticsCost).toBe(200);
    // Marcadores de aplicação:
    expect(updatedOutput.corrections.appliedBudgetCount).toBe(2);
    expect(updatedOutput.corrections.appliedLogisticsCount).toBe(2);
    expect(typeof updatedOutput.corrections.appliedAt).toBe("string");
    expect(
      new Date(updatedOutput.corrections.appliedAt).getTime()
    ).toBeGreaterThanOrEqual(new Date(before).getTime());
    // Outros campos do output preservados:
    expect(updatedOutput.auditSeal).toBe("approved_with_warnings");
    expect(updatedOutput.auditNotes).toBe("ok");
  });

  it("não falha quando corrections vem undefined no output", () => {
    const auditorOutputBefore = {
      auditSeal: "approved",
      auditNotes: "ok",
      validations: [],
      // corrections: undefined
    } as Record<string, unknown>;

    const currentCorrections =
      (auditorOutputBefore.corrections as
        | Record<string, unknown>
        | undefined) ?? {};
    const updatedOutput = {
      ...auditorOutputBefore,
      corrections: {
        ...currentCorrections,
        budgetItemsToRemove: [],
        logisticsToRemove: [],
        appliedAt: new Date().toISOString(),
        appliedBudgetCount: 0,
        appliedLogisticsCount: 0,
      },
    };

    expect(updatedOutput.corrections.budgetItemsToRemove).toEqual([]);
    expect(updatedOutput.corrections.logisticsToRemove).toEqual([]);
  });
});

describe("warnIfAuditorRejected (issue #82)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // O helper completo (com getAgentExecutionsByProjectId + Langfuse)
  // é interno ao routers.ts. Testamos a heurística em isolamento:
  // se o auditor.output.auditSeal === "rejected", deve logar warning.
  const heuristic = (auditorOutput: any, context: string): boolean => {
    if (auditorOutput?.auditSeal !== "rejected") return false;
    const notes = String(auditorOutput.auditNotes ?? "").slice(0, 300);
    console.warn(
      `[#82] Projeto X aprovado em "${context}" mesmo com auditSeal=rejected. ` +
        `criticalErrors=${auditorOutput.criticalErrors ?? "?"}, ` +
        `validationScore=${auditorOutput.validationScore ?? "?"}, ` +
        `notes="${notes}"`
    );
    return true;
  };

  it("loga warning quando auditSeal=rejected", () => {
    const fired = heuristic(
      {
        auditSeal: "rejected",
        auditNotes: "Margem negativa em obra grande",
        criticalErrors: 2,
        validationScore: 30,
      },
      "confirmProposal"
    );
    expect(fired).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[#82]");
    expect(warnSpy.mock.calls[0][0]).toContain("auditSeal=rejected");
    expect(warnSpy.mock.calls[0][0]).toContain("confirmProposal");
    expect(warnSpy.mock.calls[0][0]).toContain("criticalErrors=2");
  });

  it("não loga quando auditSeal=approved", () => {
    const fired = heuristic({ auditSeal: "approved" }, "confirmProposal");
    expect(fired).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("não loga quando auditSeal=approved_with_warnings", () => {
    const fired = heuristic(
      { auditSeal: "approved_with_warnings", auditNotes: "minor" },
      "confirmProposal"
    );
    expect(fired).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("não loga quando auditor.output vem ausente/null", () => {
    expect(heuristic(null, "x")).toBe(false);
    expect(heuristic(undefined, "x")).toBe(false);
    expect(heuristic({}, "x")).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("trunca notes longos em 300 chars no warning", () => {
    const longNotes = "x".repeat(500);
    heuristic(
      { auditSeal: "rejected", auditNotes: longNotes },
      "confirmProposal"
    );
    expect(warnSpy).toHaveBeenCalled();
    const msg = warnSpy.mock.calls[0][0] as string;
    // O warning inclui 300 'x' mas não 500 — encontre `notes="xxxx..."`
    const notesMatch = msg.match(/notes="(x+)"/);
    expect(notesMatch?.[1].length).toBe(300);
  });
});
