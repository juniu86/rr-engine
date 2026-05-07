# Ticket — Limpar output do Auditor após aplicar correções

**Para:** Claude Code
**Branch:** `fix/auditor-post-correction-cleanup`
**Origem:** smoke test pós-P3 frontend, 07/05/2026 — projeto 7. User aprovou remoção de 4 itens via `AuditCorrectionsModal`. Backend deletou os 4 budget_items (custo direto caiu de R$ 3.552.635 → R$ 3.438.635). Mas `agent_executions[auditor].output.corrections.budgetItemsToRemove` continua com os mesmos 4 itens listados. Resultado: ao recarregar a página, o modal volta a aparecer pedindo aprovação de algo que já foi aprovado.

## Causa raiz

Em `server/routers.ts`, a procedure `agent.applyAuditCorrections` (linha ~1234) faz só uma metade do trabalho:

1. ✅ Deleta os `budget_items` matching com as descrições
2. ✅ Deleta os `logistics_costs` matching
3. ✅ Recalcula totais do `projects`
4. ❌ **Não atualiza** o `agent_executions[auditor].output.corrections` pra refletir que as correções foram aplicadas

Componente frontend (`AuditCorrectionsModal.tsx`) usa `corrections.budgetItemsToRemove.length > 0` como condição pra mostrar o modal. Como o array nunca é limpo, o modal sempre volta.

## Fix

Em `agent.applyAuditCorrections`, ao final, antes de `return`:

```ts
// 5. Limpar corrections do output do Auditor pra evitar que o modal
// volte a aparecer ao recarregar. As correções foram aplicadas — não
// devem mais ser sugeridas.
const auditorExec = await db.getLatestAuditorExecution(input.projectId);
if (auditorExec?.output) {
  const currentOutput = auditorExec.output as Record<string, any>;
  const updatedOutput = {
    ...currentOutput,
    corrections: {
      ...currentOutput.corrections,
      budgetItemsToRemove: [],
      logisticsToRemove: [],
      // Mantém totalImpact e correctedDirectCost pra histórico/auditoria.
      appliedAt: new Date().toISOString(),
    },
  };
  await db.updateAgentExecutionOutput(auditorExec.id, updatedOutput);
}
```

Pode ser que `db.getLatestAuditorExecution` e `db.updateAgentExecutionOutput` não existam ainda — adicionar em `server/storage.ts` se necessário (queries simples no Drizzle).

## Validação

Test novo em `server/routers.test.ts` ou similar:

```ts
it("limpa corrections do Auditor após applyAuditCorrections", async () => {
  // 1. Setup: projeto com auditor.output.corrections.budgetItemsToRemove = [...]
  // 2. Chama applyAuditCorrections
  // 3. Reload do agent_execution do Auditor
  // 4. Espera: corrections.budgetItemsToRemove === [] e corrections.logisticsToRemove === []
});
```

## Bug relacionado pra atacar no mesmo PR

**#82**: status `approved` com `auditSeal: rejected`.

Origem: PAA DGOA (projeto 6). Auditor retornou `auditSeal: "rejected"` mas o projeto chegou em status `approved` no banco. Inconsistência: o orquestrador deveria ter bloqueado a aprovação se o seal era rejeitado.

Investigar em `server/routers.ts` no fluxo de `confirmProposal` ou onde o status vira `approved`. Provavelmente falta um guard:

```ts
const auditorOutput = await getLatestAuditorOutput(projectId);
if (auditorOutput?.auditSeal === "rejected") {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Auditor reprovou esse projeto. Não pode ser aprovado sem revisão.",
  });
}
```

OU: se a regra é permitir aprovar mesmo com auditSeal rejected, ajustar o tipo do auditSeal ou loggar warning, mas não silenciosamente passar por essa inconsistência.

Pedir ao Reginaldo decisão de produto: deve bloquear ou só avisar?

## Definition of done

- [ ] `applyAuditCorrections` limpa `corrections.budgetItemsToRemove` e `logisticsToRemove` no output do Auditor
- [ ] Helper `db.updateAgentExecutionOutput` (ou patch direto no objeto) implementado
- [ ] Test cobrindo o cenário
- [ ] Decisão de produto sobre #82 (auditSeal rejected vs approved)
- [ ] Guard implementado conforme decisão
- [ ] Smoke test no projeto 7: aprovar correção, recarregar, modal não volta
