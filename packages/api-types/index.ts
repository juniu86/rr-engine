/**
 * P3 — Re-exporta o tipo do AppRouter para consumo no frontend.
 *
 * IMPORTANTE: este arquivo NÃO deve trazer nenhum import de runtime
 * do backend (Drizzle, mysql2, anthropic, etc). Apenas re-export de TIPO.
 *
 * O tsc emite `dist/index.js` praticamente vazio (só `export {}`) e
 * `dist/index.d.ts` com o tipo completo. O frontend consome via
 * `import type { AppRouter } from "@juniu86/rr-engine-api-types"`.
 */
export type { AppRouter } from "../../server/routers";
