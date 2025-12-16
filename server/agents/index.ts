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
  ContractType,
} from "../../shared/agents";
import { AGENT_NAMES, CONTRACT_BDI, TAX_RATES } from "../../shared/agents";

// Base agent class
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract type: AgentType;
  
  abstract getSystemPrompt(): string;
  abstract getUserPrompt(input: TInput): string;
  abstract getOutputSchema(): object;
  
  async execute(input: TInput): Promise<TOutput> {
    const response = await invokeLLM({
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
    
    // Handle response safely
    if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
      throw new Error(`Agent ${this.name} returned invalid response structure`);
    }
    
    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error(`Agent ${this.name} returned empty choice`);
    }
    
    let content = choice.message.content;
    
    // Handle array content (multimodal response)
    if (Array.isArray(content)) {
      const textPart = content.find((part) => part.type === 'text') as { type: 'text'; text: string } | undefined;
      content = textPart?.text || '';
    }
    
    if (!content || typeof content !== 'string') {
      throw new Error(`Agent ${this.name} returned empty or invalid content`);
    }
    
    try {
      return JSON.parse(content) as TOutput;
    } catch (parseError) {
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

REGRAS:
1. Criticar o memorial e identificar inconsistências
2. Transformar linhas genéricas (ex: "instalação elétrica") em lista de materiais e serviços específicos
3. Se faltar medida, NÃO ESTIMAR - marcar como "Pendente de Vistoria"
4. Referenciar normas ABNT NBR aplicáveis
5. Identificar itens críticos que precisam de atenção especial

FORMATO DE SAÍDA: JSON estruturado com items, pendingItems, nbrReferences e criticalNotes.`;
  }
  
  getUserPrompt(input: EngenheiroTecnicoInput): string {
    return `Analise o seguinte Memorial Descritivo e extraia os itens de engenharia:

MEMORIAL DESCRITIVO:
${input.memorialDescritivo}

LOCALIZAÇÃO: ${input.location}
RESTRIÇÕES: ${input.restrictions}

Retorne um JSON com:
- items: lista de itens com description, quantity (se disponível), unit, specifications, nbrReference, isPendingVistoria
- pendingItems: lista de itens que precisam de vistoria para definir quantidade
- nbrReferences: lista de normas ABNT aplicáveis
- criticalNotes: observações críticas sobre o memorial`;
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
              description: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              specifications: { type: ["string", "null"] },
              nbrReference: { type: ["string", "null"] },
              isPendingVistoria: { type: "boolean" },
            },
            required: ["description", "isPendingVistoria"],
            additionalProperties: false,
          },
        },
        pendingItems: { type: "array", items: { type: "string" } },
        nbrReferences: { type: "array", items: { type: "string" } },
        criticalNotes: { type: "array", items: { type: "string" } },
      },
      required: ["items", "pendingItems", "nbrReferences", "criticalNotes"],
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

MISSÃO: Calcular os custos invisíveis de execução da obra.

RESPONSABILIDADES:
1. Calcular fretes de materiais
2. Estimar custos de bota-fora (caçambas)
3. Calcular deslocamento de equipe
4. Estimar hospedagem e alimentação (se aplicável)
5. Listar equipamentos de apoio necessários (andaimes, munck, etc.)
6. Verificar restrições locais (horário de shopping, condomínio, acesso de caminhões)

PREMISSAS DE CUSTO (usar como referência):
- Caçamba 5m³: R$ 350-500
- Frete local (até 50km): R$ 200-400
- Diária de servente: R$ 150-200
- Diária de pedreiro: R$ 250-350
- Hospedagem: R$ 100-150/dia
- Alimentação: R$ 50-80/dia`;
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
        totalLogisticsCost: { type: "number" },
        restrictions: { type: "array", items: { type: "string" } },
      },
      required: ["costs", "totalLogisticsCost", "restrictions"],
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

METODOLOGIA:
1. Itens Comuns (Curva C): Usar bases SINAPI e PINI
2. Itens Críticos (Curva A - 80% do valor): Simular cotação de mercado atual
3. Consolidar custos diretos e indiretos

REGRAS:
- Cada item DEVE ter uma fonte declarada (SINAPI, PINI, Mercado)
- Separar custo de material e mão de obra
- Identificar itens de alto impacto (Curva A)
- NÃO inventar preços - usar referências reais

REFERÊNCIAS DE PREÇO (usar como base quando não houver SINAPI/PINI):
- Concreto usinado fck 25: R$ 450-550/m³
- Aço CA-50: R$ 6.500-7.500/ton
- Tijolo cerâmico: R$ 0,80-1,20/un
- Cimento CP-II: R$ 35-45/saco 50kg
- Areia média: R$ 120-180/m³
- Brita 1: R$ 100-150/m³`;
  }
  
  getUserPrompt(input: OrcamentistaInput): string {
    return `Precifique os seguintes itens de obra:

ITENS:
${JSON.stringify(input.items, null, 2)}

CUSTOS LOGÍSTICOS:
${JSON.stringify(input.logisticsCosts, null, 2)}

REGIÃO: ${input.region}

Para cada item, forneça:
- Código e descrição
- Unidade e quantidade
- Custo unitário (material + mão de obra + logística)
- Fonte do preço (SINAPI/PINI/Mercado com código se disponível)`;
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

MISSÃO: Otimização fiscal e compliance tributário.

RESPONSABILIDADES:
1. Classificar itens entre "Serviço" (ISS) e "Material" (ICMS)
2. Evitar bitributação
3. Alertar sobre retenções obrigatórias (INSS, PIS/COFINS)
4. Calcular impacto no líquido a receber

ALÍQUOTAS DE REFERÊNCIA:
- ISS: 2% a 5% (média 5%)
- ICMS: 7% a 18% (média 18%)
- PIS/COFINS: 3,65%
- INSS (retenção): 11%

REGRAS DE CLASSIFICAÇÃO:
- Serviços puros: ISS
- Fornecimento de materiais: ICMS
- Empreitada mista: proporcional ou regime especial`;
  }
  
  getUserPrompt(input: TributarioInput): string {
    return `Classifique tributariamente os seguintes itens:

ITENS DO ORÇAMENTO:
${JSON.stringify(input.budgetItems, null, 2)}

TIPO DE CONTRATO: ${input.contractType}

Para cada item, defina:
- Tipo de tributo (ISS/ICMS/ambos/nenhum)
- Valor do imposto
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

MISSÃO: Definir o Preço de Venda estratégico.

BDI BASE:
- Manutenção: 40%
- Obras: 55%

AJUSTES DE BDI:
- Risco fiscal alto: +5%
- Complexidade logística alta: +5%
- Cliente recorrente: -5%
- Prazo apertado: +10%

COMPONENTES DO BDI:
- Administração Central: 4-8%
- Custos Financeiros: 1-2%
- Seguros e Garantias: 1-2%
- Tributos: 8-15%
- Lucro: 8-12%`;
  }
  
  getUserPrompt(input: ComercialInput): string {
    return `Defina o preço de venda para o projeto:

CUSTOS:
- Diretos: R$ ${input.totalDirectCost.toFixed(2)}
- Indiretos: R$ ${input.totalIndirectCost.toFixed(2)}
- Impostos: R$ ${input.totalTaxes.toFixed(2)}

TIPO DE CONTRATO: ${input.contractType}
COMPLEXIDADE LOGÍSTICA: ${input.logisticsComplexity}
RISCO FISCAL: ${input.fiscalRisk}

Calcule o BDI adequado e o preço final de venda.`;
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

MISSÃO: Criar cronograma físico realista.

RESPONSABILIDADES:
1. Estimar tempo de execução de cada etapa
2. Identificar dependências entre atividades
3. Criar curva de avanço físico
4. Definir marcos (milestones) do projeto

PREMISSAS DE PRODUTIVIDADE:
- Alvenaria: 2-3 m²/h por pedreiro
- Reboco: 4-6 m²/h por pedreiro
- Pintura: 15-25 m²/h por pintor
- Instalação elétrica: 8-12 pontos/dia
- Instalação hidráulica: 6-10 pontos/dia`;
  }
  
  getUserPrompt(input: GestaoProjInput): string {
    return `Crie o cronograma físico para o projeto:

ITENS DO ORÇAMENTO:
${JSON.stringify(input.budgetItems.slice(0, 20), null, 2)}

CUSTOS LOGÍSTICOS:
${JSON.stringify(input.logisticsCosts, null, 2)}

RESTRIÇÕES: ${input.restrictions}

Defina as fases, durações e dependências.`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        scheduleItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase: { type: "string" },
              description: { type: "string" },
              startWeek: { type: "number" },
              endWeek: { type: "number" },
              duration: { type: "number" },
            },
            required: ["phase", "description", "startWeek", "endWeek", "duration"],
            additionalProperties: false,
          },
        },
        totalDuration: { type: "number" },
        criticalPath: { type: "array", items: { type: "string" } },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              week: { type: "number" },
              description: { type: "string" },
            },
            required: ["week", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["scheduleItems", "totalDuration", "criticalPath", "milestones"],
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

MISSÃO: Análise de Fluxo de Caixa (Cash Flow Exposure).

RESPONSABILIDADES:
1. Cruzar cronograma com custos
2. Projetar desembolsos semanais
3. Identificar "buracos de caixa"
4. Sugerir necessidade de adiantamento

REGRA DE SEGURANÇA:
- Se desembolso inicial > primeira medição: ALERTAR
- Sugerir sinal/adiantamento para cobrir mobilização`;
  }
  
  getUserPrompt(input: FinanceiroInput): string {
    return `Analise o fluxo de caixa do projeto:

CRONOGRAMA:
${JSON.stringify(input.scheduleItems, null, 2)}

ITENS DO ORÇAMENTO (resumo):
Total de itens: ${input.budgetItems.length}
Valor total: R$ ${input.totalPrice.toFixed(2)}

CONDIÇÕES DE PAGAMENTO: ${input.paymentTerms}

Projete o fluxo de caixa semanal e identifique riscos.`;
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
    return `Redija a proposta técnica para o projeto:

PROJETO: ${input.projectName}
TIPO DE CONTRATO: ${input.contractType}
VALOR TOTAL: R$ ${input.totalPrice.toFixed(2)}
CONDIÇÕES DE PAGAMENTO: ${input.paymentTerms}
PRAZO: ${input.duration} semanas

RESTRIÇÕES IDENTIFICADAS:
${input.restrictions.join("\n")}

ALERTAS FINANCEIROS:
${input.financialAlerts.join("\n")}

Gere o texto da proposta com todas as cláusulas necessárias.`;
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

// Agent 9: Board
export class BoardAgent extends BaseAgent<BoardInput, BoardOutput> {
  name = AGENT_NAMES.board;
  type: AgentType = "board";
  
  getSystemPrompt(): string {
    return `Você é o Board de Aprovação da RR Engenharia (CEO, CFO, COO).

MISSÃO: Auditoria Geral e Aprovação Final.

RESPONSABILIDADES:
1. Revisar coerência entre todos os agentes
2. Identificar inconsistências
3. Solicitar correções se necessário
4. Aprovar apenas com consenso unânime

CRITÉRIOS DE APROVAÇÃO:
- Preços coerentes com mercado
- BDI adequado ao risco
- Fluxo de caixa sustentável
- Cláusulas contratuais completas
- Cronograma realista`;
  }
  
  getUserPrompt(input: BoardInput): string {
    return `Revise e aprove o projeto:

RESUMO DO PROJETO:
- Nome: ${input.projectSummary.name}
- Valor: R$ ${input.projectSummary.totalPrice.toFixed(2)}
- Prazo: ${input.projectSummary.duration} semanas
- Tipo: ${input.projectSummary.contractType}

SAÍDAS DOS AGENTES:
${JSON.stringify(input.allAgentOutputs, null, 2)}

Verifique a coerência e aprove ou solicite correções.`;
  }
  
  getOutputSchema(): object {
    return {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              agent: { type: "string" },
              issue: { type: "string" },
              severity: { type: "string", enum: ["critical", "warning", "info"] },
            },
            required: ["agent", "issue", "severity"],
            additionalProperties: false,
          },
        },
        corrections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              agent: { type: "string" },
              correction: { type: "string" },
            },
            required: ["agent", "correction"],
            additionalProperties: false,
          },
        },
        finalApproval: {
          type: "object",
          properties: {
            ceo: { type: "boolean" },
            cfo: { type: "boolean" },
            coo: { type: "boolean" },
          },
          required: ["ceo", "cfo", "coo"],
          additionalProperties: false,
        },
        approvalNotes: { type: "string" },
      },
      required: ["approved", "issues", "corrections", "finalApproval", "approvalNotes"],
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
};
