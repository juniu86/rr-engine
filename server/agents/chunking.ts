/**
 * Chunking Strategy para Memoriais Grandes
 * 
 * Divide memoriais com muitos itens em chunks menores para evitar
 * truncamento de JSON quando o output excede o limite de tokens.
 * 
 * Usado principalmente pelo EngenheiroTecnicoAgent.
 */

import type { EngenheiroTecnicoInput, EngenheiroTecnicoOutput, MemorialItem, MissingInfoRequest } from "../../shared/agents";

export interface ChunkConfig {
  /** Máximo de linhas por chunk (default: 20) */
  maxItemsPerChunk: number;
  /** Linhas de contexto sobrepostas entre chunks (default: 2) */
  overlapLines: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxItemsPerChunk: 20,
  overlapLines: 2,
};

/**
 * Estima se um memorial precisa de chunking com base no número de linhas não-vazias.
 * Threshold: 25 linhas (margem de segurança para ~20 itens de engenharia).
 */
export function needsChunking(memorial: string, threshold = 25): boolean {
  const lines = memorial.split('\n').filter(l => l.trim().length > 0);
  return lines.length > threshold;
}

/**
 * Divide o memorial em chunks com overlap para manter contexto entre partes.
 */
export function splitMemorialIntoChunks(
  memorial: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): string[] {
  const lines = memorial.split('\n').filter(l => l.trim().length > 0);
  
  if (lines.length <= config.maxItemsPerChunk) {
    return [memorial];
  }

  const chunks: string[] = [];
  const step = config.maxItemsPerChunk - config.overlapLines;

  for (let i = 0; i < lines.length; i += step) {
    const chunkLines = lines.slice(i, i + config.maxItemsPerChunk);
    chunks.push(chunkLines.join('\n'));
  }

  return chunks;
}

/**
 * Cria inputs individuais para cada chunk, preservando location e restrictions.
 */
export function createChunkedInputs(
  input: EngenheiroTecnicoInput,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): EngenheiroTecnicoInput[] {
  const chunks = splitMemorialIntoChunks(input.memorialDescritivo, config);

  return chunks.map((chunk, index) => ({
    // Spread preserva campos meta (_projectId, _agentExecutionId) usados
    // pela telemetria do BaseAgent — campos com prefixo `_` não são
    // visíveis via tipos mas trafegam em runtime.
    ...input,
    memorialDescritivo: `[PARTE ${index + 1} de ${chunks.length}]\n\n${chunk}`,
    location: input.location,
    restrictions: input.restrictions,
    userResponses: input.userResponses,
  }));
}

/**
 * Merge de múltiplos outputs do EngenheiroTecnico em um único output consolidado.
 * Deduplica itens pelo par (group + itemNumber).
 */
export function mergeEngenheiroOutputs(outputs: EngenheiroTecnicoOutput[]): EngenheiroTecnicoOutput {
  if (outputs.length === 0) {
    return {
      items: [],
      pendingItems: [],
      nbrReferences: [],
      criticalNotes: [],
      missingInfoRequests: [],
      analysisStatus: "completed",
      groupsProcessed: [],
      totalItemsExtracted: 0,
    };
  }

  if (outputs.length === 1) {
    return outputs[0];
  }

  return {
    analysisStatus: outputs.every(o => o.analysisStatus === "completed")
      ? "completed"
      : "waiting_for_user_input",
    missingInfoRequests: deduplicateMissingInfo(
      outputs.flatMap(o => o.missingInfoRequests ?? [])
    ),
    items: deduplicateItems(outputs.flatMap(o => o.items ?? [])),
    pendingItems: Array.from(new Set(outputs.flatMap(o => o.pendingItems ?? []))),
    nbrReferences: Array.from(new Set(outputs.flatMap(o => o.nbrReferences ?? []))),
    criticalNotes: Array.from(new Set(outputs.flatMap(o => o.criticalNotes ?? []))),
    groupsProcessed: Array.from(new Set(outputs.flatMap(o => o.groupsProcessed ?? []))),
    totalItemsExtracted: outputs.reduce((sum, o) => sum + (o.totalItemsExtracted ?? 0), 0),
  };
}

/**
 * Deduplica itens pelo par (group + itemNumber).
 * Em caso de duplicata, mantém o primeiro encontrado.
 */
function deduplicateItems(items: MemorialItem[]): MemorialItem[] {
  const seen = new Map<string, MemorialItem>();
  for (const item of items) {
    // Usa description como chave se não houver itemNumber
    const key = item.description.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplica solicitações de informação faltante pelo fieldId.
 */
function deduplicateMissingInfo(requests: MissingInfoRequest[]): MissingInfoRequest[] {
  const seen = new Map<string, MissingInfoRequest>();
  for (const req of requests) {
    if (!seen.has(req.fieldId)) {
      seen.set(req.fieldId, req);
    }
  }
  return Array.from(seen.values());
}
