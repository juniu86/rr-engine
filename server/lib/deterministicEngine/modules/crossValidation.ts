/**
 * RR-Engine — Cross-Validation Module
 *
 * Compares deterministic engine results against LLM agent results
 * to detect significant pricing divergences that warrant manual review.
 */

export interface CrossValidationResult {
  divergencePercent: number;
  severity: 'none' | 'warning' | 'critical';
  warning?: string;
}

/**
 * Compare deterministic total against LLM total and flag divergences.
 *
 * @param deterministicTotal - Total cost from deterministic engine
 * @param llmTotal - Total cost from LLM agent pipeline (optional)
 * @returns Divergence analysis with severity level
 */
export function crossValidate(
  deterministicTotal: number,
  llmTotal: number | undefined,
): CrossValidationResult {
  if (!llmTotal || llmTotal <= 0 || deterministicTotal <= 0) {
    return { divergencePercent: 0, severity: 'none' };
  }

  const divergence = Math.abs(llmTotal - deterministicTotal) / deterministicTotal;
  const pct = Math.round(divergence * 100);

  if (divergence > 0.40) {
    return {
      divergencePercent: pct,
      severity: 'critical',
      warning: `Divergência crítica de ${pct}% entre motor determinístico (R$ ${deterministicTotal.toFixed(2)}) e agente LLM (R$ ${llmTotal.toFixed(2)}). Revisão manual recomendada.`,
    };
  }

  if (divergence > 0.20) {
    return {
      divergencePercent: pct,
      severity: 'warning',
      warning: `Divergência de ${pct}% entre motor determinístico (R$ ${deterministicTotal.toFixed(2)}) e agente LLM (R$ ${llmTotal.toFixed(2)}).`,
    };
  }

  return { divergencePercent: pct, severity: 'none' };
}
