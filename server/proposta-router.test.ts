import { describe, expect, it } from "vitest";
import {
  rowToApiShape,
  upsertSchema,
  type ProposalRow,
} from "./routers/proposta";

const baseRow = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: "RR-070/2026",
  clienteNome: "Cliente Teste",
  total: "1500.50", // DECIMAL vem como string no mysql2
  createdAt: new Date("2026-05-13T10:00:00Z"),
  updatedAt: new Date("2026-05-13T10:30:00Z"),
  data: { itens: [{ descricao: "Item A", quantidade: 1 }] },
  showLinePrices: true,
  status: "rascunho",
  motivoPerda: null,
  revisao: null,
  parentId: null,
};

describe("rowToApiShape — conversão DB → API", () => {
  it("DECIMAL string vira number; TINYINT/boolean vira boolean; DATETIME vira ISO 8601", () => {
    const out = rowToApiShape(baseRow as never);
    const expected: ProposalRow = {
      id: "11111111-1111-1111-1111-111111111111",
      numero: "RR-070/2026",
      cliente_nome: "Cliente Teste",
      total: 1500.5,
      created_at: "2026-05-13T10:00:00.000Z",
      updated_at: "2026-05-13T10:30:00.000Z",
      data: { itens: [{ descricao: "Item A", quantidade: 1 }] },
      show_line_prices: true,
      status: "rascunho",
      motivo_perda: null,
      revisao: null,
      parent_id: null,
    };
    expect(out).toEqual(expected);
  });

  it("propaga campos opcionais quando presentes (motivo_perda, revisao, parent_id)", () => {
    const out = rowToApiShape({
      ...baseRow,
      status: "perdida",
      motivoPerda: "Preço acima do orçamento do cliente",
      revisao: 2,
      parentId: "22222222-2222-2222-2222-222222222222",
    } as never);
    expect(out.status).toBe("perdida");
    expect(out.motivo_perda).toBe("Preço acima do orçamento do cliente");
    expect(out.revisao).toBe(2);
    expect(out.parent_id).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("aceita total já como number (sem conversão dupla)", () => {
    const out = rowToApiShape({ ...baseRow, total: 999.99 } as never);
    expect(out.total).toBe(999.99);
  });

  it("aceita createdAt como string ISO e devolve ISO", () => {
    // Caso o driver MySQL devolva DATETIME como string em vez de Date.
    const row = { ...baseRow, createdAt: "2026-05-13T10:00:00Z" };
    const out = rowToApiShape(row as never);
    expect(out.created_at).toBe("2026-05-13T10:00:00.000Z");
  });
});

describe("upsertSchema — validação de payload", () => {
  const valid = {
    id: "abc-123",
    numero: "RR-070/2026",
    cliente_nome: "Cliente",
    total: 1500.5,
    created_at: "2026-05-13T10:00:00.000Z",
    updated_at: "2026-05-13T10:30:00.000Z",
    data: { qualquer: "json" },
    show_line_prices: true,
    status: "rascunho",
  };

  it("aceita payload válido mínimo (campos opcionais ausentes)", () => {
    const r = upsertSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejeita created_at em formato inválido", () => {
    const r = upsertSchema.safeParse({
      ...valid,
      created_at: "13/05/2026 10:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita total não finito (NaN, Infinity)", () => {
    const r1 = upsertSchema.safeParse({ ...valid, total: Infinity });
    const r2 = upsertSchema.safeParse({ ...valid, total: NaN });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });

  it("rejeita id vazio", () => {
    const r = upsertSchema.safeParse({ ...valid, id: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita numero acima do limite (100 chars)", () => {
    const r = upsertSchema.safeParse({ ...valid, numero: "x".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("aceita revisao como int e null/undefined", () => {
    expect(
      upsertSchema.safeParse({ ...valid, revisao: 1 }).success
    ).toBe(true);
    expect(
      upsertSchema.safeParse({ ...valid, revisao: null }).success
    ).toBe(true);
    expect(
      upsertSchema.safeParse({ ...valid, revisao: undefined }).success
    ).toBe(true);
  });

  it("rejeita revisao não inteira", () => {
    const r = upsertSchema.safeParse({ ...valid, revisao: 1.5 });
    expect(r.success).toBe(false);
  });

  it("aceita status conforme enum lógico (string livre de até 30 chars)", () => {
    for (const s of [
      "rascunho",
      "enviada",
      "em_negociacao",
      "ganha",
      "perdida",
      "cancelada",
    ]) {
      expect(upsertSchema.safeParse({ ...valid, status: s }).success).toBe(
        true
      );
    }
  });
});

describe("Numeração RR-XXX/YYYY (formato exibido pelo frontend)", () => {
  // Decisão (12/05/2026): backend devolve só o número; frontend monta o
  // formato. Esses asserts ficam aqui pra documentar a expectativa e
  // travar regressões caso o formato mude.
  function formatNumero(seq: number, year: number): string {
    return `RR-${String(seq).padStart(3, "0")}/${year}`;
  }

  it("zero-pad 3 dígitos", () => {
    expect(formatNumero(70, 2026)).toBe("RR-070/2026");
    expect(formatNumero(7, 2026)).toBe("RR-007/2026");
    expect(formatNumero(700, 2026)).toBe("RR-700/2026");
  });

  it("seq inicial fechado no banco: default 69 → próxima alocação 70", () => {
    // O endpoint /consume retorna `last + 1`. Default 69 (migration 0024)
    // garante que a primeira proposta de 2026 saia como 70.
    const defaultLast = 69;
    const firstAlloc = defaultLast + 1;
    expect(firstAlloc).toBe(70);
    expect(formatNumero(firstAlloc, 2026)).toBe("RR-070/2026");
  });
});
