/**
 * Chunking Strategy para Memoriais Grandes
 * 
 * Divide memoriais com muitos itens em chunks menores para evitar
 * truncamento de JSON quando o output excede o limite de tokens.
 * 
 * Usado principalmente pelo EngenheiroTecnicoAgent.
 */

import type { EngenheiroTecnicoInput, EngenheiroTecnicoOutput, MissingInfoRequest } from "../../shared/agents";
import { dedupItems, countActualRemovals, countSuspects } from "./dedupUtils";
import { logger, incrementStat } from "../utils/logger";

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
 *
 * O preâmbulo de instruções internas é crítico: sem ele, o LLM interpreta o
 * marcador "[PARTE 6 de 7]" como se fosse um humano pedindo as outras
 * partes — e responde com "por favor envie a parte 7 também". A instrução
 * deixa claro que cada chunk é processado independentemente e os outputs
 * são consolidados pelo backend.
 */
export function createChunkedInputs(
  input: EngenheiroTecnicoInput,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): EngenheiroTecnicoInput[] {
  const chunks = splitMemorialIntoChunks(input.memorialDescritivo, config);

  return chunks.map((chunk, index) => {
    const partNum = index + 1;
    const totalParts = chunks.length;
    const wrappedMemorial = `[CHUNK ${partNum}/${totalParts} — INSTRUÇÕES INTERNAS DO PIPELINE]

Este memorial foi dividido em ${totalParts} chunks para evitar truncamento por limite de tokens.
Você está processando o CHUNK ${partNum} de ${totalParts}. As outras partes JÁ ESTÃO sendo processadas separadamente em chamadas paralelas — o backend vai consolidar todos os outputs ao final.

REGRAS OBRIGATÓRIAS:
1. Processe APENAS os itens deste chunk como se fosse um memorial completo isolado.
2. NÃO peça as outras partes — elas estão sendo processadas em outros chunks por instâncias paralelas do mesmo agente.
3. NÃO mencione "parte X de Y" ou "trecho" no seu output. Campos como projectSummary.description, criticalNotes, observações etc DEVEM ignorar a divisão e descrever só o conteúdo presente neste chunk.
4. NÃO retorne analysisStatus="waiting_for_user_input" alegando que o memorial está incompleto por causa do chunking. Só use esse status se faltar informação técnica REAL (tipo de telha, dimensão, espec ausente etc).
5. Use itemNumber sequencial dentro do chunk (ex: 1.1, 1.2 ... 7.3). O merge final preserva os números relativos por chunk.

[FIM DAS INSTRUÇÕES INTERNAS — A SEGUIR O CONTEÚDO DO CHUNK]

${chunk}`;

    return {
      // Spread preserva campos meta (_projectId, _agentExecutionId) usados
      // pela telemetria do BaseAgent — campos com prefixo `_` não são
      // visíveis via tipos mas trafegam em runtime.
      ...input,
      memorialDescritivo: wrappedMemorial,
      location: input.location,
      restrictions: input.restrictions,
      userResponses: input.userResponses,
    };
  });
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

  // P1.3: dedup pós-merge entre chunks. Antes era só normalização de
  // description (case-insensitive); agora roda Jaccard com pré-filtro
  // por unidade/categoria + preserva itens summary intactos.
  const concatenated = outputs.flatMap(o => o.items ?? []);
  const dedup = dedupItems(concatenated);
  const removedCount = countActualRemovals(dedup.duplicatesRemoved);
  const suspectCount = countSuspects(dedup.duplicatesRemoved);

  if (concatenated.length > 0) {
    incrementStat("chunkMergesDeduped");
  }
  if (removedCount > 0) {
    logger.warn(
      `[ChunkMerge] Engenheiro: ${removedCount} duplicatas removidas`,
      { details: dedup.duplicatesRemoved.filter(d => d.reason !== "suspect_only_logged") }
    );
    incrementStat("duplicatesRemoved", removedCount);
  }
  if (suspectCount > 0) {
    logger.info(
      `[ChunkMerge] Engenheiro: ${suspectCount} suspeitas (não removidas)`,
      { details: dedup.duplicatesRemoved.filter(d => d.reason === "suspect_only_logged") }
    );
  }

  return {
    analysisStatus: outputs.every(o => o.analysisStatus === "completed")
      ? "completed"
      : "waiting_for_user_input",
    missingInfoRequests: deduplicateMissingInfo(
      outputs.flatMap(o => o.missingInfoRequests ?? [])
    ),
    items: dedup.items,
    pendingItems: Array.from(new Set(outputs.flatMap(o => o.pendingItems ?? []))),
    nbrReferences: Array.from(new Set(outputs.flatMap(o => o.nbrReferences ?? []))),
    criticalNotes: Array.from(new Set(outputs.flatMap(o => o.criticalNotes ?? []))),
    groupsProcessed: Array.from(new Set(outputs.flatMap(o => o.groupsProcessed ?? []))),
    totalItemsExtracted: outputs.reduce((sum, o) => sum + (o.totalItemsExtracted ?? 0), 0),
  };
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
