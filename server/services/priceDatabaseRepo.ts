/**
 * P1.4: repositório CRUD da tabela `price_database_entries`.
 * Substitui as constantes `SINAPI_DB` e `PINI_DATABASE` como fonte de
 * verdade. Carregamento em cache de processo na inicialização (~280
 * linhas, baixo overhead).
 */

import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { priceDatabaseEntries } from "../../drizzle/schema";
import type { PriceDatabaseEntry } from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../utils/logger";

export type PriceSource = "sinapi" | "pini";

export interface PriceComponent {
  description: string;
  unit: string;
  coefficient: number;
  unitCost: number;
  type?: "labor" | "material" | "equipment";
  code?: string;
}

export interface PriceEntry {
  source: PriceSource;
  code: string;
  description: string;
  unit: string;
  price: number;
  state?: string | null;
  category?: string | null;
  referenceDate: Date;
  components?: PriceComponent[];
  dataSource?: string;
}

/**
 * Insere ou atualiza uma entrada na tabela. Usa o uniqueIndex
 * (source, code, state, referenceDate) para detecção de duplicata.
 * Quando bate na chave, atualiza price, description, components e
 * scrapedAt — mantém isActive como está (ativação/desativação é via
 * deactivateOldEntries).
 */
export async function upsertPriceEntry(entry: PriceEntry): Promise<void> {
  const db = await getDb();
  if (!db) {
    logger.warn("[PriceRepo] upsert sem banco — skipping", {
      source: entry.source,
      code: entry.code,
    });
    return;
  }

  const refDate = formatReferenceDate(entry.referenceDate);

  // Drizzle tipa colunas `date()` como Date no insert mas o driver mysql2
  // aceita "YYYY-MM-DD" string e converte. Usamos `as never` aqui pra
  // contornar a divergência entre Date | SQL<unknown> | Placeholder e
  // string sem perder runtime correctness.
  await db
    .insert(priceDatabaseEntries)
    .values({
      source: entry.source,
      code: entry.code,
      description: entry.description,
      unit: entry.unit,
      price: entry.price.toFixed(4),
      state: entry.state ?? null,
      category: entry.category ?? null,
      referenceDate: refDate as unknown as Date,
      componentsJson: (entry.components ?? null) as unknown as object,
      dataSource: entry.dataSource ?? null,
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        price: entry.price.toFixed(4),
        description: entry.description,
        unit: entry.unit,
        category: entry.category ?? null,
        componentsJson: (entry.components ?? null) as unknown as object,
        dataSource: entry.dataSource ?? null,
        scrapedAt: new Date(),
      },
    });
}

/**
 * Retorna todas as entradas ativas de uma fonte. `state` filtra por
 * regional quando passado; quando omitido, retorna entradas de qualquer
 * estado (incluindo nulls).
 */
export async function getActivePriceEntries(
  source: PriceSource,
  state?: string
): Promise<PriceDatabaseEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(priceDatabaseEntries.source, source),
    eq(priceDatabaseEntries.isActive, true),
  ];
  if (state) {
    conditions.push(eq(priceDatabaseEntries.state, state));
  }
  return db
    .select()
    .from(priceDatabaseEntries)
    .where(and(...conditions));
}

/**
 * Busca textual em entradas ativas. Usa LIKE %query% sobre `description`
 * + `code`. Para volumes maiores que ~500 linhas, considerar full-text.
 */
export async function searchPriceEntries(
  source: PriceSource,
  query: string,
  limit = 20
): Promise<PriceDatabaseEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const pattern = `%${query.toLowerCase()}%`;
  return db
    .select()
    .from(priceDatabaseEntries)
    .where(
      and(
        eq(priceDatabaseEntries.source, source),
        eq(priceDatabaseEntries.isActive, true),
        or(
          like(priceDatabaseEntries.description, pattern),
          like(priceDatabaseEntries.code, pattern)
        )
      )
    )
    .orderBy(desc(priceDatabaseEntries.scrapedAt))
    .limit(limit);
}

/**
 * Marca como inativas todas as entradas de uma fonte com referenceDate
 * estritamente anterior à nova referência. Usado pelo refresh job após
 * inserir a nova safra de preços. Retorna a contagem de linhas afetadas.
 */
export async function deactivateOldEntries(
  source: PriceSource,
  newReferenceDate: Date
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const refDate = formatReferenceDate(newReferenceDate);
  const result = await db
    .update(priceDatabaseEntries)
    .set({ isActive: false })
    .where(
      and(
        eq(priceDatabaseEntries.source, source),
        sql`${priceDatabaseEntries.referenceDate} < ${refDate}`,
        eq(priceDatabaseEntries.isActive, true)
      )
    );
  // mysql2 pode retornar { affectedRows } no header — drizzle abstrai
  // como ResultSetHeader. Em alguns paths é Array<...>.
  const affected = Array.isArray(result)
    ? Number(
        (result as unknown as Array<{ affectedRows?: number }>)[0]
          ?.affectedRows ?? 0
      )
    : Number(
        (result as unknown as { affectedRows?: number }).affectedRows ?? 0
      );
  return Number.isFinite(affected) ? affected : 0;
}

/**
 * Helper interno: converte `Date` em `YYYY-MM-DD` (formato MySQL DATE).
 */
function formatReferenceDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
