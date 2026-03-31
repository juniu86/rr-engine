/**
 * Chunking Strategy para Orçamentos Grandes ("Frentes Paralelas")
 *
 * Divide orçamentos com muitos itens em frentes por disciplina de construção
 * (Estrutura, Cobertura, Elétrica, etc.) para evitar truncamento/500 quando
 * o payload JSON excede limites de tokens do LLM.
 *
 * Usado pelo OrcamentistaAgent.execute() — análogo a chunking.ts do Engenheiro.
 */

import type { OrcamentistaInput, OrcamentistaOutput, MemorialItem } from "../../shared/agents";
import { filterItemsForPricing } from "../utils/hierarchy";
import { normalizeForDedup } from "../services/agentPersistence";

export interface BudgetChunkConfig {
  /** Máximo de itens por chunk (default: 25) */
  maxItemsPerChunk: number;
  /** Mínimo de itens por chunk — grupos menores são mesclados (default: 5) */
  minItemsPerChunk: number;
}

const DEFAULT_CONFIG: BudgetChunkConfig = {
  maxItemsPerChunk: 25,
  minItemsPerChunk: 5,
};

/**
 * Verifica se o orçamento precisa de chunking.
 * Threshold default: 30 itens.
 */
export function needsBudgetChunking(items: any[], threshold = 30): boolean {
  return Array.isArray(items) && items.length > threshold;
}

/**
 * Extrai o prefixo top-level do campo `group` de um item.
 * Ex: "3. Cobertura" → "3", "5.1 Instalações Elétricas" → "5"
 * Fallback: retorna "__ungrouped__" se group ausente.
 */
function getGroupPrefix(item: any): string {
  const group = (item as any).group;
  if (!group || typeof group !== "string") return "__ungrouped__";

  // Extrair número antes do primeiro "." ou espaço
  const match = group.match(/^(\d+)/);
  return match ? match[1] : group.trim().split(/[\s.]/)[0] || "__ungrouped__";
}

/**
 * Agrupa itens por disciplina (top-level group).
 * Mantém pais (isSummaryItem=true) junto com seus filhos.
 * Preserva a ordem original dentro de cada grupo.
 */
export function groupItemsByFront(items: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();

  for (const item of items) {
    const prefix = getGroupPrefix(item);
    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(item);
  }

  return groups;
}

/**
 * Divide itens em chunks balanceados respeitando fronteiras de grupo.
 *
 * 1. Agrupa por disciplina (via group field)
 * 2. Mescla grupos pequenos (<minItems) com adjacentes
 * 3. Divide grupos enormes (>maxItems) em sub-chunks, injetando PAI no início de cada sub-chunk
 * 4. Fallback: se todos __ungrouped__, divide sequencialmente
 */
export function splitItemsIntoFronts(
  items: any[],
  config: BudgetChunkConfig = DEFAULT_CONFIG,
): any[][] {
  if (items.length <= config.maxItemsPerChunk) {
    return [items];
  }

  const groups = groupItemsByFront(items);

  // Fallback: se quase tudo ungrouped, dividir sequencialmente
  const ungrouped = groups.get("__ungrouped__") || [];
  if (ungrouped.length > items.length * 0.7) {
    return splitSequentially(items, config.maxItemsPerChunk);
  }

  // Processar grupos ordenados pelo número
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "__ungrouped__") return 1;
    if (b === "__ungrouped__") return -1;
    return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
  });

  const chunks: any[][] = [];
  let currentChunk: any[] = [];
  let currentFrontNames: string[] = [];

  for (const key of sortedKeys) {
    const groupItems = groups.get(key)!;

    // Grupo enorme: dividir em sub-chunks com PAI injetado (Ajuste 2)
    if (groupItems.length > config.maxItemsPerChunk) {
      // Flush current chunk first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentFrontNames = [];
      }

      const subChunks = splitLargeGroup(groupItems, config.maxItemsPerChunk);
      chunks.push(...subChunks);
      continue;
    }

    // Grupo cabe no chunk atual?
    if (currentChunk.length + groupItems.length <= config.maxItemsPerChunk) {
      currentChunk.push(...groupItems);
      currentFrontNames.push(key);
    } else {
      // Flush e iniciar novo chunk
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [...groupItems];
      currentFrontNames = [key];
    }
  }

  // Flush último chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // Mesclar chunks muito pequenos com adjacentes
  return mergeSmallChunks(chunks, config);
}

/**
 * Divide grupo grande em sub-chunks, injetando itens PAI no início
 * de cada sub-chunk subsequente (Ajuste 2).
 */
function splitLargeGroup(groupItems: any[], maxItems: number): any[][] {
  const parentItems = groupItems.filter(i => (i as any).isSummaryItem === true);
  const childItems = groupItems.filter(i => (i as any).isSummaryItem !== true);

  const subChunks: any[][] = [];
  // Reserve space for parent items in subsequent chunks
  const effectiveMax = maxItems - parentItems.length;
  const chunkSize = effectiveMax > 0 ? effectiveMax : maxItems;

  for (let i = 0; i < childItems.length; i += chunkSize) {
    const slice = childItems.slice(i, i + chunkSize);

    if (i === 0) {
      // First sub-chunk: include parents naturally
      subChunks.push([...parentItems, ...slice]);
    } else {
      // Subsequent sub-chunks: inject PAI copies for context
      subChunks.push([...parentItems, ...slice]);
    }
  }

  return subChunks;
}

/**
 * Divisão sequencial (fallback quando group está ausente).
 */
function splitSequentially(items: any[], maxItems: number): any[][] {
  const chunks: any[][] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    chunks.push(items.slice(i, i + maxItems));
  }
  return chunks;
}

/**
 * Mescla chunks muito pequenos com seus vizinhos.
 */
function mergeSmallChunks(chunks: any[][], config: BudgetChunkConfig): any[][] {
  if (chunks.length <= 1) return chunks;

  const result: any[][] = [];
  let buffer: any[] = [];

  for (const chunk of chunks) {
    if (buffer.length + chunk.length <= config.maxItemsPerChunk) {
      buffer.push(...chunk);
    } else {
      if (buffer.length > 0) {
        result.push(buffer);
      }
      buffer = [...chunk];
    }
  }

  if (buffer.length > 0) {
    // If buffer is too small and we have a previous chunk, merge with it
    if (buffer.length < config.minItemsPerChunk && result.length > 0) {
      const last = result[result.length - 1];
      if (last.length + buffer.length <= config.maxItemsPerChunk * 1.2) {
        result[result.length - 1] = [...last, ...buffer];
      } else {
        result.push(buffer);
      }
    } else {
      result.push(buffer);
    }
  }

  return result;
}

/**
 * Gera nome descritivo para uma frente a partir dos itens.
 * Ex: "Frente 3. Cobertura" ou "Frente Mista (Estrutura + Elétrica)"
 */
function getFrontName(items: any[]): string {
  const groups = new Set<string>();
  for (const item of items) {
    const group = (item as any).group;
    if (group && typeof group === "string") {
      groups.add(group.split(/\s*[-–]\s*/)[0].trim());
    }
  }

  const names = Array.from(groups).slice(0, 3);
  if (names.length === 0) return "Itens Diversos";
  if (names.length === 1) return names[0];
  return `Mista (${names.join(" + ")})`;
}

/**
 * Cria inputs individuais do Orçamentista para cada frente.
 * Adiciona _chunkInfo metadata para contexto no getUserPrompt.
 */
export function createOrcamentistaChunkedInputs(
  input: OrcamentistaInput,
  config: BudgetChunkConfig = DEFAULT_CONFIG,
): OrcamentistaInput[] {
  const fronts = splitItemsIntoFronts(input.items, config);

  return fronts.map((frontItems, index) => {
    const chunkedInput: OrcamentistaInput = {
      items: frontItems as MemorialItem[],
      logisticsCosts: input.logisticsCosts,
      region: input.region,
    };

    // Attach chunk metadata (accessed via (input as any)._chunkInfo in getUserPrompt)
    (chunkedInput as any)._chunkInfo = {
      index: index + 1,
      total: fronts.length,
      frontName: getFrontName(frontItems),
    };

    return chunkedInput;
  });
}

/**
 * Merge de múltiplos outputs do Orçamentista em um output consolidado.
 *
 * - Concatena budgetItems de todas as frentes
 * - Dedup por description+unit+category (mesma chave que agentPersistence.ts)
 * - Recalcula totalDirectCost via filterItemsForPricing (consistência com validateAgentCoherence)
 * - Union de curvaAItems e curvaCItems
 */
export function mergeOrcamentistaOutputs(outputs: OrcamentistaOutput[]): OrcamentistaOutput {
  if (outputs.length === 0) {
    return {
      budgetItems: [],
      totalDirectCost: 0,
      totalIndirectCost: 0,
      curvaAItems: [],
      curvaCItems: [],
    };
  }

  if (outputs.length === 1) {
    return outputs[0];
  }

  // Concatenar todos os budgetItems
  const allItems = outputs.flatMap(o => o.budgetItems || []);

  // Dedup por description+unit+category (safety net — chunks processam itens distintos por design)
  // Exceção: itens PAI duplicados do Ajuste 2 são removidos aqui
  const dedupedItems = deduplicateBudgetItems(allItems);

  // Recalcular totalDirectCost via filterItemsForPricing (Ajuste 1)
  const pricingItems = filterItemsForPricing(dedupedItems as any[]);
  const totalDirectCost = pricingItems.reduce(
    (sum, item: any) => sum + (Number(item.totalCost) || 0),
    0,
  );

  // Somar totalIndirectCost de todas as frentes
  const totalIndirectCost = outputs.reduce(
    (sum, o) => sum + (Number(o.totalIndirectCost) || 0),
    0,
  );

  // Union de curva A/C
  const curvaAItems = Array.from(
    new Set(outputs.flatMap(o => o.curvaAItems || [])),
  );
  const curvaCItems = Array.from(
    new Set(outputs.flatMap(o => o.curvaCItems || [])),
  );

  console.log(
    `[BudgetChunking] Merge: ${allItems.length} itens → ${dedupedItems.length} após dedup. ` +
    `totalDirectCost: R$ ${totalDirectCost.toFixed(2)}`,
  );

  return {
    budgetItems: dedupedItems,
    totalDirectCost,
    totalIndirectCost,
    curvaAItems,
    curvaCItems,
  };
}

/**
 * Deduplica budgetItems por chave composta description+unit+category.
 * Mantém o item com maior totalCost em caso de duplicata.
 */
function deduplicateBudgetItems(items: any[]): any[] {
  const seen = new Map<string, { item: any; index: number }>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const desc = normalizeForDedup(item.description || "");
    const unit = (item.unit || "").toLowerCase();
    const category = (item.category || "").toLowerCase();
    const key = `${desc}|${unit}|${category}`;

    const existing = seen.get(key);
    if (existing) {
      // Keep item with higher totalCost (same logic as agentPersistence.ts)
      const existingCost = Number(existing.item.totalCost) || 0;
      const newCost = Number(item.totalCost) || 0;

      if (newCost > existingCost) {
        seen.set(key, { item, index: i });
      }
    } else {
      seen.set(key, { item, index: i });
    }
  }

  // Return in original order
  return Array.from(seen.values())
    .sort((a, b) => a.index - b.index)
    .map(v => v.item);
}
