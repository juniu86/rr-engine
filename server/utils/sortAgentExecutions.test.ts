import { describe, it, expect } from "vitest";
import { sortByAgentOrder } from "./sortAgentExecutions";

describe("sortByAgentOrder (guarda contra ER_OUT_OF_SORTMEMORY)", () => {
  it("ordena por agentOrder mesmo com input desordenado", () => {
    const rows = [
      { agentOrder: 3, agentType: "orcamentista" },
      { agentOrder: 1, agentType: "engenheiro_tecnico" },
      { agentOrder: 2, agentType: "logistica" },
    ];
    expect(sortByAgentOrder(rows).map(r => r.agentOrder)).toEqual([1, 2, 3]);
  });

  it("nao muta o array original", () => {
    const rows = [{ agentOrder: 2 }, { agentOrder: 1 }];
    const original = [...rows];
    sortByAgentOrder(rows);
    expect(rows).toEqual(original);
  });
});
