/**
 * P1.2: Comercial determinístico — substitui o agente LLM.
 *
 * O agente Comercial original aplicava `precoFinal = custoBase × (1 + bdiAjustado)`
 * via prompt. A multiplicação não exige LLM. Esta função pura faz o mesmo cálculo
 * com BDI resolvido em ordem de prioridade e ajustes condicionais determinísticos.
 *
 * Custo de tokens cai a zero (verificável em P0.3 / agent_llm_calls).
 */

import type { ComercialInput, ComercialOutput } from "../../shared/agents";

/** Presets de BDI quando o projeto não define um valor numérico explícito. */
const BDI_PRESETS: Record<string, number> = {
  reduzido: 15,
  padrao: 25,
  majorado: 35,
  personalizado: 25, // se "personalizado" mas sem valor numérico, fallback
};

/**
 * P0 (07/05/2026) Bug projeto 12: BDI vinha como 0,13% no XLSX porque o valor
 * estava persistido em decimal (0.33) onde convenção do DB é percent (33.00).
 *
 * Normaliza um valor de BDI assumido em percent (33 = 33%):
 *   - null/undefined/NaN/0 → { value: null } (caller decide fallback)
 *   - 0 < x < 1 → assume confusão decimal-como-percent, multiplica por 100
 *   - 1 ≤ x ≤ 200 → mantém
 *   - x > 200 → clamp para null (BDI > 200% é implausível, provavelmente erro)
 *
 * Retorna o valor normalizado em percent + warning quando ajustou.
 */
export function normalizeBdiPercent(
  raw: number | string | null | undefined,
  label = "bdi"
): { value: number | null; warning?: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null };
  }
  const num = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(num) || num === 0) {
    return { value: null };
  }
  if (num < 0) {
    return {
      value: null,
      warning: `[${label}] BDI negativo (${num}) ignorado.`,
    };
  }
  if (num < 1) {
    const corrected = num * 100;
    return {
      value: corrected,
      warning: `[${label}] BDI ${num} parece decimal (esperado percent, ex: 33). Normalizado para ${corrected}%.`,
    };
  }
  if (num > 200) {
    return {
      value: null,
      warning: `[${label}] BDI ${num}% > 200% — descartado como input inválido.`,
    };
  }
  return { value: num };
}

export interface CompanyBdiSettings {
  bdiPercentual: number;
  lucroPercentual?: number;
  adminCentralPercentual?: number;
  despesasFinanceirasPercentual?: number;
  riscosPercentual?: number;
}

export interface ComercialContext {
  /** BDI numérico explícito do projeto (em %). Tem prioridade sobre presets. */
  projectBdi?: number;
  /** Preset textual (reduzido/padrão/majorado/personalizado). */
  bdiPreset?: keyof typeof BDI_PRESETS | string;
  /** Configurações de BDI da empresa (fallback). */
  companyBdiSettings?: CompanyBdiSettings;
}

/**
 * Calcula a saída do Comercial de forma 100% determinística.
 *
 * Resolução do BDI base (ordem de prioridade):
 *   1. context.projectBdi (numérico)
 *   2. BDI_PRESETS[context.bdiPreset]
 *   3. context.companyBdiSettings.bdiPercentual
 *   4. 25 (fallback final)
 *
 * Ajustes condicionais aplicados sobre o BDI base:
 *   - +5% se input.fiscalRisk === "high"
 *   - +5% se input.logisticsComplexity === "high"
 *
 * @returns ComercialOutput exatamente no shape declarado em shared/agents.ts.
 */
export function computeComercial(
  input: ComercialInput,
  context: ComercialContext = {}
): ComercialOutput {
  const custoBase = input.totalDirectCost + input.totalIndirectCost;

  const presetValue =
    context.bdiPreset && context.bdiPreset in BDI_PRESETS
      ? BDI_PRESETS[context.bdiPreset]
      : undefined;

  const projectBdiNorm = normalizeBdiPercent(context.projectBdi, "projectBdi");
  if (projectBdiNorm.warning) console.warn(projectBdiNorm.warning);
  const companyBdiNorm = normalizeBdiPercent(
    context.companyBdiSettings?.bdiPercentual,
    "companyBdi"
  );
  if (companyBdiNorm.warning) console.warn(companyBdiNorm.warning);

  const baseBdi =
    projectBdiNorm.value ?? presetValue ?? companyBdiNorm.value ?? 25;

  const ajustes: string[] = [];
  let bdiAjustado = baseBdi;

  if (input.fiscalRisk === "high") {
    bdiAjustado += 5;
    ajustes.push("+5% por risco fiscal alto");
  }
  if (input.logisticsComplexity === "high") {
    bdiAjustado += 5;
    ajustes.push("+5% por complexidade logística alta");
  }

  const bdiDecimal = bdiAjustado / 100;
  const totalBdiAmount = custoBase * bdiDecimal;
  const finalPrice = custoBase + totalBdiAmount;

  const justification =
    ajustes.length === 0
      ? `BDI base de ${baseBdi}% aplicado sem ajustes adicionais.`
      : `BDI base de ${baseBdi}% com ajustes: ${ajustes.join(", ")}. BDI final: ${bdiAjustado}%.`;

  // pricePerUnit: agrupa quantitativos por unidade e divide o preço final
  // proporcionalmente. Mantém o shape original (Record<unit, preço>).
  const pricePerUnit: Record<string, number> = {};
  if (input.budgetItems && input.budgetItems.length > 0) {
    const totalQtyByUnit: Record<string, number> = {};
    for (const item of input.budgetItems) {
      if (!item.unit) continue;
      totalQtyByUnit[item.unit] =
        (totalQtyByUnit[item.unit] ?? 0) + (item.quantity ?? 0);
    }
    for (const unit of Object.keys(totalQtyByUnit)) {
      const qty = totalQtyByUnit[unit];
      pricePerUnit[unit] = qty > 0 ? finalPrice / qty : 0;
    }
  }

  return {
    baseBdi: baseBdi / 100,
    adjustedBdi: bdiAjustado / 100,
    bdiJustification: justification,
    totalBdiAmount,
    finalPrice,
    pricePerUnit,
  };
}
