# Sprint 5 — Stripe + 3 tiers (BACKEND)

**Para:** Claude Code
**Branch:** `feat/sprint-5-stripe-tiers` (a partir de `main`)
**Escopo:** APENAS backend (`juniu86/rr-engine`). UI no `rr-engine-app` fica fora do escopo desta PR.

## Por que só backend

A UI precisa ser implementada num repo diferente (`rr-engine-app`, Next.js no Vercel). O agente Cowork (Claude desktop) cuida dela em paralelo. Sua tarefa aqui é entregar:

- Endpoints tRPC + webhook que o frontend vai consumir
- Schema novo (`obraValueCap` em `subscriptions`)
- Testes do webhook + gate

Quando o backend estiver verde no PR, eu (founder) sincronizo a UI no outro repo usando os contratos que você definir.

## Contexto da migração (importante)

Desde que o `CLAUDE.md` foi escrito, o produto saiu do tenant Manus:

- Backend agora roda no Railway em `api.rres.com.br`
- Banco é MySQL plugin do Railway (não TiDB Cloud do Manus)
- Storage é Cloudflare R2 (S3-compatible) em vez do storage Manus
- LLM é Anthropic direto via streaming + prompt caching
- Auth é Clerk (`@clerk/backend.verifyToken`), não OAuth Manus
- Branch ativa em produção: `feat/sprint-3-railway-deploy`

Variáveis Stripe já configuradas no Railway (modo TESTE):

- `STRIPE_SECRET_KEY` — `sk_test_...`
- `STRIPE_WEBHOOK_SECRET` — `whsec_...`

Falta criar e configurar:

- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` — Price IDs depois de criar produtos
- Webhook endpoint no Stripe Dashboard apontando pra `https://api.rres.com.br/api/stripe/webhook`

## Estado atual do código Stripe

Já existe parcialmente:

- `server/stripe/products.ts` — verificar conteúdo, pode ter definição dos tiers
- `server/stripe/stripeService.ts` — gate `canCreateBudget` e `consumeBudgetCredit` já implementados
- `server/stripe/webhook.ts` — handler atual (incompleto, precisa expandir)
- `server/routers/stripe.ts` — router existente, expandir
- `drizzle/schema.ts` — tabela `subscriptions` existe, falta `obraValueCap`

Sua tarefa é completar/refazer onde necessário, não começar do zero.

## Escopo

### 1. Produtos Stripe (3 tiers)

| Tier | Preço/mês (BRL) | Quota orçamentos | Cap por obra |
| --- | --- | --- | --- |
| Starter | 199,00 | 5 / mês | até R$ 500.000 |
| Pro | 499,00 | 20 / mês | até R$ 5.000.000 |
| Business | 1.499,00 | ilimitado | sem cap |

Criar via Stripe Dashboard ou via API (`stripe.products.create` + `stripe.prices.create` em script auxiliar `scripts/create-stripe-products.mjs`). Salvar Price IDs em variáveis de ambiente:

```
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_yyy
STRIPE_PRICE_BUSINESS=price_zzz
```

### 2. Endpoints tRPC novos (`server/routers/stripe.ts`)

Contrato esperado pelo frontend:

```typescript
stripe.listPlans  // public
  // → Array<{ tier: 'starter' | 'pro' | 'business', name: string, priceMonthly: number, currency: 'BRL', quota: number | null, cap: number | null, priceId: string }>

stripe.createCheckout  // protected
  // input: { tier: 'starter' | 'pro' | 'business' }
  // → { sessionId: string, url: string }
  // success_url: https://engine.rres.com.br/dashboard/settings?stripe=success
  // cancel_url:  https://engine.rres.com.br/planos?stripe=canceled

stripe.cancelSubscription  // protected
  // Cancela no fim do período atual via subscriptions.update({ cancel_at_period_end: true })
  // → { success: true, cancelAt: Date }

stripe.getCurrentSubscription  // protected
  // → { plan: 'starter' | 'pro' | 'business' | null, status: string, currentPeriodEnd: Date | null, quotaUsed: number, quotaLimit: number | null, obraValueCap: number | null } | null
```

### 3. Webhook Stripe

Endpoint Express direto (não-tRPC) já existe em `server/_core/index.ts`:

```typescript
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
```

Implementar handler completo em `server/stripe/webhook.ts`:

- `checkout.session.completed` → criar `subscriptions` com `status='active'`, `plan` correspondente, `currentPeriodEnd`, `obraValueCap` (lookup do tier), resetar `quotaUsed=0`
- `invoice.paid` → renovar `currentPeriodEnd`, resetar `quotaUsed=0`
- `customer.subscription.deleted` → marcar `status='canceled'`
- `customer.subscription.updated` → sincronizar `status` e `currentPeriodEnd`

Validar assinatura via `stripe.webhooks.constructEvent` com `STRIPE_WEBHOOK_SECRET`. Retornar 200 com body vazio em todos os casos válidos (Stripe re-tenta em 5xx).

### 4. Schema migration

Adicionar coluna `obraValueCap` em `subscriptions`:

```typescript
// drizzle/schema.ts
obraValueCap: decimal("obraValueCap", { precision: 15, scale: 2 }),
```

Gerar migration com `pnpm exec drizzle-kit generate`. Migration nova será `drizzle/0021_*.sql`. Aplicar em produção depois do deploy via:

```bash
DATABASE_URL='<MYSQL_PUBLIC_URL>' pnpm db:push
```

(Founder roda manualmente em produção; em CI/dev rodar localmente).

### 5. Cap por tamanho de obra

No final do pipeline, em `routers.ts` (procedure `agent.executeAll`), depois do Auditor, validar `comercialResult.finalPrice` contra `subscription.obraValueCap`:

- Se `obraValueCap` é null (Business) → sem validação
- Se `finalPrice > obraValueCap` → adicionar warning ao Auditor com severity `warning`, mensagem clara, NÃO bloquear o orçamento (founder quer ver o número de qualquer forma)

### 6. Testes

Adicionar/expandir suites:

- `server/stripe/webhook.test.ts` — fixtures dos 4 eventos. Use `stripe.webhooks.generateTestHeaderString` pra fingir signing.
- `server/stripe/stripeService.test.ts` — `canCreateBudget` com cada tier + over-quota + cap.

Manter as 25 suites Vitest existentes verdes. Adicionar pelo menos 5 testes novos.

### 7. Documentação

Atualizar `CLAUDE.md`:

- Remover Stripe da seção "O que NÃO mexer nesta fase"
- Adicionar nota: "Stripe é parte do Sprint 5 — ver implementacao/SPRINT_5_STRIPE.md"
- Atualizar a seção de variáveis de ambiente com `STRIPE_PRICE_*`

## Definition of done

- [ ] Migration `obraValueCap` aplicada e schema atualizado
- [ ] 4 endpoints tRPC implementados e tipados
- [ ] Webhook validado com signing secret, 4 eventos cobertos
- [ ] Cap de obra validado server-side com warning não-bloqueante
- [ ] 5+ testes novos, todas as suites verdes (`pnpm test`)
- [ ] `pnpm check` (TypeScript) passa
- [ ] `pnpm format` aplicado
- [ ] CLAUDE.md atualizado
- [ ] PR aberto pra `main` com checklist do P1.7 marcado

## Pendências fora desta PR

- **Setup do produto no Stripe Dashboard** (founder cria os 3 produtos via UI ou via script). Você pode criar `scripts/create-stripe-products.mjs` mas o founder roda manualmente.
- **Configurar webhook endpoint no Stripe Dashboard** apontando pra `https://api.rres.com.br/api/stripe/webhook` — founder configura.
- **UI** (página `/planos`, badge no dashboard, settings de cobrança) — Cowork faz no `rr-engine-app`.
- **Estabilização de prompts** (Tributário #59, Auditor #66) — branch separada `feat/p2-stable-prompts`. Não misture com Stripe.

## Referências

- `implementacao/P1.7_pricing_3_tiers_cap_tamanho.md` — spec original do tier (preços e caps são daqui)
- `server/stripe/stripeService.ts` — gate `canCreateBudget` já existe
- `server/stripe/webhook.ts` — handler atual (incompleto)
- `drizzle/schema.ts` — tabela `subscriptions` existente

## Comunicação com o founder

Se encontrar ambiguidade na spec, **não invente** — pergunta. Se decidir uma trade-off técnica não trivial, registra no PR description. Se algum teste flakar, marca explicitamente em vez de skippar.

Founder está em standby pra qualquer questão de integração com a UI ou com Stripe Dashboard.
