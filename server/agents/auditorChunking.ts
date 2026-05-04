import type {
  AuditorInput,
  AuditorOutput,
  AuditorValidation,
} from "../../shared/agents";

/** Tamanho do chunk em itens. Ajustar com base em token usage real. */
export const CHUNK_SIZE = 60;

export interface ChunkInfo {
  index: number;
  total: number;
  isFirst: boolean;
}

/**
 * Decide se o input do Auditor é grande o suficiente para chunking.
 * Critério: número de itens do Orçamentista > CHUNK_SIZE.
 */
export function needsAuditorChunking(input: AuditorInput): boolean {
  const items = input.allAgentOutputs?.orcamentista?.budgetItems ?? [];
  return items.length > CHUNK_SIZE;
}

/**
 * Divide o input em N chunks de até CHUNK_SIZE itens cada. Cada chunk
 * preserva todos os outros agentOutputs (são pequenos) — só o array
 * `budgetItems` é particionado. Anexa metadata `_chunkInfo` para o
 * Auditor saber qual é o seu chunk e se as validações globais devem
 * rodar (apenas no primeiro).
 */
export function createAuditorChunkedInputs(
  input: AuditorInput
): AuditorInput[] {
  const allItems = input.allAgentOutputs.orcamentista?.budgetItems ?? [];
  if (allItems.length === 0) {
    return [input];
  }

  const total = Math.ceil(allItems.length / CHUNK_SIZE);
  const chunks: AuditorInput[] = [];

  for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
    const slice = allItems.slice(i, i + CHUNK_SIZE);
    const index = Math.floor(i / CHUNK_SIZE) + 1;
    const chunked: AuditorInput = {
      ...input,
      allAgentOutputs: {
        ...input.allAgentOutputs,
        orcamentista: {
          ...input.allAgentOutputs.orcamentista,
          budgetItems: slice,
        },
      },
    };
    (chunked as unknown as { _chunkInfo: ChunkInfo })._chunkInfo = {
      index,
      total,
      isFirst: index === 1,
    };
    chunks.push(chunked);
  }

  return chunks;
}

/**
 * Consolida outputs de N chunks em um único AuditorOutput.
 *
 * Regras:
 * - validations: concatenadas (cada chunk valida seus itens)
 * - crossAgentChecks: do primeiro chunk (validações globais só rodam ali)
 * - financialSummary: do primeiro chunk (calculado com totais agregados)
 * - deterministicValidation: do primeiro chunk (também global)
 * - validationScore: média aritmética
 * - criticalErrors / warnings: somados
 * - corrections: listas concatenadas, totalImpact recalculado, custos
 *   corrigidos do primeiro chunk
 * - auditSeal: pior caso ganha (rejected > approved_with_warnings > approved)
 * - isValid: true só se nenhum chunk reportou critical
 */
export function mergeAuditorOutputs(outputs: AuditorOutput[]): AuditorOutput {
  if (outputs.length === 0) {
    throw new Error("mergeAuditorOutputs: nenhum output para fazer merge");
  }
  if (outputs.length === 1) return outputs[0];

  const first = outputs[0];

  const validations: AuditorValidation[] = outputs.flatMap(
    o => o.validations ?? []
  );
  const crossAgentChecks = first.crossAgentChecks ?? [];
  const financialSummary = first.financialSummary;
  const deterministicValidation = first.deterministicValidation;

  const scores = outputs.map(o => o.validationScore ?? 0);
  const validationScore = Math.round(
    scores.reduce((s, x) => s + x, 0) / scores.length
  );

  const criticalErrors = outputs.reduce(
    (s, o) => s + (o.criticalErrors ?? 0),
    0
  );
  const warnings = outputs.reduce((s, o) => s + (o.warnings ?? 0), 0);

  const budgetItemsToRemove = outputs.flatMap(
    o => o.corrections?.budgetItemsToRemove ?? []
  );
  const logisticsToRemove = outputs.flatMap(
    o => o.corrections?.logisticsToRemove ?? []
  );
  const totalImpact =
    budgetItemsToRemove.reduce((s, c) => s + c.estimatedImpact, 0) +
    logisticsToRemove.reduce((s, c) => s + c.estimatedImpact, 0);

  // Pior caso ganha
  const sealRanking: AuditorOutput["auditSeal"][] = [
    "approved",
    "approved_with_warnings",
    "rejected",
  ];
  const auditSeal: AuditorOutput["auditSeal"] = outputs.reduce<
    AuditorOutput["auditSeal"]
  >((worst, o) => {
    const a = sealRanking.indexOf(worst);
    const b = sealRanking.indexOf(o.auditSeal);
    return b > a ? o.auditSeal : worst;
  }, "approved");

  return {
    ...first,
    validations,
    crossAgentChecks,
    financialSummary,
    deterministicValidation,
    validationScore,
    criticalErrors,
    warnings,
    isValid: criticalErrors === 0,
    auditSeal,
    auditNotes: `${first.auditNotes ?? ""}\n\n[merged from ${outputs.length} chunks]`,
    corrections: {
      budgetItemsToRemove,
      logisticsToRemove,
      totalImpact,
      correctedDirectCost: first.corrections?.correctedDirectCost ?? 0,
      correctedLogisticsCost: first.corrections?.correctedLogisticsCost ?? 0,
    },
  };
}
