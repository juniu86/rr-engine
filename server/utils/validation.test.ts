/**
 * Testes para validação de campos opcionais
 * 
 * Verifica que campos do tipo 'number' aceitam valor 0 quando allowZero é true.
 */

import { describe, it, expect } from "vitest";
import { 
  validateFieldResponse, 
  validateAllResponses, 
  isValidNumericValue,
  type FieldRequest 
} from "./validation";

describe("validateFieldResponse", () => {
  describe("Campos numéricos com allowZero", () => {
    it("deve aceitar valor 0 quando allowZero é true (padrão)", () => {
      const request: FieldRequest = {
        fieldId: "area_pintura",
        question: "Área de pintura?",
        type: "number",
        unit: "m²",
        // allowZero não definido = true por padrão
      };
      
      const result = validateFieldResponse(0, request);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("deve aceitar valor 0 quando allowZero é explicitamente true", () => {
      const request: FieldRequest = {
        fieldId: "area_pintura",
        question: "Área de pintura?",
        type: "number",
        unit: "m²",
        allowZero: true,
      };
      
      const result = validateFieldResponse(0, request);
      
      expect(result.isValid).toBe(true);
    });

    it("deve rejeitar valor 0 quando allowZero é false", () => {
      const request: FieldRequest = {
        fieldId: "quantidade_portas",
        question: "Quantidade de portas?",
        type: "number",
        allowZero: false,
      };
      
      const result = validateFieldResponse(0, request);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Este campo não aceita valor zero");
    });

    it("deve aceitar valores positivos", () => {
      const request: FieldRequest = {
        fieldId: "area",
        question: "Área?",
        type: "number",
      };
      
      expect(validateFieldResponse(100, request).isValid).toBe(true);
      expect(validateFieldResponse(0.5, request).isValid).toBe(true);
      expect(validateFieldResponse(999999, request).isValid).toBe(true);
    });

    it("deve rejeitar valores não numéricos", () => {
      const request: FieldRequest = {
        fieldId: "area",
        question: "Área?",
        type: "number",
      };
      
      const result = validateFieldResponse("abc", request);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Deve ser um número válido");
    });
  });

  describe("Campos obrigatórios vs opcionais", () => {
    it("deve rejeitar campo obrigatório vazio (padrão)", () => {
      const request: FieldRequest = {
        fieldId: "area",
        question: "Área?",
        type: "number",
        // required não definido = true por padrão
      };
      
      const result = validateFieldResponse("", request);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Campo obrigatório");
    });

    it("deve aceitar campo opcional vazio", () => {
      const request: FieldRequest = {
        fieldId: "area_externa",
        question: "Área externa?",
        type: "number",
        required: false,
      };
      
      const result = validateFieldResponse("", request);
      
      expect(result.isValid).toBe(true);
    });

    it("deve aceitar campo opcional com valor 0", () => {
      const request: FieldRequest = {
        fieldId: "area_externa",
        question: "Área externa? (Digite 0 se não houver)",
        type: "number",
        required: false,
        allowZero: true,
      };
      
      const result = validateFieldResponse(0, request);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe("Campos de texto", () => {
    it("deve aceitar qualquer texto não vazio", () => {
      const request: FieldRequest = {
        fieldId: "observacoes",
        question: "Observações?",
        type: "text",
      };
      
      expect(validateFieldResponse("Teste", request).isValid).toBe(true);
      expect(validateFieldResponse("0", request).isValid).toBe(true);
    });
  });

  describe("Campos de seleção", () => {
    it("deve aceitar valor válido das opções", () => {
      const request: FieldRequest = {
        fieldId: "tipo_tinta",
        question: "Tipo de tinta?",
        type: "select",
        options: ["acrilica", "latex", "esmalte"],
      };
      
      expect(validateFieldResponse("acrilica", request).isValid).toBe(true);
    });

    it("deve rejeitar valor fora das opções", () => {
      const request: FieldRequest = {
        fieldId: "tipo_tinta",
        question: "Tipo de tinta?",
        type: "select",
        options: ["acrilica", "latex", "esmalte"],
      };
      
      const result = validateFieldResponse("invalido", request);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Selecione uma opção válida");
    });
  });

  describe("Formato de resposta", () => {
    it("deve aceitar resposta como objeto {value: ...}", () => {
      const request: FieldRequest = {
        fieldId: "area",
        question: "Área?",
        type: "number",
      };
      
      const result = validateFieldResponse({ value: 100 }, request);
      
      expect(result.isValid).toBe(true);
    });

    it("deve aceitar resposta como valor direto", () => {
      const request: FieldRequest = {
        fieldId: "area",
        question: "Área?",
        type: "number",
      };
      
      const result = validateFieldResponse(100, request);
      
      expect(result.isValid).toBe(true);
    });
  });
});

describe("validateAllResponses", () => {
  it("deve validar múltiplos campos corretamente", () => {
    const requests: FieldRequest[] = [
      { fieldId: "area", question: "Área?", type: "number" },
      { fieldId: "tipo", question: "Tipo?", type: "text" },
      { fieldId: "extra", question: "Extra?", type: "number", required: false, allowZero: true },
    ];
    
    const responses = {
      area: 100,
      tipo: "teste",
      extra: 0,
    };
    
    const result = validateAllResponses(responses, requests);
    
    expect(result.isValid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it("deve retornar erros para campos inválidos", () => {
    const requests: FieldRequest[] = [
      { fieldId: "area", question: "Área?", type: "number" },
      { fieldId: "tipo", question: "Tipo?", type: "text" },
    ];
    
    const responses = {
      area: "",
      tipo: "",
    };
    
    const result = validateAllResponses(responses, requests);
    
    expect(result.isValid).toBe(false);
    expect(result.errors.area).toBe("Campo obrigatório");
    expect(result.errors.tipo).toBe("Campo obrigatório");
  });
});

describe("isValidNumericValue", () => {
  it("deve retornar true para números válidos", () => {
    expect(isValidNumericValue(100)).toBe(true);
    expect(isValidNumericValue(0)).toBe(true);
    expect(isValidNumericValue(0.5)).toBe(true);
  });

  it("deve retornar false para valores vazios", () => {
    expect(isValidNumericValue(null)).toBe(false);
    expect(isValidNumericValue(undefined)).toBe(false);
    expect(isValidNumericValue("")).toBe(false);
  });

  it("deve retornar false para 0 quando allowZero é false", () => {
    expect(isValidNumericValue(0, false)).toBe(false);
  });

  it("deve retornar true para 0 quando allowZero é true (padrão)", () => {
    expect(isValidNumericValue(0, true)).toBe(true);
    expect(isValidNumericValue(0)).toBe(true);
  });
});
