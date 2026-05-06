/**
 * LLM Provider Capabilities - Adapter Pattern
 * 
 * Centraliza as capabilities de cada provider de LLM para evitar
 * parâmetros incompatíveis entre Gemini, Claude e OpenAI.
 */

export interface ProviderCapabilities {
  /** Limite máximo de tokens de saída */
  maxOutputTokens: number;
  /** Suporta Extended Thinking (Claude only) */
  supportsThinking: boolean;
  /** Suporta strict: true em json_schema (OpenAI only) */
  supportsStrictSchema: boolean;
  /** Nome do provider para logging */
  providerName: string;
}

const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  gemini: {
    maxOutputTokens: 65536,  // Limite máximo real do Gemini-2.5-flash (validado 2026-03-23)
    supportsThinking: false,
    supportsStrictSchema: false,
    providerName: "Google Gemini",
  },
  "claude-opus": {
    maxOutputTokens: 32768,  // Claude Opus 4.6 — higher token limit for complex analysis
    supportsThinking: true,
    supportsStrictSchema: false,
    providerName: "Anthropic Claude Opus",
  },
  "claude-sonnet": {
    // Claude Sonnet 4.x suporta 64k de output. Gestão em obras grandes
    // (cronograma item por item de 130+ itens) chega a estourar 32k.
    // Vamos no teto. Streaming evita timeout em outputs longos.
    maxOutputTokens: 65536,
    supportsThinking: true,
    supportsStrictSchema: false,
    providerName: "Anthropic Claude Sonnet",
  },
  claude: {
    maxOutputTokens: 65536,
    supportsThinking: true,
    supportsStrictSchema: false,
    providerName: "Anthropic Claude",
  },
  gpt: {
    maxOutputTokens: 16384,
    supportsThinking: false,
    supportsStrictSchema: true,
    providerName: "OpenAI GPT",
  },
};

/** Fallback seguro para modelos desconhecidos */
const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  maxOutputTokens: 4096,
  supportsThinking: false,
  supportsStrictSchema: false,
  providerName: "Unknown",
};

/**
 * Detecta o provider a partir do nome do modelo.
 */
export function detectProvider(model: string): string {
  if (model.includes("gemini")) return "gemini";
  if (model.includes("claude-opus")) return "claude-opus";
  if (model.includes("claude-sonnet")) return "claude-sonnet";
  if (model.includes("claude")) return "claude";
  if (model.includes("gpt")) return "gpt";
  return "unknown";
}

/**
 * Retorna as capabilities do provider com base no nome do modelo.
 */
export function getProviderCapabilities(model: string): ProviderCapabilities {
  const provider = detectProvider(model);
  return PROVIDER_CAPABILITIES[provider] ?? DEFAULT_CAPABILITIES;
}

/**
 * Retorna o max_tokens adequado para o modelo.
 */
export function getMaxTokensForModel(model: string): number {
  return getProviderCapabilities(model).maxOutputTokens;
}

/**
 * Verifica se o modelo suporta Extended Thinking.
 */
export function supportsThinking(model: string): boolean {
  return getProviderCapabilities(model).supportsThinking;
}

/**
 * Verifica se o modelo suporta strict: true em json_schema.
 */
export function supportsStrictSchema(model: string): boolean {
  return getProviderCapabilities(model).supportsStrictSchema;
}
