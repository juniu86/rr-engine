import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyDivergence,
  isDeterministicValidationEnabled,
} from "./services/deterministicValidator";

describe("classifyDivergence (P0.1)", () => {
  it("classifica divergência < 5% como info", () => {
    const r = classifyDivergence(100_000, 102_000);
    expect(r.divergenceClass).toBe("info");
    expect(r.divergencePercent).toBeCloseTo((2_000 / 102_000) * 100, 4);
  });

  it("classifica divergência 5-15% como warning", () => {
    const r = classifyDivergence(100_000, 110_000);
    // |100k - 110k| / 110k * 100 = 9.09%
    expect(r.divergenceClass).toBe("warning");
    expect(r.divergencePercent).toBeGreaterThanOrEqual(5);
    expect(r.divergencePercent).toBeLessThan(15);
  });

  it("classifica divergência >= 15% como critical", () => {
    const r = classifyDivergence(100_000, 130_000);
    // |100k - 130k| / 130k * 100 ≈ 23%
    expect(r.divergenceClass).toBe("critical");
    expect(r.divergencePercent).toBeGreaterThanOrEqual(15);
  });

  it("classifica diferença na borda de 5% como warning", () => {
    // 5.0% exato → warning (>= 5)
    const r = classifyDivergence(95_000, 100_000);
    expect(r.divergenceClass).toBe("warning");
  });

  it("classifica diferença na borda de 15% como critical", () => {
    // 15.0% exato → critical (>= 15)
    const r = classifyDivergence(85_000, 100_000);
    expect(r.divergenceClass).toBe("critical");
  });

  it("retorna info+0% quando llmTotal <= 0 (proteção contra divisão por zero)", () => {
    const r = classifyDivergence(100_000, 0);
    expect(r.divergencePercent).toBe(0);
    expect(r.divergenceClass).toBe("info");
  });

  it("usa valor absoluto (LLM acima ou abaixo do determinístico)", () => {
    const above = classifyDivergence(100_000, 130_000);
    const below = classifyDivergence(130_000, 100_000);
    // Ambos calculam |Δ|/llmTotal * 100 — diferentes magnitudes mas mesmo class
    expect(above.divergenceClass).toBe("critical");
    expect(below.divergenceClass).toBe("critical");
  });
});

describe("isDeterministicValidationEnabled (P0.1)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("default false quando env ausente", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "");
    expect(isDeterministicValidationEnabled()).toBe(false);
  });

  it("true quando env=='true'", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "true");
    expect(isDeterministicValidationEnabled()).toBe(true);
  });

  it("true quando env=='1'", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "1");
    expect(isDeterministicValidationEnabled()).toBe(true);
  });

  it("false quando env=='false'", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "false");
    expect(isDeterministicValidationEnabled()).toBe(false);
  });

  it("false para valores arbitrários", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "yes");
    expect(isDeterministicValidationEnabled()).toBe(false);
  });

  it("é case-insensitive ('TRUE')", () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "TRUE");
    expect(isDeterministicValidationEnabled()).toBe(true);
  });
});

describe("runDeterministicValidator (P0.1)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "true");
  });

  afterEach(() => {
    vi.doUnmock("./lib/deterministicEngine");
    vi.doUnmock("./db");
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retorna null quando feature flag desativada (sem rodar engine)", async () => {
    vi.stubEnv("ENABLE_DETERMINISTIC_VALIDATION", "false");
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { runDeterministicValidator } = await import(
      "./services/deterministicValidator"
    );

    const result = await runDeterministicValidator(
      1,
      "# Memorial\n- Pintura interna: 50 m²"
    );
    expect(result).toBeNull();
  });

  it("retorna null para memorial vazio", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { runDeterministicValidator } = await import(
      "./services/deterministicValidator"
    );

    const result = await runDeterministicValidator(1, "");
    expect(result).toBeNull();
  });

  it("processa memorial pequeno e retorna totais coerentes", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { runDeterministicValidator } = await import(
      "./services/deterministicValidator"
    );

    // Parser exige cabeçalho de categoria (## ...) e itens "- desc: qtd unidade".
    const memorial = `# MEMORIAL DESCRITIVO — Reforma teste
Cidade: São Paulo
Estado: SP
Tipo: capital
Prazo: 4 semanas

## 1. Demolição
- Demolição de revestimento: 30 m²

## 2. Pintura
- Pintura interna 2 demãos: 100 m²
- Pintura externa: 50 m²
`;

    const result = await runDeterministicValidator(99999, memorial);

    expect(result).not.toBeNull();
    expect(result!.totalItemsParsed).toBeGreaterThan(0);
    expect(result!.totalDirectCost).toBeGreaterThan(0);
    expect(result!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result!.latencyMs).toBeLessThan(5_000);
    expect(result!.warnings).toBeInstanceOf(Array);
  });

  it("não lança quando o engine joga exceção (retorna null)", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    vi.doMock("./lib/deterministicEngine", () => ({
      processMemorial: () => {
        throw new Error("parser exploded");
      },
    }));
    const { runDeterministicValidator } = await import(
      "./services/deterministicValidator"
    );

    const result = await runDeterministicValidator(1, "# Memorial\n- algo");
    expect(result).toBeNull();
  });

  it("não lança quando o insert no banco falha (resultado em memória ainda OK)", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    vi.doMock("./db", () => ({
      getDb: async () => ({ insert: insertMock }),
    }));
    const { runDeterministicValidator } = await import(
      "./services/deterministicValidator"
    );

    const memorial = `# MEMORIAL DESCRITIVO

## 1. Pintura
- Pintura interna: 20 m²
`;
    const result = await runDeterministicValidator(1, memorial);
    expect(result).not.toBeNull();
    expect(result!.totalItemsParsed).toBeGreaterThan(0);
    // runId deve ficar undefined porque o insert falhou
    expect(result!.runId).toBeUndefined();
  });
});

describe("recordDivergence (P0.1)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna a classificação mesmo quando o banco está indisponível", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { recordDivergence } = await import(
      "./services/deterministicValidator"
    );

    const result = await recordDivergence(1, 100_000, 130_000);
    expect(result).not.toBeNull();
    expect(result!.divergenceClass).toBe("critical");
  });

  it("não lança quando update falha", async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("table missing")),
      }),
    });
    vi.doMock("./db", () => ({
      getDb: async () => ({ update: updateMock }),
    }));
    const { recordDivergence } = await import(
      "./services/deterministicValidator"
    );

    await expect(
      recordDivergence(1, 100_000, 110_000, 42)
    ).resolves.not.toThrow();
  });
});
