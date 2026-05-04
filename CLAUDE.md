# RR Engine — guia para o Claude Code

Documento de contexto para sessões de implementação. Lê este arquivo antes de tocar qualquer coisa.

## O que é o produto

SaaS de orçamentação automatizada de obras civis. Entrada: memorial descritivo em texto/markdown. Saída: proposta comercial (PDF), memória de cálculo (XLSX) e cronograma físico. O motor é um pipeline sequencial de 10 agentes de IA orquestrados via tRPC.

Versão atual: 3.1.0. Hospedado hoje em `rrengine.manus.space` (tenant Manus). Decisão estratégica já tomada: reconstruir fora do Manus. Esta fase de implementação prepara o produto para essa migração corrigindo dívida técnica e reduzindo acoplamento.

## Stack

- **Frontend:** React 19 + Vite 7 + Tailwind 4 + tRPC client + wouter (routing)
- **Backend:** Node + Express 4 + tRPC 11 + Drizzle ORM
- **Banco:** MySQL/TiDB Cloud (`gateway02.us-east-1.prod.aws.tidbcloud.com`)
- **Auth:** OAuth Manus (será trocado em fase de migração separada — não toca por enquanto)
- **LLM:** Forge da Manus (proxy) com rota direta para Anthropic API quando `ANTHROPIC_API_KEY` está provisionada
- **Storage:** S3
- **Pacote:** pnpm 10

Comandos principais:
```bash
pnpm install
pnpm dev          # NODE_ENV=development tsx watch server/_core/index.ts
pnpm build        # vite build + esbuild server bundle
pnpm test         # vitest run
pnpm check        # tsc --noEmit
pnpm format       # prettier
pnpm db:push      # drizzle-kit generate && drizzle-kit migrate
```

## Estrutura do repo

```
client/                     # React app
  src/
    pages/                  # Home, Dashboard, NewProject, ProjectDetails, Settings, Planos, AdminDashboard
    components/             # AIChatBox, AgentProgressPipeline, DashboardLayout, etc.
    lib/trpc.ts             # cliente tRPC

server/
  _core/
    index.ts                # bootstrap Express + tRPC
    llm.ts                  # invokeLLM() — Forge ou Anthropic direta
    llm-providers.ts        # capabilities por provider
    oauth.ts                # OAuth Manus (não tocar nesta fase)
    sdk.ts, dataApi.ts      # wrappers Manus (serão isolados em fase futura)
  agents/
    index.ts                # 10 agentes — leia inteiro antes de mexer
    chunking.ts             # split de memoriais grandes (Engenheiro)
    budgetChunking.ts       # split por frentes de obra (Orçamentista)
    ensemble.ts             # estratégia de paralelismo
    priceAnchorValidator.ts # validação contra SINAPI top-15
  services/
    sinapi.ts               # SINAPI_DB estática (Jan/2025, base SP)
    sinapiScraper.ts        # scraping orcamentor.com via Puppeteer
    pini.ts                 # PINI_DATABASE local
    piniScraper.ts          # cache-only (scraping a implementar — ver P1.4)
    cacheService.ts         # cache de preços
    documents.ts            # geração PDF/XLSX
    deterministicCashFlow.ts # fluxo de caixa determinístico (já em produção)
  lib/
    deterministicEngine/    # motor determinístico paralelo aos agentes — HOJE NÃO PLUGADO (ver P0.1)
      index.ts, types.ts
      modules/parser.ts, pricing.ts, logistics.ts, budget.ts, crossValidation.ts
      config/sinapi-precos.ts
  routers.ts                # procedures tRPC (orquestração principal)
  routers/stripe.ts         # endpoints Stripe
  storage.ts, db.ts         # Drizzle + cache de preços
  stripe/                   # produtos, webhook, serviço Stripe
  utils/                    # logger, rateLimiter, validation, hierarchy
  *.test.ts                 # 25 suites Vitest

shared/
  agents.ts                 # tipos dos 10 agentes (input/output)
  regionFactors.ts          # ajuste regional de preço

drizzle/
  schema.ts                 # schema MySQL/TiDB
  0000-0016_*.sql           # 17 migrações
```

## Arquitetura do pipeline de agentes

Os 10 agentes rodam em sequência fixa, definida em `routers.ts`:

```
Engenheiro Técnico → Logística → Orçamentista → Tributário →
Comercial → Gestão de Projetos → Financeiro → Jurídico →
Board → Auditor
```

Cada agente é uma classe que herda de `BaseAgent<TInput, TOutput>` em `server/agents/index.ts`. Implementa três métodos:
- `getSystemPrompt()` — prompt fixo do agente
- `getUserPrompt(input)` — prompt dinâmico com payload
- `getOutputSchema()` — JSON schema do output (para `response_format`)

`BaseAgent._execute()` faz uma chamada não-streaming a `invokeLLM()` com retry para 5xx (3 tentativas, backoff 1s/3s/5s). Erros 4xx falham imediatamente.

### Distribuição de modelos (estado atual)

Temperatura definida em `getTemperature()` de cada agente (ver `server/agents/index.ts`). Default do `BaseAgent` é 0.2; `invokeLLM` aplica 0.2 quando o caller omite (sobrescreve o default ~1.0 do provider para favorecer reprodutibilidade).

| Agente | Modelo | Override | Temperatura |
|---|---|---|---|
| Engenheiro Técnico | Claude Opus 4.6 | `LLM_MODEL_CRITICAL` | 0.3 |
| Logística | Gemini 2.5 Flash | `LLM_MODEL` (default) | 0.2 |
| Orçamentista | Claude Opus 4.6 | `LLM_MODEL_CRITICAL` | 0.1 |
| Tributário | Claude Opus 4.6 | `LLM_MODEL_CRITICAL` (será migrado em P1.1) | 0.0 |
| Comercial | Gemini 2.5 Flash | `LLM_MODEL` (será determinístico em P1.2) | 0.0 |
| Gestão de Projetos | Claude Sonnet 4.6 | `LLM_MODEL_INTERMEDIATE` | 0.3 |
| Financeiro | Gemini 2.5 Flash | `LLM_MODEL` (será determinístico em P1.2) | 0.0 |
| Jurídico | Claude Opus 4.6 | `LLM_MODEL_CRITICAL` (será migrado em P1.1) | 0.4 |
| Board | Claude Opus 4.6 | `LLM_MODEL_CRITICAL` | 0.2 |
| Auditor | Claude Sonnet 4.6 | `LLM_MODEL_INTERMEDIATE` | 0.0 |

### Roteamento de provider

`server/_core/llm.ts:332-345`. Se `ANTHROPIC_API_KEY` está presente e o modelo é Claude, chama Anthropic direta. Senão, vai pelo Forge da Manus. Se for Claude e a chave não existir, faz fallback para Gemini via Forge (com warning).

## Convenções de código

- **TypeScript estrito.** `strict: true` no `tsconfig.json`. PR não passa se `pnpm check` falhar.
- **Imports ESM.** O projeto é `"type": "module"`. Não usar `require()` exceto onde já existe (e mesmo nesses casos, considere migrar).
- **tRPC procedures.** Sempre tipadas via Zod ou input/output explícito. Não retornar `any`.
- **Drizzle.** Migrações são versionadas em `drizzle/`. Nunca editar migração já mergeada — gerar nova.
- **Logging.** Usar `logger` de `server/utils/logger.ts`. Não usar `console.log` em código de produção (warns aceitos em retry).
- **Testes.** Vitest. Toda mudança de comportamento exige teste. Suites em `server/**/*.test.ts`.
- **Prettier.** `.prettierrc` configurado. Rodar `pnpm format` antes de commit.

## Fluxo de trabalho de PR

Esta fase de implementação cobre 18 débitos técnicos catalogados em `analise-estrategica/01_diagnostico_mecanica_v1.md` e detalhados em tickets individuais em `implementacao/`.

**Regra:** um débito = uma branch = um PR. Não acumular débitos no mesmo PR.

**Naming:**
```
feat/p0-1-engine-validacao-cruzada
feat/p0-2-temperature-explicita
fix/p0-4-hard-limits-slice
chore/p2-7-limpeza-arquivos-analise
```

Use `feat/` para débitos que adicionam funcionalidade, `fix/` para correção de comportamento, `chore/` para limpeza/docs.

**Antes de abrir PR:**
1. `pnpm check` passa
2. `pnpm test` passa (incluindo testes novos do ticket)
3. `pnpm format` aplicado
4. Mensagem de commit referencia o ticket: `feat(P0.1): plugar deterministicEngine como validacao cruzada`

**Ordem sugerida de execução** (ver `implementacao/README.md` para dependências):
1. P0.5 (CI) — desbloqueia tudo, deve ser o primeiro PR
2. P0.2 (temperature) — barato e melhora reprodutibilidade dos testes
3. P0.3 (telemetria de tokens) — necessário para validar P1.1 e P1.2
4. P0.1 (engine determinístico como validador) — o mais importante
5. P0.4 (hard limits) — corrige bug silencioso
6. Sequência P1 — começar por P1.5 (fallback de tax settings), depois P1.3 (dedup chunks), P1.1 (modelos), P1.2 (determinísticos), P1.4 (SINAPI/PINI), P1.6 (templating Jurídico)
7. P2 — opcional, conforme capacidade

## Arquivos de entrada/contexto úteis

- `analise-estrategica/01_diagnostico_mecanica_v1.md` — diagnóstico que originou os tickets
- `shared/agents.ts` — tipos canônicos dos 10 agentes
- `server/agents/index.ts` — implementação dos agentes (ler antes de qualquer mudança em prompt/lógica)
- `server/routers.ts` — orquestração do pipeline
- `drizzle/schema.ts` — schema atual do banco
- `memoria_calculo_Reforma_Vania_-_REV08_*.pdf` — caso real médio para validação de mudanças
- `analise_proposta.pdf` — exemplo de saída comercial atual

## Bases de preço — pontos de atenção

- `SINAPI_DB` em `server/services/sinapi.ts` é estática, ref. SP Jan/2025. Será reformulada em P1.4 e P2.5.
- Scraper SINAPI usa `orcamentor.com` (terceiro privado, não fonte oficial). Manter por enquanto.
- PINI scraping não foi implementado (`piniScraper.ts` só lê cache). Implementar em P1.4.
- Decisão tomada: **manter as bases como referência, sem trocar fonte primária**. Não citar "SINAPI" e "PINI" como integração oficial nas comunicações comerciais — usar "base de referência atualizada".

## Variáveis de ambiente esperadas

```
# LLM
BUILT_IN_FORGE_API_URL=        # se vazio, usa https://forge.manus.im/v1/chat/completions
BUILT_IN_FORGE_API_KEY=        # obrigatória se rodar via Forge
ANTHROPIC_API_KEY=             # opcional; se presente, Claude vai direto na Anthropic
LLM_MODEL=                     # default por agente (gemini-2.5-flash)
LLM_MODEL_CRITICAL=            # override para agentes críticos (claude-opus-4-6)
LLM_MODEL_INTERMEDIATE=        # override para agentes intermediários (claude-sonnet-4-6)

# Banco
DATABASE_URL=                  # MySQL/TiDB

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=
```

## O que NÃO mexer nesta fase

- Camada de OAuth Manus (`server/_core/oauth.ts`). Será substituída na fase de migração para fora do Manus.
- `vite-plugin-manus-runtime`. Idem.
- Wrappers Manus em `_core/sdk.ts`, `dataApi.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`. Idem.
- Stripe integration (`server/stripe/`). Funciona — não é prioridade nesta fase.

## Como pedir contexto adicional

Se precisar de informação fora do escopo de um ticket (decisão de produto, justificativa de negócio, dados que não estão no repo), pause o ticket e abra issue ou pergunte ao founder Reginaldo. Não inventar requisitos.

## Glossário

- **BDI** — Benefícios e Despesas Indiretas (markup sobre custo).
- **SINAPI** — Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil (Caixa).
- **PINI/TCPO** — Tabelas de Composições e Preços para Orçamento (Editora PINI).
- **Curva A/C** — classificação Pareto de itens do orçamento (A = 80% do valor, C = cauda).
- **Memorial descritivo** — documento técnico que descreve a obra a ser executada.
- **Memória de cálculo** — planilha que mostra como o orçamento foi montado.
- **Forge** — proxy LLM da Manus (`forge.manus.im`).
