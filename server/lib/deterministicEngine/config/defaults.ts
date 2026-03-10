/**
 * RR-Engine — Default Configuration
 *
 * BUG 2 FIX: Regional adjustment factors (FAR) by locality type
 * BUG 5 FIX: Working days per week = 5 (not 7)
 * BUG 7 FIX: BDI constant at 25%
 */

import type { EngineConfig } from '../types';

export const DEFAULT_CONFIG: EngineConfig = {
  // BUG 7 FIX: BDI fixo em 28%, independente do escopo
  // Within the 25-30% range recommended for construction
  bdi_percentual: 28,

  // BUG 2 FIX: Fator de Ajuste Regional (FAR)
  // SINAPI prices include materials + labor. Only labor varies by region.
  // Blended factor: ~50% material (no discount) + ~50% labor (discounted).
  // Capital = 1.0, RM = 0.90, Interior = 0.80
  // Interior labor is 30-50% cheaper, but materials stay near national price.
  fator_regional: {
    capital: 1.0,
    regiao_metropolitana: 0.90,
    interior: 0.80,
  },

  // Imposto padrão sobre receita
  imposto_percentual: 13.0,

  // BUG 5 FIX: Hospedagem conta apenas dias úteis
  dias_uteis_semana: 5,

  // BUG 1 FIX: Threshold para deduplicação semântica
  similaridade_threshold: 0.85,

  // BUG 3 FIX: Não permitir logística inferida
  permitir_logistica_inferida: false,
};

/**
 * Merge user overrides with defaults
 */
export function buildConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  if (!overrides) return { ...DEFAULT_CONFIG };

  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    fator_regional: {
      ...DEFAULT_CONFIG.fator_regional,
      ...(overrides.fator_regional ?? {}),
    },
  };
}
