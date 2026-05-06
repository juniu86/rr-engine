# Adendo P2 — Dedup semântica do Auditor

**Para:** Claude Code
**Branch:** integrar ao PR `feat/p2-stable-prompts` se ainda não foi mergeado, senão criar `feat/p2-dedup-semantica` separado
**Origem:** smoke test PAA DGOA, 06/05/2026 — Auditor identificou sobreposição mas não populou `corrections.budgetItemsToRemove`.

## Problema concreto

Pipeline gerou 3 itens descrevendo a mesma "Remoção de 2 tanques de 15.000 L":

- Item 2: "Desativação... esgotamento... inertização N₂... desgaseificação... limpeza interna" — R$ 38.000
- Item 3: "Remoção... corte, içamento, transporte interno" — R$ 25.000
- Item 30: "Remoção... acessórios, bases, fixações... desgaseificação e preparação" — R$ 24.000

E 2 itens descrevendo o mesmo "Fornecimento de 2 tanques 15.000L AISI 304":

- Item 16: R$ 330.000
- Item 34: R$ 250.000

Total potencial de dupla cobrança: ~R$ 310.000 em orçamento de R$ 5,6 M (5,5%).

**O Auditor PERCEBEU** — `auditNotes` contém:

> "Sobreposição de escopo entre grupos de itens (remoção de tanques, bacia de contenção, canaleta): não são duplicatas exatas, mas podem representar dupla contagem de serviços. Revisão técnica recomendada antes da emissão."

**Mas não populou** `corrections.budgetItemsToRemove`. Apenas mencionou em texto livre. O `AuditCorrectionsModal` no frontend só dispara quando `corrections.budgetItemsToRemove.length > 0` — sem isso, o usuário nunca é notificado e a planilha sai com as duplicatas.

## Causa raiz

1. **Prompt do Auditor** (`server/agents/index.ts`, classe `AuditorAgent.getSystemPrompt`) instrui o agente a "identificar sobreposições" mas **não o obriga a tomar decisão de remoção**. O LLM trata o achado como informação consultiva, não como ação.

2. **`dedupUtils.ts`** usa string similarity (Levenshtein/Jaccard ou similar). Itens 3 e 30 têm prefixo idêntico ("Remoção de 2 tanques...") mas resto diverge — score < 0.85, não dispara.

3. Item 2 ("Desativação" + "limpeza interna") e Item 3 ("Remoção" + "corte") são **semanticamente equivalentes** mas lexicalmente distantes — string similarity nunca pega.

## Fix (escopo deste adendo)

### Reforçar prompt do Auditor

Adicionar few-shot example explícito mostrando que **decisão de remoção é obrigatória** quando há sobreposição semântica:

```
EXEMPLO DE SOBREPOSIÇÃO SEMÂNTICA E DECISÃO:

Input: 3 itens de orçamento:
- Item 2: "Desativação completa: esgotamento, drenagem, inertização N₂, desgaseificação, limpeza interna" — R$ 38.000
- Item 3: "Remoção dos 2 tanques: corte, içamento, transporte interno e destinação" — R$ 25.000
- Item 30: "Remoção de 2 tanques: acessórios, bases, fixações, desgaseificação e preparação" — R$ 24.000

Decisão correta:
- Manter o item 2 (é o mais completo e específico — engloba desativação)
- Remover itens 3 e 30 (são subconjuntos do item 2)
- Output:
  "corrections": {
    "budgetItemsToRemove": [
      "Remoção dos 2 tanques existentes de 15.000 litros cada, incluindo corte, içamento, transporte interno e destinação.",
      "Remoção de 2 tanques existentes de 15.000 litros cada, incluindo acessórios, bases, fixações, interligações, válvulas, instrumentação. Desgaseificação e preparação para transporte."
    ],
    "logisticsToRemove": [],
    "totalImpact": 49000,
    "reasoning": "Itens 3 e 30 são subconjuntos do item 2 (desativação completa). Removidos pra evitar dupla cobrança."
  },
  "validations": [
    {
      "rule": "scope_overlap_decision",
      "description": "Sobreposição de escopo: remoção de tanques",
      "expected": "1 item descritivo único",
      "actual": "3 itens com escopo sobreposto (R$ 87.000 total, R$ 38.000 efetivo)",
      "passed": false,
      "severity": "critical",
      "recommendation": "Aprovar remoção via AuditCorrectionsModal"
    }
  ]
```

### Regra obrigatória no prompt

Adicionar:

> **REGRA CRÍTICA**: ao detectar sobreposição semântica entre 2+ itens (mesmo objeto físico ou serviço com descrições diferentes), você DEVE:
>
> 1. Escolher 1 item pra manter (o mais completo/específico, ou o de menor custo se equivalentes)
> 2. Adicionar os outros em `corrections.budgetItemsToRemove[]` com a descrição EXATA do banco
> 3. Calcular `totalImpact` (soma dos valores dos itens removidos)
> 4. Adicionar uma `validation` com `rule: "scope_overlap_decision"`, `severity: "critical"`, `passed: false`
>
> NÃO mencione sobreposições apenas em `auditNotes` — isso não chega ao usuário.

### Validação

Smoke test com pipeline novo no memorial PAA DGOA (mesmo escopo). Confirmar:

- `corrections.budgetItemsToRemove` populado com itens 3, 30, 34 (no mínimo)
- `validationScore` reflete o gap (criticalErrors > 0)
- `totalImpact` calculado e visível
- Frontend dispara `AuditCorrectionsModal` automaticamente

## Próximos passos (PR separado)

Não inclua nesse PR — fica pra ciclo seguinte:

- **Embeddings pra dedup semântica** — usar OpenAI `text-embedding-3-small` (~$0.001 por orçamento) ou alternativa local. Cosine similarity > 0.85 entre embeddings cata "Remoção" vs "Desativação" sem depender do LLM.
- **Threshold ajustável em `dedupUtils.ts`** — env var `DEDUP_SIMILARITY_THRESHOLD` com default 0.85. Permite ajustar agressividade sem rebuild.

## Definition of done

- [ ] Few-shot exemplo no prompt do Auditor com decisão de remoção concreta
- [ ] Regra crítica documentada no prompt
- [ ] 1 teste novo: input com 3 itens de "Remoção de tanques" + esperar `corrections.budgetItemsToRemove.length === 2`
- [ ] Manter override server-side em `agentPersistence.ts` — se Auditor falhar em popular, considerar adicionar pós-processamento que detecta a inconsistência (notes mencionam sobreposição mas array vazio) e loga warning
