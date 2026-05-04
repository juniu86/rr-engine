/**
 * P2.3 — Helpers de serialização JSON para uso em user prompts.
 *
 * `JSON.stringify(obj, null, 2)` em prompts consome ~12-18% mais tokens
 * que a versão minificada, sem ganho de qualidade — a LLM lê igualmente
 * JSON sem indentação. Centralizar em `compactJson` torna a opção
 * óbvia e fácil de auditar via grep.
 *
 * Uso recomendado:
 *   - `compactJson(obj)` em qualquer string que vai para o LLM (system
 *     ou user prompt).
 *   - `readableJson(obj)` apenas em logs / mensagens de debug que humanos
 *     vão ler — NUNCA em prompts.
 */

/**
 * Serializa objeto para inclusão em user prompt. Sem indentação.
 * Reduz consumo de tokens em ~15% para arrays médios/grandes.
 */
export function compactJson(obj: unknown): string {
  return JSON.stringify(obj);
}

/**
 * Versão para debugging — usa indentação de 2 espaços. Para logs e
 * mensagens de erro, NÃO para prompts.
 */
export function readableJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}
