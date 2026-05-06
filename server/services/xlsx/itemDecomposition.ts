/**
 * P2 XLSX refactor — contrato Qtd × (Mat + MO + Log) = Custo Total.
 *
 * Sintoma diagnosticado em obra real (Hangar Avjet — SBJR, 06/05/2026):
 * 77,8% dos itens não satisfaziam a relação aritmética
 * `Qtd × (Mat + MO + Log) = Custo Total`. Causa: agentes às vezes
 * retornam `unitCostMaterial=0/Labor=0/Logistics=0` mas `unitCostTotal>0`,
 * outras vezes retornam decomposto mas a soma não bate exatamente. O
 * templater antigo escrevia colunas em moeda independentes e a relação
 * não fechava em planilha.
 *
 * Este módulo centraliza a normalização: a partir do que veio do agente,
 * produz `{ matUnit, moUnit, logUnit, totalUnit }` que satisfazem
 * `mat + mo + log == total` (dentro de centavos), com fallback explícito
 * quando os componentes vieram zerados.
 */

export interface DecomposedItem {
  /** Custo de material por unidade. */
  matUnit: number;
  /** Custo de mão de obra por unidade. */
  moUnit: number;
  /** Custo de logística por unidade. */
  logUnit: number;
  /** Custo total unitário (= mat + mo + log). */
  totalUnit: number;
  /**
   * `decomposed` quando os 3 componentes vieram > 0 e somavam ≈ total.
   * `reconciled` quando vieram > 0 mas a soma divergia do total — ajustado
   *   pro logUnit absorver o delta.
   * `synthesized-mat-mo` quando só vieram zerados — split 60/40 mat/mo.
   * `synthesized-mat-mo-log` quando vieram zerados e a categoria sugere
   *   logística — split 30/30/40.
   */
  source:
    | "decomposed"
    | "reconciled"
    | "synthesized-mat-mo"
    | "synthesized-mat-mo-log";
}

/** Tolerância: diferença <= R$ 0,02 entre soma dos componentes e total. */
const RECONCILIATION_TOLERANCE = 0.02;

/** Heurística: itens cuja descrição/categoria sugere logística (ajusta split). */
const LOGISTICS_HINT_RE =
  /\b(frete|transporte|cacamba|caçamba|munck|gua?rda|estacionamento|hospedagem|deslocamento|alimentac)/i;

interface RawItem {
  description?: string | null;
  category?: string | null;
  unitCostMaterial?: number | string | null;
  unitCostLabor?: number | string | null;
  unitCostLogistics?: number | string | null;
  unitCostTotal?: number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Resolve `{matUnit, moUnit, logUnit, totalUnit}` a partir do que o
 * agente persistiu no `budget_items`. Garante invariante
 * `mat + mo + log == totalUnit` para auditoria de procurement.
 */
export function decomposeUnitCosts(item: RawItem): DecomposedItem {
  const matRaw = num(item.unitCostMaterial);
  const moRaw = num(item.unitCostLabor);
  const logRaw = num(item.unitCostLogistics);
  const totalRaw = num(item.unitCostTotal);
  const sumComponents = matRaw + moRaw + logRaw;

  // Caso A: agente decompôs e a conta bate (dentro de R$ 0,02).
  if (sumComponents > 0 && Math.abs(sumComponents - totalRaw) <= RECONCILIATION_TOLERANCE) {
    return {
      matUnit: round2(matRaw),
      moUnit: round2(moRaw),
      logUnit: round2(logRaw),
      totalUnit: round2(matRaw + moRaw + logRaw),
      source: "decomposed",
    };
  }

  // Caso B: vieram componentes mas não fecham com o total. Mantém os 3 e
  // joga o delta no log (categoria mais frequente onde o templater antigo
  // engolia diferença sem aviso).
  if (sumComponents > 0 && totalRaw > 0) {
    const delta = totalRaw - sumComponents;
    const adjLog = round2(Math.max(0, logRaw + delta));
    const adjusted = round2(matRaw + moRaw + adjLog);
    return {
      matUnit: round2(matRaw),
      moUnit: round2(moRaw),
      logUnit: adjLog,
      totalUnit: adjusted,
      source: "reconciled",
    };
  }

  // Caso C: componentes zerados (agente não decompôs). Sintetiza split.
  if (totalRaw > 0) {
    const isLogistics =
      (item.category && LOGISTICS_HINT_RE.test(item.category)) ||
      (item.description && LOGISTICS_HINT_RE.test(item.description));
    if (isLogistics) {
      // Itens logísticos: 30% material (insumo/EPI), 30% MO, 40% logística (a parte cara).
      const matU = round2(totalRaw * 0.3);
      const moU = round2(totalRaw * 0.3);
      const logU = round2(totalRaw - matU - moU);
      return {
        matUnit: matU,
        moUnit: moU,
        logUnit: logU,
        totalUnit: round2(matU + moU + logU),
        source: "synthesized-mat-mo-log",
      };
    }
    // Itens regulares: 60% material, 40% MO, 0% logística.
    const matU = round2(totalRaw * 0.6);
    const moU = round2(totalRaw - matU);
    return {
      matUnit: matU,
      moUnit: moU,
      logUnit: 0,
      totalUnit: round2(matU + moU),
      source: "synthesized-mat-mo",
    };
  }

  // Caso D: tudo zerado — preserva.
  return {
    matUnit: 0,
    moUnit: 0,
    logUnit: 0,
    totalUnit: 0,
    source: "decomposed",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
