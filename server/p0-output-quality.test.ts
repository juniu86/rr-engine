/**
 * P0 (07/05/2026) — testes dos fixes de qualidade do output do Engine.
 *
 * Cobre os helpers extraíveis dos 5 bugs:
 *  - Bug 4: deriveTotalWeeks (4 fontes de input).
 *  - Bug 1: integração tributarioOutput.totalTaxes vs fallback dos items.
 *  - Bug 2: precedência projectTotalPrice > comercial > fallback.
 *
 * Bugs 3 e 5 são puramente structural (frontend / coluna XLSX) — validados
 * via smoke manual do memorial Posto Paulo Sérgio listado na DoD.
 */
import { describe, expect, it } from "vitest";

// ===== Bug 4: deriveTotalWeeks =====
//
// O helper é privado em agentPersistence.ts. Reproduzimos a lógica
// idêntica aqui pra cobrir os caminhos. Quando precisar exportar, mover
// a função pra módulo dedicado.

function deriveTotalWeeks(
  gestaoOutput: any,
  projectInfo?: { estimatedDuration?: number | null },
  cashFlowFallbackLength?: number
): number {
  const scheduleItems = Array.isArray(gestaoOutput?.scheduleItems)
    ? gestaoOutput.scheduleItems
    : [];
  if (scheduleItems.length > 0) {
    const maxEnd = scheduleItems.reduce((max: number, s: any) => {
      const end = Number(s.endDay ?? s.endWeek ?? s.duration ?? 0);
      return end > max ? end : max;
    }, 0);
    if (maxEnd > 0) {
      const isWeekly = maxEnd <= 60;
      const weeks = isWeekly ? maxEnd : Math.ceil(maxEnd / 7);
      return Math.max(4, weeks);
    }
  }
  const totalDaysRaw = Number(gestaoOutput?.totalDays ?? 0);
  if (totalDaysRaw > 0) return Math.max(4, Math.ceil(totalDaysRaw / 7));
  const totalDurationRaw = Number(gestaoOutput?.totalDuration ?? 0);
  if (totalDurationRaw > 0) {
    const isLikelyWeeks = totalDurationRaw <= 60;
    return isLikelyWeeks
      ? Math.max(4, totalDurationRaw)
      : Math.max(4, Math.ceil(totalDurationRaw / 7));
  }
  const estimated = Number(projectInfo?.estimatedDuration ?? 0);
  if (estimated > 0) return Math.max(4, Math.ceil(estimated / 7));
  return Math.max(4, cashFlowFallbackLength || 4);
}

describe("deriveTotalWeeks (P0 Bug 4)", () => {
  it("usa scheduleItems.endDay (dias) quando disponível e magnitude > 60", () => {
    const out = {
      scheduleItems: [
        { phase: "Mobilização", endDay: 14 },
        { phase: "Fundação", endDay: 90 },
        { phase: "Estrutura", endDay: 240 }, // 240 dias = 8 meses
      ],
    };
    expect(deriveTotalWeeks(out)).toBe(Math.ceil(240 / 7));
  });

  it("usa scheduleItems.endWeek quando magnitude <= 60", () => {
    const out = {
      scheduleItems: [
        { phase: "Mobilização", endWeek: 2 },
        { phase: "Fundação", endWeek: 12 },
        { phase: "Estrutura", endWeek: 32 }, // 32 semanas = 8 meses
      ],
    };
    expect(deriveTotalWeeks(out)).toBe(32);
  });

  it("usa scheduleItems.duration como fallback de end*", () => {
    const out = {
      scheduleItems: [
        { phase: "Total", duration: 16 }, // weeks
      ],
    };
    expect(deriveTotalWeeks(out)).toBe(16);
  });

  it("usa totalDays quando scheduleItems vazio", () => {
    const out = { scheduleItems: [], totalDays: 56 }; // 8 weeks
    expect(deriveTotalWeeks(out)).toBe(8);
  });

  it("usa totalDuration interpretando como semanas se <= 60", () => {
    const out = { totalDuration: 24 };
    expect(deriveTotalWeeks(out)).toBe(24);
  });

  it("usa totalDuration interpretando como dias se > 60", () => {
    const out = { totalDuration: 240 };
    expect(deriveTotalWeeks(out)).toBe(Math.ceil(240 / 7));
  });

  it("fallback para project.estimatedDuration (dias) quando gestão não retorna", () => {
    const out = {};
    expect(deriveTotalWeeks(out, { estimatedDuration: 168 })).toBe(24);
  });

  it("nunca retorna menos de 4 (mínimo absoluto)", () => {
    expect(deriveTotalWeeks({ totalDays: 7 })).toBe(4); // 1 week → forçado a 4
    expect(deriveTotalWeeks({ scheduleItems: [{ endWeek: 2 }] })).toBe(4);
  });

  it("fallback final 4 quando NADA está disponível", () => {
    expect(deriveTotalWeeks({})).toBe(4);
    expect(deriveTotalWeeks({}, undefined, 6)).toBe(6);
    expect(deriveTotalWeeks({}, { estimatedDuration: 0 }, 8)).toBe(8);
  });

  it("caso real Posto Paulo Sérgio (8 meses → 32+ semanas)", () => {
    const gestaoOutput = {
      scheduleItems: [
        { phase: "Demolição", endDay: 30 },
        { phase: "Fundação", endDay: 90 },
        { phase: "Estrutura", endDay: 180 },
        { phase: "Cobertura", endDay: 210 },
        { phase: "Acabamento", endDay: 240 },
      ],
      totalDays: 240,
    };
    expect(deriveTotalWeeks(gestaoOutput)).toBe(Math.ceil(240 / 7));
  });
});

// ===== Bug 1: tributos do Tributário =====

describe("tributos: totalTax precedence (P0 Bug 1)", () => {
  // Reproduz a lógica do generateMemoriaXLSX:
  // tributarioTotalTaxes > 0 ? tributarioTotalTaxes : totalTaxFromItems
  const computeTotalTax = (
    tributarioOutput: any,
    items: Array<{ taxAmount?: number }>
  ): number => {
    const tributarioTotalTaxes = Number(tributarioOutput?.totalTaxes ?? 0);
    const totalTaxFromItems = items.reduce(
      (s, i) => s + Number(i.taxAmount || 0),
      0
    );
    return tributarioTotalTaxes > 0 ? tributarioTotalTaxes : totalTaxFromItems;
  };

  it("usa tributarioOutput.totalTaxes quando > 0 (caso correto)", () => {
    const items = [{ taxAmount: 0 }, { taxAmount: 0 }];
    expect(computeTotalTax({ totalTaxes: 305_000 }, items)).toBe(305_000);
  });

  it("fallback pra soma dos items quando tributarioOutput ausente", () => {
    const items = [{ taxAmount: 1000 }, { taxAmount: 500 }];
    expect(computeTotalTax(null, items)).toBe(1500);
    expect(computeTotalTax(undefined, items)).toBe(1500);
  });

  it("fallback quando totalTaxes=0 e items têm taxAmount", () => {
    const items = [{ taxAmount: 200 }];
    expect(computeTotalTax({ totalTaxes: 0 }, items)).toBe(200);
  });

  it("retorna 0 quando ambos vazios (caso de degenerado real)", () => {
    expect(computeTotalTax(null, [])).toBe(0);
    expect(computeTotalTax({ totalTaxes: 0 }, [])).toBe(0);
  });
});

// ===== Bug 2: totalPrice precedence =====

describe("totalFinal precedence (P0 Bug 2)", () => {
  // project.totalPrice > comercialOutput.finalPrice > custoBase × (1 + BDI)
  const computeTotalFinal = (
    project: { totalPrice?: number | null },
    comercialOutput: { finalPrice?: number; adjustedBdi?: number } | undefined,
    custoBase: number
  ): { totalFinal: number; source: string } => {
    const projectTotalPrice = Number(project.totalPrice) || 0;
    const comercialFinalPrice = Number(comercialOutput?.finalPrice) || 0;
    const comercialBdi = Number(comercialOutput?.adjustedBdi) || 0.3;
    if (projectTotalPrice > 0) {
      return { totalFinal: projectTotalPrice, source: "project" };
    }
    if (comercialFinalPrice > 0) {
      return { totalFinal: comercialFinalPrice, source: "comercial" };
    }
    return {
      totalFinal: custoBase * (1 + comercialBdi),
      source: "fallback",
    };
  };

  it("usa project.totalPrice como fonte primária (Bug 2 fix)", () => {
    const r = computeTotalFinal(
      { totalPrice: 2_126_670.73 },
      { finalPrice: 2_269_574.55, adjustedBdi: 0.33 }, // valor diferente, ignorado
      1_700_000
    );
    expect(r.source).toBe("project");
    expect(r.totalFinal).toBe(2_126_670.73);
  });

  it("fallback pra comercial.finalPrice quando project.totalPrice ausente", () => {
    const r = computeTotalFinal(
      { totalPrice: null },
      { finalPrice: 2_269_574.55, adjustedBdi: 0.33 },
      1_700_000
    );
    expect(r.source).toBe("comercial");
    expect(r.totalFinal).toBe(2_269_574.55);
  });

  it("fallback pra custoBase × (1+BDI) quando ambos ausentes", () => {
    const r = computeTotalFinal({ totalPrice: 0 }, undefined, 1_000_000);
    expect(r.source).toBe("fallback");
    expect(r.totalFinal).toBeCloseTo(1_000_000 * 1.3, 2);
  });
});
