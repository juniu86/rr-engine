/**
 * P1.4 Fase 4 — Job mensal de refresh de preços SINAPI/PINI.
 *
 * Estratégia:
 *   1. refreshSinapi(state): para cada código ativo no repo, scrape via
 *      orcamentor.com (já implementado em sinapiScraper.ts), upsert na
 *      tabela com a referenceDate corrente.
 *   2. refreshPini(): bloqueado até credenciais TCPOWeb (Phase 3 P1.4).
 *      Retorna early com contadores zerados + warning.
 *   3. deactivateOldEntries: marca como inativas as referências de
 *      meses anteriores.
 *
 * Falha individual por código não derruba o job (try/catch por código).
 * Resultado consolidado em logger estruturado.
 *
 * Cron registrado em scheduleRefreshJob() — todo dia 5 às 3h.
 * Em NODE_ENV=test, NÃO dispara cron (skip via guard).
 */

import cron from "node-cron";
import { searchSinapiOnline } from "../services/sinapiScraper";
import { scrapePiniBatch } from "../services/piniScraper";
import {
  upsertPriceEntry,
  getActivePriceEntries,
  deactivateOldEntries,
  type PriceSource,
} from "../services/priceDatabaseRepo";
import { clearSinapiCache } from "../services/sinapi";
import { clearPiniCache } from "../services/pini";
import { logger } from "../utils/logger";

export interface RefreshStats {
  source: PriceSource;
  attempted: number;
  updated: number;
  added: number;
  failed: number;
  deactivated: number;
}

/** Refresh SINAPI: scrape do orcamentor.com via sinapiScraper. */
export async function refreshSinapi(
  state: string = "SP"
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    source: "sinapi",
    attempted: 0,
    updated: 0,
    added: 0,
    failed: 0,
    deactivated: 0,
  };

  const newReferenceDate = firstOfThisMonth();

  // Pega códigos ativos do repo. Se vazio, não há o que refrescar — log
  // explícito (provável que o seed ainda não rodou).
  const active = await getActivePriceEntries("sinapi", state);
  if (active.length === 0) {
    logger.warn(
      "[refreshSinapi] nenhum código ativo encontrado — rode seedPriceDatabases.ts primeiro",
      { state }
    );
    return stats;
  }

  for (const entry of active) {
    stats.attempted++;
    try {
      const scraped = await searchSinapiOnline(entry.code);
      if (!scraped) {
        // Código existe no repo mas o scraping retornou null — pode ser
        // mudança de layout do site. Conta como falha; entry permanece
        // ativa com a referência anterior.
        stats.failed++;
        continue;
      }

      const exists = active.some(
        a =>
          a.code === entry.code && sameMonth(a.referenceDate, newReferenceDate)
      );

      await upsertPriceEntry({
        source: "sinapi",
        code: scraped.codigo,
        description: scraped.descricao,
        unit: scraped.unidade,
        price: scraped.preco,
        state,
        category: entry.category ?? null,
        referenceDate: newReferenceDate,
        // sinapiScraper expõe `insumos` (não `componentes`); mapeamos para
        // o shape comum do repo.
        components: scraped.insumos?.map(i => ({
          description: i.nome,
          unit: i.unidade,
          coefficient: i.quantidade,
          unitCost: i.custoUnitario,
          code: i.codigo,
        })),
        dataSource: "orcamentor.com",
      });

      if (exists) stats.updated++;
      else stats.added++;
    } catch (err) {
      stats.failed++;
      logger.warn("[refreshSinapi] falha em código individual", {
        code: entry.code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Desativa entradas anteriores (mantém apenas a safra mais nova).
  stats.deactivated = await deactivateOldEntries("sinapi", newReferenceDate);
  clearSinapiCache();
  return stats;
}

/**
 * Refresh PINI — pendente até credenciais TCPOWeb.
 * Captura erro do scrapePiniBatch (que ainda lança) e retorna stats
 * zerados sem derrubar o job.
 */
export async function refreshPini(): Promise<RefreshStats> {
  const stats: RefreshStats = {
    source: "pini",
    attempted: 0,
    updated: 0,
    added: 0,
    failed: 0,
    deactivated: 0,
  };

  try {
    // Tenta scrape — se credentials ausentes, lança e cai no catch.
    await scrapePiniBatch([]);
  } catch (err) {
    logger.warn("[refreshPini] pulado — Phase 3 do P1.4 pendente", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return stats;
  }

  // Quando a Phase 3 for implementada, este caminho assume um
  // PiniScrapedData[] e faz upsert similar ao refreshSinapi.
  return stats;
}

export async function refreshAllPriceDatabases(): Promise<{
  sinapi: RefreshStats;
  pini: RefreshStats;
}> {
  logger.info("[refreshAll] iniciando refresh mensal de preços");
  const t0 = Date.now();

  let sinapi: RefreshStats = {
    source: "sinapi",
    attempted: 0,
    updated: 0,
    added: 0,
    failed: 0,
    deactivated: 0,
  };
  try {
    sinapi = await refreshSinapi("SP");
  } catch (err) {
    logger.error("[refreshAll] refreshSinapi quebrou inteiro", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  let pini: RefreshStats = {
    source: "pini",
    attempted: 0,
    updated: 0,
    added: 0,
    failed: 0,
    deactivated: 0,
  };
  try {
    pini = await refreshPini();
  } catch (err) {
    logger.error("[refreshAll] refreshPini quebrou inteiro", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Limpa caches em memória para que a próxima leitura pegue os dados
  // novos do repo.
  clearPiniCache();

  logger.info("[refreshAll] concluído", {
    elapsedMs: Date.now() - t0,
    sinapi,
    pini,
  });
  return { sinapi, pini };
}

/**
 * Registra o cron job. Em NODE_ENV=test, NÃO agenda — evita disparos
 * acidentais em CI ou unit tests.
 *
 * Cron: '0 3 5 * *' = todo dia 5 do mês às 3h da manhã.
 * Pode ser sobrescrito via env REFRESH_PRICES_CRON.
 */
export function scheduleRefreshJob(): void {
  if (process.env.NODE_ENV === "test") {
    logger.info("[refreshAll] NODE_ENV=test — cron não registrado");
    return;
  }
  const expr = process.env.REFRESH_PRICES_CRON ?? "0 3 5 * *";
  if (!cron.validate(expr)) {
    logger.error("[refreshAll] expressão cron inválida — job não registrado", {
      expr,
    });
    return;
  }
  cron.schedule(expr, () => {
    void refreshAllPriceDatabases();
  });
  logger.info("[refreshAll] cron agendado", { expr });
}

// ==================== helpers ====================

function firstOfThisMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function sameMonth(a: Date | string | null, b: Date): boolean {
  if (!a) return false;
  const da = a instanceof Date ? a : new Date(a);
  return (
    da.getUTCFullYear() === b.getUTCFullYear() &&
    da.getUTCMonth() === b.getUTCMonth()
  );
}
