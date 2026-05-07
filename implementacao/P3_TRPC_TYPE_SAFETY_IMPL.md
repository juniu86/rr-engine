# P3 — Implementação: Pacote NPM via GitHub Packages (Abordagem A)

**Para:** Claude Code
**Branch:** `feat/p3-trpc-type-safety` (branch única — vai ser PR grande mas escopo bem definido)
**Decisão tomada:** abordagem A confirmada por Reginaldo (07/05/2026).
**Pré-leitura:** `implementacao/P3_TRPC_TYPE_SAFETY.md` (spec de decisão).

## Objetivo

Trocar todas as 24 chamadas tRPC do frontend de string-based pra cliente tipado, importando `AppRouter` do backend via pacote NPM publicado no GitHub Packages. Resultado: typo em path tRPC vira erro de TypeScript, não 404 em produção.

## Estado atual

**Frontend (`rr-engine-app/lib/api.ts`)** — 24 chamadas string-based, listadas abaixo:

| Linha | Router    | Procedure                  | Tipo     |
| ----- | --------- | -------------------------- | -------- |
| 170   | auth      | me                         | query    |
| 219   | project   | list                       | query    |
| 223   | project   | get                        | query    |
| 240   | project   | create                     | mutation |
| 260   | project   | update                     | mutation |
| 265   | project   | delete                     | mutation |
| 399   | agent     | applyAuditCorrections      | mutation |
| 423   | agent     | list                       | query    |
| 431   | agent     | getExecutions              | query    |
| 441   | agent     | executeAll                 | mutation |
| 450   | agent     | execute                    | mutation |
| 467   | agent     | continueAgent              | mutation |
| 527   | settings  | get                        | query    |
| 541   | settings  | update                     | mutation |
| 556   | project   | getRevisions               | query    |
| 572   | project   | createRevision             | mutation |
| 593   | document  | list                       | query    |
| 604   | document  | generateProposal           | mutation |
| 615   | document  | generateMemoria            | mutation |
| 626   | document  | generateSchedule           | mutation |
| 659   | stripe    | listPlans                  | query    |
| 664   | stripe    | getCurrentSubscription     | query    |
| 672   | stripe    | createCheckout             | mutation |
| 680   | stripe    | cancelSubscription         | mutation |

**Helpers atuais:** `callTrpcQuery<T>` e `callTrpcMutation<T>` em `lib/api.ts:27-100` — fazem fetch manual com cookie/Bearer e retornam `Result<T> = { ok: true; data } | { ok: false; error }`.

## Implementação — passo a passo

### Etapa 1 — backend `rr-engine`: criar pacote interno

Criar diretório `packages/api-types/`:

```
rr-engine/
├── packages/
│   └── api-types/
│       ├── package.json
│       ├── tsconfig.json
│       └── index.ts
```

**`packages/api-types/package.json`:**

```json
{
  "name": "@juniu86/rr-engine-api-types",
  "version": "0.1.0",
  "description": "Tipos compartilhados do tRPC AppRouter do rr-engine",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juniu86/rr-engine.git",
    "directory": "packages/api-types"
  },
  "peerDependencies": {
    "@trpc/server": "^11.6.0"
  }
}
```

**`packages/api-types/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "noEmit": false,
    "composite": false,
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["index.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**`packages/api-types/index.ts`:**

```ts
// Re-exporta o tipo do AppRouter pra consumo no frontend.
// IMPORTANTE: este arquivo NÃO deve trazer nenhum import de runtime do
// backend (Drizzle, mysql2, anthropic, etc). Apenas re-export de TIPO.
export type { AppRouter } from "../../server/routers";
```

**Cuidado crítico:** o `tsc` ao buildar esse pacote vai resolver `"../../server/routers"` e vai tocar nas dependências de tipo (mas não de runtime). O `dist/index.d.ts` final só tem o tipo, sem código JS.

Validar localmente:

```bash
cd rr-engine/packages/api-types
pnpm build
cat dist/index.d.ts   # deve ter export type AppRouter = ...
ls dist/              # deve ter index.d.ts e index.d.ts.map
file dist/index.js    # deve ser arquivo JS quase vazio (só re-exports)
```

### Etapa 2 — backend: GitHub Actions workflow pra publicar

Criar `.github/workflows/publish-api-types.yml`:

```yaml
name: Publish api-types

on:
  push:
    branches: [main]
    paths:
      - "server/routers.ts"
      - "server/routers/**"
      - "shared/**"
      - "packages/api-types/**"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://npm.pkg.github.com"
          scope: "@juniu86"

      - run: pnpm install --frozen-lockfile=false

      - name: Bump version (patch)
        working-directory: packages/api-types
        run: |
          # Versão = 0.1.<N> onde N é o número total de commits no main que tocaram routers
          COMMITS=$(git rev-list --count HEAD -- ../../server/routers.ts ../../server/routers ../../shared)
          npm version "0.1.${COMMITS}" --no-git-tag-version --allow-same-version

      - name: Build
        working-directory: packages/api-types
        run: pnpm build

      - name: Publish
        working-directory: packages/api-types
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notas de implementação:

- O versionamento usa contagem de commits que tocaram tipos. Garante versão monotônica sem precisar de tag manual.
- `secrets.GITHUB_TOKEN` é provido automaticamente pelo Actions. Tem permissão de write em packages se o workflow declarar `packages: write`.
- Primeiro publish vai ser `0.1.<N>` onde N é a quantidade atual de commits que tocaram esses paths.

### Etapa 3 — backend: ajustar `pnpm-workspace.yaml` (se já existe) ou raiz

Se o `rr-engine` já não é workspace, criar `pnpm-workspace.yaml` na raiz:

```yaml
packages:
  - "packages/*"
```

Se já existir, apenas garantir que `packages/*` está incluído.

Adicionar no `package.json` raiz do rr-engine, na seção `scripts`:

```json
"build:types": "pnpm --filter @juniu86/rr-engine-api-types build",
"publish:types": "pnpm --filter @juniu86/rr-engine-api-types publish"
```

### Etapa 4 — frontend: configurar auth no GitHub Packages

Frontend precisa autenticar pra puxar pacote privado. Criar `rr-engine-app/.npmrc`:

```
@juniu86:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

`NPM_TOKEN` precisa ser:
1. **Local:** Reginaldo gera Personal Access Token (PAT) no GitHub com escopo `read:packages`. Coloca em `~/.npmrc` ou `export NPM_TOKEN=...` no shell. **Reginaldo faz isso, não o Code** — credencial.
2. **Vercel:** Reginaldo adiciona `NPM_TOKEN` como Environment Variable no projeto Vercel (Production + Preview). **Reginaldo faz, não o Code**.

**Bloco pro spec do Reginaldo (passo a passo):**

```
PRÉ-REQUISITO MANUAL (Reginaldo):

1. Vai em github.com/settings/tokens (Personal Access Tokens — classic)
2. "Generate new token (classic)"
3. Nome: "rr-engine-app reads api-types"
4. Expiration: 1 year (ou mais)
5. Marca SÓ o escopo: read:packages
6. Generate token. Copia o valor (começa com ghp_).
7. Cola em ~/.npmrc local:
   echo "@juniu86:registry=https://npm.pkg.github.com" >> ~/.npmrc
   echo "//npm.pkg.github.com/:_authToken=ghp_xxxxx" >> ~/.npmrc
8. No painel Vercel, projeto rr-engine-app → Settings → Environment Variables:
   - Nome: NPM_TOKEN
   - Valor: ghp_xxxxx (mesmo token)
   - Aplica em: Production + Preview + Development
   - Save

9. Avisa o Code que o token está configurado.
```

### Etapa 5 — frontend: instalar o pacote

```bash
cd rr-engine-app
pnpm add @juniu86/rr-engine-api-types
pnpm add @trpc/client@11 @trpc/react-query@11 @tanstack/react-query@5 superjson
```

(Reginaldo confirma se `@tanstack/react-query` e `@trpc/react-query` já estão no `package.json`. Se sim, só precisa garantir versão alinhada.)

### Etapa 6 — frontend: novo `lib/trpc-client.ts`

Substitui `lib/api.ts`. Estrutura nova:

```ts
// lib/trpc-client.ts
import {
  createTRPCProxyClient,
  httpBatchLink,
  loggerLink,
} from "@trpc/client";
import type { AppRouter } from "@juniu86/rr-engine-api-types";
import superjson from "superjson";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.rres.com.br";

/**
 * Cria cliente tRPC tipado com token Clerk.
 * Cada chamada precisa de token (passado como argumento ou via getter).
 */
export function createTrpcClient(token: string | null) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      loggerLink({
        enabled: opts =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: `${API_URL}/api/trpc`,
        transformer: superjson,
        headers: () => {
          if (!token) return {};
          return { authorization: `Bearer ${token}` };
        },
      }),
    ],
  });
}
```

Adicionalmente, criar wrapper que mantém o contrato `Result<T> = { ok; data } | { ok: false; error }` se o restante do código depende desse formato:

```ts
// lib/trpc-result.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function safeCall<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Erro desconhecido" };
  }
}
```

### Etapa 7 — frontend: refatorar todas as 24 chamadas

Migração 1:1 do padrão antigo pro novo. Exemplo:

**Antes:**

```ts
export async function fetchProject(id: number, token: string | null) {
  return callTrpcQuery<Project>("project.get", { id }, token);
}
```

**Depois:**

```ts
export async function fetchProject(id: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.get.query({ id }));
}
```

**Importante:** se durante a migração você descobrir que a procedure está em router diferente do que o `lib/api.ts` antigo dizia (caso `applyAuditCorrections`), o TypeScript vai acusar `Property 'X' does not exist on type 'Y'` — corrija pro path real e valide no `server/routers.ts` do backend.

**Tabela de migração** (cada linha precisa ser feita):

| Função no frontend                | Path antigo (string)          | Path novo (proxy)            |
| --------------------------------- | ----------------------------- | ---------------------------- |
| `fetchCurrentUser`                | `auth.me`                     | `trpc.auth.me`               |
| `fetchProjects`                   | `project.list`                | `trpc.project.list`          |
| `fetchProject`                    | `project.get`                 | `trpc.project.get`           |
| `createProject`                   | `project.create`              | `trpc.project.create`        |
| `updateProject`                   | `project.update`              | `trpc.project.update`        |
| `deleteProject`                   | `project.delete`              | `trpc.project.delete`        |
| `applyAuditCorrections`           | `agent.applyAuditCorrections` | confirmar com grep no backend |
| `fetchAgentDefinitions`           | `agent.list`                  | confirmar                    |
| `fetchAgentExecutions`            | `agent.getExecutions`         | confirmar                    |
| `executeAllAgents`                | `agent.executeAll`            | confirmar                    |
| `executeAgent`                    | `agent.execute`               | confirmar                    |
| `continueAgent`                   | `agent.continueAgent`         | confirmar                    |
| `fetchCompanySettings`            | `settings.get`                | confirmar                    |
| `updateCompanySettings`           | `settings.update`             | confirmar                    |
| `fetchProjectRevisions`           | `project.getRevisions`        | confirmar                    |
| `createProjectRevision`           | `project.createRevision`      | confirmar                    |
| `fetchProjectDocuments`           | `document.list`               | confirmar                    |
| `generateProposal`                | `document.generateProposal`   | confirmar                    |
| `generateMemoria`                 | `document.generateMemoria`    | confirmar                    |
| `generateSchedule`                | `document.generateSchedule`   | confirmar                    |
| `fetchPlans`                      | `stripe.listPlans`            | confirmar                    |
| `fetchCurrentSubscription`        | `stripe.getCurrentSubscription` | confirmar                  |
| `createCheckout`                  | `stripe.createCheckout`       | confirmar                    |
| `cancelSubscription`              | `stripe.cancelSubscription`   | confirmar                    |

**Para cada linha "confirmar":** rodar `grep -nB 200 "<procedure>:" server/routers.ts | grep "router({" | tail -1` no `rr-engine` pra confirmar router antes de migrar. **Nenhuma migração baseada em presunção.**

### Etapa 8 — frontend: deletar helpers antigos

Após todas as 24 funções migrarem:

- Remover `callTrpcQuery` e `callTrpcMutation` do `lib/api.ts`
- Remover imports não usados
- Renomear `lib/api.ts` pra `lib/api-deprecated.ts.bak` (manter durante 1 sprint pra fallback) ou deletar direto

### Etapa 9 — CI gate no frontend

Atualizar `.github/workflows/ci.yml` (criar se não existe) no `rr-engine-app`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Setup .npmrc
        run: |
          echo "@juniu86:registry=https://npm.pkg.github.com" > ~/.npmrc
          echo "//npm.pkg.github.com/:_authToken=${{ secrets.NPM_TOKEN }}" >> ~/.npmrc
      - run: pnpm install --frozen-lockfile=false
      - run: pnpm tsc --noEmit
```

Reginaldo precisa adicionar `NPM_TOKEN` (mesmo PAT) nos secrets do repo `rr-engine-app` no GitHub.

### Etapa 10 — atualizar CLAUDE.md

No `rr-engine-app/CLAUDE.md`, adicionar seção:

```md
## Como adicionar nova chamada tRPC

1. Implemente a procedure no backend (`rr-engine/server/routers.ts`).
2. Mergeie no main do `rr-engine`. GitHub Actions publica nova versão de
   `@juniu86/rr-engine-api-types` automaticamente.
3. No `rr-engine-app`, atualize a versão do pacote: `pnpm update @juniu86/rr-engine-api-types`.
4. Importe via `trpc.<router>.<procedure>.query()` ou `.mutate()`. TypeScript
   valida o path no editor e em CI.

NÃO use strings literais com paths — esse padrão foi removido em P3.
```

## Definition of done

- [ ] `packages/api-types/` criado no `rr-engine` com build passando
- [ ] Workflow GitHub Actions publica pacote em pushes que tocam tipos
- [ ] Primeira versão (`0.1.N`) publicada com sucesso no GitHub Packages
- [ ] `rr-engine-app/.npmrc` configurado
- [ ] Reginaldo configurou `NPM_TOKEN` local + Vercel + GitHub Actions secrets
- [ ] 24 chamadas migradas pro cliente tipado
- [ ] `pnpm tsc --noEmit` no frontend passa
- [ ] Build do Vercel com a nova versão funciona
- [ ] Smoke test: navegação básica do dashboard sem 404
- [ ] CLAUDE.md atualizado
- [ ] Helpers antigos (`callTrpcQuery`, `callTrpcMutation`) removidos ou marcados como deprecated

## Riscos e mitigações

- **Risco:** circular type imports do backend ao gerar `.d.ts` (Drizzle schema, etc).
  **Mitigação:** se acontecer, criar `packages/api-types/types.ts` que faz tipagem manual mínima do AppRouter sem importar direto. Anotar como tech debt.

- **Risco:** Vercel não consegue puxar pacote privado por falta de NPM_TOKEN.
  **Mitigação:** validar build local com `pnpm install --no-cache` antes de pushar pro Vercel.

- **Risco:** procedure de `getExecutions` ou outra ter assinatura inesperada que não casa com tipo declarado no front.
  **Mitigação:** TypeScript vai gritar na hora da migração — corrige caso a caso.

## Cleanup do investigation residue (fazer antes do PR)

Lembrar de remover do `rr-engine`:

- `console.log("[boot] BUILD_MARKER=...")` em `server/_core/index.ts` — era debug temporário
- Manter `rm -rf dist &&` em `package.json:build:server` — boa prática

## Pergunta pendente pro Reginaldo

Antes do Code começar a Etapa 1, Reginaldo precisa:

1. Confirmar que o PAT do GitHub vai ser gerado e configurado nos 3 lugares (local, Vercel, GitHub Actions secrets do `rr-engine-app`)
2. Decidir nome do pacote: `@juniu86/rr-engine-api-types` ok? (ou prefere outro escopo, tipo `@rrengine/...`?)

Resposta dessas 2 perguntas → Code começa.
