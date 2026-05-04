/**
 * P2.2 — Tests for Langfuse tracing integration.
 *
 * Cobre:
 * - Toggle: getLangfuse retorna null com LANGFUSE_ENABLED=false.
 * - Sem flag, invokeLLM funciona normalmente sem tocar o Langfuse.
 * - Falha do Langfuse (init lança, generation lança) não derruba invokeLLM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildForgeResponse = () =>
  new Response(
    JSON.stringify({
      id: "test",
      created: 0,
      model: "gemini-2.5-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "{}" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

describe("getLangfuse() toggle (P2.2)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.LANGFUSE_ENABLED;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  it("retorna null com LANGFUSE_ENABLED=false", async () => {
    process.env.LANGFUSE_ENABLED = "false";
    const { getLangfuse } = await import("./services/tracing");
    expect(getLangfuse()).toBeNull();
  });

  it("retorna null quando flag está ausente (default OFF)", async () => {
    const { getLangfuse } = await import("./services/tracing");
    expect(getLangfuse()).toBeNull();
  });

  it("retorna null quando flag=true mas faltam chaves", async () => {
    process.env.LANGFUSE_ENABLED = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getLangfuse } = await import("./services/tracing");
    expect(getLangfuse()).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Langfuse]"),
      ...[]
    );
    warnSpy.mockRestore();
  });

  it("instancia cliente quando flag=true e chaves presentes", async () => {
    process.env.LANGFUSE_ENABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test-public";
    process.env.LANGFUSE_SECRET_KEY = "sk-test-secret";
    const { getLangfuse } = await import("./services/tracing");
    const client = getLangfuse();
    expect(client).not.toBeNull();
    expect(typeof client?.trace).toBe("function");
    expect(typeof client?.flushAsync).toBe("function");
  });
});

describe("invokeLLM com Langfuse desabilitado (P2.2)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LANGFUSE_ENABLED;
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(buildForgeResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("invokeLLM retorna resultado normal sem Langfuse", async () => {
    vi.doMock("./_core/env", () => ({
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
        langfuseHost: "https://cloud.langfuse.com",
      },
    }));
    const { invokeLLM } = await import("./_core/llm");
    const result = await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.choices?.[0]?.finish_reason).toBe("stop");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("invokeLLM resiliente a falhas do Langfuse (P2.2)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(buildForgeResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("não derruba invokeLLM se generation() do parent lançar exceção", async () => {
    vi.doMock("./_core/env", () => ({
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
        langfuseHost: "https://cloud.langfuse.com",
      },
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { invokeLLM } = await import("./_core/llm");

    const brokenParent = {
      generation: () => {
        throw new Error("Langfuse offline (simulado)");
      },
    };

    const result = await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
      _langfuseParent: brokenParent as any,
    });

    expect(result.choices?.[0]?.finish_reason).toBe("stop");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Langfuse]"),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it("não derruba invokeLLM se generation.end() lançar exceção", async () => {
    vi.doMock("./_core/env", () => ({
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
        langfuseHost: "https://cloud.langfuse.com",
      },
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { invokeLLM } = await import("./_core/llm");

    const flakyParent = {
      generation: () => ({
        end: () => {
          throw new Error("Langfuse end() falhou (simulado)");
        },
      }),
    };

    const result = await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
      _langfuseParent: flakyParent as any,
    });

    expect(result.choices?.[0]?.finish_reason).toBe("stop");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Langfuse]"),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it("propaga erro do fetch sem perder estado do Langfuse", async () => {
    vi.doMock("./_core/env", () => ({
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
        langfuseHost: "https://cloud.langfuse.com",
      },
    }));
    fetchSpy.mockResolvedValueOnce(
      new Response("upstream error", { status: 500 })
    );
    const { invokeLLM } = await import("./_core/llm");

    const calls: string[] = [];
    const parent = {
      generation: () => ({
        end: (params?: Record<string, unknown>) => {
          calls.push((params?.level as string) ?? "OK");
        },
      }),
    };

    await expect(
      invokeLLM({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: "hi" }],
        _langfuseParent: parent as any,
      })
    ).rejects.toThrow(/LLM invoke failed/);

    expect(calls).toContain("ERROR");
  });
});
