/**
 * RR-Engine — Text normalization and similarity utilities
 *
 * BUG 1 FIX: Provides semantic deduplication via normalized text comparison
 * and token-based similarity scoring (cosine-like approach using Jaccard).
 */

/**
 * Normalize text for comparison: lowercase, remove accents, strip punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize a normalized string into meaningful words.
 * Removes common stopwords for construction context.
 */
export function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'com', 'para', 'por', 'e', 'ou', 'um', 'uma', 'o', 'a', 'os', 'as',
    'incluindo', 'conforme', 'tipo', 'sendo', 'sobre', 'ate', 'entre',
  ]);

  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(w => w.length > 1 && !stopwords.has(w));
  return new Set(words);
}

/**
 * Calculate similarity between two descriptions.
 * Uses a hybrid approach: max of Jaccard and containment similarity.
 * Containment checks if one description is a subset of the other,
 * which catches cases like "porcelanato" vs "fornecimento e assentamento de porcelanato".
 * Returns a value between 0 and 1.
 */
export function calculateSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of Array.from(tokensA)) {
    if (tokensB.has(token)) intersection++;
  }

  // Jaccard similarity
  const union = new Set([...Array.from(tokensA), ...Array.from(tokensB)]).size;
  const jaccard = intersection / union;

  // Containment similarity: how much of the smaller set is in the larger
  const minSize = Math.min(tokensA.size, tokensB.size);
  const containment = intersection / minSize;

  // Use max to catch both cases
  return Math.max(jaccard, containment);
}

/**
 * Generate a deduplication key from item properties.
 * Two items with the same key are considered duplicates.
 */
export function deduplicationKey(descricao: string, unidade: string, quantidade: number): string {
  const normalizedDesc = normalizeText(descricao);
  const normalizedUnit = normalizeText(unidade);
  return `${normalizedDesc}|${normalizedUnit}|${quantidade}`;
}
