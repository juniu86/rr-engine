/**
 * Cache em memória com TTL (Time To Live)
 * Substitui Redis para ambientes sem infraestrutura externa.
 * TTL padrão: 30 dias (composições SINAPI/PINI atualizam mensalmente).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_SECONDS = 30 * 24 * 3600; // 30 dias

export async function getCache<T>(key: string): Promise<T | null> {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function clearCache(key: string): Promise<void> {
  cache.delete(key);
}

export function getCacheStats(): { size: number; keys: string[] } {
  // Limpar entradas expiradas
  const now = Date.now();
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry && now > entry.expiresAt) {
      cache.delete(key);
    }
  }
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}
