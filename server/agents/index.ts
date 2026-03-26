import { invokeLLM } from "../_core/llm";
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
    const typedResponse = response as { choices?: Array<{ message?: { content?: unknown } }> };
    
    if (!typedResponse?.choices || !Array.isArray(typedResponse.choices) || typedResponse.choices.length === 0) {
      console.error(`[Agent ${this.name}] Invalid response structure:`, JSON.stringify(response).substring(0, 500));
      throw new Error(`Agent ${this.name} returned invalid response structure`);
    }
    
    const choice = typedResponse.choices[0];
    
    if (!choice?.message) {
      console.error(`[Agent ${this.name}] Empty choice:`, JSON.stringify(choice));
      throw new Error(`Agent ${this.name} returned empty choice`);
    }
    
    // Extrai conteúdo da mensagem
    let content = choice.message.content;
    const messageAny = choice.message as Record<string, unknown>;
    
    console.log(`[Agent ${this.name}] Message keys:`, Object.keys(choice.message));
    
    // Cenário 1: Conteúdo é array multimodal
    if (Array.isArray(content)) {
      console.log(`[Agent ${this.name}] Content is array, extracting text part...`);
      const textPart = content.find((part) => part.type === 'text') as { type: 'text'; text: string } | undefined;
      content = textPart?.text || '';
    }
    
    // Cenário 2: Conteúdo vazio, tentar reasoning_content
    if ((!content || content === '') && messageAny.reasoning_content) {
      console.log(`[Agent ${this.name}] Content empty, checking reasoning_content...`);
      const reasoningContent = messageAny.reasoning_content as string;
      const jsonMatch = reasoningContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }
    
    // Validação final do conteúdo
    if (!content || typeof content !== 'string') {
      console.error(`[Agent ${this.name}] Invalid content:`, content);
      console.error(`[Agent ${this.name}] Full message:`, JSON.stringify(choice.message).substring(0, 1000));
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
        if (attempt < maxAttempts && statusCode && statusCode >= 500 && statusCode < 600) {
          const waitTime = backoffs[attempt - 1];
          console.warn(`[Agent ${this.name}] Attempt ${attempt} failed with status ${statusCode}. Retrying in ${waitTime}ms...`);
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
    
    // Etapa 1: Chamar a LLM com modelo específico do agente
    let response;
    try {
      const preferredModel = this.getPreferredModel();
      console.log(`[Agent ${this.name}] Using model: ${preferredModel}`);

      // strict: true é exclusivo do OpenAI; Gemini/Claude não suportam
      const { supportsStrictSchema } = await import("../_core/llm-providers").then(m => ({
        supportsStrictSchema: m.supportsStrictSchema(preferredModel)
      }));

      response = await invokeLLM({
        model: preferredModel,
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
      });
    } catch (llmError) {
      console.error(`[Agent ${this.name}] LLM call failed:`, llmError);
      throw llmError;
    }
    
    // Etapa 2: Detectar truncamento via finish_reason
    const finishReason = response.choices?.[0]?.finish_reason;
    if (finishReason === "max_tokens" || finishReason === "length") {
      console.error(`[Agent ${this.name}] Response truncated! finish_reason: ${finishReason}`);
      throw new Error(
        `Agent ${this.name} response was truncated (finish_reason: ${finishReason}). ` +
        `The output exceeded the token limit. Consider simplifying the input or increasing maxOutputTokens.`
      );
    }
    
    // Etapa 3: Processar resposta (lógica extraída para método privado)
    const content = this._processLLMResponse(response);
    console.log(`[Agent ${this.name}] Content preview:`, content.substring(0, 200));
    
    // Etapa 4: Parse do JSON
    try {
      const parsed = JSON.parse(content) as TOutput;
      console.log(`[Agent ${this.name}] Successfully parsed output`);
      return parsed;
    } catch (parseError) {
      console.error(`[Agent ${this.name}] JSON parse error:`, parseError);
      
      // Detectar JSON truncado via estrutura
      const trimmed = content.trim();
      const isLikelyTruncated = 
        (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && !trimmed.endsWith(']'));
      
      if (isLikelyTruncated) {
        throw new Error(
          `Agent ${this.name} response was truncated mid-JSON. ` +
          `The output exceeded the token limit. Consider simplifying the input.`
        );
      }
      
      throw new Error(`Agent ${this.name} returned invalid JSON: ${content.substring(0, 200)}...`);
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
export class EngenheiroTecnicoAgent extends BaseAgent<EngenheiroTecnicoInput, EngenheiroTecnicoOutput> {
  name = AGENT_NAMES.engenheiro_tecnico;
  type: AgentType = "engenheiro_tecnico";
  getPreferredModel() { return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6"; }

  getSystemPrompt(): string {
    return `Você é o Engenheiro Técnico da RR Engenharia, responsável por auditar e traduzir Memoriais Descritivos em tarefas de engenharia específicas.

MISSÃO: Transformar descrições genéricas em especificações técnicas baseadas em NBRs.

⚠️ REGRA CRÍTICA DE INTERATIVIDADE (v2.1):
Se o memorial for VAGO ou INCOMPLETO (ex: "pintar parede" sem área, "instalar piso" sem metragem),
você DEVE identificar as informações faltantes e solicitar ao usuário.

CRITÉRIOS PARA SOLICITAR INFORMAÇÕES:
1. Serviços de área (pintura, piso, forro) sem metragem em m²
2. Serviços lineares (rodapé, tubulação) sem metragem em m
3. Itens unitários (portas, janelas, pontos elétricos) sem quantidade
4. Especificações técnicas críticas ausentes (tipo de material, acabamento)

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
Você DEVE processar TODOS os grupos de serviços e TODOS os itens do memorial.
NÃO interrompa a leitura antes de processar o documento completo.
NÃO omita nenhum grupo, mesmo que pareça repetitivo ou similar.

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
- Carpinteiro: 1.2 Hh/m² (formas de madeira)`;
  }
  
  getUserPrompt(input: EngenheiroTecnicoInput): string {
    // Se há respostas do usuário, incluir no prompt
    const userResponsesSection = input.userResponses && Object.keys(input.userResponses).length > 0
      ? `\n\nDADOS COMPLEMENTARES FORNECIDOS PELO USUÁRIO:\n${Object.entries(input.userResponses)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')}\n\nUse esses dados para completar a análise. Se ainda faltar informação, solicite novamente.`
      : '';

    return `Analise o seguinte Memorial Descritivo e extraia TODOS os itens de engenharia.

⚠️ IMPORTANTE: Você DEVE processar o documento COMPLETO, do início ao fim.
NÃO interrompa a leitura. NÃO omita nenhum grupo de serviços.

⚠️ INTERATIVIDADE: Se o memorial for vago (ex: "pintar sala" sem área),
você DEVE solicitar as informações faltantes via missingInfoRequests.

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
- items: lista de itens (só preencher completamente se analysisStatus = "completed")
- pendingItems: lista de itens que precisam de vistoria
- nbrReferences: lista de normas ABNT aplicáveis
- criticalNotes: observações críticas sobre o memorial
- groupsProcessed: lista dos grupos processados
- totalItemsExtracted: número total de itens extraídos`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        analysisStatus: {
          type: "string",
          enum: ["completed", "waiting_for_user_input"],
          description: "Status da análise: completed se dados suficientes, waiting_for_user_input se faltam dados"
        },
        missingInfoRequests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fieldId: { type: "string", description: "ID único para o campo, ex: area_pintura_sala" },
              question: { type: "string", description: "Pergunta clara para o usuário" },
              type: { type: "string", enum: ["number", "text", "select", "textarea"], description: "Tipo de input" },
              unit: { type: "string", description: "Unidade de medida, ex: m²" },
              options: { type: "array", items: { type: "string" }, description: "Opções para select" },
              hint: { type: "string", description: "Dica para ajudar o usuário" },
              required: { type: "boolean", description: "Se o campo é obrigatório (padrão: true)" },
              allowZero: { type: "boolean", description: "Se permite valor 0 para campos numéricos (padrão: true)" },
            },
            required: ["fieldId", "question", "type"],
            additionalProperties: false,
          },
          description: "Lista de informações faltantes a solicitar ao usuário"
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
              isSummaryItem: { type: "boolean", description: "Se é item resumo/pai (NÃO somar no total, pois é soma dos filhos)" },
              parentGroupNumber: { type: "string", description: "Número do grupo pai (se for item filho)" },
            },
            required: ["group", "itemNumber", "description", "quantity", "unit", "specifications", "nbrReference", "isPendingVistoria"],
            additionalProperties: false,
          },
        },
        pendingItems: { type: "array", items: { type: "string" } },
        nbrReferences: { type: "array", items: { type: "string" } },
        criticalNotes: { type: "array", items: { type: "string" } },
        groupsProcessed: { type: "array", items: { type: "string" } },
        totalItemsExtracted: { type: "number" },
      },
      required: ["analysisStatus", "missingInfoRequests", "items", "pendingItems", "nbrReferences", "criticalNotes", "groupsProcessed", "totalItemsExtracted"],
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
    
    if (m.includes('pint') || m.includes('parede') || m.includes('tinta')) {
      questions.push({ fieldId: 'area_pintura', question: 'Qual a área total das paredes a serem pintadas?', type: 'number', unit: 'm²', hint: 'Some a área de todas as paredes', required: true });
      questions.push({ fieldId: 'tipo_tinta', question: 'Qual o tipo de tinta desejado?', type: 'select', options: ['Acrílica fosca', 'Acrílica acetinada', 'Latex PVA', 'Esmalte sintético'], required: true });
      questions.push({ fieldId: 'num_demaos', question: 'Quantas demãos de tinta?', type: 'select', options: ['2 demãos', '3 demãos'], required: true });
    } else if (m.includes('piso') || m.includes('cerâmica') || m.includes('porcelanato')) {
      questions.push({ fieldId: 'area_piso', question: 'Qual a área total do piso?', type: 'number', unit: 'm²', required: true });
      questions.push({ fieldId: 'tipo_piso', question: 'Qual o tipo de piso?', type: 'select', options: ['Cerâmica', 'Porcelanato', 'Laminado', 'Vinílico'], required: true });
    } else if (m.includes('elétric') || m.includes('tomada') || m.includes('ponto')) {
      questions.push({ fieldId: 'num_pontos', question: 'Quantos pontos elétricos?', type: 'number', unit: 'pontos', required: true });
      questions.push({ fieldId: 'tipo_instalacao', question: 'Tipo de instalação?', type: 'select', options: ['Embutida', 'Aparente', 'Mista'], required: true });
    } else {
      questions.push({ fieldId: 'area_servico', question: 'Qual a área ou quantidade do serviço?', type: 'text', hint: 'Informe em m², metros lineares ou unidades', required: true });
      questions.push({ fieldId: 'detalhes_servico', question: 'Descreva com mais detalhes o serviço', type: 'textarea', hint: 'Inclua especificações de material, acabamento, etc.', required: true });
    }
    return questions;
  }
  
  /**
   * Override do execute com estratégia dupla: PRÉ-LLM e PÓS-LLM.
   */
  async execute(input: EngenheiroTecnicoInput): Promise<EngenheiroTecnicoOutput> {
    const memorial = input.memorialDescritivo;
    const temRespostasUsuario = input.userResponses && Object.keys(input.userResponses).length > 0;
    
    console.log(`[EngenheiroTecnico] Memorial length: ${memorial.length}, temRespostas: ${temRespostasUsuario}`);
    
    // ESTRATÉGIA PRÉ-LLM: Se memorial vago e sem respostas, retornar direto
    if (this._isMemorialVago(memorial) && !temRespostasUsuario) {
      console.log(`[EngenheiroTecnico] MEMORIAL VAGO - Retornando perguntas sem chamar LLM`);
      return {
        analysisStatus: 'waiting_for_user_input',
        missingInfoRequests: this._generateQuestionsForService(memorial),
        items: [],
        pendingItems: [],
        nbrReferences: [],
        criticalNotes: ['Memorial incompleto - aguardando dados do usuário'],
        groupsProcessed: [],
        totalItemsExtracted: 0
      };
    }
    
    // Verificar se precisa de chunking (memoriais grandes)
    const { needsChunking, createChunkedInputs, mergeEngenheiroOutputs } = await import("./chunking");
    
    if (needsChunking(memorial)) {
      console.log(`[EngenheiroTecnico] Memorial grande detectado - usando chunking`);
      const chunkedInputs = createChunkedInputs(input);
      console.log(`[EngenheiroTecnico] Dividido em ${chunkedInputs.length} chunks`);
      
      const outputs: EngenheiroTecnicoOutput[] = [];
      for (let i = 0; i < chunkedInputs.length; i++) {
        console.log(`[EngenheiroTecnico] Processando chunk ${i + 1}/${chunkedInputs.length}...`);
        const chunkOutput = await super.execute(chunkedInputs[i]);
        outputs.push(chunkOutput);
      }
      
      const merged = mergeEngenheiroOutputs(outputs);
      console.log(`[EngenheiroTecnico] Chunks merged: ${merged.items?.length || 0} items`);
      return merged;
    }
    
    // Chamar LLM (memorial cabe em uma chamada)
    console.log(`[EngenheiroTecnico] Chamando LLM...`);
    const output = await super.execute(input);
    
    console.log(`[EngenheiroTecnico] Output items: ${output.items?.length || 0}`);
    console.log(`[EngenheiroTecnico] analysisStatus: ${output.analysisStatus}`);
    
    // ESTRATÉGIA PÓS-LLM: Se LLM retornou items=0 e não solicitou info, forçar
    const llmFalhou = 
      (output.items?.length === 0) && 
      (output.missingInfoRequests?.length === 0) &&
      !temRespostasUsuario;
    
    if (llmFalhou) {
      console.log(`[EngenheiroTecnico] LLM NÃO GEROU ITEMS - Forçando interatividade`);
      return {
        ...output,
        analysisStatus: 'waiting_for_user_input',
        missingInfoRequests: this._generateQuestionsForService(memorial),
        items: [],
        pendingItems: [],
        criticalNotes: ['Memorial incompleto - aguardando dados do usuário']
      };
    }
    
    return output;
  }
}

// Agent 2: Logística e Mobilização
export class LogisticaAgent extends BaseAgent<LogisticaInput, LogisticaOutput> {
  name = AGENT_NAMES.logistica;
  type: AgentType = "logistica";
  
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
- Separe itens OPCIONAIS no array "optionalItems" com justificativa`;
  }
  
  getUserPrompt(input: LogisticaInput): string {
    // Resumo dos itens orçados para ajudar a estimar prazo
    const budgetSummary = input.budgetItems && input.budgetItems.length > 0
      ? `\nITENS ORÇADOS (resumo):\n${input.budgetItems.slice(0, 15).map((b: any) => `- ${b.description}: ${b.quantity} ${b.unit}`).join('\n')}${input.budgetItems.length > 15 ? `\n... e mais ${input.budgetItems.length - 15} itens` : ''}`
      : '';
    
    return `Analise os itens da obra e calcule os custos logísticos:

ITENS DA OBRA:
${JSON.stringify(input.items, null, 2)}
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
            required: ["category", "description", "quantity", "unit", "unitCost", "totalCost"],
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
            required: ["category", "description", "quantity", "unit", "unitCost", "totalCost", "reason"],
            additionalProperties: false,
          },
        },
        totalLogisticsCost: { type: "number" },
        totalOptionalCost: { type: "number" },
        restrictions: { type: "array", items: { type: "string" } },
      },
      required: ["costs", "optionalItems", "totalLogisticsCost", "totalOptionalCost", "restrictions"],
      additionalProperties: false,
    };
  }
}

// Agent 3: Orçamentista & Suprimentos
export class OrcamentistaAgent extends BaseAgent<OrcamentistaInput, OrcamentistaOutput> {
  name = AGENT_NAMES.orcamentista;
  type: AgentType = "orcamentista";
  getPreferredModel() { return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6"; }

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
NÃO precifique itens PAI - eles são apenas soma dos filhos.
Precifique APENAS itens com isSummaryItem=false ou não definido.
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
      const { SINAPI_DB } = require("../services/sinapi") as { SINAPI_DB: Array<{ code: string; description: string; unit: string; price: number; category: string }> };
      const { PINI_DATABASE } = require("../services/pini") as { PINI_DATABASE: Array<{ code: string; description: string; unit: string; price: number }> };

      const normalizeText = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();

      const anchors: Array<{ description: string; source: string; code: string; price: number; unit: string; estValue: number }> = [];

      for (const item of items) {
        if (item.isSummaryItem) continue;
        const descNorm = normalizeText(item.description || '');
        const keywords = descNorm.split(/\s+/).filter((k: string) => k.length > 2);
        if (keywords.length === 0) continue;

        // Search SINAPI first
        let bestMatch: { code: string; description: string; price: number; unit: string; source: string } | null = null;
        let bestScore = 0;

        for (const comp of SINAPI_DB) {
          if (comp.unit === 'H') continue;
          const compNorm = normalizeText(comp.description);
          let matched = 0;
          for (const kw of keywords) { if (compNorm.includes(kw)) matched++; }
          const score = matched / keywords.length;
          if (score > bestScore && score >= 0.4) {
            bestScore = score;
            bestMatch = { code: comp.code, description: comp.description, price: comp.price, unit: comp.unit, source: 'SINAPI' };
          }
        }

        // Try PINI if SINAPI didn't match well
        if (bestScore < 0.6) {
          for (const comp of PINI_DATABASE) {
            const compNorm = normalizeText(comp.description);
            let matched = 0;
            for (const kw of keywords) { if (compNorm.includes(kw)) matched++; }
            const score = matched / keywords.length;
            if (score > bestScore && score >= 0.4) {
              bestScore = score;
              bestMatch = { code: comp.code, description: comp.description, price: comp.price, unit: comp.unit, source: 'PINI' };
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
        .map(a => `- "${a.description}": ${a.source} ${a.code} = R$ ${a.price.toFixed(2)}/${a.unit}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  getUserPrompt(input: OrcamentistaInput): string {
    const totalItems = input.items?.length || 0;

    // Build price anchors from real SINAPI/PINI databases (top-15 by value)
    const anchors = this.buildPriceAnchors(input.items || []);

    return `Precifique TODOS os ${totalItems} itens de obra listados abaixo.

⚠️ IMPORTANTE: Você DEVE retornar exatamente ${totalItems} itens no budgetItems.
NÃO omita nenhum item. NÃO agrupe itens diferentes.
${anchors ? `
=== PREÇOS DE REFERÊNCIA (SINAPI/PINI Jan/2025, base SP) ===
${anchors}

⚠️ Use estes preços como base. Se divergir >15% de alguma referência, justifique.
` : ''}
ITENS (${totalItems} no total):
${JSON.stringify(input.items, null, 2)}

CUSTOS LOGÍSTICOS:
${JSON.stringify(input.logisticsCosts, null, 2)}

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

VALIDAÇÃO: budgetItems.length DEVE ser igual a ${totalItems}`;
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
            },
            required: ["id", "category", "code", "description", "unit", "quantity", "unitCostMaterial", "unitCostLabor", "unitCostLogistics", "unitCostTotal", "totalCost", "source", "sourceCode", "sourceDate"],
            additionalProperties: false,
          },
        },
        totalDirectCost: { type: "number" },
        totalIndirectCost: { type: "number" },
        curvaAItems: { type: "array", items: { type: "string" } },
        curvaCItems: { type: "array", items: { type: "string" } },
      },
      required: ["budgetItems", "totalDirectCost", "totalIndirectCost", "curvaAItems", "curvaCItems"],
      additionalProperties: false,
    };
  }
}

// Agent 4: Tributário
export class TributarioAgent extends BaseAgent<TributarioInput, TributarioOutput> {
  name = AGENT_NAMES.tributario;
  type: AgentType = "tributario";
  getPreferredModel() { return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6"; }

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
- PIS/COFINS/CSLL retido: 4.65% para órgãos públicos`;
  }
  
  getUserPrompt(input: TributarioInput): string {
    // Calcular custo total dos itens para referência
    const totalCost = input.budgetItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const unitCost = Number(item.unitCostTotal) || 0;
      return sum + (qty * unitCost);
    }, 0);
    
    // Obter configurações de impostos da empresa
    const taxSettings = (input as any).companyTaxSettings || {
      regimeTributario: 'lucro_presumido',
      issPercentual: 5.0,
      pisPercentual: 0.65,
      cofinsPercentual: 3.0,
      irpjPercentual: 1.2,
      csllPercentual: 1.08,
      taxaLeisSociais: 128.23,
    };
    
    const pisCofins = taxSettings.pisPercentual + taxSettings.cofinsPercentual;
    
    return `Classifique tributariamente os seguintes itens:

ITENS DO ORÇAMENTO:
${JSON.stringify(input.budgetItems, null, 2)}

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
   - Mínimo esperado (ISS): R$ ${(totalCost * taxSettings.issPercentual / 100).toFixed(2)}
   - Com PIS/COFINS: R$ ${(totalCost * (taxSettings.issPercentual + pisCofins) / 100).toFixed(2)}

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
              taxType: { type: "string", enum: ["iss", "icms", "both", "none"] },
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

// Agent 5: Comercial
export class ComercialAgent extends BaseAgent<ComercialInput, ComercialOutput> {
  name = AGENT_NAMES.comercial;
  type: AgentType = "comercial";
  
  getSystemPrompt(): string {
    return `Você é o Agente Comercial da RR Engenharia.

MISSÃO: Definir o Preço de Venda estratégico aplicando BDI PERSONALIZADO sobre o CUSTO BASE.

⚠️ ATENÇÃO CRÍTICA: EVITAR BITRIBUTAÇÃO!
O BDI JÁ INCLUI os tributos na sua composição. Portanto:
- NÃO some os impostos calculados pelo Tributário ao custo base antes de aplicar BDI
- O Tributário apenas CLASSIFICA os itens para fins de compliance
- O BDI é aplicado sobre: Custos Diretos + Custos Indiretos (logística)

⚠️ IMPORTANTE: O BDI E LUCRO SERÃO FORNECIDOS NO INPUT COMO "companyBdiSettings".
Você DEVE usar esses valores em vez de valores padrão.

AJUSTES DE BDI (sobre o BDI configurado):
- Risco fiscal alto: +5%
- Complexidade logística alta: +5%
- Cliente recorrente: -5%
- Prazo apertado: +10%

FÓRMULA CORRETA:
Preço de Venda = (Custos Diretos + Custos Indiretos) × (1 + BDI)

EXEMPLO:
- Custos Diretos: R$ 100.000
- Custos Indiretos: R$ 10.000
- Custo Base: R$ 110.000
- BDI: 25% (0.25) - configurado pela empresa
- Preço de Venda: R$ 110.000 × 1.25 = R$ 137.500`;
  }
  
  getUserPrompt(input: ComercialInput): string {
    // IMPORTANTE: NÃO incluir totalTaxes no custo base - BDI já inclui tributos
    const custoBase = input.totalDirectCost + input.totalIndirectCost;
    
    // BDI do projeto tem prioridade sobre o da empresa
    const projectBdi = (input as any).projectBdi;
    const bdiPreset = (input as any).bdiPreset || "padrao";
    
    // Obter configurações de BDI da empresa (para referência)
    const bdiSettings = (input as any).companyBdiSettings || {
      bdiPercentual: 25.0,
      lucroPercentual: 8.0,
      adminCentralPercentual: 4.0,
      despesasFinanceirasPercentual: 1.0,
      riscosPercentual: 1.0,
    };
    
    // BDI efetivo: projeto > empresa
    const effectiveBdi = projectBdi ?? bdiSettings.bdiPercentual;
    const bdiDecimal = effectiveBdi / 100;
    const precoExemplo = custoBase * (1 + bdiDecimal);
    
    // Mapear preset para nome legível
    const presetNames: Record<string, string> = {
      "reduzido": "Reduzido (15%)",
      "padrao": "Padrão (25%)",
      "majorado": "Majorado (35%)",
      "personalizado": `Personalizado (${effectiveBdi}%)`
    };
    const presetLabel = presetNames[bdiPreset] || "Padrão (25%)";
    
    return `Defina o preço de venda para o projeto:

⚠️ ATENÇÃO: O BDI JÁ INCLUI TRIBUTOS - NÃO SOME IMPOSTOS AO CUSTO BASE!

CUSTOS:
- Diretos (materiais + mão de obra): R$ ${input.totalDirectCost.toFixed(2)}
- Indiretos (logística/mobilização): R$ ${input.totalIndirectCost.toFixed(2)}
- CUSTO BASE PARA BDI: R$ ${custoBase.toFixed(2)}

(Nota: O Tributário calculou R$ ${input.totalTaxes.toFixed(2)} em impostos para fins de classificação fiscal,
mas estes JÁ ESTÃO EMBUTIDOS no BDI e NÃO devem ser somados ao custo base.)

=== BDI DO PROJETO ===
🎯 BDI DEFINIDO PARA ESTE PROJETO: ${effectiveBdi}% (${presetLabel})

Este BDI foi configurado especificamente para este projeto e DEVE ser usado como base.
NÃO use valores padrão - use EXATAMENTE ${effectiveBdi}% como BDI base.

COMPLEXIDADE LOGÍSTICA: ${input.logisticsComplexity}
RISCO FISCAL: ${input.fiscalRisk}

AJUSTES PERMITIDOS (sobre o BDI do projeto):
- Risco fiscal alto: +5%
- Complexidade logística alta: +5%
- Prazo apertado: +10%

FÓRMULA OBRIGATÓRIA:
- BDI BASE: ${effectiveBdi}% (definido para este projeto)
- Preço Final = Custo Base × (1 + BDI)
- Exemplo: Preço Final = ${custoBase.toFixed(2)} × ${(1 + bdiDecimal).toFixed(2)} = ${precoExemplo.toFixed(2)}

IMPORTANTE:
- baseBdi: DEVE ser ${bdiDecimal.toFixed(2)} (${effectiveBdi}% definido para o projeto)
- adjustedBdi: BDI base + ajustes por risco/complexidade
- totalBdiAmount: valor monetário do BDI = Custo Base × adjustedBdi
- finalPrice: Preço Final = Custo Base × (1 + adjustedBdi)

Calcule o BDI adequado (partindo de ${effectiveBdi}%) e o preço final de venda.`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        baseBdi: { type: "number" },
        adjustedBdi: { type: "number" },
        bdiJustification: { type: "string" },
        totalBdiAmount: { type: "number" },
        finalPrice: { type: "number" },
        pricePerUnit: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["baseBdi", "adjustedBdi", "bdiJustification", "totalBdiAmount", "finalPrice", "pricePerUnit"],
      additionalProperties: false,
    };
  }
}

// Agent 6: Gestão de Projetos
export class GestaoProjAgent extends BaseAgent<GestaoProjInput, GestaoProjOutput> {
  getPreferredModel() { return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6"; }
  name = AGENT_NAMES.gestao_projetos;
  type: AgentType = "gestao_projetos";
  
  getSystemPrompt(): string {
    return `Você é o Agente de Gestão de Projetos da RR Engenharia.

MISSÃO: Criar cronograma físico REALISTA e PERSONALIZADO para cada projeto.

⚠️ ATENÇÃO: NÃO USE CRONOGRAMAS GENÉRICOS!
Cada projeto tem escopo diferente. Você DEVE calcular o prazo baseado nos quantitativos reais.

RESPONSABILIDADES:
1. Analisar CADA ITEM do orçamento e calcular tempo de execução
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
    return `Crie o cronograma físico DETALHADO DIA A DIA para o projeto:

ITENS DO ORÇAMENTO:
${JSON.stringify(input.budgetItems.slice(0, 30), null, 2)}

CUSTOS LOGÍSTICOS:
${JSON.stringify(input.logisticsCosts, null, 2)}

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
            required: ["day", "date", "phase", "activities", "isWorkDay", "notes"],
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
            required: ["phase", "description", "startDay", "endDay", "duration"],
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
      required: ["dailySchedule", "scheduleItems", "totalDuration", "totalDays", "criticalPath", "milestones", "teamSummary", "materialsSummary"],
      additionalProperties: false,
    };
  }
}

// Agent 7: Financeiro
export class FinanceiroAgent extends BaseAgent<FinanceiroInput, FinanceiroOutput> {
  name = AGENT_NAMES.financeiro;
  type: AgentType = "financeiro";
  
  getSystemPrompt(): string {
    return `Você é o Agente Financeiro da RR Engenharia.

MISSÃO: Análise Qualitativa de Viabilidade Financeira.

IMPORTANTE: O fluxo de caixa numérico (cashFlow) já foi calculado deterministicamente pelo backend.
Você NÃO precisa recalcular valores. Seu papel é QUALITATIVO:

1. VALIDAR o fluxo de caixa pré-calculado fornecido
2. IDENTIFICAR riscos financeiros (exposição de caixa, sazonalidade, dependências)
3. GERAR alertas úteis sobre capital de giro, prazos críticos, e necessidade de reserva
4. SUGERIR mitigações para semanas com saldo negativo

REGRA DE FATURAMENTO PADRÃO RR ENGENHARIA:
- ENTRADA: 40% do valor total na assinatura do contrato
- SALDO FINAL: 60% do valor total ao término da obra

SUA RESPOSTA DEVE:
- Retornar o MESMO cashFlow que foi fornecido no input (não altere os números)
- Preencher maxExposure com o maior saldo negativo encontrado (ou 0 se não houver)
- needsAdvance = true (sempre, modelo 40/60)
- suggestedAdvance = 40% do preço de venda
- alerts: lista de alertas qualitativos relevantes

NÃO invente números. Use EXATAMENTE os valores do cashFlow fornecido.`;
  }
  
  getUserPrompt(input: FinanceiroInput): string {
    const adiantamento = input.totalPrice * 0.40;
    const marginBruta = input.totalPrice - input.totalCost;
    const marginPercent = input.totalPrice > 0 ? (marginBruta / input.totalPrice * 100).toFixed(1) : '0';
    
    // Se o cashFlow já foi pré-calculado, enviar para validação
    const cashFlowInfo = input.cashFlow 
      ? `\n\nFLUXO DE CAIXA PRÉ-CALCULADO (use EXATAMENTE estes valores):\n${JSON.stringify(input.cashFlow, null, 2)}`
      : '';
    
    return `Analise a viabilidade financeira do projeto:

RESUMO FINANCEIRO:
- Preço de Venda: R$ ${input.totalPrice.toFixed(2)}
- Custo Total (direto + logística): R$ ${input.totalCost.toFixed(2)}
- Margem Bruta: R$ ${marginBruta.toFixed(2)} (${marginPercent}%)
- Adiantamento (40%): R$ ${adiantamento.toFixed(2)}
- Condições de Pagamento: ${input.paymentTerms}

CRONOGRAMA:
${JSON.stringify(input.scheduleItems.slice(0, 10), null, 2)}
${input.scheduleItems.length > 10 ? `... e mais ${input.scheduleItems.length - 10} itens` : ''}

ITENS DO ORÇAMENTO: ${input.budgetItems.length} itens${cashFlowInfo}

INSTRUÇÕES:
1. Retorne o cashFlow EXATAMENTE como fornecido acima (não altere valores)
2. needsAdvance = true
3. suggestedAdvance = ${adiantamento.toFixed(2)}
4. Gere alertas qualitativos sobre riscos, capital de giro e recomendações`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        cashFlow: {
          type: "array",
          items: {
            type: "object",
            properties: {
              week: { type: "number" },
              expense: { type: "number" },
              income: { type: "number" },
              balance: { type: "number" },
            },
            required: ["week", "expense", "income", "balance"],
            additionalProperties: false,
          },
        },
        maxExposure: { type: "number" },
        needsAdvance: { type: "boolean" },
        suggestedAdvance: { type: "number" },
        alerts: { type: "array", items: { type: "string" } },
      },
      required: ["cashFlow", "maxExposure", "needsAdvance", "suggestedAdvance", "alerts"],
      additionalProperties: false,
    };
  }
}

// Agent 8: Jurídico
export class JuridicoAgent extends BaseAgent<JuridicoInput, JuridicoOutput> {
  name = AGENT_NAMES.juridico;
  getPreferredModel() { return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6"; }
  type: AgentType = "juridico";
  
  getSystemPrompt(): string {
    return `Você é o Agente Jurídico da RR Engenharia.

MISSÃO: Redação contratual e Compliance.

RESPONSABILIDADES:
1. Redigir proposta técnica profissional
2. Incluir cláusulas de proteção contra riscos
3. Definir termos de confidencialidade
4. Estabelecer validade da proposta

CLÁUSULAS ESSENCIAIS:
- Objeto e escopo
- Preço e condições de pagamento
- Prazo de execução
- Garantias
- Responsabilidades
- Rescisão
- Foro`;
  }
  
  getUserPrompt(input: JuridicoInput): string {
    // Calcular prazo em dias e semanas para clareza
    const durationDays = (input as any).durationDays || 30;
    const durationWeeks = Math.ceil(durationDays / 7);
    
    return `Redija a proposta técnica para o projeto:

PROJETO: ${input.projectName}
VALOR TOTAL: R$ ${input.totalPrice.toFixed(2)}
CONDIÇÕES DE PAGAMENTO: ${input.paymentTerms}
PRAZO: ${durationDays} dias (≈ ${durationWeeks} semanas)

⚠️ IMPORTANTE: O prazo de ${durationDays} dias foi calculado pelo Agente de Gestão de Projetos.
Use EXATAMENTE este prazo na proposta - NÃO arredonde para semanas.

RESTRIÇÕES IDENTIFICADAS:
${input.restrictions.join("\n")}

ALERTAS FINANCEIROS:
${input.financialAlerts.join("\n")}

Gere o texto da proposta com todas as cláusulas necessárias.
Na cláusula de prazo, use "${durationDays} dias" como prazo de execução.`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        proposalText: { type: "string" },
        clauses: {
          type: "array",
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
        validityDays: { type: "number" },
        confidentialityTerms: { type: "string" },
      },
      required: ["proposalText", "clauses", "validityDays", "confidentialityTerms"],
      additionalProperties: false,
    };
  }
}

// Agent 9: Board (Decisor)
export class BoardAgent extends BaseAgent<BoardInput, BoardOutput> {
  name = AGENT_NAMES.board;
  type: AgentType = "board";
  getPreferredModel() { return process.env.LLM_MODEL_CRITICAL ?? "claude-opus-4-6"; }
  
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
- Prazo < 2 semanas para obras > R$ 100k → provavelmente inviável`;
  }
  
  getUserPrompt(input: BoardInput): string {
    // Resumir os outputs dos agentes para evitar payload muito grande
    const resumo = {
      engenheiro: {
        totalItens: input.allAgentOutputs.engenheiro?.items?.length || 0,
        itensPendentes: input.allAgentOutputs.engenheiro?.pendingItems?.length || 0,
        notasCriticas: input.allAgentOutputs.engenheiro?.criticalNotes || [],
      },
      orcamentista: {
        totalItens: input.allAgentOutputs.orcamentista?.budgetItems?.length || 0,
        custoDireto: input.allAgentOutputs.orcamentista?.totalDirectCost || 0,
        custoIndireto: input.allAgentOutputs.orcamentista?.totalIndirectCost || 0,
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
        justificativaBdi: input.allAgentOutputs.comercial?.bdiJustification || "",
      },
      gestao: {
        duracaoTotal: input.allAgentOutputs.gestao?.totalDuration || 0,
        caminhosCriticos: input.allAgentOutputs.gestao?.criticalPath || [],
        marcos: input.allAgentOutputs.gestao?.milestones || [],
      },
      financeiro: {
        exposicaoMaxima: input.allAgentOutputs.financeiro?.maxExposure || 0,
        precisaAdiantamento: input.allAgentOutputs.financeiro?.needsAdvance || false,
        adiantamentoSugerido: input.allAgentOutputs.financeiro?.suggestedAdvance || 0,
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
    const margemPercentual = precoFinal > 0 
      ? (margemLiquida / precoFinal) * 100 
      : 0;
    
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
    if (!custoDireto || custoDireto <= 0) dadosFaltantes.push("Custo direto ausente ou inválido");
    if (custoLogistica === undefined) dadosFaltantes.push("Custo logístico não informado");
    if (totalImpostos === undefined) dadosFaltantes.push("Impostos não calculados");
    if (!precoFinal || precoFinal <= 0) dadosFaltantes.push("Preço final ausente ou inválido");
    
    const alertaDados = dadosFaltantes.length > 0
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
${JSON.stringify(resumo, null, 2)}

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
        blockProposal: { type: "boolean", description: "Se true, a proposta NÃO será gerada. Usuário deve corrigir problemas." },
        requiresUserConfirmation: { type: "boolean", description: "Se true, proposta será gerada mas usuário deve confirmar ciência dos alertas." },
        blockReason: { type: "string", description: "Motivo do bloqueio (se blockProposal = true)" },
        warningMessages: { 
          type: "array", 
          items: { type: "string" },
          description: "Lista de alertas que o usuário deve estar ciente (se requiresUserConfirmation = true)" 
        },
        projectViability: {
          type: "object",
          properties: {
            isViable: { type: "boolean" },
            profitMargin: { type: "string" },
            calculatedMargin: { type: "number", description: "Margem calculada em percentual" },
            riskLevel: { type: "string", enum: ["baixo", "medio", "alto", "critico"] },
            recommendation: { type: "string", enum: ["aprovar", "aprovar_com_ressalvas", "revisar", "rejeitar"] },
          },
          required: ["isViable", "profitMargin", "calculatedMargin", "riskLevel", "recommendation"],
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
          required: ["priceCalculationCorrect", "priceCalculationDetails", "scheduleCoherent", "scheduleDetails", "cashFlowSustainable", "cashFlowDetails", "allItemsPriced", "unpricedItems"],
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
            required: ["issue", "agentsInvolved", "businessImpact", "decision", "justification", "actionRequired", "responsible"],
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
          description: "Se true, a rejeição é EXCLUSIVAMENTE por motivos financeiros (margem, BDI, preço), sem problemas operacionais ou técnicos" 
        },
        requestFinancialRevision: { 
          type: "boolean", 
          description: "Se true, solicita ciclo de revisão automático dos agentes Orçamentista, Logística, Tributário e Comercial" 
        },
        financialRevisionReason: { 
          type: "string", 
          description: "Motivo da solicitação de revisão financeira (ex: Margem de 3.8% abaixo do mínimo de 10%)" 
        },
        financialRevisionInstructions: {
          type: "object",
          properties: {
            orcamentista: { type: "string", description: "Instruções específicas para o Orçamentista" },
            logistica: { type: "string", description: "Instruções específicas para a Logística" },
            tributario: { type: "string", description: "Instruções específicas para o Tributário" },
            comercial: { type: "string", description: "Instruções específicas para o Comercial" },
          },
          required: ["orcamentista", "logistica", "tributario", "comercial"],
          additionalProperties: false,
        },
      },
      required: ["approved", "blockProposal", "requiresUserConfirmation", "blockReason", "warningMessages", "projectViability", "validationResults", "decisions", "executiveSummary", "finalApproval", "conditionsForApproval", "isFinancialOnlyRejection", "requestFinancialRevision", "financialRevisionReason", "financialRevisionInstructions"],
      additionalProperties: false,
    };
  }
}

// Agent 10: Auditor de Consistência
export class AuditorAgent extends BaseAgent<AuditorInput, AuditorOutput> {
  getPreferredModel() { return process.env.LLM_MODEL_INTERMEDIATE ?? "claude-sonnet-4-6"; }
  name = AGENT_NAMES.auditor;
  type: AgentType = "auditor";
  
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

=== CRITÉRIOS DE SELO DE AUDITORIA ===

- "approved": 0 erros críticos, 0 warnings
- "approved_with_warnings": 0 erros críticos, 1+ warnings
- "rejected": 1+ erros críticos

=== SCORE DE VALIDAÇÃO ===

Calcule o score de 0 a 100:
- Cada validação crítica que passa: +15 pontos
- Cada validação warning que passa: +10 pontos
- Cada validação info que passa: +5 pontos
- Cada erro crítico: -25 pontos
- Cada warning: -10 pontos

Seja RIGOROSO e PRECISO. Sua auditoria é a última linha de defesa antes da proposta ser enviada ao cliente.`;
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
    const cashFlowFinal = allAgentOutputs.financeiro?.cashFlow?.slice(-1)[0]?.balance || 0;
    const totalDays = allAgentOutputs.gestao?.totalDuration || 0;
    
    // Calcular margens
    const grossMargin = actualPrice - baseCost;
    const grossMarginPercent = actualPrice > 0 ? (grossMargin / actualPrice) * 100 : 0;
    const netMargin = actualPrice - baseCost - totalTaxes;
    const netMarginPercent = actualPrice > 0 ? (netMargin / actualPrice) * 100 : 0;
    
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
- Aprovado: ${allAgentOutputs.board?.approved ? 'Sim' : 'Não'}
- Bloqueado: ${allAgentOutputs.board?.blockProposal ? 'Sim' : 'Não'}

CONFIGURAÇÕES DA EMPRESA:
- Configurações Personalizadas: ${hasCustomSettings ? 'Sim (usuário salvou configurações)' : 'NÃO (usando valores padrão - EMITIR WARNING)'}

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
        isValid: { type: "boolean", description: "True se não houver erros críticos" },
        validationScore: { type: "number", description: "Score de 0 a 100" },
        criticalErrors: { type: "number", description: "Número de erros críticos" },
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
              severity: { type: "string", enum: ["critical", "warning", "info"] },
              recommendation: { type: "string" },
            },
            required: ["rule", "description", "expected", "actual", "passed", "severity", "recommendation"],
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
          required: ["directCost", "logisticsCost", "baseCost", "bdiAmount", "taxes", "finalPrice", "grossMargin", "grossMarginPercent", "netMargin", "netMarginPercent"],
          additionalProperties: false,
        },
        auditSeal: { type: "string", enum: ["approved", "approved_with_warnings", "rejected"] },
        auditTimestamp: { type: "string" },
        auditNotes: { type: "string" },
      },
      required: ["isValid", "validationScore", "criticalErrors", "warnings", "validations", "crossAgentChecks", "financialSummary", "auditSeal", "auditTimestamp", "auditNotes"],
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
