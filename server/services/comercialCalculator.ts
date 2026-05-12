/**
 * Comercial determinístico — BDI "tudo por dentro" (P0 12/05/2026).
 *
 * Substituiu a fórmula NBR 12721 cascata por uma visão financeira:
 * **todos** os componentes (Lucro, AC, DF, Riscos, Seguros, Garantias e
 * Tributos) são percentuais do **preço de venda**, não do custo.
 *
 *   PV = Custo / (1 − L − AC − DF − R − S − G − I)
 *   BDI = PV / Custo − 1 = totalRate / (1 − totalRate)
 *
 *   L  = Lucro (%)
 *   AC = Administração Central (%)
 *   DF = Despesas Financeiras (%)
 *   R  = Riscos e Imprevistos (%)
 *   S  = Seguros (%)
 *   G  = Garantias (%)
 *   I  = Tributos sobre o faturamento (%)
 *
 *   finalPrice = custoBase × (1 + BDI)
 *
 * Justificativa: a reunião de board olha o P&L do contrato como
 * % do faturamento — cada linha (lucro, tributos, etc.) sai como
 * fatia do preço final, não múltiplo do custo. A fórmula NBR cascata
 * aplica AC/S/R/G sobre o custo e L sobre o custo já carregado, o
 * que não bate quando você decompõe o preço final linha a linha.
 *
 * Gate de viabilidade: a soma dos componentes precisa ficar < 95%.
 * Acima disso o BDI passa de 1.900% e fica claramente quebrado —
 * normalmente é erro de digitação ou regime fiscal mal configurado.
 *
 * Tributos continuam **embutidos** no preço final automaticamente —
 * o cliente paga o preço cheio, a empresa recolhe I × PV. Não somar
 * `totalTaxes` no preço final depois — geraria duplo desconto.
 *
 * Custo de tokens: zero (pure function, sem invokeLLM).
 */

import type { ComercialInput, ComercialOutput } from "../../shared/agents";
import { resolveTaxRate } from "./taxRateResolver";
import type { CompanyTaxSettings } from "../../shared/types";

export interface CompanyBdiSettings {
  /** Lucro (%) — L. */
  lucroPercentual?: number;
  /** Administração Central (%) — AC. */
  adminCentralPercentual?: number;
  /** Despesas Financeiras (%) — DF. */
  despesasFinanceirasPercentual?: number;
  /** Riscos e Imprevistos (%) — R. */
  riscosPercentual?: number;
  /** Seguros (%) — S. */
  seguroPercentual?: number;
  /** Garantias (%) — G. */
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

/** Soma máxima de componentes permitida (em fração). Acima disso o BDI
 *  explode e o cálculo perde sentido prático. */
const MAX_TOTAL_RATE = 0.95;

/**
 * Calcula a saída do Comercial pela fórmula "tudo por dentro".
 *
 * Todos os componentes são percentuais do preço de venda. O markup
 * (`totalBdiAmount = finalPrice − custoBase`) representa a soma de
 * todos os componentes em R$, e bate exatamente quando o board
 * decompõe o preço final aplicando os percentuais.
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

  // Ajustes condicionais sobre componentes — refletem risco do projeto.
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

  // Soma total dos componentes (em fração). Cada um é % do preço de venda.
  const totalRateBase = l + ac + df + r + s + g + iRate;
  const totalRateAdjusted = l + ac + dfAdjusted + rAdjusted + s + g + iRate;

  // Gate de viabilidade: soma ≥ 95% inviabiliza o cálculo.
  if (totalRateAdjusted >= MAX_TOTAL_RATE) {
    const breakdown =
      `L ${(l * 100).toFixed(2)}% + AC ${(ac * 100).toFixed(2)}% + ` +
      `DF ${(dfAdjusted * 100).toFixed(2)}% + R ${(rAdjusted * 100).toFixed(2)}% + ` +
      `S ${(s * 100).toFixed(2)}% + G ${(g * 100).toFixed(2)}% + ` +
      `I ${(iRate * 100).toFixed(2)}% = ${(totalRateAdjusted * 100).toFixed(2)}%`;
    throw new Error(
      `Soma dos componentes do BDI atingiu ${(totalRateAdjusted * 100).toFixed(2)}%, ` +
        `acima do limite de ${(MAX_TOTAL_RATE * 100).toFixed(0)}%. ` +
        `Reveja as configurações de BDI e o regime tributário. Composição: ${breakdown}.`
    );
  }

  // BDI = totalRate / (1 − totalRate). Equivalente a PV/Custo − 1.
  const baseBdi = totalRateBase / (1 - totalRateBase);
  const adjustedBdi = totalRateAdjusted / (1 - totalRateAdjusted);

  const totalBdiAmount = custoBase * adjustedBdi;
  const finalPrice = custoBase + totalBdiAmount;

  const componentLine =
    `Componentes (% do preço de venda): L ${(l * 100).toFixed(2)}%, ` +
    `AC ${(ac * 100).toFixed(2)}%, DF ${(dfAdjusted * 100).toFixed(2)}%, ` +
    `R ${(rAdjusted * 100).toFixed(2)}%, S ${(s * 100).toFixed(2)}%, ` +
    `G ${(g * 100).toFixed(2)}%. ${iDescription}.`;

  const ajustesLine =
    ajustes.length > 0 ? ` Ajustes aplicados: ${ajustes.join("; ")}.` : "";

  const justification =
    `BDI calculado pela fórmula "tudo por dentro" — cada componente é ` +
    `percentual do preço de venda. ` +
    `BDI base ${(baseBdi * 100).toFixed(2)}%, BDI ajustado ${(adjustedBdi * 100).toFixed(2)}%. ` +
    `Soma dos componentes ${(totalRateAdjusted * 100).toFixed(2)}% do PV. ` +
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
    // Componentes em pontos percentuais (8 = 8%) — todos relativos ao PV.
    componentsApplied: {
      lucroPercentual: l * 100,
      adminCentralPercentual: ac * 100,
      despesasFinanceirasPercentual: dfAdjusted * 100,
      riscosPercentual: rAdjusted * 100,
      seguroPercentual: s * 100,
      garantiaPercentual: g * 100,
      aliquotaTributos: iRate * 100,
      aliquotaTributosSource: iDescription,
      ajustesAplicados: ajustes,
    },
  };
}
