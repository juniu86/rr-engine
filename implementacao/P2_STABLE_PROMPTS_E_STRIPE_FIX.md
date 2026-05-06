# P2 — Estabilidade de prompts + fix Stripe

**Para:** Claude Code
**Branch:** `feat/p2-stable-prompts` (a partir de `main`)
**Escopo:** APENAS backend (`juniu86/rr-engine`)
**Sugestão de empacotamento:** 1 PR com 3 commits separados (1 por fix). Código pequeno, relacionado a "qualidade pós-Sprint-5".

## Contexto

Sprint 5 (Stripe) já está em produção e funcionando. Smoke tests com obras reais (Hangar 37 - SBJR, R$ 2.697.772) revelaram 3 bugs de qualidade que merecem fix dedicado. São independentes entre si, mas todos pequenos e cabem numa PR única.

Estado atual da migração: backend Railway em `api.rres.com.br`, frontend Vercel em `engine.rres.com.br`, banco MySQL Railway, storage R2, LLM Anthropic streaming + prompt caching, Stripe 3 tiers ativos. Detalhes em `CLAUDE.md` na raiz.

Bugs deste pacote já têm workaround server-side (em `services/agentPersistence.ts`), mas o ideal é estabilizar na raiz (prompts + handler Stripe).

## Fix 1 — Estabilizar schema de output do agente Tributário

**Sintoma:** Tributário retorna 3 formatos de output diferentes entre runs do Claude Sonnet (mesma temperatura 0.0):

- Formato declarado pelo `getOutputSchema`: `{ classifiedItems[], totalTaxes, alerts }`
- Formato observado A: `{ taxClassification: { items[], summary{ totalTaxes }, ... } }`
- Formato observado B: `{ classification[] }` (array no top-level, sem chave `taxClassification`)

**Workaround atual:** `agentPersistence.ts` (case `tributario`) normaliza os 3 formatos derivando `totalTaxes` no top-level.

**Causa raiz:** Claude Sonnet ignora `response_format: json_schema` em parte das vezes (Anthropic não suporta strict JSON schema, vimos em `_core/llm-providers.ts:supportsStrictSchema: false` para Claude). Prompt do Tributário não inclui exemplo concreto do schema esperado, então o LLM "improvisa" formato baseado no contexto da chamada.

**Fix proposto:**

1. No prompt do Tributário (`server/agents/index.ts`, classe `TributarioAgent.getSystemPrompt`), adicionar few-shot example mostrando exatamente o output esperado, no formato declarado pelo schema:

```json
{
  "classifiedItems": [
    {"itemId": 1, "taxType": "iss", "taxAmount": 225.00, "retentions": []},
    {"itemId": 2, "taxType": "icms", "taxAmount": 1140.00, "retentions": []}
  ],
  "totalTaxes": 1365.00,
  "alerts": ["Item 5: bitributação ICMS+ISS — verificar se é serviço puro"]
}
```

2. Reforçar instrução: "Output deve ter EXATAMENTE 3 chaves no top-level: `classifiedItems`, `totalTaxes`, `alerts`. Não use `taxClassification`, `classification` ou outros nomes."

3. **NÃO remover** o workaround de `agentPersistence.ts` — manter como rede de segurança caso prompt não estabilize 100%. Mas adicionar log claro `[Tributario] Schema OK (declared format)` quando vier no formato declarado, pra medir taxa de drift.

**Validação:** rodar pipeline com 5 obras diferentes em sequência. Logs devem mostrar `Schema OK` em todas. Se drift acontecer em <20% dos casos, dá pra considerar estabilizado.

## Fix 2 — Estabilizar Auditor + reduzir falsos positivos

**Sintoma:**

- Auditor marca `passed: false` em validações cuja matemática bate (`price_consistency`, `gross_margin`, `cash_flow` retornavam expected=actual mas com `passed: false`)
- Auditor cria validações com `expected` e `actual` vazios, deixando o usuário sem entender qual é a inconsistência
- `validationScore` baixo (ex: 20% em obra que tinha 6 warnings reais e 9 validações OK) — fórmula de cálculo no prompt parece divergir entre runs

**Workaround atual:** server override em `agentPersistence.ts` (case `auditor`) recalcula 3 regras (`price_consistency`, `gross_margin`, `cash_flow`) com tolerância 1% e sobrescreve `passed=true` quando matemática bate. Mas só cobre 3 das ~15 regras que o Auditor gera.

**Causa raiz:** prompt do Auditor não inclui few-shot do output esperado, e a lógica de `passed: true/false` é inferida pelo Claude. Sem exemplos, o LLM ora aplica corretamente, ora não.

**Fix proposto:**

1. No prompt do Auditor (`AuditorAgent.getSystemPrompt`), adicionar 2 few-shot examples — 1 caso `passed: true` e 1 caso `passed: false`:

```json
// Exemplo 1: validação OK
{
  "rule": "price_consistency",
  "description": "Preço Final = (Custo Direto + Logística) × (1 + BDI)",
  "expected": "310031.25",
  "actual": "310031.25",
  "passed": true,
  "severity": "info"
}

// Exemplo 2: divergência real
{
  "rule": "tax_total_check",
  "description": "Total de impostos não deve exceder 50% do preço final",
  "expected": "≤ 155015.62 (50% × 310031.25)",
  "actual": "182000.00 (58.7%)",
  "passed": false,
  "severity": "warning",
  "recommendation": "Revisar regime tributário ou faixa do Simples"
}
```

2. Reforçar regra: "**SEMPRE preencha `expected` e `actual` com valores numéricos calculados, não com placeholder ou string vazia. Se a validação não tem comparação numérica, use string descritiva. Se você não conseguir avaliar, use `severity: 'info'` em vez de criar uma validation falsa.**"

3. Padronizar fórmula do `validationScore` no prompt: `(passed_count / total_count) * 100`, arredondado pra inteiro. Hoje está sendo calculado de forma inconsistente entre runs.

4. **NÃO remover** o server override de `agentPersistence.ts` — ele pega casos que o prompt ainda não estabilize. Adicionar log `[Auditor] Override aplicado em N validações` quando entrar.

**Validação:**

- Rodar pipeline em obra grande (Hangar 37 ou similar)
- Conferir output do Auditor: todos os items com `expected/actual` preenchidos
- `_serverOverrides` (campo adicionado pelo persist) idealmente <= 1 por run

## Fix 3 — Stripe webhook: timestamps de período viraram epoch 0

**Sintoma:** evento `customer.subscription.updated` falha ao atualizar tabela `subscriptions`:

```
Failed query: update subscriptions set status = ?, currentPeriodStart = ?, currentPeriodEnd = ? where id = ?
params: active, 1970-01-01 00:00:00.000, 1970-01-01 00:00:00.000, 1
```

Não bloqueia uso (subscription já foi criada corretamente em `checkout.session.completed`), mas suja logs e impede sincronização correta de mudanças subsequentes (renovação, etc).

**Causa provável (validar na doc):** Stripe API versão `2026-01-28.clover` (que está sendo usada) movou os campos `current_period_start` e `current_period_end` do nível raiz da `Subscription` pra dentro de `subscription.items[0]`. Verificar em [Stripe API Changelog](https://docs.stripe.com/changelog) e [Stripe Subscription object](https://docs.stripe.com/api/subscriptions/object) versão atual.

Se confirmado, o handler em `server/stripe/webhook.ts` faz `new Date(subscription.current_period_start)` que vira `new Date(undefined)` → Invalid Date → Drizzle serializa como `1970-01-01`.

**Fix proposto:**

1. Validar a hipótese olhando a documentação atual da `Subscription` na versão `2026-01-28.clover`. Se confirmado, atualizar o handler:

```typescript
// Antes (bug):
const periodStart = new Date(subscription.current_period_start * 1000);
const periodEnd = new Date(subscription.current_period_end * 1000);

// Depois (defensivo):
const item = subscription.items?.data?.[0];
const periodStartUnix =
  item?.current_period_start ?? subscription.current_period_start;
const periodEndUnix =
  item?.current_period_end ?? subscription.current_period_end;

if (!periodStartUnix || !periodEndUnix) {
  console.warn(
    `[Stripe Webhook] Subscription ${subscription.id} sem period dates, pulando update`
  );
  return;
}

const periodStart = new Date(periodStartUnix * 1000);
const periodEnd = new Date(periodEndUnix * 1000);
```

2. Adicionar test cobrindo evento `customer.subscription.updated` com fixture realística da Stripe API atual (incluindo `items.data[0].current_period_*`).

3. Adicionar guard antes de qualquer `new Date()` em outros handlers do webhook que recebam timestamps Stripe (pra evitar repetição do bug).

**Validação:**

- Test unitário do handler com fixture de `subscription.updated` payload real
- Sanity check: trigger manual via Stripe CLI: `stripe trigger customer.subscription.updated`
- Logs do Railway não devem mostrar mais `Failed query: ... 1970-01-01`

## Definition of done

- [ ] 3 commits separados (1 por fix), com mensagens claras
- [ ] Few-shot examples nos prompts do Tributário e Auditor
- [ ] Handler Stripe defensivo a campos null/undefined
- [ ] Pelo menos 5 testes novos cobrindo: schemas Tributário, output Auditor com expected/actual, webhook Stripe period dates
- [ ] `pnpm test` verde, `pnpm check` verde
- [ ] PR aberto pra `main` com checklist
- [ ] Sem mexer em UI ou frontend

## Comunicação com o founder

Se ao validar a hipótese do Fix 3 a doc da Stripe contradizer (campos NÃO foram movidos), abre comentário no PR explicando a causa real e proponha fix alternativo. Não inventar.

Se durante o Fix 1 ou 2 perceber que o LLM ainda dá drift mesmo com few-shot, **mantenha o workaround server-side** que já existe. Few-shot reduz mas pode não eliminar; o objetivo é reduzir incidência, não remover defesa.

## Referências

- `server/agents/index.ts` — classes dos 10 agentes
- `server/services/agentPersistence.ts` — workarounds atuais (Tributário e Auditor)
- `server/stripe/webhook.ts` — handler atual
- `CLAUDE.md` — contexto migração total
- `implementacao/SPRINT_5_STRIPE.md` — spec do Sprint 5 anterior

## Sources usados nesta spec (validar antes de implementar)

- [Stripe API Changelog](https://docs.stripe.com/changelog)
- [Stripe Subscription object](https://docs.stripe.com/api/subscriptions/object)
- [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
