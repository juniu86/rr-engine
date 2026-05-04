import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCost, FX_USD_BRL, MODEL_PRICING } from "./_core/llm-pricing";

describe("estimateCost (P0.3)", () => {
  it("calcula custo Claude Opus corretamente", () => {
    const { usd } = estimateCost("claude-opus-4-6", 10_000, 5_000);
    // 10k * 15/1M + 5k * 75/1M = 0.15 + 0.375 = 0.525
    expect(usd).toBeCloseTo(0.525, 4);
  });

  it("calcula custo Gemini Flash corretamente", () => {
    const { usd } = estimateCost("gemini-2.5-flash", 100_000, 50_000);
    // 100k * 0.30/1M + 50k * 2.50/1M = 0.03 + 0.125 = 0.155
    expect(usd).toBeCloseTo(0.155, 4);
  });

  it("calcula custo Sonnet corretamente", () => {
    const { usd } = estimateCost("claude-sonnet-4-6", 1_000_000, 500_000);
    // 1M * 3/1M + 500k * 15/1M = 3 + 7.5 = 10.5
    expect(usd).toBeCloseTo(10.5, 4);
  });

  it("aplica FX_USD_BRL para BRL", () => {
    const { usd, brl } = estimateCost("gemini-2.5-flash", 100_000, 50_000);
    expect(brl).toBeCloseTo(usd * FX_USD_BRL, 4);
  });

  it("usa fallback conservador para modelo desconhecido", () => {
    const { usd } = estimateCost("modelo-inventado", 1_000_000, 1_000_000);
    // Fallback: 1 input + 5 output = 6 USD
    expect(usd).toBeCloseTo(6, 4);
  });

  it("trata tokens negativos como zero", () => {
    const { usd } = estimateCost("claude-opus-4-6", -100, -200);
    expect(usd).toBe(0);
  });

  it("trata NaN como zero", () => {
    const { usd } = estimateCost("claude-opus-4-6", NaN, NaN);
    expect(usd).toBe(0);
  });

  it("MODEL_PRICING contém todos os modelos referenciados pelos agentes", () => {
    // Modelos usados em getPreferredModel() em server/agents/index.ts
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-6");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-6");
    expect(MODEL_PRICING).toHaveProperty("gemini-2.5-flash");
  });
});

describe("recordLlmCall (P0.3)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("não lança quando o banco está indisponível", async () => {
    vi.doMock("./db", () => ({
      getDb: async () => null,
    }));

    const { recordLlmCall } = await import("./services/llmTelemetry");

    await expect(
      recordLlmCall({
        projectId: 1,
        agentType: "engenheiro_tecnico",
        model: "claude-opus-4-6",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        latencyMs: 100,
      })
    ).resolves.toBeUndefined();
  });

  it("não lança quando o insert dispara erro", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("connection refused")),
    });

    vi.doMock("./db", () => ({
      getDb: async () => ({ insert: insertMock }),
    }));

    const { recordLlmCall } = await import("./services/llmTelemetry");

    await expect(
      recordLlmCall({
        projectId: 1,
        agentType: "orcamentista",
        model: "claude-opus-4-6",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        latencyMs: 100,
      })
    ).resolves.toBeUndefined();
  });

  it("insere uma linha com custo calculado quando tudo OK", async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    vi.doMock("./db", () => ({
      getDb: async () => ({ insert: insertMock }),
    }));

    const { recordLlmCall } = await import("./services/llmTelemetry");

    await recordLlmCall({
      projectId: 42,
      agentExecutionId: 7,
      agentType: "tributario",
      model: "claude-opus-4-6",
      promptTokens: 10_000,
      completionTokens: 5_000,
      totalTokens: 15_000,
      latencyMs: 1234,
      finishReason: "stop",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const inserted = valuesMock.mock.calls[0][0] as Record<string, unknown>;

    expect(inserted.projectId).toBe(42);
    expect(inserted.agentExecutionId).toBe(7);
    expect(inserted.agentType).toBe("tributario");
    expect(inserted.model).toBe("claude-opus-4-6");
    expect(inserted.promptTokens).toBe(10_000);
    expect(inserted.completionTokens).toBe(5_000);
    expect(inserted.totalTokens).toBe(15_000);
    // 10k * 15 + 5k * 75 (per Mtok) = 0.15 + 0.375 = 0.525
    expect(parseFloat(inserted.costUsd as string)).toBeCloseTo(0.525, 4);
    expect(parseFloat(inserted.costBrl as string)).toBeCloseTo(
      0.525 * FX_USD_BRL,
      4
    );
    expect(inserted.latencyMs).toBe(1234);
    expect(inserted.finishReason).toBe("stop");
    expect(inserted.attemptNumber).toBe(1);
  });

  it("permite agentExecutionId opcional (null)", async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    vi.doMock("./db", () => ({
      getDb: async () => ({ insert: insertMock }),
    }));

    const { recordLlmCall } = await import("./services/llmTelemetry");

    await recordLlmCall({
      projectId: 1,
      agentType: "auditor",
      model: "claude-sonnet-4-6",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 50,
    });

    const inserted = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.agentExecutionId).toBeNull();
  });
});
