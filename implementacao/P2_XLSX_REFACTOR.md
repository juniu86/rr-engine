# P2 — Refator do gerador de XLSX (memória de cálculo)

**Para:** Claude Code
**Branch:** `feat/p2-xlsx-refactor` (a partir de `main`)
**Escopo:** APENAS backend (`juniu86/rr-engine`)
**Origem:** análise comparativa entre planilhas geradas por RR Engine e Manus, em obra real (Hangar Avjet — SBJR), feita em 06/05/2026 por Procurement Sênior + Engenheiro de Hangares.

## Contexto

O RR Engine **superou o Manus em granularidade técnica e cabeçalho de fontes** (90 vs 60 itens, 56% com SINAPI/PINI vs 23%, zero itens órfãos vs 35%), mas **regrediu em três dimensões críticas de procurement**: integridade aritmética item-a-item, populamento da aba de Logística e distribuição do Fluxo de Caixa.

Em uma reunião de tomada de preço, um analista sênior **rejeitaria a planilha do Engine** antes de chegar ao mérito técnico, porque 77,8% dos itens não fecham na conta `Qtd × (Material + M.O. + Logística) = Custo Total`.

**Diagnóstico:** o problema está na camada de composição da planilha (`server/services/documents.ts`), não nos agentes de IA. Os agentes geram dados corretos com códigos SINAPI/PINI específicos. O serializador da tabela é que está misturando colunas de unidade com totais, ignorando aba de Logística e gerando Fluxo de Caixa de 4 linhas em vez de cronograma físico-financeiro real.

A inteligência dos agentes está acertando. O templater está falhando.

## Métricas atuais (Engine vs Manus, mesma obra)

| Métrica | Manus | Engine | Vencedor |
|---|---|---|---|
| Granularidade de itens | 60 | 90 | **Engine** |
| Rastreabilidade SINAPI/PINI | 23% | 56% | **Engine** |
| **Aritmética item-a-item correta** | 96,7% | 22,2% | **Manus** |
| **Decomposição Mat / M.O. / Log por item** | 96,7% | 36,7% | **Manus** |
| **Aba Custos Logísticos populada** | Sim (5 itens) | Vazia | **Manus** |
| **Fluxo de Caixa semanal** | 44 semanas | 4 linhas | **Manus** |
| BDI aplicado | 48,3% (errado) | 25% (correto) | **Engine** |
| Itens "Mercado N/A" / sem código | 35% | 0% | **Engine** |
| Fórmulas Excel nativas | 0 | 0 | **Empate (defeito)** |

## Defeitos priorizados

### P0 — Bloqueadores (impedem aprovação por procurement)

#### P0.1 — Aritmética item-a-item quebrada

77,8% dos itens não satisfazem `Qtd × (Mat + MO + Log) = Custo Total`.

**Exemplo (Item 1 — Demolição):**
- Quantidade: 600 m²
- Custo Material declarado: R$ 18,50
- Custo M.O. declarado: R$ 47,50
- Custo Logística declarado: R$ 0,00
- **Conta esperada:** 600 × (18,50 + 47,50 + 0) = **R$ 39.600,00**
- **Custo Total exibido:** **R$ 64.800,00**
- **Diferença:** R$ 25.200,00 (63,6% acima)

**Diagnóstico:** o gerador trata algumas colunas como preço unitário e outras como custo total, sem padronizar. Para um analista de compras, isso significa que **as colunas Material, M.O. e Logística não são auditáveis**.

**Sub-diagnóstico:** 57 dos 90 itens (63,3%) têm `Mat=0, MO=0, Log=0` mas `Custo Total > 0`. Para itens caros como "Painel amadeirado premium R$ 76.000" ou "Esquadrias R$ 32.400", isso bloqueia qualquer renegociação por componente.

**Fix:** padronizar contrato de dados entre agente e planilha. O agente Orçamentista entrega `{qtd, mat_unit, mo_unit, log_unit}` (preços unitários). O templater calcula `total = qtd × (mat + mo + log)` na hora de escrever a célula. Nunca aceitar `total` direto do agente.

#### P0.2 — Aba Custos Logísticos vazia

A aba existe mas só tem o totalizador `R$ 0,00`. Itens logísticos estão dispersos em `Orçamento Detalhado` (itens 87 a 90), sem sinalização de categoria.

**Manus** populou cinco itens, totalizando R$ 72.400,00:
- Transporte de container (2 un × R$ 300 = R$ 600)
- Instalação de container (1 un × R$ 500 = R$ 500)
- Caçambas para entulho (156 un × R$ 425 = R$ 66.300)
- Taxa horário especial aeroportuário (1 vb × R$ 2.000 = R$ 2.000)
- Estacionamento de obra (3 mês × R$ 1.000 = R$ 3.000)

**Fix:** o agente de Logística já produz output com `logisticsCosts[]` em formato dedicado. O templater precisa:
1. Ler `agent_executions` do tipo `logistica` do projeto
2. Filtrar items dessa fonte (não misturar com `budget_items`)
3. Escrever na aba `Custos Logísticos` com colunas `Categoria, Descrição, Qtd, Unit, Total`
4. Remover esses items da aba `Orçamento Detalhado`

#### P0.3 — Fluxo de Caixa com 4 linhas

Modelagem atual: 4 pulsos de R$ 539.554,48. Não representa cronograma de obra.

**Manus modela 44 semanas:** distribuição constante de despesas (R$ 29.405,46/semana), receita 40% S1 + 60% S44, sinaliza saldo negativo da semana 27 à 43, alertando que o cliente precisa antecipar parte do recebimento ou a empresa precisa de capital de giro de R$ 496 mil no pico.

**Fix:** já existe `services/deterministicCashFlow.ts` que calcula cash flow com base em duração. Conectar ele ao templater pra gerar 1 linha por semana, com:
- Coluna `Semana` (1 a N)
- Coluna `Despesa` (linear ou curva-S)
- Coluna `Receita` (por marcos de recebimento configurados pelo Board)
- Coluna `Saldo` (acumulado)
- Coluna `Alerta` (vermelho se saldo < 0)

A duração total do projeto vem do agente Gestão de Projetos (campo `totalDuration`).

### P1 — Defeitos altos (passam por procurement, reprovam em auditoria técnica)

#### P1.1 — 63,3% dos itens sem decomposição Mat/MO/Log

Toda linha precisa explicitar custo de material, mão de obra e logística separadamente.

**Fix:** parte do P0.1. Se o Orçamentista não trouxer decomposição, o templater **não deve** preencher `Custo Total` direto — deve marcar `[REVISAR]` ou usar um fallback explícito (ex: dividir 60% material / 40% MO se for item de instalação) e logar warning.

#### P1.2 — Duplicidade de itens dentro do orçamento

Pipeline gera o mesmo serviço duas vezes (estacas itens 6+9, alvenaria 18+19, esquadrias 35+47, SPDA 63+79, VRF 60+66 fragmentado).

Causa provável: agentes diferentes propõem o mesmo item em fases diferentes da composição. Sem etapa de deduplicação semântica antes da emissão.

**Fix (já parcialmente feito):**
- O Auditor já identifica e popula `corrections.budgetItemsToRemove[]`. UI já tem `AuditCorrectionsModal` que pede autorização do user.
- **Gap atual:** se o user não aprovar (ou modal não disparar), as duplicatas vão pra planilha. Adicionar etapa **automática** no templater: ao escrever `Orçamento Detalhado`, aplicar dedup semântica usando `dedupItems` de `agents/dedupUtils.ts` (que já existe). Itens com similaridade > 0.85 viram um só, com nota `[CONSOLIDADO de N descrições]` na coluna Premissa.

#### P1.3 — BDI apresentado como linha separada

Operador definiu *"Final spreadsheet without separate Administração Local or BDI lines"*. Tanto Manus quanto Engine exibem BDI como linha separada em `Resumo`.

**Fix:** dilui o BDI nos preços unitários do `Orçamento Detalhado`. Cada `Custo Total` da linha já vem com BDI embutido. Remove a linha "BDI" da aba `Resumo` — fica só `Custo Direto + Custos Logísticos = Preço Final` (todos com BDI diluído). Se quiser preservar transparência, adiciona uma seção "Premissas" no Resumo informando "BDI 25% diluído nos preços unitários", sem mostrar valor agregado.

#### P1.4 — Zero fórmulas Excel nativas

Toda a planilha está com valores hardcoded. Recálculo manual quebra auditoria célula a célula.

**Fix:** usar fórmulas nativas do `openpyxl` ou similar:
- Coluna `Custo Total` = `=qtd_cell * (mat_cell + mo_cell + log_cell)` em vez de valor calculado
- Aba `Resumo` = `=SUM(Orçamento!F:F) + SUM(Logística!E:E)`
- Aba `Fluxo de Caixa` saldo = `=saldo_anterior + receita - despesa`

Auditor de procurement consegue mudar uma quantidade e ver impacto propagado.

### P2 — Defeitos médios (polimento)

#### P2.1 — Largura da coluna Descrição

Engine: 216,8 pt (esticada demais). Manus: 40,8 pt.
**Fix:** padronizar largura por coluna no gerador. Recomendado: 60-80 pt para Descrição.

#### P2.2 — Cabeçalhos sem formatação

Cabeçalhos `Item, Código, Descrição, Unid., Qtd., Custo Material...` em fonte normal sem destaque.
**Fix:** aplicar `Font(bold=True)` e `PatternFill` (fundo cinza claro) nas linhas de cabeçalho de cada aba.

#### P2.3 — Coluna `Código` em branco

Todos os itens têm a coluna vazia, mesmo quando há código SINAPI/PINI na coluna `Cód. Fonte`.
**Fix:** popular `Código` quando vier de SINAPI/PINI puro. Se for composição mista ou ajuste, usar a referência principal.

#### P2.4 — Categoria de logística

Quando logística for movida pra aba dedicada (P0.2), replicar esquema de `Categoria` do Manus (`outros`, `bota_fora`, `transporte`, `mobilizacao`) pra facilitar agrupamento e renegociação por categoria com fornecedor.

### P3 — Melhorias incrementais

- **P3.1** — Curva-S no fluxo de caixa em vez de distribuição linear (mais realista pra obras civis)
- **P3.2** — Coluna "Premissa" pra itens onde o agente fez ajuste sobre SINAPI base (Engine já faz isso na coluna `Cód. Fonte`, mas o texto se mistura com a referência)
- **P3.3** — Marcadores `[INSERIR FOTO]` e `[CONFIRMAR EM CAMPO]` quando o item depender de medição posterior

## O que o Engine faz melhor — preservar

Não pode regredir nesses pontos durante a refatoração:

- Granularidade técnica superior (90 vs 60 itens)
- Aderência específica ao escopo de hangar aeroportuário (demolição, fundação profunda, sondagem SPT, drenagem oleosa, SAO)
- Rastreabilidade SINAPI/PINI com códigos específicos e observação de ajuste
- BDI correto a 25% (dentro da regra 20–25% do operador)
- Zero itens órfãos de código fonte
- Formatação parcial de moeda (R$) já implementada — basta estender

## Sugestão de empacotamento

1 PR (`feat/p2-xlsx-refactor`) com 4 commits separados:

1. **`fix(xlsx): contrato de dados qtd × unit + decomposição Mat/MO/Log`** (P0.1, P1.1)
2. **`fix(xlsx): popula aba Logística + dedupes itens entre abas`** (P0.2, P1.2, P2.4)
3. **`fix(xlsx): fluxo de caixa por semana com curva linear/S e alertas de descoberto`** (P0.3, P3.1)
4. **`fix(xlsx): fórmulas Excel nativas + dilui BDI + cabeçalhos formatados`** (P1.3, P1.4, P2.1, P2.2, P2.3)

## Definition of done

- [ ] 100% dos itens satisfazem `Qtd × (Mat + MO + Log) = Custo Total` (validado em smoke test com obra real)
- [ ] Aba `Custos Logísticos` populada quando `agent_executions[logistica].output.logisticsCosts.length > 0`
- [ ] Fluxo de caixa com 1 linha por semana, baseado em `gestao_projetos.totalDuration`
- [ ] Zero linhas duplicadas no orçamento (dedup semântica >= 0.85 similarity)
- [ ] BDI diluído nos preços, sem linha separada em `Resumo`
- [ ] >= 80% das células de `Custo Total` usando fórmula Excel nativa
- [ ] Cabeçalhos formatados (bold + fill)
- [ ] 5+ testes novos cobrindo: integridade aritmética, dedup, fluxo de caixa por semana
- [ ] Smoke test manual com memorial Hangar 37 — comparar planilha gerada com a versão anterior, confirmar que regressões não aconteceram em granularidade técnica
- [ ] PR aberto pra `main` com link pra esta spec

## Comunicação com o founder

Se durante a refatoração descobrir que algum agente de IA não está fornecendo decomposição Mat/MO/Log (ex: Logística retornando só `totalCost`), abrir comentário no PR especificando qual agente e propor:
- (a) Pedir mais decomposição pelo prompt do agente, ou
- (b) Usar fallback determinístico (ex: 60/40 material/MO)

Não inventar fix sem alinhamento. Founder em standby.

## Referências

- `server/services/documents.ts` — gerador atual
- `server/services/deterministicCashFlow.ts` — cálculo de fluxo de caixa (já implementado, mas não conectado ao templater)
- `server/agents/dedupUtils.ts` — dedup semântica (já implementado em outros pontos do pipeline)
- `CLAUDE.md` — contexto migração total
- Análise comparativa Manus vs Engine, conduzida em 06/05/2026 — fonte deste documento
