# Sprint 5 — Stripe + 3 tiers

**Para:** Claude Code
**Branch:** `feat/sprint-5-stripe-tiers` (a partir de `main` do `rr-engine`)
**Origem:** consolida P1.7 + estado real após migração total pra fora do Manus

## Contexto

A migração total saiu do Manus em 5 sprints (Infra, Auth Clerk, Backend Railway, UI completa, otimizações). Pipeline funciona end-to-end. Falta o último componente do produto comercial: pagamento via Stripe com 3 tiers.

Hoje a tabela `subscriptions` existe e o gate `canCreateBudget` em `server/stripe/stripeService.ts` consome dela, mas não tem nenhum fluxo de assinatura plugado. Pra teste, créditos são inseridos manualmente via `scripts/seed-credits.mjs`.

Estado relevante depois da migração:

- Backend rodando em `api.rres.com.br` (Railway, branch atual `feat/sprint-3-railway-deploy` — fazer rebase em `main` antes de criar a branch nova)
- Frontend em `engine.rres.com.br` (Vercel, branch `main` do `juniu86/rr-engine-app`)
- `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` já configurados no Railway (modo TESTE)
- Webhook Stripe **não está apontando** pra `api.rres.com.br` ainda — precisa configurar no Stripe Dashboard

## Escopo

### 1. Produtos Stripe

3 tiers:

| Tier | Preço/mês | Quota orçamentos | Cap por obra |
| --- | --- | --- | --- |
| Starter | R$ 199 | 5 / mês | até R$ 500k |
| Pro | R$ 499 | 20 / mês | até R$ 5M |
| Business | R$ 1.499 | ilimitado | ilimitado |

Criar via Stripe Dashboard ou via API. Salvar Price IDs em variáveis de ambiente:

```
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_yyy
STRIPE_PRICE_BUSINESS=price_zzz
```

### 2. Endpoints tRPC novos (`server/routers/stripe.ts`)

```typescript
stripe.listPlans  // public — retorna [{ tier, name, priceMonthly, quota, cap, priceId }]
stripe.createCheckout  // protected, input: { tier } → retorna { sessionId, url }
stripe.cancelSubscription  // protected — cancela no fim do período atual
stripe.getCurrentSubscription  // protected — retorna assinatura ativa do user (ou null)
```

### 3. Webhook Stripe

Endpoint Express **direto** (não-tRPC, pq Stripe envia raw body) já existe em `server/_core/index.ts`:

```typescript
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
```

Implementar handler em `server/stripe/webhook.ts`:

- `checkout.session.completed` → criar/atualizar `subscriptions` com `status='active'`, `plan` correspondente, `currentPeriodEnd`
- `invoice.paid` → renovar `currentPeriodEnd`, resetar `quotaUsed=0`
- `customer.subscription.deleted` → marcar `status='canceled'`
- `customer.subscription.updated` → sincronizar `status` e `currentPeriodEnd`

Configurar webhook no Stripe Dashboard apontando pra `https://api.rres.com.br/api/stripe/webhook` com signing secret no `STRIPE_WEBHOOK_SECRET`.

### 4. Cap por tamanho de obra

Adicionar coluna `obraValueCap` (decimal, nullable) na tabela `subscriptions`. Migration nova em `drizzle/`:

```sql
ALTER TABLE subscriptions ADD COLUMN obraValueCap DECIMAL(15,2) NULL;
```

Ao criar projeto, validar `totalPrice` (após pipeline) contra o cap:

- Starter: 500.000
- Pro: 5.000.000
- Business: NULL (sem cap)

Se exceder, marcar projeto com warning no Auditor (não bloquear).

### 5. UI no rr-engine-app

**Página `/planos`** (Server Component):

- 3 cards lado a lado com nome, preço, recursos, botão "Assinar"
- Cliente em `lib/api.ts`: adicionar `stripe.listPlans` e `stripe.createCheckout`
- Botão "Assinar" chama `createCheckout`, redireciona pra `data.url`

**`/dashboard` header**: badge "Plano: Starter" (ou "Sem plano") quando logado. Adicionar `stripe.getCurrentSubscription` no Server Component da página.

**`/dashboard/settings`**: nova seção "Plano e cobrança":

- Mostrar plano atual + próxima cobrança
- Botão "Cancelar plano" → chama `stripe.cancelSubscription` com confirmação modal
- Link "Trocar de plano" → leva pra `/planos`

### 6. Testes

- `server/stripe/webhook.test.ts` — cobrir os 4 eventos com fixtures de payload Stripe (já tem suite parcial em `server/stripe.test.ts`, expandir)
- `server/stripe/stripeService.test.ts` — `canCreateBudget` com cada tier + over-quota
- Manter as 25 suites Vitest verdes — adicionar pelo menos 5 testes novos

### 7. Pendências satélites (mesma branch ou separada — sua decisão)

Aproveitar pra estabilizar prompts:

**P59 — Tributário schema instável**: Claude varia entre `classifiedItems`, `taxClassification`, `classification[]`. Hoje normalizamos no `server/services/agentPersistence.ts`, mas o ideal é estabilizar no prompt (system message com exemplo few-shot do schema correto).

**P66 — Auditor falsos positivos**: marca `passed=false` em validações que matematicamente passam. Override server cobre 3 regras hoje. Adicionar few-shot exemples no prompt do Auditor mostrando `passed: true` quando esperado=encontrado.

Priorize Stripe primeiro; satélites são bônus se restar tempo.

## Definition of done

- 3 produtos no Stripe BR criados (modo teste e modo live com price IDs em env vars)
- Endpoints tRPC + webhook funcionando
- Migration de `obraValueCap` aplicada em produção (script `node scripts/db-push.mjs` ou `pnpm db:push`)
- Página `/planos` no `rr-engine-app` com checkout funcionando end-to-end
- Badge de plano no `/dashboard`
- Cancelamento + troca de plano em `/dashboard/settings`
- 25+ suites Vitest verdes
- PR aberto pra `main` do `rr-engine` com checklist do P1.7 marcado
- PR aberto pra `main` do `rr-engine-app` com a UI

## Referências

- `implementacao/P1.7_pricing_3_tiers_cap_tamanho.md` — spec original do tier (preços e caps são daqui)
- `server/stripe/stripeService.ts` — gate `canCreateBudget` já existe
- `server/stripe/webhook.ts` — handler atual (incompleto)
- `drizzle/schema.ts` — tabela `subscriptions` existente
- `HANDOFF.md` no `rr-engine-app` — contexto da migração total e arquitetura atual

## Observações de produção

- Banco MySQL Railway, `MYSQL_PUBLIC_URL` no card MySQL → Variables. Use o seed em `scripts/seed-credits.mjs` como referência pra scripts auxiliares.
- LLM: `ANTHROPIC_API_KEY` configurada, streaming ativo, prompt caching ephemeral.
- Storage: R2 com bucket `rr-engine`. `server/storage.ts` já reescrito (S3-compatible).
- Dois bugs com workaround server-side documentados: Tributário schema variável e Auditor falsos positivos. Estabilizar via prompt resolve definitivamente.
