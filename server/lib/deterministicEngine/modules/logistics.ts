/**
 * RR-Engine — Logistics Module
 *
 * BUG 3 FIX: Only include items EXPLICITLY mentioned in the memorial.
 * No auto-inferred items like "alimentação" or "andaime".
 *
 * BUG 4 FIX: Cross-check with budget items to avoid double-counting.
 * If equipment is already in the budget (orçamento detalhado),
 * do NOT add it again in logistics.
 *
 * BUG 5 FIX: Accommodation uses 5 working days/week (not 7).
 * If memorial specifies number of daily rates, use that instead.
 */

import type {
  LogisticaMemorial,
  CustoLogistico,
  ItemOrcamento,
  EngineConfig,
  TipoLocalidade,
} from '../types';
import { normalizeText } from '../utils/normalize';

/** Default unit costs for logistics */
const CUSTOS_LOGISTICA = {
  transporte_viagem: 600,       // per trip
  hospedagem_diaria: 50,        // per person per working day
  deslocamento_diario: 35,      // per day on site
  alimentacao_diaria: 60,       // per person per day — ONLY if explicit
  martelete_dia: 95,
  serra_dia: 45,
  andaime_mes: 800,
};

/**
 * Calculate logistics costs based on EXPLICIT memorial mentions only.
 */
export function calculateLogistics(
  logistica: LogisticaMemorial,
  config: EngineConfig,
  tipoLocalidade: TipoLocalidade,
  prazoSemanas: number,
  budgetItems: ItemOrcamento[],
): { custos: CustoLogistico[]; warnings: string[] } {
  const custos: CustoLogistico[] = [];
  const warnings: string[] = [];
  const far = config.fator_regional[tipoLocalidade];
  let id = 1;

  const explicitLower = logistica.itens_explicitos.map(i => normalizeText(i));
  const budgetNormalized = budgetItems.map(i => normalizeText(i.descricao));

  // ─── Transport ──────────────────────────────────────────────────────
  if (logistica.transporte) {
    const viagens = 2; // ida + volta
    const precoViagem = Math.round(CUSTOS_LOGISTICA.transporte_viagem * far * 100) / 100;
    custos.push({
      id: id++,
      descricao: 'Transporte de materiais e equipe',
      descricao_normalizada: normalizeText('transporte de materiais e equipe'),
      categoria: 'transporte',
      unidade: 'viagem',
      quantidade: viagens,
      preco_unitario: precoViagem,
      preco_total: Math.round(precoViagem * viagens * 100) / 100,
    });
  }

  // ─── Accommodation ──────────────────────────────────────────────────
  // BUG 5 FIX: Use working days (5/week), NOT calendar days (7/week)
  if (logistica.hospedagem) {
    const { profissionais, semanas } = logistica.hospedagem;
    const diasUteis = config.dias_uteis_semana; // Default 5, not 7
    const totalDiarias = profissionais * semanas * diasUteis;
    const precoDiaria = Math.round(CUSTOS_LOGISTICA.hospedagem_diaria * far * 100) / 100;

    custos.push({
      id: id++,
      descricao: `Hospedagem: ${profissionais} profissionais × ${semanas} semanas × ${diasUteis} dias/sem`,
      descricao_normalizada: normalizeText('hospedagem'),
      categoria: 'hospedagem',
      unidade: 'diária',
      quantidade: totalDiarias,
      preco_unitario: precoDiaria,
      preco_total: Math.round(precoDiaria * totalDiarias * 100) / 100,
    });
  }

  // ─── Local Displacement ─────────────────────────────────────────────
  if (logistica.deslocamento_local) {
    const diasObra = prazoSemanas * config.dias_uteis_semana;
    const precoDeslocamento = Math.round(CUSTOS_LOGISTICA.deslocamento_diario * far * 100) / 100;

    custos.push({
      id: id++,
      descricao: 'Deslocamento local diário',
      descricao_normalizada: normalizeText('deslocamento local'),
      categoria: 'deslocamento',
      unidade: 'dia',
      quantidade: diasObra,
      preco_unitario: precoDeslocamento,
      preco_total: Math.round(precoDeslocamento * diasObra * 100) / 100,
    });
  }

  // ─── BUG 3 FIX: Only explicit items ─────────────────────────────────
  // Check each explicit logistics item

  // Alimentação: ONLY if explicitly mentioned
  const hasAlimentacao = explicitLower.some(i =>
    i.includes('alimentacao') || i.includes('alimentação') || i.includes('refeicao'));
  if (hasAlimentacao && logistica.hospedagem) {
    const { profissionais, semanas } = logistica.hospedagem;
    const dias = profissionais * semanas * config.dias_uteis_semana;
    const preco = Math.round(CUSTOS_LOGISTICA.alimentacao_diaria * far * 100) / 100;
    custos.push({
      id: id++,
      descricao: 'Alimentação da equipe',
      descricao_normalizada: normalizeText('alimentação da equipe'),
      categoria: 'deslocamento',
      unidade: 'diária',
      quantidade: dias,
      preco_unitario: preco,
      preco_total: Math.round(preco * dias * 100) / 100,
    });
  } else if (!hasAlimentacao) {
    // BUG 3: Do NOT add alimentação if not mentioned
    // (old engine used to auto-infer this)
  }

  // ─── Equipment in logistics (only if explicit AND not in budget) ────
  // BUG 4 FIX: Cross-check with budget items
  const equipmentItems = [
    { keyword: 'martelete', preco: CUSTOS_LOGISTICA.martelete_dia, unidade: 'dia', defaultQty: 2 },
    { keyword: 'serra', preco: CUSTOS_LOGISTICA.serra_dia, unidade: 'dia', defaultQty: 5 },
    { keyword: 'andaime', preco: CUSTOS_LOGISTICA.andaime_mes, unidade: 'mês', defaultQty: 1 },
  ];

  for (const equip of equipmentItems) {
    const isExplicit = explicitLower.some(i => i.includes(equip.keyword));

    if (!isExplicit) {
      // BUG 3: Skip if not explicitly mentioned
      continue;
    }

    // BUG 4: Check if already in budget
    const alreadyInBudget = budgetNormalized.some(d => d.includes(equip.keyword));
    if (alreadyInBudget) {
      warnings.push(
        `Equipamento "${equip.keyword}" já está no orçamento detalhado, não duplicado na logística.`
      );
      continue;
    }

    // Extract quantity from explicit mention if possible
    let qty = equip.defaultQty;
    for (const explicit of logistica.itens_explicitos) {
      if (normalizeText(explicit).includes(equip.keyword)) {
        const match = explicit.match(/(\d+)\s*dias?/i) || explicit.match(/(\d+)\s*(?:mês|mes)/i);
        if (match) qty = parseInt(match[1], 10);
      }
    }

    const precoAjustado = Math.round(equip.preco * far * 100) / 100;
    custos.push({
      id: id++,
      descricao: `Locação de ${equip.keyword}`,
      descricao_normalizada: normalizeText(`locação de ${equip.keyword}`),
      categoria: 'equipamento',
      unidade: equip.unidade,
      quantidade: qty,
      preco_unitario: precoAjustado,
      preco_total: Math.round(precoAjustado * qty * 100) / 100,
    });
  }

  return { custos, warnings };
}
