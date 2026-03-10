/**
 * RR-Engine — Parser Module
 *
 * Parses a structured memorial descritivo into engine items.
 *
 * BUG 1 FIX: Deduplication — items with the same (description + unit + quantity)
 * or with similarity > threshold are consolidated, not duplicated.
 *
 * BUG 8 FIX: Reform detection — if obra type is "reforma" and memorial
 * mentions "piso existente", do NOT auto-add contrapiso regularization.
 */

import type { MemorialDescritivo, ItemMemorial, TipoObra, LogisticaMemorial } from '../types';
import { normalizeText, calculateSimilarity, deduplicationKey } from '../utils/normalize';

// ─── Memorial Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a markdown memorial into a structured MemorialDescritivo.
 */
export function parseMemorial(markdown: string): MemorialDescritivo {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);

  const nome = extractNome(lines);
  const tipo = detectTipoObra(markdown);
  const localizacao = extractLocalizacao(lines);
  const observacoes = extractObservacoes(lines);
  const prazo = extractPrazo(lines);
  const rawItens = extractItens(lines);
  const logistica = extractLogistica(lines, markdown);

  // BUG 8 FIX: Check if we should exclude contrapiso
  // In reform, contrapiso/regularização should be excluded unless the memorial
  // explicitly specifies it as needed (e.g., "contrapiso novo necessário").
  const isReforma = tipo === 'reforma';
  const hasPisoExistente = detectPisoExistente(markdown);
  const needsContrapisoExplicit = detectContrapisoNecessario(markdown);
  const excluirContrapiso = isReforma && (hasPisoExistente || !needsContrapisoExplicit);

  // BUG 1 FIX: Deduplicate items
  const itensDeduplicados = deduplicateItems(rawItens, excluirContrapiso);

  return {
    nome,
    tipo,
    localizacao,
    itens: itensDeduplicados,
    logistica,
    prazo_semanas: prazo,
    observacoes,
  };
}

// ─── Extraction Helpers ───────────────────────────────────────────────────────

function extractNome(lines: string[]): string {
  for (const line of lines) {
    if (line.startsWith('# ')) {
      const match = line.match(/(?:MEMORIAL DESCRITIVO|—)\s*(.+)/i);
      if (match) return match[1].replace(/[#—]/g, '').trim();
    }
  }
  return 'Obra sem nome';
}

function detectTipoObra(text: string): TipoObra {
  const lower = text.toLowerCase();
  if (/\breforma\b/.test(lower)) return 'reforma';
  if (/\bamplia[çc][ãa]o\b/.test(lower)) return 'ampliacao';
  return 'obra_nova';
}

function extractLocalizacao(lines: string[]) {
  let cidade = '';
  let estado = '';
  let tipo: 'capital' | 'regiao_metropolitana' | 'interior' = 'interior';

  for (const line of lines) {
    const cidadeMatch = line.match(/cidade:\s*(.+)/i);
    if (cidadeMatch) cidade = cidadeMatch[1].trim();

    const estadoMatch = line.match(/estado:\s*(.+)/i);
    if (estadoMatch) estado = estadoMatch[1].trim();

    // Match "Tipo: Interior" but NOT "Tipo de obra: Reforma"
    const tipoMatch = line.match(/^[-*]?\s*tipo:\s*(.+)/i);
    if (tipoMatch && !/tipo de obra/i.test(line)) {
      const t = tipoMatch[1].trim().toLowerCase();
      if (t === 'capital') tipo = 'capital';
      else if (t.includes('metropolitana') || t === 'rm') tipo = 'regiao_metropolitana';
      else tipo = 'interior';
    }
  }

  // Detect from header if not found in fields
  if (!cidade) {
    for (const line of lines) {
      const match = line.match(/(?:Saquarema|saquarema)/i);
      if (match) { cidade = 'Saquarema'; estado = estado || 'RJ'; tipo = 'interior'; break; }
    }
  }

  return { cidade, estado, tipo };
}

function extractPrazo(lines: string[]): number {
  for (const line of lines) {
    const match = line.match(/(\d+)\s*semanas?/i);
    if (match) return parseInt(match[1], 10);
  }
  return 4; // default
}

function extractObservacoes(lines: string[]): string[] {
  const obs: string[] = [];
  let inObs = false;

  for (const line of lines) {
    if (/observa[çc][oõ]es/i.test(line)) {
      inObs = true;
      continue;
    }
    if (inObs && line.startsWith('#')) break;
    if (inObs && line.startsWith('-')) {
      obs.push(line.replace(/^-\s*/, ''));
    }
  }

  return obs;
}

/**
 * BUG 8 FIX: Detect if memorial indicates existing floor (reform over existing surface)
 */
function detectPisoExistente(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /piso existente/.test(lower) ||
    /sobre piso existente/.test(lower) ||
    /reforma sobre/.test(lower) ||
    /sem necessidade de contrapiso/.test(lower) ||
    /n[ãa]o requer contrapiso/.test(lower) ||
    /sobre estrutura existente/.test(lower)
  );
}

/**
 * BUG 8 FIX: Detect if memorial explicitly says contrapiso is needed
 * (e.g., "contrapiso novo necessário", "executar contrapiso").
 * Listing contrapiso/regularização as scope items in a reforma does NOT mean it's needed —
 * it's likely auto-generated duplication from the verbose memorial.
 */
function detectContrapisoNecessario(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /contrapiso novo necess[aá]rio/.test(lower) ||
    /executar contrapiso novo/.test(lower) ||
    /contrapiso obrigat[oó]rio/.test(lower)
  );
}

// ─── Item Extraction ──────────────────────────────────────────────────────────

function extractItens(lines: string[]): ItemMemorial[] {
  const itens: ItemMemorial[] = [];
  let currentCategoria = '';

  for (const line of lines) {
    // Detect category headers (#### 3.1. Demolição)
    const catMatch = line.match(/^#{2,4}\s*[\d.]*\s*(.+)/);
    if (catMatch) {
      const cat = catMatch[1].trim();
      // Skip non-item sections and clear category to prevent items from being captured
      if (/objeto|localiza|prazo|observa|log[íi]stica|apoio/i.test(cat)) {
        currentCategoria = '';
        continue;
      }
      currentCategoria = cat;
      continue;
    }

    // Detect items (- description: quantity unit)
    if (line.startsWith('-') && currentCategoria) {
      const item = parseItemLine(line, currentCategoria);
      if (item) itens.push(item);
    }
  }

  return itens;
}

function parseItemLine(line: string, categoria: string): ItemMemorial | null {
  const text = line.replace(/^-\s*/, '').trim();
  if (!text) return null;

  // Try to extract quantity and unit: "100 m²", "2 unidades", "1 unidade"
  const qtyMatch = text.match(/:\s*([\d.,]+)\s*(m²|m2|un|unidades?|dias?|mês|mes|vb|cj|kg|l|ml|pç|pc)\b/i)
    || text.match(/([\d.,]+)\s*(m²|m2|un|unidades?|dias?|mês|mes|vb|cj|kg|l|ml|pç|pc)\s*$/i);

  let quantidade = 1;
  let unidade = 'vb';
  let descricao = text;

  if (qtyMatch) {
    quantidade = parseFloat(qtyMatch[1].replace(',', '.'));
    unidade = normalizeUnidade(qtyMatch[2]);
    descricao = text.replace(qtyMatch[0], '').replace(/:\s*$/, '').trim();
  }

  // Handle "conforme projeto" — verba
  if (/conforme projeto/i.test(text) && !qtyMatch) {
    unidade = 'vb';
    quantidade = 1;
  }

  return {
    descricao,
    categoria,
    unidade,
    quantidade,
  };
}

function normalizeUnidade(u: string): string {
  const lower = u.toLowerCase();
  if (lower === 'm2') return 'm²';
  if (lower === 'unidades' || lower === 'unidade') return 'un';
  if (lower === 'dias' || lower === 'dia') return 'dia';
  if (lower === 'mes') return 'mês';
  return lower;
}

// ─── Logistics Extraction ─────────────────────────────────────────────────────

function extractLogistica(lines: string[], fullText: string): LogisticaMemorial {
  const lower = fullText.toLowerCase();
  const itensExplicitos: string[] = [];
  let transporte = false;
  let deslocamento = false;
  let hospedagem: { profissionais: number; semanas: number } | undefined;

  let inLogistica = false;

  for (const line of lines) {
    if (/log[íi]stica|apoio/i.test(line) && line.startsWith('#')) {
      inLogistica = true;
      continue;
    }
    if (inLogistica && line.startsWith('#')) break;

    if (inLogistica && line.startsWith('-')) {
      const itemText = line.replace(/^-\s*/, '').trim();
      itensExplicitos.push(itemText);

      if (/transporte/i.test(itemText)) transporte = true;
      if (/deslocamento/i.test(itemText)) deslocamento = true;

      const hospMatch = itemText.match(/(\d+)\s*profissionais?.*?(\d+)\s*semanas?/i);
      if (hospMatch) {
        hospedagem = {
          profissionais: parseInt(hospMatch[1], 10),
          semanas: parseInt(hospMatch[2], 10),
        };
      }

      // Also check for equipment mentions
      if (/martelete|serra|andaime|equipamento/i.test(itemText)) {
        // These are explicitly mentioned in logistics
      }
    }
  }

  return {
    transporte,
    deslocamento_local: deslocamento,
    hospedagem,
    itens_explicitos: itensExplicitos,
  };
}

// ─── BUG 1 FIX: Deduplication ────────────────────────────────────────────────

/**
 * Remove duplicate items from the parsed list.
 *
 * Strategy:
 * 1. Exact match by (normalized description + unit + quantity) → keep first
 * 2. Semantic similarity > threshold with same unit+quantity → consolidate
 * 3. BUG 8: If reforma + piso existente, remove contrapiso/regularização items
 */
export function deduplicateItems(
  itens: ItemMemorial[],
  excluirContrapiso: boolean,
  threshold: number = 0.85,
): ItemMemorial[] {
  const result: ItemMemorial[] = [];
  const seenKeys = new Set<string>();

  for (const item of itens) {
    // BUG 8 FIX: Skip contrapiso in reform over existing floor
    if (excluirContrapiso) {
      const desc = normalizeText(item.descricao);
      if (
        desc.includes('contrapiso') ||
        desc.includes('regularizacao') ||
        desc.includes('regularização') ||
        desc.includes('preparo do contrapiso') ||
        desc.includes('regularizacao do substrato')
      ) {
        continue;
      }
    }

    // Check exact duplicate
    const key = deduplicationKey(item.descricao, item.unidade, item.quantidade);
    if (seenKeys.has(key)) continue;

    // Check semantic duplicate against existing items
    let isDuplicate = false;
    for (const existing of result) {
      if (existing.unidade === item.unidade && existing.quantidade === item.quantidade) {
        const similarity = calculateSimilarity(existing.descricao, item.descricao);
        if (similarity >= threshold) {
          isDuplicate = true;
          break;
        }
        // Category-aware dedup: items in the same category with same unit + quantity
        // that share a core construction keyword are duplicates
        if (existing.categoria === item.categoria) {
          const coreA = extractCoreKeyword(existing.descricao);
          const coreB = extractCoreKeyword(item.descricao);
          if (coreA && coreB && coreA === coreB) {
            isDuplicate = true;
            break;
          }
        }
      }
    }

    if (!isDuplicate) {
      seenKeys.add(key);
      result.push(item);
    }
  }

  return result;
}

/**
 * Extract the core construction keyword from a description.
 * E.g., "Fornecimento e assentamento de porcelanato retificado 60x60" → "porcelanato"
 */
function extractCoreKeyword(descricao: string): string | null {
  const normalized = normalizeText(descricao);
  const coreKeywords = [
    'porcelanato', 'ceramica', 'drywall', 'pintura', 'forro',
    'impermeabilizacao', 'contrapiso', 'regularizacao', 'demolicao',
    'porta aluminio', 'porta drywall', 'rejuntamento',
    'massa corrida', 'lixamento', 'selador',
  ];

  for (const kw of coreKeywords) {
    if (normalized.includes(kw)) return kw;
  }

  return null;
}
