# P3 — Diffs prontos para o frontend `rr-engine-app`

**Para:** Cowork (agente que aplica no `rr-engine-app` local).
**Branch sugerida no `rr-engine-app`:** `feat/p3-trpc-type-safety-frontend`.
**Pré-leituras:** `implementacao/P3_TRPC_TYPE_SAFETY.md` (decisão), `implementacao/P3_TRPC_TYPE_SAFETY_IMPL.md` (Etapa 1–3 já mergeadas via PR #27).

Este documento traz tudo que falta nas Etapas 5–10 com diffs copy-paste-ready. Toda procedure listada foi auditada contra o `server/routers.ts` real do backend (commit `119f769` em `main`) — paths corretos, tipos derivados via inferência do `AppRouter`.

---

## Pré-condições verificadas

Antes de aplicar:

- [ ] Reginaldo gerou PAT no GitHub com escopo `read:packages`.
- [ ] `~/.npmrc` local tem:
  ```
  @juniu86:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=ghp_xxxxx
  ```
- [ ] Vercel Environment Variables: `NPM_TOKEN=ghp_xxxxx` aplicado em Production + Preview + Development.
- [ ] GitHub Actions secrets do `rr-engine-app` (Settings → Secrets and variables → Actions): `NPM_TOKEN=ghp_xxxxx`.
- [ ] Workflow `publish-api-types` rodou com sucesso após o merge de PR #27 — pacote `@juniu86/rr-engine-api-types@0.1.<N>` disponível em https://github.com/juniu86?tab=packages.

Sem qualquer um desses, o build local/Vercel/CI falha em `pnpm install`.

---

## Etapa 5 — instalar dependências

Dentro de `rr-engine-app`:

```bash
pnpm add @juniu86/rr-engine-api-types
pnpm add @trpc/client@^11 @trpc/react-query@^11 @tanstack/react-query@^5 superjson
```

Se `@trpc/react-query` ou `@tanstack/react-query` já estão no `package.json`, só `pnpm update` para alinhar versões. Se `superjson` já está, idem.

**Conferência rápida** após install:

```bash
pnpm ls @juniu86/rr-engine-api-types @trpc/client @trpc/react-query @tanstack/react-query superjson | head
cat node_modules/@juniu86/rr-engine-api-types/package.json | jq '.version, .main, .types'
# deve imprimir 0.1.<N>, ./dist/packages/api-types/index.js, ./dist/packages/api-types/index.d.ts
```

---

## Etapa 6 — `lib/trpc-client.ts` (NOVO, completo)

Cria o arquivo `rr-engine-app/lib/trpc-client.ts`:

```ts
/**
 * P3 — Cliente tRPC tipado.
 *
 * Substitui `callTrpcQuery`/`callTrpcMutation` de `lib/api.ts`. Cada path
 * é validado em tempo de compilação contra `AppRouter` exportado do backend
 * via `@juniu86/rr-engine-api-types`. Typo em path = erro TypeScript no
 * editor + CI.
 *
 * Padrão de uso:
 *   const trpc = createTrpcClient(token);
 *   const project = await trpc.project.get.query({ id: 42 });
 *   const created = await trpc.project.create.mutate({ name: "Obra X", ... });
 *
 * Wrappers no `lib/api.ts` continuam expondo o contrato `Result<T>` —
 * componentes não precisam saber que o cliente trocou.
 */
import {
  createTRPCProxyClient,
  httpBatchLink,
  loggerLink,
} from "@trpc/client";
import type { AppRouter } from "@juniu86/rr-engine-api-types";
import superjson from "superjson";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.rres.com.br";

export type TrpcClient = ReturnType<typeof createTrpcClient>;

/**
 * Cria cliente tRPC com token Clerk. Como cada chamada precisa do token
 * fresco (Clerk rotaciona), instanciamos por chamada — barato, links são
 * leves. Se virar gargalo, dá pra cachear por token usando WeakMap.
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

**Notas:**
- `createTRPCProxyClient` é o cliente "vanilla" (não-React). Funciona em server components, RSC, route handlers, scripts.
- Para uso em React Server Components com cache de query do `@tanstack/react-query`, usar `createTRPCReact` separado (fora do escopo deste P3 — manter wrappers `Result<T>` por enquanto).

---

## Etapa 6.1 — `lib/trpc-result.ts` (NOVO, completo)

Cria o arquivo `rr-engine-app/lib/trpc-result.ts`:

```ts
/**
 * P3 — Wrapper que mantém o contrato `Result<T> = { ok; data } | { ok; error }`
 * usado pelo restante do código. Migra para o cliente tRPC tipado sem
 * cascatear refactor por todos os componentes.
 */
import { TRPCClientError } from "@trpc/client";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Executa uma chamada tRPC e mapeia para Result<T>. Captura erros do
 * cliente (TRPCClientError com `data.code` estruturado) e erros genéricos
 * de rede.
 *
 * Uso:
 *   const result = await safeCall(() => trpc.project.get.query({ id }));
 *   if (!result.ok) return console.error(result.error);
 *   const project = result.data;
 */
export async function safeCall<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof TRPCClientError) {
      // Erro estruturado do tRPC — mensagem e código vem do servidor.
      const code = err.data?.code ? `[${err.data.code}] ` : "";
      return { ok: false, error: `${code}${err.message}` };
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Erro desconhecido" };
  }
}
```

---

## Etapa 7 — Migração das 24 funções em `lib/api.ts`

Cada bloco abaixo mostra a função antes e depois. Aplique em ordem; NÃO remova `callTrpcQuery`/`callTrpcMutation` ainda — só ao final (Etapa 8).

### Imports a adicionar no topo do `lib/api.ts`

```ts
// Acima dos imports de tipos existentes:
import { createTrpcClient } from "./trpc-client";
import { safeCall } from "./trpc-result";
```

### 1. `fetchCurrentUser` — `auth.me`

**Antes:**
```ts
export async function fetchCurrentUser(token: string | null) {
  return callTrpcQuery<User | null>("auth.me", undefined, token);
}
```

**Depois:**
```ts
export async function fetchCurrentUser(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.auth.me.query());
}
```

### 2. `fetchProjects` — `project.list`

**Antes:**
```ts
export async function fetchProjects(token: string | null) {
  return callTrpcQuery<Project[]>("project.list", undefined, token);
}
```

**Depois:**
```ts
export async function fetchProjects(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.list.query());
}
```

### 3. `fetchProject` — `project.get`

**Backend input (auditado):** `z.object({ id: z.number() })`.

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

### 4. `createProject` — `project.create`

**Backend input (auditado):** `z.object({ name, description?, contractType?, location?, restrictions?, memorialDescritivo? })`.

**Antes:**
```ts
export async function createProject(
  input: CreateProjectInput,
  token: string | null,
) {
  return callTrpcMutation<Project>("project.create", input, token);
}
```

**Depois:**
```ts
export async function createProject(
  input: CreateProjectInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.create.mutate(input));
}
```

### 5. `updateProject` — `project.update`

**Antes:**
```ts
export async function updateProject(
  input: UpdateProjectInput,
  token: string | null,
) {
  return callTrpcMutation<Project>("project.update", input, token);
}
```

**Depois:**
```ts
export async function updateProject(
  input: UpdateProjectInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.update.mutate(input));
}
```

### 6. `deleteProject` — `project.delete`

**Backend input (auditado):** `z.object({ id: z.number() })`.

**Antes:**
```ts
export async function deleteProject(id: number, token: string | null) {
  return callTrpcMutation<{ success: boolean }>("project.delete", { id }, token);
}
```

**Depois:**
```ts
export async function deleteProject(id: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.delete.mutate({ id }));
}
```

### 7. `applyAuditCorrections` — `agent.applyAuditCorrections`

**Backend input (auditado):**
```ts
z.object({
  projectId: z.number(),
  budgetItemsToRemove: z.array(z.string()),
  logisticsToRemove: z.array(z.string()).optional(),
  // demais campos conforme spec do agent v3.2
})
```

> ⚠️ Antes da migração, abra o `lib/api.ts` antigo e copie a assinatura exata da `applyAuditCorrections` para o `mutate(input)` — o TypeScript vai validar contra o input zod do backend e qualquer divergência aparece como erro no editor.

**Antes:**
```ts
export async function applyAuditCorrections(
  input: ApplyAuditCorrectionsInput,
  token: string | null,
) {
  return callTrpcMutation<ApplyAuditCorrectionsOutput>(
    "agent.applyAuditCorrections",
    input,
    token,
  );
}
```

**Depois:**
```ts
export async function applyAuditCorrections(
  input: ApplyAuditCorrectionsInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.applyAuditCorrections.mutate(input));
}
```

### 8. `fetchAgentDefinitions` — `agent.list`

**Backend:** `publicProcedure.query` — sem input. Retorna `Array<{ type, order, name, description }>`.

**Antes:**
```ts
export async function fetchAgentDefinitions(token: string | null) {
  return callTrpcQuery<AgentDefinition[]>("agent.list", undefined, token);
}
```

**Depois:**
```ts
export async function fetchAgentDefinitions(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.list.query());
}
```

### 9. `fetchAgentExecutions` — `agent.getExecutions`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function fetchAgentExecutions(projectId: number, token: string | null) {
  return callTrpcQuery<AgentExecution[]>(
    "agent.getExecutions",
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function fetchAgentExecutions(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.getExecutions.query({ projectId }));
}
```

### 10. `executeAllAgents` — `agent.executeAll`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function executeAllAgents(projectId: number, token: string | null) {
  return callTrpcMutation<ExecuteAllAgentsResult>(
    "agent.executeAll",
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function executeAllAgents(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.executeAll.mutate({ projectId }));
}
```

### 11. `executeAgent` — `agent.execute`

**Backend input (auditado):** `z.object({ projectId, agentType })`.

**Antes:**
```ts
export async function executeAgent(
  input: ExecuteAgentInput,
  token: string | null,
) {
  return callTrpcMutation<AgentExecution>("agent.execute", input, token);
}
```

**Depois:**
```ts
export async function executeAgent(
  input: ExecuteAgentInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.execute.mutate(input));
}
```

### 12. `continueAgent` — `agent.continueAgent`

**Backend input (auditado):**
```ts
z.object({
  projectId: z.number(),
  agentType: z.enum([...AGENT_TYPES]),
  userResponses: z.record(z.union([z.string(), z.number()])),
})
```

**Antes:**
```ts
export async function continueAgent(
  input: ContinueAgentInput,
  token: string | null,
) {
  return callTrpcMutation<ContinueAgentResult>("agent.continueAgent", input, token);
}
```

**Depois:**
```ts
export async function continueAgent(
  input: ContinueAgentInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.agent.continueAgent.mutate(input));
}
```

### 13. `fetchCompanySettings` — `settings.get`

**Antes:**
```ts
export async function fetchCompanySettings(token: string | null) {
  return callTrpcQuery<CompanySettings>("settings.get", undefined, token);
}
```

**Depois:**
```ts
export async function fetchCompanySettings(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.settings.get.query());
}
```

### 14. `updateCompanySettings` — `settings.update`

**Antes:**
```ts
export async function updateCompanySettings(
  input: UpdateCompanySettingsInput,
  token: string | null,
) {
  return callTrpcMutation<CompanySettings>("settings.update", input, token);
}
```

**Depois:**
```ts
export async function updateCompanySettings(
  input: UpdateCompanySettingsInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.settings.update.mutate(input));
}
```

### 15. `fetchProjectRevisions` — `project.getRevisions`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function fetchProjectRevisions(projectId: number, token: string | null) {
  return callTrpcQuery<Project[]>("project.getRevisions", { projectId }, token);
}
```

**Depois:**
```ts
export async function fetchProjectRevisions(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.getRevisions.query({ projectId }));
}
```

### 16. `createProjectRevision` — `project.createRevision`

**Antes:**
```ts
export async function createProjectRevision(
  input: CreateProjectRevisionInput,
  token: string | null,
) {
  return callTrpcMutation<Project>("project.createRevision", input, token);
}
```

**Depois:**
```ts
export async function createProjectRevision(
  input: CreateProjectRevisionInput,
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.project.createRevision.mutate(input));
}
```

### 17. `fetchProjectDocuments` — `document.list`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

> ⚠️ **Atenção ao nome**: o sub-router é `document` (singular) em `routers.ts:2290`. Se o `lib/api.ts` antigo tem `documents.list` (plural), é typo silencioso que vira 404 no backend — esta migração CONSERTA isso na hora.

**Antes:**
```ts
export async function fetchProjectDocuments(projectId: number, token: string | null) {
  return callTrpcQuery<GeneratedDocument[]>(
    "document.list", // confirmar plural/singular no api.ts atual
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function fetchProjectDocuments(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.document.list.query({ projectId }));
}
```

### 18. `generateProposal` — `document.generateProposal`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function generateProposal(projectId: number, token: string | null) {
  return callTrpcMutation<GenerateDocumentResult>(
    "document.generateProposal",
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function generateProposal(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.document.generateProposal.mutate({ projectId }));
}
```

### 19. `generateMemoria` — `document.generateMemoria`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function generateMemoria(projectId: number, token: string | null) {
  return callTrpcMutation<GenerateDocumentResult>(
    "document.generateMemoria",
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function generateMemoria(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.document.generateMemoria.mutate({ projectId }));
}
```

### 20. `generateSchedule` — `document.generateSchedule`

**Backend input (auditado):** `z.object({ projectId: z.number() })`.

**Antes:**
```ts
export async function generateSchedule(projectId: number, token: string | null) {
  return callTrpcMutation<GenerateDocumentResult>(
    "document.generateSchedule",
    { projectId },
    token,
  );
}
```

**Depois:**
```ts
export async function generateSchedule(projectId: number, token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.document.generateSchedule.mutate({ projectId }));
}
```

### 21. `fetchPlans` — `stripe.listPlans`

**Backend:** `publicProcedure.query` — sem input. Retorna `Array<{ tier, name, priceMonthly, currency, quota, cap, priceId, ... }>`.

**Antes:**
```ts
export async function fetchPlans() {
  return callTrpcQuery<Plan[]>("stripe.listPlans", undefined, null);
}
```

**Depois:**
```ts
export async function fetchPlans() {
  const trpc = createTrpcClient(null); // public procedure — token opcional
  return safeCall(() => trpc.stripe.listPlans.query());
}
```

### 22. `fetchCurrentSubscription` — `stripe.getCurrentSubscription`

**Antes:**
```ts
export async function fetchCurrentSubscription(token: string | null) {
  return callTrpcQuery<Subscription | null>(
    "stripe.getCurrentSubscription",
    undefined,
    token,
  );
}
```

**Depois:**
```ts
export async function fetchCurrentSubscription(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.stripe.getCurrentSubscription.query());
}
```

### 23. `createCheckout` — `stripe.createCheckout`

**Backend input (auditado):** `z.object({ tier: z.enum(["starter", "pro", "business"]) })`.

**Antes:**
```ts
export async function createCheckout(
  tier: "starter" | "pro" | "business",
  token: string | null,
) {
  return callTrpcMutation<{ sessionId: string; url: string }>(
    "stripe.createCheckout",
    { tier },
    token,
  );
}
```

**Depois:**
```ts
export async function createCheckout(
  tier: "starter" | "pro" | "business",
  token: string | null,
) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.stripe.createCheckout.mutate({ tier }));
}
```

### 24. `cancelSubscription` — `stripe.cancelSubscription`

**Antes:**
```ts
export async function cancelSubscription(token: string | null) {
  return callTrpcMutation<{ success: boolean; cancelAt: Date }>(
    "stripe.cancelSubscription",
    undefined,
    token,
  );
}
```

**Depois:**
```ts
export async function cancelSubscription(token: string | null) {
  const trpc = createTrpcClient(token);
  return safeCall(() => trpc.stripe.cancelSubscription.mutate());
}
```

---

## Etapa 8 — remover helpers legados

Após as 24 funções migrarem e `pnpm tsc --noEmit` passar, em `rr-engine-app/lib/api.ts`:

1. Remover `callTrpcQuery` e `callTrpcMutation` (linhas 27–100 originais).
2. Remover qualquer `import` que se torne unused (TypeScript pode flagar).
3. Manter o `Result<T>` se outros arquivos exportam dele — ou migrar consumidores para `import { Result } from "./trpc-result"`.

Comando para verificar imports não usados:

```bash
cd rr-engine-app
pnpm tsc --noEmit --pretty
```

Se quiser preservar fallback durante 1 sprint, em vez de deletar, renomeie: `mv lib/api.ts lib/api-deprecated.ts.bak`. Depois exclua na PR seguinte.

---

## Etapa 9 — CI gate (`.github/workflows/ci.yml` no `rr-engine-app`)

Crie `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://npm.pkg.github.com"
          scope: "@juniu86"
          cache: "pnpm"

      - name: Configure .npmrc for GitHub Packages
        run: |
          echo "@juniu86:registry=https://npm.pkg.github.com" > ~/.npmrc
          echo "//npm.pkg.github.com/:_authToken=${{ secrets.NPM_TOKEN }}" >> ~/.npmrc

      - run: pnpm install --frozen-lockfile

      - run: pnpm tsc --noEmit
```

> Se o `package.json` do `rr-engine-app` ainda não expõe `pnpm tsc`, crie um script: `"check": "tsc --noEmit"` e use `pnpm check` no último step.

**Reginaldo precisa adicionar `NPM_TOKEN` (mesmo PAT) nos secrets do repo `rr-engine-app`** se ainda não fez na pré-condição.

---

## Etapa 10 — atualizar `CLAUDE.md` do `rr-engine-app`

Adiciona a seção abaixo no `rr-engine-app/CLAUDE.md` (preferencialmente próximo a "Como contribuir" ou em uma seção nova "tRPC + tipos compartilhados"):

````md
## Como adicionar nova chamada tRPC

O cliente tRPC é tipado contra o `AppRouter` do backend, importado do
pacote `@juniu86/rr-engine-api-types` (publicado em GitHub Packages a
cada push em `main` do `rr-engine` que toca tipos).

Fluxo end-to-end:

1. **Backend** (`juniu86/rr-engine`): implemente a procedure em
   `server/routers.ts` ou em um sub-router dedicado.
2. **Mergeie** no `main` do backend. O workflow
   `publish-api-types.yml` publica automaticamente
   `@juniu86/rr-engine-api-types@0.1.<N>` (versionamento por contagem
   de commits que tocaram tipos — monotônico).
3. **Frontend** (`rr-engine-app`): atualize a versão do pacote:
   ```bash
   pnpm update @juniu86/rr-engine-api-types
   ```
4. **Use** no código:
   ```ts
   import { createTrpcClient } from "@/lib/trpc-client";
   import { safeCall } from "@/lib/trpc-result";

   const trpc = createTrpcClient(token);
   const result = await safeCall(() =>
     trpc.<router>.<procedure>.query(/* input tipado */)
     // ou .mutate(/* input tipado */)
   );
   ```

TypeScript valida o path em tempo de compilação. Typo em `<router>` ou
`<procedure>` vira erro no editor + bloqueia CI.

**NÃO use** strings literais com paths (padrão antigo `callTrpcQuery("path.to.proc", ...)`)
— removido em P3. Helpers `callTrpcQuery` e `callTrpcMutation` não existem mais.

### Pré-requisito de auth (build local + CI + Vercel)

O pacote é privado em GitHub Packages. Antes de `pnpm install`, é
necessário ter o token configurado:

- **Local**: `~/.npmrc` com `@juniu86:registry=https://npm.pkg.github.com`
  e `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}` (PAT com escopo
  `read:packages`).
- **Vercel**: Environment Variable `NPM_TOKEN` (Production + Preview
  + Development).
- **GitHub Actions**: secret `NPM_TOKEN` no repo.

Se o build falhar com `403 Forbidden` no `pnpm install`, o token está
faltando ou expirado.
````

---

## Validação final

Antes de abrir PR no `rr-engine-app`:

```bash
cd rr-engine-app

# 1. Install limpo, frozen-lockfile (simula CI)
rm -rf node_modules
pnpm install --frozen-lockfile

# 2. TypeScript estrito
pnpm tsc --noEmit
# Esperado: 0 erros. Se aparecer erro de path tRPC, é typo na migração —
# corrija conforme o erro do compiler.

# 3. Build de produção
pnpm build

# 4. Smoke local
pnpm dev
# Abra http://localhost:3000, navega entre páginas, faz uma chamada que
# usa cada router (project.list, agent.list, settings.get, stripe.listPlans).
# Network tab: requests vão pra https://api.rres.com.br/api/trpc/...
```

---

## Checklist de PR no `rr-engine-app`

```md
## P3 — Cliente tRPC tipado (frontend)

### Mudanças
- [x] Instalado `@juniu86/rr-engine-api-types@0.1.<N>` + tRPC client deps
- [x] `lib/trpc-client.ts` (novo): proxy client tipado contra `AppRouter`
- [x] `lib/trpc-result.ts` (novo): wrapper `safeCall` mantém contrato `Result<T>`
- [x] `lib/api.ts`: 24 funções migradas pro proxy tipado
- [x] `callTrpcQuery` e `callTrpcMutation` removidos
- [x] `.github/workflows/ci.yml`: typecheck gate
- [x] `CLAUDE.md`: seção "Como adicionar nova chamada tRPC"

### Sanity
- [x] `pnpm tsc --noEmit` passa
- [x] `pnpm build` passa
- [x] Smoke local: `pnpm dev` + navegação básica sem 404
- [x] Vercel preview build passa

### Observações
- Pacote é privado em GitHub Packages. `NPM_TOKEN` configurado em local,
  Vercel Env Vars, e Actions secrets antes desta PR.
- Nome do sub-router de documentos é `document` (singular) — corrigido
  durante a migração se o `api.ts` antigo tinha plural.

### Próximos
- Migrar mais consumidores do `Result<T>` para usar tipos derivados de
  `RouterOutputs`/`RouterInputs` do tRPC (eliminar tipos manuais como
  `CreateProjectInput`, `Project`, etc.) — fora do escopo desta PR.
- Adotar `@trpc/react-query` em hooks (`useQuery`/`useMutation`) com cache
  do TanStack Query — substitui chamadas imperativas do `lib/api.ts`.
```

---

## Riscos conhecidos e mitigações

1. **`pnpm install` 403 no Vercel** — `NPM_TOKEN` não está configurado nas Environment Variables. Fix: Reginaldo adiciona em Settings → Environment Variables.

2. **Typecheck reclama de `Property 'X' does not exist on type 'Y'`** — provavelmente o path no `lib/api.ts` antigo está errado (e quebrava silenciosamente em runtime). Corrija pra path real verificado em `server/routers.ts`. Esse é o valor do P3: bug que era 404 vira erro de compilação.

3. **`TRPCClientError` em runtime mas não tipado** — alguns componentes podem fazer `try/catch` e ler `.message` direto. `safeCall` normaliza tudo pra `Result<T>` — nenhum componente precisa mudar se já consumia `Result<T>`.

4. **Pacote `@juniu86/rr-engine-api-types` não atualiza** — workflow `publish-api-types.yml` publica em paths específicos. Se a procedure mudou só na implementação (mesma assinatura), o pacote pode não bumpar. Solução: forçar bump tocando algum arquivo em `packages/api-types/` ou rodando `npm version patch` localmente e pushando manualmente.

5. **Versão do pacote desatualizada após múltiplos PRs** — `pnpm update @juniu86/rr-engine-api-types` no frontend pega a `latest`. Para ambiente determinístico, fixar versão exata (`0.1.42` em vez de `^0.1.42`) e atualizar manualmente quando o backend mudar.

---

**Resumo do estado pós-aplicação:**

- Backend (`rr-engine`, PR #27 mergeada): pacote `@juniu86/rr-engine-api-types` publicando automaticamente.
- Frontend (`rr-engine-app`, com aplicação dos diffs acima): cliente tipado, 24 chamadas migradas, CI gate, docs atualizados.
- Próxima evolução possível: adotar `@trpc/react-query` em hooks React, substituindo o padrão imperativo `safeCall(() => ...)`.

Founder em standby pra dúvidas durante a aplicação no `rr-engine-app`.
