/**
 * P2 — testes do partial rerun do Engenheiro.
 *
 * Cobre só os helpers (`hashText`, `planChunkRerun`) — testar o
 * `EngenheiroTecnicoAgent.execute()` end-to-end exigiria mock pesado
 * de invokeLLM + db. A lógica de decisão fica testada via os helpers,
 * que são puros e cobrem os 4 cenários (no-cache, memorial-changed,
 * partial-reuse, full-reuse).
 *
 * O caminho de produção (skip de chunks dentro do execute) é coberto
 * por smoke test manual no project DGOA listado na DoD.
 */
import { describe, expect, it } from "vitest";
import {
  hashText,
  planChunkRerun,
  type ChunkSnapshot,
} from "./agents/chunking";
import type { EngenheiroTecnicoOutput } from "../shared/agents";

const fakeOutput = (
  marker: string,
  hadMissingInfo = false
): EngenheiroTecnicoOutput =>
  ({
    items: [{ description: marker, quantity: 1, unit: "un" } as any],
    pendingItems: [],
    nbrReferences: [],
    criticalNotes: [],
    missingInfoRequests: hadMissingInfo
      ? [
          {
            fieldId: "x",
            question: "?",
            type: "text" as const,
            required: true,
          },
        ]
      : [],
    analysisStatus: hadMissingInfo ? "waiting_for_user_input" : "completed",
    groupsProcessed: [],
    totalItemsExtracted: 1,
  }) as EngenheiroTecnicoOutput;

describe("hashText (P2 — partial rerun)", () => {
  it("é determinístico (mesmo input → mesmo hash)", () => {
    const a = hashText("memorial qualquer");
    const b = hashText("memorial qualquer");
    expect(a).toBe(b);
  });

  it("muda quando o input muda em 1 char", () => {
    const a = hashText("memorial");
    const b = hashText("memorial.");
    expect(a).not.toBe(b);
  });

  it("retorna 16 chars hex (slice do sha256)", () => {
    const h = hashText("x");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("planChunkRerun (P2 — partial rerun)", () => {
  const chunks = ["chunk0", "chunk1", "chunk2"];
  const memorialHash = "h_memorial_v1";

  it("sem snapshot prévio → roda todos os chunks", () => {
    const r = planChunkRerun(chunks, memorialHash, null);
    expect(r.reason).toBe("no-cache");
    expect(r.toRerun.size).toBe(3);
    expect(r.reused.size).toBe(0);
  });

  it("sem snapshot prévio (undefined) → roda todos", () => {
    const r = planChunkRerun(chunks, memorialHash, undefined);
    expect(r.reason).toBe("no-cache");
    expect(r.toRerun.size).toBe(3);
  });

  it("memorial mudou → invalida tudo, roda todos", () => {
    const snapshots: ChunkSnapshot[] = chunks.map((c, i) => ({
      chunkIndex: i,
      chunkHash: hashText(c),
      hadMissingInfo: false,
      output: fakeOutput(`prev-${i}`),
    }));
    const r = planChunkRerun(chunks, memorialHash, {
      memorialHash: "h_memorial_v0", // hash diferente
      chunkSnapshots: snapshots,
    });
    expect(r.reason).toBe("memorial-changed");
    expect(r.toRerun.size).toBe(3);
    expect(r.reused.size).toBe(0);
  });

  it("partial-reuse: 1 chunk com missingInfo na run anterior é re-rodado, outros são reutilizados", () => {
    const snapshots: ChunkSnapshot[] = [
      {
        chunkIndex: 0,
        chunkHash: hashText(chunks[0]),
        hadMissingInfo: false,
        output: fakeOutput("prev-0"),
      },
      {
        chunkIndex: 1,
        chunkHash: hashText(chunks[1]),
        hadMissingInfo: true, // ← re-rodar
        output: fakeOutput("prev-1", true),
      },
      {
        chunkIndex: 2,
        chunkHash: hashText(chunks[2]),
        hadMissingInfo: false,
        output: fakeOutput("prev-2"),
      },
    ];
    const r = planChunkRerun(chunks, memorialHash, {
      memorialHash,
      chunkSnapshots: snapshots,
    });
    expect(r.reason).toBe("partial-reuse");
    expect(r.toRerun.size).toBe(1);
    expect(r.toRerun.has(1)).toBe(true);
    expect(r.reused.size).toBe(2);
    expect(r.reused.get(0)?.items?.[0]?.description).toBe("prev-0");
    expect(r.reused.get(2)?.items?.[0]?.description).toBe("prev-2");
  });

  it("full-reuse: todos chunks sem missingInfo + hashes batem → ninguém roda", () => {
    const snapshots: ChunkSnapshot[] = chunks.map((c, i) => ({
      chunkIndex: i,
      chunkHash: hashText(c),
      hadMissingInfo: false,
      output: fakeOutput(`prev-${i}`),
    }));
    const r = planChunkRerun(chunks, memorialHash, {
      memorialHash,
      chunkSnapshots: snapshots,
    });
    expect(r.reason).toBe("full-reuse");
    expect(r.toRerun.size).toBe(0);
    expect(r.reused.size).toBe(3);
  });

  it("chunk individual editado (hash divergente) re-roda mesmo sem missingInfo", () => {
    const snapshots: ChunkSnapshot[] = [
      {
        chunkIndex: 0,
        chunkHash: hashText(chunks[0]),
        hadMissingInfo: false,
        output: fakeOutput("prev-0"),
      },
      {
        chunkIndex: 1,
        chunkHash: hashText("conteudo-antigo-do-chunk-1"), // hash não bate com chunks[1]
        hadMissingInfo: false,
        output: fakeOutput("prev-1"),
      },
      {
        chunkIndex: 2,
        chunkHash: hashText(chunks[2]),
        hadMissingInfo: false,
        output: fakeOutput("prev-2"),
      },
    ];
    const r = planChunkRerun(chunks, memorialHash, {
      memorialHash,
      chunkSnapshots: snapshots,
    });
    expect(r.reason).toBe("partial-reuse");
    expect(r.toRerun.has(1)).toBe(true);
    expect(r.reused.size).toBe(2);
  });

  it("snapshot vazio (chunkSnapshots=[]) é tratado como no-cache", () => {
    const r = planChunkRerun(chunks, memorialHash, {
      memorialHash,
      chunkSnapshots: [],
    });
    expect(r.reason).toBe("no-cache");
    expect(r.toRerun.size).toBe(3);
  });

  it("número de chunks aumentou entre runs → chunks novos são rodados", () => {
    const newChunks = [...chunks, "chunk3"]; // 4 chunks, prev tinha 3
    const snapshots: ChunkSnapshot[] = chunks.map((c, i) => ({
      chunkIndex: i,
      chunkHash: hashText(c),
      hadMissingInfo: false,
      output: fakeOutput(`prev-${i}`),
    }));
    const r = planChunkRerun(newChunks, memorialHash, {
      memorialHash,
      chunkSnapshots: snapshots,
    });
    expect(r.reason).toBe("partial-reuse");
    // 0,1,2 reutilizados; 3 novo (sem snapshot match)
    expect(r.toRerun.has(3)).toBe(true);
    expect(r.toRerun.size).toBe(1);
    expect(r.reused.size).toBe(3);
  });
});
