/**
 * P1.3: utilitários de detecção de duplicatas pós-merge entre chunks.
 *
 * Aplicado em mergeEngenheiroOutputs (chunking.ts) e mergeOrcamentistaOutputs
 * (budgetChunking.ts). Determinístico, roda em milissegundos.
 *
 * P2.6 estende com `findBudgetDuplicates` e `findInvalidSummaryItems`,
 * usadas pelo AuditorAgent para substituir a detecção via LLM.
 */

import type { BudgetItemDetail } from "../../shared/agents";

export interface DedupableItem {
  description: string;
  unit?: string;
  category?: string;
  quantity?: number;
  /**
   * Custo unitário (R$ / unit). Usado pelo match numérico junto com
   * `unit` e `quantity` — quando bate, é duplicata mesmo se a descrição
   * variar muito. Pega o caso "Aço CA-50 cortado/dobrado" vs "Aço CA-50
   * corte e dobra" (Jaccard ~0.4, abaixo do strictThreshold).
   */
  unitCostTotal?: number;
  itemNumber?: string;
  /** Itens "pai" hierárquicos (totalCost = soma dos filhos). Não devem
   *  ser misturados com filhos pelo similaridade. */
  isSummaryItem?: boolean;
}

export interface DuplicateRecord {
  keeperIndex: number;
  removedIndex: number;
  /**
   * Como a duplicata foi detectada:
   * - exact_match: descrição normalizada idêntica
   * - high_similarity: Jaccard ≥ strictThreshold
   * - numeric_match: unit + quantity + unitCost iguais (descrição pode
   *   variar bastante — pega split de chunking que reescreveu o texto)
   * - suspect_only_logged: Jaccard entre suspect e strict, não removido
   */
  reason:
    | "exact_match"
    | "high_similarity"
    | "numeric_match"
    | "suspect_only_logged";
  similarity: number;
  keeperDescription: string;
  removedDescription: string;
}

/**
 * Tolerância relativa pra comparar quantidades e custos unitários.
 * 1% absorve arredondamento entre chunks (LLM pode arredondar diferente)
 * sem perder precisão pra preço de obra civil.
 */
const NUMERIC_MATCH_TOLERANCE = 0.01;

/**
 * Verifica se dois números são iguais dentro da tolerância relativa.
 * Considera zero como caso especial — só "iguais" se ambos zero.
 */
function numbersClose(a: number | undefined, b: number | undefined): boolean {
  const na = Number(a ?? 0);
  const nb = Number(b ?? 0);
  if (na === 0 && nb === 0) return true;
  if (na === 0 || nb === 0) return false;
  const diff = Math.abs(na - nb);
  const max = Math.max(Math.abs(na), Math.abs(nb));
  return diff / max <= NUMERIC_MATCH_TOLERANCE;
}

/**
 * Threshold mínimo de similaridade textual pra o numericFingerprintsMatch
 * disparar. Protege contra falso positivo onde 2 itens têm coincidentemente
 * mesma unit + qty + unitCost mas são produtos completamente diferentes
 * (ex.: "Cimento CP-II saco 50kg" e "Areia média ensacada", ambos qty=10
 * saco R$35 — descrições com Jaccard 0, não devem virar duplicata).
 */
const NUMERIC_MATCH_MIN_TEXT_SIMILARITY = 0.3;

/**
 * Match numérico forte: mesma unit + mesma quantity + mesmo unitCostTotal +
 * similaridade textual mínima. Quando bate, é praticamente certeza de
 * duplicação — pega casos de chunking que regerou o item com texto
 * parafraseado (Jaccard baixo demais pro strictThreshold mas com alguma
 * sobreposição lexical).
 */
function numericFingerprintsMatch(
  a: DedupableItem,
  b: DedupableItem
): boolean {
  // Unit precisa estar definida em ambos pra fazer sentido
  if (!a.unit || !b.unit) return false;
  if (a.unit !== b.unit) return false;
  // Quantity > 0 obrigatório — itens com qty 0 são suspeitos de pai/header
  const qA = Number(a.quantity ?? 0);
  const qB = Number(b.quantity ?? 0);
  if (qA <= 0 || qB <= 0) return false;
  if (!numbersClose(qA, qB)) return false;
  // unitCostTotal > 0 obrigatório — sem custo unitário não dá pra ter certeza
  const cA = Number(a.unitCostTotal ?? 0);
  const cB = Number(b.unitCostTotal ?? 0);
  if (cA <= 0 || cB <= 0) return false;
  if (!numbersClose(cA, cB)) return false;
  // Pré-filtro textual: descartar pares completamente sem overlap lexical.
  // Tomada × Pintura com mesmos números coincidentes — não dispara.
  const sim = tokenSimilarity(a.description ?? "", b.description ?? "");
  if (sim < NUMERIC_MATCH_MIN_TEXT_SIMILARITY) return false;
  return true;
}

export interface DedupResult<T> {
  items: T[];
  duplicatesRemoved: DuplicateRecord[];
}

export interface DedupOptions {
  /** Similaridade ≥ strictThreshold + mesma unidade/categoria → remover. Default 0.85 */
  strictThreshold?: number;
  /** Similaridade ≥ suspectThreshold (e < strict) → apenas logar. Default 0.65 */
  suspectThreshold?: number;
}

/**
 * Normaliza uma descrição para comparação:
 * - lowercase
 * - remove acentos
 * - mantém apenas letras, números e espaço
 * - colapsa espaços
 */
export function normalizeDescription(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      // Remove diacríticos (combining marks U+0300 a U+036F) sem precisar
      // do flag /u (compatibilidade com target TS sem ES2018).
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Similaridade de Jaccard entre dois conjuntos de tokens.
 * Tokens com ≤ 2 caracteres são descartados (preposições, "de", "do" etc.).
 * Retorna 0..1 (1 = idêntico).
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(
    normalizeDescription(a)
      .split(" ")
      .filter(t => t.length > 2)
  );
  const tokensB = new Set(
    normalizeDescription(b)
      .split(" ")
      .filter(t => t.length > 2)
  );
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set(Array.from(tokensA).filter(t => tokensB.has(t)));
  const union = new Set([...Array.from(tokensA), ...Array.from(tokensB)]);
  // Similaridade fica não-confiável quando o vocabulário compartilhado é
  // pequeno (1 token só). Ex.: "Item A" / "Item B" / "Item C" todas teriam
  // sim=1 pelo único token "item". Forçamos 0 nesse caso — só o caminho
  // de match exato (string compare) trata esses casos.
  if (union.size < 2) return 0;
  return intersection.size / union.size;
}

/**
 * Detecta itens duplicados em uma lista. Política:
 *
 * - Pré-filtro: comparações só rolam quando unit e category coincidem (se
 *   ambos têm). Tomada elétrica em "Elétrica" não vira dup de tomada em
 *   "Hidráulica".
 * - Pré-filtro hierarquia: itens PAI (isSummaryItem=true) não são
 *   comparados com filhos — são removidos do conjunto comparado.
 * - Match exato (descrição normalizada idêntica + mesma unidade): mantém
 *   o de maior quantity, marca o outro como removido (reason="exact_match").
 * - Similaridade ≥ strictThreshold (default 0.85): mantém o primeiro,
 *   remove o resto (reason="high_similarity").
 * - Similaridade entre suspectThreshold e strictThreshold (default 0.65):
 *   NÃO remove, registra como "suspect_only_logged" para revisão humana.
 *
 * Itens com isSummaryItem=true sempre passam intactos pelo dedup.
 */
export function dedupItems<T extends DedupableItem>(
  items: T[],
  options: DedupOptions = {}
): DedupResult<T> {
  const strictThreshold = options.strictThreshold ?? 0.85;
  const suspectThreshold = options.suspectThreshold ?? 0.65;

  const removed: DuplicateRecord[] = [];

  // Separa pais (preservados intactos) dos filhos comparáveis.
  const summaryIndices: number[] = [];
  const indexed: Array<{ item: T; normalized: string; originalIndex: number }> =
    [];
  items.forEach((item, originalIndex) => {
    if (item.isSummaryItem) {
      summaryIndices.push(originalIndex);
    } else {
      indexed.push({
        item,
        normalized: normalizeDescription(item.description),
        originalIndex,
      });
    }
  });

  const consumed = new Set<number>();
  // Itens já decididos (consumidos OU promovidos a keeper). Evita double-push
  // quando o keeper muda mid-loop em match exato.
  const decided = new Set<number>();
  const kept: Array<{ item: T; originalIndex: number }> = [];

  for (let i = 0; i < indexed.length; i++) {
    if (decided.has(indexed[i].originalIndex)) continue;
    let keeper = indexed[i];

    for (let j = i + 1; j < indexed.length; j++) {
      const candidate = indexed[j];
      if (decided.has(candidate.originalIndex)) continue;
      if (consumed.has(candidate.originalIndex)) continue;

      // Pré-filtro: mesma unidade e categoria quando ambos definidos
      if (
        keeper.item.unit &&
        candidate.item.unit &&
        keeper.item.unit !== candidate.item.unit
      ) {
        continue;
      }
      if (
        keeper.item.category &&
        candidate.item.category &&
        keeper.item.category !== candidate.item.category
      ) {
        continue;
      }

      // Match exato — manter o de maior quantity
      if (keeper.normalized === candidate.normalized) {
        const keepQty = keeper.item.quantity ?? 0;
        const candQty = candidate.item.quantity ?? 0;
        if (candQty > keepQty) {
          consumed.add(keeper.originalIndex);
          decided.add(keeper.originalIndex);
          removed.push({
            keeperIndex: candidate.originalIndex,
            removedIndex: keeper.originalIndex,
            reason: "exact_match",
            similarity: 1,
            keeperDescription: candidate.item.description,
            removedDescription: keeper.item.description,
          });
          keeper = candidate;
        } else {
          consumed.add(candidate.originalIndex);
          decided.add(candidate.originalIndex);
          removed.push({
            keeperIndex: keeper.originalIndex,
            removedIndex: candidate.originalIndex,
            reason: "exact_match",
            similarity: 1,
            keeperDescription: keeper.item.description,
            removedDescription: candidate.item.description,
          });
        }
        continue;
      }

      // PR5a: match numérico forte — unit + quantity + unitCostTotal
      // idênticos (tolerância 1%). Pega casos de chunking que regerou
      // o item com descrição parafraseada (ex.: "Aço CA-50 cortado/dobrado"
      // vs "Aço CA-50 corte e dobra", Jaccard ~0.4, abaixo do strict).
      // Roda DEPOIS do match exato pra preservar a semântica do reason.
      if (numericFingerprintsMatch(keeper.item, candidate.item)) {
        consumed.add(candidate.originalIndex);
        decided.add(candidate.originalIndex);
        removed.push({
          keeperIndex: keeper.originalIndex,
          removedIndex: candidate.originalIndex,
          reason: "numeric_match",
          similarity: 1,
          keeperDescription: keeper.item.description,
          removedDescription: candidate.item.description,
        });
        continue;
      }

      const sim = tokenSimilarity(keeper.normalized, candidate.normalized);

      if (sim >= strictThreshold) {
        consumed.add(candidate.originalIndex);
        decided.add(candidate.originalIndex);
        removed.push({
          keeperIndex: keeper.originalIndex,
          removedIndex: candidate.originalIndex,
          reason: "high_similarity",
          similarity: sim,
          keeperDescription: keeper.item.description,
          removedDescription: candidate.item.description,
        });
      } else if (sim >= suspectThreshold) {
        // apenas registra — não consome
        removed.push({
          keeperIndex: keeper.originalIndex,
          removedIndex: candidate.originalIndex,
          reason: "suspect_only_logged",
          similarity: sim,
          keeperDescription: keeper.item.description,
          removedDescription: candidate.item.description,
        });
      }
    }

    decided.add(keeper.originalIndex);
    kept.push({ item: keeper.item, originalIndex: keeper.originalIndex });
  }

  // Reinsere itens summary no final, preservando ordem original do conjunto.
  const summaryItems = summaryIndices.map(idx => ({
    item: items[idx],
    originalIndex: idx,
  }));
  const allKept = [...kept, ...summaryItems].sort(
    (a, b) => a.originalIndex - b.originalIndex
  );

  return {
    items: allKept.map(k => k.item),
    duplicatesRemoved: removed,
  };
}

/**
 * Conta apenas remoções efetivas (exclui suspeitas que só foram logadas).
 */
export function countActualRemovals(records: DuplicateRecord[]): number {
  return records.filter(r => r.reason !== "suspect_only_logged").length;
}

export function countSuspects(records: DuplicateRecord[]): number {
  return records.filter(r => r.reason === "suspect_only_logged").length;
}

/**
 * P2.6: shape mínimo aceito por findBudgetDuplicates / findInvalidSummaryItems.
 * BudgetItemDetail não declara `isSummaryItem`, mas o runtime carrega esse
 * campo (vinda do Engenheiro/Orçamentista). Aceitamos qualquer item com
 * a forma necessária para o algoritmo decidir.
 */
export type AuditorBudgetItem = Partial<BudgetItemDetail> & {
  description: string;
  isSummaryItem?: boolean;
};

export interface DuplicateFinding {
  description: string;
  reason: string;
  estimatedImpact: number;
  similarItem?: { description: string; quantity: number; unit: string };
}

/**
 * P2.6: Detecta duplicatas no orçamento e retorna no formato de
 * `corrections.budgetItemsToRemove` esperado pelo AuditorOutput.
 *
 * Ignora "suspect_only_logged" — apenas remoções decididas viram findings.
 * Reutiliza `dedupItems` (P1.3) com thresholds calibrados para Auditor:
 * `strictThreshold=0.85`, `suspectThreshold=0.65` (mesmos defaults).
 */
export function findBudgetDuplicates(
  items: AuditorBudgetItem[]
): DuplicateFinding[] {
  if (items.length < 2) return [];
  const result = dedupItems(items, {
    strictThreshold: 0.85,
    suspectThreshold: 0.65,
  });
  const findings: DuplicateFinding[] = [];

  for (const removal of result.duplicatesRemoved) {
    if (removal.reason === "suspect_only_logged") continue;

    const removed = items[removal.removedIndex];
    const keeper = items[removal.keeperIndex];
    const qty = Number(removed.quantity ?? 0);
    const unitCost = Number(removed.unitCostTotal ?? 0);
    const estimatedImpact =
      qty > 0 && unitCost > 0 ? qty * unitCost : Number(removed.totalCost ?? 0);

    let reasonText: string;
    switch (removal.reason) {
      case "exact_match":
        reasonText = `Duplicata exata de "${keeper.description}"`;
        break;
      case "numeric_match":
        reasonText =
          `Mesma unidade, quantidade e custo unitário de "${keeper.description}" — ` +
          `provável duplicação gerada em chunks diferentes`;
        break;
      default:
        reasonText = `Alta similaridade (${(removal.similarity * 100).toFixed(0)}%) com "${keeper.description}"`;
    }

    findings.push({
      description: removed.description,
      reason: reasonText,
      estimatedImpact,
      similarItem: {
        description: keeper.description,
        quantity: Number(keeper.quantity ?? 0),
        unit: keeper.unit ?? "",
      },
    });
  }

  return findings;
}

/**
 * P2.6: Detecta itens-pai (`isSummaryItem=true`) com `totalCost > 0`.
 * Item pai deve ter custo zerado (custo está nos filhos); valor > 0
 * caracteriza dupla contabilização.
 */
export function findInvalidSummaryItems(
  items: AuditorBudgetItem[]
): DuplicateFinding[] {
  return items
    .filter(i => i.isSummaryItem === true && Number(i.totalCost ?? 0) > 0)
    .map(i => ({
      description: i.description,
      reason:
        "Item PAI (isSummaryItem=true) com custo diferente de zero — somar com filhos é duplicação",
      estimatedImpact: Number(i.totalCost ?? 0),
    }));
}
