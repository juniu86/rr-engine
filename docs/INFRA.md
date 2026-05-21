# Runbook de Infraestrutura — RR Engine

Mapa vivo de onde tudo roda. **Consultar ANTES de pedir info ao founder** —
se a resposta está aqui, não perguntar. Atualizar ao fim de qualquer mudança
de infra.

Quando algo cair: rodar `node scripts/healthcheck.mjs` e seguir o
**PROTOCOLO DE INCIDENTE EM PRODUÇÃO** do `CLAUDE.md`.

## Mapa repo → hospedagem → domínio

| Repo (GitHub `juniu86/`) | O que é | Hospedagem | Domínio |
| --- | --- | --- | --- |
| `rr-engine` | Backend Express + tRPC + 10 agentes | Railway | `api.rres.com.br` |
| `rr-engine-app` | Frontend Next.js (Clerk auth) | Vercel | `engine.rres.com.br` |
| `rr-engine-landing` | Landing Astro | Vercel | `rres.com.br` |
| `RR-Engenharia` | Monolito: `client/` (institucional) + `client-proposta/` (gerador de propostas, Vite SPA) | proposta → **Vercel** (projeto `rr-engenharia`); institucional ainda GoDaddy | `proposta.rres.com.br` (Vercel, CNAME desde o cutover de 21/05) |

## Deploy (como o código vai pra produção)

- **Backend `rr-engine` → Railway, branch `main`.** Railway → Settings → Source:
  "Branch connected to production: `main`"; "Auto deploys when pushed to GitHub"
  ON; "Wait for CI" OFF. **Deploy dispara no merge de PR na `main`** → Railway
  builda (~2-4 min) → novo `Starting Container` no log. Push direto numa branch
  que NÃO é a `main` não dispara nada. `debug/auth-log` é branch de integração:
  só vai pra produção quando mergeada na `main`.
- **Frontend `rr-engine-app` → Vercel** (`engine.rres.com.br`), auto-deploy no push.
- **proposta (`RR-Engenharia`) → Vercel** (`proposta.rres.com.br`): build command
  `pnpm run build:proposta`, output `public_html/proposta`; envs
  `VITE_PROPOSAL_API_URL=https://api.rres.com.br` e `VITE_CLERK_PUBLISHABLE_KEY`
  (= `pk_test_` da instância dev). DNS: CNAME `proposta` → valor que a Vercel mostrar.
- **CORS** do backend: env `CORS_ORIGINS` (CSV) no Railway. Se setada, **substitui**
  a lista padrão do código — precisa incluir TODOS os origins (engine, www,
  proposta, www, e o `*.vercel.app` em teste). O default no código está defasado.
- "Redeploy" simples do Railway repete o commit antigo; pra subir commit novo é
  o merge de PR na `main`.

## Banco de dados (MySQL)

- **MySQL 8/9 plugin do Railway**, projeto `gracious-amazement`, service `MySQL`.
- Volume: `mysql-volume` (`vol_0uil5duf5qddqfvc`). Service ID `d605e301-aea0-4fac-9acb-7b59a321a198`.
- **Duas URLs** (Railway → MySQL → Variables):
  - `MYSQL_URL` / `DATABASE_URL` → `mysql.railway.internal` — rede privada, **só resolve dentro do Railway** (o backend usa esta).
  - `MYSQL_PUBLIC_URL` → `*.proxy.rlwy.net` — pública, resolve de fora (Mac/scripts). **Tem egress fee** (irrelevante para scripts pontuais).
- **Migrations aplicadas manualmente** (não via `drizzle-kit migrate`). O journal está em 0021; 0022/0023/0024 foram aplicadas por SQL direto. NÃO usar `pnpm db:push` (gera SQL fantasma). Aplicar via script `mysql2` direto (ver `scripts/apply-migration-*.mjs`).
- **Backups:** agendamento nativo do Railway é Pro-only. No Hobby, plano é job próprio de `mysqldump` → Cloudflare R2 (pendente — ver tasks).

## Auth (Clerk)

- App Clerk no workspace `juniu86's` (Hobby). **Só instância Development** existe (não há Production).
- Instância: `uncommon-duck-34.clerk.accounts.dev`. JWKS: `https://uncommon-duck-34.clerk.accounts.dev/.well-known/jwks.json`.
- Chaves `pk_test_*` / `sk_test_*` (development) usadas TANTO no backend quanto no frontend — **mesma instância nas duas pontas**.
  - Backend (Railway `rr-engine`): `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
  - Frontend (Vercel `rr-engine-app`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- O Vercel **mascara** Sensitive vars no Edit e às vezes mostra um placeholder (`pk_live_...`) que NÃO é o valor real — não confiar na leitura visual; conferir o valor real ou o token gerado.
- Migração dev → production está pendente (roadmap). Por ora tudo opera em development.
- Fluxo de auth do backend (`server/_core/clerk-auth.ts` + `context.ts`): `verifyToken` (assinatura via JWKS) → `getUserByOpenId` (MySQL) → cria via Clerk Admin API se não existe. **`context.ts` engole erro no catch** → todo erro de DB/Clerk vira `UNAUTHORIZED Please login (10001)`. Token válido + 401 = suspeitar do banco, não do Clerk.

## Outros serviços

- **Storage:** Cloudflare R2 (S3-compatible) via `@aws-sdk/client-s3`. Vars `AWS_*` / `S3_*` no Railway.
- **LLM:** Anthropic direto (streaming + prompt caching). Forge da Manus é fallback histórico, não usado.
- **Stripe:** Live, 3 tiers. Webhook em `/api/stripe/webhook`.
- **Sentry:** backend (`@sentry/node` via `--import`) + frontend. Filtra 4xx.
- **Endpoints `/proposta/*`:** REST no `rr-engine` (não tRPC), auth Clerk, MySQL Railway. App `proposta.rres.com.br` consome (migração GoDaddy → Vercel pausada).

## Páginas de status (checar primeiro em incidente)

- Railway: https://status.railway.com — API JSON: `https://railway.instatus.com/summary.json` (`page.status` == `UP`)
- Vercel: https://www.vercel-status.com — API: `/api/v2/status.json` (`status.indicator` == `none`)
- Clerk: https://status.clerk.com — API: `/api/v2/status.json`

## Log de incidentes

- **20/05/2026 — MySQL travado.** Pane da plataforma Railway (build-queue backlog, incident KVZ1Z8GY) deixou o MySQL preso no startup após restart sujo (04:31 UTC): container "Online" mas `mysqld` não subia (CPU/RAM 0, log parava em "Mounting volume"). Sintoma no app: `UNAUTHORIZED` no engine (backend não conectava no banco). Restart NÃO resolveu; **Redeploy** resolveu, com dados intactos no volume. Sem backup na época. Diagnóstico demorou horas por ter começado pelo código em vez do status da plataforma — origem do PROTOCOLO DE INCIDENTE e do `healthcheck.mjs`.
- **21/05/2026 — pipeline travado em "aguardando dados", sem popup.** `getAgentExecutionsByProjectId` fazia `SELECT * ... ORDER BY agentOrder`. Com o `output` do Engenheiro grande (~366 KB), o filesort estourava o `sort_buffer` → `ER_OUT_OF_SORTMEMORY` → `agent.getExecutions` quebrava → a UI não carregava as execuções e o popup de `missingInfoRequests` sumia (mesmo erro do "Failed query ... order by agentOrder" do project 29). Fix: ordenar em memória (`server/utils/sortAgentExecutions.ts`), sem ORDER BY no SQL, + teste. Diagnóstico custou horas por (a) infra de deploy não documentada — 4 tentativas erradas até descobrir que o Railway deploya a `main` via merge de PR — e (b) tratar como conexão/pool sem reproduzir. Daí vieram: a seção **Deploy** acima, o `.githooks/pre-push` (typecheck+testes) e a regra de não afirmar suposição sem reproduzir.
