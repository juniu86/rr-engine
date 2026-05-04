import { processMemorial } from "../lib/deterministicEngine";
import type { ResultadoEngine } from "../lib/deterministicEngine/types";
import { deterministicEngineRuns } from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../utils/logger";
import { eq, desc } from "drizzle-orm";

export interface DeterministicResult {
  /** Total custo direto + logística (PRÉ-BDI). É o número comparado com o LLM. */
  totalBaseCost: number;
  /** Apenas itens de orçamento (custo direto). */
  totalDirectCost: number;
  /** Apenas custos logísticos. */
  totalLogisticsCost: number;
  /** Quantidade de itens extraídos pelo parser. */
  totalItemsParsed: number;
  /** Warnings do engine (parser, pricing, logistics). */
  warnings: string[];
  /** Resultado completo, persistido em rawOutputJson. */
  raw: ResultadoEngine;
  latencyMs: number;
  /** Id da linha em deterministic_engine_runs (para update posterior em recordDivergence). */
  runId?: number;
}

export type DivergenceClass = "info" | "warning" | "critical";

export interface DivergenceResult {
  divergencePercent: number;
  divergenceClass: DivergenceClass;
}

/**
 * Lê a feature flag ENABLE_DETERMINISTIC_VALIDATION. Default false:
 * usuários atuais não são impactados até a calibração estar pronta.
 */
export function isDeterministicValidationEnabled(): boolean {
  const value = (
    process.env.ENABLE_DETERMINISTIC_VALIDATION ?? "false"
  ).toLowerCase();
  return value === "true" || value === "1";
}

/**
 * Classifica a divergência entre total LLM e total determinístico.
 * - <5%: info  (sistemas concordam)
 * - 5-15%: warning (revisão recomendada)
 * - >=15%: critical (inspeção obrigatória)
 *
 * v1: classificação é SOFT ALERT — Auditor reporta mas NÃO bloqueia
 * proposta. Reavaliar após 30 dias de calibração.
 */
export function classifyDivergence(
  deterministicTotal: number,
  llmTotal: number
): DivergenceResult {
  if (llmTotal <= 0) {
    return { divergencePercent: 0, divergenceClass: "info" };
  }
  const divergence = Math.abs((llmTotal - deterministicTotal) / llmTotal) * 100;
  const divergenceClass: DivergenceClass =
    divergence >= 15 ? "critical" : divergence >= 5 ? "warning" : "info";
  return { divergencePercent: divergence, divergenceClass };
}

/**
 * Roda o engine determinístico para um memorial e persiste o resultado.
 *
 * Garantia: NUNCA lança em caso de falha do engine. Retorna `null` quando
 * desabilitado ou quando ocorre falha — o Auditor opera em modo
 * "engine indisponível" sem alarme.
 */
export async function runDeterministicValidator(
  projectId: number,
  memorialMarkdown: string
): Promise<DeterministicResult | null> {
  if (!isDeterministicValidationEnabled()) {
    logger.info("[DeterministicValidator] disabled via env flag", {
      projectId,
    });
    return null;
  }

  if (!memorialMarkdown || memorialMarkdown.trim().length === 0) {
    logger.warn("[DeterministicValidator] empty memorial, skipping", {
      projectId,
    });
    return null;
  }

  const t0 = Date.now();
  let raw: ResultadoEngine;
  try {
    raw = processMemorial(memorialMarkdown);
  } catch (err) {
    logger.warn("[DeterministicValidator] engine threw, skipping cross-check", {
      projectId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const totalDirectCost = raw.resumo?.custo_base ?? 0;
  const totalLogisticsCost = raw.resumo?.custo_logistica ?? 0;
  const totalBaseCost =
    raw.resumo?.custo_total ?? totalDirectCost + totalLogisticsCost;
  const result: DeterministicResult = {
    totalBaseCost,
    totalDirectCost,
    totalLogisticsCost,
    totalItemsParsed: raw.itens_orcamento?.length ?? 0,
    warnings: raw.warnings ?? [],
    raw,
    latencyMs: Date.now() - t0,
  };

  // Persistência separada do cálculo: se o DB falhar, ainda retornamos o
  // resultado para o Auditor usar em memória.
  try {
    const db = await getDb();
    if (db) {
      const insertResult = await db.insert(deterministicEngineRuns).values({
        projectId,
        totalDirectCost: result.totalDirectCost.toFixed(2),
        totalLogisticsCost: result.totalLogisticsCost.toFixed(2),
        totalBaseCost: result.totalBaseCost.toFixed(2),
        totalItemsParsed: result.totalItemsParsed,
        warningsJson: result.warnings,
        rawOutputJson: result.raw as unknown as object,
        llmTotal: null,
        divergencePercent: null,
        divergenceClass: null,
        latencyMs: result.latencyMs,
      });
      const insertId = Array.isArray(insertResult)
        ? Number((insertResult as any)[0]?.insertId)
        : Number((insertResult as any).insertId);
      if (Number.isFinite(insertId) && insertId > 0) {
        result.runId = insertId;
      }
    }
  } catch (err) {
    logger.warn("[DeterministicValidator] persist failed (non-fatal)", {
      projectId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Atualiza a linha da última `deterministic_engine_runs` deste projeto com
 * a divergência calculada vs. o total LLM final do Auditor. Nunca lança.
 */
export async function recordDivergence(
  projectId: number,
  deterministicTotal: number,
  llmTotal: number,
  runId?: number
): Promise<DivergenceResult | null> {
  const classification = classifyDivergence(deterministicTotal, llmTotal);

  try {
    const db = await getDb();
    if (!db) {
      logger.warn(
        "[DeterministicValidator] cannot record divergence (db unavailable)",
        {
          projectId,
        }
      );
      return classification;
    }

    if (runId !== undefined) {
      await db
        .update(deterministicEngineRuns)
        .set({
          llmTotal: llmTotal.toFixed(2),
          divergencePercent: classification.divergencePercent.toFixed(2),
          divergenceClass: classification.divergenceClass,
        })
        .where(eq(deterministicEngineRuns.id, runId));
    } else {
      // Sem runId — atualiza a última linha do projeto (best-effort).
      const last = await db
        .select({ id: deterministicEngineRuns.id })
        .from(deterministicEngineRuns)
        .where(eq(deterministicEngineRuns.projectId, projectId))
        .orderBy(desc(deterministicEngineRuns.id))
        .limit(1);
      if (last[0]?.id !== undefined) {
        await db
          .update(deterministicEngineRuns)
          .set({
            llmTotal: llmTotal.toFixed(2),
            divergencePercent: classification.divergencePercent.toFixed(2),
            divergenceClass: classification.divergenceClass,
          })
          .where(eq(deterministicEngineRuns.id, last[0].id));
      }
    }
  } catch (err) {
    logger.warn(
      "[DeterministicValidator] recordDivergence failed (non-fatal)",
      {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }

  return classification;
}
