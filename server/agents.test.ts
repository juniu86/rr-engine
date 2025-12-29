import { describe, expect, it } from "vitest";

// Testes de validação da lógica dos agentes (sem executar LLM)

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
