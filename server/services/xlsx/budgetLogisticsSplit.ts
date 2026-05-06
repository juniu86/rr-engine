/**
 * P2 XLSX refactor — separa itens logísticos do orçamento detalhado.
 *
 * Sintoma diagnosticado em Hangar Avjet: a aba "Custos Logísticos"
 * saía vazia mesmo quando havia itens dispersos no Orçamento Detalhado
 * com cara de logística (containers, caçambas, taxa horário aeroportuário,
 * estacionamento). Manus consolidava isso em aba dedicada com 5 itens
 * R$ 72k; o Engine misturava com budget items.
 *
 * Este módulo:
 * (a) Detecta itens em `budgetItems` que sobrepõem com `logisticsCosts`
 *     por description normalizada (Jaccard ≥ 0.85) e os REMOVE do
 *     orçamento detalhado — devem aparecer só na aba dedicada.
 * (b) Detecta itens em `budgetItems` que NÃO estão em `logisticsCosts`
 *     mas têm cara de logística (palavras-chave) e os PROMOVE para a
 *     aba de logística — fonte secundária quando o agente Logística
 *     não capturou tudo.
 */

import { normalizeDescription, tokenSimilarity } from "../../agents/dedupUtils";

interface BudgetItemMin {
  description: string;
  category?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unitCostTotal?: number | string | null;
  totalCost?: number | string | null;
}

interface LogisticsCostMin {
  category?: string | null;
  description: string;
  unit?: string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
}

/**
 * Limiar mínimo de similaridade para considerar overlap entre as duas
 * listas. Mais agressivo (0.6) que o threshold default do dedupItems
 * (0.85): aqui o impacto de um falso positivo é só "item moveu de
 * aba", não "item perdido". Pegamos casos como "Caçambas DE entulho"
 * vs "Caçambas PARA entulho" — Jaccard ~0.67 (filtro >2 chars descarta
 * "de", mantém "para"), abaixo do default mas ainda mesmo serviço.
 */
const OVERLAP_THRESHOLD = 0.6;

/**
 * Palavras-chave (já normalizadas, sem acento) que sinalizam que um item
 * orçamentário pertence à categoria logística — frete, container, caçamba,
 * taxa de obra etc. Lista alinhada com `mapLogisticsCategory` em
 * agentPersistence.ts e deve evoluir junto.
 */
const LOGISTICS_KEYWORDS = [
  "frete",
  "transporte",
  "cacamba",
  "container",
  "munck",
  "icamento",
  "guindaste",
  "estacionamento",
  "hospedagem",
  "hotel",
  "alimentacao",
  "refeicao",
  "deslocamento",
  "viagem",
  "bota fora",
  "entulho",
  "destinacao residuo",
  "taxa horario",
  "taxa noturna",
];

const looksLikeLogistics = (s: string): boolean => {
  const norm = normalizeDescription(s);
  return LOGISTICS_KEYWORDS.some(kw => norm.includes(kw));
};

export interface BudgetLogisticsSplit<T extends BudgetItemMin> {
  /** Items que ficam no Orçamento Detalhado (após filtro). */
  cleanBudgetItems: T[];
  /** Items logísticos consolidados (originais de `logisticsCosts` + promovidos do orçamento). */
  consolidatedLogistics: LogisticsCostMin[];
  /** Estatísticas de remoção para logging. */
  stats: {
    movedFromBudget: number;
    duplicatesRemoved: number;
    originalLogisticsCount: number;
  };
}

/**
 * Separa logística de orçamento. Retorna lista limpa de budget items e
 * lista consolidada de logísticos (sem duplicatas).
 */
export function splitBudgetAndLogistics<T extends BudgetItemMin>(
  budgetItems: T[],
  logisticsCosts: LogisticsCostMin[]
): BudgetLogisticsSplit<T> {
  const consolidated: LogisticsCostMin[] = [...logisticsCosts];
  const movedFromBudget: T[] = [];
  const cleanBudgetItems: T[] = [];

  for (const b of budgetItems) {
    const desc = b.description || "";

    // (a) Overlap com algum item já em logisticsCosts → remove do orçamento.
    const dup = logisticsCosts.find(
      l => tokenSimilarity(desc, l.description || "") >= OVERLAP_THRESHOLD
    );
    if (dup) {
      movedFromBudget.push(b);
      continue;
    }

    // (b) Cara de logística mas não estava em logisticsCosts → promove.
    if (looksLikeLogistics(desc) || looksLikeLogistics(b.category || "")) {
      const qty = Number(b.quantity ?? 0);
      const unitCost = Number(b.unitCostTotal ?? 0);
      const total = Number(b.totalCost ?? qty * unitCost);
      consolidated.push({
        category: b.category || "outros",
        description: desc,
        unit: b.unit || "un",
        quantity: qty,
        unitCost: unitCost,
        totalCost: total,
      });
      movedFromBudget.push(b);
      continue;
    }

    cleanBudgetItems.push(b);
  }

  // Dedup interno do consolidated (algum item em logisticsCosts pode ter
  // vindo igual em budgetItems já existente lá).
  const seen = new Set<string>();
  const deduped: LogisticsCostMin[] = [];
  let duplicatesRemoved = 0;
  for (const l of consolidated) {
    const key = normalizeDescription(l.description || "");
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    deduped.push(l);
  }

  return {
    cleanBudgetItems,
    consolidatedLogistics: deduped,
    stats: {
      movedFromBudget: movedFromBudget.length,
      duplicatesRemoved,
      originalLogisticsCount: logisticsCosts.length,
    },
  };
}
