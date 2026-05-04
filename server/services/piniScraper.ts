/**
 * PINI/TCPO price lookup.
 *
 * P1.4 (Fase 3) — PAUSADO. TCPOWeb requer assinatura paga e credenciais
 * de login (env PINI_USERNAME/PINI_PASSWORD ainda não provisionadas).
 * Conforme decisão do ticket P1.4, NÃO invento fonte alternativa sem
 * autorização. A função `scrapePiniBatch` está stubada — lança erro
 * descritivo até as credenciais serem definidas.
 *
 * Quando as credenciais existirem, o esqueleto é:
 *   1. await rateLimit(1000)  // 1 req/segundo
 *   2. Puppeteer.launch + login em https://www.tcpoweb.com.br
 *   3. for (const code of codes): navega para a composição, extrai
 *      price/unit/description/components, retorna PiniScrapedData[]
 *   4. await closePiniSession() para liberar o browser
 */

import { getCache } from './cacheService';
import { logger } from '../utils/logger';
import { rateLimit } from '../utils/rateLimiter';

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

/**
 * P1.4 Fase 3 — STUB. Scraping em batch de composições PINI/TCPO.
 *
 * BLOQUEADO: TCPOWeb requer assinatura paga + credenciais (PINI_USERNAME
 * e PINI_PASSWORD via env). Sem autorização do founder para configurar
 * a conta, esta função lança erro. NÃO inventar fonte alternativa.
 *
 * Quando as credenciais forem provisionadas:
 *   - usar `rateLimit(1000)` antes de cada request (1 req/seg)
 *   - cobertura mínima: 80 composições mais usadas (acabamento +
 *     instalações, conforme ticket)
 *   - retornar PiniScrapedData[] com componentes (labor/material/equipment)
 */
export async function scrapePiniBatch(codes: string[]): Promise<PiniScrapedData[]> {
  if (!process.env.PINI_USERNAME || !process.env.PINI_PASSWORD) {
    throw new Error(
      "[PiniScraper] PINI_USERNAME e PINI_PASSWORD não configuradas. Phase 3 do P1.4 pendente — definir conta TCPOWeb com o founder antes de habilitar o scraping."
    );
  }
  // Espelha o rate-limiter para cumprir o contrato declarado, mesmo
  // antes da implementação real.
  await rateLimit(1000);
  void codes;
  throw new Error(
    "[PiniScraper] scrapePiniBatch ainda não implementado. Phase 3 do P1.4 aguardando autorização para acessar TCPOWeb."
  );
}
