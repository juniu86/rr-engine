# Observabilidade — Langfuse (P2.2)

## O que é

Tracing externo do pipeline de 10 agentes via Langfuse cloud (free tier 50k events/mês). Complementar à telemetria interna do P0.3 (`agent_llm_calls` no banco). O Langfuse mostra cada orçamento como uma árvore navegável: trace `orcamento_pipeline` → spans por agente → generations por chamada LLM.

## Como ativar

1. Crie um projeto em https://cloud.langfuse.com (ou aponte para self-hosted).
2. Copie `LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY` do "Project Settings".
3. Defina no `.env` (ou no orquestrador):

   ```
   LANGFUSE_ENABLED=true
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```

4. Reinicie o servidor (`pnpm dev` ou `pnpm start`).

Sem `LANGFUSE_ENABLED=true`, o cliente é `null` e nenhuma chamada de rede acontece — não há custo de performance nem dependência operacional.

## O que esperar no dashboard

- **Trace** `orcamento_pipeline` — um por execução do `executeAll`. Tem `userId` (id interno do usuário) e metadata `{ projectId, projectName }`.
- **Spans** filhos `agent.<tipo>` para cada agente que rodou (até 10).
- **Generations** filhos `agent.<tipo>.llm` ou `llm.<modelo>` com input (messages), `model`, `temperature`, `output` (resposta da LLM) e `usage` (tokens prompt/completion/total).
- Falhas: spans/generations marcados com `level=ERROR` e `statusMessage`.

## Garantia de fail-safe

Toda interação com Langfuse está dentro de `try/catch`. Se a rede para o Langfuse cair, ou as chaves estiverem erradas, ou o cliente lançar exceção, o pipeline de orçamento **não quebra** — apenas registra um warning. A combinação P0.3 (banco interno, source of truth) + P2.2 (Langfuse, debugging visual) é redundante intencionalmente.

## Saved views úteis

Após acumular dados, vale criar saved views no Langfuse para:

- "Orçamentos com falha" — filter `level=ERROR`.
- "Agentes mais lentos" — sort by latency, group by span name.
- "Custo por dia" — sum `usage.totalTokens` weighted por preço por modelo.

## Migração futura

Langfuse é open source. Quando o volume justificar (ou a fase de migração para fora do Manus chegar), considerar self-host via Docker. Estrutura do código (`server/services/tracing.ts`) abstrai a escolha — basta apontar `LANGFUSE_HOST` para a instância self-hosted.
