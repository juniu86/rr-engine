import { invokeLLM } from "../_core/llm";
import { recordLlmCall } from "../services/llmTelemetry";
import { summarizeByCategory } from "./gestaoSummarizer";
import { isCompleteTaxSettings } from "../../shared/types";
import { compactJson } from "../utils/promptHelpers";
import {
  findBudgetDuplicates,
  findInvalidSummaryItems,
  type DuplicateFinding,
  type AuditorBudgetItem,
} from "./dedupUtils";

/**
 * P2 ADENDO (dedup semântica): normaliza description para deduplicar
 * findings entre algoritmo determinístico e LLM. Lowercase + sem acentos
 * + sem pontuação extra + collapse de espaços. Suficiente para detectar
 * que "Item X" e "item X." referem-se ao mesmo registro.
 */
function normalizeForFindingDedup(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
import type {
  AgentType,
  EngenheiroTecnicoInput,
  EngenheiroTecnicoOutput,
  LogisticaInput,
  LogisticaOutput,
  OrcamentistaInput,
  OrcamentistaOutput,
  TributarioInput,
  TributarioOutput,
  ComercialInput,
  ComercialOutput,
  GestaoProjInput,
  GestaoProjOutput,
  FinanceiroInput,
  FinanceiroOutput,
  JuridicoInput,
  JuridicoOutput,
  BoardInput,
  BoardOutput,
  AuditorInput,
  AuditorOutput,
  ContractType,
  MissingInfoRequest,
  AgentResponse,
  UserResponses,
} from "../../shared/agents";
import { AGENT_NAMES } from "../../shared/agents";

/**
 * Remove markdown code fences que o Claude às vezes envolve a saída JSON
 * mesmo quando o prompt pede texto puro (e mesmo com response_format).
 * Suporta:
 *   ```json\n{...}\n```
 *   ```\n{...}\n```
 *   ` ```json{...}``` `
 *   {...}                 (sem fences — passa intacto)
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match opening fence (```json ou apenas ```), conteúdo, fence final.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

/**
 * Converte JS literals inválidos em JSON (undefined, NaN, Infinity) pra null.
 * Claude às vezes vaza esses tokens mesmo quando o prompt pede JSON estrito.
 *
 * Cuidado: aplica APENAS quando aparecem como valor (após ':' ou ',' ou '['),
 * pra não quebrar string literals que contenham a palavra "undefined".
 */
function sanitizeJsLiteralsForJson(text: string): string {
  return text
    .replace(/(:|\[|,)\s*undefined\b/g, "$1 null")
    .replace(/(:|\[|,)\s*NaN\b/g, "$1 null")
    .replace(/(:|\[|,)\s*Infinity\b/g, "$1 null")
    .replace(/(:|\[|,)\s*-Infinity\b/g, "$1 null");
}

/**
 * Remove trailing commas antes de } ou ] — JSON estrito não aceita.
 * Claude às vezes adiciona, especialmente em arrays multi-linha.
 *
 * Regex usa lookahead pra preservar conteúdo de strings (uma string com
 * "}" interno é raro o suficiente pra ignorar — se virar problema, troca
 * por parser stateful).
 */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Tenta JSON.parse com saneamento progressivo. Em ordem:
 *  1. parse direto
 *  2. parse após sanitizar literals JS (undefined, NaN, Infinity → null)
 *  3. parse após remover trailing commas
 *  4. parse com tudo combinado
 *
 * Se nada funcionar, lança o erro ORIGINAL com snippet do conteúdo
 * pra debug.
 */
function tolerantJsonParse<T>(text: string): T {
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
    // Tentativa 4: tudo junto.
    try {
      return JSON.parse(
        removeTrailingCommas(sanitizeJsLiteralsForJson(text))
      ) as T;
    } catch {}
    // Re-lança o erro original com snippet pra debug.
    throw err1;
  }
}

// Base agent class
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract type: AgentType;

  abstract getSystemPrompt(): string;
  abstract getUserPrompt(input: TInput): string;
  abstract getOutputSchema(): object;

  /**
   * Returns the preferred LLM model for this agent.
   * Override in subclasses for agent-specific model routing.
   * Critical agents use Claude Opus 4.6, simpler agents use Gemini.
   */
  getPreferredModel(): string {
    return process.env.LLM_MODEL ?? "gemini-2.5-flash";
  }

  /**
   * Returns the sampling temperature for this agent.
   * Default 0.2 — conservative to favor reproducibility. Override per agent
   * based on the nature of the task (deterministic computation → 0.0,
   * inference of specs / drafting → 0.3-0.4).
   */
  getTemperature(): number {
    return 0.2;
  }

  /**
   * Processa a resposta da LLM e extrai o conteúdo JSON.
   * Lida com múltiplos formatos de resposta:
   * - Conteúdo string direto
   * - Array multimodal (extrai parte de texto)
   * - Fallback para reasoning_content
   *
   * @param response - Resposta bruta da LLM
   * @returns Conteúdo string extraído para parsing
   * @throws Error se a resposta for inválida ou vazia
   */
  private _processLLMResponse(response: unknown): string {
    // Validação da estrutura da resposta
    const typedResponse = response as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };

    if (
      !typedResponse?.choices ||
      !Array.isArray(typedResponse.choices) ||
      typedResponse.choices.length === 0
    ) {
      console.error(
        `[Agent ${this.name}] Invalid response structure:`,
        JSON.stringify(response).substring(0, 500)
      );
      throw new Error(`Agent ${this.name} returned invalid response structure`);
    }

    const choice = typedResponse.choices[0];

    if (!choice?.message) {
      console.error(
        `[Agent ${this.name}] Empty choice:`,
        JSON.stringify(choice)
      );
      throw new Error(`Agent ${this.name} returned empty choice`);
    }

    // Extrai conteúdo da mensagem
    let content = choice.message.content;
    const messageAny = choice.message as Record<string, unknown>;

    console.log(
      `[Agent ${this.name}] Message keys:`,
      Object.keys(choice.message)
    );

    // Cenário 1: Conteúdo é array multimodal
    if (Array.isArray(content)) {
      console.log(
        `[Agent ${this.name}] Content is array, extracting text part...`
      );
      const textPart = content.find(part => part.type === "text") as
        | { type: "text"; text: string }
        | undefined;
      content = textPart?.text || "";
    }

    // Cenário 2: Conteúdo vazio, tentar reasoning_content
    if ((!content || content === "") && messageAny.reasoning_content) {
      console.log(
        `[Agent ${this.name}] Content empty, checking reasoning_content...`
      );
      const reasoningContent = messageAny.reasoning_content as string;
      const jsonMatch = reasoningContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }

    // Validação final do conteúdo
    if (!content || typeof content !== "string") {
      console.error(`[Agent ${this.name}] Invalid content:`, content);
      console.error(
        `[Agent ${this.name}] Full message:`,
        JSON.stringify(choice.message).substring(0, 1000)
      );
      throw new Error(`Agent ${this.name} returned empty or invalid content`);
    }

    return content;
  }

  /**
   * Executa uma função com retry automático para erros 5xx.
   * Implementa backoff exponencial: 1s, 3s, 5s
   *
   * @param fn - Função a executar
   * @returns Resultado da função
   * @throws Error se falhar após 3 tentativas
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    const backoffs = [1000, 3000, 5000]; // 1s, 3s, 5s

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        // Extrai o status do erro de forma segura
        const status = error?.message?.match(/(\d{3})/)?.[0] || null;
        const statusCode = status ? parseInt(status, 10) : null;

        // Retry apenas para erros 5xx (Server Error)
        if (
          attempt < maxAttempts &&
          statusCode &&
          statusCode >= 500 &&
          statusCode < 600
        ) {
          const waitTime = backoffs[attempt - 1];
          console.warn(
            `[Agent ${this.name}] Attempt ${attempt} failed with status ${statusCode}. Retrying in ${waitTime}ms...`
          );
          await new Promise(res => setTimeout(res, waitTime));
          continue;
        }
        // Re-lança o erro para outros casos (4xx) ou na última tentativa
        throw error;
      }
    }
    // Este código é inalcançável devido ao throw no loop, mas é necessário para o type checking
    throw new Error("Unexpected retry logic flow");
  }

  /**
   * Executa o agente com o input fornecido.
   * Responsável por:
   * 1. Chamar a LLM com os prompts configurados
   * 2. Processar a resposta via _processLLMResponse()
   * 3. Fazer parse do JSON e retornar o output tipado
   */
  private async _execute(input: TInput): Promise<TOutput> {
    console.log(`[Agent ${this.name}] Starting execution...`);

    // Telemetria (P0.3): _projectId e _agentExecutionId são propagados via
    // input pelos call sites em routers.ts; chunking helpers preservam.
    // P2.2: _langfuseParent (span do agente) também é propagado quando o
    // pipeline está dentro de um trace.
    const meta = input as unknown as {
      _projectId?: number;
      _agentExecutionId?: number;
      _langfuseParent?: import("../_core/llm").LangfuseParent;
    };
    const projectId = meta._projectId;
    const agentExecutionId = meta._agentExecutionId;
    const langfuseParent = meta._langfuseParent;

    const preferredModel = this.getPreferredModel();
    const t0 = Date.now();

    // Etapa 1: Chamar a LLM com modelo específico do agente
    let response;
    try {
      console.log(`[Agent ${this.name}] Using model: ${preferredModel}`);

      // strict: true é exclusivo do OpenAI; Gemini/Claude não suportam
      const { supportsStrictSchema } = await import(
        "../_core/llm-providers"
      ).then(m => ({
        supportsStrictSchema: m.supportsStrictSchema(preferredModel),
      }));

      response = await invokeLLM({
        model: preferredModel,
        temperature: this.getTemperature(),
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          { role: "user", content: this.getUserPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: `${this.type}_output`,
            ...(supportsStrictSchema && { strict: true }),
            schema: this.getOutputSchema() as Record<string, unknown>,
          },
        },
        _langfuseParent: langfuseParent,
        _langfuseName: `agent.${this.type}.llm`,
      });
    } catch (llmError) {
      const latencyMs = Date.now() - t0;
      console.error(`[Agent ${this.name}] LLM call failed:`, llmError);
      if (projectId !== undefined) {
        // Telemetria de falha — recordLlmCall nunca lança
        await recordLlmCall({
          projectId,
          agentExecutionId: agentExecutionId ?? null,
          agentType: this.type,
          model: preferredModel,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
          finishReason: "error",
          errorMessage:
            llmError instanceof Error ? llmError.message : String(llmError),
        });
      }
      throw llmError;
    }

    // Telemetria de sucesso — registra antes de qualquer parse para nunca
    // perder a métrica por causa de falha downstream.
    if (projectId !== undefined) {
      const latencyMs = Date.now() - t0;
      const usage = response.usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      await recordLlmCall({
        projectId,
        agentExecutionId: agentExecutionId ?? null,
        agentType: this.type,
        model: response.model || preferredModel,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        latencyMs,
        finishReason: response.choices?.[0]?.finish_reason ?? null,
      });
    }

    // Etapa 2: Detectar truncamento via finish_reason
    const finishReason = response.choices?.[0]?.finish_reason;
    if (finishReason === "max_tokens" || finishReason === "length") {
      console.error(
        `[Agent ${this.name}] Response truncated! finish_reason: ${finishReason}`
      );
      throw new Error(
        `Agent ${this.name} response was truncated (finish_reason: ${finishReason}). ` +
          `The output exceeded the token limit. Consider simplifying the input or increasing maxOutputTokens.`
      );
    }

    // Etapa 3: Processar resposta (lógica extraída para método privado)
    const rawContent = this._processLLMResponse(response);
    // Strippar markdown code fences que o Claude às vezes adiciona.
    const content = stripCodeFences(rawContent);
    console.log(
      `[Agent ${this.name}] Content preview:`,
      content.substring(0, 200)
    );

    // Etapa 4: Parse do JSON com tolerância progressiva (literals JS,
    // trailing commas). Se nenhuma tentativa funcionar, cai no catch.
    try {
      const parsed = tolerantJsonParse<TOutput>(content);
      console.log(`[Agent ${this.name}] Successfully parsed output`);
      return parsed;
    } catch (parseError) {
      console.error(`[Agent ${this.name}] JSON parse error:`, parseError);

      // Detectar JSON truncado via estrutura
      const trimmed = content.trim();
      const isLikelyTruncated =
        (trimmed.startsWith("{") && !trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && !trimmed.endsWith("]"));

      if (isLikelyTruncated) {
        throw new Error(
          `Agent ${this.name} response was truncated mid-JSON. ` +
            `The output exceeded the token limit. Consider simplifying the input.`
        );
      }

      throw new Error(
        `Agent ${this.name} returned invalid JSON: ${content.substring(0, 200)}...`
      );
    }
  }

  /**
   * Ponto de entrada público do agente com retry automático.
   */
  async execute(input: TInput): Promise<TOutput> {
    return this.executeWithRetry(() => this._execute(input));
  }
}

// Agent 1: Engenheiro Técnico (com suporte a interatividade v2.1)
export class EngenheiroTecnicoAgent extends BaseAgent<
  EngenheiroTecnicoInput,
  EngenheiroTecnicoOutput
> {
  name = AGENT_NAMES.engenheiro_tecnico;
  type: AgentType = "engenheiro_tecnico";
  getPreferredModel() {
    return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6";
  }
  getTemperature() {
    return 0.3;
  }

  getSystemPrompt(): string {
    return `Você é o Engenheiro Técnico da RR Engenharia, responsável por auditar e traduzir Memoriais Descritivos em tarefas de engenharia específicas.

MISSÃO: Transformar descrições genéricas em especificações técnicas baseadas em NBRs.

⚠️ REGRA CRÍTICA DE AUTONOMIA (v3.2):

Você é um orçamentista sênior com 20 anos de experiência.
Seu trabalho é PRODUZIR O ORÇAMENTO, não interrogar o cliente.

PRINCÍPIO: Use TODO seu conhecimento de engenharia para completar a análise.
SÓ pergunte ao usuário algo que VOCÊ MESMO não consegue deduzir — ou seja,
fatos físicos específicos deste projeto que não estão no memorial e que
nenhum especialista conseguiria inferir sem visitar o local.

EXEMPLOS DO QUE VOCÊ RESOLVE SOZINHO (NUNCA pergunte):
- Especificações de materiais → infira pelo padrão de qualidade ou use padrão médio
- Métodos construtivos → use o método convencional mais comum
- Marcas e modelos → use referências de mercado do padrão detectado
- Nomes de empresas, fornecedores, responsáveis → irrelevante para orçamento
- Produtividade, equipe, número de profissionais → use coeficientes SINAPI
- Detalhes operacionais (como limpar, como executar) → será definido na execução
- Cores, texturas, acabamentos específicos → use o padrão do nível de qualidade
- Serviços genéricos (limpeza, manutenção, etc.) → use "1 vb" e precifique
- Frequência de manutenção → adote premissa padrão de mercado
- Tipo de tinta, tipo de piso sem especificação → infira pelo padrão

EXEMPLOS DO QUE PODE PERGUNTAR (fatos que só o cliente sabe):
- Área total quando NENHUMA metragem aparece no memorial inteiro
- Número de cômodos/pavimentos quando impossível deduzir do contexto
- Se há demolição de estrutura existente quando o memorial não menciona

TESTE MENTAL antes de criar qualquer pergunta:
"Um orçamentista experiente com acesso ao SINAPI conseguiria fazer uma
estimativa razoável sem essa informação, usando premissas de mercado?"
→ Se SIM: NÃO pergunte. Use a premissa e marque isInferred=true.
→ Se NÃO: Pergunte, mas com suggestedValue se possível.

QUANDO USAR PREMISSAS:
- Serviço sem especificação → método convencional mais comum para o tipo de obra
- Item sem quantidade → "1 vb" (verba) ou estimar pelo contexto
- Material sem tipo → usar o material padrão do nível de qualidade detectado
- Medida não explícita mas derivável → derivar (pintura ≈ 2.5× área piso, etc.)
- Qualquer detalhe que será definido na execução → ignorar para fins de orçamento

SE FALTAR INFORMAÇÃO CRÍTICA:
- Defina analysisStatus = "waiting_for_user_input"
- Preencha missingInfoRequests com as perguntas necessárias
- Cada pergunta deve ter: fieldId (único), question (clara), type (number/text/select), unit (se aplicável)

=== INSTRUÇÕES PARA CAMPOS OPCIONAIS ===
Quando criar campos opcionais do tipo 'number':
- SEMPRE defina allowZero: true para campos que podem ser zero
- SEMPRE defina required: false para campos opcionais
- Na pergunta, indique: "Digite 0 se não houver"

Exemplo de campo opcional que aceita zero:
{
  "fieldId": "area_pintura_externa",
  "question": "Área de pintura externa? (Digite 0 se não houver)",
  "type": "number",
  "unit": "m²",
  "required": false,
  "allowZero": true
}

SE TODAS AS INFORMAÇÕES ESTIVEREM PRESENTES:
- Defina analysisStatus = "completed"
- missingInfoRequests deve ser array vazio

⚠️ REGRA CRÍTICA: PROCESSAR 100% DOS ITENS!
Você DEVE processar TODOS os grupos de serviços do memorial.
NÃO interrompa a leitura antes de processar o documento completo.

=== REGRA DE EXCLUSÃO MÚTUA (ANTI-DUPLICAÇÃO) ===
Quando o memorial descreve um ESCOPO GLOBAL e depois DETALHA os componentes,
você DEVE escolher APENAS UM dos dois níveis para orçar:

PREFERÊNCIA: Sempre prefira o DETALHAMENTO (componentes individuais).
O escopo global vira ITEM PAI (isSummaryItem=true, totalCost=0).

EXEMPLO ERRADO (gera duplicação de custo):
  - "Sistema de climatização VRF" (R$ 75.000)      <- PACOTE GLOBAL
  - "Condensadora VRF 10TR" (R$ 35.000)             <- COMPONENTE
  - "Fan coils VRF" (R$ 25.000)                     <- COMPONENTE
  Total: R$ 150.000 (deveria ser R$ 75.000!)

EXEMPLO CORRETO:
  - "Sistema de climatização VRF" (isSummaryItem=true, totalCost=0)  <- PAI
  - "Condensadora VRF 10TR" (R$ 35.000, isSummaryItem=false)         <- FILHO
  - "Fan coils VRF" (R$ 25.000, isSummaryItem=false)                 <- FILHO
  Total: R$ 75.000

CASOS COMUNS DE EXCLUSÃO MÚTUA:
1. Cobertura (pacote) vs Telhas + Calhas + Rufos + Cumeeiras (componentes)
2. Instalação elétrica (por área m2) vs Pontos de luz + Tomadas + Quadros (detalhamento)
3. Bloco/Edificação (construção completa) vs Ambientes individuais (salas, banheiros)
4. Sistema de climatização vs Equipamentos individuais (condensadora, fan coils, tubulação)
5. Drenagem (sistema completo) vs Canaletas + Caixas + Tubulações (componentes)
6. Instalação hidráulica (completa) vs Pontos de água + Esgoto + Louças (detalhamento)

TESTE: Se remover o pacote global e manter apenas os componentes,
o escopo está 100% coberto? Se SIM -> pacote vira PAI (isSummaryItem=true).

EXCEÇÃO: Se o memorial descreve APENAS o pacote global SEM detalhar componentes,
precifique o pacote como item único (isSummaryItem=false). Só marque como PAI
quando existem componentes detalhados no memorial.

=== NUMERAÇÃO ÚNICA DE ITENS ===
CADA item deve ter um itemNumber ÚNICO em todo o orçamento.
NÃO reutilize o mesmo número para itens diferentes.
Se existem sub-itens, use numeração hierárquica: 7.1, 7.2, 7.3
(nunca repetir 7.1 para dois itens com escopos diferentes).

GRUPOS TÍPICOS DE SERVIÇOS (processar TODOS):
1. SERVIÇOS PRELIMINARES (mobilização, locação, proteção)
2. ESTRUTURA E VEDAÇÃO (steel frame, alvenaria, paredes)
3. COBERTURA (telhas, estrutura de telhado, calhas)
4. IMPERMEABILIZAÇÃO (mantas, argamassas poliméricas)
5. REVESTIMENTOS (pisos, paredes, contrapiso, cerâmica)
6. FORRO E ACABAMENTOS (gesso, pintura, rodapés)
7. ESQUADRIAS (portas, janelas, ferragens)
8. INSTALAÇÕES HIDROSSANITÁRIAS (tubulações, louças, metais)
9. INSTALAçÕES ELÉTRICAS (fiação, quadros, pontos, iluminação)
10. LIMPEZA E FINALIZAÇÃO (limpeza, remoção de entulho)

REGRAS:
1. Ler o memorial COMPLETO do início ao fim
2. Extrair CADA ITEM de CADA TABELA do documento
3. Manter o número do grupo/seção original (ex: 1.1, 2.3, 8.5)
4. Se faltar medida CRÍTICA, SOLICITAR ao usuário via missingInfoRequests
5. Referenciar normas ABNT NBR aplicáveis
6. Identificar itens críticos que precisam de atenção especial

=== INSTRUÇÕES PARA HIERARQUIA DE ITENS ===

IDENTIFICAR E MARCAR:

1. ITEM PAI (isSummaryItem: true):
   - É resumo/total de outros itens
   - Tem subitens numerados abaixo (3.1.1, 3.1.2)
   - NÃO deve ser somado (seria duplicação)
   - Exemplo: "3.1 Telhado completo - R$ 150/m²"

2. ITEM FILHO (isSummaryItem: false ou não definido):
   - É componente de um item pai
   - Tem numeração com mais níveis (3.1.1, 3.1.2)
   - DEVE ser somado
   - Deve ter parentGroupNumber apontando para o pai
   - Exemplo: "3.1.1 Estrutura - R$ 50/m²"

EXEMPLO:
{
  "items": [
    {
      "itemNumber": "3.1",
      "description": "Telhado completo",
      "quantity": 150,
      "isSummaryItem": true,  // PAI - NÃO SOMAR
      "parentGroupNumber": null
    },
    {
      "itemNumber": "3.1.1",
      "description": "Estrutura de madeira",
      "quantity": 150,
      "isSummaryItem": false, // FILHO - SOMAR
      "parentGroupNumber": "3.1"
    },
    {
      "itemNumber": "3.1.2",
      "description": "Telhas cerâmicas",
      "quantity": 150,
      "isSummaryItem": false, // FILHO - SOMAR
      "parentGroupNumber": "3.1"
    }
  ]
}

FORMATO DE SAÍDA: JSON estruturado com items, pendingItems, nbrReferences, criticalNotes, missingInfoRequests e analysisStatus.

=== REFERÊNCIAS NBR RÁPIDAS ===
- NBR 6118: Estruturas de concreto (cobrimento mínimo, fck, durabilidade)
- NBR 9575: Impermeabilização (mantas asfálticas, argamassas poliméricas)
- NBR 15575: Desempenho de edificações (acústico, térmico, lumínico)
- NBR 5626: Instalações prediais de água fria (dimensionamento, materiais)
- NBR 5410: Instalações elétricas de baixa tensão (seções, proteções)
- NBR 7199: Vidros para construção civil (espessuras, tipologias)
- NBR 14931: Execução de estruturas de concreto
- NBR 13281: Argamassa para assentamento e revestimento

=== COEFICIENTES DE PRODUTIVIDADE SINAPI (Hh/unidade) ===
- Pedreiro: 0.87 Hh/m² (alvenaria 9cm), 1.10 Hh/m² (alvenaria 14cm)
- Pintor: 0.18 Hh/m² (pintura 2 demãos), 0.25 Hh/m² (3 demãos)
- Servente: 0.58 Hh/m² (apoio geral)
- Eletricista: 1.5 Hh/ponto (residencial), 2.0 Hh/ponto (comercial)
- Encanador: 2.0 Hh/ponto (água fria), 2.5 Hh/ponto (esgoto)
- Azulejista: 0.75 Hh/m² (revestimento cerâmico)
- Carpinteiro: 1.2 Hh/m² (formas de madeira)

=== REGRAS DE INFERÊNCIA INTELIGENTE (v3.0) ===
Quando o memorial indicar um PADRÃO DE QUALIDADE (explícita ou implicitamente),
INFIRA as especificações técnicas. NÃO pergunte ao usuário o que pode ser deduzido.
Itens inferidos devem ter isInferred=true e inferenceReason explicando a premissa.

DETECÇÃO DE PADRÃO:
- "popular", "econômico", "básico", "simples" → PADRÃO ECONÔMICO (qualityTier: "economico")
- "padrão", "médio", "standard", sem indicação → PADRÃO MÉDIO (qualityTier: "medio")
- "alto padrão", "AAA", "premium", "luxo", "sofisticado", "classe A" → PADRÃO ALTO (qualityTier: "alto")

TABELA DE INFERÊNCIA POR PADRÃO:

ECONÔMICO:
- Metais: Docol/Lorenzetti linha básica
- Louças: Celite/Logasa linha popular
- Piso: cerâmica esmaltada 30x30 ou 45x45 PEI-4
- Revestimento: cerâmica 20x20 em áreas molhadas
- Pintura: tinta latex PVA 2 demãos
- Portas: madeira prensada com batente metálico
- Janelas: alumínio natural sem vidro duplo
- Bancada: granito cinza andorinha ou mármore branco

MÉDIO (PADRÃO):
- Metais: Docol/Deca linha básica (Aspen, Base)
- Louças: Deca linha Vogue/Aspen
- Piso: porcelanato esmaltado nacional 60x60
- Revestimento: cerâmica retificada 30x60 em áreas molhadas
- Pintura: tinta acrílica fosca/acetinada 2-3 demãos
- Portas: madeira semi-oca com batente de madeira
- Janelas: alumínio anodizado com vidro simples
- Bancada: granito preto São Gabriel ou branco Siena

ALTO (PREMIUM/AAA):
- Metais: Deca linha Unic/Level ou equivalente premium
- Louças: Deca Vogue/Incepa Calypso ou equivalente
- Piso: porcelanato retificado polido/acetinado 80x80 ou 60x120
- Revestimento: porcelanato retificado para paredes + faixas decorativas
- Pintura: tinta acrílica premium acetinada/semi-brilho 3 demãos (Suvinil/Coral)
- Portas: madeira maciça com fechadura Pado/La Fonte
- Janelas: alumínio com pintura eletrostática + vidro laminado
- Bancada: granito preto absoluto, quartzo ou Silestone

COMO USAR:
1. Detecte o padrão no memorial (palavras-chave acima)
2. INFIRA especificações usando a tabela acima
3. Marque isInferred=true e preencha inferenceReason (ex: "Padrão alto detectado - metais Deca Unic")
4. Preencha qualityTier com o padrão detectado
5. NÃO adicione itens inferidos ao missingInfoRequests
6. SÓ pergunte ao usuário quando:
   - Área/comprimento/quantidade NÃO pode ser deduzida do texto
   - Memorial é genuinamente ambíguo (ex: "fazer piso" sem tipo nem padrão)
   - Existem conflitos (ex: "econômico" mas menciona "porcelanato importado")
7. Para campos com confiança média, use suggestedValue no MissingInfoRequest`;
  }

  getUserPrompt(input: EngenheiroTecnicoInput): string {
    // Se há respostas do usuário, incluir no prompt
    const userResponsesSection =
      input.userResponses && Object.keys(input.userResponses).length > 0
        ? `\n\nDADOS COMPLEMENTARES FORNECIDOS PELO USUÁRIO:\n${Object.entries(
            input.userResponses
          )
            .map(([key, value]) => `- ${key}: ${value}`)
            .join(
              "\n"
            )}\n\nUse esses dados para completar a análise. Se ainda faltar informação, solicite novamente.`
        : "";

    return `Analise o seguinte Memorial Descritivo e extraia TODOS os itens de engenharia.

⚠️ IMPORTANTE: Você DEVE processar o documento COMPLETO, do início ao fim.
NÃO interrompa a leitura. NÃO omita nenhum grupo de serviços.

⚠️ AUTONOMIA: Resolva TUDO que puder sozinho usando seu conhecimento de engenharia.
SÓ pergunte ao usuário fatos físicos do projeto que você não tem como deduzir.
Se um orçamentista experiente resolveria sem perguntar, você também deve resolver.

MEMORIAL DESCRITIVO:
${input.memorialDescritivo}

LOCALIZAÇÃO: ${input.location}
RESTRIÇÕES: ${input.restrictions}${userResponsesSection}

INSTRUÇÕES:
1. Leia o memorial COMPLETO
2. Identifique TODOS os grupos de serviços (1, 2, 3... até o último)
3. Extraia CADA ITEM de CADA TABELA
4. Mantenha a numeração original (1.1, 1.2, 2.1, etc.)
5. Se faltar informação crítica (metragem, quantidade), SOLICITE ao usuário
6. NÃO pule nenhum grupo

Retorne um JSON com:
- analysisStatus: "completed" se todas as informações estão presentes, "waiting_for_user_input" se faltam dados
- missingInfoRequests: array de solicitações (fieldId, question, type, unit) - vazio se analysisStatus = "completed"
  - Para campos com confiança média, preencha suggestedValue e isAutoInferrable=true
- items: lista de itens com especificações
  - Se inferiu especificações do padrão de qualidade, marque isInferred=true e preencha inferenceReason e qualityTier
- pendingItems: lista de itens que precisam de vistoria
- nbrReferences: lista de normas ABNT aplicáveis
- criticalNotes: observações críticas sobre o memorial
- groupsProcessed: lista dos grupos processados
- totalItemsExtracted: número total de itens extraídos

IMPORTANTE: Use as REGRAS DE INFERÊNCIA para completar especificações automaticamente.
Prefira INFERIR a PERGUNTAR. Só pergunte quando não houver como deduzir.`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        analysisStatus: {
          type: "string",
          enum: ["completed", "waiting_for_user_input"],
          description:
            "Status da análise: completed se dados suficientes, waiting_for_user_input se faltam dados",
        },
        missingInfoRequests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fieldId: {
                type: "string",
                description: "ID único para o campo, ex: area_pintura_sala",
              },
              question: {
                type: "string",
                description: "Pergunta clara para o usuário",
              },
              type: {
                type: "string",
                enum: ["number", "text", "select", "textarea"],
                description: "Tipo de input",
              },
              unit: {
                type: "string",
                description: "Unidade de medida, ex: m²",
              },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Opções para select",
              },
              hint: {
                type: "string",
                description: "Dica para ajudar o usuário",
              },
              required: {
                type: "boolean",
                description: "Se o campo é obrigatório (padrão: true)",
              },
              allowZero: {
                type: "boolean",
                description:
                  "Se permite valor 0 para campos numéricos (padrão: true)",
              },
              suggestedValue: {
                type: ["string", "number"],
                description:
                  "Valor sugerido pela IA baseado em inferência (frontend pré-preenche)",
              },
              isAutoInferrable: {
                type: "boolean",
                description:
                  "Se este campo poderia ter sido inferido (confiança média)",
              },
              suggestionReason: {
                type: "string",
                description:
                  "Razão da sugestão, ex: 'Padrão médio inferido do memorial'",
              },
            },
            required: ["fieldId", "question", "type"],
            additionalProperties: false,
          },
          description: "Lista de informações faltantes a solicitar ao usuário",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              group: { type: "string" },
              itemNumber: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              specifications: { type: "string" },
              nbrReference: { type: "string" },
              isPendingVistoria: { type: "boolean" },
              isSummaryItem: {
                type: "boolean",
                description:
                  "Se é item resumo/pai (NÃO somar no total, pois é soma dos filhos)",
              },
              parentGroupNumber: {
                type: "string",
                description: "Número do grupo pai (se for item filho)",
              },
              isInferred: {
                type: "boolean",
                description:
                  "Se as especificações foram inferidas automaticamente do padrão de qualidade",
              },
              inferenceReason: {
                type: "string",
                description:
                  "Razão da inferência, ex: 'Padrão alto detectado → metais Deca Unic'",
              },
              qualityTier: {
                type: "string",
                enum: ["economico", "medio", "alto"],
                description: "Padrão de qualidade detectado no memorial",
              },
            },
            required: [
              "group",
              "itemNumber",
              "description",
              "quantity",
              "unit",
              "specifications",
              "nbrReference",
              "isPendingVistoria",
            ],
            additionalProperties: false,
          },
        },
        pendingItems: { type: "array", items: { type: "string" } },
        nbrReferences: { type: "array", items: { type: "string" } },
        criticalNotes: { type: "array", items: { type: "string" } },
        groupsProcessed: { type: "array", items: { type: "string" } },
        totalItemsExtracted: { type: "number" },
      },
      required: [
        "analysisStatus",
        "missingInfoRequests",
        "items",
        "pendingItems",
        "nbrReferences",
        "criticalNotes",
        "groupsProcessed",
        "totalItemsExtracted",
      ],
      additionalProperties: false,
    };
  }

  /**
   * Verifica se o memorial é vago (sem metragens ou quantidades explícitas).
   */
  private _isMemorialVago(memorial: string): boolean {
    const padroesMetragem = [
      /\d+[.,]?\d*\s*(m²|m2|metros?\s*quadrados?)/i,
      /\d+[.,]?\d*\s*(m³|m3|metros?\s*cúbicos?)/i,
      /\d+[.,]?\d*\s*(m|metros?)\s*(lineares?)?/i,
      /\d+[.,]?\d*\s*(un|unidades?|peças?|pcs)/i,
      /\d+\s*x\s*\d+/i,
    ];
    for (const padrao of padroesMetragem) {
      if (padrao.test(memorial)) return false;
    }
    return memorial.length < 200;
  }

  /**
   * Gera perguntas específicas baseadas no tipo de serviço.
   */
  private _generateQuestionsForService(memorial: string): MissingInfoRequest[] {
    const questions: MissingInfoRequest[] = [];
    const m = memorial.toLowerCase();

    if (m.includes("pint") || m.includes("parede") || m.includes("tinta")) {
      questions.push({
        fieldId: "area_pintura",
        question: "Qual a área total das paredes a serem pintadas?",
        type: "number",
        unit: "m²",
        hint: "Some a área de todas as paredes",
        required: true,
      });
      questions.push({
        fieldId: "tipo_tinta",
        question: "Qual o tipo de tinta desejado?",
        type: "select",
        options: [
          "Acrílica fosca",
          "Acrílica acetinada",
          "Latex PVA",
          "Esmalte sintético",
        ],
        required: true,
      });
      questions.push({
        fieldId: "num_demaos",
        question: "Quantas demãos de tinta?",
        type: "select",
        options: ["2 demãos", "3 demãos"],
        required: true,
      });
    } else if (
      m.includes("piso") ||
      m.includes("cerâmica") ||
      m.includes("porcelanato")
    ) {
      questions.push({
        fieldId: "area_piso",
        question: "Qual a área total do piso?",
        type: "number",
        unit: "m²",
        required: true,
      });
      questions.push({
        fieldId: "tipo_piso",
        question: "Qual o tipo de piso?",
        type: "select",
        options: ["Cerâmica", "Porcelanato", "Laminado", "Vinílico"],
        required: true,
      });
    } else if (
      m.includes("elétric") ||
      m.includes("tomada") ||
      m.includes("ponto")
    ) {
      questions.push({
        fieldId: "num_pontos",
        question: "Quantos pontos elétricos?",
        type: "number",
        unit: "pontos",
        required: true,
      });
      questions.push({
        fieldId: "tipo_instalacao",
        question: "Tipo de instalação?",
        type: "select",
        options: ["Embutida", "Aparente", "Mista"],
        required: true,
      });
    } else {
      questions.push({
        fieldId: "area_servico",
        question: "Qual a área ou quantidade do serviço?",
        type: "text",
        hint: "Informe em m², metros lineares ou unidades",
        required: true,
      });
      questions.push({
        fieldId: "detalhes_servico",
        question: "Descreva com mais detalhes o serviço",
        type: "textarea",
        hint: "Inclua especificações de material, acabamento, etc.",
        required: true,
      });
    }
    return questions;
  }

  /**
   * Override do execute com estratégia dupla: PRÉ-LLM e PÓS-LLM.
   */
  async execute(
    input: EngenheiroTecnicoInput
  ): Promise<EngenheiroTecnicoOutput> {
    const memorial = input.memorialDescritivo;
    const temRespostasUsuario =
      input.userResponses && Object.keys(input.userResponses).length > 0;

    console.log(
      `[EngenheiroTecnico] Memorial length: ${memorial.length}, temRespostas: ${temRespostasUsuario}`
    );

    // ESTRATÉGIA PRÉ-LLM: Se memorial vago, sem respostas, E sem padrão de qualidade detectável,
    // retornar perguntas direto sem chamar LLM. Se há padrão (ex: "AAA"), deixar o LLM inferir.
    const hasQualityTier =
      /\b(luxo|aaa|premium|alto\s*padr[aã]o|econ[oô]mico|popular|b[aá]sico|padr[aã]o\s*(m[eé]dio|alto))\b/i.test(
        memorial
      );
    if (
      this._isMemorialVago(memorial) &&
      !temRespostasUsuario &&
      !hasQualityTier
    ) {
      console.log(
        `[EngenheiroTecnico] MEMORIAL VAGO - Retornando perguntas sem chamar LLM`
      );
      return {
        analysisStatus: "waiting_for_user_input",
        missingInfoRequests: this._generateQuestionsForService(memorial),
        items: [],
        pendingItems: [],
        nbrReferences: [],
        criticalNotes: ["Memorial incompleto - aguardando dados do usuário"],
        groupsProcessed: [],
        totalItemsExtracted: 0,
      };
    }

    // Verificar se precisa de chunking (memoriais grandes)
    const { needsChunking, createChunkedInputs, mergeEngenheiroOutputs } =
      await import("./chunking");

    if (needsChunking(memorial)) {
      console.log(
        `[EngenheiroTecnico] Memorial grande detectado - usando chunking`
      );
      const chunkedInputs = createChunkedInputs(input);
      console.log(
        `[EngenheiroTecnico] Dividido em ${chunkedInputs.length} chunks (concorrência limitada)`
      );

      // Concorrência limitada via p-limit. Anthropic Tier 1 tem rate limit
      // baixo (8k OPM pra Opus). Disparar todos em paralelo causa 429.
      // Concorrência 2 mantém ~3-4x speedup vs sequencial sem estourar tier.
      // Configurável via env LLM_CHUNK_CONCURRENCY pra ajustar conforme tier.
      const { default: pLimit } = await import("p-limit");
      const concurrency = parseInt(
        process.env.LLM_CHUNK_CONCURRENCY ?? "2",
        10
      );
      const limit = pLimit(concurrency);

      const t0 = Date.now();
      const outputs = await Promise.all(
        chunkedInputs.map((chunkInput, i) =>
          limit(() => {
            console.log(
              `[EngenheiroTecnico] Disparando chunk ${i + 1}/${chunkedInputs.length} (limite ${concurrency})...`
            );
            return super.execute(chunkInput);
          })
        )
      );
      console.log(
        `[EngenheiroTecnico] Todos os ${chunkedInputs.length} chunks completos em ${((Date.now() - t0) / 1000).toFixed(1)}s`
      );

      const merged = mergeEngenheiroOutputs(outputs);
      console.log(
        `[EngenheiroTecnico] Chunks merged: ${merged.items?.length || 0} items`
      );
      return merged;
    }

    // Chamar LLM (memorial cabe em uma chamada)
    console.log(`[EngenheiroTecnico] Chamando LLM...`);
    const output = await super.execute(input);

    console.log(
      `[EngenheiroTecnico] Output items: ${output.items?.length || 0}`
    );
    console.log(`[EngenheiroTecnico] analysisStatus: ${output.analysisStatus}`);

    // ESTRATÉGIA PÓS-LLM: Se LLM retornou items=0 e não solicitou info, forçar
    const llmFalhou =
      output.items?.length === 0 &&
      output.missingInfoRequests?.length === 0 &&
      !temRespostasUsuario;

    if (llmFalhou) {
      console.log(
        `[EngenheiroTecnico] LLM NÃO GEROU ITEMS - Forçando interatividade`
      );
      return {
        ...output,
        analysisStatus: "waiting_for_user_input",
        missingInfoRequests: this._generateQuestionsForService(memorial),
        items: [],
        pendingItems: [],
        criticalNotes: ["Memorial incompleto - aguardando dados do usuário"],
      };
    }

    return output;
  }
}

// Agent 2: Logística e Mobilização
export class LogisticaAgent extends BaseAgent<LogisticaInput, LogisticaOutput> {
  name = AGENT_NAMES.logistica;
  type: AgentType = "logistica";
  getTemperature() {
    return 0.2;
  }

  getSystemPrompt(): string {
    return `Você é o Agente de Logística e Mobilização da RR Engenharia.

MISSÃO: Calcular os CUSTOS INDIRETOS de execução da obra - aqueles que NÃO estão incluídos nas composições SINAPI/PINI.

⚠️ ATENÇÃO CRÍTICA: NÃO CALCULE CUSTOS DE MÃO DE OBRA DIRETA!
Os custos de mão de obra (pedreiro, servente, eletricista, etc.) JÁ ESTÃO INCLUÍDOS nas composições SINAPI/PINI que o Orçamentista vai utilizar.
Se você calcular diárias de profissionais, haverá DUPLICAÇÃO DE CUSTOS.

RESPONSABILIDADES (apenas custos indiretos):
1. MOBILIZAÇÃO/DESMOBILIZAÇÃO:
   - Transporte de equipamentos para o canteiro
   - Instalação de canteiro de obras (se necessário)
   - Placa de obra [OPCIONAL]
   - Tapume/fechamento [OPCIONAL]

2. FRETES E TRANSPORTES:
   - Frete de materiais pesados (areia, brita, cimento em grande quantidade)
   - Transporte de equipamentos especiais (betoneira, andaimes, etc.)
   - Custo de descarga (munck, guindaste)

3. BOTA-FORA E RESÍDUOS:
   - Caçambas para entulho
   - Transporte de resíduos
   - Taxa de destinação em aterro

4. EQUIPAMENTOS DE APOIO (locação):
   - Andaimes (para trabalho em altura)
   - Escoras (para lajes e estruturas)
   - Betoneira (se não incluída na composição)
   - Ferramentas especiais

5. CUSTOS DE ACESSO/RESTRIÇÃO:
   - Taxa de horário especial (shopping, condomínio)
   - Estacionamento de veículos de obra
   - Licenças especiais de acesso

6. HOSPEDAGEM/ALIMENTAÇÃO (apenas se obra fora da cidade):
   - Hospedagem da equipe
   - Vale-transporte/deslocamento
   - Alimentação da equipe

=== ITENS OPCIONAIS ===
Alguns itens são OPCIONAIS e devem ser separados para que o cliente decida se quer incluir:
- Placa de obra (identificação visual)
- Tapume/fechamento (privacidade e segurança)
- Seguro de obra (proteção contra imprevistos)
- Limpeza final profissional
- Documentação fotográfica

Coloque estes itens no array "optionalItems" com uma justificativa (reason) explicando o benefício.

=== PREMISSAS DE CUSTO ===
- Caçamba 5m³: R$ 350-500
- Frete local (até 50km): R$ 200-400
- Frete interestadual: R$ 1.500-3.000
- Locação andaime fachadeiro: R$ 15-25/m²/mês
- Locação betoneira 400L: R$ 300-500/mês
- Munck (içamento): R$ 400-800/dia
- Hospedagem: R$ 120/dia/pessoa
- Alimentação: R$ 60/dia/pessoa
- Placa de obra: R$ 200-500
- Tapume madeira: R$ 80-120/m²

=== ÍNDICES DE PRODUTIVIDADE (para estimar prazo e quantidade de caçambas) ===
Use estes índices APENAS para estimar volume de entulho e prazo de locação:
- Demolição gera ~1,3m³ de entulho por m³ demolido
- Alvenaria gera ~0,05m³ de entulho por m² executado
- Revestimento gera ~0,02m³ de entulho por m² executado

IMPORTANTE:
- NÃO inclua custos de mão de obra direta (já estão no SINAPI/PINI)
- Foque em custos que o Orçamentista NÃO consegue prever nas composições
- Considere as restrições locais (horário, acesso, etc.)
- Se a obra for local (mesma cidade), não inclua hospedagem/alimentação
- Separe itens OPCIONAIS no array "optionalItems" com justificativa

=== REGRA ANTI-SOBREPOSIÇÃO COM ORÇAMENTO ===
ANTES de incluir qualquer custo logístico, verifique se o serviço
NÃO está já embutido em composições SINAPI/PINI do orçamento:

CUSTOS TIPICAMENTE JÁ EMBUTIDOS (NÃO incluir na logística):
- Frete de materiais padrão: composições SINAPI já incluem frete até 30km
- Equipamentos em composições: betoneira, serra, martelete se usados em SINAPI, já inclusos
- Limpeza final: se há item "Limpeza de obra" no orçamento, não duplicar na logística
- Carga/descarga de demolição: composições de demolição já incluem carga e destinação
- Transporte de resíduos: se há item "bota-fora" ou "destinação" no orçamento, não duplicar

EXCEÇÃO DE FRETE: Se a obra estiver a mais de 30km da base ou do fornecedor
principal, calcule apenas o custo do frete EXCEDENTE (diferença acima dos 30km
já inclusos na composição SINAPI).`;
  }

  getUserPrompt(input: LogisticaInput): string {
    // Resumo dos itens orçados para ajudar a estimar prazo
    const budgetSummary =
      input.budgetItems && input.budgetItems.length > 0
        ? `\nITENS ORÇADOS (resumo):\n${input.budgetItems
            .slice(0, 15)
            .map((b: any) => `- ${b.description}: ${b.quantity} ${b.unit}`)
            .join(
              "\n"
            )}${input.budgetItems.length > 15 ? `\n... e mais ${input.budgetItems.length - 15} itens` : ""}`
        : "";

    return `Analise os itens da obra e calcule os custos logísticos:

ITENS DA OBRA:
${compactJson(input.items)}
${budgetSummary}

LOCALIZAÇÃO: ${input.location}
RESTRIÇÕES: ${input.restrictions}

Calcule todos os custos indiretos operacionais necessários.

IMPORTANTE: Estime a duração da obra baseado nos quantitativos dos itens para calcular custos de locação (andaimes, caçambas, container, etc.).
Use índices de produtividade para estimar o prazo:
- Alvenaria: 0,8-1,2 Hh/m²
- Revestimento: 1,5-2,0 Hh/m²
- Pintura: 0,3-0,5 Hh/m²
- Estrutura metálica: 2,0-3,0 Hh/m²
- Instalações: 1,0-1,5 Hh/ponto

Fórmula: Duração (semanas) = (Quantitativo × Índice Hh) ÷ (8h/dia × 5dias/semana × Nº profissionais)`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        costs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitCost: { type: "number" },
              totalCost: { type: "number" },
            },
            required: [
              "category",
              "description",
              "quantity",
              "unit",
              "unitCost",
              "totalCost",
            ],
            additionalProperties: false,
          },
        },
        optionalItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitCost: { type: "number" },
              totalCost: { type: "number" },
              reason: { type: "string" },
            },
            required: [
              "category",
              "description",
              "quantity",
              "unit",
              "unitCost",
              "totalCost",
              "reason",
            ],
            additionalProperties: false,
          },
        },
        totalLogisticsCost: { type: "number" },
        totalOptionalCost: { type: "number" },
        restrictions: { type: "array", items: { type: "string" } },
      },
      required: [
        "costs",
        "optionalItems",
        "totalLogisticsCost",
        "totalOptionalCost",
        "restrictions",
      ],
      additionalProperties: false,
    };
  }
}

// Agent 3: Orçamentista & Suprimentos
export class OrcamentistaAgent extends BaseAgent<
  OrcamentistaInput,
  OrcamentistaOutput
> {
  name = AGENT_NAMES.orcamentista;
  type: AgentType = "orcamentista";
  getPreferredModel() {
    return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6";
  }
  getTemperature() {
    return 0.1;
  }

  /**
   * Override execute() para chunking de orçamentos grandes.
   * Divide itens em frentes por disciplina de construção, processa cada frente
   * separadamente, e consolida os resultados.
   */
  async execute(input: OrcamentistaInput): Promise<OrcamentistaOutput> {
    const {
      needsBudgetChunking,
      createOrcamentistaChunkedInputs,
      mergeOrcamentistaOutputs,
    } = await import("./budgetChunking");

    if (needsBudgetChunking(input.items)) {
      console.log(
        `[Orcamentista] Budget grande (${input.items.length} itens) - chunking em frentes`
      );
      const chunkedInputs = createOrcamentistaChunkedInputs(input);
      console.log(
        `[Orcamentista] ${chunkedInputs.length} frentes criadas (concorrência limitada)`
      );

      // Concorrência limitada via p-limit. Mesma justificativa do Engenheiro:
      // 7+ frentes em paralelo estouram rate limit do Anthropic. Concorrência
      // 2 mantém speedup de 3-4x sem disparar 429.
      const { default: pLimit } = await import("p-limit");
      const concurrency = parseInt(
        process.env.LLM_CHUNK_CONCURRENCY ?? "2",
        10
      );
      const limit = pLimit(concurrency);

      const t0 = Date.now();
      const outputs = await Promise.all(
        chunkedInputs.map((chunkInput, i) =>
          limit(() => {
            console.log(
              `[Orcamentista] Disparando frente ${i + 1}/${chunkedInputs.length} (${chunkInput.items.length} itens, limite ${concurrency})...`
            );
            return super.execute(chunkInput);
          })
        )
      );
      console.log(
        `[Orcamentista] Todas as ${chunkedInputs.length} frentes completas em ${((Date.now() - t0) / 1000).toFixed(1)}s`
      );

      const merged = mergeOrcamentistaOutputs(outputs);
      console.log(
        `[Orcamentista] Merge: ${merged.budgetItems?.length} itens, R$ ${merged.totalDirectCost?.toFixed(2)}`
      );
      return merged;
    }

    return super.execute(input);
  }

  getSystemPrompt(): string {
    return `Você é o Orçamentista & Suprimentos da RR Engenharia.

MISSÃO: Precificar com realidade de mercado.

⚠️ REGRA CRÍTICA: PRECIFICAR 100% DOS ITENS!
Você DEVE precificar TODOS os itens recebidos do Engenheiro Técnico.
NÃO omita nenhum item, mesmo que seja similar a outro.
O número de itens na saída DEVE ser igual ao número de itens na entrada.

METODOLOGIA:
1. Itens Comuns (Curva C): Usar bases SINAPI (170+ composições) e PINI TCPO (80+ composições)
2. Itens Críticos (Curva A - 80% do valor): Simular cotação de mercado atual
3. Consolidar custos diretos e indiretos
4. Para postos de combustível: usar composições específicas (códigos PC* e TCPO-PC*)

BANCO DE DADOS DISPONÍVEL:
- SINAPI: 170+ composições reais (ref: Jan/2025, base SP) com ajuste regional automático por estado
- PINI TCPO: 80+ composições complementares com decomposição mão de obra/material/equipamento
- Categorias: Serviços Preliminares, Movimento de Terra, Fundações, Estrutura, Alvenaria, Revestimento, Pisos, Pintura, Cobertura, Instalações Elétricas, Instalações Hidráulicas, Esquadrias, Forro, Impermeabilização, Demolição, Postos de Combustível, Pavimentação, Drenagem, Segurança, Paisagismo, Climatização, Drywall, Acessibilidade

REGRAS:
- Cada item DEVE ter uma fonte declarada (SINAPI, PINI, Mercado) com código de referência
- Separar custo de material e mão de obra
- Identificar itens de alto impacto (Curva A)
- NÃO inventar preços - usar referências reais do banco de dados
- Usar códigos SINAPI (numéricos) ou PINI (TCPO-*) como sourceCode

=== HIERARQUIA DE ITENS (EVITAR DUPLICAÇÃO) ===
Itens com isSummaryItem=true são ITENS PAI (resumo).
Inclua itens PAI no output com isSummaryItem=true, unitCostTotal=0, totalCost=0.
NÃO precifique itens PAI — eles existem apenas para organização.
Precifique APENAS itens com isSummaryItem=false ou não definido.
totalDirectCost = soma APENAS dos itens com isSummaryItem=false.
Isso evita duplicação de valores no orçamento.

- PROCESSAR TODOS OS GRUPOS DE SERVIÇOS:
  * Serviços Preliminares
  * Estrutura e Vedação
  * Cobertura
  * Impermeabilização
  * Revestimentos
  * Forro e Acabamentos
  * Esquadrias
  * Instalações Hidrossanitárias
  * Instalações Elétricas
  * Limpeza e Finalização

REFERÊNCIAS DE PREÇO (usar como base quando não houver SINAPI/PINI):
- Concreto usinado fck 25: R$ 450-550/m³
- Aço CA-50: R$ 6.500-7.500/ton
- Tijolo cerâmico: R$ 0,80-1,20/un
- Cimento CP-II: R$ 35-45/saco 50kg
- Areia média: R$ 120-180/m³
- Brita 1: R$ 100-150/m³
- Steel frame/estrutura metálica leve: R$ 300-400/m²
- Telha termoacústica: R$ 120-180/m²
- Instalações hidráulicas completas: R$ 250-400/m²
- Instalações elétricas completas: R$ 180-300/m²
- Janela alumínio com vidro: R$ 600-900/m²
- Porta de entrada completa: R$ 1.500-3.000/un
- Porta interna completa: R$ 600-1.200/un`;
  }

  /**
   * Build price anchor references from SINAPI/PINI databases.
   * Returns top-15 items by estimated value for prompt injection.
   */
  private buildPriceAnchors(items: any[]): string {
    try {
      // P1.4: leitura s\u00edncrona do cache em mem\u00f3ria (populado por getSinapiData/getPiniData
      // ou inicializado vazio para usar a constante embutida como fallback).
      // O hot path getUserPrompt \u00e9 s\u00edncrono, ent\u00e3o n\u00e3o d\u00e1 para await aqui \u2014 em
      // troca disparamos um warm-up ass\u00edncrono que popula o cache para a pr\u00f3xima
      // execu\u00e7\u00e3o. Em ambientes sem banco (CI, dev), nunca sai da constante.
      const sinapiMod = require("../services/sinapi") as {
        SINAPI_DB: Array<{
          code: string;
          description: string;
          unit: string;
          price: number;
          category: string;
        }>;
        getSinapiDataSync: (state?: string) => Array<{
          code: string;
          description: string;
          unit: string;
          price: number;
          category: string;
        }>;
        getSinapiData: (state?: string) => Promise<unknown>;
      };
      const piniMod = require("../services/pini") as {
        PINI_DATABASE: Array<{
          code: string;
          description: string;
          unit: string;
          price: number;
        }>;
        getPiniDataSync: (region?: string) => Array<{
          code: string;
          description: string;
          unit: string;
          price: number;
        }>;
        getPiniData: (region?: string) => Promise<unknown>;
      };
      const SINAPI_DB = sinapiMod.getSinapiDataSync("SP");
      const PINI_DATABASE = piniMod.getPiniDataSync("S\u00e3o Paulo");
      // Warm-up async para popular o cache na pr\u00f3xima chamada (fire-and-forget).
      void sinapiMod.getSinapiData("SP");
      void piniMod.getPiniData("S\u00e3o Paulo");

      const normalizeText = (t: string) =>
        t
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s]/g, "")
          .trim();

      const anchors: Array<{
        description: string;
        source: string;
        code: string;
        price: number;
        unit: string;
        estValue: number;
      }> = [];

      for (const item of items) {
        if (item.isSummaryItem) continue;
        const descNorm = normalizeText(item.description || "");
        const keywords = descNorm
          .split(/\s+/)
          .filter((k: string) => k.length > 2);
        if (keywords.length === 0) continue;

        // Search SINAPI first
        let bestMatch: {
          code: string;
          description: string;
          price: number;
          unit: string;
          source: string;
        } | null = null;
        let bestScore = 0;

        for (const comp of SINAPI_DB) {
          if (comp.unit === "H") continue;
          const compNorm = normalizeText(comp.description);
          let matched = 0;
          for (const kw of keywords) {
            if (compNorm.includes(kw)) matched++;
          }
          const score = matched / keywords.length;
          if (score > bestScore && score >= 0.4) {
            bestScore = score;
            bestMatch = {
              code: comp.code,
              description: comp.description,
              price: comp.price,
              unit: comp.unit,
              source: "SINAPI",
            };
          }
        }

        // Try PINI if SINAPI didn't match well
        if (bestScore < 0.6) {
          for (const comp of PINI_DATABASE) {
            const compNorm = normalizeText(comp.description);
            let matched = 0;
            for (const kw of keywords) {
              if (compNorm.includes(kw)) matched++;
            }
            const score = matched / keywords.length;
            if (score > bestScore && score >= 0.4) {
              bestScore = score;
              bestMatch = {
                code: comp.code,
                description: comp.description,
                price: comp.price,
                unit: comp.unit,
                source: "PINI",
              };
            }
          }
        }

        if (bestMatch) {
          const qty = Number(item.quantity) || 1;
          anchors.push({ ...bestMatch, estValue: bestMatch.price * qty });
        }
      }

      // Sort by estimated value descending, take top 15
      return anchors
        .sort((a, b) => b.estValue - a.estValue)
        .slice(0, 15)
        .map(
          a =>
            `- "${a.description}": ${a.source} ${a.code} = R$ ${a.price.toFixed(2)}/${a.unit}`
        )
        .join("\n");
    } catch {
      return "";
    }
  }

  getUserPrompt(input: OrcamentistaInput): string {
    const totalItems = input.items?.length || 0;

    // Build price anchors from real SINAPI/PINI databases (top-15 by value)
    const anchors = this.buildPriceAnchors(input.items || []);

    // Detect chunk context for large budgets split into fronts
    const chunkInfo = (input as any)._chunkInfo as
      | { index: number; total: number; frontName: string }
      | undefined;
    const chunkHeader = chunkInfo
      ? `
⚠️ ESTA É A FRENTE ${chunkInfo.index} de ${chunkInfo.total} — "${chunkInfo.frontName}".
Precifique APENAS os ${totalItems} itens abaixo.
Não se preocupe com itens de outras frentes — eles serão precificados separadamente.
`
      : "";

    return `Precifique os itens de obra listados abaixo.
${chunkHeader}
⚠️ IMPORTANTE: Precifique APENAS itens FILHOS (isSummaryItem=false ou não definido).
Itens PAI (isSummaryItem=true) devem estar no output com unitCostTotal=0 e totalCost=0.
O budgetItems pode ter IGUAL OU MENOS itens que ${totalItems} (menos quando há itens resumo).
totalDirectCost = soma APENAS dos itens com isSummaryItem=false.
${
  anchors
    ? `
=== PREÇOS DE REFERÊNCIA (SINAPI/PINI Jan/2025, base SP) ===
${anchors}

⚠️ Use estes preços como base. Se divergir >15% de alguma referência, justifique.
`
    : ""
}
ITENS (${totalItems} no total):
${compactJson(input.items)}

CUSTOS LOGÍSTICOS:
${compactJson(input.logisticsCosts)}

REGIÃO: ${input.region}

INSTRUÇÕES:
1. Processe CADA UM dos ${totalItems} itens
2. Mantenha a numeração/grupo original do item
3. Para cada item, forneça:
   - Código e descrição
   - Unidade e quantidade
   - Custo unitário (material + mão de obra + logística)
   - Fonte do preço (SINAPI/PINI/Mercado com código se disponível)
4. NÃO pule nenhum grupo, especialmente:
   - Estrutura e Vedação
   - Cobertura
   - Instalações Hidrossanitárias
   - Instalações Elétricas

VALIDAÇÃO: Itens PAI devem ter isSummaryItem=true e totalCost=0.
totalDirectCost = soma dos itens com isSummaryItem=false (não incluir itens PAI na soma).`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        budgetItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
              category: { type: "string" },
              code: { type: "string" },
              description: { type: "string" },
              unit: { type: "string" },
              quantity: { type: "number" },
              unitCostMaterial: { type: "number" },
              unitCostLabor: { type: "number" },
              unitCostLogistics: { type: "number" },
              unitCostTotal: { type: "number" },
              totalCost: { type: "number" },
              source: { type: "string" },
              sourceCode: { type: "string" },
              sourceDate: { type: "string" },
              isSummaryItem: {
                type: "boolean",
                description:
                  "true se este item é PAI/RESUMO (soma dos filhos). false se é item filho a ser precificado.",
              },
              parentGroupNumber: {
                type: "string",
                description: "Número do grupo pai, se for item filho",
              },
            },
            required: [
              "id",
              "category",
              "code",
              "description",
              "unit",
              "quantity",
              "unitCostMaterial",
              "unitCostLabor",
              "unitCostLogistics",
              "unitCostTotal",
              "totalCost",
              "source",
              "sourceCode",
              "sourceDate",
            ],
            additionalProperties: false,
          },
        },
        totalDirectCost: { type: "number" },
        totalIndirectCost: { type: "number" },
        curvaAItems: { type: "array", items: { type: "string" } },
        curvaCItems: { type: "array", items: { type: "string" } },
      },
      required: [
        "budgetItems",
        "totalDirectCost",
        "totalIndirectCost",
        "curvaAItems",
        "curvaCItems",
      ],
      additionalProperties: false,
    };
  }
}

// Agent 4: Tributário
export class TributarioAgent extends BaseAgent<
  TributarioInput,
  TributarioOutput
> {
  name = AGENT_NAMES.tributario;
  type: AgentType = "tributario";
  // P1.1: migrado de Opus para Sonnet. Tarefa é classificação ISS/ICMS +
  // aplicação de alíquotas — tabela de regras simples, Sonnet basta.
  getPreferredModel() {
    return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6";
  }
  getTemperature() {
    return 0.0;
  }

  getSystemPrompt(): string {
    return `Você é o Agente Tributário da RR Engenharia.

MISSÃO: Otimização fiscal e compliance tributário PERSONALIZADO para cada empresa.

RESPONSABILIDADES:
1. Classificar itens entre "Serviço" (ISS) e "Material" (ICMS)
2. Evitar bitributação
3. Alertar sobre retenções obrigatórias (INSS, PIS/COFINS)
4. Calcular impacto no líquido a receber
5. USAR AS ALÍQUOTAS CONFIGURADAS PELA EMPRESA (não usar valores padrão)

⚠️ IMPORTANTE: As alíquotas serão fornecidas no input como "companyTaxSettings".
Você DEVE usar esses valores em vez de valores padrão.

REGRAS DE CLASSIFICAÇÃO:
- Serviços puros: ISS
- Fornecimento de materiais: ICMS
- Empreitada mista: proporcional ou regime especial

REGIMES TRIBUTÁRIOS:
- simples_nacional: alíquotas unificadas menores
- lucro_presumido: PIS/COFINS cumulativo (0,65% + 3%)
- lucro_real: PIS/COFINS não-cumulativo (1,65% + 7,6%)

=== TABELA DE ALÍQUOTAS POR REGIME (referência 2025) ===
Simples Nacional (Anexo IV - Construção Civil):
  - Faturamento até R$ 180k: 4.5% (faixa 1)
  - R$ 180k-360k: 7.8% (faixa 2)
  - R$ 360k-720k: 10.0% (faixa 3)
  - R$ 720k-1.8M: 11.2% (faixa 4)
  - R$ 1.8M-3.6M: 14.7% (faixa 5)
  - R$ 3.6M-4.8M: 30.0% (faixa 6)

Lucro Presumido (construção civil):
  - ISS: 2-5% (variável por município, média 5%)
  - PIS: 0.65% (cumulativo)
  - COFINS: 3.0% (cumulativo)
  - IRPJ: 1.2% (presunção 8% × alíquota 15%)
  - CSLL: 1.08% (presunção 12% × alíquota 9%)
  - INSS patronal: 20% sobre folha

Lucro Real:
  - PIS: 1.65% (não-cumulativo, com créditos)
  - COFINS: 7.6% (não-cumulativo, com créditos)
  - IRPJ: 15% sobre lucro real + 10% adicional acima R$ 20k/mês
  - CSLL: 9% sobre lucro real

=== RETENÇÕES OBRIGATÓRIAS ===
- INSS: 11% sobre cessão de mão-de-obra (Simples isentas do Anexo IV)
- ISS retido: quando tomador PJ e valor > R$ 1.000
- IR retido: 1.5% para serviços de engenharia
- PIS/COFINS/CSLL retido: 4.65% para órgãos públicos

=== FORMATO DE OUTPUT (CRÍTICO — LEIA COM ATENÇÃO) ===
O output JSON DEVE ter EXATAMENTE 3 chaves no nível raiz:
\`classifiedItems\` (array), \`totalTaxes\` (number), \`alerts\` (array).

NÃO use \`taxClassification\`, \`classification\`, \`items\`, \`summary\`,
\`grandTotal\` ou qualquer outro nome no nível raiz. Não aninhe os dados
sob nenhuma chave intermediária. O caller espera ler \`output.totalTaxes\`
e \`output.classifiedItems[]\` diretamente.

EXEMPLO DE OUTPUT CORRETO (formato canônico — siga este shape):
\`\`\`json
{
  "classifiedItems": [
    {"itemId": 1, "taxType": "iss", "taxAmount": 225.00, "retentions": []},
    {"itemId": 2, "taxType": "icms", "taxAmount": 1140.00, "retentions": ["INSS 11%"]},
    {"itemId": 3, "taxType": "both", "taxAmount": 850.50, "retentions": []}
  ],
  "totalTaxes": 2215.50,
  "alerts": ["Item 5: bitributação ICMS+ISS — verificar se é serviço puro"]
}
\`\`\`

\`totalTaxes\` é a soma aritmética de todos os \`taxAmount\` em
\`classifiedItems\` — NÃO recalcule por fora.`;
  }

  getUserPrompt(input: TributarioInput): string {
    // Calcular custo total dos itens para referência
    const totalCost = input.budgetItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const unitCost = Number(item.unitCostTotal) || 0;
      return sum + qty * unitCost;
    }, 0);

    // P1.5: removido fallback silencioso. O Tributário NÃO assume mais
    // 'lucro_presumido + ISS 5%' quando companyTaxSettings está ausente —
    // a orquestração (routers.ts) já bloqueia o pipeline com
    // PRECONDITION_FAILED antes de chegar aqui. Esta validação é defesa
    // em profundidade — se chegar aqui incompleta, é bug de orquestração.
    const taxSettings = (input as TributarioInput).companyTaxSettings;
    if (!isCompleteTaxSettings(taxSettings)) {
      throw new Error(
        "Tributario: companyTaxSettings ausente ou incompleto. A orquestração deveria ter bloqueado antes (P1.5)."
      );
    }

    const pisCofins = taxSettings.pisPercentual + taxSettings.cofinsPercentual;

    return `Classifique tributariamente os seguintes itens:

ITENS DO ORÇAMENTO:
${compactJson(input.budgetItems)}

CUSTO TOTAL DOS ITENS: R$ ${totalCost.toFixed(2)}

=== CONFIGURAÇÕES DE IMPOSTOS DA EMPRESA ===
Regime Tributário: ${taxSettings.regimeTributario}
ISS: ${taxSettings.issPercentual}%
PIS: ${taxSettings.pisPercentual}%
COFINS: ${taxSettings.cofinsPercentual}%
PIS+COFINS: ${pisCofins.toFixed(2)}%
IRPJ: ${taxSettings.irpjPercentual}%
CSLL: ${taxSettings.csllPercentual}%
Leis Sociais: ${taxSettings.taxaLeisSociais}%

INSTRUÇÕES OBRIGATÓRIAS:
1. USE AS ALÍQUOTAS ACIMA - NÃO USE VALORES PADRÃO
2. Para cada item, calcule o taxAmount baseado no valor do item (quantity * unitCostTotal)
3. Use as alíquotas configuradas:
   - ISS (serviços): ${taxSettings.issPercentual}% do valor
   - PIS/COFINS: ${pisCofins.toFixed(2)}% do valor
4. totalTaxes DEVE ser a soma de todos os taxAmount dos itens
5. Se o custo total é R$ ${totalCost.toFixed(2)}, os impostos devem ser aproximadamente:
   - Mínimo esperado (ISS): R$ ${((totalCost * taxSettings.issPercentual) / 100).toFixed(2)}
   - Com PIS/COFINS: R$ ${((totalCost * (taxSettings.issPercentual + pisCofins)) / 100).toFixed(2)}

IMPORTANTE: totalTaxes NÃO pode ser zero se houver itens no orçamento!

Para cada item, defina:
- Tipo de tributo (ISS/ICMS/ambos/nenhum)
- Valor do imposto (taxAmount)
- Retenções aplicáveis`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        classifiedItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemId: { type: "number" },
              taxType: {
                type: "string",
                enum: ["iss", "icms", "both", "none"],
              },
              taxAmount: { type: "number" },
              retentions: { type: "array", items: { type: "string" } },
            },
            required: ["itemId", "taxType", "taxAmount", "retentions"],
            additionalProperties: false,
          },
        },
        totalTaxes: { type: "number" },
        alerts: { type: "array", items: { type: "string" } },
      },
      required: ["classifiedItems", "totalTaxes", "alerts"],
      additionalProperties: false,
    };
  }
}

// Agent 5: Comercial — DETERMINÍSTICO (P1.2)
//
// Antes era LLM (Gemini Flash) com prompt detalhando a fórmula precoFinal =
// custoBase × (1 + bdiAjustado). Migrado para função TypeScript pura
// (server/services/comercialCalculator.ts) — não chama invokeLLM, custo
// zero de tokens (verificável em P0.3 / agent_llm_calls).
//
// A classe é mantida para preservar AGENT_ORDER e a UI de progresso. O
// override de execute() chama a função pura diretamente.
export class ComercialAgent extends BaseAgent<ComercialInput, ComercialOutput> {
  name = AGENT_NAMES.comercial;
  type: AgentType = "comercial";

  /** P1.2: marker de identificação para a UI mostrar badge "determinístico". */
  readonly isDeterministic = true;

  async execute(input: ComercialInput): Promise<ComercialOutput> {
    const { computeComercial } = await import(
      "../services/comercialCalculator"
    );
    const ctx = input as unknown as {
      projectBdi?: number;
      bdiPreset?: string;
      companyBdiSettings?: import("../services/comercialCalculator").CompanyBdiSettings;
    };
    return computeComercial(input, {
      projectBdi: ctx.projectBdi,
      bdiPreset: ctx.bdiPreset,
      companyBdiSettings: ctx.companyBdiSettings,
    });
  }

  // Os métodos abaixo nunca são chamados (execute() acima short-circuita
  // antes do BaseAgent._execute). Mantidos como NO-OP para satisfazer o
  // contrato abstrato de BaseAgent.
  getSystemPrompt(): string {
    return "";
  }
  getUserPrompt(): string {
    return "";
  }
  getOutputSchema(): object {
    return {};
  }
}

// Agent 6: Gestão de Projetos
export class GestaoProjAgent extends BaseAgent<
  GestaoProjInput,
  GestaoProjOutput
> {
  getPreferredModel() {
    return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6";
  }
  getTemperature() {
    return 0.3;
  }
  name = AGENT_NAMES.gestao_projetos;
  type: AgentType = "gestao_projetos";

  getSystemPrompt(): string {
    return `Você é o Agente de Gestão de Projetos da RR Engenharia.

MISSÃO: Criar cronograma físico REALISTA e PERSONALIZADO para cada projeto.

⚠️ ATENÇÃO: NÃO USE CRONOGRAMAS GENÉRICOS!
Cada projeto tem escopo diferente. Você DEVE calcular o prazo baseado nos quantitativos reais.

⚠️ FORMATO DO INPUT (P0.4):
Para reduzir tokens em obras grandes, você recebe um RESUMO POR CATEGORIA
com agregados (itemCount, totalCost, totalQuantityByUnit, topItems) ao
invés da lista completa de itens. Use as quantidades agregadas por
unidade (ex.: "m²: 1500" significa 1500 m² no total daquela categoria)
para estimar prazo via índices SINAPI. O campo TOTAL_DE_ITENS informa o
universo completo de itens — confirme que o cronograma cobre todas as
fases proporcionalmente. Os topItems servem só como exemplo do que está
em cada categoria, não use eles isoladamente.

RESPONSABILIDADES:
1. Analisar o RESUMO de cada categoria e calcular tempo de execução com
   base nas quantidades agregadas por unidade
2. Identificar dependências entre atividades
3. Calcular caminho crítico
4. Definir marcos (milestones) do projeto
5. Considerar equipe padrão de 2-4 profissionais

=== ÍNDICES SINAPI DE PRODUTIVIDADE (HOMEM-HORA POR UNIDADE) ===
Use estes índices para calcular a duração de cada atividade:

DEMOLIÇÃO E PREPARO:
- Demolição de alvenaria: 1,2 Hh/m²
- Demolição de piso cerâmico: 0,8 Hh/m²
- Demolição de concreto: 2,5 Hh/m³
- Remoção de entulho: 0,5 Hh/m³

ALVENARIA:
- Alvenaria tijolo cerâmico: 2,7 Hh/m² (pedreiro + servente)
- Alvenaria bloco concreto: 2,25 Hh/m² (pedreiro + servente)

REVESTIMENTO:
- Chapisco: 0,45 Hh/m²
- Emboco: 1,2 Hh/m²
- Reboco: 0,9 Hh/m²
- Revestimento cerâmico piso: 1,8 Hh/m²
- Revestimento cerâmico parede: 2,25 Hh/m²
- Porcelanato: 2,25 Hh/m²

PINTURA:
- Pintura látex (2 demãos): 0,5 Hh/m²
- Pintura acrílica (2 demãos): 0,62 Hh/m²
- Massa corrida: 0,75 Hh/m²

IMPERMEABILIZAÇÃO:
- Manta asfáltica: 1,2 Hh/m²
- Argamassa polimérica: 0,75 Hh/m²

CONCRETO:
- Concreto armado: 12 Hh/m³
- Contrapiso: 0,9 Hh/m²
- Laje pré-moldada: 1,8 Hh/m²

INSTALAÇÕES:
- Ponto hidráulico: 2,5 Hh/ponto
- Ponto elétrico: 1,9 Hh/ponto
- Louça sanitária: 2,5 Hh/unidade
- Torneira/registro: 0,8 Hh/unidade

ESQUADRIAS:
- Porta de madeira: 3,1 Hh/unidade
- Janela alumínio: 2,5 Hh/m²

COBERTURA:
- Telha cerâmica: 1,2 Hh/m²
- Telha metálica: 0,75 Hh/m²

=== METODOLOGIA DE CÁLCULO DO CRONOGRAMA ===
1. Para cada item, calcule: Horas Totais = Quantidade × Índice Hh
2. Converta para dias: Dias = Horas Totais ÷ 8 horas/dia
3. Considere equipe de 2-4 profissionais: Dias Reais = Dias ÷ Número de Profissionais
4. Converta para semanas: Semanas = Dias Reais ÷ 5 dias/semana
5. Arredonde para cima e adicione 20% de folga

EXEMPLO:
- Revestimento cerâmico 50m²
- Horas: 50 × 1,8 = 90 Hh
- Dias (1 pedreiro): 90 ÷ 8 = 11,25 dias
- Com 2 pedreiros: 11,25 ÷ 2 = 5,6 dias
- Semanas: 5,6 ÷ 5 = 1,12 semanas → arredonda para 1,5 semanas

SEQUÊNCIA TÍPICA DE OBRA:
1. Demolição e preparo
2. Estrutura (se houver)
3. Alvenaria
4. Instalações (elétrica/hidráulica - primeira fixa)
5. Revestimento (chapisco, emboco, reboco)
6. Contrapiso
7. Impermeabilização (se houver)
8. Revestimento cerâmico
9. Instalações (acabamento)
10. Pintura
11. Louças e metais
12. Limpeza final

IMPORTANTE:
- Calcule o prazo REAL baseado nos quantitativos
- NÃO use "4 semanas" como padrão para tudo
- Considere dependências (não pode pintar antes de rebocar)
- Adicione 20% de folga para imprevistos`;
  }

  getUserPrompt(input: GestaoProjInput): string {
    // P0.4: substitui slice(0, 30) por sumário agregado — o agente vê 100%
    // dos itens via agregação por categoria, sem estourar tokens.
    const summary = summarizeByCategory(input.budgetItems, 5);
    const totalItems = input.budgetItems.length;

    return `Crie o cronograma físico DETALHADO DIA A DIA para o projeto:

RESUMO DO ORÇAMENTO POR CATEGORIA (${summary.length} categorias):
${compactJson(summary)}

TOTAL_DE_ITENS: ${totalItems}

CUSTOS LOGÍSTICOS:
${compactJson(input.logisticsCosts)}

RESTRIÇÕES: ${input.restrictions}

=== INSTRUÇÕES OBRIGATÓRIAS ===
1. Crie um cronograma DIA A DIA (não apenas semanas)
2. Para cada dia, liste as atividades específicas que serão executadas
3. Inclua detalhes como:
   - Equipe necessária para cada atividade
   - Materiais que serão utilizados
   - Entregas esperadas ao final do dia
4. Identifique dependências entre atividades
5. Marque dias de folga/cura (ex: cura do concreto)
6. O cronograma deve ser um RELATÓRIO COMPLETO que o cliente possa acompanhar

EXEMPLO DE FORMATO:
Dia 1: Mobilização e preparo
- Chegada da equipe (2 pedreiros + 1 servente)
- Instalação do canteiro de obras
- Recebimento de materiais: cimento, areia, brita
- Entrega: Canteiro pronto para início

Dia 2: Demolição
- Demolição de alvenaria (15m²)
- Remoção de entulho para caçamba
- Entrega: Área limpa para nova construção`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        dailySchedule: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "number" },
              date: { type: "string" },
              phase: { type: "string" },
              activities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    team: { type: "string" },
                    materials: { type: "string" },
                    deliverable: { type: "string" },
                  },
                  required: ["description", "team", "materials", "deliverable"],
                  additionalProperties: false,
                },
              },
              isWorkDay: { type: "boolean" },
              notes: { type: "string" },
            },
            required: [
              "day",
              "date",
              "phase",
              "activities",
              "isWorkDay",
              "notes",
            ],
            additionalProperties: false,
          },
        },
        scheduleItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase: { type: "string" },
              description: { type: "string" },
              startDay: { type: "number" },
              endDay: { type: "number" },
              duration: { type: "number" },
            },
            required: [
              "phase",
              "description",
              "startDay",
              "endDay",
              "duration",
            ],
            additionalProperties: false,
          },
        },
        totalDuration: { type: "number" },
        totalDays: { type: "number" },
        criticalPath: { type: "array", items: { type: "string" } },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "number" },
              description: { type: "string" },
            },
            required: ["day", "description"],
            additionalProperties: false,
          },
        },
        teamSummary: { type: "string" },
        materialsSummary: { type: "string" },
      },
      required: [
        "dailySchedule",
        "scheduleItems",
        "totalDuration",
        "totalDays",
        "criticalPath",
        "milestones",
        "teamSummary",
        "materialsSummary",
      ],
      additionalProperties: false,
    };
  }
}

// Agent 7: Financeiro — DETERMINÍSTICO (P1.2)
//
// Antes era LLM (Gemini Flash) cuja única função era replicar o cashFlow
// recebido e gerar `alerts` em texto. Migrado para função TypeScript pura
// (server/services/financeiroAnalyzer.ts) — não chama invokeLLM, custo
// zero de tokens.
export class FinanceiroAgent extends BaseAgent<
  FinanceiroInput,
  FinanceiroOutput
> {
  name = AGENT_NAMES.financeiro;
  type: AgentType = "financeiro";

  /** P1.2: marker de identificação para a UI mostrar badge "determinístico". */
  readonly isDeterministic = true;

  async execute(input: FinanceiroInput): Promise<FinanceiroOutput> {
    const { analyzeFinanceiro } = await import(
      "../services/financeiroAnalyzer"
    );
    return analyzeFinanceiro(input);
  }

  getSystemPrompt(): string {
    return "";
  }
  getUserPrompt(): string {
    return "";
  }
  getOutputSchema(): object {
    return {};
  }
}

// Agent 8: Jurídico — TEMPLATING ESTRUTURADO (P1.6)
//
// Antes era LLM redigindo proposta livre — risco de cláusula divergente
// a cada execução. Agora a LLM tem 2 responsabilidades restritas:
//   1. Selecionar o template (padrao | obra_publica | manutencao)
//   2. Preencher slots descritivos curtos (escopoBreve, validityDays,
//      e opcionalmente clausulasExtras quando houver risco específico)
//
// O texto base das 9 cláusulas vem de arquivos versionados em
// server/templates/juridico/clausulas/. Cláusulas críticas (foro,
// validade, prazo) foram redigidas com slots e marcadas para review
// humano via comentário HTML no .md.
interface JuridicoLLMOutput {
  templateChoice: "padrao" | "obra_publica" | "manutencao";
  escopoBreve: string;
  validityDays: number;
  /**
   * P1.6 (post-review): foro derivado da localização da obra pelo agente.
   * Quando location for vago demais para extrair, vem com a string literal
   * "[Comarca da obra — preencher antes da assinatura]" para sinalizar
   * revisão humana antes da assinatura do contrato.
   */
  foro: string;
  clausulasExtras?: Array<{ title: string; content: string }>;
}

export class JuridicoAgent extends BaseAgent<JuridicoInput, JuridicoOutput> {
  name = AGENT_NAMES.juridico;
  type: AgentType = "juridico";
  getPreferredModel() {
    return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6";
  }
  getTemperature() {
    return 0.2;
  }

  getSystemPrompt(): string {
    return `Você é o Agente Jurídico da RR Engenharia.

MISSÃO: Selecionar o template de proposta e preencher campos descritivos curtos.

VOCÊ NÃO REDIGE A PROPOSTA. O texto das cláusulas vem de templates aprovados (em PT-BR jurídico padrão de obra civil, já revisados). Sua tarefa é:

1. Escolher o template apropriado:
   - "padrao": projeto privado padrão (residencial, comercial)
   - "obra_publica": licitação ou contratação pública (Lei 14.133/2021)
   - "manutencao": contrato contínuo de manutenção predial (NBR 5674)

2. Preencher "escopoBreve" — UMA frase descrevendo o escopo (ex.: "reforma de 3 banheiros e cozinha em apartamento de 120m²").

3. Definir "validityDays" — prazo de validade da proposta em dias. Default: 30. Aumentar para 45 ou 60 quando cliente é órgão público ou projeto envolve aprovações que dependem de terceiros.

4. Para o campo "foro": extrai do "location" recebido no input a cidade e UF onde a obra está sendo executada. Formato: "Cidade - UF" (exemplo: "Niterói - RJ"). Se location for vago demais para extrair (ex.: campo vazio ou só "obra residencial"), retorna a string literal [Comarca da obra — preencher antes da assinatura] — sinaliza para revisão humana.

5. Adicionar "clausulasExtras" SOMENTE quando houver risco específico não coberto pelas cláusulas padrão (ex.: cláusula ambiental para obras em área protegida, cláusula de seguro para canteiros de risco elevado). Cada extra deve ter title e content curto (parágrafo).

NÃO inventar cláusulas para tópicos já cobertos pelo template (objeto, preço, pagamento, prazo, garantias, responsabilidades, confidencialidade, rescisão, foro).
NÃO escrever cláusulas inteiras fora de "clausulasExtras".`;
  }

  getUserPrompt(input: JuridicoInput): string {
    const durationDays =
      (input as JuridicoInput & { durationDays?: number }).durationDays ||
      input.duration ||
      30;
    const location =
      (input as JuridicoInput & { location?: string }).location ?? "";
    return `Selecione o template e preencha os slots descritivos para esta proposta:

PROJETO: ${input.projectName}
TIPO DE CONTRATO: ${input.contractType ?? "obra"}
VALOR TOTAL: R$ ${input.totalPrice.toFixed(2)}
PRAZO: ${durationDays} dias
CONDIÇÕES DE PAGAMENTO: ${input.paymentTerms}
LOCALIZAÇÃO DA OBRA: ${location || "(não informada)"}

RESTRIÇÕES IDENTIFICADAS:
${input.restrictions.length ? input.restrictions.join("\n- ") : "(nenhuma)"}

ALERTAS FINANCEIROS:
${input.financialAlerts.length ? input.financialAlerts.join("\n- ") : "(nenhum)"}

Decida:
- templateChoice: padrao | obra_publica | manutencao
- escopoBreve: 1 frase curta sobre o escopo
- validityDays: prazo de validade da proposta (default 30)
- foro: comarca da obra no formato "Cidade - UF" extraída de LOCALIZAÇÃO DA OBRA acima. Se a localização for vaga demais, retorne literalmente "[Comarca da obra — preencher antes da assinatura]".
- clausulasExtras (opcional): só inclua se houver risco específico não coberto por cláusulas padrão`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        templateChoice: {
          type: "string",
          enum: ["padrao", "obra_publica", "manutencao"],
          description: "Template a renderizar",
        },
        escopoBreve: {
          type: "string",
          description: "Uma frase curta descrevendo o escopo do projeto",
        },
        validityDays: {
          type: "number",
          description: "Prazo de validade da proposta em dias (default 30)",
        },
        foro: {
          type: "string",
          description:
            "Comarca onde a obra está sendo executada, formato 'Cidade - UF'",
        },
        clausulasExtras: {
          type: "array",
          description:
            "Cláusulas adicionais para riscos específicos. Vazio quando o template padrão cobre tudo.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["title", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["templateChoice", "escopoBreve", "validityDays", "foro"],
      additionalProperties: false,
    };
  }

  /**
   * Override execute: chama a LLM (super.execute) só para os slots,
   * depois renderiza o template Markdown + monta JuridicoOutput.
   */
  async execute(input: JuridicoInput): Promise<JuridicoOutput> {
    const llmOutput = (await super.execute(
      input
    )) as unknown as JuridicoLLMOutput;
    const { renderProposta } = await import("../services/juridicoTemplating");
    const i = input as JuridicoInput & {
      durationDays?: number;
      clientName?: string;
      enderecoObra?: string;
      foro?: string;
      companyAddress?: string;
      companyCnpj?: string;
      contratada?: string;
      contratante?: string;
      memorialDate?: string;
    };

    const durationDays = i.durationDays || i.duration || 30;
    const durationWeeksLabel = formatDurationLabel(durationDays);

    let rendered: {
      text: string;
      clauses: Array<{ title: string; content: string }>;
    };
    try {
      rendered = await renderProposta(llmOutput.templateChoice, {
        projectName: input.projectName,
        clientName: i.clientName ?? "Cliente",
        proposalDate: new Date().toISOString(),
        validityDays: llmOutput.validityDays,
        totalPrice: input.totalPrice,
        paymentTerms: input.paymentTerms,
        durationDays,
        durationWeeksLabel,
        contractType: (input.contractType ?? "obra") as "obra" | "manutencao",
        contratada: i.contratada ?? "RR Engenharia",
        contratante: i.contratante ?? i.clientName ?? "Contratante",
        tipoObra:
          i.contractType === "manutencao" ? "manutenção predial" : "obra civil",
        memorialDate: i.memorialDate ?? new Date().toISOString(),
        escopoBreve: llmOutput.escopoBreve,
        enderecoObra: i.enderecoObra ?? "(a informar)",
        // P1.6 (post-review): foro vem da LLM, derivado da localização da obra.
        // Quando a LLM não consegue extrair, retorna "[Comarca da obra —
        // preencher antes da assinatura]" — sinaliza revisão humana no PDF.
        foro:
          llmOutput.foro || "[Comarca da obra — preencher antes da assinatura]",
        companyAddress: i.companyAddress ?? "",
        companyCnpj: i.companyCnpj ?? "",
      });
    } catch (err) {
      console.warn(
        "[Juridico] template render falhou, usando fallback minimo:",
        err
      );
      rendered = {
        text: `# Proposta — ${input.projectName}\n\nValor total: R$ ${input.totalPrice.toFixed(2)}\nPrazo: ${durationDays} dias\nValidade: ${llmOutput.validityDays} dias.\n\n${llmOutput.escopoBreve ?? ""}`,
        clauses: [],
      };
    }

    const clauses = [...rendered.clauses, ...(llmOutput.clausulasExtras ?? [])];

    // Cláusula de confidencialidade extraída para o campo dedicado do
    // schema (mantém compatibilidade com consumidores antigos).
    const confidentialityClause = rendered.clauses.find(c =>
      c.title.toLowerCase().includes("confidenc")
    );

    return {
      proposalText: rendered.text,
      clauses,
      validityDays: llmOutput.validityDays,
      confidentialityTerms: confidentialityClause?.content ?? "",
    };
  }
}

/** Helper local: "45 dias" → "6 semanas e 3 dias" para humanizar o prazo. */
function formatDurationLabel(days: number): string {
  if (days <= 0) return "0 dias";
  if (days < 7) return `${days} dia${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;
  const weeksLabel = `${weeks} semana${weeks === 1 ? "" : "s"}`;
  if (remDays === 0) return weeksLabel;
  return `${weeksLabel} e ${remDays} dia${remDays === 1 ? "" : "s"}`;
}

// Agent 9: Board (Decisor)
export class BoardAgent extends BaseAgent<BoardInput, BoardOutput> {
  name = AGENT_NAMES.board;
  type: AgentType = "board";
  // P1.1: migrado de Opus para Sonnet. Recebe margem e cashflow já
  // calculados — só decide e justifica. Trabalho deliberativo dentro
  // da capacidade do Sonnet.
  getPreferredModel() {
    return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6";
  }
  getTemperature() {
    return 0.2;
  }

  getSystemPrompt(): string {
    return `Você é o BOARD EXECUTIVO da RR Engenharia, composto por especialistas sêniores em Gestão de Negócios:
- CEO (Chief Executive Officer): Visão estratégica e continuidade do negócio
- CFO (Chief Financial Officer): Viabilidade financeira e risco de caixa
- COO (Chief Operating Officer): Capacidade operacional e execução

MISSÃO: VOCÊ É O DECISOR CRÍTICO FINAL. Sua decisão BLOQUEIA ou LIBERA a geração da proposta.

=== REGRAS CRÍTICAS DE APROVAÇÃO ===

1. REPROVAÇÃO (blockProposal = true):
   - Margem de lucro < 10%
   - Risco de caixa crítico sem adiantamento viável
   - Incoerências graves entre agentes (diferença > 30% nos valores)
   - Falta de dados essenciais para precificação
   - Prazo inviável para a capacidade operacional
   RESULTADO: Proposta NÃO será gerada. Usuário deve corrigir.

2. ATENÇÃO (requiresUserConfirmation = true):
   - Margem de lucro entre 10-15%
   - Risco médio que pode ser mitigado
   - Pequenas incoerências que não invalidam a proposta
   - Alertas de compliance que precisam de ciência
   RESULTADO: Proposta será gerada, mas usuário DEVE confirmar ciência.

3. APROVAÇÃO (approved = true, sem bloqueios):
   - Margem de lucro > 15%
   - Risco baixo ou controlado
   - Todos os agentes em consenso
   - Dados completos e consistentes
   RESULTADO: Proposta gerada automaticamente.

=== AUTO-CORREÇÃO FINANCEIRA ===
Quando a rejeição for EXCLUSIVAMENTE por motivos financeiros (margem baixa, BDI inadequado, preço de venda insuficiente), você pode solicitar um CICLO DE REVISÃO AUTOMÁTICO:

- isFinancialOnlyRejection = true: A rejeição é APENAS por margem/preço, sem problemas operacionais ou técnicos
- requestFinancialRevision = true: Solicita que os agentes Orçamentista, Logística, Tributário e Comercial refazam seus cálculos
- financialRevisionReason: Explique o motivo da revisão (ex: "Margem de 3.8% abaixo do mínimo de 10%")
- financialRevisionInstructions: Forneça instruções ESPECÍFICAS para cada agente:
  - orcamentista: "Revisar preços unitários, buscar alternativas mais econômicas"
  - logistica: "Otimizar custos de frete e mobilização"
  - tributario: "Verificar possibilidade de redução fiscal"
  - comercial: "Aumentar BDI para atingir margem mínima de 15%"

IMPORTANTE: A auto-correção só pode ser solicitada UMA VEZ. Se o projeto já passou por revisão financeira, não solicite novamente.

=== CÁLCULO DE MARGEM ===
A margem já foi calculada e está em calculosFinanceiros.margemPercentual.
Use EXATAMENTE o valor fornecido. NÃO recalcule.

Fórmula usada:
- Custo Total = custoDireto + custoIndireto + custoLogistica
- Margem Líquida = precoFinal - custoTotal - impostos
- Margem % = (margemLiquida / precoFinal) × 100

=== VALIDAÇÕES OBRIGATÓRIAS ===
1. Verificar se Preço Final = (Custo Direto + Custo Indireto) x (1 + BDI)
2. Verificar se o prazo é coerente com os quantitativos
3. Verificar se o fluxo de caixa é sustentável
4. Verificar se há itens sem preço ou com valores zerados

SEJA CRÍTICO E RIGOROSO. Sua função é proteger a empresa de propostas inviáveis.

=== BENCHMARKS DE MERCADO (construção civil 2025) ===
Margens líquidas típicas por tipo de obra:
- Reforma comercial (lojas, escritórios): 15-25%
- Obra nova residencial (casas, prédios): 12-20%
- Obra industrial (galpões, fábricas): 10-18%
- Manutenção predial (reparos, conservação): 20-35%
- Postos de combustível: 15-22%
- Infraestrutura (drenagem, pavimentação): 10-15%

Faixas de BDI por porte:
- Obras < R$ 150k: BDI 20-30% (menor escala, mais overhead)
- Obras R$ 150k-500k: BDI 18-25% (faixa padrão)
- Obras R$ 500k-2M: BDI 15-22% (economia de escala)
- Obras > R$ 2M: BDI 12-18% (grande porte, menor risco relativo)

Sinais de alerta:
- BDI < 15% em obra pequena → margem insuficiente para contingências
- BDI > 40% → proposta não-competitiva, risco de perder licitação
- Logística > 20% do custo direto → verificar se localização justifica
- Prazo < 2 semanas para obras > R$ 100k → provavelmente inviável

=== MODO SOLUCIONADOR (v3.3) ===
Você NÃO é um porteiro que bloqueia. Você é um CONSULTOR EXECUTIVO que RESOLVE.
Quando detectar um problema, sua PRIMEIRA reação deve ser PROPOR UMA SOLUÇÃO.

PROBLEMA → SOLUÇÃO:

1. CAIXA NEGATIVO EM SEMANA X:
   → Propor medição intermediária na semana X
   → Calcular percentual mínimo para manter caixa positivo
   → Preencher suggestedBillingSchedule com novo cronograma de parcelas
   Exemplo: caixa negativo na semana 3 de 4 →
   suggestedBillingSchedule: {
     installments: [
       {name: "Entrada", percentage: 30},
       {name: "Medição intermediária (semana 3)", percentage: 40},
       {name: "Final", percentage: 30}
     ],
     reason: "Caixa projetado negativo na semana 3. Medição intermediária resolve a exposição.",
     projectedMaxExposure: 0
   }

2. PRAZO APERTADO:
   → Sugerir prazo realista e justificar
   → NÃO bloquear — propor prazo correto como condição de aprovação

3. DADOS FALTANTES (vistoria, detalhamento):
   → Prosseguir com premissas conservadoras (+15% contingência)
   → Listar como condição: "Vistoria necessária antes da execução"
   → NÃO bloquear — sinalizar como warning com plano de mitigação

4. EXPOSIÇÃO DE CAIXA ALTA:
   → Propor cronograma de medições que elimine a exposição
   → Se impossível eliminar, propor linha de crédito como condição

REGRA FUNDAMENTAL DE BLOQUEIO:
blockProposal = true SOMENTE quando:
- Margem de lucro < 5% (projeto dá prejuízo real)
- Memorial completamente incompatível com orçamento (>50% de itens sem preço)

Para TODOS os outros casos → approved=true ou requiresUserConfirmation=true
com soluções e condições claras. Nunca bloqueie por problemas que têm solução.`;
  }

  getUserPrompt(input: BoardInput): string {
    // Resumir os outputs dos agentes para evitar payload muito grande
    const resumo = {
      engenheiro: {
        totalItens: input.allAgentOutputs.engenheiro?.items?.length || 0,
        itensPendentes:
          input.allAgentOutputs.engenheiro?.pendingItems?.length || 0,
        notasCriticas: input.allAgentOutputs.engenheiro?.criticalNotes || [],
      },
      orcamentista: {
        totalItens:
          input.allAgentOutputs.orcamentista?.budgetItems?.length || 0,
        custoDireto: input.allAgentOutputs.orcamentista?.totalDirectCost || 0,
        custoIndireto:
          input.allAgentOutputs.orcamentista?.totalIndirectCost || 0,
        itensCurvaA: input.allAgentOutputs.orcamentista?.curvaAItems || [],
      },
      logistica: {
        custoTotal: input.allAgentOutputs.logistica?.totalLogisticsCost || 0,
        restricoes: input.allAgentOutputs.logistica?.restrictions || [],
      },
      tributario: {
        totalImpostos: input.allAgentOutputs.tributario?.totalTaxes || 0,
        alertas: input.allAgentOutputs.tributario?.alerts || [],
      },
      comercial: {
        bdiAjustado: input.allAgentOutputs.comercial?.adjustedBdi || 0,
        precoFinal: input.allAgentOutputs.comercial?.finalPrice || 0,
        justificativaBdi:
          input.allAgentOutputs.comercial?.bdiJustification || "",
      },
      gestao: {
        duracaoTotal: input.allAgentOutputs.gestao?.totalDuration || 0,
        caminhosCriticos: input.allAgentOutputs.gestao?.criticalPath || [],
        marcos: input.allAgentOutputs.gestao?.milestones || [],
      },
      financeiro: {
        exposicaoMaxima: input.allAgentOutputs.financeiro?.maxExposure || 0,
        precisaAdiantamento:
          input.allAgentOutputs.financeiro?.needsAdvance || false,
        adiantamentoSugerido:
          input.allAgentOutputs.financeiro?.suggestedAdvance || 0,
        alertas: input.allAgentOutputs.financeiro?.alerts || [],
      },
      juridico: {
        validadeDias: input.allAgentOutputs.juridico?.validityDays || 30,
        totalClausulas: input.allAgentOutputs.juridico?.clauses?.length || 0,
      },
    };

    // === CÁLCULOS FINANCEIROS PRÉ-CALCULADOS ===
    const custoDireto = resumo.orcamentista.custoDireto;
    const custoIndireto = resumo.orcamentista.custoIndireto;
    const custoLogistica = resumo.logistica.custoTotal;
    const totalImpostos = resumo.tributario.totalImpostos;
    const precoFinal = resumo.comercial.precoFinal;

    // Custo Total = Direto + Indireto + Logística
    const custoTotal = custoDireto + custoIndireto + custoLogistica;

    // Margem Bruta = Preço Final - Custo Total
    const margemBruta = precoFinal - custoTotal;

    // Margem Líquida = Margem Bruta - Impostos
    const margemLiquida = margemBruta - totalImpostos;

    // Margem Percentual = (Margem Líquida / Preço Final) x 100
    const margemPercentual =
      precoFinal > 0 ? (margemLiquida / precoFinal) * 100 : 0;

    // Adicionar cálculos ao resumo
    const calculosFinanceiros = {
      custoDireto,
      custoIndireto,
      custoLogistica,
      custoTotal,
      totalImpostos,
      precoFinal,
      margemBruta,
      margemLiquida,
      margemPercentual: margemPercentual.toFixed(2),
    };

    // Validar dados de entrada
    const dadosFaltantes: string[] = [];
    if (!custoDireto || custoDireto <= 0)
      dadosFaltantes.push("Custo direto ausente ou inválido");
    if (custoLogistica === undefined)
      dadosFaltantes.push("Custo logístico não informado");
    if (totalImpostos === undefined)
      dadosFaltantes.push("Impostos não calculados");
    if (!precoFinal || precoFinal <= 0)
      dadosFaltantes.push("Preço final ausente ou inválido");

    const alertaDados =
      dadosFaltantes.length > 0
        ? `\n\n⚠️ ALERTA: DADOS INCOMPLETOS\n- ${dadosFaltantes.join("\n- ")}\nCONSIDERE REPROVAR ATÉ QUE OS DADOS ESTEJAM COMPLETOS.`
        : "";

    return `REUNIÃO DO BOARD EXECUTIVO - ANÁLISE E DECISÃO

=== CÁLCULOS FINANCEIROS (PRÉ-CALCULADOS) ===
A margem já foi calculada. Use EXATAMENTE estes valores:

- Custo Direto: R$ ${custoDireto.toFixed(2)}
- Custo Indireto: R$ ${custoIndireto.toFixed(2)}
- Custo Logística: R$ ${custoLogistica.toFixed(2)}
- CUSTO TOTAL: R$ ${custoTotal.toFixed(2)}
- Impostos: R$ ${totalImpostos.toFixed(2)}
- Preço Final: R$ ${precoFinal.toFixed(2)}
- MARGEM BRUTA: R$ ${margemBruta.toFixed(2)}
- MARGEM LÍQUIDA: R$ ${margemLiquida.toFixed(2)}
- MARGEM PERCENTUAL: ${margemPercentual.toFixed(2)}%

FÓRMULA USADA:
- Custo Total = Custo Direto + Custo Indireto + Custo Logística
- Margem Líquida = Preço Final - Custo Total - Impostos
- Margem % = (Margem Líquida / Preço Final) × 100

⚠️ IMPORTANTE: NÃO recalcule a margem. Use o valor ${margemPercentual.toFixed(2)}% acima.${alertaDados}

PROJETO EM ANÁLISE:
- Nome: ${input.projectSummary.name}
- Valor da Proposta: R$ ${input.projectSummary.totalPrice.toFixed(2)}
- Prazo de Execução: ${input.projectSummary.duration} semanas

RESUMO DOS LAUDOS DOS AGENTES:
${compactJson(resumo)}

AÇÃO REQUERIDA:
1. Analise os resumos e identifique divergências ou riscos
2. Para cada problema, TOME UMA DECISÃO EXECUTIVA
3. Avalie se o projeto é VIÁVEL para o negócio
4. Emita seu PARECER FINAL com decisões tomadas

Lembre-se: Você é o DECISOR, não apenas um revisor.`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        blockProposal: {
          type: "boolean",
          description:
            "Se true, a proposta NÃO será gerada. Usuário deve corrigir problemas.",
        },
        requiresUserConfirmation: {
          type: "boolean",
          description:
            "Se true, proposta será gerada mas usuário deve confirmar ciência dos alertas.",
        },
        blockReason: {
          type: "string",
          description: "Motivo do bloqueio (se blockProposal = true)",
        },
        warningMessages: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de alertas que o usuário deve estar ciente (se requiresUserConfirmation = true)",
        },
        projectViability: {
          type: "object",
          properties: {
            isViable: { type: "boolean" },
            profitMargin: { type: "string" },
            calculatedMargin: {
              type: "number",
              description: "Margem calculada em percentual",
            },
            riskLevel: {
              type: "string",
              enum: ["baixo", "medio", "alto", "critico"],
            },
            recommendation: {
              type: "string",
              enum: ["aprovar", "aprovar_com_ressalvas", "revisar", "rejeitar"],
            },
          },
          required: [
            "isViable",
            "profitMargin",
            "calculatedMargin",
            "riskLevel",
            "recommendation",
          ],
          additionalProperties: false,
        },
        validationResults: {
          type: "object",
          properties: {
            priceCalculationCorrect: { type: "boolean" },
            priceCalculationDetails: { type: "string" },
            scheduleCoherent: { type: "boolean" },
            scheduleDetails: { type: "string" },
            cashFlowSustainable: { type: "boolean" },
            cashFlowDetails: { type: "string" },
            allItemsPriced: { type: "boolean" },
            unpricedItems: { type: "array", items: { type: "string" } },
          },
          required: [
            "priceCalculationCorrect",
            "priceCalculationDetails",
            "scheduleCoherent",
            "scheduleDetails",
            "cashFlowSustainable",
            "cashFlowDetails",
            "allItemsPriced",
            "unpricedItems",
          ],
          additionalProperties: false,
        },
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              issue: { type: "string" },
              agentsInvolved: { type: "string" },
              businessImpact: { type: "string" },
              decision: { type: "string" },
              justification: { type: "string" },
              actionRequired: { type: "string" },
              responsible: { type: "string" },
            },
            required: [
              "issue",
              "agentsInvolved",
              "businessImpact",
              "decision",
              "justification",
              "actionRequired",
              "responsible",
            ],
            additionalProperties: false,
          },
        },
        executiveSummary: { type: "string" },
        finalApproval: {
          type: "object",
          properties: {
            ceo: { type: "boolean" },
            ceoNotes: { type: "string" },
            cfo: { type: "boolean" },
            cfoNotes: { type: "string" },
            coo: { type: "boolean" },
            cooNotes: { type: "string" },
          },
          required: ["ceo", "ceoNotes", "cfo", "cfoNotes", "coo", "cooNotes"],
          additionalProperties: false,
        },
        conditionsForApproval: { type: "string" },
        // Campos de auto-correção financeira
        isFinancialOnlyRejection: {
          type: "boolean",
          description:
            "Se true, a rejeição é EXCLUSIVAMENTE por motivos financeiros (margem, BDI, preço), sem problemas operacionais ou técnicos",
        },
        requestFinancialRevision: {
          type: "boolean",
          description:
            "Se true, solicita ciclo de revisão automático dos agentes Orçamentista, Logística, Tributário e Comercial",
        },
        financialRevisionReason: {
          type: "string",
          description:
            "Motivo da solicitação de revisão financeira (ex: Margem de 3.8% abaixo do mínimo de 10%)",
        },
        financialRevisionInstructions: {
          type: "object",
          properties: {
            orcamentista: {
              type: "string",
              description: "Instruções específicas para o Orçamentista",
            },
            logistica: {
              type: "string",
              description: "Instruções específicas para a Logística",
            },
            tributario: {
              type: "string",
              description: "Instruções específicas para o Tributário",
            },
            comercial: {
              type: "string",
              description: "Instruções específicas para o Comercial",
            },
          },
          required: ["orcamentista", "logistica", "tributario", "comercial"],
          additionalProperties: false,
        },
        suggestedBillingSchedule: {
          type: "object",
          description:
            "Cronograma de pagamento sugerido para resolver problemas de caixa",
          properties: {
            installments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Nome da parcela (Entrada, Medição, Final)",
                  },
                  percentage: {
                    type: "number",
                    description: "Percentual do preço total (0-100)",
                  },
                },
                required: ["name", "percentage"],
                additionalProperties: false,
              },
            },
            reason: {
              type: "string",
              description: "Justificativa para o cronograma sugerido",
            },
            projectedMaxExposure: {
              type: "number",
              description: "Exposição máxima projetada com o novo cronograma",
            },
          },
          required: ["installments", "reason", "projectedMaxExposure"],
          additionalProperties: false,
        },
      },
      required: [
        "approved",
        "blockProposal",
        "requiresUserConfirmation",
        "blockReason",
        "warningMessages",
        "projectViability",
        "validationResults",
        "decisions",
        "executiveSummary",
        "finalApproval",
        "conditionsForApproval",
        "isFinancialOnlyRejection",
        "requestFinancialRevision",
        "financialRevisionReason",
        "financialRevisionInstructions",
      ],
      additionalProperties: false,
    };
  }
}

// Agent 10: Auditor de Consistência
export class AuditorAgent extends BaseAgent<AuditorInput, AuditorOutput> {
  getPreferredModel() {
    return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6";
  }
  getTemperature() {
    return 0.0;
  }
  name = AGENT_NAMES.auditor;
  type: AgentType = "auditor";

  /**
   * P0.4: chunking para auditar 100% dos itens em obras grandes.
   *
   * P2.6: dedup determinístico (findBudgetDuplicates / findInvalidSummaryItems)
   * roda ANTES da LLM sobre o orçamento completo. Pega duplicatas LEXICAIS
   * (Jaccard ≥ 0.85) — ex.: "Pintura acrílica" / "pintura acrilica".
   *
   * P2 ADENDO (dedup semântica): a LLM detecta sobreposição SEMÂNTICA — itens
   * descrevendo o mesmo objeto físico/serviço com vocabulário diferente
   * (ex.: "Desativação completa" vs "Remoção corte içamento" — mesma obra,
   * lexicalmente distantes). Antes a saída da LLM era totalmente descartada;
   * agora `corrections.budgetItemsToRemove` é uma UNIÃO dos dois conjuntos
   * (deterministico ∪ LLM, deduplicada por description normalizada). LLM
   * mantém o papel narrativo (auditNotes, validações matemáticas,
   * logisticsToRemove).
   *
   * Feature flag: AUDITOR_USE_LLM_DEDUP=true preserva o caminho legado
   * (LLM detecta tudo) por 30 dias para comparação A/B.
   */
  async execute(input: AuditorInput): Promise<AuditorOutput> {
    const {
      needsAuditorChunking,
      createAuditorChunkedInputs,
      mergeAuditorOutputs,
    } = await import("./auditorChunking");

    const useLlmDedup = process.env.AUDITOR_USE_LLM_DEDUP === "true";
    const allItems = (input.allAgentOutputs?.orcamentista?.budgetItems ??
      []) as AuditorBudgetItem[];

    // P2.6: dedup determinístico calculado ANTES da LLM, sobre o orçamento
    // completo (independente de chunking — duplicatas podem cruzar chunks).
    const deterministicDuplicates: DuplicateFinding[] = useLlmDedup
      ? []
      : [
          ...findBudgetDuplicates(allItems),
          ...findInvalidSummaryItems(allItems),
        ];
    const deterministicTotalImpact = deterministicDuplicates.reduce(
      (s, d) => s + d.estimatedImpact,
      0
    );

    // Anexa o pré-cálculo ao input para que o user prompt cite a lista
    // já decidida e a LLM não duplique trabalho.
    const inputWithPreComputed = useLlmDedup
      ? input
      : ({
          ...input,
          _preComputed: {
            duplicates: deterministicDuplicates,
            duplicatesTotalImpact: deterministicTotalImpact,
          },
        } as AuditorInput);

    let llmOutput: AuditorOutput;
    if (needsAuditorChunking(inputWithPreComputed)) {
      const chunks = createAuditorChunkedInputs(inputWithPreComputed);
      console.log(
        `[Auditor] Projeto com ${allItems.length} itens — auditoria em ${chunks.length} chunks`
      );

      const outputs: AuditorOutput[] = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`[Auditor] Chunk ${i + 1}/${chunks.length}`);
        // Propaga _preComputed para cada chunk
        const chunkInput = useLlmDedup
          ? chunks[i]
          : ({
              ...chunks[i],
              _preComputed: {
                duplicates: deterministicDuplicates,
                duplicatesTotalImpact: deterministicTotalImpact,
              },
            } as AuditorInput);
        const out = await super.execute(chunkInput);
        outputs.push(out);
      }
      llmOutput = mergeAuditorOutputs(outputs);
    } else {
      llmOutput = await super.execute(inputWithPreComputed);
    }

    if (useLlmDedup) return llmOutput;

    // P2 ADENDO: união determinístico ∪ LLM (semântico). Normaliza
    // descrições para deduplicar — se o LLM sinalizou o mesmo item
    // que o algoritmo, conta uma vez só.
    const llmFindings = (llmOutput.corrections?.budgetItemsToRemove ??
      []) as Array<{
      description: string;
      reason: string;
      estimatedImpact: number;
    }>;
    const seenDescriptions = new Set<string>();
    const mergedFindings: Array<{
      description: string;
      reason: string;
      estimatedImpact: number;
    }> = [];

    for (const d of deterministicDuplicates) {
      const key = normalizeForFindingDedup(d.description);
      if (seenDescriptions.has(key)) continue;
      seenDescriptions.add(key);
      mergedFindings.push({
        description: d.description,
        reason: d.reason,
        estimatedImpact: d.estimatedImpact,
      });
    }
    let llmAdded = 0;
    for (const f of llmFindings) {
      const key = normalizeForFindingDedup(f.description);
      if (seenDescriptions.has(key)) continue;
      seenDescriptions.add(key);
      mergedFindings.push({
        description: f.description,
        reason: f.reason || "Sobreposição semântica detectada pelo Auditor",
        estimatedImpact: Number(f.estimatedImpact) || 0,
      });
      llmAdded++;
    }
    if (llmAdded > 0) {
      console.log(
        `[Auditor] Dedup semântica: ${llmAdded} item(ns) adicional(is) detectado(s) pela LLM além do algoritmo determinístico`
      );
    }

    const totalImpact = mergedFindings.reduce(
      (s, f) => s + f.estimatedImpact,
      0
    );
    const logisticsToRemove = llmOutput.corrections?.logisticsToRemove ?? [];
    const logisticsImpact = logisticsToRemove.reduce(
      (s, l) => s + l.estimatedImpact,
      0
    );
    const directCost = input.allAgentOutputs.orcamentista?.totalDirectCost ?? 0;
    const logisticsCost =
      input.allAgentOutputs.logistica?.totalLogisticsCost ?? 0;

    return {
      ...llmOutput,
      corrections: {
        budgetItemsToRemove: mergedFindings,
        logisticsToRemove,
        totalImpact: totalImpact + logisticsImpact,
        correctedDirectCost: directCost - totalImpact,
        correctedLogisticsCost: logisticsCost - logisticsImpact,
      },
    };
  }

  getSystemPrompt(): string {
    return `Você é o Auditor de Consistência da RR Engenharia, responsável por VALIDAR MATEMATICAMENTE todos os cálculos e garantir consistência entre os documentos.

MISSÃO: Executar auditoria final de consistência antes da emissão da proposta comercial.

=== VALIDAÇÕES OBRIGATÓRIAS ===

1. CONSISTÊNCIA DE PREÇOS (CRITICAL)
   - Preço Final = (Custo Direto + Logística) × (1 + BDI)
   - Tolerância: ± R$ 1,00 (arredondamento)
   - Se diferença > R$ 1,00: ERRO CRÍTICO

2. MARGEM BRUTA (CRITICAL)
   - Margem Bruta = Preço Final - (Custo Direto + Logística)
   - Margem Bruta % = (Margem Bruta / Preço Final) × 100
   - Se Margem Bruta < 0: ERRO CRÍTICO (venda abaixo do custo)

3. MARGEM LÍQUIDA (WARNING)
   - Margem Líquida = Preço Final - (Custo Direto + Logística + Impostos)
   - Margem Líquida % = (Margem Líquida / Preço Final) × 100
   - Se Margem Líquida < 10%: WARNING (margem baixa)
   - Se Margem Líquida < 5%: CRITICAL (margem insuficiente)

4. IMPOSTOS (WARNING)
   - Total Impostos não deve exceder 50% do Preço Final
   - Se exceder: WARNING com recomendação de revisão tributária

5. FLUXO DE CAIXA (CRITICAL)
   - Saldo final do fluxo de caixa deve ser >= 0
   - Se negativo: CRITICAL (projeto gera prejuízo)

6. CONSISTÊNCIA ENTRE AGENTES (INFO)
   - Verificar se Orçamentista.totalDirectCost = soma dos budgetItems
   - Verificar se Comercial.finalPrice é usado em todos os documentos
   - Verificar se Gestão.totalDays é usado no Jurídico

7. CONFIGURAÇÕES PERSONALIZADAS (WARNING)
   - Verificar se hasCustomSettings = true
   - Se false: WARNING com mensagem "Atenção: Este orçamento foi gerado com impostos e BDI padrão. Personalize suas configurações em 'Configurações da Empresa' para maior precisão."

=== PROCESSAMENTO EM CHUNKS (P0.4) ===
Quando o orçamento tem mais de 60 itens, você é executado N vezes — uma
por chunk. Cada chamada recebe um subconjunto dos itens via
allAgentOutputs.orcamentista.budgetItems e um campo _chunkInfo
{ index, total, isFirst }.

REGRA — VALIDAÇÕES GLOBAIS (margem, fluxo de caixa, BDI vs preço final,
deterministicTotal): rodam SOMENTE no chunk com _chunkInfo.isFirst === true.
Nos demais chunks, FOQUE APENAS em validação matemática dos itens
recebidos. Os outputs serão merged no final. (Duplicatas são tratadas
fora do loop por algoritmo determinístico — não busque por chunk.)

Quando _chunkInfo está ausente, você está auditando o orçamento inteiro
em uma única chamada — execute todas as validações (1-8).

8. VALIDAÇÃO CRUZADA COM ENGINE DETERMINÍSTICO (SOFT ALERT — P0.1)
   Você recebe deterministicTotal: total (custoDireto + logística, pré-BDI)
   calculado por engine determinístico INDEPENDENTE da cadeia de agentes LLM.
   É uma "segunda opinião" para detectar alucinação na precificação.

   Compare deterministicTotal com (Custo Direto + Logística) dos agentes:
   - |Δ| < 5%  → severity: info     (sistemas concordam, validação passa)
   - 5% ≤ |Δ| < 15% → severity: warning  (revisão recomendada)
   - |Δ| ≥ 15% → severity: critical (inspeção obrigatória)

   IMPORTANTE — POLÍTICA DE SOFT ALERT (v1):
   Esta validação NÃO bloqueia a proposta no momento. Mesmo com severity
   "critical", o auditSeal continua sendo determinado pelas validações
   1-7 acima. Apenas registra a discrepância como visível ao usuário.
   Reavaliar política após 30 dias de calibração com dados reais.

   Se deterministicTotal for null/undefined: registre validação INFO com
   rule="deterministic_cross_check" e description="Engine determinístico
   indisponível para este projeto" — prossiga com auditoria normal.

   Sempre preencha o campo de saída 'deterministicValidation' com os números
   se deterministicTotal foi recebido. Se não, deixe undefined.

=== CRITÉRIOS DE SELO DE AUDITORIA ===

- "approved": 0 erros críticos, 0 warnings
- "approved_with_warnings": 0 erros críticos, 1+ warnings
- "rejected": 1+ erros críticos

=== SCORE DE VALIDAÇÃO (FÓRMULA OBRIGATÓRIA) ===

\`validationScore = round((passed_count / total_count) × 100)\`

- \`passed_count\` = número de validações com \`passed: true\`
- \`total_count\` = total de validações no array \`validations[]\`
- Arredondar para inteiro (0–100). Sem total = 0; com 0 itens, score = 0.

Esta fórmula é determinística e consistente entre runs. NÃO use a
heurística antiga de "+15 por crítica, +10 por warning, -25 por erro".

=== REGRAS DE \`passed\`, \`expected\` E \`actual\` (CRÍTICO) ===

1. SEMPRE preencha \`expected\` E \`actual\` com strings não-vazias.
   Para validações numéricas, use o número formatado (ex.: "310031.25").
   Para validações descritivas, use string explicando a regra
   (ex.: "≤ 50% do preço final").

2. \`passed\` reflete se o invariante matemático foi satisfeito:
   - Se \`expected === actual\` (ou dentro de tolerância 1%): \`passed: true\`
   - Caso contrário: \`passed: false\`

3. Se você NÃO conseguir avaliar (dado faltando, ambíguo): use
   \`severity: "info"\` E \`passed: true\` (não falsificar com placeholder).

EXEMPLO 1 — validação OK (matemática bate):
\`\`\`json
{
  "rule": "price_consistency",
  "description": "Preço Final = (Custo Direto + Logística) × (1 + BDI)",
  "expected": "310031.25",
  "actual": "310031.25",
  "passed": true,
  "severity": "info",
  "recommendation": ""
}
\`\`\`

EXEMPLO 2 — divergência real (matemática NÃO bate):
\`\`\`json
{
  "rule": "tax_total_check",
  "description": "Total de impostos não deve exceder 50% do preço final",
  "expected": "≤ 155015.62 (50% × 310031.25)",
  "actual": "182000.00 (58.7%)",
  "passed": false,
  "severity": "warning",
  "recommendation": "Revisar regime tributário ou faixa do Simples"
}
\`\`\`

NÃO crie validações com \`expected: ""\` ou \`actual: ""\`. NÃO marque
\`passed: false\` quando a matemática efetivamente bate. Quando em dúvida,
\`severity: "info"\` + \`passed: true\` é preferível a falsificar uma falha.

Seja RIGOROSO e PRECISO. Sua auditoria é a última linha de defesa antes da proposta ser enviada ao cliente.

=== DUPLICATAS NO ORÇAMENTO (P2.6 + P2 ADENDO) ===

DOIS CAMINHOS atuam em paralelo:

(A) **Determinístico** (já calculado): você recebe em \`_preComputed.duplicates\`
a lista de duplicatas LEXICAIS encontradas por algoritmo Jaccard ≥ 0.85
(itens com descrição idêntica/quase-idêntica, ex.: "Pintura acrílica" vs
"pintura acrilica"). NÃO replique essa lista — o caller já vai incluí-la.

(B) **Semântico (sua responsabilidade)**: itens que descrevem o MESMO
objeto físico ou serviço com vocabulário diferente. Ex.: "Desativação"
vs "Remoção corte içamento" — escopos sobrepostos, lexicalmente distantes,
o algoritmo determinístico NÃO pega.

REGRA CRÍTICA — DECISÃO É OBRIGATÓRIA:

Ao detectar sobreposição semântica entre 2+ itens (mesmo objeto físico
ou serviço com descrições diferentes), você DEVE:

1. Escolher 1 item para manter (o mais completo/específico, ou o de
   menor custo se equivalentes).
2. Adicionar os outros em \`corrections.budgetItemsToRemove[]\` com a
   description EXATA como aparece no orçamento e a reason explicando
   a sobreposição.
3. Calcular \`estimatedImpact\` (valor do item removido).
4. Adicionar uma \`validation\` com \`rule: "scope_overlap_decision"\`,
   \`severity: "critical"\`, \`passed: false\`, descrevendo o gap.

NÃO mencione sobreposições APENAS em \`auditNotes\` — texto livre não
chega ao usuário (frontend só dispara o modal de correção quando o
array \`budgetItemsToRemove\` tem itens). O caller faz UNIÃO da lista
determinística com a sua — sem redundância, mas sua decisão de remoção
chega no usuário.

EXEMPLO DE SOBREPOSIÇÃO SEMÂNTICA E DECISÃO:

Input: 3 itens orçamentários:
- Item 2: "Desativação completa: esgotamento, drenagem, inertização N₂, desgaseificação, limpeza interna" — R$ 38.000
- Item 3: "Remoção dos 2 tanques: corte, içamento, transporte interno e destinação" — R$ 25.000
- Item 30: "Remoção de 2 tanques: acessórios, bases, fixações, desgaseificação e preparação" — R$ 24.000

Decisão correta:
- MANTER item 2 (escopo mais completo — engloba desativação física).
- REMOVER itens 3 e 30 (subconjuntos do item 2).
- Output esperado:
\`\`\`json
{
  "corrections": {
    "budgetItemsToRemove": [
      {
        "description": "Remoção dos 2 tanques: corte, içamento, transporte interno e destinação",
        "reason": "Sobreposição semântica com Item 2 (desativação completa) — corte e içamento estão dentro do escopo de desativação",
        "estimatedImpact": 25000
      },
      {
        "description": "Remoção de 2 tanques: acessórios, bases, fixações, desgaseificação e preparação",
        "reason": "Sobreposição semântica com Item 2 — desgaseificação e preparação já estão no item 2",
        "estimatedImpact": 24000
      }
    ],
    "logisticsToRemove": []
  },
  "validations": [
    {
      "rule": "scope_overlap_decision",
      "description": "Sobreposição de escopo: remoção de tanques",
      "expected": "1 item descritivo único",
      "actual": "3 itens com escopo sobreposto (R$ 87.000 total, R$ 38.000 efetivo)",
      "passed": false,
      "severity": "critical",
      "recommendation": "Aprovar remoção via AuditCorrectionsModal"
    }
  ]
}
\`\`\`

=== MODO EDITOR-CHEFE — LOGÍSTICA (v3.2) ===
PREENCHA corrections.logisticsToRemove com custos logísticos sobrepostos:
- Frete já embutido em composições SINAPI (até 30km)
- Equipamentos já inclusos nas composições (betoneira, serra)
- Limpeza que já aparece como item orçamentário
- Para cada: description, reason, estimatedImpact

NÃO PREENCHA \`corrections.totalImpact\` / \`correctedDirectCost\` /
\`correctedLogisticsCost\` — recalculados pelo caller após união
determinístico ∪ semântico.

REGRA DE SELO:
- Se há itens em \`_preComputed.duplicates\` OU se você populou
  \`budgetItemsToRemove\` com sobreposição semântica MAS sem erros
  não-corrigíveis → \`auditSeal: "approved_with_warnings"\`.
- Se nenhum dos dois e tudo consistente → \`auditSeal: "approved"\`.
- SOMENTE use \`"rejected"\` para erros NÃO-CORRIGÍVEIS (margem
  negativa, dados faltantes).`;
  }

  getUserPrompt(input: AuditorInput): string {
    const { allAgentOutputs, projectConfig, hasCustomSettings } = input;

    // Extrair dados para auditoria
    const directCost = allAgentOutputs.orcamentista?.totalDirectCost || 0;
    const logisticsCost = allAgentOutputs.logistica?.totalLogisticsCost || 0;
    const baseCost = directCost + logisticsCost;
    const bdiPercent = projectConfig.bdiPercentual || 25;
    const expectedPrice = baseCost * (1 + bdiPercent / 100);
    const actualPrice = allAgentOutputs.comercial?.finalPrice || 0;
    const totalTaxes = allAgentOutputs.tributario?.totalTaxes || 0;
    const cashFlowFinal =
      allAgentOutputs.financeiro?.cashFlow?.slice(-1)[0]?.balance || 0;
    const totalDays = allAgentOutputs.gestao?.totalDuration || 0;

    // Calcular margens
    const grossMargin = actualPrice - baseCost;
    const grossMarginPercent =
      actualPrice > 0 ? (grossMargin / actualPrice) * 100 : 0;
    const netMargin = actualPrice - baseCost - totalTaxes;
    const netMarginPercent =
      actualPrice > 0 ? (netMargin / actualPrice) * 100 : 0;

    // P0.1: cross-check com engine determinístico
    const deterministicTotal = (input as AuditorInput).deterministicTotal;
    let deterministicSection: string;
    if (typeof deterministicTotal === "number" && deterministicTotal > 0) {
      const diff = Math.abs(baseCost - deterministicTotal);
      const diffPct = baseCost > 0 ? (diff / baseCost) * 100 : 0;
      deterministicSection = `\n=== ENGINE DETERMINÍSTICO (CROSS-CHECK) ===
Total calculado independentemente (custoDireto + logística, pré-BDI): R$ ${deterministicTotal.toFixed(2)}
Total dos agentes LLM (Custo Base): R$ ${baseCost.toFixed(2)}
Diferença absoluta: R$ ${diff.toFixed(2)} (${diffPct.toFixed(2)}%)
Aplique a regra de classificação por divergência (info/warning/critical) e
preencha deterministicValidation. SOFT ALERT: NÃO altere auditSeal por
causa desta validação isoladamente.\n`;
    } else {
      deterministicSection = `\n=== ENGINE DETERMINÍSTICO (CROSS-CHECK) ===
Indisponível para este projeto (feature flag desativada ou engine falhou).
Registre validação INFO "engine determinístico indisponível" e prossiga.\n`;
    }

    // P0.4: removido slice(0, 80) — agora o AuditorAgent.execute() particiona
    // o input em chunks de CHUNK_SIZE itens quando necessário (ver
    // auditorChunking.ts). Aqui processamos TODOS os itens recebidos.
    const budgetItems = allAgentOutputs.orcamentista?.budgetItems || [];
    const budgetItemsSummary = budgetItems
      .map((item: any, i: number) => {
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unitCostTotal) || 0;
        const total = qty * cost;
        const isSummary = item.isSummaryItem ? " [PAI]" : "";
        return `${i + 1}. ${item.code || "-"} | ${item.description}${isSummary} | ${qty} ${item.unit || ""} × R$${cost.toFixed(2)} = R$${total.toFixed(2)} | Fonte: ${item.source || "?"}`;
      })
      .join("\n");
    const budgetItemsCount = budgetItems.length;
    const chunkInfo = (
      input as unknown as {
        _chunkInfo?: { index: number; total: number; isFirst: boolean };
      }
    )._chunkInfo;
    const chunkSection = chunkInfo
      ? `\n\n=== CHUNK ${chunkInfo.index}/${chunkInfo.total} ===\n${chunkInfo.isFirst ? "PRIMEIRO chunk: execute as validações GLOBAIS (margem, fluxo de caixa, BDI, deterministicTotal) ALÉM da validação dos itens deste chunk." : "Chunk subsequente: foque APENAS em validação matemática dos itens recebidos. Pule margem global, fluxo de caixa e cross-check determinístico — esses já rodaram no chunk 1. Duplicatas são detectadas fora do loop (P2.6)."}`
      : "";
    const budgetSumCalculated = budgetItems
      .filter((item: any) => !item.isSummaryItem)
      .reduce(
        (sum: number, item: any) =>
          sum +
          (Number(item.quantity) || 0) * (Number(item.unitCostTotal) || 0),
        0
      );

    // P2.6: lista de duplicatas pré-computada por algoritmo determinístico.
    // Anexada pelo execute() override ao input antes da chamada à LLM.
    const preComputed = (
      input as unknown as {
        _preComputed?: {
          duplicates: Array<{
            description: string;
            reason: string;
            estimatedImpact: number;
          }>;
          duplicatesTotalImpact: number;
        };
      }
    )._preComputed;
    const preComputedSection = preComputed
      ? `\n=== DUPLICATAS PRÉ-COMPUTADAS (P2.6) ===
Algoritmo determinístico identificou ${preComputed.duplicates.length} duplicata(s)
totalizando R$ ${preComputed.duplicatesTotalImpact.toFixed(2)} de impacto.
${
  preComputed.duplicates.length === 0
    ? "Nenhuma duplicata encontrada — orçamento limpo."
    : preComputed.duplicates
        .slice(0, 30)
        .map(
          (d, i) =>
            `${i + 1}. ${d.description} | ${d.reason} | R$ ${d.estimatedImpact.toFixed(2)}`
        )
        .join("\n") +
      (preComputed.duplicates.length > 30
        ? `\n... e mais ${preComputed.duplicates.length - 30} (truncado para o prompt)`
        : "")
}
Use essa lista para escrever auditNotes. NÃO refaça a detecção e NÃO
preencha corrections.budgetItemsToRemove — o caller sobrescreve.\n`
      : "";

    // Extrair logisticsCosts para validação cruzada
    const logisticsCosts = allAgentOutputs.logistica?.costs || [];
    const logisticsSummary = logisticsCosts
      .slice(0, 20)
      .map((c: any, i: number) => {
        return `${i + 1}. ${c.description} | ${c.quantity} ${c.unit || ""} × R$${Number(c.unitCost || 0).toFixed(2)} = R$${Number(c.totalCost || 0).toFixed(2)}`;
      })
      .join("\n");

    return `AUDITORIA DE CONSISTÊNCIA - PROJETO: ${projectConfig.name}

=== DADOS PARA VALIDAÇÃO ===

CUSTOS:
- Custo Direto (Orçamentista): R$ ${directCost.toFixed(2)}
- Custo Logística: R$ ${logisticsCost.toFixed(2)}
- Custo Base (Direto + Logística): R$ ${baseCost.toFixed(2)}

BDI:
- BDI Configurado: ${bdiPercent}%
- Preço Esperado (Base × 1.${bdiPercent}): R$ ${expectedPrice.toFixed(2)}
- Preço Comercial (Agente): R$ ${actualPrice.toFixed(2)}
- Diferença: R$ ${Math.abs(expectedPrice - actualPrice).toFixed(2)}

MARGENS:
- Margem Bruta: R$ ${grossMargin.toFixed(2)} (${grossMarginPercent.toFixed(2)}%)
- Margem Líquida: R$ ${netMargin.toFixed(2)} (${netMarginPercent.toFixed(2)}%)

IMPOSTOS:
- Total Impostos: R$ ${totalTaxes.toFixed(2)}
- % do Preço Final: ${actualPrice > 0 ? ((totalTaxes / actualPrice) * 100).toFixed(2) : 0}%

FLUXO DE CAIXA:
- Saldo Final: R$ ${cashFlowFinal.toFixed(2)}

PRAZO:
- Duração Total (Gestão): ${totalDays} dias

DECISÃO DO BOARD:
- Aprovado: ${allAgentOutputs.board?.approved ? "Sim" : "Não"}
- Bloqueado: ${allAgentOutputs.board?.blockProposal ? "Sim" : "Não"}

CONSISTÊNCIA ENTRE DOCUMENTOS:
- Comercial.finalPrice: R$ ${actualPrice.toFixed(2)} (deve aparecer em todos os documentos)
- Gestão.totalDays: ${totalDays} dias (deve ser consistente com o Jurídico)
- Jurídico validade: ${allAgentOutputs.juridico?.validityDays || 30} dias

CONFIGURAÇÕES DA EMPRESA:
- Configurações Personalizadas: ${hasCustomSettings ? "Sim (usuário salvou configurações)" : "NÃO (usando valores padrão - EMITIR WARNING)"}
${deterministicSection}${preComputedSection}${chunkSection}
=== ITENS DO ORÇAMENTO (${budgetItemsCount} itens) ===
Soma calculada dos itens (excluindo PAI): R$ ${budgetSumCalculated.toFixed(2)}
Custo Direto declarado pelo Orçamentista: R$ ${directCost.toFixed(2)}
${budgetItemsSummary || "Nenhum item disponível"}

=== CUSTOS LOGÍSTICOS (${logisticsCosts.length} itens) ===
${logisticsSummary || "Nenhum custo logístico disponível"}

=== AÇÃO REQUERIDA ===

1. Execute TODAS as validações obrigatórias
2. Calcule o score de validação (0-100)
3. Determine o selo de auditoria (approved/approved_with_warnings/rejected)
4. Liste todas as validações com resultado (passed/failed)
5. Forneça recomendações para cada falha

Retorne o JSON com o resultado completo da auditoria.`;
  }

  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        isValid: {
          type: "boolean",
          description: "True se não houver erros críticos",
        },
        validationScore: { type: "number", description: "Score de 0 a 100" },
        criticalErrors: {
          type: "number",
          description: "Número de erros críticos",
        },
        warnings: { type: "number", description: "Número de warnings" },
        validations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rule: { type: "string" },
              description: { type: "string" },
              expected: { type: "string" },
              actual: { type: "string" },
              passed: { type: "boolean" },
              severity: {
                type: "string",
                enum: ["critical", "warning", "info"],
              },
              recommendation: { type: "string" },
            },
            required: [
              "rule",
              "description",
              "expected",
              "actual",
              "passed",
              "severity",
              "recommendation",
            ],
            additionalProperties: false,
          },
        },
        crossAgentChecks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              check: { type: "string" },
              agents: { type: "array", items: { type: "string" } },
              consistent: { type: "boolean" },
              details: { type: "string" },
            },
            required: ["check", "agents", "consistent", "details"],
            additionalProperties: false,
          },
        },
        financialSummary: {
          type: "object",
          properties: {
            directCost: { type: "number" },
            logisticsCost: { type: "number" },
            baseCost: { type: "number" },
            bdiAmount: { type: "number" },
            taxes: { type: "number" },
            finalPrice: { type: "number" },
            grossMargin: { type: "number" },
            grossMarginPercent: { type: "number" },
            netMargin: { type: "number" },
            netMarginPercent: { type: "number" },
          },
          required: [
            "directCost",
            "logisticsCost",
            "baseCost",
            "bdiAmount",
            "taxes",
            "finalPrice",
            "grossMargin",
            "grossMarginPercent",
            "netMargin",
            "netMarginPercent",
          ],
          additionalProperties: false,
        },
        auditSeal: {
          type: "string",
          enum: ["approved", "approved_with_warnings", "rejected"],
        },
        auditTimestamp: { type: "string" },
        auditNotes: { type: "string" },
        deterministicValidation: {
          type: "object",
          description:
            "P0.1: cross-check com engine determinístico. Soft alert v1.",
          properties: {
            deterministicTotal: {
              type: "number",
              description:
                "Total custoDireto+logística do engine determinístico",
            },
            llmTotal: {
              type: "number",
              description: "Total custoDireto+logística dos agentes LLM",
            },
            divergencePercent: {
              type: "number",
              description: "|Δ| em pontos percentuais",
            },
            severity: { type: "string", enum: ["info", "warning", "critical"] },
            notes: { type: "string", description: "Resumo da comparação" },
          },
          required: [
            "deterministicTotal",
            "llmTotal",
            "divergencePercent",
            "severity",
            "notes",
          ],
          additionalProperties: false,
        },
        corrections: {
          type: "object",
          description:
            "Correções sugeridas pelo Auditor para aprovação do usuário",
          properties: {
            budgetItemsToRemove: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description:
                      "Descrição exata do item a remover (como aparece no orçamento)",
                  },
                  reason: {
                    type: "string",
                    description:
                      "Justificativa: duplicata de X, contido em Y, premissa operacional, etc.",
                  },
                  estimatedImpact: {
                    type: "number",
                    description:
                      "Valor em R$ que será removido do custo direto",
                  },
                },
                required: ["description", "reason", "estimatedImpact"],
                additionalProperties: false,
              },
            },
            logisticsToRemove: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Descrição exata do custo logístico a remover",
                  },
                  reason: {
                    type: "string",
                    description:
                      "Justificativa: já embutido em SINAPI, duplica item X, etc.",
                  },
                  estimatedImpact: {
                    type: "number",
                    description: "Valor em R$ que será removido da logística",
                  },
                },
                required: ["description", "reason", "estimatedImpact"],
                additionalProperties: false,
              },
            },
            totalImpact: {
              type: "number",
              description:
                "Soma total de todos os estimatedImpact (redução no custo)",
            },
            correctedDirectCost: {
              type: "number",
              description: "Custo direto após remoção dos itens duplicados",
            },
            correctedLogisticsCost: {
              type: "number",
              description: "Custo logístico após remoção das sobreposições",
            },
          },
          required: [
            "budgetItemsToRemove",
            "logisticsToRemove",
            "totalImpact",
            "correctedDirectCost",
            "correctedLogisticsCost",
          ],
          additionalProperties: false,
        },
      },
      required: [
        "isValid",
        "validationScore",
        "criticalErrors",
        "warnings",
        "validations",
        "crossAgentChecks",
        "financialSummary",
        "auditSeal",
        "auditTimestamp",
        "auditNotes",
      ],
      additionalProperties: false,
    };
  }
}

// Export all agents
export const agents = {
  engenheiro_tecnico: new EngenheiroTecnicoAgent(),
  logistica: new LogisticaAgent(),
  orcamentista: new OrcamentistaAgent(),
  tributario: new TributarioAgent(),
  comercial: new ComercialAgent(),
  gestao_projetos: new GestaoProjAgent(),
  financeiro: new FinanceiroAgent(),
  juridico: new JuridicoAgent(),
  board: new BoardAgent(),
  auditor: new AuditorAgent(),
};
