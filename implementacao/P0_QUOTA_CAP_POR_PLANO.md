# P0 — Cap de orçamentos/mês por plano

**Para:** Claude Code
**Branch:** `feat/p0-quota-cap-por-plano`
**Prioridade:** P0 — sem isso, qualquer cliente power user gera prejuízo. Antes de Sprint 6 (cutover Manus).
**Origem:** análise de custo 07/05/2026 — custo real médio de R$ 70/orçamento, preços de plano atuais não cobrem uso intensivo.

## Contexto

Custo real (medido em produção via `agent_llm_calls`):

| Tamanho de obra | Custo/orçamento |
|-----------------|-----------------|
| Grande (Hangar) | R$ 98 |
| Médio (DGOA) | R$ 60-70 |
| Pequeno (Reforma) | R$ 56 |
| Média ponderada | **R$ 70** |

Preços de plano (Sprint 5):

| Tier | Preço/mês | Break-even |
|------|-----------|-----------|
| Starter | R$ 199 | 2.8 orçamentos |
| Pro | R$ 499 | 7.1 orçamentos |
| Business | R$ 1.499 | 21.4 orçamentos |

Sem cap, user agressivo no Starter rodando 30 orçamentos custa R$ 2.100, gera prejuízo de **R$ 1.901**.

## Caps propostos (conservadores, alvo break-even)

| Tier | Cap mensal | Margem se atingir cap | Headroom |
|------|-----------|----------------------|---------|
| Starter | **2 orçamentos** | R$ 199 - 140 = R$ 59 (30%) | 0.8 orçamentos antes do prejuízo |
| Pro | **7 orçamentos** | R$ 499 - 490 = R$ 9 (1.8%) | 0.1 orçamento |
| Business | **20 orçamentos** | R$ 1.499 - 1.400 = R$ 99 (6.6%) | 1.4 orçamentos |

**Importante:** esses caps protegem de prejuízo direto, mas não dão margem saudável. Devem ser revisados pra cima depois que tickets de eficiência (P2_ENGENHEIRO_PARTIAL_RERUN, prompt caching otimizado, threshold Opus/Sonnet) reduzirem custo unitário pra ~R$ 25-30.

## Implementação

### Schema

Tabela `subscriptions` provavelmente já tem `quotaUsed` e `quotaLimit` (vi no tipo `Subscription` do front). Confirmar e popular `quotaLimit` por tier:

- starter → 2
- pro → 7
- business → 20

Migration nova se preciso. Reset mensal automático (cron em `server/_core/scheduler.ts`?).

### Guard no fluxo de criação de projeto

Em `server/routers.ts`, procedure `project.create`:

```ts
.mutation(async ({ ctx, input }) => {
  // ... código existente ...

  // P0: enforce cap de quota
  const sub = await db.getActiveSubscription(ctx.user.id);
  if (sub && sub.quotaLimit !== null && sub.quotaUsed >= sub.quotaLimit) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Você atingiu o limite de ${sub.quotaLimit} orçamentos do plano ${sub.plan}. Faça upgrade pra continuar.`,
    });
  }

  // Cria projeto + incrementa quotaUsed
  const project = await db.createProject(input);
  await db.incrementQuotaUsed(sub.id);

  return { projectId: project.id };
}),
```

### Reset mensal

Cron diário verifica subscriptions cujo `currentPeriodStart` cruzou virada de mês. Reseta `quotaUsed = 0`. Pode rodar via Stripe webhook `customer.subscription.updated` quando ele dispara em cada renovação.

### UI

Frontend já mostra `quotaUsed/quotaLimit` no badge do dashboard (linha 58 do `app/dashboard/page.tsx`). Quando `quotaUsed >= quotaLimit`:

- Badge fica laranja
- Botão "Novo projeto" desabilitado, mostra tooltip "Limite mensal atingido — fazer upgrade"
- CTA pra `/planos` no banner

### Casos especiais

- **Free tier (sem subscription)**: bloquear criação de projeto, mostrar `/planos` (já existe?)
- **Subscription cancelada com `cancelAtPeriodEnd=true`**: continua funcionando até `currentPeriodEnd`, depois trava
- **Trial period**: se houver, cap reduzido (ex: 1 orçamento) ou mesmo cap mas tempo limitado

## Validação

1. Test em `server/routers.test.ts`:
   - User com `quotaUsed=2, quotaLimit=2` no Starter chama `project.create` → recebe `PRECONDITION_FAILED`
   - User com `quotaUsed=1, quotaLimit=2` chama `project.create` → sucesso, `quotaUsed` vira 2
   - User Pro com `quotaUsed=7, quotaLimit=7` é bloqueado
2. Smoke manual: criar 3 projetos no Starter, ver bloqueio no terceiro

## Definition of done

- [ ] Schema confirma `quotaLimit` populado por tier (starter=2, pro=7, business=20)
- [ ] Guard em `project.create` retorna `PRECONDITION_FAILED` quando atinge cap
- [ ] `quotaUsed` incrementa em sucesso de criação
- [ ] Reset mensal automático (cron ou via webhook Stripe)
- [ ] UI dashboard: badge laranja + botão desabilitado quando cap atingido
- [ ] Tests cobrindo os 3 cenários acima
- [ ] Doc no CLAUDE.md de como ajustar cap (env var ou tabela?)

## Próximas evoluções (escopo de outro PR)

- Cap por valor de obra (já tem `obraValueCap`) — mantido
- Notificação por email quando user atinge 80% do cap
- Plano "Ilimitado" pra clientes enterprise com pricing customizado
- Add-ons pagos: comprar pacotes avulsos de orçamentos extras (pay-per-use)
