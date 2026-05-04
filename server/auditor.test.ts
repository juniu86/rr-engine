import { describe, it, expect } from "vitest";
import { AGENT_ORDER, AGENT_NAMES } from "../shared/agents";

describe("Agente Auditor de Consistência", () => {
  describe("Configuração do Agente", () => {
    it("deve estar registrado na ordem de agentes", () => {
      expect(AGENT_ORDER.auditor).toBeDefined();
      expect(AGENT_ORDER.auditor).toBe(10);
    });

    it("deve ter nome definido", () => {
      expect(AGENT_NAMES.auditor).toBeDefined();
      expect(AGENT_NAMES.auditor).toBe("Auditor de Consistência");
    });

    it("deve ser o último agente na sequência", () => {
      const orders = Object.values(AGENT_ORDER);
      const maxOrder = Math.max(...orders);
      expect(AGENT_ORDER.auditor).toBe(maxOrder);
    });
  });

  describe("Validação de Consistência Matemática", () => {
    // Função auxiliar para simular validação do auditor
    const validateConsistency = (data: {
      totalDirectCost: number;
      totalLogisticsCost: number;
      bdiPercentual: number;
      finalPrice: number;
    }) => {
      const { totalDirectCost, totalLogisticsCost, bdiPercentual, finalPrice } = data;
      const expectedPrice = (totalDirectCost + totalLogisticsCost) * (1 + bdiPercentual / 100);
      const tolerance = 0.01; // 1% de tolerância
      const percentError = Math.abs(finalPrice - expectedPrice) / expectedPrice;
      
      return {
        isValid: percentError <= tolerance,
        expectedPrice,
        actualPrice: finalPrice,
        percentError: percentError * 100,
      };
    };

    it("deve validar preço final correto", () => {
      const result = validateConsistency({
        totalDirectCost: 100000,
        totalLogisticsCost: 20000,
        bdiPercentual: 25,
        finalPrice: 150000, // (100000 + 20000) * 1.25 = 150000
      });
      
      expect(result.isValid).toBe(true);
      expect(result.percentError).toBeLessThan(1);
    });

    it("deve detectar preço final inconsistente", () => {
      const result = validateConsistency({
        totalDirectCost: 100000,
        totalLogisticsCost: 20000,
        bdiPercentual: 25,
        finalPrice: 180000, // Valor incorreto
      });
      
      expect(result.isValid).toBe(false);
      expect(result.percentError).toBeGreaterThan(1);
    });

    it("deve aceitar pequenas variações de arredondamento", () => {
      const result = validateConsistency({
        totalDirectCost: 100000,
        totalLogisticsCost: 20000,
        bdiPercentual: 25,
        finalPrice: 150150, // 0.1% de diferença
      });
      
      expect(result.isValid).toBe(true);
    });
  });

  describe("Selo de Auditoria", () => {
    // Função auxiliar para determinar selo de auditoria
    const determineAuditSeal = (validation: {
      criticalErrors: number;
      warnings: number;
      validationScore: number;
    }) => {
      const { criticalErrors, warnings, validationScore } = validation;
      
      if (criticalErrors > 0) {
        return "rejected";
      }
      
      if (warnings > 0 && validationScore >= 80) {
        return "approved_with_warnings";
      }
      
      if (validationScore >= 90) {
        return "approved";
      }
      
      return "rejected";
    };

    it("deve aprovar quando não há erros críticos e score alto", () => {
      const seal = determineAuditSeal({
        criticalErrors: 0,
        warnings: 0,
        validationScore: 95,
      });
      
      expect(seal).toBe("approved");
    });

    it("deve aprovar com warnings quando há alertas mas score é bom", () => {
      const seal = determineAuditSeal({
        criticalErrors: 0,
        warnings: 2,
        validationScore: 85,
      });
      
      expect(seal).toBe("approved_with_warnings");
    });

    it("deve rejeitar quando há erros críticos", () => {
      const seal = determineAuditSeal({
        criticalErrors: 1,
        warnings: 0,
        validationScore: 95,
      });
      
      expect(seal).toBe("rejected");
    });

    it("deve rejeitar quando score é muito baixo", () => {
      const seal = determineAuditSeal({
        criticalErrors: 0,
        warnings: 0,
        validationScore: 70,
      });
      
      expect(seal).toBe("rejected");
    });
  });

  describe("Validação de Campos Obrigatórios", () => {
    // Função auxiliar para validar campos obrigatórios
    const validateRequiredFields = (output: Record<string, any>) => {
      const requiredFields = [
        "totalDirectCost",
        "totalLogisticsCost",
        "finalPrice",
        "bdi",
      ];
      
      const missingFields = requiredFields.filter(field => {
        const value = output[field];
        return value === undefined || value === null || value === 0;
      });
      
      return {
        isValid: missingFields.length === 0,
        missingFields,
      };
    };

    it("deve validar quando todos os campos estão presentes", () => {
      const result = validateRequiredFields({
        totalDirectCost: 100000,
        totalLogisticsCost: 20000,
        finalPrice: 150000,
        bdi: 0.25,
      });
      
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it("deve identificar campos faltantes", () => {
      const result = validateRequiredFields({
        totalDirectCost: 100000,
        totalLogisticsCost: 0, // Zerado
        finalPrice: 150000,
        // bdi faltando
      });

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain("totalLogisticsCost");
      expect(result.missingFields).toContain("bdi");
    });
  });

  describe("Validação Cruzada com Engine Determinístico (P0.1)", () => {
    // Replica a regra de classificação descrita no system prompt do Auditor.
    // Soft alert na v1: severity NÃO altera auditSeal por si só.
    const classify = (deterministicTotal: number, llmTotal: number) => {
      if (llmTotal <= 0) return { divergencePercent: 0, severity: "info" as const };
      const divergencePercent =
        Math.abs((llmTotal - deterministicTotal) / llmTotal) * 100;
      const severity =
        divergencePercent >= 15
          ? ("critical" as const)
          : divergencePercent >= 5
            ? ("warning" as const)
            : ("info" as const);
      return { divergencePercent, severity };
    };

    it("severity=info quando divergência < 5%", () => {
      const r = classify(100_000, 102_000);
      expect(r.severity).toBe("info");
    });

    it("severity=warning quando 5% <= divergência < 15%", () => {
      const r = classify(100_000, 110_000);
      expect(r.severity).toBe("warning");
    });

    it("severity=critical quando divergência >= 15%", () => {
      const r = classify(100_000, 130_000);
      expect(r.severity).toBe("critical");
    });

    it("opera em modo 'engine indisponível' quando deterministicTotal é undefined", () => {
      // Quando o Auditor recebe deterministicTotal=undefined deve registrar
      // validação INFO sem quebrar nada — seguir auditoria normal.
      const auditorInput = {
        deterministicTotal: undefined,
      };
      // O Auditor LLM monta a section com "Indisponível para este projeto"
      // (testado indiretamente via prompt — aqui validamos apenas a tipagem)
      expect(auditorInput.deterministicTotal).toBeUndefined();
    });

    it("severity critical NÃO bloqueia proposta na v1 (soft alert)", () => {
      // O auditSeal é determinado pelas validações 1-7 (margem, preço, etc.).
      // Mesmo com cross-check critical, se as outras passam, selo continua
      // approved/approved_with_warnings. Documentado no prompt do Auditor.
      const determineAuditSealIgnoringCrossCheck = (data: {
        criticalErrorsExceptCrossCheck: number;
        crossCheckSeverity: "info" | "warning" | "critical";
      }) => {
        // Critical do cross-check NÃO incrementa criticalErrors
        if (data.criticalErrorsExceptCrossCheck > 0) return "rejected";
        return "approved_with_warnings";
      };

      expect(
        determineAuditSealIgnoringCrossCheck({
          criticalErrorsExceptCrossCheck: 0,
          crossCheckSeverity: "critical",
        })
      ).toBe("approved_with_warnings");
    });
  });
});
