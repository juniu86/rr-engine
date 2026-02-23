/**
 * Scraper SINAPI via Orcamentor.com
 * 
 * Extrai composições SINAPI em tempo real do site orcamentor.com.
 * URL padrão: https://orcamentor.com/composicao/{codigo}/
 * 
 * Fluxo: Cache → Rate Limit → Puppeteer → Extração → Cache → Retorno
 * Fallback: Se scraping falhar, retorna null (chamador usa banco fixo).
 */

import puppeteer from 'puppeteer';
import { getCache, setCache } from './cacheService';
import { rateLimit } from '../utils/rateLimiter';
import { logger, incrementStat } from '../utils/logger';

export interface SinapiScrapedData {
  codigo: string;
  descricao: string;
  preco: number;
  unidade: string;
  referencia: string;
  insumos: Array<{
    tipo: string;
    codigo: string;
    nome: string;
    custoUnitario: number;
    quantidade: number;
    unidade: string;
    custoTotal: number;
  }>;
  source: 'scraping';
  scrapedAt: string;
}

/**
 * Faz scraping de uma composição SINAPI pelo código.
 * Retorna null se falhar (chamador deve usar fallback).
 */
export async function scrapeSinapi(codigo: string): Promise<SinapiScrapedData | null> {
  // Skip scraping in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null;
  }

  // 1. Verificar cache
  const cacheKey = `sinapi:${codigo}`;
  const cached = await getCache<SinapiScrapedData>(cacheKey);
  if (cached) {
    logger.info(`SINAPI cache hit: ${codigo}`);
    incrementStat('sinapiCacheHit');
    return cached;
  }

  // 2. Rate limit
  await rateLimit();

  logger.info(`SINAPI scraping: ${codigo}`);

  let browser;
  try {
    const isContainer = process.env.DOCKER === 'true' || process.env.RUNNING_IN_DOCKER === 'true';
    browser = await puppeteer.launch({
      headless: true,
      args: [
        // Only disable sandbox in containerized environments where it cannot run
        ...(isContainer ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Bloquear recursos desnecessários para acelerar
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const url = `https://orcamentor.com/composicao/${codigo}/`;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Aguardar conteúdo principal carregar
    await page.waitForSelector('h1', { timeout: 10000 });

    const data = await page.evaluate(() => {
      const bodyText = document.body?.textContent || '';

      // Código SINAPI
      const codigoMatch = bodyText.match(/C[oó]digo\s*(?:SINAPI)?:?\s*(\d+)/i);
      const codigo = codigoMatch ? codigoMatch[1] : '';

      // Descrição (primeiro h1)
      const descricao = document.querySelector('h1')?.textContent?.trim() || '';

      // Preço e unidade (h2 com formato "R$ X,XX / UNIDADE")
      const h2Elements = document.querySelectorAll('h2');
      let preco = 0;
      let unidade = '';
      for (let i = 0; i < h2Elements.length; i++) {
        const text = h2Elements[i].textContent || '';
        const precoMatch = text.match(/R\$\s*([\d.,]+)\s*\/\s*(\S+)/);
        if (precoMatch) {
          preco = parseFloat(precoMatch[1].replace(/\./g, '').replace(',', '.'));
          unidade = precoMatch[2].trim();
          break;
        }
      }

      // Referência SINAPI (mês/ano)
      const refMatch = bodyText.match(/SINAPI[:\s]*(\d{1,2})\/(\d{4})/i);
      const referencia = refMatch ? `${refMatch[1]}/${refMatch[2]}` : '';

      // Insumos (tabela)
      const insumos: Array<{
        tipo: string;
        codigo: string;
        nome: string;
        custoUnitario: number;
        quantidade: number;
        unidade: string;
        custoTotal: number;
      }> = [];

      const tables = document.querySelectorAll('table');
      for (let t = 0; t < tables.length; t++) {
        const rows = tables[t].querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells.length >= 5) {
            const parseCurrency = (text: string) => {
              const cleaned = (text || '').replace(/[^\d,.-]/g, '').replace(',', '.');
              return parseFloat(cleaned) || 0;
            };

            insumos.push({
              tipo: cells[0]?.textContent?.trim() || '',
              codigo: cells[1]?.textContent?.trim() || '',
              nome: cells[2]?.textContent?.trim() || '',
              custoUnitario: parseCurrency(cells[3]?.textContent || ''),
              quantidade: parseCurrency(cells[4]?.textContent || ''),
              unidade: cells.length >= 7 ? (cells[5]?.textContent?.trim() || '') : '',
              custoTotal: parseCurrency(cells[cells.length - 1]?.textContent || ''),
            });
          }
        }
      }

      return { codigo, descricao, preco, unidade, referencia, insumos };
    });

    await browser.close();

    // Validar dados extraídos
    if (!data.descricao || data.preco <= 0) {
      logger.warn(`SINAPI scraping incompleto: ${codigo} - desc="${data.descricao}" preco=${data.preco}`);
      incrementStat('sinapiScrapeFail');
      return null;
    }

    const result: SinapiScrapedData = {
      ...data,
      codigo: data.codigo || codigo,
      source: 'scraping',
      scrapedAt: new Date().toISOString(),
    };

    // Salvar no cache (30 dias)
    await setCache(cacheKey, result);
    incrementStat('sinapiScrapeSuccess');
    logger.info(`SINAPI scraping sucesso: ${codigo} - ${data.descricao} - R$ ${data.preco}/${data.unidade}`);

    return result;
  } catch (error: any) {
    if (browser) await browser.close();
    logger.error(`SINAPI scraping falhou: ${codigo}`, { error: error.message });
    incrementStat('sinapiScrapeFail');
    return null;
  }
}

/**
 * Busca composição SINAPI por código, tentando scraping primeiro.
 * Se falhar, retorna null (chamador deve usar fallback do banco fixo).
 */
export async function searchSinapiOnline(codigo: string): Promise<SinapiScrapedData | null> {
  try {
    return await scrapeSinapi(codigo);
  } catch (error: any) {
    logger.error(`SINAPI online search falhou: ${codigo}`, { error: error.message });
    return null;
  }
}
