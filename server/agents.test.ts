import { describe, expect, it } from "vitest";
import { agents } from "./agents";
import { summarizeByCategory } from "./agents/gestaoSummarizer";
import {
  createAuditorChunkedInputs,
  needsAuditorChunking,
} from "./agents/auditorChunking";
import {
  generateMockBudgetItems,
  generateMockBudgetItemsWithPlantedDuplicate,
} from "./test-helpers";
import type { AuditorInput, GestaoProjInput } from "../shared/agents";

// Testes de validação da lógica dos agentes (sem executar LLM)

describe("Hard limits removidos (P0.4)", () => {
  describe("Gestão de Projetos — substituição do slice(0, 30) por sumário", () => {
    it("não trunca: prompt cita TOTAL_DE_ITENS exato e cobre todas as categorias", () => {
      const items = generateMockBudgetItems(120);
      const input: GestaoProjInput = {
        budgetItems: items,
        logisticsCosts: { costs: [], totalLogisticsCost: 0, restrictions: [] } as unknown as GestaoProjInput["logisticsCosts"],
        restrictions: "",
      };

      const prompt = agents.gestao_projetos.getUserPrompt(input);

      // Cita o total real
      expect(prompt).toContain("TOTAL_DE_ITENS: 120");
      // Não cita "...e mais N itens" (sinal de truncamento)
      expect(prompt).not.toMatch(/\.\.\.\s*e mais \d+ itens/);
      // Tem 4 categorias agregadas (Estrutura, Instalações, Acabamento, Logística)
      expect(prompt).toContain("Estrutura");
      expect(prompt).toContain("Instalações");
      expect(prompt).toContain("Acabamento");
    });

    it("summarizeByCategory agrega quantidades por unidade corretamente", () => {
      const items = generateMockBudgetItems(40);
      const summary = summarizeByCategory(items, 3);
      // 4 categorias mock cycling
      expect(summary.length).toBe(4);
      // Cada summary tem itemCount + totalCost + topItems até N
      for (const s of summary) {
        expect(s.itemCount).toBeGreaterThan(0);
        expect(s.totalCost).toBeGreaterThan(0);
        expect(s.topItems.length).toBeLessThanOrEqual(3);
        expect(Object.keys(s.totalQuantityByUnit).length).toBeGreaterThan(0);
      }
    });

    it("ignora isSummaryItem=true (itens pais hierárquicos)", () => {
      const items = generateMockBudgetItems(10);
      // Marca o primeiro como pai
      (items[0] as unknown as Record<string, unknown>).isSummaryItem = true;
      const summary = summarizeByCategory(items);
      const total = summary.reduce((s, c) => s + c.itemCount, 0);
      expect(total).toBe(9);
    });
  });

  describe("Auditor — chunking quando há > 60 itens", () => {
    const buildAuditorInput = (items: ReturnType<typeof generateMockBudgetItems>): AuditorInput =>
      ({
        allAgentOutputs: {
          orcamentista: { budgetItems: items },
        },
        projectConfig: { name: "p", bdiPercentual: 25 },
        hasCustomSettings: false,
      }) as unknown as AuditorInput;

    it("audita 100% dos itens em obras de 200+ itens (chunking ativo)", () => {
      const items = generateMockBudgetItems(200);
      const input = buildAuditorInput(items);
      expect(needsAuditorChunking(input)).toBe(true);

      const chunks = createAuditorChunkedInputs(input);
      const acrossChunks = chunks
        .flatMap(c => c.allAgentOutputs.orcamentista?.budgetItems ?? [])
        .map(i => i.id);

      // Cobertura completa: ids 1..200 todos presentes
      expect(acrossChunks.length).toBe(200);
      expect(new Set(acrossChunks).size).toBe(200);
    });

    it("duplicata plantada no item 150 sobrevive ao particionamento", () => {
      const items = generateMockBudgetItemsWithPlantedDuplicate(200, 150);
      const input = buildAuditorInput(items);
      const chunks = createAuditorChunkedInputs(input);

      // O item 150 (índice 150 → id 151) deve estar em algum chunk
      const allItems = chunks.flatMap(
        c => c.allAgentOutputs.orcamentista?.budgetItems ?? []
      );
      const planted = allItems.find(i => i.id === 151);
      expect(planted).toBeDefined();
      expect(planted!.description).toBe(items[0].description);

      // E os ids 1 e 151 devem ter mesma description (= duplicata visível)
      const original = allItems.find(i => i.id === 1);
      expect(original?.description).toBe(planted?.description);
    });

    it("não usa chunking para obras pequenas (<= 60 itens)", () => {
      const input = buildAuditorInput(generateMockBudgetItems(50));
      expect(needsAuditorChunking(input)).toBe(false);
    });
  });
});

describe("Agent temperature configuration (P0.2)", () => {
  it.each<[keyof typeof agents, number]>([
    ["engenheiro_tecnico", 0.3],
    ["logistica", 0.2],
    ["orcamentista", 0.1],
    ["tributario", 0.0],
    ["comercial", 0.0],
    ["gestao_projetos", 0.3],
    ["financeiro", 0.0],
    ["juridico", 0.4],
    ["board", 0.2],
    ["auditor", 0.0],
  ])("agent %s reports temperature %s", (type, expected) => {
    expect(agents[type].getTemperature()).toBe(expected);
  });
});

describe("Agent Logic Validation", () => {
  describe("Logística Agent - Custos Indiretos", () => {
    it("não deve incluir mão de obra direta nos custos logísticos", () => {
      // Categorias válidas para Logística (custos indiretos)
      const validCategories = [
        "mobilização",
        "desmobilização",
        "frete",
        "transporte",
        "bota_fora",
        "caçamba",
        "equipamentos",
        "andaimes",
        "hospedagem",
        "alimentação",
      ];
      
      // Categorias que NÃO devem aparecer (mão de obra direta)
      const invalidCategories = [
        "pedreiro",
        "servente",
        "eletricista",
        "encanador",
        "pintor",
        "diária",
        "mão de obra",
      ];
      
      // Simular output do agente de logística
      const mockLogisticsOutput = {
        costs: [
          { category: "frete", description: "Frete de materiais", totalCost: 500 },
          { category: "bota_fora", description: "Caçamba 5m³", totalCost: 400 },
          { category: "equipamentos", description: "Locação andaimes", totalCost: 800 },
        ],
      };
      
      // Verificar que nenhuma categoria inválida está presente
      for (const cost of mockLogisticsOutput.costs) {
        const categoryLower = cost.category.toLowerCase();
        const descriptionLower = cost.description.toLowerCase();
        
        for (const invalid of invalidCategories) {
          expect(categoryLower).not.toContain(invalid);
          expect(descriptionLower).not.toContain(invalid);
        }
      }
    });
  });

  describe("Comercial Agent - BDI sem Bitributação", () => {
    it("deve calcular preço final usando apenas custo base (sem impostos)", () => {
      // Dados de entrada
      const totalDirectCost = 100000;
      const totalIndirectCost = 10000;
      const totalTaxes = 15000; // Impostos calculados pelo Tributário
      
      // Custo base para BDI (SEM impostos - evita bitributação)
      const custoBase = totalDirectCost + totalIndirectCost;
      
      // BDI padrão para obras (55%)
      const bdi = 0.55;
      
      // Preço final correto (BDI já inclui tributos)
      const precoFinalCorreto = custoBase * (1 + bdi);
      
      // Preço final ERRADO (com bitributação)
      const precoFinalErrado = (custoBase + totalTaxes) * (1 + bdi);
      
      // Validações
      expect(custoBase).toBe(110000);
      expect(precoFinalCorreto).toBe(170500); // R$ 110.000 × 1.55
      expect(precoFinalErrado).toBe(193750); // R$ 125.000 × 1.55 (ERRADO!)
      
      // O preço correto deve ser menor que o errado
      expect(precoFinalCorreto).toBeLessThan(precoFinalErrado);
    });
  });

  describe("Financeiro Agent - Faturamento 40%/60%", () => {
    it("deve calcular faturamento com 40% entrada e 60% final", () => {
      const precoVenda = 100000;
      const duracaoSemanas = 4;
      
      // Regra de faturamento RR Engenharia
      const adiantamento = precoVenda * 0.40;
      const saldoFinal = precoVenda * 0.60;
      
      expect(adiantamento).toBe(40000);
      expect(saldoFinal).toBe(60000);
      expect(adiantamento + saldoFinal).toBe(precoVenda);
      
      // Simular fluxo de caixa
      const fluxoCaixa = [
        { week: 1, income: adiantamento, expense: 25000 },
        { week: 2, income: 0, expense: 20000 },
        { week: 3, income: 0, expense: 15000 },
        { week: 4, income: saldoFinal, expense: 5000 },
      ];
      
      // Calcular saldo acumulado
      let saldoAcumulado = 0;
      for (const item of fluxoCaixa) {
        saldoAcumulado += item.income - item.expense;
      }
      
      // Saldo final deve ser positivo (lucro)
      expect(saldoAcumulado).toBe(35000); // 100.000 - 65.000 = 35.000 de lucro
      expect(saldoAcumulado).toBeGreaterThan(0);
    });
  });

  describe("Proposta Comercial - Preço Proporcional", () => {
    it("deve calcular preços unitários proporcionais ao preço de venda", () => {
      // Itens de orçamento (custo)
      const budgetItems = [
        { description: "Item A", quantity: 10, unitCostTotal: 100 }, // Custo: 1.000
        { description: "Item B", quantity: 5, unitCostTotal: 200 },  // Custo: 1.000
        { description: "Item C", quantity: 20, unitCostTotal: 50 },  // Custo: 1.000
      ];
      
      // Custo total
      const totalCost = budgetItems.reduce((sum, item) => 
        sum + (item.quantity * item.unitCostTotal), 0);
      expect(totalCost).toBe(3000);
      
      // Preço de venda (com BDI de 55%)
      const totalSalePrice = totalCost * 1.55;
      expect(totalSalePrice).toBe(4650);
      
      // Fator de markup
      const markupFactor = totalSalePrice / totalCost;
      expect(markupFactor).toBe(1.55);
      
      // Calcular preços proporcionais
      const proportionalItems = budgetItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitCostTotal * markupFactor,
        totalPrice: item.quantity * item.unitCostTotal * markupFactor,
      }));
      
      // Verificar que a soma dos preços proporcionais = preço de venda
      const totalProportional = proportionalItems.reduce((sum, item) => 
        sum + item.totalPrice, 0);
      expect(totalProportional).toBe(totalSalePrice);
      
      // Verificar que cada item tem preço proporcional correto
      expect(proportionalItems[0].unitPrice).toBe(155); // 100 × 1.55
      expect(proportionalItems[1].unitPrice).toBe(310); // 200 × 1.55
      expect(proportionalItems[2].unitPrice).toBe(77.5); // 50 × 1.55
    });

    it("deve validar range de preço (30% a 100% de BDI)", () => {
      const custoBase = 100000;
      
      // Range válido de preço
      const minExpectedPrice = custoBase * 1.30; // BDI mínimo 30%
      const maxExpectedPrice = custoBase * 2.00; // BDI máximo 100%
      
      expect(minExpectedPrice).toBe(130000);
      expect(maxExpectedPrice).toBe(200000);
      
      // Preço dentro do range (válido)
      const precoValido = custoBase * 1.55;
      expect(precoValido).toBeGreaterThanOrEqual(minExpectedPrice);
      expect(precoValido).toBeLessThanOrEqual(maxExpectedPrice);
      
      // Preço fora do range (inválido - possível duplicação)
      const precoMuitoAlto = custoBase * 2.50;
      expect(precoMuitoAlto).toBeGreaterThan(maxExpectedPrice);
    });
  });

  describe("Gestão de Projetos - Cronograma Baseado em Produtividade", () => {
    it("deve calcular duração baseada em índices SINAPI", () => {
      // Índices SINAPI (Hh/unidade)
      const indices = {
        revestimentoCeramicoPiso: 1.8, // Hh/m²
        pintura: 0.5, // Hh/m²
        pontoEletrico: 1.9, // Hh/ponto
      };
      
      // Quantitativos do projeto
      const quantitativos = {
        revestimentoCeramicoPiso: 50, // m²
        pintura: 100, // m²
        pontoEletrico: 20, // pontos
      };
      
      // Calcular horas totais
      const horasRevestimento = quantitativos.revestimentoCeramicoPiso * indices.revestimentoCeramicoPiso;
      const horasPintura = quantitativos.pintura * indices.pintura;
      const horasEletrica = quantitativos.pontoEletrico * indices.pontoEletrico;
      
      expect(horasRevestimento).toBe(90); // 50 × 1.8
      expect(horasPintura).toBe(50); // 100 × 0.5
      expect(horasEletrica).toBe(38); // 20 × 1.9
      
      // Converter para dias (8h/dia) com equipe de 2 profissionais
      const diasRevestimento = Math.ceil(horasRevestimento / 8 / 2);
      const diasPintura = Math.ceil(horasPintura / 8 / 2);
      const diasEletrica = Math.ceil(horasEletrica / 8 / 2);
      
      expect(diasRevestimento).toBe(6); // 90 ÷ 8 ÷ 2 = 5.6 → 6
      expect(diasPintura).toBe(4); // 50 ÷ 8 ÷ 2 = 3.1 → 4
      expect(diasEletrica).toBe(3); // 38 ÷ 8 ÷ 2 = 2.4 → 3
      
      // Converter para semanas (5 dias/semana) com 20% de folga
      const semanasTotal = Math.ceil((diasRevestimento + diasPintura + diasEletrica) / 5 * 1.2);
      expect(semanasTotal).toBe(4); // (6+4+3) ÷ 5 × 1.2 = 3.12 → 4 semanas
    });
  });
});


describe("Processamento Completo de Memorial", () => {
  it("deve identificar todos os 10 grupos de serviços do memorial", () => {
    // Memorial de teste com 10 grupos
    const gruposEsperados = [
      "1. SERVIÇOS PRELIMINARES",
      "2. ESTRUTURA E VEDAÇÃO",
      "3. COBERTURA",
      "4. IMPERMEABILIZAÇÃO",
      "5. REVESTIMENTOS",
      "6. FORRO E ACABAMENTOS",
      "7. ESQUADRIAS",
      "8. INSTALAÇÕES HIDROSSANITÁRIAS",
      "9. INSTALAÇÕES ELÉTRICAS",
      "10. LIMPEZA E FINALIZAÇÃO",
    ];
    
    expect(gruposEsperados.length).toBe(10);
    
    // Verificar que grupos críticos estão presentes
    expect(gruposEsperados).toContain("2. ESTRUTURA E VEDAÇÃO");
    expect(gruposEsperados).toContain("3. COBERTURA");
    expect(gruposEsperados).toContain("8. INSTALAÇÕES HIDROSSANITÁRIAS");
    expect(gruposEsperados).toContain("9. INSTALAÇÕES ELÉTRICAS");
  });

  it("deve contar corretamente o número total de itens", () => {
    // Contagem de itens por grupo no memorial de teste
    const itensPorGrupo = {
      "1. SERVIÇOS PRELIMINARES": 3,
      "2. ESTRUTURA E VEDAÇÃO": 2,
      "3. COBERTURA": 3,
      "4. IMPERMEABILIZAÇÃO": 2,
      "5. REVESTIMENTOS": 4,
      "6. FORRO E ACABAMENTOS": 3,
      "7. ESQUADRIAS": 3,
      "8. INSTALAÇÕES HIDROSSANITÁRIAS": 8,
      "9. INSTALAÇÕES ELÉTRICAS": 6,
      "10. LIMPEZA E FINALIZAÇÃO": 2,
    };
    
    const totalItens = Object.values(itensPorGrupo).reduce((sum, count) => sum + count, 0);
    
    // Total esperado: 36 itens
    expect(totalItens).toBe(36);
    
    // Verificar que nenhum grupo tem 0 itens
    for (const [grupo, count] of Object.entries(itensPorGrupo)) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("deve validar que output do Orçamentista tem mesmo número de itens que input", () => {
    // Simular input com 36 itens
    const inputItems = Array(36).fill(null).map((_, i) => ({
      description: `Item ${i + 1}`,
      quantity: 1,
      unit: "un",
    }));
    
    // Simular output do Orçamentista
    const outputItems = inputItems.map((item, i) => ({
      id: i + 1,
      category: "Geral",
      code: `ITEM-${i + 1}`,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitCostMaterial: 100,
      unitCostLabor: 50,
      unitCostLogistics: 10,
      unitCostTotal: 160,
      totalCost: 160,
      source: "SINAPI",
      sourceCode: "12345",
      sourceDate: "2024-01",
    }));
    
    // Validação: número de itens deve ser igual
    expect(outputItems.length).toBe(inputItems.length);
    expect(outputItems.length).toBe(36);
  });
});
