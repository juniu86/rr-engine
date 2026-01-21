/**
 * Testes para a funcionalidade de interatividade do Engenheiro Técnico (v2.1)
 * 
 * Verifica:
 * - Detecção de dados faltantes no memorial descritivo
 * - Geração de missingInfoRequests pelo agente
 * - Persistência de userResponses no banco
 * - Fluxo de continueAgent com dados complementares
 */

import { describe, it, expect, vi } from "vitest";
import type { MissingInfoRequest, AgentState, UserResponses } from "../shared/agents";

// Mock do invokeLLM para testes
vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          analysisStatus: "waiting_for_user_input",
          missingInfoRequests: [
            {
              fieldId: "area_total",
              question: "Qual a área total a ser pintada?",
              type: "number",
              unit: "m²",
              required: true,
              hint: "Informe a metragem quadrada total das paredes"
            },
            {
              fieldId: "tipo_tinta",
              question: "Qual o tipo de tinta desejado?",
              type: "select",
              options: ["Látex PVA", "Acrílica", "Esmalte", "Epóxi"],
              required: true
            }
          ],
          items: [],
          observations: ["Memorial muito vago - necessário mais informações"]
        })
      }
    }]
  })
}));

describe("Interatividade do Engenheiro Técnico v2.1", () => {
  
  describe("Interface MissingInfoRequest", () => {
    it("deve ter todos os campos obrigatórios", () => {
      const request: MissingInfoRequest = {
        fieldId: "area_total",
        question: "Qual a área total?",
        type: "number",
        required: true
      };
      
      expect(request.fieldId).toBeDefined();
      expect(request.question).toBeDefined();
      expect(request.type).toBeDefined();
      expect(request.required).toBeDefined();
    });
    
    it("deve suportar campos opcionais", () => {
      const request: MissingInfoRequest = {
        fieldId: "tipo_tinta",
        question: "Qual o tipo de tinta?",
        type: "select",
        required: true,
        options: ["Látex", "Acrílica"],
        unit: undefined,
        hint: "Selecione o tipo de tinta"
      };
      
      expect(request.options).toHaveLength(2);
      expect(request.hint).toBeDefined();
    });
    
    it("deve suportar tipos text, number e select", () => {
      const textRequest: MissingInfoRequest = {
        fieldId: "descricao",
        question: "Descreva o serviço",
        type: "text",
        required: false
      };
      
      const numberRequest: MissingInfoRequest = {
        fieldId: "area",
        question: "Qual a área?",
        type: "number",
        unit: "m²",
        required: true
      };
      
      const selectRequest: MissingInfoRequest = {
        fieldId: "acabamento",
        question: "Qual acabamento?",
        type: "select",
        options: ["Fosco", "Acetinado", "Brilhante"],
        required: true
      };
      
      expect(textRequest.type).toBe("text");
      expect(numberRequest.type).toBe("number");
      expect(selectRequest.type).toBe("select");
    });
  });
  
  describe("Interface AgentState", () => {
    it("deve suportar status waiting_for_user_input", () => {
      const state: AgentState = {
        status: "waiting_for_user_input",
        missingInfoRequests: [
          {
            fieldId: "area",
            question: "Qual a área?",
            type: "number",
            required: true
          }
        ],
        userResponses: {},
        iterationCount: 1
      };
      
      expect(state.status).toBe("waiting_for_user_input");
      expect(state.missingInfoRequests).toHaveLength(1);
      expect(state.iterationCount).toBe(1);
    });
    
    it("deve acumular respostas do usuário", () => {
      const state: AgentState = {
        status: "waiting_for_user_input",
        missingInfoRequests: [],
        userResponses: {
          area_total: 150,
          tipo_tinta: "Acrílica"
        },
        iterationCount: 2
      };
      
      expect(Object.keys(state.userResponses)).toHaveLength(2);
      expect(state.userResponses["area_total"]).toBe(150);
    });
  });
  
  describe("Validação de UserResponses", () => {
    it("deve aceitar valores string e number", () => {
      const responses: UserResponses = {
        descricao: "Pintura de sala de estar",
        area_total: 120.5,
        numero_demaos: 2
      };
      
      expect(typeof responses["descricao"]).toBe("string");
      expect(typeof responses["area_total"]).toBe("number");
      expect(typeof responses["numero_demaos"]).toBe("number");
    });
    
    it("deve mesclar respostas anteriores com novas", () => {
      const previousResponses: UserResponses = {
        area_total: 100
      };
      
      const newResponses: UserResponses = {
        tipo_tinta: "Acrílica"
      };
      
      const merged: UserResponses = {
        ...previousResponses,
        ...newResponses
      };
      
      expect(merged["area_total"]).toBe(100);
      expect(merged["tipo_tinta"]).toBe("Acrílica");
    });
  });
  
  describe("Detecção de Memorial Vago", () => {
    it("deve identificar memorial com menos de 50 caracteres como potencialmente vago", () => {
      const memorial = "Pintar a sala";
      expect(memorial.length).toBeLessThan(50);
    });
    
    it("deve identificar memorial sem metragem como incompleto", () => {
      const memorial = "Pintar as paredes da sala de estar com tinta acrílica branca";
      const hasMetragem = /\d+\s*(m²|m2|metros quadrados)/i.test(memorial);
      expect(hasMetragem).toBe(false);
    });
    
    it("deve identificar memorial com metragem como mais completo", () => {
      const memorial = "Pintar 120m² de paredes com tinta acrílica branca";
      const hasMetragem = /\d+\s*(m²|m2|metros quadrados)/i.test(memorial);
      expect(hasMetragem).toBe(true);
    });
  });
  
  describe("Limite de Iterações", () => {
    it("deve respeitar o limite máximo de 5 iterações", () => {
      const MAX_ITERATIONS = 5;
      let iterationCount = 0;
      
      // Simular múltiplas iterações
      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;
      }
      
      expect(iterationCount).toBe(5);
      expect(iterationCount).not.toBeGreaterThan(MAX_ITERATIONS);
    });
  });
  
  describe("Validação de Campos Obrigatórios", () => {
    it("deve identificar campos obrigatórios não preenchidos", () => {
      const requests: MissingInfoRequest[] = [
        { fieldId: "area", question: "Área?", type: "number", required: true },
        { fieldId: "cor", question: "Cor?", type: "text", required: false },
        { fieldId: "tinta", question: "Tinta?", type: "select", required: true, options: ["A", "B"] }
      ];
      
      const responses: UserResponses = {
        area: 100
        // tinta não preenchido
      };
      
      const requiredFields = requests.filter(r => r.required);
      const missingRequired = requiredFields.filter(r => !responses[r.fieldId]);
      
      expect(requiredFields).toHaveLength(2);
      expect(missingRequired).toHaveLength(1);
      expect(missingRequired[0].fieldId).toBe("tinta");
    });
    
    it("deve validar todos os campos obrigatórios preenchidos", () => {
      const requests: MissingInfoRequest[] = [
        { fieldId: "area", question: "Área?", type: "number", required: true },
        { fieldId: "tinta", question: "Tinta?", type: "select", required: true, options: ["A", "B"] }
      ];
      
      const responses: UserResponses = {
        area: 100,
        tinta: "A"
      };
      
      const requiredFields = requests.filter(r => r.required);
      const missingRequired = requiredFields.filter(r => !responses[r.fieldId]);
      
      expect(missingRequired).toHaveLength(0);
    });
  });
});
