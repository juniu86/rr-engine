/**
 * Router REST /proposta/* — endpoints para o app `proposta.rres.com.br`.
 *
 * Decisão (12/05/2026, founder): API REST simples (não tRPC) para o app
 * de propostas, evitando dependência do pacote `@juniu86/rr-engine-api-types`.
 *
 * Auth: Clerk JWT no header `Authorization: Bearer <token>` — reusa
 * `authenticateRequestWithClerk` (já em produção pelo tRPC). Pool global,
 * sem coluna `userId`: todo vendedor RR enxerga todas as propostas.
 *
 * Endpoints:
 *   GET    /proposta/proposals           → lista todas as propostas
 *   PUT    /proposta/proposals/:id       → cria ou atualiza (upsert)
 *   DELETE /proposta/proposals/:id       → exclui
 *   GET    /proposta/seq/:year/peek      → próximo número sem consumir
 *   POST   /proposta/seq/:year/consume   → aloca próximo número (transação)
 *
 * Numeração: seq_counters.value guarda o ÚLTIMO consumido (default 69 em
 * 2026 → próxima = 70). Formato `RR-070/2026` é montado no frontend.
 *
 * Race condition do /consume: tratada com transação MySQL +
 * `SELECT ... FOR UPDATE`, que segura o row até o COMMIT.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { authenticateRequestWithClerk } from "../_core/clerk-auth";
import { getDb } from "../db";
import { proposals, seqCounters } from "../../drizzle/schema";

/** Shape exposto pela API — converte tipos do DB (DECIMAL→number,
 *  TINYINT→boolean, DATETIME→ISO string) pro formato que o frontend espera. */
export interface ProposalRow {
  id: string;
  numero: string;
  cliente_nome: string;
  total: number;
  created_at: string;
  updated_at: string;
  data: unknown;
  show_line_prices: boolean;
  status: string;
  motivo_perda: string | null;
  revisao: number | null;
  parent_id: string | null;
}

export function rowToApiShape(
  row: typeof proposals.$inferSelect
): ProposalRow {
  return {
    id: row.id,
    numero: row.numero,
    cliente_nome: row.clienteNome,
    total: typeof row.total === "string" ? parseFloat(row.total) : row.total,
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    updated_at:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
    data: row.data,
    show_line_prices: Boolean(row.showLinePrices),
    status: row.status,
    motivo_perda: row.motivoPerda,
    revisao: row.revisao,
    parent_id: row.parentId,
  };
}

export const upsertSchema = z.object({
  id: z.string().min(1).max(36),
  numero: z.string().min(1).max(100),
  cliente_nome: z.string().min(1).max(255),
  total: z.number().finite(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  data: z.unknown(),
  show_line_prices: z.boolean(),
  status: z.string().min(1).max(30),
  motivo_perda: z.string().nullable().optional(),
  revisao: z.number().int().nullable().optional(),
  parent_id: z.string().max(36).nullable().optional(),
});

/** Middleware de auth Clerk. Reusa o mesmo verificador do tRPC. */
async function clerkAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await authenticateRequestWithClerk(req);
    // Anexa o user no req pra logging/auditoria futura (sem usar aqui).
    (req as Request & { user?: typeof user }).user = user;
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unauthorized";
    res.status(401).json({ error: msg });
  }
}

export function createPropostaRouter(): Router {
  const router = Router();

  // Toda rota exige Clerk JWT.
  router.use(clerkAuthMiddleware);

  // ---- Propostas ----------------------------------------------------------

  router.get("/proposals", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível" });
      }
      const rows = await db
        .select()
        .from(proposals)
        .orderBy(desc(proposals.createdAt));
      res.json(rows.map(rowToApiShape));
    } catch (err) {
      console.error("[proposta] GET /proposals falhou:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  router.put("/proposals/:id", async (req, res) => {
    try {
      const parsed = upsertSchema.safeParse({ ...req.body, id: req.params.id });
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Payload inválido", details: parsed.error.format() });
      }
      const p = parsed.data;

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível" });
      }

      const values: typeof proposals.$inferInsert = {
        id: p.id,
        numero: p.numero,
        clienteNome: p.cliente_nome,
        // Drizzle decimal aceita string ou number; usamos string pra evitar
        // precisão flutuante quando o frontend manda valores grandes.
        total: p.total.toFixed(2),
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
        data: p.data,
        showLinePrices: p.show_line_prices,
        status: p.status,
        motivoPerda: p.motivo_perda ?? null,
        revisao: p.revisao ?? null,
        parentId: p.parent_id ?? null,
      };

      // Upsert via INSERT ... ON DUPLICATE KEY UPDATE (MySQL nativo).
      await db
        .insert(proposals)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            numero: values.numero,
            clienteNome: values.clienteNome,
            total: values.total,
            updatedAt: values.updatedAt,
            data: values.data,
            showLinePrices: values.showLinePrices,
            status: values.status,
            motivoPerda: values.motivoPerda,
            revisao: values.revisao,
            parentId: values.parentId,
          },
        });

      const [row] = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, p.id))
        .limit(1);

      if (!row) {
        return res.status(500).json({ error: "Upsert salvou mas linha sumiu" });
      }
      res.json(rowToApiShape(row));
    } catch (err) {
      console.error("[proposta] PUT /proposals/:id falhou:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  router.delete("/proposals/:id", async (req, res) => {
    try {
      const id = req.params.id;
      if (!id || id.length > 36) {
        return res.status(400).json({ error: "id inválido" });
      }
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível" });
      }
      await db.delete(proposals).where(eq(proposals.id, id));
      res.status(204).end();
    } catch (err) {
      console.error("[proposta] DELETE /proposals/:id falhou:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // ---- Sequência por ano --------------------------------------------------

  router.get("/seq/:year/peek", async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year inválido" });
      }
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível" });
      }
      const [row] = await db
        .select()
        .from(seqCounters)
        .where(eq(seqCounters.year, year))
        .limit(1);
      const next = (row?.value ?? 0) + 1;
      res.json({ next });
    } catch (err) {
      console.error("[proposta] GET /seq/:year/peek falhou:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  router.post("/seq/:year/consume", async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year inválido" });
      }
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco indisponível" });
      }

      // Transação com SELECT ... FOR UPDATE pra serializar chamadas
      // concorrentes do /consume. Sem isso, duas requests simultâneas
      // poderiam ler o mesmo `value` e gerar números duplicados.
      const value: number = await db.transaction(async tx => {
        // 1) Trava (ou cria) a linha do ano.
        const existing = await tx.execute(
          sql`SELECT value FROM seq_counters WHERE year = ${year} FOR UPDATE`
        );
        // mysql2 retorna [rows, fields]. Em alguns tipos de Drizzle retorna só rows.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = Array.isArray((existing as any)[0])
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((existing as any)[0] as Array<{ value: number }>)
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((existing as any) as Array<{ value: number }>);

        let lastValue = 0;
        if (rows && rows.length > 0) {
          lastValue = Number(rows[0].value) || 0;
        } else {
          // Ano inexistente — cria começando em 0 (próxima alocação = 1).
          await tx.insert(seqCounters).values({ year, value: 0 });
        }

        const allocated = lastValue + 1;
        await tx
          .update(seqCounters)
          .set({ value: allocated })
          .where(eq(seqCounters.year, year));

        return allocated;
      });

      res.json({ value });
    } catch (err) {
      console.error("[proposta] POST /seq/:year/consume falhou:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}
