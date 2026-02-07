import { describe, it, expect, beforeEach } from 'vitest';
import { getCache, setCache, clearCache, getCacheStats } from './services/cacheService';
import { rateLimit, resetRateLimit } from './utils/rateLimiter';
import { getScrapingStats, incrementStat } from './utils/logger';

describe('Cache Service', () => {
  beforeEach(async () => {
    await clearCache('test:key1');
    await clearCache('test:key2');
  });

  it('should store and retrieve values', async () => {
    await setCache('test:key1', { foo: 'bar' });
    const result = await getCache<{ foo: string }>('test:key1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return null for missing keys', async () => {
    const result = await getCache('test:nonexistent');
    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    await setCache('test:key2', { data: 'value' }, 0); // TTL = 0 seconds
    // Wait a tick for expiration
    await new Promise(res => setTimeout(res, 10));
    const result = await getCache('test:key2');
    expect(result).toBeNull();
  });

  it('should clear specific keys', async () => {
    await setCache('test:key1', 'value1');
    await clearCache('test:key1');
    const result = await getCache('test:key1');
    expect(result).toBeNull();
  });

  it('should return cache stats', async () => {
    await setCache('test:key1', 'value1');
    const stats = getCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(1);
    expect(stats.keys).toContain('test:key1');
  });
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('should not delay first request', async () => {
    const start = Date.now();
    await rateLimit(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should delay subsequent requests', async () => {
    await rateLimit(100);
    const start = Date.now();
    await rateLimit(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50); // At least some delay
  });
});

describe('Logger Stats', () => {
  it('should track scraping stats', () => {
    incrementStat('sinapiCacheHit');
    incrementStat('sinapiCacheHit');
    incrementStat('sinapiFallback');
    const stats = getScrapingStats();
    expect(stats.sinapiCacheHit).toBeGreaterThanOrEqual(2);
    expect(stats.sinapiFallback).toBeGreaterThanOrEqual(1);
  });
});

describe('SINAPI Scraper', () => {
  it('should return null in test environment', async () => {
    const { scrapeSinapi } = await import('./services/sinapiScraper');
    const result = await scrapeSinapi('92799');
    expect(result).toBeNull(); // Guard blocks scraping in test env
  });
});

describe('PINI Scraper', () => {
  it('should return null in test environment', async () => {
    const { scrapePini } = await import('./services/piniScraper');
    const result = await scrapePini('12345');
    expect(result).toBeNull(); // Guard blocks scraping in test env
  });
});
