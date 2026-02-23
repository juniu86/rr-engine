/**
 * Cache em memória com TTL (Time To Live) e limite de tamanho.
 * Substitui Redis para ambientes sem infraestrutura externa.
 * TTL padrão: 30 dias (composições SINAPI/PINI atualizam mensalmente).
 * Limite: 10.000 entradas para prevenir OOM.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_SECONDS = 30 * 24 * 3600; // 30 dias
const MAX_CACHE_SIZE = 10_000;

/**
 * Remove entradas expiradas e, se necessário, as menos recentemente acessadas.
 */
function evictIfNeeded(): void {
  const now = Date.now();

  // 1. Remover entradas expiradas
  Array.from(cache.keys()).forEach((key) => {
    const entry = cache.get(key);
    if (entry && now > entry.expiresAt) cache.delete(key);
  });

  // 2. Se ainda acima do limite, remover as mais antigas por lastAccessed (LRU)
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toRemove = cache.size - MAX_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  entry.lastAccessed = Date.now();
  return entry.value as T;
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  evictIfNeeded();
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
    lastAccessed: Date.now(),
  });
}

export async function clearCache(key: string): Promise<void> {
  cache.delete(key);
}

export function getCacheStats(): { size: number; maxSize: number; keys: string[] } {
  // Limpar entradas expiradas
  const now = Date.now();
  Array.from(cache.keys()).forEach((key) => {
    const entry = cache.get(key);
    if (entry && now > entry.expiresAt) cache.delete(key);
  });
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    keys: Array.from(cache.keys()),
  };
}
