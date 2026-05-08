/**
 * Resolve a alíquota efetiva de tributos (I) para a fórmula NBR 12721.
 *
 * Convenção da norma: I é a alíquota dos tributos *sobre o preço de venda*
 * (faturamento). Entra no denominador da fórmula:
 *
 *   BDI = ((1 + AC + S + R + G) × (1 + DF) × (1 + L)) / (1 − I) − 1
 *
 * Por isso "tributos por dentro": o cliente paga preço cheio, a empresa
 * recolhe o imposto sobre esse preço, e o que sobra cobre custo + lucro.
 *
 * Estratégia por regime fiscal:
 *
 * - simples_nacional → alíquota da faixa do Anexo IV (Construção Civil)
 *   da Lei Complementar 123/2006. Pré-preenche; usuário pode override
 *   editando `aliquotaSimplesPercentual` em company_settings.
 *
 * - lucro_presumido / lucro_real → soma de ISS + PIS + COFINS + IRPJ +
 *   CSLL editáveis em company_settings.
 *
 * Retorna I em **fração** (0,08 = 8%), não em pontos percentuais.
 */
import type { CompanyTaxSettings } from "../../shared/types";

/**
 * Tabela do Anexo IV do Simples Nacional (Construção Civil), Lei
 * Complementar 123/2006. Alíquota nominal por faixa de receita bruta
 * acumulada nos últimos 12 meses. RR Engine pré-preenche com esses
 * valores, mas o usuário pode editar via campo `aliquotaSimplesPercentual`.
 */
export const SIMPLES_ANEXO_IV: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 4.5, // até R$ 180k
  2: 9.0, // 180k – 360k
  3: 10.2, // 360k – 720k
  4: 14.0, // 720k – 1,8M
  5: 22.0, // 1,8M – 3,6M
  6: 33.0, // 3,6M – 4,8M
};

export interface ResolveTaxRateInput {
  taxSettings: CompanyTaxSettings;
  /**
   * Override manual em pontos percentuais (ex.: 12.5 para 12,5%). Quando
   * presente, ganha de qualquer cálculo automático. Permite empresas com
   * benefício fiscal específico ajustarem sem mexer em ISS/PIS/COFINS.
   */
  overridePercentual?: number | null;
}

export interface ResolveTaxRateResult {
  /** Alíquota I em fração (0,08 = 8%). Pronto pra entrar na fórmula NBR. */
  rate: number;
  /** Mesma alíquota em pontos percentuais — útil pra UI/log. */
  ratePercentual: number;
  /** De onde a alíquota saiu — pra exibir na justificativa do BDI. */
  source:
    | "override"
    | "simples_anexo_iv"
    | "lucro_presumido"
    | "lucro_real"
    | "fallback";
  /** Texto humano pra justificativa. */
  description: string;
}

/**
 * Resolve a alíquota I para a fórmula NBR 12721.
 *
 * Ordem de prioridade:
 *   1. overridePercentual explícito (tem prioridade absoluta)
 *   2. Para simples_nacional: SIMPLES_ANEXO_IV[faixaSimples]
 *   3. Para lucro_presumido / lucro_real: soma dos campos individuais
 *   4. Fallback: 8% (alíquota média conservadora)
 */
export function resolveTaxRate(
  input: ResolveTaxRateInput
): ResolveTaxRateResult {
  const { taxSettings, overridePercentual } = input;

  if (
    overridePercentual !== undefined &&
    overridePercentual !== null &&
    overridePercentual >= 0
  ) {
    return {
      rate: overridePercentual / 100,
      ratePercentual: overridePercentual,
      source: "override",
      description: `Alíquota I = ${overridePercentual.toFixed(2)}% (override manual)`,
    };
  }

  switch (taxSettings.regimeTributario) {
    case "simples_nacional": {
      const faixa = taxSettings.faixaSimples;
      if (!faixa) {
        return {
          rate: 0.08,
          ratePercentual: 8,
          source: "fallback",
          description:
            "Alíquota I = 8% (fallback — Simples Nacional sem faixa definida)",
        };
      }
      const aliquota = SIMPLES_ANEXO_IV[faixa];
      return {
        rate: aliquota / 100,
        ratePercentual: aliquota,
        source: "simples_anexo_iv",
        description: `Alíquota I = ${aliquota.toFixed(2)}% (Simples Nacional, Anexo IV faixa ${faixa})`,
      };
    }

    case "lucro_presumido":
    case "lucro_real": {
      const soma =
        (taxSettings.issPercentual || 0) +
        (taxSettings.pisPercentual || 0) +
        (taxSettings.cofinsPercentual || 0) +
        (taxSettings.irpjPercentual || 0) +
        (taxSettings.csllPercentual || 0);
      return {
        rate: soma / 100,
        ratePercentual: soma,
        source: taxSettings.regimeTributario,
        description: `Alíquota I = ${soma.toFixed(2)}% (${taxSettings.regimeTributario === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real"} — ISS + PIS + COFINS + IRPJ + CSLL)`,
      };
    }

    default: {
      return {
        rate: 0.08,
        ratePercentual: 8,
        source: "fallback",
        description: "Alíquota I = 8% (fallback)",
      };
    }
  }
}
