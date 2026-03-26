/**
 * RR-Engine — Ensemble Validation Module
 *
 * Runs critical agents through two LLM models and compares numerical outputs
 * to detect pricing anomalies or hallucinations. Only compares numeric fields
 * (totals, costs, margins) to avoid false positives from formatting differences.
 *
 * Controlled by ENABLE_ENSEMBLE env var (default: false).
 */

export interface EnsembleResult {
  /** Whether ensemble validation was performed */
  enabled: boolean;
  /** Confidence score (0-1) based on numerical agreement */
  confidence: number;
  /** Specific numerical divergences found */
  divergences: string[];
  /** Models used for comparison */
  models: [string, string];
}

/**
 * Check if ensemble validation is enabled.
 */
export function isEnsembleEnabled(): boolean {
  return process.env.ENABLE_ENSEMBLE === 'true';
}

/**
 * Compare two agent outputs on their numerical fields only.
 * Returns divergences where values differ by more than the threshold.
 *
 * @param outputA - Primary model output (used as result)
 * @param outputB - Secondary model output (used for validation)
 * @param numericPaths - Dot-paths to numeric fields to compare
 * @param threshold - Maximum acceptable relative divergence (default: 0.20 = 20%)
 */
export function compareNumericOutputs(
  outputA: Record<string, unknown>,
  outputB: Record<string, unknown>,
  numericPaths: string[],
  threshold: number = 0.20,
): { confidence: number; divergences: string[] } {
  const divergences: string[] = [];
  let compared = 0;
  let agreed = 0;

  for (const path of numericPaths) {
    const valueA = getNestedValue(outputA, path);
    const valueB = getNestedValue(outputB, path);

    if (typeof valueA !== 'number' || typeof valueB !== 'number') continue;
    if (valueA === 0 && valueB === 0) { compared++; agreed++; continue; }

    compared++;
    const base = Math.max(Math.abs(valueA), Math.abs(valueB));
    const diff = Math.abs(valueA - valueB);
    const relDiff = base > 0 ? diff / base : 0;

    if (relDiff <= threshold) {
      agreed++;
    } else {
      const pct = Math.round(relDiff * 100);
      divergences.push(
        `${path}: modelo primário = ${round2(valueA)}, modelo secundário = ${round2(valueB)} (${pct}% divergência)`
      );
    }
  }

  const confidence = compared > 0 ? agreed / compared : 1;
  return { confidence, divergences };
}

/**
 * Numeric paths to compare for the Orcamentista agent output.
 */
export const ORCAMENTISTA_NUMERIC_PATHS = [
  'totalDirectCost',
  'totalIndirectCost',
];

/**
 * Numeric paths to compare for the Board agent output.
 */
export const BOARD_NUMERIC_PATHS = [
  'calculosFinanceiros.margemPercentual',
  'calculosFinanceiros.precoFinal',
  'calculosFinanceiros.custoTotal',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function round2(n: number): string {
  return n.toFixed(2);
}
