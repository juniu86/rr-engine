/**
 * Utilitários de validação para campos de formulário
 * 
 * Resolve o problema de campos opcionais do tipo 'number' que não aceitam valor 0.
 * O sistema agora trata 0 como valor válido quando allowZero é true (padrão).
 */

export interface FieldRequest {
  fieldId: string;
  question: string;
  type: "number" | "text" | "select" | "textarea";
  unit?: string;
  required?: boolean;  // Padrão: true
  allowZero?: boolean; // Padrão: true
  options?: string[];
}

export interface FieldResponse {
  value: any;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valida a resposta de um campo com base nas configurações do request.
 * 
 * Regras:
 * - Campos required=true (padrão) não podem ser vazios
 * - Campos type="number" com allowZero=true (padrão) aceitam valor 0
 * - Campos type="number" com allowZero=false rejeitam valor 0
 * 
 * @param response - Resposta do usuário
 * @param request - Configuração do campo
 * @returns Resultado da validação
 */
export function validateFieldResponse(
  response: FieldResponse | any, 
  request: FieldRequest
): ValidationResult {
  // Normalizar response para objeto se for valor direto
  const value = typeof response === 'object' && response !== null && 'value' in response 
    ? response.value 
    : response;
  
  // Verificar se está vazio
  const isEmpty = value === null || value === undefined || value === "";
  
  // Campo obrigatório (padrão: true)
  const isRequired = request.required !== false;
  
  if (isEmpty) {
    if (isRequired) {
      return { isValid: false, error: "Campo obrigatório" };
    }
    // Campo opcional vazio é válido
    return { isValid: true };
  }
  
  // Validação específica por tipo
  if (request.type === "number") {
    const numValue = Number(value);
    
    if (isNaN(numValue)) {
      return { isValid: false, error: "Deve ser um número válido" };
    }
    
    // allowZero padrão é true
    const allowZero = request.allowZero !== false;
    
    if (numValue === 0 && !allowZero) {
      return { isValid: false, error: "Este campo não aceita valor zero" };
    }
    
    // Número válido (incluindo 0 se permitido)
    return { isValid: true };
  }
  
  if (request.type === "select") {
    // Verificar se o valor está nas opções (se definidas)
    if (request.options && request.options.length > 0) {
      if (!request.options.includes(String(value))) {
        return { isValid: false, error: "Selecione uma opção válida" };
      }
    }
    return { isValid: true };
  }
  
  // text e textarea - qualquer valor não vazio é válido
  return { isValid: true };
}

/**
 * Valida todas as respostas de um formulário.
 * 
 * @param responses - Objeto com as respostas (fieldId -> value)
 * @param requests - Lista de configurações dos campos
 * @returns Objeto com resultado geral e erros por campo
 */
export function validateAllResponses(
  responses: Record<string, any>,
  requests: FieldRequest[]
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  for (const request of requests) {
    const response = responses[request.fieldId];
    const result = validateFieldResponse(response, request);
    
    if (!result.isValid && result.error) {
      errors[request.fieldId] = result.error;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Verifica se um valor numérico é válido considerando allowZero.
 * Função auxiliar para uso em componentes de UI.
 * 
 * @param value - Valor a verificar
 * @param allowZero - Se permite zero (padrão: true)
 * @returns true se o valor é válido
 */
export function isValidNumericValue(value: any, allowZero: boolean = true): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    return false;
  }
  
  if (numValue === 0 && !allowZero) {
    return false;
  }
  
  return true;
}
