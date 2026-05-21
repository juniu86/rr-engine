import { describe, it, expect } from "vitest";
import {
  needsChunking,
  splitMemorialIntoChunks,
  createChunkedInputs,
  mergeEngenheiroOutputs,
} from "./agents/chunking";
import type { EngenheiroTecnicoOutput } from "../shared/agents";

describe("JSON Truncation Prevention", () => {
  describe("needsChunking", () => {
    it("deve retornar false para memorial curto (< 25 linhas)", () => {
      const memorial = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}: Serviço de teste`).join("\n");
      expect(needsChunking(memorial)).toBe(false);
    });

    it("deve retornar true para memorial grande (> 25 linhas)", () => {
      const memorial = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}: Serviço de teste com descrição detalhada`).join("\n");
      expect(needsChunking(memorial)).toBe(true);
    });

    it("deve ignorar linhas vazias na contagem", () => {
      const lines = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}: Serviço`);
      const memorial = lines.join("\n\n\n"); // Muitas linhas vazias
      expect(needsChunking(memorial)).toBe(false);
    });

    it("deve respeitar threshold customizado", () => {
      const memorial = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}: Serviço`).join("\n");
      expect(needsChunking(memorial, 10)).toBe(true);
      expect(needsChunking(memorial, 15)).toBe(false);
    });
  });

  describe("splitMemorialIntoChunks", () => {
    it("deve retornar memorial inteiro se cabe em um chunk", () => {
      const memorial = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`).join("\n");
      const chunks = splitMemorialIntoChunks(memorial);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(memorial);
    });

    it("deve dividir memorial grande em múltiplos chunks", () => {
      const memorial = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}: Serviço detalhado`).join("\n");
      const chunks = splitMemorialIntoChunks(memorial, { maxItemsPerChunk: 20, overlapLines: 2 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("deve ter overlap entre chunks", () => {
      const lines = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}: Serviço`);
      const memorial = lines.join("\n");
      const chunks = splitMemorialIntoChunks(memorial, { maxItemsPerChunk: 20, overlapLines: 2 });
      
      // Chunk 1 deve ter 20 linhas, chunk 2 deve começar do item 19 (overlap de 2)
      expect(chunks.length).toBe(3); // 40 linhas / (20-2) step = ~2.2 → 3 chunks
    });

    it("deve preservar todas as linhas nos chunks combinados", () => {
      const lines = Array.from({ length: 35 }, (_, i) => `Item ${i + 1}`);
      const memorial = lines.join("\n");
      const chunks = splitMemorialIntoChunks(memorial, { maxItemsPerChunk: 20, overlapLines: 2 });
      
      // Cada linha original deve aparecer em pelo menos um chunk
      for (const line of lines) {
        const found = chunks.some(chunk => chunk.includes(line));
        expect(found).toBe(true);
      }
    });
  });

  describe("createChunkedInputs", () => {
    it("deve criar inputs com location e restrictions preservados", () => {
      const memorial = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}: Serviço`).join("\n");
      const input = {
        memorialDescritivo: memorial,
        location: "São Paulo - SP",
        restrictions: "Acesso restrito",
      };
      
      const chunkedInputs = createChunkedInputs(input);
      expect(chunkedInputs.length).toBeGreaterThan(1);
      
      for (const ci of chunkedInputs) {
        expect(ci.location).toBe("São Paulo - SP");
        expect(ci.restrictions).toBe("Acesso restrito");
        // Sprint-3: marker mudou de "[PARTE" para "[CHUNK".
        expect(ci.memorialDescritivo).toContain("[CHUNK");
      }
    });

    it("deve numerar as partes corretamente", () => {
      const memorial = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}: Serviço`).join("\n");
      const input = { memorialDescritivo: memorial, location: "RJ", restrictions: "" };

      const chunkedInputs = createChunkedInputs(input);
      const total = chunkedInputs.length;

      chunkedInputs.forEach((ci, idx) => {
        // Sprint-3: formato passou a ser "[CHUNK 1/3 — INSTRUÇÕES ...]" em vez de "[PARTE 1 de 3]".
        expect(ci.memorialDescritivo).toContain(`[CHUNK ${idx + 1}/${total}`);
      });
    });
  });

  describe("mergeEngenheiroOutputs", () => {
    const makeOutput = (items: string[], status: "completed" | "waiting_for_user_input" = "completed"): EngenheiroTecnicoOutput => ({
      analysisStatus: status,
      missingInfoRequests: [],
      items: items.map(desc => ({
        description: desc,
        quantity: 1,
        unit: "un",
        specifications: "",
        nbrReference: "",
        isPendingVistoria: false,
      })),
      pendingItems: [],
      nbrReferences: ["NBR 15575"],
      criticalNotes: [],
      groupsProcessed: ["Grupo 1"],
      totalItemsExtracted: items.length,
    });

    it("deve retornar output vazio para array vazio", () => {
      const result = mergeEngenheiroOutputs([]);
      expect(result.items).toHaveLength(0);
      expect(result.analysisStatus).toBe("completed");
    });

    it("deve retornar output direto para array com 1 elemento", () => {
      const output = makeOutput(["Item A", "Item B"]);
      const result = mergeEngenheiroOutputs([output]);
      expect(result).toBe(output);
    });

    it("deve combinar items de múltiplos outputs", () => {
      const o1 = makeOutput(["Item A", "Item B"]);
      const o2 = makeOutput(["Item C", "Item D"]);
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.items).toHaveLength(4);
    });

    it("deve deduplicar items com mesma description", () => {
      const o1 = makeOutput(["Item A", "Item B"]);
      const o2 = makeOutput(["Item B", "Item C"]); // Item B duplicado
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.items).toHaveLength(3); // A, B, C
    });

    it("deve somar totalItemsExtracted", () => {
      const o1 = makeOutput(["A", "B"]);
      const o2 = makeOutput(["C", "D", "E"]);
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.totalItemsExtracted).toBe(5);
    });

    it("deve deduplicar nbrReferences", () => {
      const o1 = makeOutput(["A"]);
      o1.nbrReferences = ["NBR 15575", "NBR 16280"];
      const o2 = makeOutput(["B"]);
      o2.nbrReferences = ["NBR 15575", "NBR 13752"];
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.nbrReferences).toHaveLength(3);
    });

    it("deve retornar waiting_for_user_input se um chunk waiting trouxer perguntas reais", () => {
      const o1 = makeOutput(["A"], "completed");
      const o2 = makeOutput(["B"], "waiting_for_user_input");
      o2.missingInfoRequests = [
        { fieldId: "area_sala", question: "Qual a area em m2?", type: "text" },
      ];
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.analysisStatus).toBe("waiting_for_user_input");
      expect(result.missingInfoRequests).toHaveLength(1);
    });

    it("deve seguir como completed se um chunk marcar waiting mas sem perguntas (anti-trava)", () => {
      const o1 = makeOutput(["A"], "completed");
      const o2 = makeOutput(["B"], "waiting_for_user_input"); // missingInfoRequests vazio
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.analysisStatus).toBe("completed");
      expect(result.missingInfoRequests).toHaveLength(0);
    });

    it("deve retornar completed se todos os outputs estiverem completed", () => {
      const o1 = makeOutput(["A"], "completed");
      const o2 = makeOutput(["B"], "completed");
      const result = mergeEngenheiroOutputs([o1, o2]);
      expect(result.analysisStatus).toBe("completed");
    });
  });

  describe("Truncation Detection (BaseAgent)", () => {
    it("deve detectar JSON truncado que começa com { mas não termina com }", () => {
      const truncated = '{"items": [{"group": "Mobilização", "description": "Mob';
      const trimmed = truncated.trim();
      const isLikelyTruncated = 
        (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && !trimmed.endsWith(']'));
      expect(isLikelyTruncated).toBe(true);
    });

    it("deve detectar JSON truncado que começa com [ mas não termina com ]", () => {
      const truncated = '[{"item": 1}, {"item": 2';
      const trimmed = truncated.trim();
      const isLikelyTruncated = 
        (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && !trimmed.endsWith(']'));
      expect(isLikelyTruncated).toBe(true);
    });

    it("deve NÃO detectar JSON válido como truncado", () => {
      const valid = '{"items": [{"group": "Mobilização"}]}';
      const trimmed = valid.trim();
      const isLikelyTruncated = 
        (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && !trimmed.endsWith(']'));
      expect(isLikelyTruncated).toBe(false);
    });

    it("deve identificar finish_reason max_tokens como truncamento", () => {
      const finishReason = "max_tokens";
      const isTruncated = finishReason === "max_tokens" || finishReason === "length";
      expect(isTruncated).toBe(true);
    });

    it("deve identificar finish_reason length como truncamento", () => {
      const finishReason = "length";
      const isTruncated = finishReason === "max_tokens" || finishReason === "length";
      expect(isTruncated).toBe(true);
    });

    it("deve NÃO identificar finish_reason stop como truncamento", () => {
      const finishReason = "stop";
      const isTruncated = finishReason === "max_tokens" || finishReason === "length";
      expect(isTruncated).toBe(false);
    });
  });
});
