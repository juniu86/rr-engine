/**
 * P1.6 — Engine de templating para propostas jurídicas.
 *
 * Substitui a redação livre da LLM por composição de templates Markdown
 * com slots preenchidos. Suporta:
 *   - Slots simples: {{slot}}
 *   - Slots com filtro: {{slot|brl}}, {{slot|date}}
 *   - Includes de cláusulas: {{cl_objeto}} → carrega clausulas/objeto.md
 *   - Condicionais: {{?campo=valor}}...{{/?}} (renderiza só quando bate)
 *
 * Os arquivos vivem em server/templates/juridico/ e são versionados no
 * Git — qualquer mudança em texto jurídico passa por code review.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Diretório base dos templates. Tenta múltiplas localizações candidatas
 * para suportar:
 *   - dev (tsx): server/services/juridicoTemplating.ts → ../templates/juridico
 *   - test (vitest): mesmo path do dev
 *   - prod build (esbuild bundle em dist/): templates copiados em
 *     dist/templates/juridico OU sibling templates/juridico
 *   - cwd-based fallback: ./server/templates/juridico relativo ao processo
 *
 * O primeiro path existente vence.
 */
const TEMPLATES_DIR = (() => {
  const candidates = [
    join(__dirname, "..", "templates", "juridico"),
    join(__dirname, "templates", "juridico"),
    join(process.cwd(), "server", "templates", "juridico"),
    join(process.cwd(), "dist", "templates", "juridico"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: o primeiro candidato. Erros de readFile são tratados pelo
  // caller com warning + texto parcial.
  return candidates[0];
})();

export type TemplateChoice = "padrao" | "obra_publica" | "manutencao";

/**
 * Slots aceitos pelo template. Tudo opcional aqui para tolerância;
 * slots ausentes em runtime ficam como `{{slot}}` no output (visíveis
 * para revisão fácil).
 */
export interface TemplateInput {
  // Topo da proposta
  projectName?: string;
  clientName?: string;
  proposalDate?: string;
  validityDays?: number;

  // Comerciais / financeiros
  totalPrice?: number;
  paymentTerms?: string;
  durationDays?: number;
  durationWeeksLabel?: string;

  // Contratuais
  contractType?: "obra" | "manutencao";
  contratada?: string;
  contratante?: string;
  tipoObra?: string;
  memorialDate?: string;
  escopoBreve?: string;
  enderecoObra?: string;
  foro?: string;
  editalNumber?: string;

  // Identificação da empresa
  companyAddress?: string;
  companyCnpj?: string;

  /** Permite slots customizados sem ampliar o tipo. */
  [key: string]: unknown;
}

export interface RenderResult {
  /** Markdown final renderizado. */
  text: string;
  /** Cláusulas individuais resolvidas (title + content), prontas para o PDF. */
  clauses: Array<{ title: string; content: string }>;
}

/**
 * Renderiza uma proposta a partir do template escolhido + slots.
 *
 * Erros de leitura de arquivo (template ausente, cláusula faltando) são
 * relevados — caller decide como tratar (Juridico agente trata logando
 * warning e devolvendo o texto parcial).
 */
export async function renderProposta(
  templateName: TemplateChoice,
  input: TemplateInput
): Promise<RenderResult> {
  const file =
    templateName === "padrao"
      ? "proposta_padrao.md"
      : `variantes/${templateName}.md`;

  const raw = await readFile(join(TEMPLATES_DIR, file), "utf-8");
  const text = await processTemplate(raw, input);
  const clauses = await loadAllDefaultClauses(input);
  return { text, clauses };
}

/**
 * Resolve todos os tokens de um template. Ordem importa:
 *  1. Includes de cláusulas (recursivos — cláusula pode ter outros tokens dentro)
 *  2. Condicionais ({{?campo=valor}}...{{/?}})
 *  3. Slots simples e com filtro
 */
async function processTemplate(
  content: string,
  input: TemplateInput
): Promise<string> {
  let result = content;

  // 1. Includes de cláusulas — pode ser executado em loop até não restar
  // nenhum {{cl_*}} (cláusulas podem referenciar outras, embora não seja
  // o caso atual).
  let pass = 0;
  while (pass < 5 && /\{\{cl_([a-z_]+)\}\}/.test(result)) {
    const matches = Array.from(result.matchAll(/\{\{cl_([a-z_]+)\}\}/g));
    for (const match of matches) {
      const clauseName = match[1];
      try {
        const clauseContent = await readFile(
          join(TEMPLATES_DIR, "clausulas", `${clauseName}.md`),
          "utf-8"
        );
        result = result.split(match[0]).join(clauseContent);
      } catch {
        // Cláusula ausente: deixa o token visível no output para investigação.
      }
    }
    pass++;
  }

  // 2. Condicionais {{?campo=valor}}...{{/?}}. Regex non-greedy aceita
  // múltiplos blocos no mesmo template. Suporta valores com underscore.
  result = result.replace(
    /\{\{\?([a-zA-Z_]+)=([a-zA-Z_]+)\}\}([\s\S]*?)\{\{\/\?\}\}/g,
    (_match, field: string, value: string, body: string) => {
      const inputValue = (input as Record<string, unknown>)[field];
      return inputValue === value ? body : "";
    }
  );

  // 3. Slots simples e com filtro {{key}} ou {{key|filter}}.
  result = result.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([a-zA-Z]+))?\}\}/g,
    (full: string, key: string, filter?: string) => {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined || value === null || value === "") return full;
      if (filter === "brl") return formatBRL(Number(value));
      if (filter === "date") return formatDate(value as string | Date);
      return String(value);
    }
  );

  return result;
}

/**
 * Carrega cada cláusula default e devolve [{title, content}], com
 * placeholders ainda processados (slots/condicionais aplicados sobre o
 * texto da cláusula). Usado para popular `JuridicoOutput.clauses[]` que
 * o gerador de PDF consome para estruturar o documento final.
 */
async function loadAllDefaultClauses(
  input: TemplateInput
): Promise<Array<{ title: string; content: string }>> {
  const titlesByFile: Array<{ file: string; title: string }> = [
    { file: "objeto", title: "Objeto" },
    { file: "preco", title: "Preço" },
    { file: "pagamento", title: "Forma de Pagamento" },
    { file: "prazo", title: "Prazo de Execução" },
    { file: "garantias", title: "Garantias" },
    { file: "responsabilidades", title: "Responsabilidades das Partes" },
    { file: "confidencialidade", title: "Confidencialidade" },
    { file: "rescisao", title: "Rescisão" },
    { file: "foro", title: "Foro" },
  ];

  const out: Array<{ title: string; content: string }> = [];
  for (const { file, title } of titlesByFile) {
    try {
      const raw = await readFile(
        join(TEMPLATES_DIR, "clausulas", `${file}.md`),
        "utf-8"
      );
      // Aplica condicionais e slots da cláusula. Não tem includes — o
      // ciclo recursivo de processTemplate cobre, mas aqui o texto é
      // standalone.
      const processed = await processTemplate(raw, input);
      out.push({ title, content: processed.trim() });
    } catch {
      // Cláusula ausente: pula.
    }
  }
  return out;
}

export function formatBRL(n: number): string {
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  // Forca fuso UTC: datas "YYYY-MM-DD" sao lidas como meia-noite UTC e, num
  // fuso atras do UTC (ex.: BRT), toLocaleDateString sem timeZone "volta um
  // dia". Producao roda em UTC e acertava; localmente (Brasil) errava.
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
