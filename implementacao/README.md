# Plano de implementação RR Engine — índice de tickets

Esta pasta contém 18 tickets com instruções para o Claude Code implementar os débitos técnicos catalogados em `analise-estrategica/01_diagnostico_mecanica_v1.md`. Cada ticket é um arquivo Markdown com objetivo, arquivos a tocar, tarefas e critérios de aceite.

**Regra de execução:** um ticket = uma branch = um PR.

**Pré-requisitos antes do primeiro ticket:**
1. Ler `CLAUDE.md` no root do repositório.
2. Validar que `pnpm install`, `pnpm test`, `pnpm check` rodam localmente.
3. Provisionar `ANTHROPIC_API_KEY` em `.env` se for testar agentes Claude fora do Forge.

## Ordem recomendada

A ordem abaixo respeita dependências técnicas e maximiza valor entregue cedo.

### Fase 1 — desbloqueio (P0)

| Ordem | Ticket | Branch | Esforço | Depende de |
|---|---|---|---|---|
| 1 | [P0.5](P0.5_ci_github_actions.md) — CI no GitHub Actions | `chore/p0-5-ci-github-actions` | 0,5 dia | — |
| 2 | [P0.2](P0.2_temperature_explicita.md) — temperature explícita por agente | `feat/p0-2-temperature-explicita` | 0,5 dia | P0.5 |
| 3 | [P0.3](P0.3_telemetria_tokens.md) — persistir tokens consumidos | `feat/p0-3-telemetria-tokens` | 1-2 dias | P0.5 |
| 4 | [P0.1](P0.1_engine_validacao_cruzada.md) — plugar engine determinístico | `feat/p0-1-engine-validacao-cruzada` | 5-8 dias | P0.3 |
| 5 | [P0.4](P0.4_hard_limits_slice.md) — remover hard limits silenciosos | `fix/p0-4-hard-limits-slice` | 2-3 dias | — |

**Saída da fase 1:** CI verde, reprodutibilidade, custo por orçamento mensurável, validador cruzado e auditoria cobrindo a obra inteira.

### Fase 2 — eficiência (P1)

| Ordem | Ticket | Branch | Esforço | Depende de |
|---|---|---|---|---|
| 6 | [P1.5](P1.5_fallback_tax_settings.md) — bloquear fallback silencioso de impostos | `fix/p1-5-fallback-tax-settings` | 1 dia | — |
| 7 | [P1.3](P1.3_dedup_chunks.md) — dedup pós-merge entre chunks | `fix/p1-3-dedup-chunks` | 2-3 dias | P0.4 |
| 8 | [P1.1](P1.1_reduzir_opus.md) — migrar Tributário/Jurídico para Sonnet/Haiku | `feat/p1-1-reduzir-opus` | 2-3 dias | P0.3 |
| 9 | [P1.2](P1.2_comercial_financeiro_deterministicos.md) — Comercial e Financeiro determinísticos | `feat/p1-2-comercial-financeiro-deterministicos` | 3-4 dias | P0.3 |
| 10 | [P1.4](P1.4_sinapi_pini_atualizadas.md) — SINAPI/PINI atualizadas + scraping PINI | `feat/p1-4-sinapi-pini-atualizadas` | 5-8 dias | — |
| 11 | [P1.6](P1.6_templating_juridico.md) — templating estruturado para Jurídico | `feat/p1-6-templating-juridico` | 3-4 dias | P1.1 |

**Saída da fase 2:** custo por orçamento reduzido em 50-65%; bases de preço com refresh automatizado; proposta jurídica com layout consistente.

### Fase 3 — polimento (P2)

| Ordem | Ticket | Branch | Esforço | Depende de |
|---|---|---|---|---|
| 12 | [P2.3](P2.3_minify_json.md) — minificar JSON em user prompts | `chore/p2-3-minify-json` | 0,5 dia | — |
| 13 | [P2.7](P2.7_limpeza_arquivos_analise.md) — arquivar análises antigas | `chore/p2-7-limpeza-arquivos-analise` | 1 dia | — |
| 14 | [P2.6](P2.6_dedup_deterministico.md) — dedup determinístico no Auditor | `feat/p2-6-dedup-deterministico` | 2-3 dias | P0.4, P1.3 |
| 15 | [P2.2](P2.2_langfuse.md) — observabilidade externa (Langfuse) | `feat/p2-2-langfuse` | 2-3 dias | P0.3 |
| 16 | [P2.5](P2.5_schema_bases_versionadas.md) — schema versionado de bases | `feat/p2-5-schema-bases-versionadas` | 3-4 dias | P1.4 |
| 17 | [P2.1](P2.1_documentacao_atual.md) — atualizar documentação técnica | `chore/p2-1-documentacao-atual` | 1-2 dias | concluir P0+P1 |
| 18 | [P2.4](P2.4_streaming.md) — streaming de resposta no pipeline | `feat/p2-4-streaming` | 5-8 dias | concluir P0 |

**Saída da fase 3:** observabilidade pronta, bases de preço em banco versionado, documentação refletindo o sistema real, UX com feedback granular.

## Estimativa agregada

- **P0:** 9-13,5 dias-homem
- **P1:** 16-23 dias-homem
- **P2:** 14,5-21,5 dias-homem
- **Total:** 39,5-58 dias-homem

Com um desenvolvedor sênior dedicado em tempo integral, P0 fecha em 2-3 semanas; P0+P1 em 8-10 semanas.

## Como o Claude Code deve operar nesta pasta

1. Antes de começar um ticket, ler o ticket inteiro e o `CLAUDE.md` (caso ainda não tenha).
2. Criar branch com o nome especificado no ticket.
3. Seguir a checklist de tarefas do ticket. Não pular itens.
4. Adicionar/atualizar testes conforme a seção "Testes" do ticket.
5. Garantir que `pnpm check`, `pnpm test`, `pnpm format` passam.
6. Mensagem de commit: `<tipo>(<ID>): <descrição>` — exemplo: `feat(P0.1): plugar deterministicEngine como validacao cruzada`.
7. Ao abrir PR, copiar a seção "Critérios de aceite" do ticket no corpo do PR.
8. Marcar o ticket como concluído incluindo `**Status:** ✅ Mergeado em <data>` no topo do arquivo do ticket.

## Quando pedir input humano

Os tickets foram escritos para serem executáveis sem perguntas adicionais na maioria dos casos. Pause e pergunte ao founder Reginaldo se:
- A implementação exige decisão de produto (ex.: política de pricing, branding, copy comercial).
- Algum arquivo referenciado mudou drasticamente desde o diagnóstico (versão atual: `package.json` 3.1.0).
- Aparece dependência circular entre tickets que o índice não previu.
- Aparecer ambiguidade sobre o que conta como "concluído" para algum critério.

## Arquivos de referência

- `../CLAUDE.md` — guia geral do repositório
- `../analise-estrategica/01_diagnostico_mecanica_v1.md` — diagnóstico completo que originou os tickets
- `../shared/agents.ts` — tipos dos agentes
- `../server/agents/index.ts` — implementação dos agentes
- `../server/routers.ts` — orquestração
