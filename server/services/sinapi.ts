import axios from "axios";
import { setCachedPrice, getCachedPrice } from "../db";

export interface SinapiComposition {
  code: string;
  description: string;
  unit: string;
  price: number;
  referenceDate: string;
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
}

// Search SINAPI compositions via Orcamentor
export async function searchSinapi(query: string, limit: number = 10): Promise<SinapiSearchResult[]> {
  try {
    // Use LLM to simulate SINAPI search based on known compositions
    // In production, this would scrape orcamentor.com/sinapi/
    const results = await simulateSinapiSearch(query, limit);
    return results;
  } catch (error) {
    console.error("[SINAPI] Search error:", error);
    return [];
  }
}

// Get SINAPI composition details
export async function getSinapiComposition(code: string): Promise<SinapiComposition | null> {
  try {
    // Check cache first
    const cached = await getCachedPrice("sinapi", code);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      return {
        code: cached.code,
        description: cached.description || "",
        unit: cached.unit || "",
        price: Number(cached.price) || 0,
        referenceDate: cached.referenceDate || "",
        components: cached.rawData as any,
      };
    }

    // Fetch from source (simulated)
    const composition = await fetchSinapiComposition(code);
    
    if (composition) {
      // Cache the result for 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      await setCachedPrice({
        source: "sinapi",
        code: composition.code,
        description: composition.description,
        unit: composition.unit,
        price: composition.price.toString() as any,
        region: "São Paulo",
        referenceDate: composition.referenceDate,
        rawData: composition.components as any,
        expiresAt,
      });
    }
    
    return composition;
  } catch (error) {
    console.error("[SINAPI] Get composition error:", error);
    return null;
  }
}

// Simulated SINAPI database with common construction compositions
const SINAPI_DATABASE: SinapiComposition[] = [
  {
    code: "87292",
    description: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19CM (ESPESSURA 9CM) DE PAREDES COM ÁREA LÍQUIDA MENOR QUE 6M² SEM VÃOS E ARGAMASSA DE ASSENTAMENTO COM PREPARO EM BETONEIRA. AF_06/2014",
    unit: "M2",
    price: 72.45,
    referenceDate: "11/2024",
    components: [
      { code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.87, unitPrice: 24.35, totalPrice: 21.18 },
      { code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.58, unitPrice: 18.92, totalPrice: 10.97 },
      { code: "34557", description: "BLOCO CERÂMICO (TIJOLO FURADO) 9X19X19CM", unit: "UN", coefficient: 25.00, unitPrice: 0.89, totalPrice: 22.25 },
      { code: "87292", description: "ARGAMASSA TRAÇO 1:2:8", unit: "M3", coefficient: 0.0108, unitPrice: 456.78, totalPrice: 4.93 },
    ],
  },
  {
    code: "87879",
    description: "CONTRAPISO EM ARGAMASSA TRAÇO 1:4 (CIMENTO E AREIA), PREPARO MECÂNICO COM BETONEIRA 400 L, APLICADO EM ÁREAS SECAS SOBRE LAJE, ESPESSURA 3CM. AF_06/2014",
    unit: "M2",
    price: 34.67,
    referenceDate: "11/2024",
    components: [
      { code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.25, unitPrice: 24.35, totalPrice: 6.09 },
      { code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.17, unitPrice: 18.92, totalPrice: 3.22 },
      { code: "87292", description: "ARGAMASSA TRAÇO 1:4", unit: "M3", coefficient: 0.0315, unitPrice: 378.45, totalPrice: 11.92 },
    ],
  },
  {
    code: "88489",
    description: "EMBOÇO OU MASSA ÚNICA EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400L, APLICADA MANUALMENTE EM PANOS DE FACHADA COM PRESENÇA DE VÃOS, ESPESSURA DE 25 MM. AF_06/2014",
    unit: "M2",
    price: 28.94,
    referenceDate: "11/2024",
  },
  {
    code: "88497",
    description: "APLICAÇÃO MANUAL DE PINTURA COM TINTA LÁTEX ACRÍLICA EM PAREDES, DUAS DEMÃOS. AF_06/2014",
    unit: "M2",
    price: 12.87,
    referenceDate: "11/2024",
    components: [
      { code: "88310", description: "PINTOR COM ENCARGOS COMPLEMENTARES", unit: "H", coefficient: 0.18, unitPrice: 24.35, totalPrice: 4.38 },
      { code: "7356", description: "TINTA LÁTEX ACRÍLICA PREMIUM", unit: "L", coefficient: 0.33, unitPrice: 18.45, totalPrice: 6.09 },
    ],
  },
  {
    code: "96546",
    description: "PISO EM CERÂMICA ESMALTADA EXTRA, PEI MAIOR OU IGUAL A 4, FORMATO MENOR QUE 2025 CM², APLICADO EM AMBIENTES DE ÁREA MAIOR QUE 10 M². AF_06/2014",
    unit: "M2",
    price: 89.45,
    referenceDate: "11/2024",
  },
  {
    code: "91926",
    description: "DEMOLIÇÃO DE ALVENARIA DE BLOCO FURADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_12/2017",
    unit: "M3",
    price: 45.78,
    referenceDate: "11/2024",
  },
  {
    code: "97622",
    description: "DEMOLIÇÃO DE PISO CERÂMICO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_12/2017",
    unit: "M2",
    price: 12.34,
    referenceDate: "11/2024",
  },
  {
    code: "93358",
    description: "PONTO DE ILUMINAÇÃO RESIDENCIAL INCLUINDO INTERRUPTOR SIMPLES, CAIXA ELÉTRICA, ELETRODUTO, CABO, RASGO, QUEBRA E CHUMBAMENTO. AF_01/2016",
    unit: "UN",
    price: 145.67,
    referenceDate: "11/2024",
  },
  {
    code: "93654",
    description: "PONTO DE TOMADA RESIDENCIAL INCLUINDO TOMADA 10A/250V, CAIXA ELÉTRICA, ELETRODUTO, CABO, RASGO, QUEBRA E CHUMBAMENTO. AF_01/2016",
    unit: "UN",
    price: 178.34,
    referenceDate: "11/2024",
  },
  {
    code: "89957",
    description: "CONCRETO FCK = 25MPA, TRAÇO 1:2,3:2,7 (CIMENTO/ AREIA MÉDIA/ BRITA 1) - PREPARO MECÂNICO COM BETONEIRA 400 L. AF_07/2016",
    unit: "M3",
    price: 478.92,
    referenceDate: "11/2024",
  },
  {
    code: "92263",
    description: "LANÇAMENTO COM USO DE BALDES, ADENSAMENTO E ACABAMENTO DE CONCRETO EM ESTRUTURAS. AF_12/2015",
    unit: "M3",
    price: 156.78,
    referenceDate: "11/2024",
  },
  {
    code: "96995",
    description: "FORRO EM PLACAS DE GESSO, PARA AMBIENTES COMERCIAIS. AF_05/2017",
    unit: "M2",
    price: 67.89,
    referenceDate: "11/2024",
  },
  {
    code: "94965",
    description: "PORTA DE MADEIRA PARA PINTURA, SEMI-OCA (LEVE OU MÉDIA), 80X210CM, ESPESSURA DE 3,5CM, INCLUSO DOBRADIÇAS - FORNECIMENTO E INSTALAÇÃO. AF_08/2015",
    unit: "UN",
    price: 567.45,
    referenceDate: "11/2024",
  },
  {
    code: "89356",
    description: "INSTALAÇÃO DE PONTO DE ÁGUA FRIA - RESIDENCIAL, INCLUINDO CONEXÕES E TUBULAÇÃO. AF_12/2014",
    unit: "UN",
    price: 234.56,
    referenceDate: "11/2024",
  },
  {
    code: "89398",
    description: "INSTALAÇÃO DE PONTO DE ESGOTO - RESIDENCIAL, INCLUINDO CONEXÕES E TUBULAÇÃO. AF_12/2014",
    unit: "UN",
    price: 198.45,
    referenceDate: "11/2024",
  },
];

// Simulate SINAPI search
async function simulateSinapiSearch(query: string, limit: number): Promise<SinapiSearchResult[]> {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/);
  
  const results = SINAPI_DATABASE
    .filter(item => {
      const descLower = item.description.toLowerCase();
      return keywords.some(kw => descLower.includes(kw) || item.code.includes(kw));
    })
    .slice(0, limit)
    .map(item => ({
      code: item.code,
      description: item.description,
      unit: item.unit,
      price: item.price,
    }));
  
  return results;
}

// Fetch SINAPI composition (simulated)
async function fetchSinapiComposition(code: string): Promise<SinapiComposition | null> {
  const composition = SINAPI_DATABASE.find(item => item.code === code);
  return composition || null;
}

// Get price for a description using fuzzy matching
export async function getSinapiPriceByDescription(description: string): Promise<SinapiSearchResult | null> {
  const results = await searchSinapi(description, 1);
  return results[0] || null;
}

// Bulk search for multiple items
export async function bulkSearchSinapi(queries: string[]): Promise<Map<string, SinapiSearchResult | null>> {
  const results = new Map<string, SinapiSearchResult | null>();
  
  for (const query of queries) {
    const result = await getSinapiPriceByDescription(query);
    results.set(query, result);
  }
  
  return results;
}
