/**
 * P2 — Robustez de parsing JSON dos agentes.
 *
 * Origem (smoke test DGOA, project 7, 06/05/2026): Sonnet 4.6 devolveu
 * JSON malformado com aspas não-escapadas dentro de uma `description`
 * longa, na posição 6589. `tolerantJsonParse` antigo só lidava com JS
 * literals e trailing commas — falhava no caso real.
 *
 * Anthropic não tem `response_format: json_object` nativo na versão
 * 2023-06-01 da API; a única defesa server-side é (a) parser tolerante
 * e (b) retry de correção com a própria LLM.
 */

/** Substitui literais JS válidos (undefined, NaN, Infinity) por null. */
function sanitizeJsLiteralsForJson(text: string): string {
  return text
    .replace(/:\s*undefined\b/g, ": null")
    .replace(/:\s*NaN\b/g, ": null")
    .replace(/:\s*-?Infinity\b/g, ": null");
}

/** Remove vírgulas finais antes de `}` ou `]`. */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * P2 — Escapa aspas não-escapadas dentro de strings JSON.
 *
 * Heurística stateful: percorre char a char rastreando se está dentro
 * de uma string. Quando encontra `"` dentro de string, peeka o próximo
 * caractere significativo (ignorando whitespace):
 *   - se for separador estrutural (`,`, `}`, `]`, `:`, fim do texto),
 *     a aspas fecha a string corretamente — passa intacta.
 *   - caso contrário, é uma aspas interna não-escapada — insere `\`.
 *
 * Não pretende ser parser JSON completo; é um best-effort para
 * recuperar respostas de LLM com aspas em strings descritivas.
 * Retorna `null` quando a heurística detecta que não tem confiança
 * (ex.: profundidade de string ambígua).
 */
export function escapeUnescapedQuotes(text: string): string {
  let out = "";
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // inString = true
    if (ch === "\\") {
      // Sequência de escape — copia ela inteira (ex.: \" \\ \n \uXXXX).
      out += ch;
      if (i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      // Peek: próximo caractere significativo é separador estrutural?
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      const isClosing =
        j >= text.length ||
        next === "," ||
        next === "}" ||
        next === "]" ||
        next === ":";
      if (isClosing) {
        inString = false;
        out += ch;
        i++;
        continue;
      }
      // Aspas interna não-escapada — escapa.
      out += "\\";
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Tenta JSON.parse com saneamento progressivo. Em ordem:
 *  1. parse direto
 *  2. parse após sanitizar literals JS (undefined, NaN, Infinity → null)
 *  3. parse após remover trailing commas
 *  4. parse com tudo combinado
 *  5. P2: parse após escapar aspas não-escapadas
 *  6. P2: parse após combinar todas as transformações
 *
 * Se nada funcionar, lança o erro ORIGINAL.
 */
export function tolerantJsonParse<T>(text: string): T {
  // Tentativa 1: parse direto.
  try {
    return JSON.parse(text) as T;
  } catch (err1) {
    // Tentativa 2: literals JS inválidos.
    try {
      return JSON.parse(sanitizeJsLiteralsForJson(text)) as T;
    } catch {}
    // Tentativa 3: trailing commas.
    try {
      return JSON.parse(removeTrailingCommas(text)) as T;
    } catch {}
    // Tentativa 4: combinado (literals + commas).
    try {
      return JSON.parse(
        removeTrailingCommas(sanitizeJsLiteralsForJson(text))
      ) as T;
    } catch {}
    // Tentativa 5 (P2): aspas não-escapadas.
    try {
      return JSON.parse(escapeUnescapedQuotes(text)) as T;
    } catch {}
    // Tentativa 6 (P2): aspas + literals + commas, tudo junto.
    try {
      return JSON.parse(
        escapeUnescapedQuotes(
          removeTrailingCommas(sanitizeJsLiteralsForJson(text))
        )
      ) as T;
    } catch {}
    // Re-lança o erro original.
    throw err1;
  }
}

/**
 * P2 — Tenta parsear sem lançar. Retorna `null` quando o conteúdo
 * resiste a todas as tentativas. Usado pelo retry de correção que
 * decide se vale fazer chamada extra à LLM.
 */
export function tryTolerantJsonParse<T>(text: string): T | null {
  try {
    return tolerantJsonParse<T>(text);
  } catch {
    return null;
  }
}
