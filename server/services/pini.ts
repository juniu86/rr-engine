import { setCachedPrice, getCachedPrice } from "../db";
import { searchPiniOnline } from "./piniScraper";
import { logger, incrementStat } from "../utils/logger";
import { adjustPriceForRegion, getRegionFactor } from "../../shared/regionFactors";
import { getActivePriceEntries } from "./priceDatabaseRepo";

// ==================== P1.4: cache em memória do repo ====================
// PINI_DATABASE original usa "São Paulo" como region; o repo armazena
// como state="SP". Este mapping converte. Cache lazy populado no primeiro
// uso, com fallback para a constante quando o banco está indisponível.
const STATE_TO_REGION: Record<string, string> = {
  SP: "São Paulo",
  RJ: "Rio de Janeiro",
};
const piniCacheByRegion = new Map<string, PiniComposition[]>();

async function loadPiniFromRepo(region: string): Promise<PiniComposition[]> {
  const state = Object.entries(STATE_TO_REGION).find(([_, r]) => r === region)?.[0] ?? "SP";
  const entries = await getActivePriceEntries("pini", state);
  return entries.map(e => {
    const components = (e.componentsJson as Array<{
      type?: "labor" | "material" | "equipment";
      code?: string;
      description: string;
      unit: string;
      coefficient: number;
      unitCost: number;
    }> | null) ?? null;

    let laborCost = 0;
    let materialCost = 0;
    let equipmentCost = 0;
    if (components) {
      for (const c of components) {
        const total = c.coefficient * c.unitCost;
        if (c.type === "labor") laborCost += total;
        else if (c.type === "material") materialCost += total;
        else if (c.type === "equipment") equipmentCost += total;
      }
    }

    return {
      code: e.code,
      description: e.description,
      unit: e.unit,
      price: parseFloat(e.price as unknown as string),
      region: STATE_TO_REGION[e.state ?? "SP"] ?? region,
      referenceDate: formatPiniRefDate(e.referenceDate),
      laborCost,
      materialCost,
      equipmentCost,
      components: components?.map(c => ({
        type: (c.type ?? "material") as "labor" | "material" | "equipment",
        code: c.code ?? "",
        description: c.description,
        unit: c.unit,
        coefficient: c.coefficient,
        unitPrice: c.unitCost,
        totalPrice: c.coefficient * c.unitCost,
      })),
    };
  });
}

function formatPiniRefDate(d: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${mm}/${date.getUTCFullYear()}`;
}

/**
 * Retorna composições PINI para uma região. Estratégia: cache → repo →
 * fallback constante (mesma do SINAPI).
 */
export async function getPiniData(region: string = "São Paulo"): Promise<PiniComposition[]> {
  const cached = piniCacheByRegion.get(region);
  if (cached) return cached;

  try {
    const fromRepo = await loadPiniFromRepo(region);
    if (fromRepo.length > 0) {
      piniCacheByRegion.set(region, fromRepo);
      return fromRepo;
    }
  } catch (err) {
    logger.warn("[PINI] repo indisponível, usando constante embutida", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return PINI_DATABASE;
}

export function clearPiniCache(): void {
  piniCacheByRegion.clear();
}

/**
 * Leitura síncrona do cache em memória. Retorna a constante PINI_DATABASE
 * embutida quando o cache da região pedida ainda não foi populado.
 */
export function getPiniDataSync(region: string = "São Paulo"): PiniComposition[] {
  return piniCacheByRegion.get(region) ?? PINI_DATABASE;
}

export interface PiniComposition {
  code: string;
  description: string;
  unit: string;
  price: number;
  region: string;
  referenceDate: string;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  components?: {
    type: "labor" | "material" | "equipment";
    code: string;
    description: string;
    unit: string;
    coefficient: number;
    unitPrice: number;
    totalPrice: number;
  }[];
}

export interface PiniSearchResult {
  code: string;
  description: string;
  unit: string;
  price: number;
  region: string;
}

function adjustPrice(basePrice: number, region: string): number {
  return adjustPriceForRegion(basePrice, region);
}

// ==================== PINI TCPO DATABASE (Ref: SP, 01/2025) ====================
// Composições complementares ao SINAPI, foco em acabamentos e serviços especializados
export const PINI_DATABASE: PiniComposition[] = [
  // ===== ALVENARIA E VEDAÇÃO =====
  {
    code: "TCPO-02.PARE.ALVE.001",
    description: "Alvenaria de vedação com bloco cerâmico furado 9x19x19cm, espessura 9cm, juntas de 10mm com argamassa mista de cimento, cal hidratada e areia sem peneirar traço 1:2:8",
    unit: "m²", price: 78.92, region: "São Paulo", referenceDate: "01/2025",
    laborCost: 32.45, materialCost: 46.47, equipmentCost: 0,
    components: [
      { type: "labor", code: "L001", description: "Pedreiro", unit: "h", coefficient: 0.95, unitPrice: 28.50, totalPrice: 27.08 },
      { type: "labor", code: "L002", description: "Servente", unit: "h", coefficient: 0.32, unitPrice: 16.80, totalPrice: 5.38 },
      { type: "material", code: "M001", description: "Bloco cerâmico 9x19x19cm", unit: "un", coefficient: 25.5, unitPrice: 1.05, totalPrice: 26.78 },
      { type: "material", code: "M002", description: "Argamassa de assentamento", unit: "m³", coefficient: 0.012, unitPrice: 485.75, totalPrice: 5.83 },
    ],
  },
  { code: "TCPO-02.PARE.ALVE.002", description: "Alvenaria de vedação com bloco cerâmico furado 14x19x19cm, espessura 14cm", unit: "m²", price: 98.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 38.90, materialCost: 59.55, equipmentCost: 0 },
  { code: "TCPO-02.PARE.ALVE.003", description: "Alvenaria de vedação com bloco de concreto 14x19x39cm, espessura 14cm", unit: "m²", price: 92.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 35.67, materialCost: 56.67, equipmentCost: 0 },
  { code: "TCPO-02.PARE.DRYW.001", description: "Parede de drywall com chapa ST 12,5mm, face simples, estrutura metálica", unit: "m²", price: 95.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 38.45, materialCost: 57.22, equipmentCost: 0 },
  { code: "TCPO-02.PARE.DRYW.002", description: "Parede de drywall com chapa RU 12,5mm (resistente à umidade), face simples", unit: "m²", price: 105.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 38.45, materialCost: 66.89, equipmentCost: 0 },

  // ===== REVESTIMENTO =====
  { code: "TCPO-02.REVE.ARGA.001", description: "Revestimento de parede com argamassa de cimento e areia, traço 1:4, espessura 20mm", unit: "m²", price: 35.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.45, materialCost: 17.22, equipmentCost: 0 },
  { code: "TCPO-02.REVE.ARGA.002", description: "Revestimento de parede com argamassa de cimento, cal e areia, traço 1:2:8, espessura 25mm", unit: "m²", price: 32.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 16.78, materialCost: 15.67, equipmentCost: 0 },
  { code: "TCPO-02.REVE.MASS.001", description: "Massa corrida PVA para paredes internas, duas demãos, lixamento entre demãos", unit: "m²", price: 14.56, region: "São Paulo", referenceDate: "01/2025", laborCost: 7.89, materialCost: 6.67, equipmentCost: 0 },
  { code: "TCPO-02.REVE.MASS.002", description: "Massa acrílica para paredes externas, duas demãos", unit: "m²", price: 17.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 8.90, materialCost: 8.99, equipmentCost: 0 },
  { code: "TCPO-02.REVE.CHAP.001", description: "Chapisco com argamassa de cimento e areia traço 1:3, aplicado com colher", unit: "m²", price: 6.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 3.45, materialCost: 3.33, equipmentCost: 0 },
  { code: "TCPO-02.REVE.CERA.001", description: "Revestimento cerâmico para parede, placas 33x45cm, argamassa colante ACII", unit: "m²", price: 62.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 24.56, materialCost: 37.78, equipmentCost: 0 },
  { code: "TCPO-02.REVE.PORC.001", description: "Revestimento em porcelanato retificado para parede, placas 60x60cm", unit: "m²", price: 98.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 32.45, materialCost: 66.00, equipmentCost: 0 },

  // ===== PISOS =====
  { code: "TCPO-02.PISO.CERA.001", description: "Piso cerâmico esmaltado 45x45cm, PEI-4, assentado com argamassa colante sobre contrapiso", unit: "m²", price: 95.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 28.90, materialCost: 66.44, equipmentCost: 0 },
  { code: "TCPO-02.PISO.PORC.001", description: "Piso em porcelanato esmaltado retificado 60x60cm, assentado com argamassa colante ACIII", unit: "m²", price: 135.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 34.56, materialCost: 101.11, equipmentCost: 0 },
  { code: "TCPO-02.PISO.PORC.002", description: "Piso em porcelanato técnico polido 60x60cm", unit: "m²", price: 156.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 38.90, materialCost: 117.88, equipmentCost: 0 },
  { code: "TCPO-02.PISO.VINI.001", description: "Piso vinílico em régua, espessura 2mm, colado", unit: "m²", price: 78.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.90, materialCost: 60.00, equipmentCost: 0 },
  { code: "TCPO-02.PISO.LAMI.001", description: "Piso laminado de madeira, espessura 7mm, inclusive manta", unit: "m²", price: 89.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 22.34, materialCost: 67.11, equipmentCost: 0 },
  { code: "TCPO-02.PISO.GRAN.001", description: "Piso em granito polido, espessura 2cm, assentado com argamassa", unit: "m²", price: 245.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 56.78, materialCost: 188.89, equipmentCost: 0 },
  { code: "TCPO-02.CONT.ARGA.001", description: "Contrapiso em argamassa de cimento e areia traço 1:4, espessura 3cm", unit: "m²", price: 38.92, region: "São Paulo", referenceDate: "01/2025", laborCost: 15.67, materialCost: 23.25, equipmentCost: 0 },
  { code: "TCPO-02.CONT.ARGA.002", description: "Contrapiso em argamassa de cimento e areia traço 1:4, espessura 5cm", unit: "m²", price: 48.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.45, materialCost: 30.45, equipmentCost: 0 },
  { code: "TCPO-02.PISO.CONC.001", description: "Piso industrial em concreto polido, espessura 10cm, FCK=30MPa", unit: "m²", price: 98.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 28.90, materialCost: 56.33, equipmentCost: 13.22 },

  // ===== PINTURA =====
  {
    code: "TCPO-02.PINT.LATE.001",
    description: "Pintura látex acrílica em paredes internas, duas demãos, sobre massa corrida",
    unit: "m²", price: 14.56, region: "São Paulo", referenceDate: "01/2025",
    laborCost: 6.78, materialCost: 7.78, equipmentCost: 0,
    components: [
      { type: "labor", code: "L010", description: "Pintor", unit: "h", coefficient: 0.18, unitPrice: 28.50, totalPrice: 5.13 },
      { type: "labor", code: "L002", description: "Servente", unit: "h", coefficient: 0.10, unitPrice: 16.50, totalPrice: 1.65 },
      { type: "material", code: "M010", description: "Tinta látex acrílica premium", unit: "l", coefficient: 0.33, unitPrice: 18.45, totalPrice: 6.09 },
      { type: "material", code: "M011", description: "Lixa, rolo e bandeja", unit: "un", coefficient: 0.05, unitPrice: 33.80, totalPrice: 1.69 },
    ],
  },
  { code: "TCPO-02.PINT.LATE.002", description: "Pintura látex acrílica em paredes internas, três demãos", unit: "m²", price: 18.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 9.45, materialCost: 9.45, equipmentCost: 0 },
  { code: "TCPO-02.PINT.LATE.003", description: "Pintura látex PVA em paredes internas, duas demãos", unit: "m²", price: 11.23, region: "São Paulo", referenceDate: "01/2025", laborCost: 6.78, materialCost: 4.45, equipmentCost: 0 },
  { code: "TCPO-02.PINT.LATE.004", description: "Pintura látex acrílica em teto, duas demãos", unit: "m²", price: 16.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 8.90, materialCost: 7.88, equipmentCost: 0 },
  { code: "TCPO-02.PINT.ESMA.001", description: "Pintura esmalte sintético brilhante em esquadrias de madeira, duas demãos", unit: "m²", price: 22.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 12.34, materialCost: 10.00, equipmentCost: 0 },
  { code: "TCPO-02.PINT.ESMA.002", description: "Pintura esmalte sintético em superfícies metálicas, duas demãos, inclusive fundo anticorrosivo", unit: "m²", price: 28.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 14.56, materialCost: 14.34, equipmentCost: 0 },
  { code: "TCPO-02.PINT.EPOX.001", description: "Pintura epóxi em piso de concreto, duas demãos", unit: "m²", price: 38.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 12.34, materialCost: 26.11, equipmentCost: 0 },
  { code: "TCPO-02.PINT.TEXT.001", description: "Pintura texturizada acrílica em paredes externas, rolo de espuma", unit: "m²", price: 32.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 12.34, materialCost: 20.11, equipmentCost: 0 },
  { code: "TCPO-02.PINT.SELA.001", description: "Aplicação de fundo selador acrílico em paredes, uma demão", unit: "m²", price: 5.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 2.34, materialCost: 3.33, equipmentCost: 0 },

  // ===== DEMOLIÇÃO =====
  { code: "TCPO-02.DEMO.ALVE.001", description: "Demolição de alvenaria de tijolo furado, inclusive afastamento e empilhamento", unit: "m³", price: 52.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 52.34, materialCost: 0, equipmentCost: 0 },
  { code: "TCPO-02.DEMO.PISO.001", description: "Demolição de piso cerâmico, inclusive contrapiso, espessura até 5cm", unit: "m²", price: 18.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.45, materialCost: 0, equipmentCost: 0 },
  { code: "TCPO-02.DEMO.REVE.001", description: "Demolição de revestimento cerâmico de parede", unit: "m²", price: 16.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 16.78, materialCost: 0, equipmentCost: 0 },
  { code: "TCPO-02.DEMO.FORR.001", description: "Demolição de forro de gesso", unit: "m²", price: 9.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 9.45, materialCost: 0, equipmentCost: 0 },
  { code: "TCPO-02.DEMO.CONC.001", description: "Demolição de concreto armado com martelete pneumático", unit: "m³", price: 378.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 189.45, materialCost: 0, equipmentCost: 189.45 },

  // ===== INSTALAÇÕES ELÉTRICAS =====
  { code: "TCPO-03.ELET.PONT.001", description: "Ponto de luz no teto, com eletroduto PVC rígido, caixa 4x2, fiação e interruptor simples", unit: "un", price: 156.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 67.89, materialCost: 88.89, equipmentCost: 0 },
  { code: "TCPO-03.ELET.TOMA.001", description: "Ponto de tomada 2P+T 10A, com eletroduto PVC rígido, caixa 4x2 e fiação", unit: "un", price: 189.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 72.34, materialCost: 117.11, equipmentCost: 0 },
  { code: "TCPO-03.ELET.TOMA.002", description: "Ponto de tomada 2P+T 20A para equipamentos de alta potência", unit: "un", price: 245.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 89.45, materialCost: 156.22, equipmentCost: 0 },
  { code: "TCPO-03.ELET.QUAD.001", description: "Quadro de distribuição para 18 disjuntores, com barramento e DPS", unit: "un", price: 478.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 145.67, materialCost: 333.23, equipmentCost: 0 },
  { code: "TCPO-03.ELET.LUMI.001", description: "Luminária de embutir LED painel 18W, 6500K", unit: "un", price: 98.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 34.56, materialCost: 63.89, equipmentCost: 0 },
  { code: "TCPO-03.ELET.LUMI.002", description: "Luminária de sobrepor LED tubular 2x18W", unit: "un", price: 156.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 111.11, equipmentCost: 0 },

  // ===== INSTALAÇÕES HIDRÁULICAS =====
  { code: "TCPO-03.HIDR.AGUA.001", description: "Ponto de água fria em PVC soldável, inclusive conexões", unit: "un", price: 245.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 89.45, materialCost: 156.22, equipmentCost: 0 },
  { code: "TCPO-03.HIDR.ESGO.001", description: "Ponto de esgoto em PVC série normal, inclusive conexões", unit: "un", price: 212.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 78.90, materialCost: 133.44, equipmentCost: 0 },
  { code: "TCPO-03.HIDR.VASO.001", description: "Vaso sanitário com caixa acoplada, louça branca, inclusive instalação", unit: "un", price: 589.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 89.45, materialCost: 500.00, equipmentCost: 0 },
  { code: "TCPO-03.HIDR.LAVA.001", description: "Lavatório de louça branca com coluna, inclusive torneira e instalação", unit: "un", price: 378.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 78.90, materialCost: 300.00, equipmentCost: 0 },
  { code: "TCPO-03.HIDR.PIAA.001", description: "Pia de cozinha em aço inox 1,20x0,50m com torneira e sifão", unit: "un", price: 489.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 89.45, materialCost: 400.00, equipmentCost: 0 },
  { code: "TCPO-03.HIDR.CHUV.001", description: "Chuveiro elétrico com resistência, inclusive instalação", unit: "un", price: 145.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 56.78, materialCost: 88.89, equipmentCost: 0 },

  // ===== FORRO =====
  { code: "TCPO-02.FORR.GESS.001", description: "Forro de gesso em placas 60x60cm, estruturado, para ambientes comerciais", unit: "m²", price: 72.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 28.90, materialCost: 43.55, equipmentCost: 0 },
  { code: "TCPO-02.FORR.DRYW.001", description: "Forro de gesso acartonado (drywall), estruturado com perfis metálicos", unit: "m²", price: 82.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 32.45, materialCost: 49.89, equipmentCost: 0 },
  { code: "TCPO-02.FORR.PVC.001", description: "Forro de PVC, réguas de 200mm, inclusive estrutura de fixação", unit: "m²", price: 58.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 22.34, materialCost: 36.56, equipmentCost: 0 },

  // ===== CONCRETO =====
  { code: "TCPO-01.CONC.USIN.001", description: "Concreto usinado bombeado fck=25MPa, inclusive lançamento e adensamento", unit: "m³", price: 525.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 456.78, equipmentCost: 23.22 },
  { code: "TCPO-01.CONC.USIN.002", description: "Concreto usinado bombeado fck=30MPa, inclusive lançamento e adensamento", unit: "m³", price: 578.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 510.01, equipmentCost: 23.22 },
  { code: "TCPO-01.CONC.FORM.001", description: "Forma de madeira para pilares retangulares, pé-direito simples", unit: "m²", price: 92.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 46.67, equipmentCost: 0 },
  { code: "TCPO-01.CONC.ARMA.001", description: "Armação de aço CA-50, diâmetro 10mm, corte, dobra e montagem", unit: "kg", price: 15.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 6.78, materialCost: 8.89, equipmentCost: 0 },

  // ===== IMPERMEABILIZAÇÃO =====
  { code: "TCPO-02.IMPE.MANT.001", description: "Impermeabilização com manta asfáltica 3mm, inclusive primer", unit: "m²", price: 89.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 34.56, materialCost: 54.89, equipmentCost: 0 },
  { code: "TCPO-02.IMPE.MANT.002", description: "Impermeabilização com manta asfáltica 4mm, inclusive primer e proteção mecânica", unit: "m²", price: 118.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 42.34, materialCost: 76.56, equipmentCost: 0 },
  { code: "TCPO-02.IMPE.ARGA.001", description: "Impermeabilização com argamassa polimérica flexível, duas demãos", unit: "m²", price: 48.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.90, materialCost: 30.00, equipmentCost: 0 },

  // ===== ESQUADRIAS =====
  { code: "TCPO-02.PORT.MADE.001", description: "Porta de madeira semi-oca 80x210cm, com batente, dobradiças e fechadura", unit: "un", price: 645.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 123.45, materialCost: 522.33, equipmentCost: 0 },
  { code: "TCPO-02.PORT.MADE.002", description: "Porta de madeira semi-oca 70x210cm, com batente e dobradiças", unit: "un", price: 578.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 112.34, materialCost: 466.56, equipmentCost: 0 },
  { code: "TCPO-02.PORT.ALUM.001", description: "Porta de alumínio de abrir 90x210cm, com vidro temperado 8mm", unit: "un", price: 1567.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 234.56, materialCost: 1333.33, equipmentCost: 0 },
  { code: "TCPO-02.JANE.ALUM.001", description: "Janela de alumínio de correr, 2 folhas, com vidro 4mm, 1,20x1,20m", unit: "un", price: 589.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 89.45, materialCost: 500.00, equipmentCost: 0 },
  { code: "TCPO-02.JANE.ALUM.002", description: "Janela de alumínio maxim-ar, com vidro 4mm, 0,60x0,60m", unit: "un", price: 298.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 56.78, materialCost: 242.12, equipmentCost: 0 },
  { code: "TCPO-02.PORT.VIDR.001", description: "Porta de vidro temperado 10mm, 2 folhas de correr, 2,00x2,10m", unit: "un", price: 2456.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 345.67, materialCost: 2111.11, equipmentCost: 0 },

  // ===== COBERTURA =====
  { code: "TCPO-02.COBE.META.001", description: "Cobertura em telha metálica trapezoidal, espessura 0,50mm, inclusive fixação", unit: "m²", price: 82.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 22.34, materialCost: 60.00, equipmentCost: 0 },
  { code: "TCPO-02.COBE.CERA.001", description: "Cobertura em telha cerâmica tipo colonial, inclusive transporte vertical", unit: "m²", price: 58.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 22.34, materialCost: 36.56, equipmentCost: 0 },
  { code: "TCPO-02.COBE.ESTR.001", description: "Estrutura de madeira para cobertura, tesoura vão até 8m", unit: "m²", price: 92.34, region: "São Paulo", referenceDate: "01/2025", laborCost: 34.56, materialCost: 57.78, equipmentCost: 0 },
  { code: "TCPO-02.COBE.CALH.001", description: "Calha em chapa galvanizada nº 26, desenvolvimento 33cm", unit: "m", price: 58.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 22.34, materialCost: 36.56, equipmentCost: 0 },

  // ===== POSTOS DE COMBUSTÍVEL (TCPO ESPECÍFICO) =====
  { code: "TCPO-PC.TANQ.001", description: "Tanque subterrâneo jaquetado parede dupla 15.000L, PEAD, inclusive instalação e teste", unit: "un", price: 48567.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 8567.89, materialCost: 35000.00, equipmentCost: 5000.00 },
  { code: "TCPO-PC.TANQ.002", description: "Tanque subterrâneo jaquetado parede dupla 30.000L, PEAD, inclusive instalação e teste", unit: "un", price: 72345.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 12345.67, materialCost: 52000.00, equipmentCost: 8000.00 },
  { code: "TCPO-PC.BOMB.001", description: "Bomba de abastecimento eletrônica dupla, com filtro, mangueira e bico automático", unit: "un", price: 25678.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 3678.90, materialCost: 20000.00, equipmentCost: 2000.00 },
  { code: "TCPO-PC.COBE.001", description: "Cobertura metálica para pista de abastecimento, estrutura em aço galvanizado, testeira em ACM", unit: "m²", price: 589.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 145.67, materialCost: 378.78, equipmentCost: 65.00 },
  { code: "TCPO-PC.PISO.001", description: "Piso em concreto armado para pista de abastecimento, FCK=30MPa, espessura 15cm, com junta de dilatação", unit: "m²", price: 156.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 89.89, equipmentCost: 21.22 },
  { code: "TCPO-PC.DREN.001", description: "Canaleta de drenagem oleosa com grelha metálica, largura 30cm", unit: "m", price: 245.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 67.89, materialCost: 177.78, equipmentCost: 0 },
  { code: "TCPO-PC.SAO.001", description: "Caixa separadora de água e óleo (SAO), capacidade 1.000L, em PRFV", unit: "un", price: 9234.56, region: "São Paulo", referenceDate: "01/2025", laborCost: 2234.56, materialCost: 7000.00, equipmentCost: 0 },
  { code: "TCPO-PC.MONI.001", description: "Sistema de monitoramento ambiental de tanques (sump, sensor de interstício, console)", unit: "un", price: 16789.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 4789.45, materialCost: 12000.00, equipmentCost: 0 },
  { code: "TCPO-PC.TUBU.001", description: "Tubulação PEAD para combustível, diâmetro 2\", inclusive conexões", unit: "m", price: 95.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 28.90, materialCost: 66.77, equipmentCost: 0 },
  { code: "TCPO-PC.SPIL.001", description: "Spill container para boca de descarga de tanque", unit: "un", price: 2567.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 567.89, materialCost: 2000.00, equipmentCost: 0 },
  { code: "TCPO-PC.TOTE.001", description: "Totem de preços luminoso, face dupla, altura 6m, inclusive fundação", unit: "un", price: 19567.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 3567.89, materialCost: 16000.00, equipmentCost: 0 },
  { code: "TCPO-PC.TEST.001", description: "Testada (fachada) em ACM com iluminação LED integrada", unit: "m²", price: 478.90, region: "São Paulo", referenceDate: "01/2025", laborCost: 123.45, materialCost: 355.45, equipmentCost: 0 },

  // ===== BANCADAS E ACABAMENTOS COMERCIAIS =====
  { code: "TCPO-02.BANC.GRAN.001", description: "Bancada de granito polido, espessura 3cm, inclusive cuba e instalação", unit: "m²", price: 567.89, region: "São Paulo", referenceDate: "01/2025", laborCost: 145.67, materialCost: 422.22, equipmentCost: 0 },
  { code: "TCPO-02.BANC.MARM.001", description: "Bancada de mármore branco, espessura 3cm, inclusive cuba e instalação", unit: "m²", price: 789.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 167.89, materialCost: 621.56, equipmentCost: 0 },
  { code: "TCPO-02.BANC.QUAR.001", description: "Bancada de quartzo (silestone), espessura 2cm, inclusive cuba e instalação", unit: "m²", price: 1234.56, region: "São Paulo", referenceDate: "01/2025", laborCost: 234.56, materialCost: 1000.00, equipmentCost: 0 },
  { code: "TCPO-02.DIVI.GRAN.001", description: "Divisória de granito para box de banheiro, espessura 3cm, altura 1,80m", unit: "m²", price: 456.78, region: "São Paulo", referenceDate: "01/2025", laborCost: 112.34, materialCost: 344.44, equipmentCost: 0 },

  // ===== ACESSIBILIDADE =====
  { code: "TCPO-02.ACES.RAMP.001", description: "Rampa de acessibilidade em concreto, inclusive corrimão e guarda-corpo", unit: "m²", price: 345.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 123.45, materialCost: 222.22, equipmentCost: 0 },
  { code: "TCPO-02.ACES.BARR.001", description: "Barra de apoio em aço inox para banheiro PNE, L=80cm", unit: "un", price: 189.45, region: "São Paulo", referenceDate: "01/2025", laborCost: 45.67, materialCost: 143.78, equipmentCost: 0 },
  { code: "TCPO-02.ACES.PISO.001", description: "Piso tátil direcional em concreto, 25x25cm", unit: "m", price: 45.67, region: "São Paulo", referenceDate: "01/2025", laborCost: 18.90, materialCost: 26.77, equipmentCost: 0 },
];

// ==================== SEARCH FUNCTIONS ====================

function scoreMatch(query: string, description: string, code: string): number {
  const queryLower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const descLower = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const codeLower = code.toLowerCase();

  if (codeLower === queryLower || codeLower.includes(queryLower)) return 100;

  const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);
  if (keywords.length === 0) return 0;

  let matched = 0;
  for (const kw of keywords) {
    if (descLower.includes(kw)) matched++;
  }

  return (matched / keywords.length) * 80;
}

export async function searchPini(query: string, region: string = "São Paulo", limit: number = 10): Promise<PiniSearchResult[]> {
  try {
    const cached = await getCachedPrice("pini", `search:${query}:${region}`);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      const results = cached.rawData as any;
      if (Array.isArray(results)) return results.slice(0, limit);
    }

    // P1.4: lê do repo (com fallback para PINI_DATABASE embutida).
    const dataset = await getPiniData(region);
    const scored = dataset
      .map(item => ({ item, score: scoreMatch(query, item.description, item.code) }))
      .filter(s => s.score > 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        code: s.item.code,
        description: s.item.description,
        unit: s.item.unit,
        price: adjustPrice(s.item.price, region),
        region,
      }));

    if (scored.length > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      try {
        await setCachedPrice({
          source: "pini",
          code: `search:${query}:${region}`,
          description: query,
          unit: "",
          price: "0" as any,
          region,
          referenceDate: "01/2025",
          rawData: scored as any,
          expiresAt,
        });
      } catch { /* non-critical */ }
    }

    return scored;
  } catch (error) {
    console.error("[PINI] Search error:", error);
    return [];
  }
}

export async function getPiniComposition(code: string, region: string = "São Paulo"): Promise<PiniComposition | null> {
  try {
    const cached = await getCachedPrice("pini", code);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      const rawData = cached.rawData as any;
      return {
        code: cached.code,
        description: cached.description || "",
        unit: cached.unit || "",
        price: Number(cached.price) || 0,
        region: cached.region || region,
        referenceDate: cached.referenceDate || "",
        laborCost: rawData?.laborCost || 0,
        materialCost: rawData?.materialCost || 0,
        equipmentCost: rawData?.equipmentCost || 0,
        components: rawData?.components,
      };
    }

    // Tentar scraping online primeiro
    try {
      const scraped = await searchPiniOnline(code);
      if (scraped && scraped.preco > 0) {
        logger.info(`PINI online: ${code} - ${scraped.descricao} - R$ ${scraped.preco}`);
        const onlineResult: PiniComposition = {
          code: scraped.codigo,
          description: scraped.descricao,
          unit: scraped.unidade,
          price: scraped.preco,
          region,
          referenceDate: new Date().toISOString().slice(0, 7),
          laborCost: 0,
          materialCost: 0,
          equipmentCost: 0,
          components: scraped.componentes?.map(c => ({
            type: "material" as const,
            code: "",
            description: c.descricao,
            unit: c.unidade,
            coefficient: c.coeficiente,
            unitPrice: c.custoUnitario,
            totalPrice: c.custoTotal,
          })),
        };
        return onlineResult;
      }
    } catch (scrapeError) {
      logger.warn(`PINI scraping falhou para ${code}, usando banco fixo`);
      incrementStat('piniFallback');
    }

    // P1.4: lê do repo (com fallback para PINI_DATABASE embutida)
    const dataset = await getPiniData(region);
    const composition = dataset.find(item => item.code === code);
    if (!composition) return null;

    const factor = getRegionFactor(region);
    const adjusted: PiniComposition = {
      ...composition,
      price: adjustPrice(composition.price, region),
      laborCost: Math.round(composition.laborCost * factor * 100) / 100,
      materialCost: Math.round(composition.materialCost * factor * 100) / 100,
      equipmentCost: Math.round(composition.equipmentCost * factor * 100) / 100,
      region,
    };

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    try {
      await setCachedPrice({
        source: "pini",
        code: adjusted.code,
        description: adjusted.description,
        unit: adjusted.unit,
        price: adjusted.price.toString() as any,
        region: adjusted.region,
        referenceDate: adjusted.referenceDate,
        rawData: {
          laborCost: adjusted.laborCost,
          materialCost: adjusted.materialCost,
          equipmentCost: adjusted.equipmentCost,
          components: adjusted.components,
        } as any,
        expiresAt,
      });
    } catch { /* non-critical */ }

    return adjusted;
  } catch (error) {
    console.error("[PINI] Get composition error:", error);
    return null;
  }
}

export async function getPiniPriceByDescription(description: string, region: string = "São Paulo"): Promise<PiniSearchResult | null> {
  const results = await searchPini(description, region, 1);
  return results[0] || null;
}

export async function comparePrices(description: string, region: string = "São Paulo", state: string = "SP"): Promise<{
  sinapi: { code: string; description: string; unit: string; price: number } | null;
  pini: PiniSearchResult | null;
  recommendation: "sinapi" | "pini" | "average";
  recommendedPrice: number;
}> {
  const [piniResult] = await Promise.all([
    getPiniPriceByDescription(description, region),
  ]);

  const { getSinapiPriceByDescription } = await import("./sinapi");
  const sinapiResult = await getSinapiPriceByDescription(description, state);

  let recommendation: "sinapi" | "pini" | "average" = "average";
  let recommendedPrice = 0;

  if (sinapiResult && piniResult) {
    recommendedPrice = Math.round(((sinapiResult.price + piniResult.price) / 2) * 100) / 100;
    recommendation = "average";
  } else if (sinapiResult) {
    recommendedPrice = sinapiResult.price;
    recommendation = "sinapi";
  } else if (piniResult) {
    recommendedPrice = piniResult.price;
    recommendation = "pini";
  }

  return { sinapi: sinapiResult, pini: piniResult, recommendation, recommendedPrice };
}

export { getRegionFactor as getRegionalFactor } from "../../shared/regionFactors";

export function getPiniCount(): number {
  return PINI_DATABASE.length;
}
