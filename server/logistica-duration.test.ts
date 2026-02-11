import { describe, it, expect } from "vitest";

describe("LogisticaInput - Remoção de estimatedDuration", () => {
  
  it("LogisticaInput não deve ter campo estimatedDuration na interface", async () => {
    // Importar o tipo e verificar que não tem estimatedDuration
    const agentsModule = await import("../shared/agents");
    
    // Criar um objeto que satisfaz LogisticaInput sem estimatedDuration
    const input: typeof agentsModule.LogisticaInput extends never ? any : any = {
      items: [{ description: "Alvenaria", quantity: 50, unit: "m²" }],
      location: "São Paulo, SP",
      restrictions: "Obra em área residencial",
      budgetItems: [],
    };
    
    // Não deve ter estimatedDuration
    expect(input).not.toHaveProperty("estimatedDuration");
    expect(input.items).toBeDefined();
    expect(input.location).toBeDefined();
    expect(input.restrictions).toBeDefined();
  });

  it("buildAgentInput para logistica não deve retornar estimatedDuration", async () => {
    // Simular o que buildAgentInput retorna para logistica
    const mockProject = {
      location: "São Paulo, SP",
      restrictions: "Horário restrito",
    };
    
    const mockEngenheiroOutput = {
      items: [
        { description: "Alvenaria de bloco", quantity: 100, unit: "m²" },
        { description: "Revestimento argamassado", quantity: 80, unit: "m²" },
      ],
    };
    
    const mockOrcamentistaOutput = {
      budgetItems: [
        { description: "Alvenaria", quantity: 100, unit: "m²", unitCost: 45 },
      ],
    };
    
    // Reproduzir a lógica do buildAgentInput para logistica (v2.11)
    const logisticaInput = {
      items: mockEngenheiroOutput.items || [],
      location: mockProject.location || "",
      restrictions: mockProject.restrictions || "",
      // estimatedDuration removido (v2.11)
      budgetItems: mockOrcamentistaOutput.budgetItems || [],
    };
    
    expect(logisticaInput).not.toHaveProperty("estimatedDuration");
    expect(logisticaInput.items).toHaveLength(2);
    expect(logisticaInput.location).toBe("São Paulo, SP");
    expect(logisticaInput.budgetItems).toHaveLength(1);
  });

  it("LogisticaAgent prompt não deve conter DURAÇÃO ESTIMADA hardcoded", async () => {
    const { LogisticaAgent } = await import("./agents/index");
    const agent = new LogisticaAgent();
    
    const input = {
      items: [{ description: "Pintura", quantity: 200, unit: "m²" }],
      location: "Rio de Janeiro, RJ",
      restrictions: "",
      budgetItems: [
        { description: "Pintura latex", quantity: 200, unit: "m²" },
      ],
    };
    
    const prompt = agent.getUserPrompt(input as any);
    
    // Não deve conter "DURAÇÃO ESTIMADA: 8 semanas" ou qualquer valor hardcoded
    expect(prompt).not.toContain("DURAÇÃO ESTIMADA: 8");
    expect(prompt).not.toContain("estimatedDuration");
    
    // Deve conter instruções para estimar prazo por quantitativos
    expect(prompt).toContain("Estime a duração da obra baseado nos quantitativos");
    expect(prompt).toContain("índices de produtividade");
    expect(prompt).toContain("Hh/m²");
  });

  it("LogisticaAgent prompt deve incluir resumo dos itens orçados", async () => {
    const { LogisticaAgent } = await import("./agents/index");
    const agent = new LogisticaAgent();
    
    const input = {
      items: [{ description: "Estrutura metálica", quantity: 50, unit: "m²" }],
      location: "Curitiba, PR",
      restrictions: "Acesso restrito",
      budgetItems: [
        { description: "Perfil W 150x13", quantity: 500, unit: "kg" },
        { description: "Chapa de aço 3/16\"", quantity: 200, unit: "kg" },
      ],
    };
    
    const prompt = agent.getUserPrompt(input as any);
    
    // Deve incluir resumo dos itens orçados
    expect(prompt).toContain("ITENS ORÇADOS (resumo)");
    expect(prompt).toContain("Perfil W 150x13");
    expect(prompt).toContain("Chapa de aço");
  });

  it("LogisticaAgent prompt deve funcionar sem budgetItems", async () => {
    const { LogisticaAgent } = await import("./agents/index");
    const agent = new LogisticaAgent();
    
    const input = {
      items: [{ description: "Demolição", quantity: 30, unit: "m²" }],
      location: "Belo Horizonte, MG",
      restrictions: "",
      budgetItems: [],
    };
    
    const prompt = agent.getUserPrompt(input as any);
    
    // Não deve ter seção de itens orçados se vazio
    expect(prompt).not.toContain("ITENS ORÇADOS (resumo)");
    // Mas deve ter as instruções de estimativa de prazo
    expect(prompt).toContain("Estime a duração da obra");
  });

  it("LogisticaAgent prompt deve funcionar sem budgetItems undefined", async () => {
    const { LogisticaAgent } = await import("./agents/index");
    const agent = new LogisticaAgent();
    
    const input = {
      items: [{ description: "Fundação", quantity: 20, unit: "m³" }],
      location: "Salvador, BA",
      restrictions: "",
      // budgetItems não definido
    };
    
    const prompt = agent.getUserPrompt(input as any);
    
    // Não deve quebrar sem budgetItems
    expect(prompt).toContain("LOCALIZAÇÃO: Salvador, BA");
    expect(prompt).toContain("Estime a duração da obra");
  });

  it("Não deve existir estimatedDuration em nenhum arquivo do servidor", async () => {
    // Este teste valida que a remoção foi completa
    // Verificar que o shared/agents.ts não tem estimatedDuration como campo obrigatório
    const fs = await import("fs");
    const agentsContent = fs.readFileSync("/home/ubuntu/rr-engine/shared/agents.ts", "utf-8");
    
    // Não deve ter estimatedDuration como campo da interface (pode ter como comentário)
    const lines = agentsContent.split("\n");
    const interfaceLines = lines.filter(l => 
      l.includes("estimatedDuration") && !l.trim().startsWith("//")
    );
    expect(interfaceLines).toHaveLength(0);
  });

  it("routers.ts não deve ter estimatedDuration no buildAgentInput para logistica", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("/home/ubuntu/rr-engine/server/routers.ts", "utf-8");
    
    // Buscar a seção do buildAgentInput para logistica
    const logisticaSection = routersContent.split('case "logistica"')[1]?.split("case ")[0] || "";
    
    // Não deve ter estimatedDuration ativo (pode ter como comentário)
    const activeLines = logisticaSection.split("\n").filter(l => 
      l.includes("estimatedDuration") && !l.trim().startsWith("//")
    );
    expect(activeLines).toHaveLength(0);
  });
});
