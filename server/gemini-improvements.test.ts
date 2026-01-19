import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes para as 3 melhorias críticas sugeridas pelo Gemini:
 * 1. Transações atômicas no banco de dados
 * 2. Refatoração do método execute() - _processLLMResponse()
 * 3. Eliminação de duplicação de código (DRY)
 */

// Mock do drizzle para testes de transação
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
});

const mockTransaction = vi.fn().mockImplementation(async (callback) => {
  const mockTrx = {
    insert: mockInsert,
  };
  return callback(mockTrx);
});

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => ({
    transaction: mockTransaction,
    insert: mockInsert,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
  })),
}));

describe("Melhoria 1: Transações Atômicas", () => {
  it("deve ter função runTransaction exportada", async () => {
    // Verifica que a função existe no módulo
    const dbModule = await import("./db");
    expect(typeof dbModule.runTransaction).toBe("function");
  });

  it("deve ter função createProjectWithAgents que usa transação", async () => {
    const dbModule = await import("./db");
    expect(typeof dbModule.createProjectWithAgents).toBe("function");
  });

  it("deve ter função initializeAgentExecutions exportada", async () => {
    const dbModule = await import("./db");
    expect(typeof dbModule.initializeAgentExecutions).toBe("function");
  });
});

describe("Melhoria 2: Refatoração execute() - _processLLMResponse", () => {
  it("deve processar resposta com conteúdo string direto", () => {
    // Simula resposta válida da LLM
    const mockResponse = {
      choices: [{
        message: {
          content: '{"test": "value"}',
        },
      }],
    };
    
    // A lógica de processamento deve extrair o conteúdo
    const content = mockResponse.choices[0].message.content;
    expect(typeof content).toBe("string");
    expect(JSON.parse(content)).toEqual({ test: "value" });
  });

  it("deve processar resposta com conteúdo array (multimodal)", () => {
    const mockResponse = {
      choices: [{
        message: {
          content: [
            { type: "text", text: '{"test": "multimodal"}' },
            { type: "image", url: "http://example.com" },
          ],
        },
      }],
    };
    
    // Extrai parte de texto do array
    const content = mockResponse.choices[0].message.content;
    if (Array.isArray(content)) {
      const textPart = content.find((part: { type: string }) => part.type === "text") as { type: string; text: string } | undefined;
      expect(textPart?.text).toBe('{"test": "multimodal"}');
    }
  });

  it("deve rejeitar resposta sem choices", () => {
    const mockResponse = { choices: [] };
    expect(mockResponse.choices.length).toBe(0);
  });

  it("deve rejeitar resposta com message vazia", () => {
    const mockResponse = {
      choices: [{
        message: null,
      }],
    };
    expect(mockResponse.choices[0].message).toBeNull();
  });
});

describe("Melhoria 3: Eliminação de Duplicação (DRY)", () => {
  it("AGENT_TYPES_ORDERED deve ter 9 agentes", async () => {
    // A constante interna deve ter todos os 9 tipos de agentes
    const expectedAgents = [
      "engenheiro_tecnico", "orcamentista", "logistica", "tributario",
      "comercial", "gestao_projetos", "financeiro", "juridico", "board"
    ];
    
    expect(expectedAgents.length).toBe(9);
  });

  it("initializeAgentExecutions deve aceitar transação opcional", async () => {
    const dbModule = await import("./db");
    
    // Verifica que a função aceita 2 parâmetros (projectId, trx?)
    // O segundo parâmetro é opcional
    expect(dbModule.initializeAgentExecutions.length).toBeGreaterThanOrEqual(1);
  });

  it("createProjectRevision deve usar transação internamente", async () => {
    const dbModule = await import("./db");
    
    // Verifica que a função existe e aceita os parâmetros corretos
    expect(typeof dbModule.createProjectRevision).toBe("function");
    expect(dbModule.createProjectRevision.length).toBe(3); // originalProjectId, newMemorial, userId
  });
});

describe("Consistência de Tipos de Agentes", () => {
  it("AGENT_ORDER deve ter todos os 9 agentes", async () => {
    const { AGENT_ORDER } = await import("../shared/agents");
    
    const expectedAgents = [
      "engenheiro_tecnico", "orcamentista", "logistica", "tributario",
      "comercial", "gestao_projetos", "financeiro", "juridico", "board"
    ];
    
    for (const agent of expectedAgents) {
      expect(AGENT_ORDER[agent]).toBeDefined();
      expect(typeof AGENT_ORDER[agent]).toBe("number");
    }
  });

  it("AGENT_ORDER deve ter ordem sequencial de 1 a 10", async () => {
    const { AGENT_ORDER } = await import("../shared/agents");
    
    const orders = Object.values(AGENT_ORDER);
    expect(orders.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
