# RR Engine — guia para o Claude Code

Documento de contexto para sessões de implementação. Lê este arquivo antes de tocar qualquer coisa.

## ATENÇÃO — atualização pós-migração total (06/05/2026)

A migração total **saiu do tenant Manus**. Estamos em produção própria:

- **Backend** (este repo) roda no Railway em `api.rres.com.br`. Branch ativa: `feat/sprint-3-railway-deploy` (vai mergear em main no Sprint 6).
- **Frontend** (Next.js) está em outro repo (`juniu86/rr-engine-app`), hospedado no Vercel em `engine.rres.com.br`. **Tudo em `client/` deste repo é legado** — não mexer, será removido em fase futura.
- **Banco** é MySQL plugin do Railway (não TiDB Cloud do Manus).
- **Auth** é Clerk (`@clerk/backend.verifyToken`) em `server/_core/clerk-auth.ts`. OAuth Manus em `server/_core/oauth.ts` é legado, não usado.
- **LLM** é Anthropic direto via streaming SSE + prompt caching ephemeral. Forge da Manus continua como fallback no código mas não é usado em produção.
- **Storage** é Cloudflare R2 (S3-compatible). `server/storage.ts` reescrito pra usar `@aws-sdk/client-s3`.

Para o snapshot completo da migração, ler `rr-engine-app/HANDOFF.md` (no repo do frontend).

## O que é o produto

SaaS de orçamentação automatizada de obras civis. Entrada: memorial descritivo em texto/markdown. Saída: proposta comercial (PDF), memória de cálculo (XLSX) e cronograma físico. O motor é um pipeline sequencial de 10 agentes de IA orquestrados via tRPC.

Versão atual: 3.1.0.

## Stack

- **Backend (este repo):** Node 20 + Express 4 + tRPC 11 + Drizzle ORM
- **Banco:** MySQL 8 (Railway plugin)
- **Auth:** Clerk (validação JWT no backend via `@clerk/backend`)
- **LLM:** Anthropic direto (streaming + prompt caching). Forge da Manus apenas como fallback histórico.
- **Storage:** Cloudflare R2 (S3-compatible) via `@aws-sdk/client-s3`
- **Pacote:** pnpm 10
- **Frontend (outro repo):** Next.js 16 + Tailwind 4 + Clerk no `juniu86/rr-engine-app`

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

| Agente             | Modelo                      | Override                                                 | Temperatura |
| ------------------ | --------------------------- | -------------------------------------------------------- | ----------- |
| Engenheiro Técnico | Claude Opus 4.6             | `LLM_MODEL_CRITICAL`                                     | 0.3         |
| Logística          | Gemini 2.5 Flash            | `LLM_MODEL` (default)                                    | 0.2         |
| Orçamentista       | Claude Opus 4.6             | `LLM_MODEL_CRITICAL`                                     | 0.1         |
| Tributário         | Claude Sonnet 4.6           | `LLM_MODEL_INTERMEDIATE` (P1.1: migrado de Opus)         | 0.0         |
| Comercial          | — (determinístico, sem LLM) | P1.2: pure fn em `services/comercialCalculator.ts`       | —           |
| Gestão de Projetos | Claude Sonnet 4.6           | `LLM_MODEL_INTERMEDIATE`                                 | 0.3         |
| Financeiro         | — (determinístico, sem LLM) | P1.2: pure fn em `services/financeiroAnalyzer.ts`        | —           |
| Jurídico           | Claude Sonnet 4.6           | `LLM_MODEL_INTERMEDIATE` — templating estruturado (P1.6) | 0.2         |
| Board              | Claude Sonnet 4.6           | `LLM_MODEL_INTERMEDIATE` (P1.1: migrado de Opus)         | 0.2         |
| Auditor            | Claude Sonnet 4.6           | `LLM_MODEL_INTERMEDIATE`                                 | 0.0         |

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
- `docs/exemplos/memoria_calculo_reforma_vania.pdf` — caso real médio para validação de mudanças
- `docs/exemplos/proposta_exemplo.pdf` — exemplo de saída comercial atual
- `docs/legacy/documento_tecnico_v1.md` — referência histórica (9 agentes, será reescrita em P2.1)
- `docs/archive/` — análises, sincronizações e testes manuais antigos (histórico, não tocar)

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
STRIPE_PRICE_STARTER=          # Sprint 5 — Price ID do tier Starter (R$ 199/mês)
STRIPE_PRICE_PRO=              # Sprint 5 — Price ID do tier Pro (R$ 499/mês)
STRIPE_PRICE_BUSINESS=         # Sprint 5 — Price ID do tier Business (R$ 1499/mês)
FRONTEND_URL=                  # default https://engine.rres.com.br (success/cancel URL do checkout)

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=

# Observabilidade — Langfuse (P2.2, opcional)
LANGFUSE_ENABLED=false                       # toggle global; default OFF
LANGFUSE_PUBLIC_KEY=                         # cloud.langfuse.com → Project Settings
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com     # ou self-hosted
```

Detalhes do tracing (incluindo o que aparece no dashboard) em `docs/observability.md`.

## O que NÃO mexer nesta fase

- Camada de OAuth Manus (`server/_core/oauth.ts`) e wrappers em `_core/sdk.ts`, `dataApi.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`. **Legado pós-migração** — não está mais sendo usado em produção, mas remoção fica pra fase de cleanup futura.
- `vite-plugin-manus-runtime` e qualquer coisa em `client/` (frontend Vite legado). Frontend ativo está em `juniu86/rr-engine-app` (Next.js).

> **Sprint 5 (P1.7) — Stripe:** integração foi expandida para 3 tiers (Starter / Pro / Business) com cap de valor por obra. Detalhes em `implementacao/SPRINT_5_STRIPE.md`. UI vive no repo `rr-engine-app` (Next.js no Vercel).

> **P0 (07/05/2026) — Cap de quota mensal:** Starter=2, Pro=7, Business=20 orçamentos/mês (era 5/20/ilimitado). Cobre custo real R$ 70/orçamento. Ajustar caps em `server/stripe/products.ts:TIERS.<tier>.quota`. Tests asserting quotas em `server/stripe/sprint5.test.ts`. Spec em `implementacao/P0_QUOTA_CAP_POR_PLANO.md`.

> **P0 (08/05/2026) — BDI NBR 12721 + cronograma + cancel:** três PRs mergeados no mesmo dia.
>
> 1. **`feat/cancel-execution`**: mutation `agent.cancelExecution` + guard no loop `executeRemainingAgents` + status `cancelled` em `projects` e `agent_executions` (migration `0022`). Frontend ganha botão "Interromper" no `AgentPipelineLive`. Quota mensal NÃO é devolvida (anti-abuso).
>
> 2. **`feat/p0-bdi-cronograma`**: substitui `× 1,25` flat pela fórmula NBR 12721 em `server/services/comercialCalculator.ts`:
>
>     ```
>     BDI = ((1 + AC + S + R + G) × (1 + DF) × (1 + L)) / (1 − I) − 1
>     ```
>
>     Tributos por dentro via denominador `(1 − I)`. Resolução de I: `server/services/taxRateResolver.ts`. Ordem: `aliquotaTributosOverride` (manual) > `SIMPLES_ANEXO_IV[faixa]` > `iss + pis + cofins + irpj + csll` (Lucro Presumido/Real) > 8% fallback. Migration `0023` adiciona `seguroPercentual`, `garantiaPercentual`, `aliquotaTributosOverride` em `company_settings`.
>
>     `confirmProposal` (e gêmeos no pipeline auto-approve e applyAuditCorrections) lê totais de `extractFinalTotalsFromExecutions` (em `server/services/projectTotals.ts`) — não soma `budget_items` direto da DB (mistura logística que o LLM enfia em `budget_items`). Grava `totalBdi`, `totalTaxes`, `totalCostDirect` e `totalCostIndirect` corretos.
>
>     Cronograma: `agentPersistence.ts` lia `output.schedule` (campo errado) — agora lê `output.scheduleItems` com fallback pra helper `deriveScheduleFromDaily(dailySchedule)` que agrupa fases. Gerador de PDF (`generateSchedulePDF` no `routers.ts`) também tem o mesmo fallback. Prompt do agente Gestão (`agents/index.ts`) reforçado com lista explícita de campos obrigatórios.
>
> 3. **`feat/p0-settings-bdi-readonly`** (frontend `rr-engine-app`): BDI total na UI vira **readonly**, calculado em tempo real via `components/BdiSettingsForm.tsx`. Campos novos editáveis: Seguros (S), Garantias (G), override de I. Tabela do Simples Nacional Anexo IV pré-preenche I por faixa. Comitado junto: cancelExecution no `lib/api.ts` e `AgentPipelineLive.tsx`.

> **P0 (12/05/2026) — BDI "tudo por dentro" (substitui NBR 12721 cascata):** após decomposição P&L do contrato no board da RR Engenharia, a fórmula NBR não fechava: aplicar AC/S/R/G como % do custo gera markup menor do que a soma dos mesmos percentuais sobre o preço de venda. Diferença observada no caso Maricá: −R$ 353,7k (−13% sobre o markup).
>
> Nova fórmula em `server/services/comercialCalculator.ts`:
>
>     ```
>     PV = Custo / (1 − L − AC − DF − R − S − G − I)
>     BDI = totalRate / (1 − totalRate),  totalRate = L+AC+DF+R+S+G+I
>     ```
>
> Cada componente é % do **preço de venda** (não do custo). Caso Maricá com componentes 25/4/1/5/2/0/15% → totalRate 52%, BDI 108,33%, PV R$ 3.531.655,44. Soma das linhas decompostas sobre o PV bate exato com o markup.
>
> Gate: soma ≥ 95% lança erro (acima disso BDI explode). Ajustes condicionais (+5pp em R por fiscalRisk=high, +5pp em DF por logística=high) permanecem.
>
> Reflete em três lugares: aba "BDI e Markup" do XLSX (`documents.ts` com fórmula `=(C5+C6+C7+C8+C9+C10+C12)/100/(1-(...)/100)` em C14), `BdiSettingsForm.tsx` no rr-engine-app (cálculo readonly em tempo real), Resumo Executivo da XLSX. `applyAuditCorrections` continua preservando o BDI rate do Comercial original — não precisa mudança. Testes em `server/comercial-calculator.test.ts` cobrem caso Maricá numericamente.

## Como pedir contexto adicional

Se precisar de informação fora do escopo de um ticket (decisão de produto, justificativa de negócio, dados que não estão no repo), pause o ticket e abra issue ou pergunte ao founder Reginaldo. Não inventar requisitos.

## REGRA DE VALIDAÇÃO ANTES DE TESTE PAGO (11/05/2026)

Cada execução de pipeline custa dinheiro real (Anthropic API por chamada
de agente, 10 chamadas por orçamento). Após ciclo de 5 PRs + 5 revisões
pagas no projeto Maricá sem fechar o gap, foi decidido:

**Nenhum teste novo pode ser pedido antes de afirmar literalmente:**

> "Todos os erros que você reportou foram corrigidos, todos os testes
> necessários à validação desta informação foram feitos e agora você pode
> ensaiar o modelo XPTY para me entregar o resultado e termos capacidade
> de criticar possíveis novas melhorias."

A frase só pode ser dita quando o trabalho cumpre:

1. **Análise ampla de código** — todos os caminhos relacionados ao
   problema, não só o óbvio. Ex.: pra bug de totais não gravados, varrer
   `confirmProposal`, `executeRemainingAgents` (auto-approve),
   `applyAuditCorrections`, **e** o caminho `status="review"` que
   historicamente não grava totais.
2. **Typecheck local passa** (`pnpm check` ou `tsc --noEmit`).
3. **Testes unitários cobrem o cenário** (rodar `pnpm test` ou ler
   manualmente os asserts pra confirmar).
4. **Validação matemática** quando há número envolvido.
5. **Hipótese clara do resultado esperado** antes do teste rodar.

Sem isso fica suspenso qualquer "tenta agora". A regra está gravada em
3 lugares: este CLAUDE.md, `rr-engine-app/HANDOFF.md`, e o
`02 - MKT/Claude/03_CONFIGURACAO_CLAUDE/modo-de-trabalho.md`.

## Glossário

- **BDI** — Benefícios e Despesas Indiretas (markup sobre custo).
- **SINAPI** — Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil (Caixa).
- **PINI/TCPO** — Tabelas de Composições e Preços para Orçamento (Editora PINI).
- **Curva A/C** — classificação Pareto de itens do orçamento (A = 80% do valor, C = cauda).
- **Memorial descritivo** — documento técnico que descreve a obra a ser executada.
- **Memória de cálculo** — planilha que mostra como o orçamento foi montado.
- **Forge** — proxy LLM da Manus (`forge.manus.im`).
