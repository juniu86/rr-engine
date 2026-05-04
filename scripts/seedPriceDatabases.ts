/**
 * P1.4 — Seed script para popular `price_database_entries` a partir das
 * constantes legadas SINAPI_DB e PINI_DATABASE.
 *
 * Uso (rodar UMA VEZ pós-deploy do schema):
 *   DATABASE_URL=... pnpm tsx scripts/seedPriceDatabases.ts
 *
 * Comportamento:
 * - Lê SINAPI_DB de server/services/sinapi.ts (200+ entradas, ref 01/2025).
 * - Lê PINI_DATABASE de server/services/pini.ts (~80 entradas, ref 01/2025).
 * - Faz upsert de cada uma com referenceDate=2025-01-01 e isActive=true.
 * - dataSource = "manual_seed".
 * - Idempotente: rodar duas vezes não duplica (uniqueIndex source+code+state+date).
 */

import { upsertPriceEntry } from "../server/services/priceDatabaseRepo";
import { SINAPI_DB } from "../server/services/sinapi";
import { PINI_DATABASE } from "../server/services/pini";

// PINI_DATABASE usa "São Paulo" como region; mapeamos para state="SP"
// para manter o filtro estadual consistente com SINAPI.
const REGION_TO_STATE: Record<string, string> = {
  "São Paulo": "SP",
  "Rio de Janeiro": "RJ",
};

const REFERENCE_DATE = new Date(Date.UTC(2025, 0, 1)); // 2025-01-01

async function seedSinapi(): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const entry of SINAPI_DB) {
    await upsertPriceEntry({
      source: "sinapi",
      code: entry.code,
      description: entry.description,
      unit: entry.unit,
      price: entry.price,
      state: entry.state || "SP",
      category: entry.category,
      referenceDate: REFERENCE_DATE,
      components: entry.components?.map(c => ({
        description: c.description,
        unit: c.unit,
        coefficient: c.coefficient,
        unitCost: c.unitPrice,
        code: c.code,
      })),
      dataSource: "manual_seed",
    });
    inserted++;
    if (inserted % 50 === 0) {
      console.log(`[seed] SINAPI: ${inserted}/${SINAPI_DB.length}`);
    }
  }
  return { inserted };
}

async function seedPini(): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const entry of PINI_DATABASE) {
    await upsertPriceEntry({
      source: "pini",
      code: entry.code,
      description: entry.description,
      unit: entry.unit,
      price: entry.price,
      state: REGION_TO_STATE[entry.region] ?? "SP",
      category: null,
      referenceDate: REFERENCE_DATE,
      components: entry.components?.map(c => ({
        type: c.type,
        description: c.description,
        unit: c.unit,
        coefficient: c.coefficient,
        unitCost: c.unitPrice,
        code: c.code,
      })),
      dataSource: "manual_seed",
    });
    inserted++;
    if (inserted % 25 === 0) {
      console.log(`[seed] PINI: ${inserted}/${PINI_DATABASE.length}`);
    }
  }
  return { inserted };
}

async function main(): Promise<void> {
  console.log("[seed] iniciando seedPriceDatabases (P1.4)");
  const t0 = Date.now();
  const sinapi = await seedSinapi();
  const pini = await seedPini();
  const elapsed = Date.now() - t0;
  console.log(
    `[seed] concluído em ${(elapsed / 1000).toFixed(1)}s — SINAPI: ${sinapi.inserted}, PINI: ${pini.inserted}`
  );
}

// CommonJS-friendly entrypoint check. Sob ESM (type=module), basta
// chamar main() — o script só é importado via tsx CLI.
main().catch(err => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
