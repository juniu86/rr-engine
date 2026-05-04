/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ==================== TAX SETTINGS (P1.5) ====================

/**
 * Configuração tributária canônica usada pelo agente Tributário e pelo
 * gating do pipeline de orçamentos. Todos os campos são obrigatórios em
 * runtime — orçamento sem configuração explícita não pode ser gerado
 * (P1.5: removido fallback silencioso de 'lucro_presumido + ISS 5%').
 */
export interface CompanyTaxSettings {
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real";
  issPercentual: number;
  pisPercentual: number;
  cofinsPercentual: number;
  irpjPercentual: number;
  csllPercentual: number;
  taxaLeisSociais: number;
  /** Faixa do Simples Nacional (1-6). Obrigatório quando regime=simples_nacional. */
  faixaSimples?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Type guard que valida se a config tributária está completa o suficiente
 * para o pipeline rodar. Usado em 3 lugares (P1.5):
 * 1. Frontend (Settings.tsx) — banner persistente quando false
 * 2. Frontend (NewProject.tsx) — desabilita botão "Gerar orçamento"
 * 3. Backend (routers.ts) — bloqueia o pipeline com PRECONDITION_FAILED
 *
 * O agente Tributário também usa esse guard como defesa em profundidade —
 * lança Error se chega input incompleto (sinal de bug na orquestração).
 */
export function isCompleteTaxSettings(
  s: Partial<CompanyTaxSettings> | null | undefined
): s is CompanyTaxSettings {
  if (!s) return false;
  if (!s.regimeTributario) return false;
  if (s.issPercentual == null || s.issPercentual < 0) return false;
  if (s.pisPercentual == null || s.pisPercentual < 0) return false;
  if (s.cofinsPercentual == null || s.cofinsPercentual < 0) return false;
  if (s.irpjPercentual == null || s.irpjPercentual < 0) return false;
  if (s.csllPercentual == null || s.csllPercentual < 0) return false;
  if (s.taxaLeisSociais == null || s.taxaLeisSociais < 0) return false;
  if (s.regimeTributario === "simples_nacional" && !s.faixaSimples)
    return false;
  return true;
}
