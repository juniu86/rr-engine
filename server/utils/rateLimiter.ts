/**
 * Rate Limiter simples para scraping controlado.
 * Garante intervalo mínimo entre requisições para evitar bloqueio.
 */

let lastRequestTime = 0;

export async function rateLimit(minDelayMs: number = 3500): Promise<void> {
  const now = Date.now();
  const diff = now - lastRequestTime;
  if (diff < minDelayMs) {
    await new Promise(res => setTimeout(res, minDelayMs - diff));
  }
  lastRequestTime = Date.now();
}

export function resetRateLimit(): void {
  lastRequestTime = 0;
}
