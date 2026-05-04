# 03 — Plano de migração: sair do Manus

**Versão:** v1
**Data:** 04/05/2026
**Decisão estratégica:** confirmada na Fase 1 — reconstruir fora do tenant Manus.
**Domínio principal:** `engine.rres.com.br` (subdomínio do domínio raiz `rres.com.br` da RR Engenharia).

---

## 1. Por que sair

O produto vive hoje em `rrengine.manus.space` com OAuth via `manus.im/app-auth` e camada de runtime acoplada ao tenant. A análise da Fase 2 mostrou que três coisas dependem da Manus para funcionar:

- Autenticação (`server/_core/oauth.ts`)
- Wrappers de plataforma (`_core/sdk.ts`, `dataApi.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`)
- Plugin de runtime do Vite (`vite-plugin-manus-runtime`)

Sair desses três acoplamentos é o que define o trabalho da migração. O resto do stack (React, Express, tRPC, Drizzle, MySQL/TiDB Cloud, S3, Stripe) é portátil.

A LLM já é desacoplável hoje: `_core/llm.ts` tem rota direta à Anthropic API quando `ANTHROPIC_API_KEY` está provisionada. Isso simplifica a fase técnica.

## 2. Decisões de stack

### 2.1 Domínio e DNS

`engine.rres.com.br` para o app. Marketing pode ficar em `rres.com.br` (site institucional da RR Engenharia) com link visível para o app, ou em `rres.com.br/engine` se preferir centralizar. Recomendação prática: separar — site institucional e produto têm públicos e cadências de update diferentes, e separar o DNS protege a marca-mãe se algo der errado no produto.

DNS: gerenciar pelo Cloudflare (free tier). Vantagens: SSL automático via Cloudflare, proxy CDN gratuito, proteção DDoS básica, fácil migração. Pode-se manter o registrar atual (Registro.br) e apenas trocar os nameservers para Cloudflare.

### 2.2 Frontend

Manter **React 19 + Vite 7 + Tailwind 4 + tRPC client** como está. Portar para **Vercel** (Hobby plan grátis para volumes baixos; Pro a R$ 100/mês quando precisar). Vercel tem deploy automático via Git, preview por PR, edge network global. Substitui o Vite plugin da Manus por configuração padrão do Vite + adapter da Vercel.

Alternativa considerada: Cloudflare Pages (também grátis no início). Equivalente em capacidade. Vercel ganha pela maturidade do ecossistema React e pela integração com Next.js futura, caso decida migrar.

### 2.3 Backend

Manter **Express 4 + tRPC 11 + Drizzle**. Portar para **Railway** (Hobby a R$ 25/mês, escala automática, deploy via Git, suporta Node 20). Railway é a transição mais barata e mantém o código atual.

Alternativas consideradas:
- **Render.com** — equivalente em preço, UI menos amigável.
- **Fly.io** — mais flexível, exige Dockerfile, curva de aprendizado.
- **AWS ECS/Lambda** — escalabilidade infinita, complexidade alta, custo mínimo R$ 200/mês para começar.

Railway é a escolha pragmática para os primeiros 12 meses. Quando MRR passar de R$ 30k/mês, vale revisitar para Fly.io ou AWS.

### 2.4 Banco de dados

Manter **TiDB Cloud Serverless**. Já é onde os dados estão. Não há migração de banco — só recriar credenciais e ajustar `DATABASE_URL` no Railway. Free tier cobre até 5GB e 50M Request Units/mês — suficiente para 10k orçamentos/mês.

### 2.5 Autenticação

Substituir OAuth Manus por **Clerk**. Razões:

- Free tier generoso (10k usuários ativos/mês).
- Suporta Google, Email/Password, Magic Link, SSO empresarial (importante para vender para construtoras médias).
- API tipada em TypeScript, integração com tRPC simples.
- Webhooks para sincronizar com a tabela `users` no TiDB.
- Compliance LGPD (dados em Brasil opcionais).

Alternativas consideradas:
- **Supabase Auth** — bom, mas exige usar Supabase como banco também, ou hack para integrar com TiDB.
- **Auth.js (NextAuth)** — gratuito, exige mais código boilerplate.
- **Lucia v3** — leve, exige construir UI de auth do zero.

Clerk é o melhor custo/benefício para 0-1000 usuários.

### 2.6 Pagamento

**Stripe (manter) + Asaas como fase 2.**

Stripe já está implementado em `server/stripe/`, suporta Pix no Brasil (com fee 1,99%) e cartão (3,99% + R$ 0,39). Não há motivo para trocar agora — o código está testado e funcional.

Asaas pode ser adicionado depois para clientes que preferem pagar via boleto bancário (público B2B brasileiro pede muito) e Pix com fee menor (0,99%). Decisão de adicionar Asaas vira ticket separado quando MRR > R$ 5k/mês ou cliente específico exigir.

### 2.7 Storage

Manter **AWS S3** (já configurado). Mover para conta AWS pessoal da RR Engenharia, com bucket dedicado `rrengine-prod`. Custo estimado: até 1 GB/mês = R$ 1-2/mês. Egress só para usuários autenticados, via URLs assinadas (já implementado).

### 2.8 Observabilidade

**Langfuse cloud** para tracing de LLM (P2.2 já cobre essa implementação). Plano gratuito: 50k events/mês, suficiente para 4-5k orçamentos. Migrar para self-hosted quando passar disso.

Para logs de aplicação: **Better Stack (ex-Logtail)** — free tier 1 GB/mês, integração nativa com Railway. Alternativa: continuar com winston em arquivo + Papertrail (pago).

Para métricas de infra: dashboards nativos de Vercel + Railway suficientes nos primeiros 12 meses.

### 2.9 LLM provider

**Anthropic API direta** para todos os agentes Claude. `ANTHROPIC_API_KEY` em variável de ambiente do Railway. O código em `_core/llm.ts` já faz roteamento condicional — basta provisionar a chave para que tudo passe pela Anthropic em vez do Forge da Manus.

Para Gemini (Logística), usar **Google AI Studio API** com `GEMINI_API_KEY`. Custo USD direto, sem markup do Forge.

## 3. Estrutura em duas fases

### Fase 1 — Site marketing fora do Manus (rápida)

**Objetivo:** ter `engine.rres.com.br` apontando para um site institucional do produto antes mesmo de migrar o app. Permite começar SEO (Entregável D) e captura de leads enquanto o app continua em `rrengine.manus.space`.

**Cronograma proposto:** 5 a 10 dias corridos.

**Tarefas:**

| # | Tarefa | Esforço | Dependência |
|---|---|---|---|
| 1 | Configurar Cloudflare como DNS de `rres.com.br` | 0,5 dia | acesso ao Registro.br |
| 2 | Comprar/confirmar domínio `rres.com.br` (provavelmente já existe) | 0,5 dia | — |
| 3 | Provisionar conta Vercel + ligar ao GitHub | 0,5 dia | — |
| 4 | Construir landing page estática (Next.js ou Astro) | 3-5 dias | copy do Entregável E |
| 5 | Apontar `engine.rres.com.br` para Vercel preview ou para `rrengine.manus.space` (CNAME) durante transição | 0,5 dia | DNS + Vercel |
| 6 | SSL automático via Cloudflare | 0 (automático) | — |
| 7 | Plausible Analytics ou Umami self-hosted | 0,5 dia | — |
| 8 | Sitemap, robots.txt, schema.org SoftwareApplication | 0,5 dia | conteúdo da landing |

**Custo mensal estimado (Fase 1 sozinha):**

- Domínio `.com.br`: R$ 40/ano = R$ 3,33/mês
- Cloudflare: R$ 0
- Vercel Hobby: R$ 0
- Plausible Cloud: R$ 50/mês (opcional — pode usar Umami self-host gratuito)

**Total: R$ 3 a R$ 53/mês.**

A landing page nesta fase é só institucional — apresentação do produto, preços, depoimentos quando houver, CTA "fale conosco" ou "entre em contato". O fluxo de signup ainda passa pelo `rrengine.manus.space` enquanto a Fase 2 não conclui.

### Fase 2 — Reconstrução do app fora do Manus (longa)

**Objetivo:** subir o app inteiro em `engine.rres.com.br`, com auth próprio, sem dependências Manus. Desligar o tenant Manus.

**Cronograma proposto:** 4 a 7 semanas com 1 dev em tempo integral, ou equivalente em sessões de Claude Code coordenadas.

**Tarefas (em ordem):**

| Semana | Bloco | Esforço |
|---|---|---|
| 1 | Provisionar infra (Railway backend, Vercel frontend, TiDB credenciais novas, S3 bucket separado, Anthropic + Gemini keys) | 1-2 dias |
| 1 | Configurar CI/CD: deploy automático no push para `main`, preview deploys por PR | 1-2 dias |
| 1-2 | Substituir `vite-plugin-manus-runtime` por config Vite padrão; ajustar imports | 2-3 dias |
| 2-3 | Migrar OAuth Manus para Clerk: criar componentes `<SignIn/>`, `<UserButton/>`, configurar webhook para sincronizar com `users` table | 5-8 dias |
| 3-4 | Remover wrappers Manus em `_core/sdk.ts`, `dataApi.ts`, `notification.ts`. Substituir por implementações próprias ou stubs | 5-10 dias |
| 4 | Configurar variáveis de ambiente em Railway (ANTHROPIC_API_KEY, GEMINI_API_KEY, DATABASE_URL, STRIPE_*, AWS_*) | 0,5 dia |
| 4-5 | Testes de integração end-to-end no novo ambiente | 3-5 dias |
| 5 | Smoke test com 5-10 orçamentos reais comparando output com produção atual | 2-3 dias |
| 5-6 | Cutover: apontar `engine.rres.com.br` para Railway+Vercel novo, comunicar usuários (no momento, só você), desligar tenant Manus | 1-2 dias |
| 6-7 | Buffer para imprevistos, ajustes pós-cutover, retomada de telemetria | 3-5 dias |

**Total: 23-40 dias-homem.**

**Custo mensal de operação pós-migração (volume conservador, 10 orçamentos/mês):**

| Serviço | Plano | Custo/mês |
|---|---|---|
| Railway Hobby (backend) | Hobby | R$ 25 |
| Vercel Hobby (frontend) | Hobby | R$ 0 |
| TiDB Cloud Serverless | Free | R$ 0 |
| Cloudflare DNS | Free | R$ 0 |
| AWS S3 | Pay-as-you-go | R$ 5 |
| Clerk Auth | Free (até 10k MAU) | R$ 0 |
| Anthropic API (LLM) | Pay-as-you-go | R$ 200-300 (10 orçamentos) |
| Google AI Studio (Logística) | Pay-as-you-go | R$ 5-15 |
| Stripe | Pay-as-you-go (taxa por transação) | embutido na receita |
| Langfuse Cloud | Free (até 50k events) | R$ 0 |
| Better Stack (logs) | Free (até 1 GB) | R$ 0 |
| Plausible (analytics) | Hobby | R$ 50 |
| Domínio `rres.com.br` | Anual | R$ 3 |
| **Total volume baixo (10/mês)** | | **R$ 290-400/mês** |
| **Total volume médio (100/mês)** | | **R$ 500-700/mês** |
| **Total volume otimista (1000/mês)** | | **R$ 1.500-2.500/mês** |

A maior parcela do custo escala com volume de orçamentos (LLM). Infra fixa fica em R$ 80-130/mês até precisar subir Railway para Pro Plan (R$ 100/mês quando o backend exigir mais CPU).

**Custo de desenvolvimento (Fase 2):**

Cenário 1 — Reginaldo conduz com Claude Code (como tem feito): tempo real estimado 5-8 semanas (sessões intermitentes), custo de tokens R$ 1.500-3.000 dependendo do volume de iteração.

Cenário 2 — Contratar dev sênior PJ part-time: 1 mês × R$ 8k-15k.

Cenário 3 — Híbrido: Claude Code para os blocos repetitivos (config, CI, refatorações simples) + dev sênior por 80h dedicadas aos blocos críticos (Clerk + remoção de wrappers Manus). Custo: R$ 4k-8k.

Recomendação: Cenário 1 ou 3. O Cenário 2 só faz sentido se o tempo de Reginaldo for melhor empregado em vendas (quando começar a vender ativamente, vale terceirizar parte da migração).

## 4. Riscos e mitigações

### Risco 1 — Cutover quebra OAuth para usuários existentes

**Impacto:** alto, mas hoje só você usa o produto, então o impacto real é zero.

**Mitigação:** janela de cutover planejada para horário de baixo uso (madrugada de domingo, por exemplo). Fallback: deixar `rrengine.manus.space` no ar por 30 dias após o cutover, redirecionando para `engine.rres.com.br`. Isso dá tempo para clientes futuros (caso entrem antes do cutover) trocarem de URL.

### Risco 2 — Wrappers Manus tinham comportamento que não está documentado

**Impacto:** médio. Itens como `notification.ts` ou `imageGeneration.ts` podem ter dependências sutis com a infra Manus que só aparecem em runtime.

**Mitigação:** auditar cada wrapper antes de remover. Se o wrapper não é usado em produção (ex.: `voiceTranscription.ts` provavelmente não está acionado), apenas deletar com migration de schema se aplicável. Para os usados, criar implementação stub que documenta o que fazia.

### Risco 3 — Variáveis de ambiente não migram automaticamente

**Impacto:** médio. Esquecer uma variável faz o app subir mas falhar em runtime.

**Mitigação:** criar `.env.example` antes de começar a Fase 2, listando todas as variáveis usadas. Validar no smoke test que todas estão preenchidas.

### Risco 4 — Custo de tokens Anthropic surpreende

**Impacto:** baixo a médio. Hoje o produto usa Forge (proxy Manus) — quando passar para Anthropic direta, paga preço de lista da Anthropic. Telemetria do P0.3 mostra o número.

**Mitigação:** rodar 10 orçamentos de teste após o cutover, ler os totais em `agent_llm_calls`, comparar com a planilha de unit economics (Entregável B). Ajustar pricing comercial se desvio for > 30%.

### Risco 5 — Clerk tem custo escondido em features

**Impacto:** baixo. Free tier cobre 10k MAU. Plano pago começa em US$ 25/mês para features avançadas (SSO empresarial, MFA obrigatório).

**Mitigação:** começar no free tier. Quando precisar de SSO para vender para construtoras grandes, é justificativa de receita — passa a R$ 130/mês mas vem com cliente que cobre o custo.

### Risco 6 — TiDB Cloud free tier não escala para 1000 orçamentos/mês

**Impacto:** médio em volume otimista. Cada orçamento gera ~30 linhas em `agent_executions`, ~10 em `agent_llm_calls`, ~80 em `budget_items`, ~1 em `projects`. Total: ~120 linhas/orçamento. 1000 orçamentos = 120k linhas/mês.

**Mitigação:** TiDB Serverless paga começa em US$ 10/mês. Mais barato que migrar de banco. Quando volume passar de 100 orçamentos/mês, ativar plano pago.

### Risco 7 — DNS propaga lento ou cache de CDN serve versão antiga

**Impacto:** baixo. Acontece nas primeiras 24h após cutover.

**Mitigação:** Cloudflare permite purge manual. TTL baixo (300s) na semana do cutover. Avisar usuários (se houver) para limpar cache do navegador.

## 5. Plano de execução em ordem

A ordem abaixo é executável sequencialmente, com PRs separados para cada bloco — mantém o estilo do trabalho que está sendo feito hoje no repositório.

**Sprint 1 (semana 1-2):** Fase 1 inteira (marketing site no Vercel + DNS Cloudflare + landing page).

**Sprint 2 (semana 3):** Provisionar Railway, Vercel para o app, configurar CI/CD, ajustar Vite. Sem desligar Manus ainda — paralelo.

**Sprint 3 (semana 4-5):** Migrar Auth para Clerk. Esse é o bloco mais sensível — bom usar dev sênior se Reginaldo quiser acelerar.

**Sprint 4 (semana 6):** Remover wrappers Manus um por um, com testes de integração após cada remoção.

**Sprint 5 (semana 7):** Smoke test, cutover, comunicação. Manter Manus no ar 30 dias como fallback.

**Pós-migração:** desligar tenant Manus, documentar arquitetura final em `docs/architecture.md` (P2.1 do plano de implementação cobre isso).

## 6. O que NÃO mudar nesta fase

- O pipeline de 10 agentes — já está consolidado pelos PRs P0+P1.
- Schema do banco — só ajustar credenciais.
- Stripe integration — funciona, deixa quieto.
- Tickets P2 que tocam código — fazer só os baratos (P2.3, P2.7) antes da migração; os caros (P2.4 streaming, P2.5 schema versionado) só depois.

## 7. Quando começar

Sugestão: **finalizar P1 (já feito), tocar P2.3 e P2.7, e iniciar Sprint 1 da Fase 1 enquanto avaliamos comercial (Entregável E)**. A Fase 1 é independente do app — pode rodar em paralelo a tudo. Fase 2 começa quando você se sentir confortável, idealmente após ter primeiro cliente real validando o produto em `rrengine.manus.space` (dataset de produção, feedback de usuário, número real para a planilha v2).

---

**Próximos passos no plano original:** Entregável D (SEO/indexação) usa o domínio definido aqui como base. Entregável E (plano comercial) usa os custos calculados aqui para fechar pricing.
