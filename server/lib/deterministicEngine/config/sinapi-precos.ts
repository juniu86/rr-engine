/**
 * RR-Engine — Base de preços SINAPI (referência nacional)
 *
 * Preços unitários de referência SINAPI sem desoneração.
 * O Fator de Ajuste Regional (FAR) é aplicado pelo módulo de precificação.
 *
 * Fonte: SINAPI — Valores de referência (não desonerado)
 */

export interface PrecoSINAPI {
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  /** Keywords for matching items from memorial */
  keywords: string[];
}

export const SINAPI_BASE: PrecoSINAPI[] = [
  // ─── Demolição ────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-97622',
    descricao: 'Demolição de piso cerâmico/porcelanato',
    unidade: 'm²',
    preco_unitario: 49.23,
    keywords: ['demolição', 'demolição de piso', 'remoção de piso', 'remoção piso'],
  },

  // ─── Contrapiso ───────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-87622',
    descricao: 'Contrapiso em argamassa traço 1:4 (e=3cm)',
    unidade: 'm²',
    preco_unitario: 60.09,
    keywords: ['contrapiso', 'regularização', 'regularização de contrapiso', 'preparo do contrapiso', 'regularização do substrato'],
  },

  // ─── Porcelanato ──────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-87265',
    descricao: 'Assentamento de porcelanato retificado 60x60cm',
    unidade: 'm²',
    preco_unitario: 137.61,
    keywords: ['porcelanato', 'piso porcelanato', 'assentamento de porcelanato', 'fornecimento e assentamento de porcelanato'],
  },

  // ─── Cerâmica ─────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-87266',
    descricao: 'Assentamento de cerâmica para piso',
    unidade: 'm²',
    preco_unitario: 100.15,
    keywords: ['cerâmica', 'piso cerâmico', 'piso cerâmica', 'assentamento de cerâmica', 'fornecimento e assentamento de cerâmica'],
  },

  // ─── Rejuntamento ─────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-87272',
    descricao: 'Rejuntamento de piso',
    unidade: 'm²',
    preco_unitario: 8.52,
    keywords: ['rejuntamento', 'rejuntamento de piso'],
  },

  // ─── Pintura ──────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-88489',
    descricao: 'Pintura acrílica em paredes, 2 demãos com selador',
    unidade: 'm²',
    preco_unitario: 29.65,
    keywords: ['pintura acrílica', 'pintura látex', 'pintura acrilica', 'pintura em paredes'],
  },

  {
    codigo: 'SINAPI-88488',
    descricao: 'Aplicação de massa corrida PVA',
    unidade: 'm²',
    preco_unitario: 17.19,
    keywords: ['massa corrida', 'massa pva', 'aplicação de massa'],
  },

  {
    codigo: 'SINAPI-88490',
    descricao: 'Lixamento de paredes para pintura',
    unidade: 'm²',
    preco_unitario: 5.30,
    keywords: ['lixamento', 'preparação para pintura', 'preparo de paredes'],
  },

  // ─── Drywall ──────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-96113',
    descricao: 'Parede drywall placa RU 12,5mm com estrutura metálica',
    unidade: 'm²',
    preco_unitario: 179.34,
    keywords: ['drywall', 'placa drywall', 'parede drywall', 'gesso acartonado', 'placa ru', 'placa de gesso'],
  },

  {
    codigo: 'SINAPI-96114',
    descricao: 'Porta completa para drywall com batente e fechadura',
    unidade: 'un',
    preco_unitario: 1068.00,
    keywords: ['porta drywall', 'porta para drywall', 'kit porta drywall', 'kit porta para divisória'],
  },

  // ─── Esquadrias ───────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-94570',
    descricao: 'Porta de alumínio com vidro temperado',
    unidade: 'un',
    preco_unitario: 484.62,
    keywords: ['porta alumínio', 'porta de alumínio', 'porta aluminio', 'esquadria alumínio'],
  },

  // ─── Forro ────────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-96116',
    descricao: 'Forro PVC com estrutura metálica',
    unidade: 'm²',
    preco_unitario: 92.30,
    keywords: ['forro pvc', 'forro em pvc', 'forro de pvc'],
  },

  // ─── Impermeabilização ────────────────────────────────────────────────
  {
    codigo: 'SINAPI-98555',
    descricao: 'Impermeabilização com manta asfáltica',
    unidade: 'm²',
    preco_unitario: 92.31,
    keywords: ['impermeabilização', 'manta asfáltica', 'impermeabilizante', 'impermeabilização de áreas'],
  },

  // ─── Elétrica ─────────────────────────────────────────────────────────
  {
    codigo: 'SINAPI-91863',
    descricao: 'Ponto de iluminação residencial/comercial',
    unidade: 'un',
    preco_unitario: 185.42,
    keywords: ['ponto iluminação', 'iluminação', 'ponto de iluminação'],
  },

  {
    codigo: 'SINAPI-91864',
    descricao: 'Ponto de tomada residencial/comercial',
    unidade: 'un',
    preco_unitario: 162.30,
    keywords: ['ponto tomada', 'tomada', 'ponto de tomada'],
  },

  {
    codigo: 'SINAPI-91867',
    descricao: 'Quadro de distribuição com disjuntores',
    unidade: 'un',
    preco_unitario: 890.00,
    keywords: ['quadro distribuição', 'quadro elétrico', 'disjuntores'],
  },

  // ─── Equipamentos (locação) ───────────────────────────────────────────
  {
    codigo: 'SINAPI-83446',
    descricao: 'Locação de martelete demolidor',
    unidade: 'dia',
    preco_unitario: 95.00,
    keywords: ['martelete', 'martelete demolidor', 'locação de martelete'],
  },

  {
    codigo: 'SINAPI-83447',
    descricao: 'Locação de serra mármore',
    unidade: 'dia',
    preco_unitario: 45.00,
    keywords: ['serra mármore', 'serra marmore', 'locação de serra'],
  },

  {
    codigo: 'SINAPI-83448',
    descricao: 'Andaime metálico tubular',
    unidade: 'mês',
    preco_unitario: 800.00,
    keywords: ['andaime', 'andaime metálico', 'andaime tubular'],
  },
];

/**
 * Lookup a SINAPI price by matching keywords against an item description.
 * Returns the best match or null.
 */
export function findSINAPIPrice(descricao: string): PrecoSINAPI | null {
  const normalized = normalizeText(descricao);

  let bestMatch: PrecoSINAPI | null = null;
  let bestScore = 0;

  for (const item of SINAPI_BASE) {
    for (const keyword of item.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (normalized.includes(normalizedKeyword)) {
        const score = normalizedKeyword.length / normalized.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
    }
  }

  return bestMatch;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}
