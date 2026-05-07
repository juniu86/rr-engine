# P3 — Type-safety completa do tRPC entre repos

**Para:** Reginaldo (decisão de arquitetura) → Claude Code (implementação após decisão)
**Contexto:** bug de 07/05/2026 — frontend chamou `project.applyAuditCorrections` quando o backend tinha `agent.applyAuditCorrections`. 404 em prod, debug de ~1h. A causa estrutural é: `rr-engine-app` (Next.js) e `rr-engine` (backend tRPC) são **repos separados sem compartilhamento de tipos**. Frontend usa strings literais nos paths — typo só falha em runtime.

Decisão tomada: **não implementar mais nada antes de fechar a type-safety.**

## Objetivo

Frontend importa o tipo `AppRouter` do backend e passa a usar o cliente tRPC tipado. Trocar:

```ts
// hoje (string-based, sem checagem):
callTrpcMutation("project.applyAuditCorrections", input, token)

// depois (tipado, autocompletado, erro de compile em typo):
trpc.agent.applyAuditCorrections.useMutation()
```

Resultado: typos viram erro de TypeScript no editor e em CI, antes de chegar em produção.

## 3 abordagens — escolher 1 antes de implementar

### Abordagem A — Pacote NPM via GitHub Packages (privado, gratuito)

**Como funciona:**

1. Dentro do `rr-engine`, criar `packages/api-types/` com:
   - `package.json` declarando nome `@juniu86/rr-engine-api-types`
   - `index.ts` que re-exporta `export type { AppRouter } from "../../server/routers"`
   - Build com `tsc --emitDeclarationOnly --declaration` gera só `.d.ts`, sem JS de runtime
2. Workflow GitHub Actions publica versão nova no GitHub Packages a cada push em `main` que toque `server/routers.ts` ou `packages/api-types/`
3. Frontend instala via `pnpm add @juniu86/rr-engine-api-types` (com auth token do GitHub Packages)
4. `lib/api.ts` refatorada pra usar `createTRPCProxyClient<AppRouter>`

**Trade-offs:**

- ✅ Solução padrão da indústria pra repos separados
- ✅ Versionamento via semver — backend pode evoluir sem quebrar frontend até o próximo bump
- ✅ Frontend não precisa do source completo do backend (só types)
- ❌ Setup de auth token GitHub Packages no Vercel + GitHub Actions
- ❌ Cada mudança de tipo exige publicar versão nova + bump no frontend
- ❌ Latência: backend mergea, espera publicar, atualiza frontend, novo PR
- ⏱️ Esforço de setup: ~3h. Manutenção contínua: ~5min/release.

### Abordagem B — Submodule git ou git URL como dependência

**Como funciona:**

1. Dentro do `rr-engine`, criar `packages/api-types/` igual abordagem A (estrutura mínima, só tipos)
2. Frontend instala via git URL no `package.json`:
   ```json
   "dependencies": {
     "@rr-engine/api-types": "github:juniu86/rr-engine#main&path:packages/api-types"
   }
   ```
   ou usa git submodule em `rr-engine-app/.shared/api-types/`
3. `pnpm install` no Vercel puxa o repo backend completo (ou submodule), mas só consome o subpath de types

**Trade-offs:**

- ✅ Não precisa publicar pacote nem CI/CD pra cada release
- ✅ Frontend sempre puxa main mais recente do backend automaticamente
- ❌ pnpm com subpath (`#main&path:`) tem suporte limitado, pode quebrar
- ❌ Submodule git é manual: `git submodule update --remote` antes de cada build do Vercel
- ❌ Vercel precisa de SSH key/token pra clonar (se repo privado)
- ❌ Sem versionamento: PR no backend que muda tipo quebra frontend sem aviso
- ⏱️ Esforço de setup: ~2h. Manutenção contínua: alta — fragilidade.

### Abordagem C — Monorepo (pnpm workspaces)

**Como funciona:**

1. Criar repo novo `rr-platform/` com estrutura:
   ```
   rr-platform/
   ├── apps/
   │   ├── backend/    (era rr-engine)
   │   └── frontend/   (era rr-engine-app)
   └── packages/
       └── api-types/  (compartilhado)
   ```
2. `pnpm-workspace.yaml` declara workspaces
3. `apps/frontend/package.json` referencia `"api-types": "workspace:*"` — type-safe local, sem publicação
4. Migrar histórico git dos 2 repos atuais via `git subtree` (preserva commits)
5. Reconfigurar deploys:
   - Railway aponta pra `apps/backend/`
   - Vercel aponta pra `apps/frontend/`

**Trade-offs:**

- ✅ Padrão fullstack tRPC moderno (T3 stack, shadcn-style projects)
- ✅ Type-safety completa em tempo real, sem build step intermediário
- ✅ Refator atômico: PR pode mudar backend e frontend juntos
- ✅ Tooling unificado (lint, format, test)
- ❌ Migração trabalhosa: histórico, deploys, branches ativas, secrets duplicados
- ❌ Risco de quebrar Railway/Vercel durante a migração
- ❌ Branches abertas no GitHub viram inválidas
- ⏱️ Esforço de setup: ~1-2 dias. Manutenção contínua: zero.

## Recomendação técnica

**Abordagem C** é tecnicamente superior, mas o custo de migração é alto e tem risco real de quebrar produção (Railway + Vercel apontam pra paths novos). Faz mais sentido em um projeto novo.

**Abordagem A** é o padrão pra repos separados em produção. É o que projetos comerciais fazem quando frontend e backend estão em domínios/times diferentes. Recomendo essa **se a decisão é manter os 2 repos** separados.

**Abordagem B** é tentadora pela simplicidade aparente, mas tem fragilidade real (subpath pnpm, ausência de versionamento). Não recomendo.

## Critérios de aceite (qualquer abordagem escolhida)

- [ ] Frontend importa `AppRouter` do backend (via pacote, submodule ou workspace)
- [ ] `lib/api.ts` reescrita com `createTRPCProxyClient<AppRouter>` (ou equivalente do `@trpc/react-query`)
- [ ] Todas as chamadas existentes migradas: 5 mutations + N queries (listar todas em `lib/api.ts`)
- [ ] `pnpm tsc --noEmit` no frontend falha se path tRPC inexistente
- [ ] CI do frontend roda `pnpm tsc --noEmit` e bloqueia merge se falhar
- [ ] Doc no `CLAUDE.md` do `rr-engine-app` explicando como adicionar nova chamada

## Pergunta pra Reginaldo decidir

Qual abordagem? A, B ou C?

Recomendação minha: **A** (pacote via GitHub Packages). Esforço médio, risco baixo, padrão da indústria.

Depois da decisão: Code escreve o spec detalhado de implementação dessa abordagem específica e abre PR.

## Pré-requisito antes de começar

Limpeza do investigation residue:

- [ ] Remover `console.log("[boot] BUILD_MARKER=...")` de `server/_core/index.ts` (era debug)
- [ ] Manter `rm -rf dist &&` no `build:server` (boa prática, fica)
