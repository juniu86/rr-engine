import { agentLlmCalls } from "../../drizzle/schema";
import { getDb } from "../db";
import { estimateCost } from "../_core/llm-pricing";
import { logger } from "../utils/logger";
import type { AgentType } from "../../shared/agents";

export interface LlmCallRecord {
  projectId: number;
  /** Opcional — chamadas LLM podem existir fora de uma execução de agente. */
  agentExecutionId?: number | null;
  agentType: AgentType;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  finishReason?: string | null;
  attemptNumber?: number;
  errorMessage?: string | null;
}

/**
 * Persiste uma chamada LLM na tabela `agent_llm_calls` para análise de custo
 * e latência. Calcula custo em USD e BRL via tabela de preços por modelo.
 *
 * Garantia: NUNCA lança. Se a persistência falhar (banco indisponível,
 * coluna mudou, etc.), apenas registra warning. Telemetria é observabilidade,
 * não pode quebrar o pipeline de orçamento.
 */
export async function recordLlmCall(record: LlmCallRecord): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      logger.warn(
        "[Telemetry] Skipping LLM call record (database unavailable)",
        {
          agentType: record.agentType,
          model: record.model,
        }
      );
      return;
    }

    const { usd, brl } = estimateCost(
      record.model,
      record.promptTokens,
      record.completionTokens
    );

    await db.insert(agentLlmCalls).values({
      projectId: record.projectId,
      agentExecutionId: record.agentExecutionId ?? null,
      agentType: record.agentType,
      model: record.model,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      totalTokens: record.totalTokens,
      costUsd: usd.toFixed(6),
      costBrl: brl.toFixed(4),
      latencyMs: record.latencyMs,
      finishReason: record.finishReason ?? null,
      attemptNumber: record.attemptNumber ?? 1,
      errorMessage: record.errorMessage ?? null,
    });
  } catch (err) {
    logger.error("[Telemetry] Failed to persist LLM call record", {
      error: err instanceof Error ? err.message : String(err),
      agentType: record.agentType,
      model: record.model,
    });
  }
}
