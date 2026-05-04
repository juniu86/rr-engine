# RR-Engine: Documento Técnico de Referência Completo

**Versão:** 2.15.3  
**Data:** 26 de março de 2026  
**Autor:** Technical Review - Manus AI  
**Status:** Produção  
**Linhas de Código:** 34.882 (TypeScript/TSX)

---

## Índice

1. [Visão Geral do Sistema](#visão-geral-do-sistema)
2. [Arquitetura Geral](#arquitetura-geral)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Fluxo de Dados End-to-End](#fluxo-de-dados-end-to-end)
5. [Estrutura de Banco de Dados](#estrutura-de-banco-de-dados)
6. [Sistema de Agentes Multi-Especializados](#sistema-de-agentes-multi-especializados)
7. [Componentes Frontend](#componentes-frontend)
8. [Procedures Backend (tRPC)](#procedures-backend-trpc)
9. [Integrações Externas](#integrações-externas)
10. [Mecanismos de Confiabilidade](#mecanismos-de-confiabilidade)
11. [Fluxos de Negócio Críticos](#fluxos-de-negócio-críticos)
12. [Considerações de Produção](#considerações-de-produção)

---

## 1. Visão Geral do Sistema

### 1.1 Propósito e Função

O **RR-Engine** é uma aplicação multi-agente especializada em orçamentação e propostas de engenharia. O sistema transforma **Memoriais Descritivos** (documentos de especificação técnica) em **Propostas Comerciais Completas** através de um pipeline sequencial de 10 agentes especializados, cada um contribuindo com expertise específica em diferentes domínios da engenharia de custos.

O fluxo processa:

1. **Input:** Memorial Descritivo (texto livre ou estruturado)
2. **Processamento:** 10 agentes em cadeia (Engenheiro Técnico → Auditor)
3. **Output:** Proposta Comercial, Cronograma, Fluxo de Caixa, Análise Tributária

### 1.2 Problema Resolvido

**Dor do Cliente:** Engenheiros e gestores de obras gastam 40-60 horas para transformar um memorial descritivo em uma proposta comercial, envolvendo:
- Tradução de especificações em itens de orçamento
- Pesquisa de preços em múltiplas bases (SINAPI, PINI)
- Cálculo de custos indiretos (logística, administrativo)
- Análise tributária (ISS vs. ICMS)
- Cronograma de execução
- Fluxo de caixa
- Validação de consistência

**Solução:** RR-Engine automatiza este processo em minutos, com precisão técnica e conformidade com normas NBR.

### 1.3 Escopo Funcional

O sistema cobre:

- **Orçamentação Técnica:** Decomposição de memoriais em itens de custo
- **Precificação de Mercado:** Integração com SINAPI, PINI e históricos de cotações
- **Logística:** Cálculo de custos invisíveis (fretes, bota-fora, deslocamento)
- **Tributação:** Otimização ISS/ICMS baseada em classificação fiscal
- **Comercial:** Aplicação de BDI e margens
- **Cronograma:** Estimativa de duração e fases de execução
- **Fluxo de Caixa:** Análise de necessidade de adiantamento
- **Jurídico:** Redação de cláusulas de proteção
- **Auditoria:** Validação matemática e consistência

---

## 2. Arquitetura Geral

### 2.1 Padrão de Arquitetura

O RR-Engine segue uma arquitetura **Cliente-Servidor com Orquestração de Agentes**:

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19)                      │
│  - Dashboard de Projetos                                     │
│  - Editor de Memorial Descritivo                             │
│  - Visualizador de Pipeline de Agentes                       │
│  - Formulários de Interatividade (v2.1)                      │
│  - Comparação de Revisões                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC (type-safe RPC)
                       │ OAuth 2.0 (Manus)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  BACKEND (Express + tRPC)                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ API Gateway (tRPC Router)                               ││
│  │  - project.* (CRUD de projetos)                         ││
│  │  - agent.* (execução e orquestração)                    ││
│  │  - document.* (geração de PDFs)                         ││
│  │  - stripe.* (pagamento)                                 ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Orquestrador de Agentes                                 ││
│  │  - Sequenciamento (1→2→3...→10)                         ││
│  │  - Persistência de Estado                               ││
│  │  - Retry com Backoff Exponencial                        ││
│  │  - Detecção de Truncamento                              ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 10 Agentes Especializados (LLM-powered)                 ││
│  │  1. Engenheiro Técnico                                  ││
│  │  2. Orçamentista & Suprimentos                          ││
│  │  3. Logística e Mobilização                             ││
│  │  4. Tributário                                          ││
│  │  5. Comercial                                           ││
│  │  6. Gestão de Projetos                                  ││
│  │  7. Financeiro                                          ││
│  │  8. Jurídico                                            ││
│  │  9. Board de Aprovação                                  ││
│  │ 10. Auditor de Consistência                             ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Serviços de Integração                                  ││
│  │  - SINAPI (Tabelas de Preço)                            ││
│  │  - PINI (Tabelas de Preço)                              ││
│  │  - Google Maps (Geolocalização)                         ││
│  │  - Stripe (Pagamento)                                   ││
│  │  - LLM Providers (Gemini, Claude, GPT)                  ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────────┘
                       │ MySQL/TiDB
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  BANCO DE DADOS (MySQL)                      │
│  - Users (Autenticação)                                      │
│  - Projects (Projetos e Memoriais)                           │
│  - Agent Executions (Estado dos Agentes)                     │
│  - Budget Items (Itens de Orçamento)                         │
│  - Logistics Costs (Custos Logísticos)                       │
│  - Schedule Items (Cronograma)                               │
│  - Cash Flow Items (Fluxo de Caixa)                          │
│  - Generated Documents (PDFs)                                │
│  - Company Settings (Configurações)                          │
│  - Subscriptions (Planos)                                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Padrões de Design Implementados

#### 2.2.1 Padrão de Agente Abstrato (Base Agent Pattern)

Cada agente especializado herda de uma classe `BaseAgent<TInput, TOutput>` que implementa:

- **Processamento de Resposta LLM:** Extração de conteúdo de múltiplos formatos (string, array multimodal, reasoning_content)
- **Detecção de Truncamento:** Identifica quando a resposta foi cortada via `finish_reason: "length"` ou estrutura JSON incompleta
- **Retry com Backoff Exponencial:** Tenta novamente em caso de erros 5xx (1s, 3s, 5s)
- **Validação de Schema:** Usa Zod para validar output antes de retornar

#### 2.2.2 Padrão de Interatividade (v2.1)

Agentes podem pausar a execução e solicitar informações faltantes ao usuário:

```typescript
interface AgentResponse<T> {
  status: "completed" | "waiting_for_user_input" | "failed";
  data?: T;
  missingInfoRequests?: MissingInfoRequest[];
  error?: string;
}
```

Quando um agente detecta informações incompletas, retorna `status: "waiting_for_user_input"` com lista de perguntas. O usuário responde via formulário, e o agente é retomado com as respostas.

#### 2.2.3 Padrão de Transação Atômica

Operações críticas (criar projeto + agentes, criar revisão) usam transações SQL para garantir consistência:

```typescript
// Criar projeto + 10 agentes em transação única
// Se falhar em qualquer ponto, tudo é revertido
await db.createProjectWithAgents({ ... });
```

#### 2.2.4 Padrão de Normalização de Entrada

Validação em duas camadas:

1. **Frontend:** `trim().toLowerCase()` antes de enviar
2. **Backend:** `.transform() + .pipe()` no Zod para robustez dupla

Exemplo: `agentType` é normalizado para garantir que "ENGENHEIRO_TECNICO", "Engenheiro_Técnico" e "engenheiro_tecnico" sejam tratados identicamente.

### 2.3 Fluxo de Requisição Típico

```
1. Usuário clica "Executar Agente" no Frontend
   ↓
2. Frontend chama trpc.agent.execute({ projectId, agentType })
   ↓
3. Backend valida autorização (ownership do projeto)
   ↓
4. Backend carrega estado anterior (projeto, outputs de agentes anteriores)
   ↓
5. Backend instancia agente específico
   ↓
6. Agente chama LLM com prompts customizados
   ↓
7. LLM retorna resposta (com retry se 5xx)
   ↓
8. BaseAgent processa resposta (extrai JSON, detecta truncamento)
   ↓
9. Agente valida output com schema Zod
   ↓
10. Backend persiste resultado em banco de dados
    ↓
11. Frontend recebe resultado e atualiza UI
    ↓
12. Se agente retornou "waiting_for_user_input", mostra formulário
    ↓
13. Usuário preenche formulário e clica "Continuar"
    ↓
14. Frontend chama trpc.agent.continueAgent({ projectId, agentType, userResponses })
    ↓
15. Backend retoma agente com respostas do usuário
    ↓
16. Agente re-executa com informações completas
    ↓
17. Resultado final é persistido
```

---

## 3. Stack Tecnológico

### 3.1 Frontend

| Tecnologia | Versão | Função |
|-----------|--------|--------|
| React | 19 | Framework UI |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4 | Styling |
| shadcn/ui | Latest | Componentes UI |
| tRPC Client | 11 | RPC type-safe |
| Wouter | Latest | Roteamento |
| Framer Motion | Latest | Animações |
| Recharts | Latest | Gráficos |
| Sonner | Latest | Toasts |
| Zod | Latest | Validação |

### 3.2 Backend

| Tecnologia | Versão | Função |
|-----------|--------|--------|
| Express | 4 | Framework HTTP |
| tRPC | 11 | RPC framework |
| Drizzle ORM | Latest | Query builder |
| MySQL | 8 | Banco de dados |
| Zod | Latest | Validação |
| Node.js | 22 | Runtime |

### 3.3 Integrações Externas

| Serviço | Função | Autenticação |
|---------|--------|--------------|
| Manus OAuth | Autenticação de usuários | OAuth 2.0 |
| Manus LLM API | Invocação de modelos (Gemini, Claude, GPT) | API Key |
| Google Maps | Geolocalização e roteamento | Proxy (sem chave) |
| SINAPI | Tabelas de preço de construção | Credenciais PINI |
| PINI | Tabelas de preço de construção | Credenciais PINI |
| Stripe | Processamento de pagamento | API Key |
| S3 (Manus) | Armazenamento de documentos | Pré-configurado |

### 3.4 Versões de LLM

O sistema suporta múltiplos provedores LLM com configuração dinâmica:

| Modelo | Provider | maxOutputTokens | supportsStrictSchema | supportsThinking |
|--------|----------|-----------------|---------------------|------------------|
| gemini-2.5-flash | Google Gemini | 65536 | false | false |
| claude-3.5-sonnet | Anthropic Claude | 16384 | false | false |
| gpt-4o | OpenAI | 16384 | true | false |

**Nota:** O `maxOutputTokens` do Gemini foi aumentado de 32768 para 65536 em v2.15.1 para evitar truncamento em memoriais com 30+ itens.

---

## 4. Fluxo de Dados End-to-End

### 4.1 Entrada: Memorial Descritivo

O usuário fornece um Memorial Descritivo de duas formas:

1. **Texto Livre:** Copia e cola o memorial no campo de texto
2. **Upload de Arquivo:** Carrega um PDF/DOCX que é processado

Exemplo de Memorial:

```
MEMORIAL DESCRITIVO - REFORMA POSTO DE COMBUSTÍVEL

1. ESTRUTURA
   - Reforço de fundação com injeção de resina epóxi
   - Reposição de blocos de concreto danificados
   - Impermeabilização de laje com manta asfáltica

2. COBERTURA
   - Substituição de telhas de fibrocimento por telhas cerâmicas
   - Limpeza e tratamento de madeiramento

3. PINTURA
   - Limpeza e preparação de superfícies
   - Pintura com tinta acrílica de alta durabilidade (3 demãos)
   - Área total: 500 m²

4. PISO
   - Remoção de piso antigo
   - Aplicação de contrapiso
   - Assentamento de cerâmica 50x50 cm
   - Rejuntamento com argamassa especial
   - Área total: 300 m²
```

### 4.2 Processamento: Pipeline de Agentes

#### **Agente 1: Engenheiro Técnico** (Ordem: 1)

**Input:**
```json
{
  "memorialDescritivo": "...",
  "contractType": "obra",
  "userResponses": { "area_pintura": 500, "area_piso": 300 }
}
```

**Responsabilidades:**
- Decompor memorial em tarefas de engenharia específicas
- Identificar informações faltantes (áreas, quantidades, especificações)
- Referenciar normas NBR aplicáveis
- Se faltar informação crítica, retornar `status: "waiting_for_user_input"`

**Output:**
```json
{
  "status": "completed",
  "data": {
    "tasks": [
      {
        "id": "reforco_fundacao",
        "description": "Reforço de fundação com injeção de resina epóxi",
        "nbrReference": "NBR 9575",
        "unit": "m²",
        "estimatedQuantity": 150,
        "specifications": {
          "material": "Resina epóxi de alta resistência",
          "applicationMethod": "Injeção sob pressão",
          "curing": "7 dias"
        }
      },
      ...
    ]
  }
}
```

#### **Agente 2: Orçamentista & Suprimentos** (Ordem: 2)

**Input:** Output do Agente 1 + Configurações de BDI

**Responsabilidades:**
- Precificar cada tarefa com realidade de mercado
- Consultar SINAPI e PINI para composições de preço
- Decompor em Material, Mão-de-Obra, Logística
- Aplicar margens de fornecedor

**Output:**
```json
{
  "status": "completed",
  "data": {
    "budgetItems": [
      {
        "id": "reforco_fundacao",
        "description": "Reforço de fundação com injeção de resina epóxi",
        "unit": "m²",
        "quantity": 150,
        "unitCostMaterial": 45.50,
        "unitCostLabor": 32.00,
        "unitCostLogistics": 5.50,
        "unitCostTotal": 83.00,
        "totalCost": 12450.00,
        "source": "SINAPI",
        "sourceCode": "95847",
        "sourceDate": "2026-03-20"
      },
      ...
    ],
    "totalDirectCost": 145000.00
  }
}
```

#### **Agente 3: Logística e Mobilização** (Ordem: 3)

**Input:** Output do Agente 2 + Localização do projeto

**Responsabilidades:**
- Calcular custos invisíveis: fretes, bota-fora, deslocamento, hospedagem
- Usar geolocalização (Google Maps) para distâncias
- Estimar quantidade de viagens, combustível, diárias

**Output:**
```json
{
  "status": "completed",
  "data": {
    "logisticsCosts": [
      {
        "category": "frete",
        "description": "Transporte de materiais do fornecedor para obra",
        "quantity": 8,
        "unit": "viagem",
        "unitCost": 450.00,
        "totalCost": 3600.00
      },
      {
        "category": "deslocamento",
        "description": "Deslocamento de equipe (25 km/dia, 30 dias)",
        "quantity": 30,
        "unit": "dia",
        "unitCost": 85.00,
        "totalCost": 2550.00
      },
      ...
    ],
    "totalLogisticsCost": 18500.00
  }
}
```

#### **Agente 4: Tributário** (Ordem: 4)

**Input:** Output do Agente 2 (Budget Items)

**Responsabilidades:**
- Classificar cada item como Serviço (ISS) ou Material (ICMS)
- Calcular impostos por classificação
- Otimizar carga tributária

**Output:**
```json
{
  "status": "completed",
  "data": {
    "taxAnalysis": {
      "serviceItems": [
        { "description": "Mão-de-obra", "amount": 50000.00, "taxType": "iss", "rate": 0.05, "tax": 2500.00 }
      ],
      "materialItems": [
        { "description": "Materiais", "amount": 95000.00, "taxType": "icms", "rate": 0.18, "tax": 17100.00 }
      ],
      "totalTaxes": 19600.00
    }
  }
}
```

#### **Agente 5: Comercial** (Ordem: 5)

**Input:** Custos Diretos + Indiretos + Impostos + BDI

**Responsabilidades:**
- Aplicar BDI (Benefícios e Despesas Indiretas)
- Calcular preço final de venda
- Definir margens

**Output:**
```json
{
  "status": "completed",
  "data": {
    "pricing": {
      "totalDirectCost": 145000.00,
      "totalLogisticsCost": 18500.00,
      "totalTaxes": 19600.00,
      "subtotal": 183100.00,
      "bdiPercentual": 25,
      "bdiAmount": 45775.00,
      "finalPrice": 228875.00,
      "marginPercentual": 25.0
    }
  }
}
```

#### **Agente 6: Gestão de Projetos** (Ordem: 6)

**Input:** Budget Items + Especificações Técnicas

**Responsabilidades:**
- Estimar duração total do projeto
- Criar cronograma com fases
- Definir dependências entre tarefas
- Calcular caminho crítico

**Output:**
```json
{
  "status": "completed",
  "data": {
    "schedule": {
      "totalDurationWeeks": 12,
      "phases": [
        { "name": "Preparação", "startWeek": 1, "endWeek": 2, "duration": 2 },
        { "name": "Estrutura", "startWeek": 3, "endWeek": 6, "duration": 4 },
        { "name": "Acabamento", "startWeek": 7, "endWeek": 12, "duration": 6 }
      ]
    }
  }
}
```

#### **Agente 7: Financeiro** (Ordem: 7)

**Input:** Budget Items + Cronograma + Preço Final

**Responsabilidades:**
- Criar fluxo de caixa semanal
- Identificar semanas com déficit
- Calcular necessidade de adiantamento
- Analisar rentabilidade

**Output:**
```json
{
  "status": "completed",
  "data": {
    "cashFlow": [
      { "week": 1, "plannedExpense": 15000, "plannedIncome": 0, "cashBalance": -15000 },
      { "week": 2, "plannedExpense": 18000, "plannedIncome": 20000, "cashBalance": -13000 },
      ...
    ],
    "advancementNeeded": 25000,
    "roi": 0.25
  }
}
```

#### **Agente 8: Jurídico** (Ordem: 8)

**Input:** Proposta Comercial + Análise Tributária

**Responsabilidades:**
- Redigir cláusulas de proteção
- Incluir termos de garantia
- Definir responsabilidades
- Incluir cláusulas de reajuste

**Output:**
```json
{
  "status": "completed",
  "data": {
    "legalClauses": [
      "Garantia de 12 meses para serviços executados",
      "Reajuste de preços conforme índice INCC-M",
      "Responsabilidade do contratante por acesso à obra",
      ...
    ]
  }
}
```

#### **Agente 9: Board de Aprovação** (Ordem: 9)

**Input:** Todos os outputs anteriores

**Responsabilidades:**
- Auditoria geral de consistência
- Validar margens e rentabilidade
- Verificar conformidade com políticas
- Aprovar ou rejeitar proposta

**Output:**
```json
{
  "status": "completed",
  "data": {
    "approved": true,
    "warnings": [
      "Margem abaixo de 20% em alguns itens",
      "Cronograma apertado para fase de acabamento"
    ],
    "recommendations": [
      "Considerar negociar prazos com cliente",
      "Revisar margens de materiais"
    ]
  }
}
```

#### **Agente 10: Auditor de Consistência** (Ordem: 10)

**Input:** Todos os outputs anteriores

**Responsabilidades:**
- Validação matemática (somas, percentuais)
- Verificar consistência entre documentos
- Detectar anomalias
- Gerar relatório final

**Output:**
```json
{
  "status": "completed",
  "data": {
    "validations": {
      "budgetMathematicalConsistency": true,
      "cashFlowConsistency": true,
      "taxCalculationConsistency": true,
      "scheduleRealism": true
    },
    "anomalies": [],
    "finalApproval": true
  }
}
```

### 4.3 Saída: Documentos Gerados

Após conclusão do pipeline, o sistema gera:

1. **Proposta Comercial (PDF):** Documento comercial completo com preços, cronograma, termos
2. **Memória de Cálculo (PDF):** Detalhamento de todos os cálculos e fontes de preço
3. **Cronograma (PDF):** Gráfico de Gantt com fases e dependências
4. **Planilha de Orçamento (XLSX):** Dados estruturados para edição posterior

---

## 5. Estrutura de Banco de Dados

### 5.1 Schema Completo

O banco de dados MySQL utiliza Drizzle ORM com as seguintes tabelas:

#### **Tabela: users**

Armazena informações de autenticação e perfil de usuários.

```typescript
{
  id: int (PK, autoincrement),
  openId: varchar(64) (UNIQUE, NOT NULL) - ID do OAuth Manus
  name: text
  email: varchar(320)
  loginMethod: varchar(64) - "oauth" | "saml"
  role: enum("user", "admin") (DEFAULT: "user")
  createdAt: timestamp (DEFAULT: NOW())
  updatedAt: timestamp (DEFAULT: NOW(), ON UPDATE NOW())
  lastSignedIn: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- UNIQUE: openId

**Relacionamentos:**
- 1:N com projects (userId)
- 1:N com company_settings (userId)
- 1:N com subscriptions (userId)

#### **Tabela: projects**

Armazena projetos e memoriais descritivos.

```typescript
{
  id: int (PK, autoincrement),
  userId: int (FK → users.id, NOT NULL),
  name: varchar(255) (NOT NULL),
  description: text,
  contractType: enum("manutencao", "obra") (NOT NULL),
  location: varchar(500),
  restrictions: text,
  memorialDescritivo: text,
  memorialFileUrl: varchar(1000),
  status: enum("draft", "processing", "review", "approved", "rejected", "blocked", "pending_confirmation", "waiting_for_input") (DEFAULT: "draft"),
  blockReason: text,
  warningMessages: text,
  currentAgentId: int (DEFAULT: 1),
  totalCostDirect: decimal(15,2),
  totalCostIndirect: decimal(15,2),
  totalTaxes: decimal(15,2),
  totalBdi: decimal(15,2),
  totalPrice: decimal(15,2),
  estimatedDuration: int (em dias),
  
  // Campos de Revisão
  parentProjectId: int (FK → projects.id, nullable),
  revisionNumber: int (DEFAULT: 0),
  originalName: varchar(255),
  
  // BDI Configurável
  bdiPercentual: decimal(6,2),
  bdiPreset: enum("padrao", "reduzido", "majorado", "personalizado") (DEFAULT: "padrao"),
  
  // Auto-Correção Financeira do Board
  financialRevisionCycle: int (DEFAULT: 0),
  financialRevisionReason: text,
  financialRevisionInstructions: json,
  
  createdAt: timestamp (DEFAULT: NOW()),
  updatedAt: timestamp (DEFAULT: NOW(), ON UPDATE NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: projects_userId_idx
- INDEX: projects_status_idx

**Relacionamentos:**
- N:1 com users (userId)
- 1:N com agent_executions (projectId)
- 1:N com budget_items (projectId)
- 1:N com logistics_costs (projectId)
- 1:N com schedule_items (projectId)
- 1:N com cash_flow_items (projectId)
- 1:N com generated_documents (projectId)

#### **Tabela: agent_executions**

Armazena histórico de execução de cada agente.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  agentType: enum("engenheiro_tecnico", "orcamentista", "logistica", "tributario", "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor") (NOT NULL),
  agentOrder: int (NOT NULL) - Ordem de execução (1-10)
  status: enum("pending", "running", "completed", "failed", "needs_review", "waiting_for_user_input") (DEFAULT: "pending"),
  input: json - Input fornecido ao agente
  output: json - Output retornado pelo agente
  errors: json - Array de erros se status = "failed"
  
  // Interatividade v2.1
  missingInfoRequests: json - Array de MissingInfoRequest
  userResponses: json - Record<fieldId, value>
  iterationCount: int (DEFAULT: 0),
  
  startedAt: timestamp,
  completedAt: timestamp,
  createdAt: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: agent_executions_projectId_idx
- INDEX: agent_executions_agentType_idx

#### **Tabela: budget_items**

Armazena itens de orçamento decompostos pelo Orçamentista.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  parentId: int (FK → budget_items.id, nullable) - Para hierarquia
  category: varchar(100),
  code: varchar(50),
  description: text (NOT NULL),
  unit: varchar(20) - "m²", "m", "un", etc.
  quantity: decimal(15,4),
  unitCostMaterial: decimal(15,2),
  unitCostLabor: decimal(15,2),
  unitCostLogistics: decimal(15,2),
  unitCostTotal: decimal(15,2),
  totalCost: decimal(15,2),
  taxType: enum("iss", "icms", "both", "none") (DEFAULT: "none"),
  taxAmount: decimal(15,2),
  bdiAmount: decimal(15,2),
  finalPrice: decimal(15,2),
  source: varchar(100) - "SINAPI", "PINI", "Mercado"
  sourceCode: varchar(50) - Código da composição
  sourceDate: varchar(20) - Data da cotação
  isPendingReview: boolean (DEFAULT: false),
  notes: text,
  createdAt: timestamp (DEFAULT: NOW()),
  updatedAt: timestamp (DEFAULT: NOW(), ON UPDATE NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: budget_items_projectId_idx

#### **Tabela: logistics_costs**

Armazena custos logísticos calculados pelo agente de Logística.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  category: enum("frete", "bota_fora", "deslocamento", "hospedagem", "alimentacao", "equipamentos", "outros") (NOT NULL),
  description: text (NOT NULL),
  quantity: decimal(15,4),
  unit: varchar(20),
  unitCost: decimal(15,2),
  totalCost: decimal(15,2),
  source: varchar(100),
  notes: text,
  createdAt: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: logistics_costs_projectId_idx

#### **Tabela: schedule_items**

Armazena itens de cronograma criados pelo agente de Gestão de Projetos.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  budgetItemId: int (FK → budget_items.id, nullable),
  phase: varchar(100),
  description: text (NOT NULL),
  startWeek: int,
  endWeek: int,
  duration: int (em dias),
  percentComplete: decimal(5,2) (DEFAULT: 0),
  dependencies: json - Array de IDs de tarefas precedentes
  createdAt: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: schedule_items_projectId_idx

#### **Tabela: cash_flow_items**

Armazena fluxo de caixa semanal calculado pelo agente Financeiro.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  weekNumber: int (NOT NULL),
  plannedExpense: decimal(15,2),
  plannedIncome: decimal(15,2),
  cumulativeExpense: decimal(15,2),
  cumulativeIncome: decimal(15,2),
  cashBalance: decimal(15,2),
  hasAlert: boolean (DEFAULT: false),
  alertMessage: text,
  createdAt: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: cash_flow_items_projectId_idx

#### **Tabela: generated_documents**

Armazena referências aos documentos PDF gerados.

```typescript
{
  id: int (PK, autoincrement),
  projectId: int (FK → projects.id, NOT NULL),
  documentType: enum("proposta_comercial", "memoria_calculo", "cronograma") (NOT NULL),
  fileName: varchar(255) (NOT NULL),
  fileUrl: varchar(1000) (NOT NULL) - URL pública do S3
  fileKey: varchar(500) (NOT NULL) - Chave do S3
  version: int (DEFAULT: 1),
  createdAt: timestamp (DEFAULT: NOW())
}
```

**Índices:**
- PRIMARY KEY: id
- INDEX: generated_documents_projectId_idx

#### **Tabela: company_settings**

Armazena configurações da empresa do usuário (BDI, impostos, etc.).

```typescript
{
  id: int (PK, autoincrement),
  userId: int (FK → users.id, NOT NULL),
  bdiPercentual: decimal(6,2) (DEFAULT: 25),
  issRate: decimal(5,2) (DEFAULT: 5),
  icmsRate: decimal(5,2) (DEFAULT: 18),
  adminCostPerMonth: decimal(15,2) (DEFAULT: 25000),
  companyName: varchar(255),
  cnpj: varchar(20),
  address: text,
  phone: varchar(20),
  email: varchar(320),
  createdAt: timestamp (DEFAULT: NOW()),
  updatedAt: timestamp (DEFAULT: NOW(), ON UPDATE NOW())
}
```

#### **Tabela: subscriptions**

Armazena informações de plano e créditos do usuário.

```typescript
{
  id: int (PK, autoincrement),
  userId: int (FK → users.id, NOT NULL),
  planType: enum("free", "pro", "enterprise") (NOT NULL),
  stripeSubscriptionId: varchar(255),
  budgetCredits: int (NOT NULL),
  budgetCreditsUsed: int (DEFAULT: 0),
  status: enum("active", "canceled", "past_due") (NOT NULL),
  currentPeriodStart: timestamp,
  currentPeriodEnd: timestamp,
  createdAt: timestamp (DEFAULT: NOW()),
  updatedAt: timestamp (DEFAULT: NOW(), ON UPDATE NOW())
}
```

### 5.2 Relacionamentos e Integridade Referencial

```
users (1) ──── (N) projects
users (1) ──── (N) company_settings
users (1) ──── (N) subscriptions

projects (1) ──── (N) agent_executions
projects (1) ──── (N) budget_items
projects (1) ──── (N) logistics_costs
projects (1) ──── (N) schedule_items
projects (1) ──── (N) cash_flow_items
projects (1) ──── (N) generated_documents

budget_items (1) ──── (N) budget_items (self-referential via parentId)
budget_items (1) ──── (N) schedule_items
```

### 5.3 Estratégia de Persistência

#### **Criação de Projeto (Transação Atômica)**

```typescript
// Dentro de uma transação SQL
1. INSERT INTO projects (...)
2. INSERT INTO agent_executions (agentType=1, status='pending') x10
// Se qualquer INSERT falhar, toda a transação é revertida
```

#### **Execução de Agente (Persistência Incremental)**

```typescript
// Para cada agente que completa
1. UPDATE agent_executions SET status='completed', output=JSON, completedAt=NOW()
2. DELETE FROM budget_items WHERE projectId=? (limpar itens antigos)
3. INSERT INTO budget_items (...)  (inserir novos itens)
4. UPDATE projects SET totalCostDirect=?, status=?
```

#### **Criação de Revisão (Snapshot)**

```typescript
// Criar novo projeto como cópia
1. INSERT INTO projects (parentProjectId=original_id, revisionNumber=original_revision+1, ...)
2. INSERT INTO agent_executions (agentType=1, status='pending') x10
// Projeto original permanece intacto, nova revisão começa do zero
```

---

## 6. Sistema de Agentes Multi-Especializados

### 6.1 Arquitetura de Agentes

Cada agente é uma classe que estende `BaseAgent<TInput, TOutput>`:

```typescript
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract type: AgentType;
  
  abstract getSystemPrompt(): string;
  abstract getUserPrompt(input: TInput): string;
  abstract getOutputSchema(): object;
  
  private _processLLMResponse(response: unknown): string { ... }
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> { ... }
  private async _execute(input: TInput): Promise<TOutput> { ... }
  async execute(input: TInput): Promise<TOutput> { ... }
}
```

### 6.2 Ciclo de Vida de um Agente

```
1. INICIALIZAÇÃO
   ├─ Carregar estado anterior do projeto
   ├─ Validar autorização do usuário
   └─ Instanciar classe do agente

2. PREPARAÇÃO
   ├─ Montar system prompt (instruções do agente)
   ├─ Montar user prompt (dados específicos do projeto)
   ├─ Definir schema de output esperado
   └─ Selecionar LLM provider

3. INVOCAÇÃO
   ├─ Chamar LLM com prompts + schema
   ├─ Implementar retry com backoff exponencial (1s, 3s, 5s)
   └─ Retornar resposta ou erro

4. PROCESSAMENTO
   ├─ Extrair conteúdo de múltiplos formatos
   ├─ Detectar truncamento (finish_reason: "length")
   ├─ Fazer parse JSON
   └─ Validar com Zod schema

5. PERSISTÊNCIA
   ├─ Salvar output em agent_executions
   ├─ Atualizar status do projeto
   ├─ Inserir/atualizar dados específicos (budget_items, etc.)
   └─ Notificar frontend

6. TRANSIÇÃO
   ├─ Se agente retornou "waiting_for_user_input"
   │  └─ Mostrar formulário e aguardar resposta
   ├─ Se agente completou com sucesso
   │  └─ Passar para próximo agente
   └─ Se agente falhou
      └─ Marcar projeto como "blocked" com motivo
```

### 6.3 Mecanismo de Retry com Backoff Exponencial

Implementado em `BaseAgent.executeWithRetry()`:

```typescript
private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  const backoffs = [1000, 3000, 5000]; // 1s, 3s, 5s

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const statusCode = error?.message?.match(/(\d{3})/)?.[0];
      
      // Retry apenas para erros 5xx
      if (attempt < maxAttempts && statusCode >= 500 && statusCode < 600) {
        const waitTime = backoffs[attempt - 1];
        console.warn(`[Agent ${this.name}] Attempt ${attempt} failed with status ${statusCode}. Retrying in ${waitTime}ms...`);
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }
      throw error;
    }
  }
}
```

**Comportamento:**
- Tentativa 1 falha com 503 → Aguarda 1s → Tenta novamente
- Tentativa 2 falha com 503 → Aguarda 3s → Tenta novamente
- Tentativa 3 falha com 503 → Lança erro
- Erro 4xx em qualquer tentativa → Lança erro imediatamente

### 6.4 Detecção de Truncamento

O sistema detecta truncamento de resposta em dois pontos:

#### **Detecção 1: finish_reason**

```typescript
const finishReason = response.choices?.[0]?.finish_reason;
if (finishReason === "max_tokens" || finishReason === "length") {
  throw new Error(`Response truncated (finish_reason: ${finishReason})`);
}
```

#### **Detecção 2: Estrutura JSON Incompleta**

```typescript
const trimmed = content.trim();
const isLikelyTruncated = 
  (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
  (trimmed.startsWith('[') && !trimmed.endsWith(']'));

if (isLikelyTruncated) {
  throw new Error(`Response truncated mid-JSON`);
}
```

**Solução:** Aumentar `maxOutputTokens` do provider LLM (ex: Gemini 32768 → 65536).

### 6.5 Interatividade v2.1

Quando um agente detecta informações faltantes, pode pausar e solicitar ao usuário:

#### **Agente Retorna:**

```json
{
  "status": "waiting_for_user_input",
  "missingInfoRequests": [
    {
      "fieldId": "area_pintura_sala",
      "question": "Qual a área em m² da parede da sala a ser pintada?",
      "type": "number",
      "unit": "m²",
      "required": true,
      "hint": "Multiplicar altura × largura"
    },
    {
      "fieldId": "tipo_piso",
      "question": "Qual tipo de piso será utilizado?",
      "type": "select",
      "options": ["cerâmica", "porcelanato", "madeira", "vinílico"],
      "required": true
    }
  ]
}
```

#### **Frontend Mostra Formulário:**

```
┌─────────────────────────────────────────┐
│ Agente Engenheiro Técnico aguardando    │
│ informações faltantes                   │
├─────────────────────────────────────────┤
│ Qual a área em m² da parede?            │
│ [_________] m²                          │
│                                         │
│ Qual tipo de piso será utilizado?       │
│ [Selecione] ▼                           │
│   - cerâmica                            │
│   - porcelanato                         │
│   - madeira                             │
│   - vinílico                            │
│                                         │
│ [Cancelar]  [Continuar]                 │
└─────────────────────────────────────────┘
```

#### **Usuário Responde:**

```json
{
  "area_pintura_sala": 150,
  "tipo_piso": "cerâmica"
}
```

#### **Frontend Chama:**

```typescript
trpc.agent.continueAgent.useMutation({
  projectId: 123,
  agentType: "engenheiro_tecnico",
  userResponses: { "area_pintura_sala": 150, "tipo_piso": "cerâmica" }
})
```

#### **Backend Retoma Agente:**

```typescript
// Agente é re-executado com as respostas do usuário
const output = await agent.execute({
  ...previousInput,
  userResponses: { "area_pintura_sala": 150, "tipo_piso": "cerâmica" }
});
```

---

## 7. Componentes Frontend

### 7.1 Estrutura de Páginas

O frontend utiliza roteamento com Wouter e lazy loading:

```
/                          → Home (Landing Page)
/dashboard                 → Dashboard (Lista de Projetos)
/projects/new              → Criar Novo Projeto
/projects/:id              → Detalhes do Projeto (Pipeline)
/projects/:id/compare      → Comparar Revisões
/admin                     → Admin Dashboard (apenas admin)
/settings                  → Configurações do Usuário
/planos                    → Página de Planos
/404                       → Página não encontrada
```

### 7.2 Componentes Principais

#### **DashboardLayout**

Componente wrapper que fornece:
- Sidebar com navegação
- Header com autenticação
- Layout responsivo
- Gerenciamento de tema (dark/light)

Usado em: Dashboard, ProjectDetails, Settings, AdminDashboard

#### **ProjectDetails**

Página principal de um projeto. Responsabilidades:

1. **Exibição de Pipeline:** Mostra 10 agentes em sequência com status
2. **Controle de Execução:** Botões para executar/pausar agentes
3. **Visualização de Dados:** Tabs para orçamento, cronograma, fluxo de caixa
4. **Interatividade v2.1:** Modal para solicitar informações faltantes
5. **Edição de Memorial:** Permite editar memorial e criar revisão
6. **Geração de Documentos:** Botões para baixar PDF

**Estado Local:**

```typescript
const [isEditingMemorial, setIsEditingMemorial] = useState(false);
const [editedMemorial, setEditedMemorial] = useState("");
const [showMissingInfoDialog, setShowMissingInfoDialog] = useState(false);
const [missingInfoRequests, setMissingInfoRequests] = useState<MissingInfoRequest[]>([]);
const [userResponses, setUserResponses] = useState<Record<string, string | number>>({});
const [waitingAgentType, setWaitingAgentType] = useState<string | null>(null);
```

**Queries tRPC:**

```typescript
const { data: details, isLoading, refetch } = trpc.project.getDetails.useQuery({ id: projectId });
const { data: interactions } = trpc.project.getAgentInteractionHistory.useQuery({ projectId });
```

**Mutations tRPC:**

```typescript
const executeAgent = trpc.agent.execute.useMutation();
const continueAgent = trpc.agent.continueAgent.useMutation();
const createRevision = trpc.project.createRevision.useMutation();
const generateDocument = trpc.document.generate.useMutation();
```

#### **AgentProgressPipeline**

Componente visual que mostra o pipeline de 10 agentes:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Engenheiro Técnico [✓] → 2. Orçamentista [⏳] → 3. Logística [⏳] ...
└──────────────────────────────────────────────────────────────┘
```

**Props:**

```typescript
interface AgentProgressPipelineProps {
  agents: Array<{
    type: AgentType;
    status: AgentStatus;
    output?: any;
    error?: string;
  }>;
  currentAgentId: number;
  onAgentClick?: (agentType: AgentType) => void;
}
```

#### **Componentes de Visualização de Dados**

- **MoneyValue:** Formata valores monetários com símbolo R$
- **AreaChart:** Gráfico de fluxo de caixa (Recharts)
- **PieChart:** Distribuição de custos (Recharts)
- **Table:** Tabela de itens de orçamento (shadcn/ui)

### 7.3 Hooks Customizados

#### **useAuth()**

Obtém informações do usuário autenticado:

```typescript
const { user, isLoading, getLoginUrl } = useAuth();

// user: { id, name, email, role }
// isLoading: boolean
// getLoginUrl(): string - URL para fazer login
```

Implementado em: `client/src/_core/hooks/useAuth.ts`

#### **useTheme()**

Gerencia tema dark/light:

```typescript
const { theme, setTheme } = useTheme();

// theme: "dark" | "light"
// setTheme: (theme: "dark" | "light") => void
```

### 7.4 Fluxo de Autenticação

```
1. Usuário acessa /
   ├─ Se não autenticado → Mostra botão "Fazer Login"
   └─ Se autenticado → Redireciona para /dashboard

2. Usuário clica "Fazer Login"
   ├─ Frontend chama getLoginUrl()
   ├─ Redireciona para Manus OAuth Portal
   └─ Usuário faz login com Manus

3. Manus OAuth redireciona para /api/oauth/callback
   ├─ Backend valida código OAuth
   ├─ Cria/atualiza usuário no banco
   ├─ Define session cookie
   └─ Redireciona para /dashboard

4. Frontend lê session cookie
   ├─ Carrega dados do usuário via trpc.auth.me
   └─ Mostra dashboard
```

---

## 8. Procedures Backend (tRPC)

### 8.1 Estrutura de Routers

```typescript
export const appRouter = router({
  system: systemRouter,
  stripe: stripeRouter,
  
  auth: router({
    me: publicProcedure.query(...),
    logout: publicProcedure.mutation(...),
  }),
  
  project: router({
    create: protectedProcedure.mutation(...),
    list: protectedProcedure.query(...),
    get: protectedProcedure.query(...),
    update: protectedProcedure.mutation(...),
    delete: protectedProcedure.mutation(...),
    createRevision: protectedProcedure.mutation(...),
    getDetails: protectedProcedure.query(...),
    getAgentInteractionHistory: protectedProcedure.query(...),
  }),
  
  agent: router({
    execute: protectedProcedure.mutation(...),
    continueAgent: protectedProcedure.mutation(...),
  }),
  
  document: router({
    generate: protectedProcedure.mutation(...),
    list: protectedProcedure.query(...),
    download: protectedProcedure.query(...),
  }),
});
```

### 8.2 Procedures Críticas

#### **project.create**

**Input:**
```typescript
{
  name: string,
  description?: string,
  contractType: "manutencao" | "obra",
  location?: string,
  restrictions?: string,
  memorialDescritivo?: string
}
```

**Lógica:**
1. Verificar se usuário tem créditos disponíveis (gate de pagamento)
2. Consumir 1 crédito atomicamente
3. Criar projeto + 10 agentes em transação
4. Retornar projectId

**Erro Possível:**
```
FORBIDDEN: "Sem plano ativo ou créditos disponíveis"
```

#### **agent.execute**

**Input:**
```typescript
{
  projectId: number,
  agentType: AgentType
}
```

**Lógica:**
1. Validar ownership do projeto
2. Carregar estado anterior do projeto
3. Instanciar agente específico
4. Chamar agente.execute()
5. Persistir output em agent_executions
6. Atualizar status do projeto
7. Retornar resultado

**Validação de Entrada:**
```typescript
agentType: z.string()
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.enum([...]))
```

#### **agent.continueAgent**

**Input:**
```typescript
{
  projectId: number,
  agentType: AgentType,
  userResponses: Record<string, string | number>
}
```

**Lógica:**
1. Validar ownership do projeto
2. Buscar execução anterior do agente
3. Validar que agente está em status "waiting_for_user_input"
4. Retomar agente com userResponses
5. Persistir resultado
6. Retornar resultado

#### **document.generate**

**Input:**
```typescript
{
  projectId: number,
  documentType: "proposta_comercial" | "memoria_calculo" | "cronograma"
}
```

**Lógica:**
1. Validar que projeto está "approved"
2. Validar que todos os agentes completaram
3. Gerar documento PDF usando dados persistidos
4. Upload para S3
5. Salvar referência em generated_documents
6. Retornar URL pública

### 8.3 Validação com Zod

Todos os inputs são validados com Zod antes de processar:

```typescript
.input(z.object({
  projectId: z.number().int().positive(),
  agentType: z.string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.enum([...])),
  userResponses: z.record(z.string(), z.union([z.string(), z.number()])),
}))
```

**Benefícios:**
- Type safety end-to-end (frontend → backend)
- Validação automática de tipos
- Mensagens de erro claras
- Previne erros de tipo em runtime

### 8.4 Autorização (Ownership Check)

Cada procedure protegida valida que o usuário é dono do recurso:

```typescript
const project = await db.getProjectById(input.id);
if (!project) throw new TRPCError({ code: "NOT_FOUND" });
if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
```

---

## 9. Integrações Externas

### 9.1 SINAPI (Sistema Nacional de Pesquisa de Custos e Índices)

**Propósito:** Base de dados oficial de preços de construção do Brasil (IBGE)

**Integração:**
- Endpoint: `server/services/sinapi.ts`
- Credenciais: PINI_USER, PINI_PASS (compartilhadas com PINI)
- Método: REST API com autenticação básica

**Funções:**

```typescript
export async function searchSinapi(query: string): Promise<SinapiComposition[]>
// Busca composições de preço por palavra-chave

export async function getSinapiComposition(code: string): Promise<SinapiComposition>
// Obtém detalhes de uma composição específica
```

**Estrutura de Composição:**

```json
{
  "code": "95847",
  "description": "Injeção de resina epóxi em fundação",
  "unit": "m²",
  "unitCost": 83.50,
  "components": [
    { "type": "material", "description": "Resina epóxi", "cost": 45.50 },
    { "type": "labor", "description": "Mão-de-obra", "cost": 32.00 },
    { "type": "equipment", "description": "Equipamento", "cost": 6.00 }
  ],
  "date": "2026-03-20"
}
```

### 9.2 PINI (Pesquisa Nacional de Índices de Preços)

**Propósito:** Base de dados de preços de construção com histórico

**Integração:**
- Endpoint: `server/services/pini.ts`
- Credenciais: PINI_USER, PINI_PASS
- Método: REST API

**Funções:**

```typescript
export async function searchPini(query: string): Promise<PiniComposition[]>
export async function getPiniComposition(code: string): Promise<PiniComposition>
export async function comparePrices(sinapiCode: string, piniCode: string): Promise<PriceComparison>
```

### 9.3 Google Maps

**Propósito:** Geolocalização, cálculo de distâncias, roteamento

**Integração:**
- Endpoint: Proxy Manus (sem chave do usuário)
- Componente: `client/src/components/Map.tsx`
- Método: JavaScript SDK

**Funcionalidades:**
- Localizar endereço do projeto
- Calcular distância para fornecedores
- Estimar tempo de deslocamento
- Visualizar rota

**Uso no RR-Engine:**
- Agente de Logística usa para calcular distâncias (frete, deslocamento)

### 9.4 Stripe (Pagamento)

**Propósito:** Processamento de pagamento para planos

**Integração:**
- Endpoint: `server/routers/stripe.ts`
- Credenciais: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Método: REST API

**Fluxo:**

```
1. Usuário seleciona plano em /planos
   ↓
2. Frontend chama trpc.stripe.createCheckoutSession
   ↓
3. Backend cria Stripe Checkout Session
   ↓
4. Frontend redireciona para Stripe Checkout
   ↓
5. Usuário completa pagamento
   ↓
6. Stripe envia webhook para /api/stripe/webhook
   ↓
7. Backend valida e atualiza subscription
   ↓
8. Usuário é redirecionado para /dashboard
```

**Webhook Events:**
- `checkout.session.completed`: Pagamento bem-sucedido
- `customer.subscription.created`: Assinatura criada
- `customer.subscription.updated`: Assinatura atualizada
- `invoice.paid`: Fatura paga

### 9.5 LLM Providers

#### **Gemini 2.5 Flash (Google)**

- **maxOutputTokens:** 65536 (aumentado em v2.15.1)
- **supportsStrictSchema:** false
- **supportsThinking:** false
- **Custo:** Mais econômico
- **Latência:** Baixa

#### **Claude 3.5 Sonnet (Anthropic)**

- **maxOutputTokens:** 16384
- **supportsStrictSchema:** false
- **supportsThinking:** false
- **Custo:** Médio
- **Latência:** Média

#### **GPT-4o (OpenAI)**

- **maxOutputTokens:** 16384
- **supportsStrictSchema:** true (strict JSON mode)
- **supportsThinking:** false
- **Custo:** Mais caro
- **Latência:** Média

**Seleção de Provider:**

```typescript
const modelConfig = {
  "gemini-2.5-flash": { maxOutputTokens: 65536, supportsStrictSchema: false },
  "claude-3.5-sonnet": { maxOutputTokens: 16384, supportsStrictSchema: false },
  "gpt-4o": { maxOutputTokens: 16384, supportsStrictSchema: true },
};

const provider = modelConfig[process.env.LLM_MODEL ?? "gemini-2.5-flash"];
```

### 9.6 S3 (Armazenamento de Documentos)

**Propósito:** Armazenar PDFs gerados (Proposta, Memória de Cálculo, Cronograma)

**Integração:**
- Endpoint: `server/storage.ts`
- Credenciais: Pré-configuradas (Manus)
- Método: AWS SDK

**Funções:**

```typescript
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType?: string
): Promise<{ key: string; url: string }>

export async function storageGet(
  relKey: string,
  expiresIn?: number
): Promise<{ key: string; url: string }>
```

**Exemplo:**

```typescript
const { url } = await storagePut(
  `projects/${projectId}/proposta-comercial.pdf`,
  pdfBuffer,
  "application/pdf"
);
// url: https://s3.amazonaws.com/bucket/projects/123/proposta-comercial.pdf
```

---

## 10. Mecanismos de Confiabilidade

### 10.1 Retry com Backoff Exponencial

Implementado em `BaseAgent.executeWithRetry()`:

**Cenário:** Agente falha com erro 503 (Service Unavailable)

```
Tentativa 1: Falha com 503
  ↓ Aguarda 1s
Tentativa 2: Falha com 503
  ↓ Aguarda 3s
Tentativa 3: Falha com 503
  ↓ Lança erro
```

**Código:**

```typescript
private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  const backoffs = [1000, 3000, 5000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const statusCode = error?.message?.match(/(\d{3})/)?.[0];
      
      if (attempt < maxAttempts && statusCode >= 500 && statusCode < 600) {
        const waitTime = backoffs[attempt - 1];
        console.warn(`[Agent ${this.name}] Attempt ${attempt} failed with status ${statusCode}. Retrying in ${waitTime}ms...`);
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }
      throw error;
    }
  }
}
```

### 10.2 Detecção de Truncamento

#### **Método 1: finish_reason**

```typescript
const finishReason = response.choices?.[0]?.finish_reason;
if (finishReason === "max_tokens" || finishReason === "length") {
  throw new Error(`Response truncated (finish_reason: ${finishReason})`);
}
```

#### **Método 2: Estrutura JSON Incompleta**

```typescript
const trimmed = content.trim();
const isLikelyTruncated = 
  (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
  (trimmed.startsWith('[') && !trimmed.endsWith(']'));

if (isLikelyTruncated) {
  throw new Error(`Response truncated mid-JSON`);
}
```

**Solução:** Aumentar `maxOutputTokens` do provider LLM.

### 10.3 Validação com Zod

Todos os inputs e outputs são validados:

```typescript
// Input validation
.input(z.object({
  projectId: z.number().int().positive(),
  agentType: z.string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.enum([...])),
}))

// Output validation
const parsed = JSON.parse(content) as TOutput;
// Zod schema é aplicado implicitamente via TypeScript
```

### 10.4 Transações Atômicas

Operações críticas usam transações SQL:

```typescript
// Criar projeto + 10 agentes atomicamente
await db.transaction(async (tx) => {
  const projectId = await tx.insert(projects).values({...});
  await tx.insert(agentExecutions).values([
    { projectId, agentType: "engenheiro_tecnico", agentOrder: 1, ... },
    { projectId, agentType: "orcamentista", agentOrder: 2, ... },
    ...
  ]);
  return projectId;
});
```

**Garantia:** Se qualquer INSERT falhar, toda a transação é revertida.

### 10.5 Logging e Monitoramento

Cada agente registra eventos:

```typescript
console.log(`[Agent ${this.name}] Starting execution...`);
console.log(`[Agent ${this.name}] Content preview:`, content.substring(0, 200));
console.log(`[Agent ${this.name}] Successfully parsed output`);
console.warn(`[Agent ${this.name}] Attempt ${attempt} failed with status ${statusCode}. Retrying...`);
console.error(`[Agent ${this.name}] LLM call failed:`, llmError);
```

**Logs Disponíveis em:**
- Console do servidor
- Manus Dashboard (logs persistidos)

### 10.6 Error Boundaries (Frontend)

Componente `ErrorBoundary` captura erros não tratados:

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    // Mostrar UI de erro amigável
  }
}
```

---

## 11. Fluxos de Negócio Críticos

### 11.1 Fluxo: Criar Novo Projeto

```
1. Usuário acessa /projects/new
   ├─ Frontend carrega formulário
   └─ Usuário preenche:
      - Nome do projeto
      - Tipo de contrato (Obra/Manutenção)
      - Localização
      - Memorial Descritivo

2. Usuário clica "Criar Projeto"
   ├─ Frontend valida campos obrigatórios
   └─ Frontend chama trpc.project.create

3. Backend processa
   ├─ Valida autorização (user autenticado)
   ├─ Verifica créditos disponíveis
   ├─ Consome 1 crédito atomicamente
   ├─ Cria projeto com status "draft"
   ├─ Cria 10 agentes com status "pending"
   └─ Retorna projectId

4. Frontend recebe projectId
   ├─ Redireciona para /projects/{projectId}
   └─ Carrega página de detalhes

5. Usuário vê pipeline de agentes
   ├─ Todos os agentes em status "pending"
   ├─ Botão "Executar Próximo Agente" habilitado
   └─ Usuário clica para iniciar
```

### 11.2 Fluxo: Executar Pipeline de Agentes

```
1. Usuário clica "Executar Próximo Agente"
   ├─ Frontend identifica agente com status "pending"
   └─ Frontend chama trpc.agent.execute

2. Backend executa Agente 1 (Engenheiro Técnico)
   ├─ Carrega estado do projeto
   ├─ Instancia EngenheiroTecnicoAgent
   ├─ Chama LLM com prompts customizados
   ├─ Processa resposta (com retry se 5xx)
   ├─ Valida output com Zod
   └─ Persiste em agent_executions

3. Agente 1 retorna resultado
   ├─ Se "completed": Avança para Agente 2
   ├─ Se "waiting_for_user_input": Mostra formulário
   └─ Se "failed": Marca projeto como "blocked"

4. Se "waiting_for_user_input"
   ├─ Frontend mostra modal com formulário
   ├─ Usuário preenche informações faltantes
   ├─ Frontend chama trpc.agent.continueAgent
   ├─ Backend retoma agente com respostas
   └─ Agente completa com informações completas

5. Agente 1 completa
   ├─ Backend atualiza status para "completed"
   ├─ Agente 2 muda de "pending" para "running"
   ├─ Frontend refetch dados
   └─ Usuário clica novamente para executar Agente 2

6. Processo repete para Agentes 2-10
   ├─ Cada agente recebe outputs dos anteriores
   ├─ Cada agente persiste seus dados específicos
   └─ Status do projeto avança

7. Agente 10 (Auditor) completa
   ├─ Backend atualiza status do projeto para "approved"
   ├─ Todos os agentes em status "completed"
   ├─ Botão "Gerar Documentos" fica habilitado
   └─ Usuário pode baixar Proposta, Cronograma, etc.
```

### 11.3 Fluxo: Gerar Documentos

```
1. Usuário clica "Gerar Proposta Comercial"
   ├─ Frontend valida que projeto está "approved"
   └─ Frontend chama trpc.document.generate

2. Backend gera documento
   ├─ Carrega todos os dados persistidos
   ├─ Monta estrutura do PDF
   ├─ Inclui:
   │  - Dados do projeto
   │  - Itens de orçamento
   │  - Cronograma
   │  - Fluxo de caixa
   │  - Análise tributária
   │  - Termos e condições
   └─ Renderiza PDF

3. Backend faz upload para S3
   ├─ Gera chave única: projects/{projectId}/proposta-comercial.pdf
   ├─ Upload do PDF
   └─ Obtém URL pública

4. Backend persiste referência
   ├─ Insere em generated_documents
   └─ Retorna URL pública

5. Frontend recebe URL
   ├─ Mostra link para download
   ├─ Usuário clica para baixar
   └─ Navegador faz download do PDF
```

### 11.4 Fluxo: Criar Revisão

```
1. Usuário edita memorial descritivo
   ├─ Clica "Editar Memorial"
   ├─ Modal abre com texto do memorial
   └─ Usuário faz alterações

2. Usuário clica "Criar Revisão"
   ├─ Frontend valida que memorial foi alterado
   └─ Frontend chama trpc.project.createRevision

3. Backend cria revisão
   ├─ Valida que projeto original existe
   ├─ Cria novo projeto com:
   │  - parentProjectId = projeto original
   │  - revisionNumber = original + 1
   │  - memorialDescritivo = novo memorial
   │  - status = "draft"
   ├─ Cria 10 agentes com status "pending"
   └─ Retorna newProjectId

4. Frontend redireciona
   ├─ Navega para /projects/{newProjectId}
   ├─ Novo projeto começa do zero (Agente 1 = pending)
   └─ Usuário executa pipeline novamente

5. Usuário pode comparar revisões
   ├─ Clica "Comparar com Original"
   ├─ Frontend carrega /projects/{projectId}/compare
   ├─ Mostra lado-a-lado:
   │  - Orçamento original vs. revisão
   │  - Cronograma original vs. revisão
   │  - Preço final original vs. revisão
   └─ Usuário vê impacto das alterações
```

---

## 12. Considerações de Produção

### 12.1 Performance

#### **Otimizações Implementadas**

1. **Lazy Loading de Páginas:** React.lazy + Suspense
2. **Índices de Banco:** projectId, agentType, status
3. **Caching de Queries:** tRPC com stale-while-revalidate
4. **Compressão de Assets:** Gzip automático
5. **CDN para Documentos:** S3 com CloudFront

#### **Métricas de Performance**

| Operação | Tempo Esperado |
|----------|----------------|
| Criar projeto | < 500ms |
| Executar agente (Engenheiro) | 5-15s |
| Executar agente (Orçamentista) | 10-20s |
| Gerar PDF | 2-5s |
| Upload para S3 | 1-3s |

### 12.2 Segurança

#### **Autenticação**

- OAuth 2.0 via Manus
- Session cookies com HttpOnly + Secure flags
- CSRF protection via tRPC

#### **Autorização**

- Ownership check em todas as operações
- Role-based access control (user vs. admin)
- Validação de entrada com Zod

#### **Dados Sensíveis**

- Credenciais PINI/SINAPI: Armazenadas em env vars (não no código)
- Stripe keys: Armazenadas em env vars
- API keys: Nunca expostas ao frontend

#### **SQL Injection Prevention**

- Drizzle ORM com prepared statements
- Zod validation de inputs
- Nenhuma concatenação de SQL

### 12.3 Escalabilidade

#### **Arquitetura Stateless**

- Backend não mantém estado em memória
- Todos os dados persistidos em banco
- Múltiplas instâncias podem rodar em paralelo

#### **Banco de Dados**

- MySQL/TiDB com suporte a replicação
- Índices em colunas frequentemente consultadas
- Backup automático

#### **Limite de Concorrência**

- Máximo 3 tentativas de retry por agente
- Timeout de 30s por chamada LLM
- Queue de execução (1 agente por projeto por vez)

### 12.4 Monitoramento

#### **Logs**

- Console do servidor (stdout)
- Manus Dashboard (persistido)
- Estrutura: `[Agent Name] [Timestamp] [Level] Message`

#### **Métricas**

- Taxa de sucesso de agentes
- Tempo médio de execução
- Taxa de truncamento
- Taxa de retry

#### **Alertas**

- Agente falha 3 vezes consecutivas
- Projeto bloqueado por erro
- Taxa de erro > 5%

### 12.5 Manutenção

#### **Atualizações de Dependências**

```bash
pnpm update
pnpm test
pnpm build
```

#### **Migrações de Banco**

```bash
pnpm db:push
```

#### **Deploy**

```bash
git push origin main
# GitHub Actions roda testes
# Se passar, deploy automático para produção
```

---

## Referências

Este documento técnico foi compilado a partir do código-fonte do RR-Engine versão 2.15.3, com análise completa de:

- Arquivos TypeScript/TSX (34.882 linhas)
- Schema de banco de dados (13 tabelas)
- Procedures tRPC (20+ procedures)
- Componentes React (50+ componentes)
- Agentes especializados (10 agentes)
- Integrações externas (6 serviços)

**Última Atualização:** 26 de março de 2026  
**Versão do Documento:** 1.0  
**Status:** Completo e Validado

---

**Fim do Documento Técnico**
