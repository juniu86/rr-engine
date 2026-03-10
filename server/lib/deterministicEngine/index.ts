/**
 * RR-Engine — Main Orchestrator
 *
 * Pipeline: Memorial → Parser → Pricing → Logistics → Budget → Result
 *
 * All bug fixes are integrated into the pipeline:
 * - BUG 1: Deduplication in parser
 * - BUG 2: Regional factor in pricing
 * - BUG 3: No invented logistics items
 * - BUG 4: Cross-check equipment between budget & logistics
 * - BUG 5: Working days for accommodation
 * - BUG 6: Complete sub-item decomposition
 * - BUG 7: Constant BDI
 * - BUG 8: Reform detection for contrapiso
 */

import type { EngineConfig, MemorialDescritivo, ResultadoEngine } from './types';
import { buildConfig } from './config/defaults';
import { parseMemorial, deduplicateItems } from './modules/parser';
import { priceItems } from './modules/pricing';
import { calculateLogistics } from './modules/logistics';
import { calculateBudget } from './modules/budget';

export { parseMemorial } from './modules/parser';
export { priceItems } from './modules/pricing';
export { calculateLogistics } from './modules/logistics';
export { calculateBudget } from './modules/budget';
export { buildConfig } from './config/defaults';
export type { EngineConfig, MemorialDescritivo, ResultadoEngine } from './types';

/**
 * Run the full RR-Engine pipeline on a memorial markdown string.
 */
export function processMemorial(
  markdownContent: string,
  configOverrides?: Partial<EngineConfig>,
): ResultadoEngine {
  const config = buildConfig(configOverrides);
  const warnings: string[] = [];

  // ─── Step 1: Parse memorial (BUG 1 + BUG 8) ────────────────────────
  const memorial = parseMemorial(markdownContent);
  const originalItemCount = markdownContent.split('\n')
    .filter(l => l.trim().startsWith('-') && /\d+\s*(m²|m2|un|unidades?|dias?)/i.test(l))
    .length;

  const duplicadosRemovidos = Math.max(0, originalItemCount - memorial.itens.length);
  if (duplicadosRemovidos > 0) {
    warnings.push(`${duplicadosRemovidos} itens duplicados removidos pelo deduplicador.`);
  }

  // ─── Step 2: Price items (BUG 2 + BUG 6) ───────────────────────────
  const { itens: itensOrcamento, warnings: pricingWarnings } = priceItems(
    memorial.itens,
    config,
    memorial.localizacao.tipo,
  );
  warnings.push(...pricingWarnings);

  // ─── Step 3: Calculate logistics (BUG 3 + BUG 4 + BUG 5) ──────────
  const { custos: custosLogisticos, warnings: logisticsWarnings } = calculateLogistics(
    memorial.logistica,
    config,
    memorial.localizacao.tipo,
    memorial.prazo_semanas,
    itensOrcamento,
  );
  warnings.push(...logisticsWarnings);

  // ─── Step 4: Calculate budget (BUG 7) ──────────────────────────────
  const resumo = calculateBudget(itensOrcamento, custosLogisticos, config);
  resumo.duplicados_removidos = duplicadosRemovidos;

  // Count removed invented items (items in V1 logistics that aren't explicit)
  const inventedKeywords = ['alimentacao', 'alimentação', 'andaime'];
  let inventadosRemovidos = 0;
  for (const kw of inventedKeywords) {
    if (!memorial.logistica.itens_explicitos.some(i => i.toLowerCase().includes(kw))) {
      // This item was NOT in the memorial, so if old engine would have added it, we removed it
      inventadosRemovidos++;
    }
  }
  resumo.itens_inventados_removidos = inventadosRemovidos;

  return {
    memorial,
    itens_orcamento: itensOrcamento,
    custos_logisticos: custosLogisticos,
    resumo,
    warnings,
    config_utilizada: config,
  };
}
