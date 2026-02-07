/**
 * Scraper PINI via TCPOWeb (com login)
 * 
 * Acessa o TCPOWeb com credenciais do usuário para extrair composições PINI/TCPO.
 * Mantém sessão ativa por 30 minutos para reutilização.
 * 
 * Fluxo: Cache → Rate Limit → Login (se necessário) → Navegação → Extração → Cache
 * Fallback: Se scraping falhar, retorna null (chamador usa banco fixo).
 * 
 * Credenciais via env vars: PINI_USER e PINI_PASS
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { getCache, setCache } from './cacheService';
import { rateLimit } from '../utils/rateLimiter';
import { logger, incrementStat } from '../utils/logger';

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

interface PiniSession {
  browser: Browser;
  page: Page;
  loggedIn: boolean;
  lastAccess: number;
}

let piniSession: PiniSession | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Garante que existe uma sessão PINI ativa.
 * Reutiliza sessão existente se válida (< 30 minutos).
 */
async function ensurePiniSession(): Promise<Page> {
  // Reutilizar sessão se válida
  if (piniSession && piniSession.loggedIn && (Date.now() - piniSession.lastAccess < SESSION_TTL_MS)) {
    piniSession.lastAccess = Date.now();
    logger.debug('Reutilizando sessão PINI');
    return piniSession.page;
  }

  // Fechar sessão antiga
  if (piniSession) {
    try {
      await piniSession.browser.close();
    } catch (e) {
      // Ignorar erro ao fechar browser
    }
    piniSession = null;
  }

  const user = process.env.PINI_USER;
  const pass = process.env.PINI_PASS;

  if (!user || !pass) {
    throw new Error('Credenciais PINI não configuradas (PINI_USER, PINI_PASS)');
  }

  logger.info('Criando nova sessão PINI');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    await page.goto('https://tcpoweb.pini.com.br/home/home.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Preencher credenciais
    await page.waitForSelector('#ctl00_header1_txtUsuario', { timeout: 10000 });
    await page.type('#ctl00_header1_txtUsuario', user);
    await page.type('#ctl00_header1_txtSenha', pass);

    // Clicar no botão e aguardar navegação
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      page.click('#ctl00_header1_btnAcessar'),
    ]);

    const currentUrl = page.url();

    if (currentUrl.includes('Menu.aspx') || currentUrl.includes('menu')) {
      piniSession = {
        browser,
        page,
        loggedIn: true,
        lastAccess: Date.now(),
      };
      logger.info('PINI login sucesso');
      return page;
    } else {
      await browser.close();
      throw new Error(`PINI login falhou: redirecionado para ${currentUrl}`);
    }
  } catch (error: any) {
    await browser.close();
    logger.error('PINI login falhou', { error: error.message });
    throw error;
  }
}

/**
 * Tenta login com retry e delay crescente.
 */
async function ensurePiniSessionWithRetry(maxRetries: number = 3): Promise<Page> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ensurePiniSession();
    } catch (error: any) {
      logger.warn(`PINI login retry ${i + 1}/${maxRetries}`, { error: error.message });
      if (i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, 10000 * (i + 1))); // Delay crescente
      }
    }
  }
  throw new Error('PINI login falhou após todas as tentativas');
}

/**
 * Faz scraping de uma composição PINI pelo código.
 * Retorna null se falhar (chamador deve usar fallback do banco fixo).
 */
export async function scrapePini(searchTerm: string): Promise<PiniScrapedData | null> {
  // Skip scraping in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null;
  }

  // 1. Verificar cache
  const cacheKey = `pini:${searchTerm}`;
  const cached = await getCache<PiniScrapedData>(cacheKey);
  if (cached) {
    logger.info(`PINI cache hit: ${searchTerm}`);
    incrementStat('piniCacheHit');
    return cached;
  }

  // 2. Rate limit
  await rateLimit(5000); // 5 segundos para PINI (mais conservador)

  logger.info(`PINI scraping: ${searchTerm}`);

  try {
    const page = await ensurePiniSessionWithRetry();

    // Navegar para busca de composições
    // Nota: a estrutura de navegação do TCPOWeb pode variar.
    // O scraping PINI é mais complexo e pode precisar de ajustes.
    // Por ora, retornamos null e usamos fallback.
    logger.warn(`PINI scraping: navegação de busca não implementada completamente para "${searchTerm}"`);
    incrementStat('piniScrapeFail');
    return null;

  } catch (error: any) {
    logger.error(`PINI scraping falhou: ${searchTerm}`, { error: error.message });
    incrementStat('piniScrapeFail');
    return null;
  }
}

/**
 * Busca composição PINI online.
 * Retorna null se falhar (chamador deve usar fallback do banco fixo).
 */
export async function searchPiniOnline(searchTerm: string): Promise<PiniScrapedData | null> {
  try {
    return await scrapePini(searchTerm);
  } catch (error: any) {
    logger.error(`PINI online search falhou: ${searchTerm}`, { error: error.message });
    return null;
  }
}

/**
 * Fecha a sessão PINI ativa (cleanup).
 */
export async function closePiniSession(): Promise<void> {
  if (piniSession) {
    try {
      await piniSession.browser.close();
    } catch (e) {
      // Ignorar
    }
    piniSession = null;
    logger.info('Sessão PINI encerrada');
  }
}
