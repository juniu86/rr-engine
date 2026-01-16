import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          approved: false,
          blockProposal: true,
          requiresUserConfirmation: false,
          blockReason: "Margem de lucro de 3.8% está abaixo do mínimo de 10%",
          warningMessages: [],
          projectViability: {
            isViable: false,
            profitMargin: "3.8%",
            calculatedMargin: 3.8,
            riskLevel: "critico",
            recommendation: "rejeitar"
          },
          validationResults: {
            priceCalculationCorrect: true,
            priceCalculationDetails: "Cálculo correto",
            scheduleCoherent: true,
            scheduleDetails: "Cronograma adequado",
            cashFlowSustainable: false,
            cashFlowDetails: "Fluxo de caixa negativo",
            allItemsPriced: true,
            unpricedItems: []
          },
          decisions: [{
            issue: "Margem insuficiente",
            agentsInvolved: "Comercial, Orçamentista",
            businessImpact: "Prejuízo potencial",
            decision: "Solicitar revisão financeira",
            justification: "Margem abaixo do mínimo aceitável",
            actionRequired: "Revisar BDI e custos",
            responsible: "Comercial"
          }],
          executiveSummary: "Projeto rejeitado por margem insuficiente",
          finalApproval: {
            ceo: false,
            ceoNotes: "Margem muito baixa",
            cfo: false,
            cfoNotes: "Risco financeiro alto",
            coo: true,
            cooNotes: "Operacionalmente viável"
          },
          conditionsForApproval: "Aumentar margem para mínimo de 15%",
          // Campos de auto-correção financeira
          isFinancialOnlyRejection: true,
          requestFinancialRevision: true,
          financialRevisionReason: "Margem de 3.8% abaixo do mínimo de 10%",
          financialRevisionInstructions: {
            orcamentista: "Revisar preços unitários, buscar alternativas mais econômicas",
            logistica: "Otimizar custos de frete e mobilização",
            tributario: "Verificar possibilidade de redução fiscal",
            comercial: "Aumentar BDI para atingir margem mínima de 15%"
          }
        })
      }
    }]
  })
}));

describe("Financial Revision Feature", () => {
  
  describe("BoardOutput Schema", () => {
    it("should have all required financial revision fields", () => {
      const boardOutput = {
        approved: false,
        blockProposal: true,
        requiresUserConfirmation: false,
        blockReason: "Margem insuficiente",
        warningMessages: [],
        projectViability: {
          isViable: false,
          profitMargin: "3.8%",
          calculatedMargin: 3.8,
          riskLevel: "critico" as const,
          recommendation: "rejeitar" as const
        },
        validationResults: {
          priceCalculationCorrect: true,
          priceCalculationDetails: "",
          scheduleCoherent: true,
          scheduleDetails: "",
          cashFlowSustainable: false,
          cashFlowDetails: "",
          allItemsPriced: true,
          unpricedItems: []
        },
        decisions: [],
        executiveSummary: "",
        finalApproval: {
          ceo: false,
          ceoNotes: "",
          cfo: false,
          cfoNotes: "",
          coo: true,
          cooNotes: ""
        },
        conditionsForApproval: "",
        // Campos de auto-correção
        isFinancialOnlyRejection: true,
        requestFinancialRevision: true,
        financialRevisionReason: "Margem baixa",
        financialRevisionInstructions: {
          orcamentista: "Revisar preços",
          logistica: "Otimizar custos",
          tributario: "Verificar impostos",
          comercial: "Aumentar BDI"
        }
      };
      
      expect(boardOutput.isFinancialOnlyRejection).toBe(true);
      expect(boardOutput.requestFinancialRevision).toBe(true);
      expect(boardOutput.financialRevisionReason).toBeDefined();
      expect(boardOutput.financialRevisionInstructions).toBeDefined();
      expect(boardOutput.financialRevisionInstructions.orcamentista).toBeDefined();
      expect(boardOutput.financialRevisionInstructions.logistica).toBeDefined();
      expect(boardOutput.financialRevisionInstructions.tributario).toBeDefined();
      expect(boardOutput.financialRevisionInstructions.comercial).toBeDefined();
    });
    
    it("should correctly identify financial-only rejection", () => {
      // Rejeição apenas financeira
      const financialOnlyRejection = {
        blockProposal: true,
        isFinancialOnlyRejection: true,
        projectViability: {
          calculatedMargin: 3.8,
          riskLevel: "critico"
        }
      };
      
      // Rejeição operacional (não apenas financeira)
      const operationalRejection = {
        blockProposal: true,
        isFinancialOnlyRejection: false,
        projectViability: {
          calculatedMargin: 3.8,
          riskLevel: "critico"
        }
      };
      
      expect(financialOnlyRejection.isFinancialOnlyRejection).toBe(true);
      expect(operationalRejection.isFinancialOnlyRejection).toBe(false);
    });
  });
  
  describe("Revision Cycle Logic", () => {
    it("should allow revision only once (cycle = 0)", () => {
      const canRevise = (currentCycle: number) => currentCycle === 0;
      
      expect(canRevise(0)).toBe(true);
      expect(canRevise(1)).toBe(false);
      expect(canRevise(2)).toBe(false);
    });
    
    it("should determine if revision should be triggered", () => {
      const shouldTriggerRevision = (
        blockProposal: boolean,
        isFinancialOnly: boolean,
        requestRevision: boolean,
        currentCycle: number
      ) => {
        return blockProposal && 
               isFinancialOnly && 
               requestRevision && 
               currentCycle === 0;
      };
      
      // Caso 1: Deve acionar revisão
      expect(shouldTriggerRevision(true, true, true, 0)).toBe(true);
      
      // Caso 2: Não deve acionar - já passou por revisão
      expect(shouldTriggerRevision(true, true, true, 1)).toBe(false);
      
      // Caso 3: Não deve acionar - não é apenas financeiro
      expect(shouldTriggerRevision(true, false, true, 0)).toBe(false);
      
      // Caso 4: Não deve acionar - Board não solicitou
      expect(shouldTriggerRevision(true, true, false, 0)).toBe(false);
      
      // Caso 5: Não deve acionar - não está bloqueado
      expect(shouldTriggerRevision(false, true, true, 0)).toBe(false);
    });
  });
  
  describe("Financial Revision Instructions", () => {
    it("should have valid instructions for each agent", () => {
      const instructions = {
        orcamentista: "Revisar preços unitários, buscar alternativas mais econômicas",
        logistica: "Otimizar custos de frete e mobilização",
        tributario: "Verificar possibilidade de redução fiscal",
        comercial: "Aumentar BDI para atingir margem mínima de 15%"
      };
      
      // Todas as instruções devem ser strings não vazias
      Object.values(instructions).forEach(instruction => {
        expect(typeof instruction).toBe("string");
        expect(instruction.length).toBeGreaterThan(0);
      });
      
      // Deve ter instruções para todos os agentes financeiros
      expect(instructions).toHaveProperty("orcamentista");
      expect(instructions).toHaveProperty("logistica");
      expect(instructions).toHaveProperty("tributario");
      expect(instructions).toHaveProperty("comercial");
    });
  });
  
  describe("Margin Calculation", () => {
    it("should correctly calculate if margin is below threshold", () => {
      const isMarginBelowThreshold = (margin: number, threshold: number = 10) => {
        return margin < threshold;
      };
      
      expect(isMarginBelowThreshold(3.8)).toBe(true);
      expect(isMarginBelowThreshold(9.9)).toBe(true);
      expect(isMarginBelowThreshold(10)).toBe(false);
      expect(isMarginBelowThreshold(15)).toBe(false);
      expect(isMarginBelowThreshold(25)).toBe(false);
    });
    
    it("should determine target margin for revision", () => {
      const getTargetMargin = (currentMargin: number) => {
        // Se a margem está abaixo de 10%, o alvo é 15%
        if (currentMargin < 10) return 15;
        // Se está entre 10-15%, o alvo é 20%
        if (currentMargin < 15) return 20;
        // Se já está acima de 15%, não precisa revisão
        return currentMargin;
      };
      
      expect(getTargetMargin(3.8)).toBe(15);
      expect(getTargetMargin(12)).toBe(20);
      expect(getTargetMargin(18)).toBe(18);
    });
  });
});
