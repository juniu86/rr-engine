/**
 * Regional price adjustment factors for Brazilian construction cost databases.
 * Base: São Paulo = 1.0, reference: SINAPI Jan/2025.
 *
 * Used by both SINAPI (state abbreviation keys) and PINI (full name keys).
 */

export const STATE_FACTORS: Record<string, number> = {
  AC: 1.18, AL: 0.89, AM: 1.12, AP: 1.15, BA: 0.88,
  CE: 0.87, DF: 1.02, ES: 0.94, GO: 0.90, MA: 0.91,
  MG: 0.92, MS: 0.96, MT: 0.97, PA: 1.08, PB: 0.86,
  PE: 0.87, PI: 0.88, PR: 0.93, RJ: 1.05, RN: 0.87,
  RO: 1.10, RR: 1.20, RS: 0.95, SC: 0.94, SE: 0.89,
  SP: 1.00, TO: 1.05,
};

/** Mapping from full state name to abbreviation */
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  "São Paulo": "SP", "Rio de Janeiro": "RJ", "Minas Gerais": "MG",
  "Bahia": "BA", "Rio Grande do Sul": "RS", "Paraná": "PR",
  "Santa Catarina": "SC", "Goiás": "GO", "Distrito Federal": "DF",
  "Pernambuco": "PE", "Ceará": "CE", "Espírito Santo": "ES",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Pará": "PA",
  "Amazonas": "AM", "Maranhão": "MA", "Tocantins": "TO",
  "Sergipe": "SE", "Alagoas": "AL", "Piauí": "PI",
  "Rio Grande do Norte": "RN", "Paraíba": "PB", "Rondônia": "RO",
  "Acre": "AC", "Amapá": "AP", "Roraima": "RR",
};

/**
 * Get the price adjustment factor for a state.
 * Accepts either abbreviation ("SP") or full name ("São Paulo").
 */
export function getRegionFactor(stateOrRegion: string): number {
  // Try direct abbreviation lookup
  const upper = stateOrRegion.toUpperCase();
  if (STATE_FACTORS[upper]) return STATE_FACTORS[upper];

  // Try full name lookup
  const abbrev = STATE_NAME_TO_ABBREV[stateOrRegion];
  if (abbrev && STATE_FACTORS[abbrev]) return STATE_FACTORS[abbrev];

  return 1.0;
}

/**
 * Adjust a base price (SP reference) for a given state/region.
 */
export function adjustPriceForRegion(basePrice: number, stateOrRegion: string): number {
  return Math.round(basePrice * getRegionFactor(stateOrRegion) * 100) / 100;
}
