import { describe, it, expect } from "vitest";
import {
  getProviderCapabilities,
  detectProvider,
  getMaxTokensForModel,
  supportsThinking,
  supportsStrictSchema,
} from "./_core/llm-providers";

describe("LLM Provider Capabilities", () => {
  describe("detectProvider", () => {
    it("deve detectar Gemini corretamente", () => {
      expect(detectProvider("gemini-2.5-flash")).toBe("gemini");
      expect(detectProvider("gemini-2.5-pro")).toBe("gemini");
      expect(detectProvider("gemini-2.0-flash")).toBe("gemini");
      expect(detectProvider("gemini-1.5-flash")).toBe("gemini");
    });

    it("deve detectar Claude corretamente", () => {
      expect(detectProvider("claude-3-5-sonnet")).toBe("claude");
      expect(detectProvider("claude-sonnet-4-20250514")).toBe("claude");
      expect(detectProvider("claude-opus-4-20250514")).toBe("claude");
    });

    it("deve detectar GPT corretamente", () => {
      expect(detectProvider("gpt-4o")).toBe("gpt");
      expect(detectProvider("gpt-4o-mini")).toBe("gpt");
      expect(detectProvider("gpt-4.1")).toBe("gpt");
    });

    it("deve retornar unknown para modelos desconhecidos", () => {
      expect(detectProvider("llama-3")).toBe("unknown");
      expect(detectProvider("mistral-7b")).toBe("unknown");
    });
  });

  describe("getMaxTokensForModel", () => {
    it("deve retornar 65536 para Gemini", () => {
      expect(getMaxTokensForModel("gemini-2.5-flash")).toBe(65536);
      expect(getMaxTokensForModel("gemini-2.5-pro")).toBe(65536);
    });

    it("deve retornar 16384 para Claude", () => {
      expect(getMaxTokensForModel("claude-3-5-sonnet")).toBe(16384);
      expect(getMaxTokensForModel("claude-opus-4-20250514")).toBe(16384);
    });

    it("deve retornar 16384 para GPT", () => {
      expect(getMaxTokensForModel("gpt-4o")).toBe(16384);
      expect(getMaxTokensForModel("gpt-4o-mini")).toBe(16384);
    });

    it("deve retornar 4096 como fallback seguro", () => {
      expect(getMaxTokensForModel("llama-3")).toBe(4096);
      expect(getMaxTokensForModel("unknown-model")).toBe(4096);
    });
  });

  describe("supportsThinking", () => {
    it("NÃO deve suportar thinking para Gemini", () => {
      expect(supportsThinking("gemini-2.5-flash")).toBe(false);
      expect(supportsThinking("gemini-2.0-flash")).toBe(false);
    });

    it("DEVE suportar thinking para Claude", () => {
      expect(supportsThinking("claude-3-5-sonnet")).toBe(true);
      expect(supportsThinking("claude-opus-4-20250514")).toBe(true);
      expect(supportsThinking("claude-sonnet-4-20250514")).toBe(true);
    });

    it("NÃO deve suportar thinking para GPT", () => {
      expect(supportsThinking("gpt-4o")).toBe(false);
      expect(supportsThinking("gpt-4o-mini")).toBe(false);
    });

    it("NÃO deve suportar thinking para modelos desconhecidos", () => {
      expect(supportsThinking("llama-3")).toBe(false);
    });
  });

  describe("supportsStrictSchema", () => {
    it("NÃO deve suportar strict para Gemini", () => {
      expect(supportsStrictSchema("gemini-2.5-flash")).toBe(false);
      expect(supportsStrictSchema("gemini-2.5-pro")).toBe(false);
    });

    it("NÃO deve suportar strict para Claude", () => {
      expect(supportsStrictSchema("claude-3-5-sonnet")).toBe(false);
      expect(supportsStrictSchema("claude-opus-4-20250514")).toBe(false);
    });

    it("DEVE suportar strict para GPT", () => {
      expect(supportsStrictSchema("gpt-4o")).toBe(true);
      expect(supportsStrictSchema("gpt-4o-mini")).toBe(true);
    });

    it("NÃO deve suportar strict para modelos desconhecidos", () => {
      expect(supportsStrictSchema("llama-3")).toBe(false);
    });
  });

  describe("getProviderCapabilities", () => {
    it("deve retornar capabilities completas para Gemini", () => {
      const caps = getProviderCapabilities("gemini-2.5-flash");
      expect(caps.maxOutputTokens).toBe(65536);
      expect(caps.supportsThinking).toBe(false);
      expect(caps.supportsStrictSchema).toBe(false);
      expect(caps.providerName).toBe("Google Gemini");
    });

    it("deve retornar capabilities completas para Claude", () => {
      const caps = getProviderCapabilities("claude-opus-4-20250514");
      expect(caps.maxOutputTokens).toBe(16384);
      expect(caps.supportsThinking).toBe(true);
      expect(caps.supportsStrictSchema).toBe(false);
      expect(caps.providerName).toBe("Anthropic Claude");
    });

    it("deve retornar capabilities completas para GPT", () => {
      const caps = getProviderCapabilities("gpt-4o");
      expect(caps.maxOutputTokens).toBe(16384);
      expect(caps.supportsThinking).toBe(false);
      expect(caps.supportsStrictSchema).toBe(true);
      expect(caps.providerName).toBe("OpenAI GPT");
    });

    it("deve retornar fallback seguro para modelos desconhecidos", () => {
      const caps = getProviderCapabilities("unknown-model");
      expect(caps.maxOutputTokens).toBe(4096);
      expect(caps.supportsThinking).toBe(false);
      expect(caps.supportsStrictSchema).toBe(false);
      expect(caps.providerName).toBe("Unknown");
    });
  });
});
