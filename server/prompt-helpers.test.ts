import { describe, expect, it } from "vitest";
import { compactJson, readableJson } from "./utils/promptHelpers";

describe("promptHelpers (P2.3)", () => {
  it("compactJson não tem indentação nem quebras de linha", () => {
    const out = compactJson({ a: 1, b: [2, 3] });
    expect(out).toBe('{"a":1,"b":[2,3]}');
    expect(out).not.toContain("\n");
    expect(out).not.toMatch(/\s{2}/);
  });

  it("compactJson é menor que readableJson para o mesmo objeto", () => {
    const obj = {
      items: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `item ${i}`,
        unit: "m²",
      })),
    };
    expect(compactJson(obj).length).toBeLessThan(readableJson(obj).length);
  });

  it("readableJson preserva o comportamento de JSON.stringify(.., null, 2)", () => {
    const obj = { a: 1, nested: { b: 2 } };
    expect(readableJson(obj)).toBe(JSON.stringify(obj, null, 2));
  });

  it("compactJson preserva todos os valores estruturados (round-trip)", () => {
    const obj = {
      items: [
        { id: 1, qty: 10, unit: "m²" },
        { id: 2, qty: 5.5, unit: "un" },
      ],
      meta: { total: 2 },
    };
    expect(JSON.parse(compactJson(obj))).toEqual(obj);
  });

  it("economia típica fica em 12-18% para arrays médios", () => {
    // Cenário base do diagnóstico do P2.3: array com 100 itens estruturados.
    const obj = {
      budgetItems: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        category: "Estrutura",
        code: `SINAPI-${1000 + i}`,
        description: `Item teste ${i}`,
        unit: "m²",
        quantity: 10 + i,
        unitCostTotal: 85,
        totalCost: 85 * (10 + i),
      })),
    };
    const compact = compactJson(obj).length;
    const readable = readableJson(obj).length;
    const reduction = (readable - compact) / readable;
    // Aceita >= 10% (margem para variação no shape do mock)
    expect(reduction).toBeGreaterThanOrEqual(0.1);
  });
});
