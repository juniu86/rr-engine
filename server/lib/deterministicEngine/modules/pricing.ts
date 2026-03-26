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
import { findSINAPIPrice, findSINAPIFromExpandedDB, type PrecoSINAPI } from '../config/sinapi-precos';
import { normalizeText } from '../utils/normalize';
import { getRegionFactor } from '../../../../shared/regionFactors';

/**
 * Resolve the best regional adjustment factor (FAR).
 * Prefers per-state factor (more precise) when estado is available,
 * falls back to generic locality-type factor.
 */
function resolveFAR(config: EngineConfig, tipoLocalidade: TipoLocalidade, estado?: string): number {
  if (estado && estado.length >= 2) {
    return getRegionFactor(estado);
  }
  return config.fator_regional[tipoLocalidade];
}

/**
 * Price all items from the parsed memorial.
 */
export function priceItems(
  itens: ItemMemorial[],
  config: EngineConfig,
  tipoLocalidade: TipoLocalidade,
  estado?: string,
): { itens: ItemOrcamento[]; warnings: string[] } {
  const far = resolveFAR(config, tipoLocalidade, estado);
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

  // Standard single item pricing — fallback chain:
  // 1. Curated SINAPI base (30 items with optimized keywords)
  // 2. Expanded SINAPI DB (200+ compositions via text similarity)
  // 3. Category-aware estimation
  const sinapi = findSINAPIPrice(item.descricao);

  if (sinapi) {
    results.push(createOrcamentoItem(
      startId, item, sinapi.preco_unitario, far, 'sinapi',
    ));
  } else {
    // Try expanded database before falling back to estimation
    const expanded = findSINAPIFromExpandedDB(item.descricao, item.unidade);
    if (expanded) {
      results.push(createOrcamentoItem(
        startId, item, expanded.preco_unitario, far, 'sinapi',
      ));
    } else {
      warnings.push(`Preço SINAPI não encontrado para: "${item.descricao}". Usando estimativa por categoria.`);
      const estimated = estimatePrice(item);
      results.push(createOrcamentoItem(
        startId, item, estimated, far, 'composicao',
      ));
    }
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

  // Price each sub-item (same fallback chain: curated → expanded → estimate)
  const subResults: ItemOrcamento[] = [];
  for (const sub of subItens) {
    const sinapi = findSINAPIPrice(sub.descricao);
    const expanded = !sinapi ? findSINAPIFromExpandedDB(sub.descricao, sub.unidade) : null;
    const preco = sinapi?.preco_unitario ?? expanded?.preco_unitario ?? estimatePrice(sub);
    const fonte = (sinapi || expanded) ? 'sinapi' as const : 'composicao' as const;

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

  // Hydraulic installation "conforme projeto" — decompose into standard points
  if ((desc.includes('instalacao hidraulica') || desc.includes('hidrossanitaria') || desc.includes('hidraulica completa')) && item.unidade === 'vb') {
    return [
      {
        descricao: 'Ponto de água fria (registro, tubulação e conexões)',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 8,
      },
      {
        descricao: 'Ponto de esgoto (tubulação e conexões)',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 6,
      },
      {
        descricao: 'Vaso sanitário com caixa acoplada',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 2,
      },
      {
        descricao: 'Lavatório com torneira',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: 2,
      },
    ];
  }

  // Complete bathroom "banheiro completo" — decompose into components
  if ((desc.includes('banheiro completo') || desc.includes('banheiro') && desc.includes('completo')) && item.unidade === 'vb') {
    return [
      {
        descricao: 'Vaso sanitário com caixa acoplada',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Lavatório com torneira',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Chuveiro elétrico com registro',
        categoria: item.categoria,
        unidade: 'un',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Revestimento cerâmico para paredes de banheiro',
        categoria: item.categoria,
        unidade: 'm²',
        quantidade: 12 * item.quantidade, // ~12m² per bathroom
      },
    ];
  }

  // Complete roofing "cobertura completa" — decompose into structure + tiles + accessories
  if ((desc.includes('cobertura completa') || desc.includes('telhado completo')) && item.unidade === 'm²') {
    return [
      {
        descricao: 'Estrutura de madeira para cobertura',
        categoria: item.categoria,
        unidade: 'm²',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Telhamento com telha cerâmica',
        categoria: item.categoria,
        unidade: 'm²',
        quantidade: item.quantidade,
      },
      {
        descricao: 'Calha em chapa galvanizada',
        categoria: item.categoria,
        unidade: 'm',
        quantidade: Math.round(Math.sqrt(item.quantidade) * 2), // perimeter estimate
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
 * Category-aware price estimation for items not found in SINAPI databases.
 * Uses keyword matching against the item description to find the most
 * appropriate estimate, falling back to unit-based generic values.
 *
 * Prices are based on SINAPI SP Jan/2025 averages (before regional adjustment).
 */
function estimatePrice(item: ItemMemorial): number {
  const desc = normalizeText(item.descricao);

  // ─── m² estimates ──────────────────────────────────────────────────
  if (item.unidade === 'm²') {
    if (desc.includes('demolicao') || desc.includes('remocao')) return 45;
    if (desc.includes('contrapiso') || desc.includes('regularizacao')) return 55;
    if (desc.includes('porcelanato')) return 130;
    if (desc.includes('ceramica') || desc.includes('piso ceramico')) return 95;
    if (desc.includes('rejuntamento')) return 9;
    if (desc.includes('pintura') || desc.includes('latex') || desc.includes('acrilica')) return 25;
    if (desc.includes('massa corrida') || desc.includes('massa pva')) return 15;
    if (desc.includes('lixamento') || desc.includes('selador')) return 5;
    if (desc.includes('impermeabilizacao') || desc.includes('manta asfaltica')) return 85;
    if (desc.includes('revestimento') || desc.includes('chapisco') || desc.includes('emboco')) return 30;
    if (desc.includes('forro') || desc.includes('forro pvc')) return 85;
    if (desc.includes('drywall') || desc.includes('gesso acartonado')) return 170;
    if (desc.includes('alvenaria') || desc.includes('bloco')) return 75;
    if (desc.includes('cobertura') || desc.includes('telha') || desc.includes('telhamento')) return 70;
    if (desc.includes('forma') || desc.includes('forma de madeira')) return 80;
    if (desc.includes('laje')) return 90;
    if (desc.includes('piso')) return 80;
    if (desc.includes('limpeza')) return 8;
    if (desc.includes('tapume')) return 78;
    if (desc.includes('textura') || desc.includes('texturizado')) return 29;
    if (desc.includes('epoxi')) return 35;
    return 65; // generic m² fallback
  }

  // ─── un estimates ──────────────────────────────────────────────────
  if (item.unidade === 'un') {
    if (desc.includes('porta')) return 800;
    if (desc.includes('janela') || desc.includes('esquadria')) return 700;
    if (desc.includes('iluminacao') || desc.includes('ponto de luz') || desc.includes('ponto iluminacao')) return 170;
    if (desc.includes('tomada') || desc.includes('ponto tomada') || desc.includes('ponto eletrico')) return 160;
    if (desc.includes('quadro') || desc.includes('disjuntor')) return 890;
    if (desc.includes('louca') || desc.includes('vaso') || desc.includes('bacia')) return 400;
    if (desc.includes('cuba') || desc.includes('lavatorio')) return 350;
    if (desc.includes('torneira') || desc.includes('metal') || desc.includes('misturador')) return 250;
    if (desc.includes('chuveiro') || desc.includes('ducha')) return 200;
    if (desc.includes('verga') || desc.includes('contraverga')) return 35;
    if (desc.includes('placa') || desc.includes('identificacao')) return 346;
    if (desc.includes('caixa dagua') || desc.includes('reservatorio')) return 800;
    return 300; // generic un fallback
  }

  // ─── m³ estimates ──────────────────────────────────────────────────
  if (item.unidade === 'm³') {
    if (desc.includes('concreto') || desc.includes('fck')) return 500;
    if (desc.includes('escavacao')) return 55;
    if (desc.includes('reaterro') || desc.includes('aterro')) return 35;
    if (desc.includes('argamassa')) return 400;
    return 200; // generic m³ fallback
  }

  // ─── m (linear) estimates ──────────────────────────────────────────
  if (item.unidade === 'm') {
    if (desc.includes('tubulacao') || desc.includes('tubo') || desc.includes('esgoto')) return 45;
    if (desc.includes('rodape')) return 20;
    if (desc.includes('calha')) return 55;
    if (desc.includes('rufo')) return 45;
    if (desc.includes('soleira') || desc.includes('granito')) return 68;
    if (desc.includes('estaca') || desc.includes('broca')) return 50;
    return 40; // generic m fallback
  }

  // ─── kg estimates ──────────────────────────────────────────────────
  if (item.unidade === 'kg') {
    if (desc.includes('aco') || desc.includes('armacao') || desc.includes('armadura')) return 15;
    if (desc.includes('estrutura metalica')) return 19;
    return 15; // generic kg fallback
  }

  // ─── dia estimates ─────────────────────────────────────────────────
  if (item.unidade === 'dia') {
    if (desc.includes('martelete')) return 95;
    if (desc.includes('serra')) return 45;
    return 80; // generic dia fallback
  }

  // ─── mês estimates ─────────────────────────────────────────────────
  if (item.unidade === 'mês') {
    if (desc.includes('andaime')) return 800;
    return 500; // generic mês fallback
  }

  // ─── vb (verba) estimates ──────────────────────────────────────────
  if (item.unidade === 'vb') {
    if (desc.includes('eletrica') || desc.includes('iluminacao')) return 8000;
    if (desc.includes('hidraulica') || desc.includes('hidrossanitaria')) return 6000;
    if (desc.includes('limpeza')) return 2000;
    if (desc.includes('mobilizacao') || desc.includes('desmobilizacao')) return 3000;
    return 2000; // generic vb fallback
  }

  return 150; // absolute fallback
}
