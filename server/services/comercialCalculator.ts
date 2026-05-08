/**
 * Comercial determinístico — fórmula NBR 12721 (P0 BDI fix).
 *
 * Substitui o agente LLM. O cálculo segue a norma brasileira de orçamentação
 * de obras civis (NBR 12721 / ABNT):
 *
 *   BDI = ((1 + AC + S + R + G) × (1 + DF) × (1 + L)) / (1 − I) − 1
 *
 *   AC = Administração Central (%)
 *   S  = Seguros (%)
 *   R  = Riscos e Imprevistos (%)
 *   G  = Garantias (%)
 *   DF = Despesas Financeiras (%)
 *   L  = Lucro (%)
 *   I  = Tributos sobre o faturamento (%) — entra no denominador porque
 *        os tributos são "por dentro" do preço de venda.
 *
 *   finalPrice = custoBase × (1 + BDI)
 *
 * Tributos ficam **embutidos** no preço final automaticamente — o cliente
 * paga o preço cheio, a empresa recolhe o imposto sobre esse preço, e o
 * que sobra cobre custo + componentes + lucro. Não somar `totalTaxes` no
 * preço final depois — geraria duplo desconto.
 *
 * Custo de tokens cai a zero (verificável em P0.3 / agent_llm_calls).
 */

import type { ComercialInput, ComercialOutput } from "../../shared/agents";
import { resolveTaxRate } from "./taxRateResolver";
import type { CompanyTaxSettings } from "../../shared/types";

export interface CompanyBdiSettings {
  /** Lucro (%) — L na fórmula NBR. */
  lucroPercentual?: number;
  /** Administração Central (%) — AC na fórmula NBR. */
  adminCentralPercentual?: number;
  /** Despesas Financeiras (%) — DF na fórmula NBR. */
  despesasFinanceirasPercentual?: number;
  /** Riscos e Imprevistos (%) — R na fórmula NBR. */
  riscosPercentual?: number;
  /** Seguros (%) — S na fórmula NBR. */
  seguroPercentual?: number;
  /** Garantias (%) — G na fórmula NBR. */
  garantiaPercentual?: number;
}

export interface ComercialContext {
  /** Configurações dos componentes do BDI (vêm de company_settings). */
  companyBdiSettings?: CompanyBdiSettings;
  /** Configurações tributárias canônicas — usadas para resolver I. */
  taxSettings?: CompanyTaxSettings;
  /**
   * Override manual da alíquota I em pontos percentuais. Quando presente,
   * tem prioridade sobre o cálculo automático por regime.
   */
  taxRateOverridePercentual?: number | null;
}

const DEFAULTS = {
  lucro: 8,
  adminCentral: 4,
  despesasFinanceiras: 1,
  riscos: 1,
  seguros: 0.8,
  garantias: 0.4,
  taxRate: 0.08, // 8% — fallback quando não há taxSettings
};

/**
 * Calcula a saída do Comercial pela fórmula NBR 12721.
 *
 * Tributos ficam embutidos no preço final via denominador `1 − I`.
 * `totalBdiAmount = finalPrice − custoBase` representa todo o markup —
 * inclui componentes do BDI **e** tributos por dentro.
 */
export function computeComercial(
  input: ComercialInput,
  context: ComercialContext = {}
): ComercialOutput {
  const custoBase = input.totalDirectCost + input.totalIndirectCost;

  const ac =
    (context.companyBdiSettings?.adminCentralPercentual ?? DEFAULTS.adminCentral) /
    100;
  const df =
    (context.companyBdiSettings?.despesasFinanceirasPercentual ??
      DEFAULTS.despesasFinanceiras) / 100;
  const r =
    (context.companyBdiSettings?.riscosPercentual ?? DEFAULTS.riscos) / 100;
  const s =
    (context.companyBdiSettings?.seguroPercentual ?? DEFAULTS.seguros) / 100;
  const g =
    (context.companyBdiSettings?.garantiaPercentual ?? DEFAULTS.garantias) /
    100;
  const l =
    (context.companyBdiSettings?.lucroPercentual ?? DEFAULTS.lucro) / 100;

  // Resolve I (alíquota de tributos sobre faturamento).
  let iRate: number = DEFAULTS.taxRate;
  let iDescription = `Alíquota I = ${(DEFAULTS.taxRate * 100).toFixed(2)}% (fallback)`;
  if (context.taxSettings) {
    const resolved = resolveTaxRate({
      taxSettings: context.taxSettings,
      overridePercentual: context.taxRateOverridePercentual ?? null,
    });
    iRate = resolved.rate;
    iDescription = resolved.description;
  } else if (
    context.taxRateOverridePercentual !== undefined &&
    context.taxRateOverridePercentual !== null
  ) {
    iRate = context.taxRateOverridePercentual / 100;
    iDescription = `Alíquota I = ${context.taxRateOverridePercentual.toFixed(2)}% (override manual)`;
  }

  // Denominador da fórmula NBR — `1 − I` precisa ser positivo.
  const denominator = 1 - iRate;
  if (denominator <= 0) {
    throw new Error(
      `Alíquota I = ${(iRate * 100).toFixed(2)}% inviabiliza o cálculo (1 − I ≤ 0). ` +
        `Verifique a configuração tributária da empresa.`
    );
  }

  // Ajustes condicionais sobre componentes — refletem risco do projeto.
  // Mantemos os incrementos aplicados sobre Riscos e DF respectivamente
  // (em vez de sobre o BDI consolidado) pra preservar a estrutura NBR.
  let rAdjusted = r;
  let dfAdjusted = df;
  const ajustes: string[] = [];

  if (input.fiscalRisk === "high") {
    rAdjusted += 0.05; // +5pp em Riscos
    ajustes.push("+5pp em Riscos por risco fiscal alto");
  }
  if (input.logisticsComplexity === "high") {
    dfAdjusted += 0.05; // +5pp em Despesas Financeiras
    ajustes.push("+5pp em DF por complexidade logística alta");
  }

  // Fórmula NBR 12721.
  const baseBdi =
    ((1 + ac + s + r + g) * (1 + df) * (1 + l)) / denominator - 1;
  const adjustedBdi =
    ((1 + ac + s + rAdjusted + g) * (1 + dfAdjusted) * (1 + l)) / denominator -
    1;

  const totalBdiAmount = custoBase * adjustedBdi;
  const finalPrice = custoBase + totalBdiAmount;

  const componentLine =
    `Componentes: AC ${(ac * 100).toFixed(2)}%, S ${(s * 100).toFixed(2)}%, ` +
    `R ${(rAdjusted * 100).toFixed(2)}%, G ${(g * 100).toFixed(2)}%, ` +
    `DF ${(dfAdjusted * 100).toFixed(2)}%, L ${(l * 100).toFixed(2)}%. ${iDescription}.`;

  const ajustesLine =
    ajustes.length > 0 ? ` Ajustes aplicados: ${ajustes.join("; ")}.` : "";

  const justification =
    `BDI calculado pela fórmula NBR 12721 com tributos por dentro. ` +
    `BDI base ${(baseBdi * 100).toFixed(2)}%, BDI ajustado ${(adjustedBdi * 100).toFixed(2)}%. ` +
    componentLine +
    ajustesLine;

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
    baseBdi,
    adjustedBdi,
    bdiJustification: justification,
    totalBdiAmount,
    finalPrice,
    pricePerUnit,
  };
}
