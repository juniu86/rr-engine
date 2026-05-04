// Preços em USD por milhão de tokens (1 Mtok). Atualizar quando providers
// mudarem tabela. Estes valores são usados para ESTIMATIVA de custo —
// reconciliar periodicamente com as faturas reais (Anthropic, Google, OpenAI).
//
// Última atualização: 2026-05-04

export interface ModelPricing {
  /** USD por 1M tokens de input. */
  inputPerMtok: number;
  /** USD por 1M tokens de output. */
  outputPerMtok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPerMtok: 15.0, outputPerMtok: 75.0 },
  "claude-sonnet-4-6": { inputPerMtok: 3.0, outputPerMtok: 15.0 },
  "claude-haiku-4-5": { inputPerMtok: 1.0, outputPerMtok: 5.0 },
  "gemini-2.5-flash": { inputPerMtok: 0.3, outputPerMtok: 2.5 },
  "gemini-2.5-pro": { inputPerMtok: 1.25, outputPerMtok: 10.0 },
  "gpt-4o": { inputPerMtok: 2.5, outputPerMtok: 10.0 },
  "gpt-4o-mini": { inputPerMtok: 0.15, outputPerMtok: 0.6 },
};

// Fallback conservador (próximo ao patamar Sonnet) para modelos não tabulados.
// Ajustado em runtime via env não tem suporte porque o impacto seria opaco —
// preferimos manter um número fixo e visível.
const FALLBACK_PRICING: ModelPricing = {
  inputPerMtok: 1,
  outputPerMtok: 5,
};

/**
 * Câmbio USD→BRL usado para estimar custo em moeda local. Sobrescritível
 * via env `FX_USD_BRL`. Se omitido, usa 5.20.
 */
export const FX_USD_BRL = parseFloat(process.env.FX_USD_BRL ?? "5.20");

export interface CostEstimate {
  usd: number;
  brl: number;
}

/**
 * Calcula custo estimado da chamada LLM com base na tabela de preços.
 * Retorna USD (precisão de 6 casas) e BRL (precisão de 4 casas) — formatação
 * de saída fica a cargo do caller.
 *
 * Para modelos não tabulados, aplica fallback conservador. Tokens negativos
 * ou NaN são tratados como zero.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): CostEstimate {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  const safePrompt =
    Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 0;
  const safeCompletion =
    Number.isFinite(completionTokens) && completionTokens > 0
      ? completionTokens
      : 0;

  const usd =
    (safePrompt / 1_000_000) * pricing.inputPerMtok +
    (safeCompletion / 1_000_000) * pricing.outputPerMtok;
  const brl = usd * FX_USD_BRL;

  return { usd, brl };
}
