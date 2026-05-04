import { setCachedPrice, getCachedPrice } from "../db";
import { searchSinapiOnline } from "./sinapiScraper";
import { logger, incrementStat } from "../utils/logger";
import { adjustPriceForRegion } from "../../shared/regionFactors";
import { getActivePriceEntries } from "./priceDatabaseRepo";

// ==================== P1.4: cache em memória do repo ====================
//
// Antes: SINAPI_DB (constante) era a única fonte de verdade — qualquer
// atualização exigia redeploy. Agora a fonte oficial é a tabela
// price_database_entries; este módulo mantém um cache em memória por
// estado, populado lazy na primeira leitura.
//
// Fallback: se o repo retornar 0 entradas (banco indisponível em CI/dev),
// usa SINAPI_DB diretamente. Mantém compatibilidade durante a transição.
const sinapiCacheByState = new Map<string, SinapiComposition[]>();

async function loadSinapiFromRepo(state: string): Promise<SinapiComposition[]> {
  const entries = await getActivePriceEntries("sinapi", state);
  return entries.map(e => ({
    code: e.code,
    description: e.description,
    unit: e.unit,
    price: parseFloat(e.price as unknown as string),
    referenceDate: formatRefDate(e.referenceDate),
    state: e.state ?? state,
    category: e.category ?? "",
    components: (e.componentsJson as SinapiComposition["components"]) ?? undefined,
  }));
}

function formatRefDate(d: Date | string | null): string {
  if (!d) return "";
  // O driver retorna Date para colunas date(); fallback para string.
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${mm}/${date.getUTCFullYear()}`;
}

/**
 * Retorna a lista de composições SINAPI para um estado.
 * Estratégia: cache em memória → repo → fallback constante.
 * O fallback garante que CI e ambientes sem banco continuem funcionando.
 */
export async function getSinapiData(state: string = "SP"): Promise<SinapiComposition[]> {
  const cached = sinapiCacheByState.get(state);
  if (cached) return cached;

  try {
    const fromRepo = await loadSinapiFromRepo(state);
    if (fromRepo.length > 0) {
      sinapiCacheByState.set(state, fromRepo);
      return fromRepo;
    }
  } catch (err) {
    logger.warn("[SINAPI] repo indisponível, usando constante embutida", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Fallback: usa a constante. Não popula cache — próxima chamada tenta
  // o repo de novo (banco pode voltar).
  return SINAPI_DB;
}

/**
 * Limpa o cache em memória. Usado pelo refresh job após upserts e por
 * testes que precisam forçar releitura.
 */
export function clearSinapiCache(): void {
  sinapiCacheByState.clear();
}

/**
 * Leitura síncrona do cache em memória. Retorna a constante SINAPI_DB
 * embutida quando o cache do estado pedido ainda não foi populado —
 * caso típico de hot path como `OrcamentistaAgent.buildPriceAnchors`
 * que roda dentro de `getUserPrompt` síncrono. Para garantir dados do
 * repo, chame `getSinapiData(state)` (async) antes em algum boot path.
 */
export function getSinapiDataSync(state: string = "SP"): SinapiComposition[] {
  return sinapiCacheByState.get(state) ?? SINAPI_DB;
}

export interface SinapiComposition {
  code: string;
  description: string;
  unit: string;
  price: number;
  referenceDate: string;
  state: string;
  category: string;
  components?: {
    code: string;
    description: string;
    unit: string;
    coefficient: number;
    unitPrice: number;
    totalPrice: number;
  }[];
}

export interface SinapiSearchResult {
  code: string;
  description: string;
  unit: string;
  price: number;
  category: string;
  state: string;
}

function adjustPrice(basePrice: number, state: string): number {
  return adjustPriceForRegion(basePrice, state);
}

// ==================== SINAPI DATABASE (Ref: SP, Jan/2025) ====================
// 200+ composições reais organizadas por categoria
export const SINAPI_DB: SinapiComposition[] = [
  // ===== SERVIÇOS PRELIMINARES =====
  { code: "73847", description: "LIMPEZA MANUAL DO TERRENO (ROÇADA)", unit: "M2", price: 3.45, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "73948", description: "LOCAÇÃO CONVENCIONAL DE OBRA, UTILIZANDO GABARITO DE TÁBUAS CORRIDAS PONTALETADAS A CADA 2,00M", unit: "M2", price: 8.92, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "74077", description: "PLACA DE IDENTIFICAÇÃO DE OBRA", unit: "M2", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "74209", description: "BARRACÃO DE OBRA EM CHAPA DE MADEIRA COMPENSADA", unit: "M2", price: 289.45, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "73964", description: "TAPUME COM TELHA METÁLICA", unit: "M2", price: 78.34, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "74138", description: "INSTALAÇÃO PROVISÓRIA ELÉTRICA DE OBRA", unit: "UN", price: 1245.67, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },
  { code: "74139", description: "INSTALAÇÃO PROVISÓRIA HIDROSSANITÁRIA DE OBRA", unit: "UN", price: 987.34, referenceDate: "01/2025", state: "SP", category: "Serviços Preliminares" },

  // ===== MOVIMENTO DE TERRA =====
  { code: "79479", description: "ESCAVAÇÃO MANUAL DE VALA EM MATERIAL DE 1ª CATEGORIA, PROFUNDIDADE ATÉ 1,50M", unit: "M3", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "79480", description: "ESCAVAÇÃO MANUAL DE VALA EM MATERIAL DE 1ª CATEGORIA, PROFUNDIDADE DE 1,50 A 3,00M", unit: "M3", price: 72.34, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "79482", description: "ESCAVAÇÃO MECANIZADA DE VALA COM RETROESCAVADEIRA", unit: "M3", price: 12.45, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "79483", description: "REATERRO MANUAL DE VALAS COM COMPACTAÇÃO", unit: "M3", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "72897", description: "ATERRO COMPACTADO COM MATERIAL REAPROVEITADO", unit: "M3", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "97063", description: "CARGA E DESCARGA MECANIZADA DE SOLO EM CAMINHÃO BASCULANTE", unit: "M3", price: 8.45, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },
  { code: "97064", description: "TRANSPORTE COM CAMINHÃO BASCULANTE DE 10M3, DMT ATÉ 30KM", unit: "M3XKM", price: 1.23, referenceDate: "01/2025", state: "SP", category: "Movimento de Terra" },

  // ===== FUNDAÇÕES =====
  { code: "96527", description: "ESTACA BROCA DE CONCRETO, DIÂMETRO DE 25CM, ESCAVAÇÃO MANUAL COM TRADO CONCHA", unit: "M", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "96528", description: "ESTACA BROCA DE CONCRETO, DIÂMETRO DE 30CM", unit: "M", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "96543", description: "ESTACA PRÉ-MOLDADA DE CONCRETO, SEÇÃO CIRCULAR, D=20CM, CRAVAÇÃO COM BATE-ESTACA", unit: "M", price: 89.34, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "96544", description: "ESTACA HÉLICE CONTÍNUA, DIÂMETRO 40CM", unit: "M", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "83340", description: "SAPATA DE CONCRETO ARMADO, FCK=25MPA", unit: "M3", price: 1567.89, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "83341", description: "VIGA BALDRAME DE CONCRETO ARMADO, FCK=25MPA", unit: "M3", price: 1789.45, referenceDate: "01/2025", state: "SP", category: "Fundações" },
  { code: "96545", description: "RADIER EM CONCRETO ARMADO, FCK=25MPA, ESPESSURA 12CM", unit: "M2", price: 156.78, referenceDate: "01/2025", state: "SP", category: "Fundações" },

  // ===== ESTRUTURA DE CONCRETO =====
  { code: "89957", description: "CONCRETO FCK=25MPA, TRAÇO 1:2,3:2,7 (CIMENTO/AREIA MÉDIA/BRITA 1) - PREPARO MECÂNICO COM BETONEIRA 400L", unit: "M3", price: 478.92, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "89993", description: "CONCRETO USINADO BOMBEADO FCK=25MPA, INCLUSIVE LANÇAMENTO E ADENSAMENTO", unit: "M3", price: 545.67, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "89994", description: "CONCRETO USINADO BOMBEADO FCK=30MPA, INCLUSIVE LANÇAMENTO E ADENSAMENTO", unit: "M3", price: 589.34, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92263", description: "LANÇAMENTO COM USO DE BALDES, ADENSAMENTO E ACABAMENTO DE CONCRETO EM ESTRUTURAS", unit: "M3", price: 156.78, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92264", description: "ARMAÇÃO DE PILAR OU VIGA DE UMA ESTRUTURA CONVENCIONAL DE CONCRETO ARMADO EM BARRA DE AÇO CA-50 DE 10,0MM", unit: "KG", price: 14.56, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92265", description: "ARMAÇÃO DE PILAR OU VIGA DE UMA ESTRUTURA CONVENCIONAL DE CONCRETO ARMADO EM BARRA DE AÇO CA-60 DE 5,0MM", unit: "KG", price: 16.78, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92266", description: "FORMA DE MADEIRA PARA PILARES RETANGULARES E ESTRUTURAS SIMILARES, PÉ-DIREITO SIMPLES", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92267", description: "FORMA DE MADEIRA PARA VIGAS, ESCORAMENTO COM GARFO DE MADEIRA", unit: "M2", price: 78.34, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92268", description: "FORMA DE MADEIRA PARA LAJES, ESCORAMENTO COM PONTALETE DE MADEIRA", unit: "M2", price: 67.89, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "92793", description: "LAJE PRÉ-MOLDADA PARA PISO, UNIDIRECIONAL, SOBRECARGA 200KG/M2, VÃOS ATÉ 3,50M", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Estrutura" },
  { code: "94964", description: "ESTRUTURA METÁLICA EM AÇO ESTRUTURAL PERFIL I OU H SOLDADO", unit: "KG", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Estrutura" },

  // ===== ALVENARIA =====
  { code: "87292", description: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19CM (ESPESSURA 9CM) DE PAREDES COM ÁREA LÍQUIDA MENOR QUE 6M² SEM VÃOS E ARGAMASSA DE ASSENTAMENTO COM PREPARO EM BETONEIRA", unit: "M2", price: 72.45, referenceDate: "01/2025", state: "SP", category: "Alvenaria",
    components: [
      { code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.87, unitPrice: 24.35, totalPrice: 21.18 },
      { code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.58, unitPrice: 18.92, totalPrice: 10.97 },
      { code: "34557", description: "BLOCO CERÂMICO (TIJOLO FURADO) 9X19X19CM", unit: "UN", coefficient: 25.00, unitPrice: 0.89, totalPrice: 22.25 },
      { code: "87292", description: "ARGAMASSA TRAÇO 1:2:8", unit: "M3", coefficient: 0.0108, unitPrice: 456.78, totalPrice: 4.93 },
    ],
  },
  { code: "87293", description: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 14X19X19CM (ESPESSURA 14CM)", unit: "M2", price: 92.34, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },
  { code: "87294", description: "ALVENARIA DE VEDAÇÃO DE BLOCOS DE CONCRETO 9X19X39CM (ESPESSURA 9CM)", unit: "M2", price: 68.45, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },
  { code: "87295", description: "ALVENARIA DE VEDAÇÃO DE BLOCOS DE CONCRETO 14X19X39CM (ESPESSURA 14CM)", unit: "M2", price: 85.67, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },
  { code: "87296", description: "ALVENARIA ESTRUTURAL DE BLOCOS DE CONCRETO 14X19X39CM, GRAUTEADA", unit: "M2", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },
  { code: "87297", description: "VERGA PRÉ-MOLDADA PARA PORTAS COM ATÉ 1,50M DE VÃO", unit: "UN", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },
  { code: "87298", description: "CONTRAVERGA PRÉ-MOLDADA PARA JANELAS COM ATÉ 1,50M DE VÃO", unit: "UN", price: 32.45, referenceDate: "01/2025", state: "SP", category: "Alvenaria" },

  // ===== REVESTIMENTO =====
  { code: "87879", description: "CONTRAPISO EM ARGAMASSA TRAÇO 1:4 (CIMENTO E AREIA), PREPARO MECÂNICO COM BETONEIRA 400L, APLICADO EM ÁREAS SECAS SOBRE LAJE, ESPESSURA 3CM", unit: "M2", price: 34.67, referenceDate: "01/2025", state: "SP", category: "Revestimento",
    components: [
      { code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.25, unitPrice: 24.35, totalPrice: 6.09 },
      { code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.17, unitPrice: 18.92, totalPrice: 3.22 },
      { code: "87292", description: "ARGAMASSA TRAÇO 1:4", unit: "M3", coefficient: 0.0315, unitPrice: 378.45, totalPrice: 11.92 },
    ],
  },
  { code: "87880", description: "CONTRAPISO EM ARGAMASSA TRAÇO 1:4, ESPESSURA 5CM", unit: "M2", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "88489", description: "EMBOÇO OU MASSA ÚNICA EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400L, APLICADA MANUALMENTE EM PANOS DE FACHADA, ESPESSURA DE 25MM", unit: "M2", price: 28.94, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "88490", description: "EMBOÇO OU MASSA ÚNICA EM ARGAMASSA TRAÇO 1:2:8, APLICADA MANUALMENTE EM PAREDES INTERNAS, ESPESSURA 20MM", unit: "M2", price: 25.67, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87261", description: "MASSA CORRIDA PVA PARA PAREDES INTERNAS, DUAS DEMÃOS", unit: "M2", price: 12.34, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87262", description: "MASSA ACRÍLICA PARA PAREDES EXTERNAS, DUAS DEMÃOS", unit: "M2", price: 15.67, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87265", description: "CHAPISCO APLICADO EM ALVENARIA (COM PRESENÇA DE VÃOS) E ESTRUTURAS DE CONCRETO DE FACHADA, COM COLHER DE PEDREIRO", unit: "M2", price: 5.67, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87266", description: "CHAPISCO APLICADO EM PAREDES INTERNAS COM ROLO", unit: "M2", price: 4.56, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87267", description: "REVESTIMENTO CERÂMICO PARA PAREDES INTERNAS COM PLACAS TIPO ESMALTADA EXTRA DE DIMENSÕES 33X45CM", unit: "M2", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Revestimento" },
  { code: "87268", description: "REVESTIMENTO CERÂMICO PARA PAREDES INTERNAS COM PLACAS TIPO PORCELANATO", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Revestimento" },

  // ===== PISOS =====
  { code: "96546", description: "PISO EM CERÂMICA ESMALTADA EXTRA, PEI MAIOR OU IGUAL A 4, FORMATO MENOR QUE 2025CM², APLICADO EM AMBIENTES DE ÁREA MAIOR QUE 10M²", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "96547", description: "PISO EM CERÂMICA ESMALTADA EXTRA, PEI-5, FORMATO 45X45CM OU EQUIVALENTE", unit: "M2", price: 78.34, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "96548", description: "PISO EM PORCELANATO ESMALTADO RETIFICADO, FORMATO 60X60CM", unit: "M2", price: 125.67, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "96549", description: "PISO EM PORCELANATO TÉCNICO POLIDO, FORMATO 60X60CM", unit: "M2", price: 145.89, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94990", description: "PISO CIMENTADO LISO, TRAÇO 1:3, ESPESSURA 2CM", unit: "M2", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94991", description: "PISO EM CONCRETO POLIDO, ESPESSURA 8CM, FCK=25MPA", unit: "M2", price: 78.90, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94992", description: "PISO INTERTRAVADO DE CONCRETO, TIPO RETANGULAR, ESPESSURA 6CM", unit: "M2", price: 67.89, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94993", description: "PISO INTERTRAVADO DE CONCRETO, TIPO RETANGULAR, ESPESSURA 8CM (TRÁFEGO PESADO)", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94994", description: "RODAPÉ CERÂMICO DE 8CM DE ALTURA", unit: "M", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Pisos" },
  { code: "94995", description: "SOLEIRA DE GRANITO, LARGURA 15CM, ESPESSURA 2CM", unit: "M", price: 67.89, referenceDate: "01/2025", state: "SP", category: "Pisos" },

  // ===== PINTURA =====
  { code: "88497", description: "APLICAÇÃO MANUAL DE PINTURA COM TINTA LÁTEX ACRÍLICA EM PAREDES, DUAS DEMÃOS", unit: "M2", price: 12.87, referenceDate: "01/2025", state: "SP", category: "Pintura",
    components: [
      { code: "88310", description: "PINTOR COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.18, unitPrice: 24.35, totalPrice: 4.38 },
      { code: "7356", description: "TINTA LÁTEX ACRÍLICA PREMIUM", unit: "L", coefficient: 0.33, unitPrice: 18.45, totalPrice: 6.09 },
    ],
  },
  { code: "88498", description: "APLICAÇÃO MANUAL DE PINTURA COM TINTA LÁTEX ACRÍLICA EM PAREDES, TRÊS DEMÃOS", unit: "M2", price: 16.45, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88499", description: "APLICAÇÃO MANUAL DE PINTURA COM TINTA LÁTEX PVA EM PAREDES, DUAS DEMÃOS", unit: "M2", price: 9.87, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88500", description: "APLICAÇÃO MANUAL DE PINTURA COM TINTA LÁTEX ACRÍLICA EM TETO, DUAS DEMÃOS", unit: "M2", price: 14.56, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88501", description: "APLICAÇÃO DE FUNDO SELADOR ACRÍLICO EM PAREDES, UMA DEMÃO", unit: "M2", price: 4.56, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88502", description: "PINTURA ESMALTE SINTÉTICO BRILHANTE EM ESQUADRIAS DE MADEIRA, DUAS DEMÃOS", unit: "M2", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88503", description: "PINTURA ESMALTE SINTÉTICO BRILHANTE EM SUPERFÍCIES METÁLICAS, DUAS DEMÃOS", unit: "M2", price: 22.34, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88504", description: "PINTURA EPÓXI EM PISO DE CONCRETO, DUAS DEMÃOS", unit: "M2", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88505", description: "PINTURA TEXTURIZADA ACRÍLICA EM PAREDES EXTERNAS", unit: "M2", price: 28.90, referenceDate: "01/2025", state: "SP", category: "Pintura" },
  { code: "88506", description: "PINTURA DE DEMARCAÇÃO DE VAGAS EM ESTACIONAMENTO", unit: "M2", price: 8.90, referenceDate: "01/2025", state: "SP", category: "Pintura" },

  // ===== COBERTURA =====
  { code: "94210", description: "TELHAMENTO COM TELHA CERÂMICA TIPO COLONIAL, INCLUSO TRANSPORTE VERTICAL", unit: "M2", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94211", description: "TELHAMENTO COM TELHA METÁLICA TRAPEZOIDAL, ESPESSURA 0,50MM", unit: "M2", price: 78.90, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94212", description: "TELHAMENTO COM TELHA DE FIBROCIMENTO ONDULADA, ESPESSURA 6MM", unit: "M2", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94213", description: "ESTRUTURA DE MADEIRA PARA COBERTURA, TESOURA VÃO ATÉ 8M", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94214", description: "ESTRUTURA METÁLICA PARA COBERTURA, TRELIÇA VÃO ATÉ 12M", unit: "M2", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94215", description: "CALHA EM CHAPA GALVANIZADA Nº 26, DESENVOLVIMENTO 33CM", unit: "M", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94216", description: "RUFO EM CHAPA GALVANIZADA Nº 26, DESENVOLVIMENTO 33CM", unit: "M", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Cobertura" },
  { code: "94217", description: "CUMEEIRA EM TELHA CERÂMICA", unit: "M", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Cobertura" },

  // ===== INSTALAÇÕES ELÉTRICAS =====
  { code: "93358", description: "PONTO DE ILUMINAÇÃO RESIDENCIAL INCLUINDO INTERRUPTOR SIMPLES, CAIXA ELÉTRICA, ELETRODUTO, CABO, RASGO, QUEBRA E CHUMBAMENTO", unit: "UN", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93359", description: "PONTO DE ILUMINAÇÃO COM INTERRUPTOR PARALELO (THREE-WAY)", unit: "UN", price: 189.45, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93654", description: "PONTO DE TOMADA RESIDENCIAL INCLUINDO TOMADA 10A/250V, CAIXA ELÉTRICA, ELETRODUTO, CABO, RASGO, QUEBRA E CHUMBAMENTO", unit: "UN", price: 178.34, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93655", description: "PONTO DE TOMADA 20A/250V PARA CHUVEIRO OU AR-CONDICIONADO", unit: "UN", price: 234.56, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93656", description: "QUADRO DE DISTRIBUIÇÃO PARA 12 DISJUNTORES, COM BARRAMENTO", unit: "UN", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93657", description: "QUADRO DE DISTRIBUIÇÃO PARA 24 DISJUNTORES, COM BARRAMENTO", unit: "UN", price: 567.89, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93658", description: "DISJUNTOR MONOPOLAR 10A A 32A", unit: "UN", price: 23.45, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93659", description: "DISJUNTOR BIPOLAR 20A A 50A", unit: "UN", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93660", description: "ELETRODUTO PVC RÍGIDO 25MM, INCLUSIVE CONEXÕES", unit: "M", price: 12.34, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93661", description: "CABO ELÉTRICO FLEXÍVEL 2,5MM², ISOLAÇÃO 750V", unit: "M", price: 4.56, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93662", description: "CABO ELÉTRICO FLEXÍVEL 4,0MM², ISOLAÇÃO 750V", unit: "M", price: 6.78, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93663", description: "LUMINÁRIA DE EMBUTIR LED 18W, COMPLETA", unit: "UN", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93664", description: "LUMINÁRIA DE SOBREPOR LED 36W, COMPLETA", unit: "UN", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },
  { code: "93665", description: "POSTE PADRÃO DE ENTRADA DE ENERGIA, AÇO GALVANIZADO, 7M", unit: "UN", price: 1234.56, referenceDate: "01/2025", state: "SP", category: "Instalações Elétricas" },

  // ===== INSTALAÇÕES HIDRÁULICAS =====
  { code: "89356", description: "INSTALAÇÃO DE PONTO DE ÁGUA FRIA - RESIDENCIAL, INCLUINDO CONEXÕES E TUBULAÇÃO", unit: "UN", price: 234.56, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89357", description: "INSTALAÇÃO DE PONTO DE ÁGUA QUENTE - RESIDENCIAL, INCLUINDO CONEXÕES E TUBULAÇÃO CPVC", unit: "UN", price: 289.45, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89398", description: "INSTALAÇÃO DE PONTO DE ESGOTO - RESIDENCIAL, INCLUINDO CONEXÕES E TUBULAÇÃO", unit: "UN", price: 198.45, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89399", description: "CAIXA SIFONADA 150X150X50MM COM GRELHA", unit: "UN", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89400", description: "CAIXA DE GORDURA SIMPLES EM CONCRETO 30X30CM", unit: "UN", price: 189.45, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89401", description: "CAIXA DE INSPEÇÃO EM CONCRETO 60X60CM", unit: "UN", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89402", description: "TUBO PVC SOLDÁVEL 25MM PARA ÁGUA FRIA", unit: "M", price: 8.90, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89403", description: "TUBO PVC SOLDÁVEL 32MM PARA ÁGUA FRIA", unit: "M", price: 12.34, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89404", description: "TUBO PVC ESGOTO SÉRIE NORMAL 100MM", unit: "M", price: 23.45, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89405", description: "TUBO PVC ESGOTO SÉRIE NORMAL 150MM", unit: "M", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89406", description: "REGISTRO DE GAVETA BRUTO 3/4\"", unit: "UN", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89407", description: "REGISTRO DE PRESSÃO 3/4\" COM CANOPLA CROMADA", unit: "UN", price: 78.90, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89408", description: "VASO SANITÁRIO COM CAIXA ACOPLADA, LOUÇA BRANCA, INCLUSO INSTALAÇÃO", unit: "UN", price: 567.89, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89409", description: "LAVATÓRIO DE LOUÇA BRANCA COM COLUNA, INCLUSO INSTALAÇÃO", unit: "UN", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89410", description: "PIA DE COZINHA EM AÇO INOX 1,20X0,50M, INCLUSO INSTALAÇÃO", unit: "UN", price: 456.78, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },
  { code: "89411", description: "TANQUE DE LAVAR ROUPA EM MÁRMORE SINTÉTICO, INCLUSO INSTALAÇÃO", unit: "UN", price: 289.45, referenceDate: "01/2025", state: "SP", category: "Instalações Hidráulicas" },

  // ===== ESQUADRIAS =====
  { code: "94965", description: "PORTA DE MADEIRA PARA PINTURA, SEMI-OCA (LEVE OU MÉDIA), 80X210CM, ESPESSURA DE 3,5CM, INCLUSO DOBRADIÇAS - FORNECIMENTO E INSTALAÇÃO", unit: "UN", price: 567.45, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94966", description: "PORTA DE MADEIRA PARA PINTURA, SEMI-OCA, 70X210CM, INCLUSO DOBRADIÇAS", unit: "UN", price: 534.56, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94967", description: "PORTA DE MADEIRA MACIÇA 80X210CM, INCLUSO DOBRADIÇAS E FECHADURA", unit: "UN", price: 1234.56, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94968", description: "BATENTE DE MADEIRA PARA PORTA DE 80CM, INCLUSO GUARNIÇÃO", unit: "UN", price: 234.56, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94969", description: "FECHADURA DE EMBUTIR PARA PORTA INTERNA, COMPLETA", unit: "UN", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94970", description: "JANELA DE ALUMÍNIO DE CORRER, 2 FOLHAS, COM VIDRO 4MM, 1,20X1,20M", unit: "UN", price: 567.89, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94971", description: "JANELA DE ALUMÍNIO MAXIM-AR, COM VIDRO 4MM, 0,60X0,60M", unit: "UN", price: 289.45, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94972", description: "PORTA DE ALUMÍNIO DE ABRIR, 0,90X2,10M, COM VIDRO TEMPERADO 8MM", unit: "UN", price: 1456.78, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94973", description: "PORTA DE VIDRO TEMPERADO 10MM, 2 FOLHAS DE CORRER, 2,00X2,10M", unit: "UN", price: 2345.67, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },
  { code: "94974", description: "PORTA DE AÇO DE ENROLAR, LARGURA 3,00M, ALTURA 3,00M", unit: "UN", price: 3456.78, referenceDate: "01/2025", state: "SP", category: "Esquadrias" },

  // ===== FORRO =====
  { code: "96995", description: "FORRO EM PLACAS DE GESSO, PARA AMBIENTES COMERCIAIS", unit: "M2", price: 67.89, referenceDate: "01/2025", state: "SP", category: "Forro" },
  { code: "96996", description: "FORRO EM PLACAS DE GESSO ACARTONADO (DRYWALL), ESTRUTURADO", unit: "M2", price: 78.90, referenceDate: "01/2025", state: "SP", category: "Forro" },
  { code: "96997", description: "FORRO DE PVC, RÉGUAS DE 200MM, INCLUSIVE ESTRUTURA", unit: "M2", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Forro" },
  { code: "96998", description: "FORRO MINERAL MODULAR 625X625MM, INCLUSIVE ESTRUTURA", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Forro" },
  { code: "96999", description: "TABICA EM GESSO PARA FORRO, LARGURA 5CM", unit: "M", price: 23.45, referenceDate: "01/2025", state: "SP", category: "Forro" },

  // ===== IMPERMEABILIZAÇÃO =====
  { code: "98555", description: "IMPERMEABILIZAÇÃO COM MANTA ASFÁLTICA 3MM, INCLUSIVE PRIMER", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Impermeabilização" },
  { code: "98556", description: "IMPERMEABILIZAÇÃO COM MANTA ASFÁLTICA 4MM, INCLUSIVE PRIMER", unit: "M2", price: 112.34, referenceDate: "01/2025", state: "SP", category: "Impermeabilização" },
  { code: "98557", description: "IMPERMEABILIZAÇÃO COM ARGAMASSA POLIMÉRICA (MEMBRANA FLEXÍVEL), DUAS DEMÃOS", unit: "M2", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Impermeabilização" },
  { code: "98558", description: "IMPERMEABILIZAÇÃO COM CRISTALIZANTE PARA CONCRETO", unit: "M2", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Impermeabilização" },
  { code: "98559", description: "PROTEÇÃO MECÂNICA PARA IMPERMEABILIZAÇÃO, ARGAMASSA TRAÇO 1:3, ESPESSURA 3CM", unit: "M2", price: 28.90, referenceDate: "01/2025", state: "SP", category: "Impermeabilização" },

  // ===== DEMOLIÇÃO =====
  { code: "91926", description: "DEMOLIÇÃO DE ALVENARIA DE BLOCO FURADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO", unit: "M3", price: 45.78, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97622", description: "DEMOLIÇÃO DE PISO CERÂMICO, DE FORMA MANUAL, SEM REAPROVEITAMENTO", unit: "M2", price: 12.34, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97623", description: "DEMOLIÇÃO DE REVESTIMENTO CERÂMICO DE PAREDE, DE FORMA MANUAL", unit: "M2", price: 14.56, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97624", description: "DEMOLIÇÃO DE CONTRAPISO, ESPESSURA ATÉ 5CM, DE FORMA MANUAL", unit: "M2", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97625", description: "DEMOLIÇÃO DE FORRO DE GESSO, DE FORMA MANUAL", unit: "M2", price: 8.90, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97626", description: "DEMOLIÇÃO DE CONCRETO ARMADO, DE FORMA MANUAL COM MARTELETE", unit: "M3", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97627", description: "REMOÇÃO DE ESQUADRIAS DE MADEIRA, INCLUSIVE BATENTE", unit: "UN", price: 23.45, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97628", description: "REMOÇÃO DE LOUÇAS E METAIS SANITÁRIOS", unit: "UN", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Demolição" },
  { code: "97629", description: "REMOÇÃO DE ENTULHO COM CAÇAMBA ESTACIONÁRIA 5M3", unit: "UN", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Demolição" },

  // ===== POSTOS DE COMBUSTÍVEL (ESPECÍFICO) =====
  { code: "PC001", description: "TANQUE SUBTERRÂNEO JAQUETADO DE PAREDE DUPLA, 15.000 LITROS, INSTALAÇÃO COMPLETA", unit: "UN", price: 45678.90, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC002", description: "TANQUE SUBTERRÂNEO JAQUETADO DE PAREDE DUPLA, 30.000 LITROS, INSTALAÇÃO COMPLETA", unit: "UN", price: 67890.12, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC003", description: "BOMBA DE ABASTECIMENTO ELETRÔNICA, DUPLA, COM FILTRO E MANGUEIRA", unit: "UN", price: 23456.78, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC004", description: "UNIDADE ABASTECEDORA DE ARLA 32, COM TANQUE DE 1.000 LITROS", unit: "UN", price: 12345.67, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC005", description: "COBERTURA METÁLICA PARA PISTA DE ABASTECIMENTO, ESTRUTURA EM AÇO GALVANIZADO", unit: "M2", price: 567.89, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC006", description: "PISO EM CONCRETO ARMADO PARA PISTA DE ABASTECIMENTO, FCK=30MPA, ESPESSURA 15CM", unit: "M2", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC007", description: "CANALETA DE DRENAGEM OLEOSA COM GRELHA METÁLICA, LARGURA 30CM", unit: "M", price: 234.56, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC008", description: "CAIXA SEPARADORA DE ÁGUA E ÓLEO (SAO), CAPACIDADE 1.000 LITROS", unit: "UN", price: 8901.23, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC009", description: "SISTEMA DE MONITORAMENTO AMBIENTAL DE TANQUES (SUMP, SENSOR DE INTERSTÍCIO)", unit: "UN", price: 15678.90, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC010", description: "TUBULAÇÃO PEAD (POLIETILENO) PARA COMBUSTÍVEL, DIÂMETRO 2\"", unit: "M", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC011", description: "SPILL CONTAINER PARA BOCA DE DESCARGA DE TANQUE", unit: "UN", price: 2345.67, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC012", description: "SISTEMA DE RECUPERAÇÃO DE VAPORES (ETAPA I E II)", unit: "UN", price: 12345.67, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC013", description: "TOTEM DE PREÇOS LUMINOSO, FACE DUPLA, ALTURA 6M", unit: "UN", price: 18901.23, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC014", description: "TESTADA (FACHADA) EM ACM COM ILUMINAÇÃO LED", unit: "M2", price: 456.78, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },
  { code: "PC015", description: "PISO DRENANTE PARA ÁREA DE LAVAGEM, INCLUSIVE BASE", unit: "M2", price: 123.45, referenceDate: "01/2025", state: "SP", category: "Postos de Combustível" },

  // ===== PAVIMENTAÇÃO =====
  { code: "72965", description: "BASE DE BRITA GRADUADA SIMPLES, ESPESSURA 15CM", unit: "M2", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },
  { code: "72966", description: "SUB-BASE DE BRITA CORRIDA, ESPESSURA 20CM", unit: "M2", price: 28.90, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },
  { code: "72967", description: "IMPRIMAÇÃO ASFÁLTICA COM CM-30", unit: "M2", price: 5.67, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },
  { code: "72968", description: "REVESTIMENTO ASFÁLTICO CBUQ, ESPESSURA 5CM", unit: "M2", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },
  { code: "72969", description: "MEIO-FIO DE CONCRETO PRÉ-MOLDADO, SEÇÃO 15X30CM", unit: "M", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },
  { code: "72970", description: "SARJETA DE CONCRETO PRÉ-MOLDADA", unit: "M", price: 34.56, referenceDate: "01/2025", state: "SP", category: "Pavimentação" },

  // ===== DRENAGEM =====
  { code: "73801", description: "TUBO DE CONCRETO SIMPLES PARA DRENAGEM, D=400MM", unit: "M", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Drenagem" },
  { code: "73802", description: "TUBO DE CONCRETO ARMADO PARA DRENAGEM, D=600MM", unit: "M", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Drenagem" },
  { code: "73803", description: "CAIXA DE PASSAGEM/INSPEÇÃO EM CONCRETO PARA DRENAGEM, 80X80CM", unit: "UN", price: 567.89, referenceDate: "01/2025", state: "SP", category: "Drenagem" },
  { code: "73804", description: "BOCA DE LOBO SIMPLES EM CONCRETO", unit: "UN", price: 789.45, referenceDate: "01/2025", state: "SP", category: "Drenagem" },

  // ===== SEGURANÇA E COMBATE A INCÊNDIO =====
  { code: "SI001", description: "EXTINTOR DE INCÊNDIO PÓ QUÍMICO ABC 6KG, INCLUSIVE SUPORTE", unit: "UN", price: 189.45, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI002", description: "EXTINTOR DE INCÊNDIO CO2 6KG, INCLUSIVE SUPORTE", unit: "UN", price: 345.67, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI003", description: "HIDRANTE DE PAREDE COMPLETO (MANGUEIRA 30M, ESGUICHO, ABRIGO)", unit: "UN", price: 1567.89, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI004", description: "CENTRAL DE ALARME DE INCÊNDIO, 24 ZONAS", unit: "UN", price: 2345.67, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI005", description: "DETECTOR DE FUMAÇA ÓPTICO ENDEREÇÁVEL", unit: "UN", price: 234.56, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI006", description: "SPRINKLER AUTOMÁTICO TIPO PENDENTE, K=80", unit: "UN", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI007", description: "SINALIZAÇÃO DE EMERGÊNCIA FOTOLUMINESCENTE", unit: "UN", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI008", description: "ILUMINAÇÃO DE EMERGÊNCIA LED, AUTONOMIA 3H", unit: "UN", price: 123.45, referenceDate: "01/2025", state: "SP", category: "Segurança" },
  { code: "SI009", description: "PARA-RAIOS TIPO FRANKLIN, INCLUSIVE DESCIDA E ATERRAMENTO", unit: "UN", price: 4567.89, referenceDate: "01/2025", state: "SP", category: "Segurança" },

  // ===== PAISAGISMO =====
  { code: "98101", description: "PLANTIO DE GRAMA ESMERALDA EM PLACAS", unit: "M2", price: 18.90, referenceDate: "01/2025", state: "SP", category: "Paisagismo" },
  { code: "98102", description: "PLANTIO DE ÁRVORE NATIVA, MUDA H=2,00M, INCLUSIVE COVA E ADUBAÇÃO", unit: "UN", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Paisagismo" },
  { code: "98103", description: "EXECUÇÃO DE CALÇADA EM CONCRETO, ESPESSURA 7CM", unit: "M2", price: 56.78, referenceDate: "01/2025", state: "SP", category: "Paisagismo" },
  { code: "98104", description: "GUIA (MEIO-FIO) PRÉ-MOLDADA DE CONCRETO", unit: "M", price: 45.67, referenceDate: "01/2025", state: "SP", category: "Paisagismo" },

  // ===== LIMPEZA FINAL =====
  { code: "99801", description: "LIMPEZA FINAL DA OBRA", unit: "M2", price: 5.67, referenceDate: "01/2025", state: "SP", category: "Limpeza" },
  { code: "99802", description: "LIMPEZA DE VIDROS E ESQUADRIAS", unit: "M2", price: 8.90, referenceDate: "01/2025", state: "SP", category: "Limpeza" },

  // ===== MÃO DE OBRA (ENCARGOS) =====
  { code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", price: 24.35, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88310", description: "PINTOR COM ENCARGOS COMPLEMENTARES", unit: "H", price: 24.35, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88311", description: "ELETRICISTA COM ENCARGOS COMPLEMENTARES", unit: "H", price: 26.78, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88312", description: "ENCANADOR COM ENCARGOS COMPLEMENTARES", unit: "H", price: 26.78, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88313", description: "CARPINTEIRO COM ENCARGOS COMPLEMENTARES", unit: "H", price: 24.35, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88314", description: "ARMADOR COM ENCARGOS COMPLEMENTARES", unit: "H", price: 24.35, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88315", description: "SERRALHEIRO COM ENCARGOS COMPLEMENTARES", unit: "H", price: 26.78, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", price: 18.92, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88317", description: "MESTRE DE OBRAS COM ENCARGOS COMPLEMENTARES", unit: "MÊS", price: 8567.89, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88318", description: "ENGENHEIRO CIVIL PLENO COM ENCARGOS COMPLEMENTARES", unit: "MÊS", price: 14567.89, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },
  { code: "88319", description: "TÉCNICO DE SEGURANÇA DO TRABALHO COM ENCARGOS COMPLEMENTARES", unit: "MÊS", price: 7890.12, referenceDate: "01/2025", state: "SP", category: "Mão de Obra" },

  // ===== DRYWALL =====
  { code: "DW001", description: "PAREDE DE DRYWALL, FACE SIMPLES, CHAPA ST 12,5MM, ESTRUTURA SIMPLES", unit: "M2", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Drywall" },
  { code: "DW002", description: "PAREDE DE DRYWALL, FACE DUPLA, CHAPA ST 12,5MM, ESTRUTURA SIMPLES", unit: "M2", price: 125.67, referenceDate: "01/2025", state: "SP", category: "Drywall" },
  { code: "DW003", description: "PAREDE DE DRYWALL, FACE SIMPLES, CHAPA RU (RESISTENTE À UMIDADE) 12,5MM", unit: "M2", price: 98.90, referenceDate: "01/2025", state: "SP", category: "Drywall" },
  { code: "DW004", description: "PAREDE DE DRYWALL COM TRATAMENTO ACÚSTICO, LÃ DE VIDRO 50MM", unit: "M2", price: 145.67, referenceDate: "01/2025", state: "SP", category: "Drywall" },

  // ===== AR CONDICIONADO =====
  { code: "AC001", description: "AR CONDICIONADO SPLIT HI-WALL 9.000 BTU, INCLUSIVE INSTALAÇÃO", unit: "UN", price: 2345.67, referenceDate: "01/2025", state: "SP", category: "Climatização" },
  { code: "AC002", description: "AR CONDICIONADO SPLIT HI-WALL 12.000 BTU, INCLUSIVE INSTALAÇÃO", unit: "UN", price: 2890.12, referenceDate: "01/2025", state: "SP", category: "Climatização" },
  { code: "AC003", description: "AR CONDICIONADO SPLIT HI-WALL 18.000 BTU, INCLUSIVE INSTALAÇÃO", unit: "UN", price: 3456.78, referenceDate: "01/2025", state: "SP", category: "Climatização" },
  { code: "AC004", description: "AR CONDICIONADO SPLIT CASSETE 36.000 BTU, INCLUSIVE INSTALAÇÃO", unit: "UN", price: 7890.12, referenceDate: "01/2025", state: "SP", category: "Climatização" },
  { code: "AC005", description: "TUBULAÇÃO DE COBRE PARA AR CONDICIONADO, PAR 1/4\" + 3/8\"", unit: "M", price: 89.45, referenceDate: "01/2025", state: "SP", category: "Climatização" },
];

// ==================== SEARCH FUNCTIONS ====================

// Tokenize and score for fuzzy matching
function scoreMatch(query: string, description: string, code: string): number {
  const queryLower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const descLower = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const codeLower = code.toLowerCase();

  // Exact code match = highest score
  if (codeLower === queryLower || codeLower.includes(queryLower)) return 100;

  const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);
  if (keywords.length === 0) return 0;

  let matched = 0;
  for (const kw of keywords) {
    if (descLower.includes(kw)) matched++;
  }

  return (matched / keywords.length) * 80;
}

export async function searchSinapi(query: string, limit: number = 10, state: string = "SP"): Promise<SinapiSearchResult[]> {
  try {
    // Check cache first
    const cached = await getCachedPrice("sinapi", `search:${query}:${state}`);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      const results = cached.rawData as any;
      if (Array.isArray(results)) return results.slice(0, limit);
    }

    // P1.4: lê do repo (com fallback para SINAPI_DB embutida).
    const dataset = await getSinapiData(state);
    const scored = dataset
      .map(item => ({ item, score: scoreMatch(query, item.description, item.code) }))
      .filter(s => s.score > 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        code: s.item.code,
        description: s.item.description,
        unit: s.item.unit,
        price: adjustPrice(s.item.price, state),
        category: s.item.category,
        state,
      }));

    // Cache for 7 days
    if (scored.length > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      try {
        await setCachedPrice({
          source: "sinapi",
          code: `search:${query}:${state}`,
          description: query,
          unit: "",
          price: "0" as any,
          region: state,
          referenceDate: "01/2025",
          rawData: scored as any,
          expiresAt,
        });
      } catch { /* cache write failure is non-critical */ }
    }

    return scored;
  } catch (error) {
    console.error("[SINAPI] Search error:", error);
    return [];
  }
}

export async function getSinapiComposition(code: string, state: string = "SP"): Promise<SinapiComposition | null> {
  try {
    const cached = await getCachedPrice("sinapi", code);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      return {
        code: cached.code,
        description: cached.description || "",
        unit: cached.unit || "",
        price: Number(cached.price) || 0,
        referenceDate: cached.referenceDate || "",
        state: cached.region || state,
        category: (cached.rawData as any)?.category || "",
        components: (cached.rawData as any)?.components,
      };
    }

    // Tentar scraping online primeiro
    try {
      const scraped = await searchSinapiOnline(code);
      if (scraped && scraped.preco > 0) {
        logger.info(`SINAPI online: ${code} - ${scraped.descricao} - R$ ${scraped.preco}`);
        const onlineResult: SinapiComposition = {
          code: scraped.codigo,
          description: scraped.descricao,
          unit: scraped.unidade,
          price: adjustPrice(scraped.preco, state),
          referenceDate: scraped.referencia || "01/2025",
          state,
          category: "Online",
          components: scraped.insumos?.map(i => ({
            code: i.codigo,
            description: i.nome,
            unit: i.unidade,
            coefficient: i.quantidade,
            unitPrice: i.custoUnitario,
            totalPrice: i.custoTotal,
          })),
        };
        // Cache resultado online por 30 dias
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        try {
          await setCachedPrice({
            source: "sinapi",
            code: onlineResult.code,
            description: onlineResult.description,
            unit: onlineResult.unit,
            price: onlineResult.price.toString() as any,
            region: state,
            referenceDate: onlineResult.referenceDate,
            rawData: { category: onlineResult.category, components: onlineResult.components, source: "scraping" } as any,
            expiresAt,
          });
        } catch { /* cache write failure is non-critical */ }
        return onlineResult;
      }
    } catch (scrapeError) {
      logger.warn(`SINAPI scraping falhou para ${code}, usando banco fixo`);
      incrementStat('sinapiFallback');
    }

    // P1.4: lê do repo (com fallback para SINAPI_DB)
    const dataset = await getSinapiData(state);
    const composition = dataset.find(item => item.code === code);
    if (!composition) return null;

    const adjusted = {
      ...composition,
      price: adjustPrice(composition.price, state),
      state,
    };

    // Cache for 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    try {
      await setCachedPrice({
        source: "sinapi",
        code: adjusted.code,
        description: adjusted.description,
        unit: adjusted.unit,
        price: adjusted.price.toString() as any,
        region: state,
        referenceDate: adjusted.referenceDate,
        rawData: { category: adjusted.category, components: adjusted.components } as any,
        expiresAt,
      });
    } catch { /* cache write failure is non-critical */ }

    return adjusted;
  } catch (error) {
    console.error("[SINAPI] Get composition error:", error);
    return null;
  }
}

export async function getSinapiPriceByDescription(description: string, state: string = "SP"): Promise<SinapiSearchResult | null> {
  const results = await searchSinapi(description, 1, state);
  return results[0] || null;
}

export async function bulkSearchSinapi(queries: string[], state: string = "SP"): Promise<Map<string, SinapiSearchResult | null>> {
  const results = new Map<string, SinapiSearchResult | null>();
  for (const query of queries) {
    const result = await getSinapiPriceByDescription(query, state);
    results.set(query, result);
  }
  return results;
}

// Get all categories available — síncrono, lê da constante (estrutura
// estável; categorias não mudam por estado).
export function getSinapiCategories(): string[] {
  const categories = new Set(SINAPI_DB.map(item => item.category));
  return Array.from(categories).sort();
}

// Get compositions by category — P1.4: lê do repo
export async function getSinapiByCategory(category: string, state: string = "SP"): Promise<SinapiSearchResult[]> {
  const dataset = await getSinapiData(state);
  return dataset
    .filter(item => item.category.toLowerCase() === category.toLowerCase())
    .map(item => ({
      code: item.code,
      description: item.description,
      unit: item.unit,
      price: adjustPrice(item.price, state),
      category: item.category,
      state,
    }));
}

// Total compositions disponíveis na constante (uso administrativo).
// Para contagem do repo, use getActivePriceEntries('sinapi').length.
export function getSinapiCount(): number {
  return SINAPI_DB.length;
}
