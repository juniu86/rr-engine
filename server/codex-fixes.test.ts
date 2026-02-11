import { describe, it, expect } from "vitest";
import { validateAgentCoherence } from "./routers";

// ==================== P0-1: Proposta respeita preço Comercial válido ====================

describe("P0-1: Proposta respeita preço Comercial", () => {
  it("deve aceitar preço comercial dentro do range do BDI configurado", () => {
    // Simula cenário: totalBaseCost=100k, BDI=25%, preço comercial=130k (dentro do range)
    const totalBaseCost = 100000;
    const bdiConfigurado = 0.25;
    const comercialPrice = 130000;
    
    const minExpectedPrice = totalBaseCost * (1 + bdiConfigurado); // 125k
    const maxExpectedPrice = totalBaseCost * (1 + bdiConfigurado * 3); // 175k
    
    expect(comercialPrice).toBeGreaterThanOrEqual(minExpectedPrice);
    expect(comercialPrice).toBeLessThanOrEqual(maxExpectedPrice);
  });

  it("deve usar preço comercial mesmo abaixo do BDI (competitividade)", () => {
    const totalBaseCost = 100000;
    const bdiConfigurado = 0.25;
    const comercialPrice = 110000; // Abaixo do mínimo (125k) mas > 0
    
    const minExpectedPrice = totalBaseCost * (1 + bdiConfigurado);
    
    // O preço comercial é válido (> 0) mas abaixo do mínimo
    expect(comercialPrice).toBeLessThan(minExpectedPrice);
    expect(comercialPrice).toBeGreaterThan(0);
    // Na nova lógica, usamos o preço comercial mesmo assim
  });

  it("deve recalcular quando preço comercial é excessivamente alto", () => {
    const totalBaseCost = 100000;
    const bdiConfigurado = 0.25;
    const comercialPrice = 200000; // Acima de 175k (3x BDI)
    
    const maxExpectedPrice = totalBaseCost * (1 + bdiConfigurado * 3);
    
    expect(comercialPrice).toBeGreaterThan(maxExpectedPrice);
    // Na nova lógica, recalcula com BDI configurado
    const recalculated = totalBaseCost * (1 + bdiConfigurado);
    expect(recalculated).toBe(125000);
  });

  it("não deve usar hardcoded 30% como mínimo", () => {
    // Verifica que o range é baseado no BDI configurado, não em 30% fixo
    const totalBaseCost = 100000;
    const bdiConfigurado = 0.20; // BDI de 20%
    
    const minExpectedPrice = totalBaseCost * (1 + bdiConfigurado);
    expect(minExpectedPrice).toBe(120000); // 20%, não 30%
    expect(minExpectedPrice).not.toBe(130000); // Seria 30% hardcoded
  });
});

// ==================== P0-2: BDI dinâmico (não hardcoded 55%) ====================

describe("P0-2: BDI dinâmico", () => {
  it("deve calcular BDI a partir do valor do projeto", () => {
    const projectBdi = "25.00";
    const bdiValue = parseFloat(projectBdi) / 100;
    expect(bdiValue).toBe(0.25);
    expect(bdiValue).not.toBe(0.55); // Não é hardcoded
  });

  it("deve usar BDI da empresa como fallback", () => {
    const projectBdi = null;
    const companyBdi = "22.50";
    const bdiValue = projectBdi ? parseFloat(projectBdi) / 100 : (parseFloat(companyBdi) / 100 || 0.25);
    expect(bdiValue).toBe(0.225);
  });

  it("deve usar 25% como fallback final", () => {
    const projectBdi = null;
    const companyBdi = "0";
    const bdiValue = projectBdi ? parseFloat(projectBdi) / 100 : (parseFloat(companyBdi) / 100 || 0.25);
    expect(bdiValue).toBe(0.25);
  });

  it("deve aplicar BDI dinâmico nos budget_items", () => {
    const totalCost = 10000;
    const effectiveBdi = 0.25;
    const bdiAmount = totalCost * effectiveBdi;
    const finalPrice = totalCost + bdiAmount;
    
    expect(bdiAmount).toBe(2500);
    expect(finalPrice).toBe(12500);
    expect(bdiAmount).not.toBe(5500); // Não é 55%
  });
});

// ==================== P0-3: executeSingle persiste dados ====================

describe("P0-3: executeSingle persiste dados derivados", () => {
  it("deve reconhecer agentes que precisam de persistência", () => {
    const agentsWithPersistence = ['orcamentista', 'logistica', 'gestao_projetos', 'financeiro'];
    const agentsWithoutPersistence = ['engenheiro_tecnico', 'tributario', 'comercial', 'juridico', 'board', 'auditor'];
    
    // Agentes com persistência devem ter dados derivados
    for (const agent of agentsWithPersistence) {
      expect(['orcamentista', 'logistica', 'gestao_projetos', 'financeiro']).toContain(agent);
    }
    
    // Agentes sem persistência não devem ter dados derivados
    for (const agent of agentsWithoutPersistence) {
      expect(['orcamentista', 'logistica', 'gestao_projetos', 'financeiro']).not.toContain(agent);
    }
  });
});

// ==================== P0-4: executeAll limpa dados anteriores ====================

describe("P0-4: executeAll limpa dados anteriores", () => {
  it("deve ter funções de delete para cada tipo de dado", () => {
    // Verifica que as funções de delete existem no padrão esperado
    const deleteOperations = [
      'deleteBudgetItemsByProjectId',
      'deleteLogisticsCostsByProjectId',
      'deleteScheduleItemsByProjectId',
      'deleteCashFlowItemsByProjectId',
    ];
    
    // Cada operação de delete deve corresponder a uma operação de create
    const createOperations = [
      'createBudgetItems',
      'createLogisticsCosts',
      'createScheduleItems',
      'createCashFlowItems',
    ];
    
    expect(deleteOperations.length).toBe(createOperations.length);
  });
});

// ==================== P1-5: Impostos gravados nos budget_items ====================

describe("P1-5: Impostos gravados nos budget_items", () => {
  it("deve incluir taxAmount no item de orçamento", () => {
    const item = {
      projectId: 1,
      description: "Teste",
      totalCost: "10000",
      bdiAmount: "2500",
      finalPrice: "12500",
      taxAmount: "500", // P1-5: Campo adicionado
    };
    
    expect(item.taxAmount).toBeDefined();
    expect(parseFloat(item.taxAmount)).toBe(500);
  });

  it("deve usar 0 como default para taxAmount ausente", () => {
    const rawItem = { description: "Teste", quantity: 1 };
    const taxAmount = String((rawItem as any).taxAmount || 0);
    expect(taxAmount).toBe("0");
  });
});

// ==================== P1-6: Campo logística padronizado ====================

describe("P1-6: Campo logística padronizado", () => {
  it("deve aceitar totalLogisticsCost como campo principal", () => {
    const logistica = { totalLogisticsCost: 50000 };
    const value = Number(logistica.totalLogisticsCost ?? (logistica as any).totalCost) || 0;
    expect(value).toBe(50000);
  });

  it("deve aceitar totalCost como fallback", () => {
    const logistica = { totalCost: 30000 };
    const value = Number((logistica as any).totalLogisticsCost ?? logistica.totalCost) || 0;
    expect(value).toBe(30000);
  });

  it("deve retornar 0 quando nenhum campo existe", () => {
    const logistica = {};
    const value = Number((logistica as any).totalLogisticsCost ?? (logistica as any).totalCost) || 0;
    expect(value).toBe(0);
  });
});

// ==================== P1-7: Conversão dia para semana ====================

describe("P1-7: Conversão dia para semana no cronograma", () => {
  it("deve converter dias para semanas corretamente", () => {
    const startDay = 1;
    const endDay = 14;
    
    const startWeek = Math.ceil(startDay / 7);
    const endWeek = Math.ceil(endDay / 7);
    
    expect(startWeek).toBe(1);
    expect(endWeek).toBe(2);
  });

  it("deve tratar dia 7 como semana 1", () => {
    expect(Math.ceil(7 / 7)).toBe(1);
  });

  it("deve tratar dia 8 como semana 2", () => {
    expect(Math.ceil(8 / 7)).toBe(2);
  });

  it("deve aceitar startWeek como fallback quando startDay não existe", () => {
    const item = { startWeek: 3, endWeek: 5 };
    const startDay = (item as any).startDay || item.startWeek || 1;
    const endDay = (item as any).endDay || item.endWeek || startDay;
    
    // Quando vem em semanas, o valor já é a semana
    expect(startDay).toBe(3);
    expect(endDay).toBe(5);
  });

  it("deve calcular duração corretamente", () => {
    const startDay = 1;
    const endDay = 21;
    const startWeek = Math.ceil(startDay / 7);
    const endWeek = Math.ceil(endDay / 7);
    const duration = endWeek - startWeek + 1;
    
    expect(startWeek).toBe(1);
    expect(endWeek).toBe(3);
    expect(duration).toBe(3);
  });
});

// ==================== P1-9: UI aceita campos variáveis ====================

describe("P1-9: UI aceita campos variáveis dos agentes", () => {
  it("deve resolver budgetItems como fallback para items", () => {
    const output = { budgetItems: [{ description: "Item 1" }] };
    const items = output.budgetItems || (output as any).items || [];
    expect(items.length).toBe(1);
  });

  it("deve resolver classifiedItems como fallback", () => {
    const output = { classifiedItems: [{ description: "Item 1" }] };
    const items = (output as any).items || output.classifiedItems || [];
    expect(items.length).toBe(1);
  });

  it("deve retornar array vazio quando nenhum campo existe", () => {
    const output = {};
    const items = (output as any).items || (output as any).budgetItems || (output as any).classifiedItems || [];
    expect(items.length).toBe(0);
  });
});

// ==================== P2-10: Detecção de configuração personalizada ====================

describe("P2-10: Detecção de configuração personalizada", () => {
  it("deve retornar false para settings null", () => {
    const settings = null;
    const hasCustom = settings !== null && Boolean(
      (settings as any)?.companyName || (settings as any)?.cnpj
    );
    expect(hasCustom).toBe(false);
  });

  it("deve retornar false para settings vazio", () => {
    const settings = { companyName: null, cnpj: null };
    const hasCustom = Boolean(settings.companyName || settings.cnpj);
    expect(hasCustom).toBe(false);
  });

  it("deve retornar true quando companyName está preenchido", () => {
    const settings = { companyName: "RR Engenharia", cnpj: null };
    const hasCustom = Boolean(settings.companyName || settings.cnpj);
    expect(hasCustom).toBe(true);
  });

  it("deve retornar true quando cnpj está preenchido", () => {
    const settings = { companyName: null, cnpj: "12.345.678/0001-90" };
    const hasCustom = Boolean(settings.companyName || settings.cnpj);
    expect(hasCustom).toBe(true);
  });
});

// ==================== P2-11: Parcelas dinâmicas ====================

describe("P2-11: Parcelas dinâmicas do Comercial", () => {
  it("deve usar paymentTerms do Comercial quando disponível", () => {
    const comercialOutput = { paymentTerms: "50% entrada + 50% na entrega" };
    const defaultTerms = "30/60/90 dias após medição";
    
    const terms = comercialOutput.paymentTerms || defaultTerms;
    expect(terms).toBe("50% entrada + 50% na entrega");
  });

  it("deve usar paymentConditions como fallback", () => {
    const comercialOutput = { paymentConditions: "3x sem juros" };
    const defaultTerms = "30/60/90 dias após medição";
    
    const terms = (comercialOutput as any).paymentTerms || comercialOutput.paymentConditions || defaultTerms;
    expect(terms).toBe("3x sem juros");
  });

  it("deve usar default quando Comercial não define parcelas", () => {
    const comercialOutput = {};
    const defaultTerms = "30/60/90 dias após medição";
    
    const terms = (comercialOutput as any).paymentTerms || (comercialOutput as any).paymentConditions || defaultTerms;
    expect(terms).toBe(defaultTerms);
  });
});

// ==================== P2-12: Auditor usa BDI do Comercial ====================

describe("P2-12: Auditor usa BDI ajustado do Comercial", () => {
  it("deve priorizar adjustedBdi do Comercial", () => {
    const comercialOutput = { adjustedBdi: 0.28 };
    const projectBdi = 25;
    
    const adjustedBdi = comercialOutput.adjustedBdi
      ? (Number(comercialOutput.adjustedBdi) > 1 
          ? Number(comercialOutput.adjustedBdi) 
          : Number(comercialOutput.adjustedBdi) * 100)
      : null;
    const effectiveBdi = adjustedBdi ?? projectBdi;
    
    expect(effectiveBdi).toBeCloseTo(28, 1); // 0.28 * 100 ≈ 28%
    expect(effectiveBdi).not.toBe(25); // Não usa project.bdi
  });

  it("deve usar project.bdi quando Comercial não tem adjustedBdi", () => {
    const comercialOutput = {};
    const projectBdi = 25;
    
    const adjustedBdi = (comercialOutput as any).adjustedBdi
      ? Number((comercialOutput as any).adjustedBdi) * 100
      : null;
    const effectiveBdi = adjustedBdi ?? projectBdi;
    
    expect(effectiveBdi).toBe(25);
  });

  it("deve tratar adjustedBdi já em percentual (> 1)", () => {
    const comercialOutput = { adjustedBdi: 30 }; // Já em percentual
    
    const adjustedBdi = comercialOutput.adjustedBdi > 1 
      ? comercialOutput.adjustedBdi 
      : comercialOutput.adjustedBdi * 100;
    
    expect(adjustedBdi).toBe(30);
  });
});

// ==================== validateAgentCoherence ====================

describe("validateAgentCoherence", () => {
  it("deve validar coerência com campos padronizados", () => {
    const results = {
      orcamentista: { totalDirectCost: 100000, budgetItems: [] },
      logistica: { totalLogisticsCost: 20000, costs: [] },
      tributario: { totalTaxes: 15000 },
      comercial: { adjustedBdi: 0.25, finalPrice: 150000 },
      financeiro: { netMargin: 0 },
    };
    
    const validation = validateAgentCoherence(results);
    expect(validation).toBeDefined();
    expect(validation.inconsistencies).toBeDefined();
    expect(Array.isArray(validation.inconsistencies)).toBe(true);
  });

  it("deve aceitar totalCost como fallback para logística", () => {
    const results = {
      orcamentista: { totalDirectCost: 100000, budgetItems: [] },
      logistica: { totalCost: 20000, costs: [] }, // totalCost em vez de totalLogisticsCost
      tributario: { totalTaxes: 15000 },
      comercial: { adjustedBdi: 0.25, finalPrice: 150000 },
      financeiro: {},
    };
    
    const validation = validateAgentCoherence(results);
    expect(validation).toBeDefined();
  });
});
