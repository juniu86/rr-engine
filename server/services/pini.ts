import { setCachedPrice, getCachedPrice } from "../db";

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

// PINI TCPO credentials (stored in environment)
const PINI_CREDENTIALS = {
  email: "reginaldo.carmojr@gmail.com",
  password: "rrodrigues@",
};

// Search PINI compositions
export async function searchPini(query: string, region: string = "São Paulo", limit: number = 10): Promise<PiniSearchResult[]> {
  try {
    const results = await simulatePiniSearch(query, region, limit);
    return results;
  } catch (error) {
    console.error("[PINI] Search error:", error);
    return [];
  }
}

// Get PINI composition details
export async function getPiniComposition(code: string, region: string = "São Paulo"): Promise<PiniComposition | null> {
  try {
    // Check cache first
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

    // Fetch from source (simulated)
    const composition = await fetchPiniComposition(code, region);
    
    if (composition) {
      // Cache the result for 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      await setCachedPrice({
        source: "pini",
        code: composition.code,
        description: composition.description,
        unit: composition.unit,
        price: composition.price.toString() as any,
        region: composition.region,
        referenceDate: composition.referenceDate,
        rawData: {
          laborCost: composition.laborCost,
          materialCost: composition.materialCost,
          equipmentCost: composition.equipmentCost,
          components: composition.components,
        } as any,
        expiresAt,
      });
    }
    
    return composition;
  } catch (error) {
    console.error("[PINI] Get composition error:", error);
    return null;
  }
}

// Simulated PINI TCPO database with common construction compositions
const PINI_DATABASE: PiniComposition[] = [
  {
    code: "TCPO-02.PARE.ALVE.001",
    description: "Alvenaria de vedação com bloco cerâmico furado 9x19x19cm, espessura 9cm, juntas de 10mm com argamassa mista de cimento, cal hidratada e areia sem peneirar traço 1:2:8",
    unit: "m²",
    price: 78.92,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 32.45,
    materialCost: 46.47,
    equipmentCost: 0,
    components: [
      { type: "labor", code: "L001", description: "Pedreiro", unit: "h", coefficient: 0.95, unitPrice: 28.50, totalPrice: 27.08 },
      { type: "labor", code: "L002", description: "Servente", unit: "h", coefficient: 0.32, unitPrice: 16.80, totalPrice: 5.38 },
      { type: "material", code: "M001", description: "Bloco cerâmico 9x19x19cm", unit: "un", coefficient: 25.5, unitPrice: 1.05, totalPrice: 26.78 },
      { type: "material", code: "M002", description: "Argamassa de assentamento", unit: "m³", coefficient: 0.012, unitPrice: 485.75, totalPrice: 5.83 },
    ],
  },
  {
    code: "TCPO-02.REVE.ARGA.001",
    description: "Revestimento de parede com argamassa de cimento e areia, traço 1:4, espessura 20mm",
    unit: "m²",
    price: 35.67,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 18.45,
    materialCost: 17.22,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.PISO.CERA.001",
    description: "Piso cerâmico esmaltado 45x45cm, PEI-4, assentado com argamassa colante sobre contrapiso",
    unit: "m²",
    price: 95.34,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 28.90,
    materialCost: 66.44,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.PINT.LATE.001",
    description: "Pintura látex acrílica em paredes internas, duas demãos, sobre massa corrida",
    unit: "m²",
    price: 14.56,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 6.78,
    materialCost: 7.78,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.DEMO.ALVE.001",
    description: "Demolição de alvenaria de tijolo furado, inclusive afastamento e empilhamento",
    unit: "m³",
    price: 52.34,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 52.34,
    materialCost: 0,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.DEMO.PISO.001",
    description: "Demolição de piso cerâmico, inclusive contrapiso, espessura até 5cm",
    unit: "m²",
    price: 18.45,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 18.45,
    materialCost: 0,
    equipmentCost: 0,
  },
  {
    code: "TCPO-03.ELET.PONT.001",
    description: "Ponto de luz no teto, com eletroduto PVC rígido, caixa 4x2, fiação e interruptor simples",
    unit: "un",
    price: 156.78,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 67.89,
    materialCost: 88.89,
    equipmentCost: 0,
  },
  {
    code: "TCPO-03.ELET.TOMA.001",
    description: "Ponto de tomada 2P+T 10A, com eletroduto PVC rígido, caixa 4x2 e fiação",
    unit: "un",
    price: 189.45,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 72.34,
    materialCost: 117.11,
    equipmentCost: 0,
  },
  {
    code: "TCPO-03.HIDR.AGUA.001",
    description: "Ponto de água fria em PVC soldável, inclusive conexões",
    unit: "un",
    price: 245.67,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 89.45,
    materialCost: 156.22,
    equipmentCost: 0,
  },
  {
    code: "TCPO-03.HIDR.ESGO.001",
    description: "Ponto de esgoto em PVC série normal, inclusive conexões",
    unit: "un",
    price: 212.34,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 78.90,
    materialCost: 133.44,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.FORR.GESS.001",
    description: "Forro de gesso em placas 60x60cm, estruturado, para ambientes comerciais",
    unit: "m²",
    price: 72.45,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 28.90,
    materialCost: 43.55,
    equipmentCost: 0,
  },
  {
    code: "TCPO-01.CONC.USIN.001",
    description: "Concreto usinado bombeado fck=25MPa, inclusive lançamento e adensamento",
    unit: "m³",
    price: 525.67,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 45.67,
    materialCost: 456.78,
    equipmentCost: 23.22,
  },
  {
    code: "TCPO-02.CONT.ARGA.001",
    description: "Contrapiso em argamassa de cimento e areia traço 1:4, espessura 3cm",
    unit: "m²",
    price: 38.92,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 15.67,
    materialCost: 23.25,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.IMPE.MANT.001",
    description: "Impermeabilização com manta asfáltica 3mm, inclusive primer",
    unit: "m²",
    price: 89.45,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 34.56,
    materialCost: 54.89,
    equipmentCost: 0,
  },
  {
    code: "TCPO-02.PORT.MADE.001",
    description: "Porta de madeira semi-oca 80x210cm, com batente, dobradiças e fechadura",
    unit: "un",
    price: 645.78,
    region: "São Paulo",
    referenceDate: "11/2024",
    laborCost: 123.45,
    materialCost: 522.33,
    equipmentCost: 0,
  },
];

// Simulate PINI search
async function simulatePiniSearch(query: string, region: string, limit: number): Promise<PiniSearchResult[]> {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/);
  
  const results = PINI_DATABASE
    .filter(item => {
      const descLower = item.description.toLowerCase();
      return keywords.some(kw => descLower.includes(kw) || item.code.toLowerCase().includes(kw));
    })
    .slice(0, limit)
    .map(item => ({
      code: item.code,
      description: item.description,
      unit: item.unit,
      price: item.price,
      region: item.region,
    }));
  
  return results;
}

// Fetch PINI composition (simulated)
async function fetchPiniComposition(code: string, region: string): Promise<PiniComposition | null> {
  const composition = PINI_DATABASE.find(item => item.code === code);
  return composition || null;
}

// Get price for a description using fuzzy matching
export async function getPiniPriceByDescription(description: string, region: string = "São Paulo"): Promise<PiniSearchResult | null> {
  const results = await searchPini(description, region, 1);
  return results[0] || null;
}

// Compare SINAPI and PINI prices for the same service
export async function comparePrices(description: string): Promise<{
  sinapi: { code: string; description: string; unit: string; price: number } | null;
  pini: PiniSearchResult | null;
  recommendation: "sinapi" | "pini" | "average";
  recommendedPrice: number;
}> {
  const [piniResult] = await Promise.all([
    getPiniPriceByDescription(description),
  ]);
  
  // Import SINAPI search dynamically to avoid circular dependency
  const { getSinapiPriceByDescription } = await import("./sinapi");
  const sinapiResult = await getSinapiPriceByDescription(description);
  
  let recommendation: "sinapi" | "pini" | "average" = "average";
  let recommendedPrice = 0;
  
  if (sinapiResult && piniResult) {
    // Use average when both are available
    recommendedPrice = (sinapiResult.price + piniResult.price) / 2;
    recommendation = "average";
  } else if (sinapiResult) {
    recommendedPrice = sinapiResult.price;
    recommendation = "sinapi";
  } else if (piniResult) {
    recommendedPrice = piniResult.price;
    recommendation = "pini";
  }
  
  return {
    sinapi: sinapiResult,
    pini: piniResult,
    recommendation,
    recommendedPrice,
  };
}

// Get regional adjustment factor
export function getRegionalFactor(region: string): number {
  const factors: Record<string, number> = {
    "São Paulo": 1.0,
    "Rio de Janeiro": 1.05,
    "Minas Gerais": 0.92,
    "Bahia": 0.88,
    "Rio Grande do Sul": 0.95,
    "Paraná": 0.93,
    "Santa Catarina": 0.94,
    "Goiás": 0.90,
    "Distrito Federal": 1.02,
    "Pernambuco": 0.87,
  };
  
  return factors[region] || 1.0;
}
