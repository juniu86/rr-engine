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

import { invokeLLM } from "./_core/llm";

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

describe("invokeLLM temperature (P0.2)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(buildForgeResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const readPayload = () => {
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.body).toBeTypeOf("string");
    return JSON.parse(init!.body as string);
  };

  it("forwards explicit temperature to forge payload", async () => {
    await invokeLLM({
      model: "gemini-2.5-flash",
      temperature: 0.5,
      messages: [{ role: "user", content: "test" }],
    });

    expect(readPayload().temperature).toBe(0.5);
  });

  it("defaults to 0.2 when temperature is omitted", async () => {
    await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "test" }],
    });

    expect(readPayload().temperature).toBe(0.2);
  });

  it("preserves a temperature of 0 (falsy) instead of falling back to 0.2", async () => {
    await invokeLLM({
      model: "gemini-2.5-flash",
      temperature: 0,
      messages: [{ role: "user", content: "test" }],
    });

    expect(readPayload().temperature).toBe(0);
  });
});
