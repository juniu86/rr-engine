# RR Engine

SaaS de orçamentação automatizada de obras civis. A entrada é um memorial descritivo em texto/markdown; a saída é uma proposta comercial (PDF), uma memória de cálculo (XLSX) e um cronograma físico-financeiro. O motor é um pipeline sequencial de 10 agentes de IA orquestrados via tRPC, com validação cruzada por um motor determinístico paralelo e bases de preço SINAPI/PINI como referência.

A versão atual roda hoje em `rrengine.manus.space` (tenant Manus) e está sendo preparada para reconstrução fora do Manus. Esta fase de implementação foca em pagar dívida técnica e reduzir acoplamento — toda contribuição segue um ticket catalogado em `implementacao/`.

## Como começar

- `CLAUDE.md` — guia obrigatório para sessões do Claude Code (stack, convenções, agentes, fluxo de PR).
- `implementacao/` — tickets ativos da fase atual (P0/P1/P2).
- `analise-estrategica/` — diagnóstico que originou os tickets.
- `docs/` — documentação para humanos (técnica, exemplos, histórico arquivado).

## Comandos básicos

```bash
pnpm install
pnpm dev          # NODE_ENV=development tsx watch server/_core/index.ts
pnpm test         # vitest run
pnpm check        # tsc --noEmit
pnpm build        # vite build + esbuild server bundle
pnpm format       # prettier
pnpm db:push      # drizzle-kit generate && drizzle-kit migrate
```

