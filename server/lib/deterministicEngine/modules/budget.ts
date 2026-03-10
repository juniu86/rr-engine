/**
 * RR-Engine — Budget Module (Orçamento / BDI)
 *
 * BUG 7 FIX: BDI is a constant configurable parameter (default 25%),
 * independent of scope size or number of items. Previous behavior had
 * BDI varying between 11.3% and 43.3% across runs.
 */

import type { ItemOrcamento, CustoLogistico, ResumoOrcamento, EngineConfig } from '../types';

/**
 * Calculate final budget summary with constant BDI.
 *
 * Architecture:
 * - custo_base: Contractor's actual cost (SINAPI × FAR) — what the contractor pays.
 * - preco_referencia: SINAPI reference total (without FAR) — used as the commercial base.
 * - preco_venda: Commercial proposal price = preco_referencia × (1 + BDI) / (1 - tax).
 *
 * The FAR discount represents the contractor's regional cost advantage,
 * which contributes to the profit margin. The commercial proposal quotes
 * at SINAPI reference rates, not at the contractor's discounted cost.
 */
export function calculateBudget(
  itensOrcamento: ItemOrcamento[],
  custosLogisticos: CustoLogistico[],
  config: EngineConfig,
): ResumoOrcamento {
  // custo_base: actual contractor cost (with FAR applied)
  const custoBase = itensOrcamento
    .filter(i => !i.is_header)
    .reduce((sum, i) => sum + i.preco_total, 0);

  // preco_referencia: SINAPI reference total (without FAR discount)
  // This is the commercial base for the proposal
  const precoReferencia = itensOrcamento
    .filter(i => !i.is_header)
    .reduce((sum, i) => {
      const precoSinapiTotal = i.preco_unitario_sinapi * i.quantidade;
      return sum + precoSinapiTotal;
    }, 0);

  // Sum logistics costs (logistics already include FAR)
  const custoLogistica = custosLogisticos.reduce((sum, c) => sum + c.preco_total, 0);

  // Logistics reference (without FAR)
  const logisticaReferencia = custosLogisticos.reduce((sum, c) => {
    const item = itensOrcamento.find(i => i.fator_regional > 0);
    const far = item?.fator_regional ?? 1;
    return sum + (far > 0 ? c.preco_total / far : c.preco_total);
  }, 0);

  const custoTotal = custoBase + custoLogistica;
  const referenciaTotal = precoReferencia + logisticaReferencia;

  // BUG 7 FIX: BDI constant from config
  const bdiPercentual = config.bdi_percentual;
  const bdiValor = Math.round(referenciaTotal * (bdiPercentual / 100) * 100) / 100;

  const precoVendaSemImposto = referenciaTotal + bdiValor;

  // Calculate tax on revenue
  const impostoPercentual = config.imposto_percentual;
  // Price = (reference + BDI) / (1 - tax_rate) to include tax in final price
  const precoVenda = Math.round(precoVendaSemImposto / (1 - impostoPercentual / 100) * 100) / 100;
  const impostosValor = Math.round(precoVenda * (impostoPercentual / 100) * 100) / 100;

  const margemLiquida = precoVenda - custoTotal - impostosValor;
  const margemLiquidaPercentual = precoVenda > 0
    ? Math.round((margemLiquida / precoVenda) * 10000) / 100
    : 0;

  return {
    custo_base: Math.round(custoBase * 100) / 100,
    custo_logistica: Math.round(custoLogistica * 100) / 100,
    custo_total: Math.round(custoTotal * 100) / 100,
    bdi_percentual: bdiPercentual,
    bdi_valor: bdiValor,
    impostos_valor: impostosValor,
    preco_venda: precoVenda,
    margem_liquida_percentual: margemLiquidaPercentual,
    total_itens: itensOrcamento.filter(i => !i.is_header).length,
    duplicados_removidos: 0, // Set by orchestrator
    itens_inventados_removidos: 0, // Set by orchestrator
  };
}
