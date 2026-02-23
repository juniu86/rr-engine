/**
 * PINI/TCPO price lookup.
 *
 * The TCPOWeb scraping was never fully implemented (navigation logic incomplete).
 * This module now only provides the interface and cache lookup.
 * Callers should use the local PINI database as the primary source.
 */

import { getCache } from './cacheService';
import { logger } from '../utils/logger';

export interface PiniScrapedData {
  codigo: string;
  descricao: string;
  preco: number;
  unidade: string;
  componentes: Array<{
    descricao: string;
    unidade: string;
    coeficiente: number;
    custoUnitario: number;
    custoTotal: number;
  }>;
  source: 'scraping';
  scrapedAt: string;
}

/**
 * Attempts to find a PINI composition in the cache.
 * Returns null if not cached (caller should use local PINI database).
 */
export async function scrapePini(searchTerm: string): Promise<PiniScrapedData | null> {
  // Only check cache - scraping was never implemented for PINI
  const cacheKey = `pini:${searchTerm}`;
  const cached = await getCache<PiniScrapedData>(cacheKey);
  if (cached) {
    logger.info(`PINI cache hit: ${searchTerm}`);
    return cached;
  }
  return null;
}

/**
 * Busca composição PINI online.
 * Returns null (caller should use local PINI database as fallback).
 */
export async function searchPiniOnline(searchTerm: string): Promise<PiniScrapedData | null> {
  return scrapePini(searchTerm);
}

/**
 * No-op cleanup (kept for API compatibility).
 */
export async function closePiniSession(): Promise<void> {
  // No browser session to close
}
