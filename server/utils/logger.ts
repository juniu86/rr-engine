/**
 * Logger centralizado para auditoria de scraping SINAPI/PINI.
 * Registra requisições, erros, cache hits e fallbacks.
 */

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Contadores para monitoramento
const stats = {
  sinapiScrapeSuccess: 0,
  sinapiScrapeFail: 0,
  sinapiCacheHit: 0,
  sinapiFallback: 0,
  piniScrapeSuccess: 0,
  piniScrapeFail: 0,
  piniCacheHit: 0,
  piniFallback: 0,
};

export function incrementStat(key: keyof typeof stats): void {
  stats[key]++;
}

export function getScrapingStats() {
  return { ...stats };
}
