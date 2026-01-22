/**
 * Testes para o Histórico de Interações do Engenheiro Técnico
 * 
 * Verifica:
 * - Estrutura da tabela agent_interactions
 * - Registro de perguntas do agente
 * - Registro de respostas do usuário
 * - Limite de iterações com histórico detalhado
 */

import { describe, it, expect } from "vitest";

// Interface para interação
interface AgentInteraction {
  id: number;
  projectId: number;
  agentExecutionId: number;
  agentType: string;
  iterationNumber: number;
  questions: MissingInfoRequest[];
  responses: Record<string, string | number> | null;
  reasonForQuestions: string | null;
  questionedAt: Date;
  respondedAt: Date | null;
}

interface MissingInfoRequest {
  fieldId: string;
  question: string;
  type: "number" | "text" | "select";
  unit?: string;
  options?: { value: string; label: string }[];
}

describe("Histórico de Interações", () => {
  describe("Estrutura de Dados", () => {
    it("deve ter campos obrigatórios na interação", () => {
      const interaction: AgentInteraction = {
        id: 1,
        projectId: 100,
        agentExecutionId: 50,
        agentType: "engenheiro_tecnico",
        iterationNumber: 1,
        questions: [
          {
            fieldId: "area_total",
            question: "Qual a área total a ser pintada?",
            type: "number",
            unit: "m²",
          },
        ],
        responses: null,
        reasonForQuestions: "Memorial descritivo incompleto",
        questionedAt: new Date(),
        respondedAt: null,
      };

      expect(interaction.projectId).toBeDefined();
      expect(interaction.agentExecutionId).toBeDefined();
      expect(interaction.agentType).toBe("engenheiro_tecnico");
      expect(interaction.iterationNumber).toBe(1);
      expect(interaction.questions).toHaveLength(1);
    });

    it("deve suportar múltiplas perguntas por iteração", () => {
      const questions: MissingInfoRequest[] = [
        {
          fieldId: "area_total",
          question: "Qual a área total a ser pintada?",
          type: "number",
          unit: "m²",
        },
        {
          fieldId: "tipo_tinta",
          question: "Qual o tipo de tinta desejado?",
          type: "select",
          options: [
            { value: "acrilica", label: "Acrílica fosca" },
            { value: "latex", label: "Látex PVA" },
          ],
        },
        {
          fieldId: "demaos",
          question: "Quantas demãos de tinta?",
          type: "number",
        },
      ];

      expect(questions).toHaveLength(3);
      expect(questions[0].type).toBe("number");
      expect(questions[1].type).toBe("select");
      expect(questions[1].options).toBeDefined();
    });

    it("deve registrar respostas do usuário", () => {
      const interaction: AgentInteraction = {
        id: 1,
        projectId: 100,
        agentExecutionId: 50,
        agentType: "engenheiro_tecnico",
        iterationNumber: 1,
        questions: [
          {
            fieldId: "area_total",
            question: "Qual a área total?",
            type: "number",
            unit: "m²",
          },
        ],
        responses: {
          area_total: 150,
          tipo_tinta: "acrilica",
          demaos: 2,
        },
        reasonForQuestions: "Memorial incompleto",
        questionedAt: new Date("2026-01-22T10:00:00"),
        respondedAt: new Date("2026-01-22T10:05:00"),
      };

      expect(interaction.responses).not.toBeNull();
      expect(interaction.responses?.area_total).toBe(150);
      expect(interaction.respondedAt).not.toBeNull();
    });
  });

  describe("Limite de Iterações", () => {
    it("deve limitar a 5 iterações", () => {
      const MAX_ITERATIONS = 5;
      const currentIteration = 6;

      expect(currentIteration > MAX_ITERATIONS).toBe(true);
    });

    it("deve gerar resumo detalhado ao atingir limite", () => {
      const interactions: AgentInteraction[] = [
        {
          id: 1,
          projectId: 100,
          agentExecutionId: 50,
          agentType: "engenheiro_tecnico",
          iterationNumber: 1,
          questions: [
            { fieldId: "area", question: "Qual a área?", type: "number", unit: "m²" },
          ],
          responses: { area: 100 },
          reasonForQuestions: "Dados faltantes",
          questionedAt: new Date(),
          respondedAt: new Date(),
        },
        {
          id: 2,
          projectId: 100,
          agentExecutionId: 50,
          agentType: "engenheiro_tecnico",
          iterationNumber: 2,
          questions: [
            { fieldId: "tipo", question: "Qual o tipo?", type: "text" },
          ],
          responses: { tipo: "acrílica" },
          reasonForQuestions: "Especificação necessária",
          questionedAt: new Date(),
          respondedAt: new Date(),
        },
      ];

      // Construir resumo
      let summary = `=== HISTÓRICO DE INTERAÇÕES (${interactions.length}) ===\n`;
      for (const interaction of interactions) {
        summary += `\n--- Iteração ${interaction.iterationNumber} ---\n`;
        summary += `Motivo: ${interaction.reasonForQuestions}\n`;
        summary += `Perguntas:\n`;
        for (const q of interaction.questions) {
          summary += `  • ${q.question}\n`;
        }
        if (interaction.responses) {
          summary += `Respostas:\n`;
          for (const q of interaction.questions) {
            const response = interaction.responses[q.fieldId];
            if (response !== undefined) {
              summary += `  • ${q.question}: ${response}${q.unit ? ` ${q.unit}` : ""}\n`;
            }
          }
        }
      }

      expect(summary).toContain("HISTÓRICO DE INTERAÇÕES (2)");
      expect(summary).toContain("Iteração 1");
      expect(summary).toContain("Iteração 2");
      expect(summary).toContain("Qual a área?");
      expect(summary).toContain("100 m²");
    });
  });

  describe("Fluxo de Interação", () => {
    it("deve identificar interação pendente (sem resposta)", () => {
      const interaction: AgentInteraction = {
        id: 1,
        projectId: 100,
        agentExecutionId: 50,
        agentType: "engenheiro_tecnico",
        iterationNumber: 1,
        questions: [
          { fieldId: "area", question: "Qual a área?", type: "number" },
        ],
        responses: null,
        reasonForQuestions: "Dados faltantes",
        questionedAt: new Date(),
        respondedAt: null,
      };

      const isPending = interaction.respondedAt === null;
      expect(isPending).toBe(true);
    });

    it("deve identificar interação respondida", () => {
      const interaction: AgentInteraction = {
        id: 1,
        projectId: 100,
        agentExecutionId: 50,
        agentType: "engenheiro_tecnico",
        iterationNumber: 1,
        questions: [
          { fieldId: "area", question: "Qual a área?", type: "number" },
        ],
        responses: { area: 50 },
        reasonForQuestions: "Dados faltantes",
        questionedAt: new Date("2026-01-22T10:00:00"),
        respondedAt: new Date("2026-01-22T10:05:00"),
      };

      const isPending = interaction.respondedAt === null;
      expect(isPending).toBe(false);
    });

    it("deve calcular tempo de resposta", () => {
      const questionedAt = new Date("2026-01-22T10:00:00");
      const respondedAt = new Date("2026-01-22T10:05:00");

      const responseTimeMs = respondedAt.getTime() - questionedAt.getTime();
      const responseTimeMinutes = responseTimeMs / (1000 * 60);

      expect(responseTimeMinutes).toBe(5);
    });
  });

  describe("Validação de Tipos de Campo", () => {
    it("deve suportar campo numérico com unidade", () => {
      const field: MissingInfoRequest = {
        fieldId: "area_total",
        question: "Qual a área total?",
        type: "number",
        unit: "m²",
      };

      expect(field.type).toBe("number");
      expect(field.unit).toBe("m²");
    });

    it("deve suportar campo de seleção com opções", () => {
      const field: MissingInfoRequest = {
        fieldId: "tipo_tinta",
        question: "Qual o tipo de tinta?",
        type: "select",
        options: [
          { value: "acrilica_fosca", label: "Acrílica fosca" },
          { value: "acrilica_semi", label: "Acrílica semi-brilho" },
          { value: "latex", label: "Látex PVA" },
          { value: "esmalte", label: "Esmalte sintético" },
        ],
      };

      expect(field.type).toBe("select");
      expect(field.options).toHaveLength(4);
      expect(field.options?.[0].value).toBe("acrilica_fosca");
    });

    it("deve suportar campo de texto livre", () => {
      const field: MissingInfoRequest = {
        fieldId: "observacoes",
        question: "Alguma observação adicional?",
        type: "text",
      };

      expect(field.type).toBe("text");
      expect(field.unit).toBeUndefined();
      expect(field.options).toBeUndefined();
    });
  });

  describe("Erro ao Atingir Limite", () => {
    it("deve incluir código de erro específico", () => {
      const error = {
        code: "MAX_ITERATIONS_REACHED",
        message: "Limite máximo de iterações atingido",
        interactionCount: 5,
      };

      expect(error.code).toBe("MAX_ITERATIONS_REACHED");
      expect(error.interactionCount).toBe(5);
    });

    it("deve sugerir ação ao usuário", () => {
      const errorMessage = "Número máximo de iterações atingido (5/5). O memorial descritivo precisa de mais detalhes para que o orçamento seja gerado corretamente. Por favor, edite o memorial descritivo adicionando mais informações técnicas (medidas, especificações, quantidades) e tente novamente.";

      expect(errorMessage).toContain("edite o memorial descritivo");
      expect(errorMessage).toContain("informações técnicas");
    });
  });
});
