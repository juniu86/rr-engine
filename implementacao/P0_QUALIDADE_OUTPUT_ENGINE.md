# P0 — Qualidade do output do Engine (bloqueando Stripe Live)

**Para:** Claude Code
**Branch:** `fix/p0-qualidade-output-engine`
**Prioridade:** P0 crítico — sem isso, não é possível cobrar de cliente real. Cobrança em produto que entrega R$ 2,2M com tributos R$ 0 vira pedido de reembolso na hora.
**Origem:** smoke test "Posto Paulo Sérgio" (project ID a confirmar), 07/05/2026. Memorial de EPC turn-key, área 470,28 m² em 3 pavimentos, 6 bombas, 3 tanques, 4 lojas. Pipeline rodou completo.

## Diagnóstico — 5 bugs encontrados

### Bug 1 — Tributos R$ 0,00 na planilha (P0 crítico)

**Sintoma:**

- Aba "Resumo" do XLSX: linha "Impostos (referência fiscal): R$ 0,00"
- Aba "Orçamento Detalhado": coluna "Impostos" zerada nos 80 itens

**Esperado:**

Para um posto de combustíveis no Simples Nacional, deveriam aparecer ~R$ 300k em tributos (PIS/COFINS/ISS/IRPJ/CSLL conforme regime). Tributário **rodou** no pipeline (status "Concluído"), mas o output não chegou ao gerador XLSX.

**Investigação:**

- Procedure / serviço que gera XLSX em `server/services/documents.ts` (provavelmente)
- Ver se está consumindo `agent_executions[tributario].output.totalTaxes` e `classifiedItems`
- Pode ser que tributos estão **embutidos no BDI 33,40%** sem coluna separada — decisão errada de design

**Fix:**

- XLSX deve mostrar tributos separados na aba Resumo (linha "Tributos: R$ X" sem zero)
- Coluna "Impostos" na aba Orçamento Detalhado deve receber valor proporcional do output do Tributário
- BDI declarado deve excluir tributos (a decomposição que vai pro cliente fica clara: "BDI 22% + Tributos 14% = preço final")

### Bug 2 — Total do dashboard ≠ total da planilha (P0 crítico)

**Sintoma — caso 1 (projeto 11, Posto Paulo Sérgio):**

| Onde | Total |
|---|---|
| Dashboard | R$ 2.126.670,73 |
| Planilha (Resumo, Orçamento Detalhado, FC) | R$ 2.269.574,55 |
| **Diferença** | **R$ 142.903,82** |

R$ 2.126.670,73 não aparece em nenhuma aba do XLSX.

**Sintoma — caso 2 (projeto 12, Fórmula 1) — agravamento:**

| Onde | Custo direto | Total / Preço venda |
|---|---|---|
| Dashboard | R$ 13.575,40 | R$ 169.719,25 |
| Planilha | R$ 181.473,82 | R$ 181.708,02 |
| Razão | **13x diferença** | R$ 11.988 a menos |

E pior — **BDI da planilha é R$ 234,20 sobre custo direto de R$ 181.473,82 = 0,13%.** Pela NBR 12721, esse projeto deveria ter BDI próximo de 33% (~R$ 60.000). Empresa vendendo sem margem.

Esse é problema separado mas relacionado: agente Comercial ou pipeline de cálculo do BDI está retornando valor próximo de zero em alguns casos. Investigar `server/services/comercialCalculator.ts` ou onde quer que o BDI seja aplicado. Provavelmente confusão entre BDI percentual (decimal 0,33) e BDI absoluto, ou um campo sendo lido como `0` quando deveria ser `33`.

**Hipótese forte:**

- O backend salva `projects.totalPrice` em algum momento ANTES da logística com BDI ser somada ao preço final
- Pode estar em `confirmProposal` (PR `fix/totalPrice-em-confirmProposal`) ou em `applyAuditCorrections` (PR #29)
- Ou o agente Comercial calcula corretamente, mas a persistência salva valor parcial

**Fix:**

- Validar em `server/routers.ts` (`confirmProposal` e `applyAuditCorrections`) que `totalPrice` salvo bate com o `finalPrice` que vai pro XLSX
- Garantir que o XLSX e o dashboard puxam do MESMO campo no banco
- Adicionar test que dispara o pipeline + valida `projects.totalPrice` === XLSX `Resumo.PreçoFinal`

### Bug 3 — "Custo direto" no dashboard inclui logística (P1, UX)

**Sintoma:**

| Item | Valor |
|---|---|
| Custo direto puro | R$ 1.596.430,34 |
| Logística sem BDI | R$ 104.900,00 |
| Soma | R$ 1.701.330,34 |
| Dashboard exibe como "Custo direto" | R$ 1.701.336,58 (delta ~R$ 6 = arredondamento) |

**Causa:**

- Dashboard `app/dashboard/[projectId]/page.tsx` linha ~110 tem `<Stat label="Custo direto" value={project.totalCostDirect} />`
- Backend salva `totalCostDirect` somando custo direto + logística (assumindo "indireto" ≠ "logístico")
- Confunde visualmente — cliente vê "Custo direto R$ 1,7M" e estranha vs planilha

**Fix:**

- Separar no dashboard em **2 stats distintos**: "Custo direto" (sem logística) + "Logística"
- OU renomear pra "Custo de execução" (mais claro)
- Banco: pode manter campo `totalCostDirect` (rotulagem), mas adicionar `totalCostLogistics` separado

### Bug 4 — Fluxo de caixa em 4 semanas pra obra de N meses (P1, planejamento)

**Sintoma:**

- Obra com prazo declarado de 8 meses
- XLSX aba "Fluxo de Caixa": apenas 4 semanas
- Despesas iguais nas 4 semanas (R$ 436.456,65 cada)
- Saldo negativo artificial na semana 3 (-R$ 401.540,13)

**Causa:**

- Agente Financeiro tem default fixo de 4 semanas, ignorando duração real
- Em `server/services/deterministicCashFlow.ts` ou `server/agents/index.ts FinanceiroAgent` provavelmente

**Fix:**

- FC escala com duração do projeto (Gestão de Projetos retorna `totalDuration`/`totalWeeks`)
- 8 meses = ~32 semanas. Cada item do orçamento distribui custo conforme cronograma físico
- Saldo negativo só aparece se for matematicamente real, não artefato

**Validar contra cronograma:** o agente Gestão de Projetos retorna fases/marcos. FC deve consumir esse cronograma e distribuir custos de forma compatível.

### Bug 5 — Coluna "Custo Logística" zerada no Orçamento Detalhado (P3, baixo)

**Sintoma:**

- Aba "Orçamento Detalhado" tem coluna "Custo Logística"
- Todos os 80 itens têm valor 0
- Logística aparece só na aba separada (R$ 104.900 consolidado)

**Decisão de design:**

- Opção A: **remove a coluna** do Orçamento Detalhado (logística é macro, não item-a-item)
- Opção B: **distribui logística proporcionalmente** por item (rateio por custo)

Recomendação: **Opção A** (remove). Logística raramente é alocável por item de obra. Aba separada é o padrão da indústria.

## Definition of done

- [ ] Bug 1: tributos calculados pelo Tributário aparecem corretamente na aba Resumo e na coluna Impostos do Orçamento Detalhado. BDI mostrado decomposto (margem + admin + risco) sem incluir tributos.
- [ ] Bug 2: `projects.totalPrice` no banco === `finalPrice` no XLSX. Test cobre o fluxo confirmProposal + applyAuditCorrections.
- [ ] Bug 3: dashboard mostra "Custo direto" e "Logística" separados. OU rótulo claro "Custo de execução" se mantiver soma.
- [ ] Bug 4: FC tem `totalWeeks` igual ao cronograma do Gestão de Projetos. Saldo negativo só se for real.
- [ ] Bug 5: coluna "Custo Logística" removida do Orçamento Detalhado.
- [ ] Smoke test: rodar o memorial Posto Paulo Sérgio novamente, validar todas as abas e o dashboard.

## Validação manual

Reginaldo precisa:

1. Rodar pipeline novo com o memorial Posto Paulo Sérgio
2. Conferir aba "Resumo" do XLSX:
   - Tributos > 0 e proporcional ao regime tributário da empresa
   - Total de venda bate com o dashboard
3. Conferir aba "Fluxo de Caixa" tem N semanas conforme prazo da obra (8 meses ≈ 32 semanas)
4. Confirmar dashboard mostra "Custo direto" só com itens executivos, "Logística" separada

## Observação importante (escopo separado)

Orçamento total do Posto Paulo Sérgio veio em R$ 2,2M, abaixo do esperado (estimativa R$ 2,5-4,5M). Pode indicar problema de calibração de preços ou volumes. **Esse é tema de outro ticket** — qualidade quantitativa de orçamento. Esse PR foca em **qualidade de output**, não em valor absoluto.
