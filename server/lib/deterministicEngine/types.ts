/**
 * RR-Engine — Core Types
 * Motor de orçamentação para construção civil
 */

// ─── Localização ──────────────────────────────────────────────────────────────

export type TipoLocalidade = 'capital' | 'regiao_metropolitana' | 'interior';

export interface Localizacao {
  cidade: string;
  estado: string;
  tipo: TipoLocalidade;
}

// ─── Memorial Descritivo ──────────────────────────────────────────────────────

export type TipoObra = 'obra_nova' | 'reforma' | 'ampliacao';

export interface MemorialDescritivo {
  nome: string;
  tipo: TipoObra;
  localizacao: Localizacao;
  itens: ItemMemorial[];
  logistica: LogisticaMemorial;
  prazo_semanas: number;
  observacoes: string[];
}

export interface ItemMemorial {
  descricao: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  sub_itens?: ItemMemorial[];
}

export interface LogisticaMemorial {
  transporte: boolean;
  hospedagem?: {
    profissionais: number;
    semanas: number;
  };
  deslocamento_local: boolean;
  /** Only items explicitly mentioned in the memorial */
  itens_explicitos: string[];
}

// ─── Item de Orçamento ────────────────────────────────────────────────────────

export interface ItemOrcamento {
  id: number;
  descricao: string;
  descricao_normalizada: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  preco_unitario_sinapi: number;
  fator_regional: number;
  preco_unitario_ajustado: number;
  preco_total: number;
  fonte: 'sinapi' | 'composicao' | 'cotacao';
  modulo_origem: 'orcamento' | 'logistica';
  is_header: boolean;
  sub_itens?: ItemOrcamento[];
}

// ─── Custos Logísticos ────────────────────────────────────────────────────────

export interface CustoLogistico {
  id: number;
  descricao: string;
  descricao_normalizada: string;
  categoria: 'transporte' | 'hospedagem' | 'deslocamento' | 'equipamento';
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  preco_total: number;
}

// ─── Configuração do Engine ───────────────────────────────────────────────────

export interface EngineConfig {
  /** BDI percentage (default 25%) */
  bdi_percentual: number;
  /** Regional adjustment factors by locality type */
  fator_regional: Record<TipoLocalidade, number>;
  /** Tax rate over revenue */
  imposto_percentual: number;
  /** Working days per week for accommodation calc */
  dias_uteis_semana: number;
  /** Similarity threshold for deduplication (cosine-like) */
  similaridade_threshold: number;
  /** Whether to allow auto-inferred logistics items */
  permitir_logistica_inferida: boolean;
}

// ─── Resultado do Engine ──────────────────────────────────────────────────────

export interface ResultadoEngine {
  memorial: MemorialDescritivo;
  itens_orcamento: ItemOrcamento[];
  custos_logisticos: CustoLogistico[];
  resumo: ResumoOrcamento;
  warnings: string[];
  config_utilizada: EngineConfig;
}

export interface ResumoOrcamento {
  custo_base: number;
  custo_logistica: number;
  custo_total: number;
  bdi_percentual: number;
  bdi_valor: number;
  impostos_valor: number;
  preco_venda: number;
  margem_liquida_percentual: number;
  total_itens: number;
  duplicados_removidos: number;
  itens_inventados_removidos: number;
}
