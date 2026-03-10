/**
 * RR-Engine — Pricing Module (Precificação)
 *
 * BUG 2 FIX: Applies Fator de Ajuste Regional (FAR) to SINAPI prices.
 * Interior locations get factor 0.65 (MO 30-50% cheaper).
 *
 * BUG 6 FIX: When a header item has sub-items, ALL components must be
 * decomposed and priced. Validates completeness of sub-item decomposition.
 */

import type { ItemMemorial, ItemOrcamento, EngineConfig, TipoLocalidade } from '../types';
import { findSINAPIPrice, type PrecoSINAPI } from '../config/sinapi-precos';
import { normalizeText } from '../utils/normalize';

/**
 * Price all items from the parsed memorial.
 */
export function priceItems(
  itens: ItemMemorial[],
  config: EngineConfig,
  tipoLocalidade: TipoLocalidade,
): { itens: ItemOrcamento[]; warnings: string[] } {
  const far = config.fator_regional[tipoLocalidade];
  const warnings: string[] = [];
  const result: ItemOrcamento[] = [];
  let id = 1;

  for (const item of itens) {
    const priced = priceItem(item, id, far, config, warnings);
    result.push(...priced);
    id += priced.length;
  }

  return { itens: result, warnings };
}

function priceItem(
  item: ItemMemorial,
  startId: number,
  far: number,
  config: EngineConfig,
  warnings: string[],
): ItemOrcamento[] {
  const results: ItemOrcamento[] = [];

  // Check if this is a header item with sub-items
  if (item.sub_itens && item.sub_itens.length > 0) {
    return priceHeaderWithSubItems(item, startId, far, config, warnings);
  }

  // Check if this item should be decomposed into sub-items
  const decomposition = shouldDecompose(item);
  if (decomposition) {
    return priceHeaderWithSubItems(
      { ...item, sub_itens: decomposition },
      startId,
      far,
      config,
      warnings,
    );
  }

  // Standard single item pricing
  const sinapi = findSINAPIPrice(item.descricao);

  if (!sinapi) {
    warnings.push(`Preço SINAPI não encontrado para: "${item.descricao}". Usando estimativa.`);
    const estimated = estimatePrice(item);
    results.push(createOrcamentoItem(
      startId, item, estimated, far, 'composicao',
    ));
  } else {
    results.push(createOrcamentoItem(
      startId, item, sinapi.preco_unitario, far, 'sinapi',
    ));
  }

  return results;
}

/**
 * BUG 6 FIX: Price a header with sub-items, ensuring ALL components are priced.
 */
function priceHeaderWithSubItems(
  header: ItemMemorial,
  startId: number,
  far: number,
  config: EngineConfig,
  warnings: string[],
): ItemOrcamento[] {
  const results: ItemOrcamento[] = [];
  let id = startId;
  let headerTotal = 0;

  const subItens = header.sub_itens ?? [];

  // BUG 6 FIX: Validate that all sub-components are present
  const missingComponents = findMissingComponents(header, subItens);
  if (missingComponents.length > 0) {
    for (const missing of missingComponents) {
      warnings.push(`Sub-item faltante detectado para "${header.descricao}": ${missing.descricao}`);
      subItens.push(missing);
    }
  }

  // Price each sub-item
  const subResults: ItemOrcamento[] = [];
  for (const sub of subItens) {
    const sinapi = findSINAPIPrice(sub.descricao);
    const preco = sinapi?.preco_unitario ?? estimatePrice(sub);
    const fonte = sinapi ? 'sinapi' as const : 'composicao' as const;

    const subItem = createOrcamentoItem(id + 1 + subResults.length, sub, preco, far, fonte);
    headerTotal += subItem.preco_total;
    subResults.push(subItem);
  }

  // Create header with calculated total
  const headerItem: ItemOrcamento = {
    id,
    descricao: header.descricao,
    descricao_normalizada: normalizeText(header.descricao),
    categoria: header.categoria,
    unidade: header.unidade,
    quantidade: header.quantidade,
    preco_unitario_sinapi: 0,
    fator_regional: far,
    preco_unitario_ajustado: 0,
    preco_total: headerTotal,
    fonte: 'composicao',
    modulo_origem: 'orcamento',
    is_header: true,
    sub_itens: subResults,
  };

  results.push(headerItem);
  results.push(...subResults);

  return results;
}

/**
 * BUG 6 FIX: Check if known compound items are missing sub-components.
 * For example, "drywall 14m² + 1 porta" should have both placa and porta.
 */
function findMissingComponents(header: ItemMemorial, existingSubItens: ItemMemorial[]): ItemMemorial[] {
  const missing: ItemMemorial[] = [];
  const normalized = normalizeText(header.descricao);
  const existingNormalized = existingSubItens.map(s => normalizeText(s.descricao));

  // Drywall: should have placa + porta (if mentioned)
  if (normalized.includes('drywall')) {
    const hasPlaca = existingNormalized.some(d =>
      d.includes('placa') || d.includes('drywall') || d.includes('gesso'));
    const hasPorta = existingNormalized.some(d => d.includes('porta'));

    if (!hasPlaca && header.quantidade > 0) {
      missing.push({
        descricao: 'Parede drywall placa RU',
        categoria: header.categoria,
        unidade: 'm²',
        quantidade: header.quantidade,
      });
    }

    // Check if porta is mentioned in header but missing from sub-items
    if (!hasPorta && /porta/i.test(header.descricao)) {
      const portaMatch = header.descricao.match(/(\d+)\s*(?:porta|un)/i);
      missing.push({
        descricao: 'Porta para drywall',
        categoria: header.categoria,
        unidade: 'un',
        quantidade: portaMatch ? parseInt(portaMatch[1], 10) : 1,
      });
    }
  }

  return missing;
}

/**
 * Determine if an item should be decomposed into sub-items.
 * Returns sub-items or null if no decomposition needed.
 */
function shouldDecompose(item: ItemMemorial): ItemMemorial[] | null {
  const desc = normalizeText(item.descricao);

  // Drywall with porta mentioned
  if (desc.includes('drywall') && /porta/i.test(item.descricao)) {
    const portaMatch = item.descricao.match(/(\d+)\s*porta/i);
    const portaQty = portaMatch ? parseInt(portaMatch[1], 10) : 1;

    return [
      {
        descricao: 'Parede drywall placa RU',
        categoria: item.categoria,
        unidade: 'm²',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Porta para drywall',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: portaQty,
      },
    ];
  }

  // Electrical installation "conforme projeto" — decompose into standard points
  // For commercial spaces (postos, lojas), estimates are higher than residential
  if ((desc.includes('instalacao eletrica') || desc.includes('eletrica completa')) && item.unidade === 'vb') {
    return [
      {
        descricao: 'Ponto de iluminação',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 30,
      },
      {
        descricao: 'Ponto de tomada',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 40,
      },
      {
        descricao: 'Quadro de distribuição com disjuntores',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 2,
      },
    ];
  }

  return null;
}

function createOrcamentoItem(
  id: number,
  item: ItemMemorial,
  precoSinapi: number,
  far: number,
  fonte: 'sinapi' | 'composicao' | 'cotacao',
): ItemOrcamento {
  const precoAjustado = Math.round(precoSinapi * far * 100) / 100;
  const total = Math.round(precoAjustado * item.quantidade * 100) / 100;

  return {
    id,
    descricao: item.descricao,
    descricao_normalizada: normalizeText(item.descricao),
    categoria: item.categoria,
    unidade: item.unidade,
    quantidade: item.quantidade,
    preco_unitario_sinapi: precoSinapi,
    fator_regional: far,
    preco_unitario_ajustado: precoAjustado,
    preco_total: total,
    fonte,
    modulo_origem: 'orcamento',
    is_header: false,
  };
}

/**
 * Estimate price for items not in SINAPI database.
 */
function estimatePrice(item: ItemMemorial): number {
  const desc = normalizeText(item.descricao);

  // Rough estimates for common items not found
  if (desc.includes('esquadria')) return 400;
  if (desc.includes('cabeamento') || desc.includes('infraestrutura eletrica')) return 120;
  if (desc.includes('equipamento') || desc.includes('seguranca')) return 200;

  // Generic fallback based on unit
  if (item.unidade === 'm²') return 50;
  if (item.unidade === 'un') return 200;
  return 100;
}
