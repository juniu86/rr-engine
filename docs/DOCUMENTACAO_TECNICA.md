# RR-Engine - Documentação Técnica Completa

**Sistema de Engenharia e Viabilidade Econômica**

**Versão:** 1.12  
**Data:** Janeiro 2026  
**Autor:** Manus AI

---

## 1. Visão Geral do Sistema

O **RR-Engine** é uma plataforma web de orçamentação automatizada para engenharia civil, desenvolvida para transformar memoriais descritivos em propostas comerciais completas através de um pipeline de 9 agentes de inteligência artificial especializados.

### 1.1 Arquitetura Geral

O sistema utiliza uma arquitetura moderna baseada em:

| Camada | Tecnologia | Função |
|--------|------------|--------|
| Frontend | React 19 + Tailwind CSS 4 | Interface de usuário responsiva |
| Backend | Express 4 + tRPC 11 | API type-safe com procedures |
| Banco de Dados | MySQL/TiDB | Persistência de dados |
| Autenticação | Manus OAuth | Login e sessões |
| IA | LLM via Forge API | Processamento dos agentes |
| Storage | S3 | Armazenamento de arquivos |

### 1.2 Fluxo Principal

```
Memorial Descritivo → 9 Agentes IA → Proposta Comercial PDF
                          ↓
                    Planilha Excel
```

---

## 2. Estrutura de Arquivos

### 2.1 Diretórios Principais

```
rr-engine/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas da aplicação
│   │   │   ├── Home.tsx           # Landing page
│   │   │   ├── Dashboard.tsx      # Painel principal
│   │   │   ├── NewProject.tsx     # Criação de orçamento
│   │   │   ├── ProjectDetails.tsx # Detalhes do projeto
│   │   │   └── Settings.tsx       # Configurações da empresa
│   │   ├── components/    # Componentes reutilizáveis
│   │   └── lib/           # Utilitários (trpc client)
├── server/                 # Backend Express
│   ├── agents/            # Implementação dos 9 agentes
│   │   └── index.ts       # Classes de todos os agentes
│   ├── services/          # Serviços auxiliares
│   │   ├── documents.ts   # Geração de PDF/Excel
│   │   ├── sinapi.ts      # Integração SINAPI
│   │   └── pini.ts        # Integração PINI
│   ├── db.ts              # Funções de acesso ao banco
│   └── routers.ts         # Endpoints tRPC
├── drizzle/               # Schema do banco de dados
│   └── schema.ts          # Definição das tabelas
└── shared/                # Tipos compartilhados
    └── agents.ts          # Interfaces dos agentes
```

---

## 3. Pipeline de Agentes

O sistema processa cada orçamento através de 9 agentes especializados em sequência:

### 3.1 Ordem de Execução

| # | Agente | Função | Input | Output |
|---|--------|--------|-------|--------|
| 1 | **Engenheiro Técnico** | Interpreta memorial descritivo | Memorial + Localização | Lista de itens técnicos |
| 2 | **Orçamentista** | Precifica itens com SINAPI/PINI | Itens técnicos | Itens orçados |
| 3 | **Logística** | Calcula custos indiretos | Itens + Localização | Custos logísticos |
| 4 | **Tributário** | Classifica impostos | Itens orçados | Classificação fiscal |
| 5 | **Comercial** | Aplica BDI e define preço | Custos + Config empresa | Preço de venda |
| 6 | **Gestão de Projetos** | Cria cronograma | Itens + Logística | Cronograma físico |
| 7 | **Financeiro** | Analisa fluxo de caixa | Cronograma + Preço | Fluxo de caixa |
| 8 | **Jurídico** | Redige proposta | Todos os dados | Texto da proposta |
| 9 | **Board** | Aprova ou rejeita | Resumo executivo | Decisão final |

### 3.2 Configurações Personalizáveis

O sistema permite que cada empresa configure:

- **Taxa de Leis Sociais (LS):** 80% a 130%
- **BDI:** Percentual configurável
- **Impostos:** ISS, PIS, COFINS, IRPJ, CSLL
- **Regime Tributário:** Simples Nacional, Lucro Presumido, Lucro Real
- **Região de Preços:** Estados brasileiros para referência SINAPI

---

## 4. Modelo de Dados

### 4.1 Tabelas Principais

| Tabela | Descrição | Campos-chave |
|--------|-----------|--------------|
| `users` | Usuários do sistema | id, openId, name, email, role |
| `projects` | Projetos/Orçamentos | id, userId, name, status, totalPrice |
| `agent_executions` | Execuções dos agentes | projectId, agentType, status, output |
| `budget_items` | Itens do orçamento | projectId, description, quantity, unitCostTotal |
| `company_settings` | Configurações da empresa | userId, bdiPercentual, issPercentual |
| `generated_documents` | Documentos gerados | projectId, documentType, fileUrl |

### 4.2 Status de Projeto

```
draft → processing → review → approved/rejected
```

---

## 5. Funcionalidades Implementadas

### 5.1 Core

- ✅ Criação de projetos com memorial descritivo
- ✅ Execução sequencial dos 9 agentes
- ✅ Visualização do output de cada agente
- ✅ Geração de proposta comercial em PDF
- ✅ Geração de memória de cálculo em Excel

### 5.2 Configurações

- ✅ Configuração de impostos por empresa
- ✅ Configuração de BDI e lucro
- ✅ Seleção de região de preços
- ✅ Regime tributário configurável

### 5.3 Revisões

- ✅ Edição de memorial descritivo
- ✅ Criação automática de revisões (REV_01, REV_02...)
- ✅ Histórico de revisões vinculadas

---

## 6. Problemas Conhecidos e Correções Aplicadas

### 6.1 Correções Recentes (v1.7 - v1.12)

| Versão | Problema | Solução |
|--------|----------|---------|
| v1.7 | Logística duplicando mão de obra | Removido cálculo de diárias (já incluso no SINAPI) |
| v1.7 | Bitributação (Tributário + BDI) | BDI aplicado sobre custo base SEM impostos |
| v1.7 | Cronograma genérico de 4 semanas | Cálculo com índices SINAPI de produtividade |
| v1.7 | Faturamento incorreto | Alterado para 40% entrada + 60% final |
| v1.8 | Processamento incompleto do memorial | Instruções explícitas para processar 100% dos itens |
| v1.9 | Erro 500 no Board | Resumido payload para evitar timeout |
| v1.10 | Sistema de revisões | Implementado versionamento de memoriais |
| v1.11 | Impostos/BDI fixos | Configuração personalizada por empresa |
| v1.12 | Campo "Tipo de Contrato" redundante | Removido (BDI vem das configurações) |

### 6.2 Pontos de Atenção

1. **Ordem dos Agentes no Schema:** A tabela `agent_executions` ainda lista "logistica" antes de "orcamentista" no enum, mas a ordem de execução real é controlada pelo `AGENT_ORDER` em `shared/agents.ts`.

2. **Campo `contractType` Legado:** O campo ainda existe no banco de dados e no schema, mas não é mais usado na lógica de cálculo. Mantido para compatibilidade com projetos antigos.

3. **`totalPrice` Nulo:** Muitos projetos têm `totalPrice` como NULL no banco. O valor real está no output do agente Comercial (`comercialOutput.finalPrice`).

---

## 7. Endpoints Principais (tRPC)

### 7.1 Projetos

```typescript
project.create    // Criar novo projeto
project.list      // Listar projetos do usuário
project.get       // Obter detalhes do projeto
project.update    // Atualizar projeto
project.delete    // Excluir projeto
project.createRevision // Criar revisão do memorial
```

### 7.2 Agentes

```typescript
agent.list        // Listar execuções de agentes do projeto
agent.get         // Obter output de um agente
agent.run         // Executar próximo agente
agent.runAll      // Executar todos os agentes pendentes
```

### 7.3 Documentos

```typescript
document.generateProposal  // Gerar PDF da proposta
document.generateMemoria   // Gerar Excel da memória de cálculo
document.list              // Listar documentos gerados
```

### 7.4 Configurações

```typescript
companySettings.get     // Obter configurações da empresa
companySettings.upsert  // Criar/atualizar configurações
```

---

## 8. Testes

O sistema possui 52 testes automatizados cobrindo:

- Autenticação e logout
- CRUD de projetos
- Lógica dos agentes
- Geração de documentos
- Configurações de empresa

Para executar:
```bash
pnpm test
```

---

## 9. Ambiente de Desenvolvimento

### 9.1 Requisitos

- Node.js 22+
- pnpm
- MySQL/TiDB

### 9.2 Comandos Principais

```bash
pnpm dev          # Iniciar servidor de desenvolvimento
pnpm test         # Executar testes
pnpm db:push      # Aplicar alterações no schema
pnpm build        # Build de produção
```

---

## 10. Próximas Melhorias Sugeridas

1. **Dashboard Administrativo:** Painel para owner visualizar todos os usuários e projetos
2. **Presets de Regime Tributário:** Botões para preencher automaticamente alíquotas
3. **Comparativo de Revisões:** Diff visual entre versões do memorial
4. **Notificações:** Alertas quando projetos são aprovados/rejeitados
5. **Exportação Bulk:** Exportar múltiplos projetos em um único arquivo

---

*Documentação gerada automaticamente pelo RR-Engine v1.12*
