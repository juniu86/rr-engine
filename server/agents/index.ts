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
   * Executa o agente com o input fornecido.
   * Responsável por:
   * 1. Chamar a LLM com os prompts configurados
   * 2. Processar a resposta via _processLLMResponse()
   * 3. Fazer parse do JSON e retornar o output tipado
   */
  async execute(input: TInput): Promise<TOutput> {
    console.log(`[Agent ${this.name}] Starting execution...`);
    
    // Etapa 1: Chamar a LLM
    let response;
    try {
      response = await invokeLLM({
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          { role: "user", content: this.getUserPrompt(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: `${this.type}_output`,
            strict: true,
            schema: this.getOutputSchema() as Record<string, unknown>,
          },
        },
      });
    } catch (llmError) {
      console.error(`[Agent ${this.name}] LLM call failed:`, llmError);
      throw llmError;
    }
    
    // Etapa 2: Processar resposta (lógica extraída para método privado)
    const content = this._processLLMResponse(response);
    console.log(`[Agent ${this.name}] Content preview:`, content.substring(0, 200));
    
    // Etapa 3: Parse do JSON
    try {
      const parsed = JSON.parse(content) as TOutput;
      console.log(`[Agent ${this.name}] Successfully parsed output`);
      return parsed;
    } catch (parseError) {
      console.error(`[Agent ${this.name}] JSON parse error:`, parseError);
      throw new Error(`Agent ${this.name} returned invalid JSON: ${content.substring(0, 200)}...`);
    }
  }
}

// Agent 1: Engenheiro Técnico
export class EngenheiroTecnicoAgent extends BaseAgent<EngenheiroTecnicoInput, EngenheiroTecnicoOutput> {
  name = AGENT_NAMES.engenheiro_tecnico;
  type: AgentType = "engenheiro_tecnico";
  
  getSystemPrompt(): string {
    return `Você é o Engenheiro Técnico da RR Engenharia, responsável por auditar e traduzir Memoriais Descritivos em tarefas de engenharia específicas.

MISSÃO: Transformar descrições genéricas em especificações técnicas baseadas em NBRs.

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
9. INSTALAÇÕES ELÉTRICAS (fiação, quadros, pontos, iluminação)
10. LIMPEZA E FINALIZAÇÃO (limpeza, remoção de entulho)

REGRAS:
1. Ler o memorial COMPLETO do início ao fim
2. Extrair CADA ITEM de CADA TABELA do documento
3. Manter o número do grupo/seção original (ex: 1.1, 2.3, 8.5)
4. Se faltar medida, NÃO ESTIMAR - marcar como "Pendente de Vistoria"
5. Referenciar normas ABNT NBR aplicáveis
6. Identificar itens críticos que precisam de atenção especial

VALIDAÇÃO FINAL:
- Verifique se processou TODOS os grupos numerados do memorial
- Verifique se nenhuma tabela foi pulada
- O número de itens na saída deve ser >= número de linhas nas tabelas do input

FORMATO DE SAÍDA: JSON estruturado com items, pendingItems, nbrReferences e criticalNotes.`;
  }
  
  getUserPrompt(input: EngenheiroTecnicoInput): string {
    return `Analise o seguinte Memorial Descritivo e extraia TODOS os itens de engenharia.

⚠️ IMPORTANTE: Você DEVE processar o documento COMPLETO, do início ao fim.
NÃO interrompa a leitura. NÃO omita nenhum grupo de serviços.

MEMORIAL DESCRITIVO:
${input.memorialDescritivo}

LOCALIZAÇÃO: ${input.location}
RESTRIÇÕES: ${input.restrictions}

INSTRUÇÕES:
1. Leia o memorial COMPLETO
2. Identifique TODOS os grupos de serviços (1, 2, 3... até o último)
3. Extraia CADA ITEM de CADA TABELA
4. Mantenha a numeração original (1.1, 1.2, 2.1, etc.)
5. NÃO pule nenhum grupo, especialmente:
   - Estrutura e Vedação
   - Cobertura
   - Instalações Hidrossanitárias
   - Instalações Elétricas

Retorne um JSON com:
- items: lista COMPLETA de itens com group (número do grupo), itemNumber (número do item), description, quantity (se disponível), unit, specifications, nbrReference, isPendingVistoria
- pendingItems: lista de itens que precisam de vistoria para definir quantidade
- nbrReferences: lista de normas ABNT aplicáveis
- criticalNotes: observações críticas sobre o memorial
- groupsProcessed: lista dos grupos processados (ex: ["1. SERVIÇOS PRELIMINARES", "2. ESTRUTURA", ...])
- totalItemsExtracted: número total de itens extraídos`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
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
      required: ["items", "pendingItems", "nbrReferences", "criticalNotes", "groupsProcessed", "totalItemsExtracted"],
      additionalProperties: false,
    };
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
    return `Analise os itens da obra e calcule os custos logísticos:

ITENS DA OBRA:
${JSON.stringify(input.items, null, 2)}

LOCALIZAÇÃO: ${input.location}
RESTRIÇÕES: ${input.restrictions}
DURAÇÃO ESTIMADA: ${input.estimatedDuration} semanas

Calcule todos os custos indiretos operacionais necessários.`;
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
  
  getSystemPrompt(): string {
    return `Você é o Orçamentista & Suprimentos da RR Engenharia.

MISSÃO: Precificar com realidade de mercado.

⚠️ REGRA CRÍTICA: PRECIFICAR 100% DOS ITENS!
Você DEVE precificar TODOS os itens recebidos do Engenheiro Técnico.
NÃO omita nenhum item, mesmo que seja similar a outro.
O número de itens na saída DEVE ser igual ao número de itens na entrada.

METODOLOGIA:
1. Itens Comuns (Curva C): Usar bases SINAPI e PINI
2. Itens Críticos (Curva A - 80% do valor): Simular cotação de mercado atual
3. Consolidar custos diretos e indiretos

REGRAS:
- Cada item DEVE ter uma fonte declarada (SINAPI, PINI, Mercado)
- Separar custo de material e mão de obra
- Identificar itens de alto impacto (Curva A)
- NÃO inventar preços - usar referências reais
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
  
  getUserPrompt(input: OrcamentistaInput): string {
    const totalItems = input.items?.length || 0;
    return `Precifique TODOS os ${totalItems} itens de obra listados abaixo.

⚠️ IMPORTANTE: Você DEVE retornar exatamente ${totalItems} itens no budgetItems.
NÃO omita nenhum item. NÃO agrupe itens diferentes.

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
- lucro_real: PIS/COFINS não-cumulativo (1,65% + 7,6%)`;
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

MISSÃO: Análise de Fluxo de Caixa e Viabilidade Financeira.

=== REGRA DE FATURAMENTO PADRÃO RR ENGENHARIA ===
- ENTRADA (Adiantamento): 40% do valor total na assinatura do contrato
- SALDO FINAL: 60% do valor total ao término da obra

O faturamento SEMPRE ocorre dentro do prazo do projeto:
- Semana 1: Recebe 40% (adiantamento)
- Última semana do cronograma: Recebe 60% (saldo final)

RESPONSABILIDADES:
1. Calcular o fluxo de caixa baseado no cronograma real do projeto
2. Distribuir despesas (custos) proporcionalmente ao cronograma
3. Aplicar a regra de faturamento 40%/60%
4. Calcular saldo acumulado semana a semana
5. Verificar se o projeto é financeiramente viável

REGRAS DE CÁLCULO DO FLUXO DE CAIXA:
1. DESPESAS (expense): Distribua os custos totais proporcionalmente ao cronograma
2. RECEITAS (income):
   - Semana 1: 40% do preço de venda (adiantamento)
   - Última semana: 60% do preço de venda (saldo final)
3. SALDO (balance): SALDO ACUMULADO = Saldo anterior + Receitas - Despesas

EXEMPLO:
- Preço de venda: R$ 100.000
- Duração: 3 semanas
- Custo total: R$ 65.000

Fluxo de Caixa:
- Semana 1: Receita R$ 40.000 (40%), Despesa R$ 25.000, Saldo R$ 15.000
- Semana 2: Receita R$ 0, Despesa R$ 20.000, Saldo R$ -5.000
- Semana 3: Receita R$ 60.000 (60%), Despesa R$ 20.000, Saldo R$ 35.000 (lucro)

IMPORTANTE:
- needsAdvance: SEMPRE true (usamos 40% de entrada como padrão)
- suggestedAdvance: SEMPRE 40% do preço de venda
- O saldo final deve ser POSITIVO (representa o lucro do projeto)
- Se o saldo ficar negativo durante a obra, alertar sobre necessidade de capital de giro`;
  }
  
  getUserPrompt(input: FinanceiroInput): string {
    // Calcular valores de faturamento
    const adiantamento = input.totalPrice * 0.40;
    const saldoFinal = input.totalPrice * 0.60;
    const totalDuration = input.scheduleItems.length > 0 
      ? Math.max(...input.scheduleItems.map(s => s.endWeek || 4))
      : 4;
    
    return `Analise o fluxo de caixa do projeto:

CRONOGRAMA:
${JSON.stringify(input.scheduleItems, null, 2)}

DURAÇÃO TOTAL DO PROJETO: ${totalDuration} semanas

ITENS DO ORÇAMENTO (resumo):
Total de itens: ${input.budgetItems.length}
Valor total da proposta (preço de venda): R$ ${input.totalPrice.toFixed(2)}

=== REGRA DE FATURAMENTO (OBRIGATÓRIO) ===
- SEMANA 1: Receber R$ ${adiantamento.toFixed(2)} (40% de adiantamento)
- SEMANA ${totalDuration}: Receber R$ ${saldoFinal.toFixed(2)} (60% saldo final)

INSTRUÇÕES:
1. Distribua as despesas (custos) ao longo das ${totalDuration} semanas do cronograma
2. RECEITAS:
   - Semana 1: R$ ${adiantamento.toFixed(2)} (40%)
   - Semana ${totalDuration}: R$ ${saldoFinal.toFixed(2)} (60%)
3. O saldo (balance) deve ser ACUMULADO: saldo_semana_N = saldo_semana_N-1 + receitas - despesas
4. needsAdvance = true (sempre usamos adiantamento)
5. suggestedAdvance = ${adiantamento.toFixed(2)} (40% do valor)

Projete o fluxo de caixa semanal com saldo acumulado.`;
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

=== VALIDAÇÕES OBRIGATÓRIAS ===
1. Verificar se Preço Final = (Custo Direto + Custo Indireto) x (1 + BDI)
2. Verificar se o prazo é coerente com os quantitativos
3. Verificar se o fluxo de caixa é sustentável
4. Verificar se há itens sem preço ou com valores zerados

SEJA CRÍTICO E RIGOROSO. Sua função é proteger a empresa de propostas inviáveis.`;
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
    
    return `REUNIÃO DO BOARD EXECUTIVO - ANÁLISE E DECISÃO

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
