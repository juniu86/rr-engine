/**
 * RR-Engine — Price Anchor Validator
 *
 * Compares LLM-generated prices against SINAPI/PINI reference prices.
 * Used post-Orcamentista to detect significant pricing divergences.
 */

interface BudgetItem {
  description: string;
  unit: string;
  unitCostTotal: number;
  quantity: number;
}

interface PriceReference {
  source: string;
  code: string;
  price: number;
  description: string;
}

/**
 * Validate LLM-generated budget items against reference prices.
 * Returns array of warnings for items with >30% divergence.
 */
export function validatePricesAgainstAnchors(
  budgetItems: BudgetItem[],
): string[] {
  const warnings: string[] = [];

  let SINAPI_DB: Array<{ code: string; description: string; unit: string; price: number }>;
  let PINI_DATABASE: Array<{ code: string; description: string; unit: string; price: number }>;

  try {
    ({ SINAPI_DB } = require("../services/sinapi"));
    ({ PINI_DATABASE } = require("../services/pini"));
  } catch {
    return warnings; // Databases not available
  }

  const normalizeText = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();

  for (const item of budgetItems) {
    if (!item.unitCostTotal || item.unitCostTotal <= 0) continue;

    const descNorm = normalizeText(item.description);
    const keywords = descNorm.split(/\s+/).filter(k => k.length > 2);
    if (keywords.length === 0) continue;

    // Find best reference match
    let bestRef: PriceReference | null = null;
    let bestScore = 0;

    const allComps = [
      ...SINAPI_DB.map(c => ({ ...c, source: 'SINAPI' })),
      ...PINI_DATABASE.map(c => ({ ...c, source: 'PINI' })),
    ];

    for (const comp of allComps) {
      if (comp.unit === 'H') continue;
      const compNorm = normalizeText(comp.description);
      let matched = 0;
      for (const kw of keywords) { if (compNorm.includes(kw)) matched++; }
      const score = matched / keywords.length;

      // Unit bonus
      const unitMatch = item.unit && comp.unit.toLowerCase() === item.unit.toLowerCase() ? 0.2 : 0;

      if (score + unitMatch > bestScore && score >= 0.4) {
        bestScore = score + unitMatch;
        bestRef = { source: comp.source, code: comp.code, price: comp.price, description: comp.description };
      }
    }

    if (bestRef && bestRef.price > 0) {
      const divergence = Math.abs(item.unitCostTotal - bestRef.price) / bestRef.price;
      if (divergence > 0.30) {
        const pct = Math.round(divergence * 100);
        warnings.push(
          `Divergência de preço: "${item.description}" — LLM: R$ ${item.unitCostTotal.toFixed(2)} vs ${bestRef.source} ${bestRef.code}: R$ ${bestRef.price.toFixed(2)} (${pct}% de diferença)`
        );
      }
    }
  }

  return warnings;
}
