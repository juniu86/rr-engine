# 01 — Diagnóstico mecânico do RR Engine

**Versão:** v1
**Data:** 04/05/2026
**Autor:** Análise técnica
**Escopo:** `server/agents/index.ts` (2.510 linhas), `server/_core/llm.ts`, `server/_core/llm-providers.ts`, `server/services/{sinapi,sinapiScraper,pini,piniScraper}.ts`, `server/lib/deterministicEngine/*`, `server/utils/logger.ts`, `vitest.config.ts`, `routers.ts` (orquestração).

---

## 1. Objeto

Auditoria técnica do pipeline de 10 agentes que produz orçamentos no RR Engine v3.1.0. O documento responde três perguntas: (i) o que cada agente faz, em qual modelo e a que custo de token; (ii) onde o pipeline falha hoje; (iii) o que precisa ser mudado, em que ordem.

A análise foi feita sobre o código atual, sem instrumentação ativa. Estimativas de token vêm de contagem de caracteres dos prompts (regra ~4 chars/token para português) e leitura dos schemas de saída. Onde o número é estimativa, o texto traz a premissa explícita. Onde o dado é desconhecido e precisa de instrumentação real, está marcado `[INSERIR — medir em produção]`.

## 2. Vistoria do código

### 2.1 Camada de orquestração

Os 10 agentes herdam de `BaseAgent` em `server/agents/index.ts`. O método `_execute()` faz uma chamada única à Forge da Manus via `invokeLLM()`, sem streaming, com `response_format = json_schema`. Há retry automático (3 tentativas, backoff 1s/3s/5s) apenas para erros 5xx; erros 4xx falham imediatamente.

A orquestração principal vive em `server/routers.ts` (procedures tRPC). O array fixo `["engenheiro_tecnico", "logistica", "orcamentista", "tributario", "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"]` define a ordem sequencial de execução. Não há paralelismo entre agentes — cada um espera o anterior terminar.

Existe um caminho de re-execução quando o Board solicita revisão financeira (`isFinancialOnlyRejection = true`): seis agentes (Orçamentista, Logística, Tributário, Comercial, Gestão, Financeiro, Jurídico, Board, Auditor — efetivamente 9) rodam de novo com instruções específicas. O ciclo só pode ser disparado uma vez por projeto.

### 2.2 Camada de modelo

`getProviderCapabilities()` em `_core/llm-providers.ts` mapeia limites por provider:

| Provider | maxOutputTokens | Suporte a thinking | Suporte a strict schema |
|---|---|---|---|
| Gemini 2.5 Flash | 65.536 | não | não |
| Claude Opus | 32.768 | sim | não |
| Claude Sonnet | 16.384 | sim | não |
| GPT (genérico) | 16.384 | não | sim |

Para Claude, o payload inclui `thinking: { type: "enabled", budget_tokens: 128 }` — número simbólico, praticamente desligado.

`temperature` **nunca é setado** no payload. O sistema herda o default do provider: 1.0 no Gemini, 1.0 no Claude. Para um produto que precisa de números reproduzíveis, isso é um problema clássico — duas execuções do mesmo memorial podem divergir em milhares de reais sem aviso.

`_core/llm.ts:332-345` tem rota direta à Anthropic API quando `ANTHROPIC_API_KEY` está presente. Isso significa que o LLM já é desacoplável do Forge da Manus — basta provisionar a chave fora do tenant.

### 2.3 Bases de preço

`server/services/sinapi.ts` carrega `SINAPI_DB`, base estática com 200+ composições, marcada "Ref: SP, Jan/2025". Aplica `adjustPriceForRegion()` por estado. `sinapiScraper.ts` usa Puppeteer contra `orcamentor.com` para complementar consultas em runtime — esse é um terceiro privado, não a fonte oficial da Caixa.

`server/services/pini.ts` tem uma base local (vou medir tamanho exato no Entregável C). `piniScraper.ts` está com comentário literal "scraping was never fully implemented" — só lê cache. Confere com a sua resposta na Fase 1: o scraping de PINI é um trabalho a fazer.

### 2.4 Camada determinística não usada

`server/lib/deterministicEngine/index.ts` exporta `processMemorial()`, que executa parser → pricing → logistics → budget → crossValidation sem LLM. Grep cruzado: a função é importada apenas por um arquivo de teste (`sprint2-3-improvements.test.ts`). **Os routers de produção nunca a chamam.** O motor existe no repositório, mas está desligado da operação real.

### 2.5 Telemetria

`server/utils/logger.ts` cria um winston com transporte único de console. Nenhum sink externo. Os contadores `getScrapingStats()` mantêm sucesso/falha de scraping em memória — morrem com o processo. Crítico: **o sistema não persiste tokens consumidos por orçamento**. A pergunta "quanto custou o orçamento X" não tem resposta hoje.

### 2.6 Testes e CI

`vitest.config.ts` registra suites em `server/**/*.test.ts`. Contagem efetiva: 25 arquivos. Não existe diretório `.github/workflows/`. Os testes só rodam quando alguém digita `npm test`.

---

## 3. Análise técnica — agente por agente

A tabela usa três cenários para tokens: **pequeno** (memorial 5.000 tokens, ~30 itens), **médio** (memorial 15.000 tokens, ~80 itens — caso Reforma Vânia REV08), **grande** (memorial 40.000 tokens, ~250 itens — caso Hangar). System prompt fixo. User prompt cresce com o payload do agente anterior. Output cresce com itens.

### 3.1 Agente 1 — Engenheiro Técnico

**Modelo:** Claude Opus 4.6 (override `LLM_MODEL_CRITICAL`). **Temperatura:** default do provider (~1.0), não setada explicitamente.

**Resumo do system prompt em 3 linhas.** Atua como orçamentista sênior com 20 anos; tem ordem explícita de inferir o que conseguir antes de perguntar (qualityTier econômico/médio/alto com tabelas Deca/Lorenzetti/Suvinil); aplica regras anti-duplicação pai/filho com `isSummaryItem`. Pré-LLM existe um detector de memorial vago (`_isMemorialVago`) que devolve perguntas sem chamar a LLM quando não detecta nem metragem nem padrão de qualidade.

**Tokens médios estimados (input / output):**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~3.700 | ~5.500 | ~6.000 |
| Médio | ~3.700 | ~16.000 | ~14.000 |
| Grande | ~3.700 | ~42.000 (chunked) | ~30.000 (chunked) |

**Dependências externas.** Nenhuma direta — só Forge → Anthropic. Importa `chunking.ts` para memoriais grandes.

**Pontos de falha identificados.**
- Output schema com 12 campos (group, itemNumber, description, quantity, unit, specifications, nbrReference, isPendingVistoria, isSummaryItem, parentGroupNumber, isInferred, inferenceReason, qualityTier) cresce linearmente com o número de itens. Memorial grande → output 30k+ tokens, próximo do teto de 32.768 do Opus, com risco real de truncamento.
- Detector `_isMemorialVago` faz match por regex (`m²`, `un`, etc.). Memorial em formato bullet sem números mas com padrão "AAA" passa direto por causa do `hasQualityTier` — comportamento por design, mas se o cliente colocar "padrão alto" sem dar área nenhuma, a LLM vai inventar metragem com base em premissas e marcar `isInferred=true`. Risco médio de orçamento sair com m² fictícios.
- `mergeEngenheiroOutputs()` em chunking concatena outputs sem revalidar duplicatas entre chunks. Item que aparece no chunk 1 e no chunk 2 vai dobrado.
- Sem temperatura fixa, dois processamentos do mesmo memorial podem produzir conjuntos diferentes de itens. Não há seed.

### 3.2 Agente 2 — Logística e Mobilização

**Modelo:** Gemini 2.5 Flash (default — sem override no código). **Temperatura:** default (~1.0).

**Resumo do system prompt.** Calcula custos indiretos (mobilização, frete, bota-fora, andaime, hospedagem) sem incluir mão de obra direta porque essa já está nas composições SINAPI/PINI. Tem regra anti-sobreposição com Orçamentista — frete até 30km já está embutido nas composições, então só calcula excedente. Lista preços de referência embutidos no prompt (caçamba R$ 350-500, frete local R$ 200-400, etc.).

**Tokens médios estimados:**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~1.400 | ~2.500 | ~600 |
| Médio | ~1.400 | ~6.500 | ~1.200 |
| Grande | ~1.400 | ~15.000 | ~2.500 |

**Dependências externas.** Nenhuma direta.

**Pontos de falha identificados.**
- Preços de referência hardcoded (R$ 350-500/caçamba, R$ 120/dia hospedagem) datam do prompt — não atualizam com a base SINAPI nem com o tempo. Em 18 meses esses valores serão imprecisos.
- A regra de "frete excedente acima de 30km" depende da LLM aplicar geometria local — Gemini Flash em temperatura padrão tende a aproximar grosseiramente.
- Não recebe a localização real do canteiro com coordenadas, só uma string. Logística para obra em Itaipava a partir de canteiro no Centro do Rio precisa de cálculo que o agente não tem dados para fazer.

### 3.3 Agente 3 — Orçamentista & Suprimentos

**Modelo:** Claude Opus 4.6. **Temperatura:** default.

**Resumo do system prompt.** Precifica todos os itens recebidos do Engenheiro com base SINAPI/PINI; separa Curva A (80% do valor) de Curva C; respeita hierarquia pai/filho zerando preço de itens-resumo. Tem `buildPriceAnchors()` que faz fuzzy match dos 15 itens de maior valor contra `SINAPI_DB` + `PINI_DATABASE` e injeta como referência no prompt — exige justificativa quando a LLM diverge mais que 15% da âncora.

**Tokens médios estimados:**

| Cenário | System | User (com âncoras) | Output |
|---|---|---|---|
| Pequeno | ~900 | ~5.000 | ~7.000 |
| Médio | ~900 | ~15.000 | ~22.000 |
| Grande | ~900 | ~40.000 (chunked em frentes) | ~50.000 (chunked) |

**Dependências externas.** `SINAPI_DB` e `PINI_DATABASE` carregados em memória, `budgetChunking.ts` para divisão por frentes (estrutura, instalações, acabamento, etc.).

**Pontos de falha identificados.**
- O anchor system cobre só os 15 itens maiores. Em obra de 250 linhas, 235 itens não têm referência forte — a LLM precifica do prompt sozinha. Há registro literal de "REFERÊNCIAS DE PREÇO (usar como base quando não houver SINAPI/PINI)" com faixas largas (concreto fck 25 R$ 450-550/m³) que dão liberdade para qualquer número dentro da faixa.
- O fuzzy match usa overlap textual ≥0,4 (40% dos termos) — match falso acontece com facilidade ("piso cerâmico 30x30" pode casar com "piso porcelanato 30x30" e injetar âncora errada).
- Output schema obriga `sourceCode` mesmo para fonte "Mercado" — a LLM pode preencher com código inventado.
- Em chunking por frentes, cada frente vê só uma fatia. Item ambíguo classificado em duas frentes vai duplicado no merge.

### 3.4 Agente 4 — Tributário

**Modelo:** Claude Opus 4.6. **Temperatura:** default.

**Resumo do system prompt.** Classifica cada item entre ISS (serviço) e ICMS (material); aplica alíquotas declaradas no `companyTaxSettings` (regime + percentuais customizados); calcula retenções obrigatórias (INSS 11% sobre cessão, IR 1,5% engenharia, ISS retido). Tabela de Simples/Lucro Presumido/Lucro Real embutida.

**Tokens médios estimados:**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~600 | ~2.500 | ~800 |
| Médio | ~600 | ~7.000 | ~2.000 |
| Grande | ~600 | ~20.000 | ~5.500 |

**Dependências externas.** `companyTaxSettings` injetado pelo router (configuração da empresa, persistida no banco).

**Pontos de falha identificados.**
- O prompt diz "use AS ALÍQUOTAS CONFIGURADAS — NÃO USE VALORES PADRÃO", mas usa fallback hardcoded (`lucro_presumido`, ISS 5%, PIS 0,65%, COFINS 3%) quando `companyTaxSettings` vem indefinido. Empresa sem configuração entra na rota errada sem aviso.
- A tabela do Simples Nacional Anexo IV listada no prompt está em valores 2025 — vai desatualizar; não há mecanismo para atualizar essa tabela sem editar código.
- Bitributação ISS+ICMS em empreitada mista é regra municipal — a LLM aplica heurística genérica.
- Custo Opus para um agente que essencialmente classifica em 4 categorias e multiplica por uma alíquota é desproporcional. Sonnet ou Gemini Flash provavelmente bastariam.

### 3.5 Agente 5 — Comercial

**Modelo:** Gemini 2.5 Flash (default — sem override). **Temperatura:** default.

**Resumo do system prompt.** Aplica BDI sobre custo direto + indireto (NÃO somar impostos antes — bitributação); usa `companyBdiSettings` ou BDI específico do projeto; ajusta BDI por risco fiscal, complexidade logística e prazo. Fórmula explícita: `precoVenda = custoBase × (1 + bdiAjustado)`.

**Tokens médios estimados:**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~400 | ~600 | ~150 |
| Médio | ~400 | ~700 | ~200 |
| Grande | ~400 | ~800 | ~300 |

**Dependências externas.** `companyBdiSettings`.

**Pontos de falha identificados.**
- Agente quase trivial — usa LLM para fazer multiplicação `custoBase × (1 + bdi)`. Dá para deixar 100% determinístico. Custo de Gemini Flash é baixo, mas variabilidade não-zero em produto comercial.
- Os ajustes ("Risco fiscal alto +5%", "Complexidade logística alta +5%") são mapeados para inputs `logisticsComplexity` e `fiscalRisk` que já vêm do router. A LLM só lê e aplica — pura função, não precisa de modelo.

### 3.6 Agente 6 — Gestão de Projetos

**Modelo:** Claude Sonnet 4.6 (`LLM_MODEL_INTERMEDIATE`). **Temperatura:** default.

**Resumo do system prompt.** Cria cronograma físico dia a dia com índices SINAPI de produtividade (ex.: alvenaria 2,7 Hh/m², revestimento cerâmico 1,8 Hh/m²); calcula caminho crítico; respeita sequência típica de obra (demolição → estrutura → alvenaria → instalações primárias → revestimento → contrapiso → impermeabilização → acabamento → louças → limpeza). Output exige cronograma detalhado por dia com equipe, materiais e entregas.

**Tokens médios estimados:**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~1.250 | ~3.000 | ~5.000 |
| Médio | ~1.250 | ~7.500 | ~14.000 |
| Grande | ~1.250 | ~18.000 | ~28.000 |

**Dependências externas.** Nenhuma direta. User prompt corta `budgetItems` em 30 itens — para obra grande, 220 itens não chegam à LLM.

**Pontos de falha identificados.**
- O slice `input.budgetItems.slice(0, 30)` no `getUserPrompt` é hard limit silencioso. Em obra grande, o cronograma é gerado vendo só 12% dos itens — vai subestimar prazo sistematicamente.
- Output `dailySchedule` cresce linearmente com o número de dias. Obra de 90 dias × ~3 atividades/dia × ~250 tokens/atividade ≈ 67.500 tokens — estoura o teto de 16.384 do Sonnet. **Risco real de truncamento em obras médias para grandes.**
- `criticalPath` é texto livre, sem validação contra dependências do schedule.

### 3.7 Agente 7 — Financeiro

**Modelo:** Gemini 2.5 Flash (default). **Temperatura:** default.

**Resumo do system prompt.** Análise qualitativa de viabilidade financeira; recebe `cashFlow` pré-calculado deterministicamente pelo backend e NÃO deve recalcular; gera alertas qualitativos sobre exposição de caixa, capital de giro e risco semanal. Modelo padrão: 40% entrada + 60% final.

**Tokens médios estimados:**

| Cenário | System | User (cashFlow incluído) | Output |
|---|---|---|---|
| Pequeno | ~300 | ~1.500 | ~500 |
| Médio | ~300 | ~3.000 | ~800 |
| Grande | ~300 | ~6.000 | ~1.200 |

**Dependências externas.** `services/deterministicCashFlow.ts` — único agente com camada determinística real plugada.

**Pontos de falha identificados.**
- Esse é o único agente com lógica determinística de fato em produção. Pergunta legítima: para que existe o LLM aqui? Se a saída é só "retorne o mesmo cashFlow" + alertas de texto, dá para gerar os alertas em código rule-based.
- O prompt diz "NÃO invente números. Use EXATAMENTE os valores do cashFlow fornecido" — mas a LLM tem temperatura 1.0 e precisa devolver o array `cashFlow` no JSON. Empiricamente, modelos com temperatura alta arredondam e mexem em casas decimais.

### 3.8 Agente 8 — Jurídico

**Modelo:** Claude Opus 4.6. **Temperatura:** default.

**Resumo do system prompt.** Redige proposta técnica com cláusulas essenciais (objeto, preço, prazo, garantias, responsabilidades, rescisão, foro); usa prazo em dias do agente Gestão sem arredondar para semanas. System prompt curto (~150 tokens), grande parte do trabalho é geração livre.

**Tokens médios estimados:**

| Cenário | System | User | Output |
|---|---|---|---|
| Pequeno | ~150 | ~400 | ~3.000 |
| Médio | ~150 | ~600 | ~5.000 |
| Grande | ~150 | ~900 | ~7.000 |

**Dependências externas.** Nenhuma direta.

**Pontos de falha identificados.**
- System prompt tem ~150 tokens para uma tarefa que produz 3-7k tokens de saída regulada por lei. Risco de cláusula com erro material (foro errado, validade fora do prazo, escopo divergente) é alto.
- `proposalText` é string livre. Não há template. Cada proposta sai com formato sutilmente diferente — problema de consistência de marca.
- Roda em Opus para uma tarefa primariamente de templating com substituição de variáveis. Custo alto, controle baixo.

### 3.9 Agente 9 — Board

**Modelo:** Claude Opus 4.6. **Temperatura:** default.

**Resumo do system prompt.** Atua como CEO+CFO+COO; bloqueia se margem <5% ou >50% itens sem preço; aprova com confirmação se margem 5-15%; aprova direto se >15%. Modo solucionador: em vez de bloquear, propõe `suggestedBillingSchedule` (ex.: 30/40/30 em vez de 40/60) para resolver caixa negativo. Auto-correção financeira: pode pedir UMA re-execução de Orçamentista/Logística/Tributário/Comercial com instruções específicas.

**Tokens médios estimados:**

| Cenário | System | User (resumo + cálculos) | Output |
|---|---|---|---|
| Pequeno | ~1.500 | ~2.000 | ~2.500 |
| Médio | ~1.500 | ~3.500 | ~3.500 |
| Grande | ~1.500 | ~6.500 | ~5.000 |

**Dependências externas.** Recebe outputs de 8 agentes anteriores via `JSON.stringify(resumo)`.

**Pontos de falha identificados.**
- A margem que o Board avalia é pré-calculada determinísticamente no `getUserPrompt` (linhas 1989-2014). O Board recebe a margem pronta. Logo, o LLM não calcula — só decide. Decisão é binária + texto livre: dá para reduzir agressivamente o uso de Opus para Sonnet ou até Haiku.
- Auto-correção financeira só pode rodar 1 vez. Se a primeira revisão não atinge margem mínima, segundo ciclo precisa de intervenção humana — o produto trava sem feedback claro ao usuário.
- `JSON.stringify(resumo, null, 2)` envia o resumo formatado com indentação. Indentação consome tokens à toa — economia de ~15% no input do Board passando minified.

### 3.10 Agente 10 — Auditor

**Modelo:** Claude Sonnet 4.6 (`LLM_MODEL_INTERMEDIATE`). **Temperatura:** default.

**Resumo do system prompt.** Validação matemática final: confere `precoFinal = (custoDireto + logística) × (1 + bdi)` com tolerância R$ 1; alarme se margem bruta <0 ou líquida <5%; detecta duplicatas textuais (>80% de sobreposição) e itens-pai precificados. Modo editor-chefe: preenche `corrections.budgetItemsToRemove` com lista exata do que descartar.

**Tokens médios estimados:**

| Cenário | System | User (até 80 itens listados) | Output |
|---|---|---|---|
| Pequeno | ~1.000 | ~3.500 | ~2.000 |
| Médio | ~1.000 | ~9.000 | ~3.500 |
| Grande | ~1.000 | ~14.000 (corte em 80 itens) | ~5.500 |

**Dependências externas.** Recebe outputs de todos os 9 agentes anteriores.

**Pontos de falha identificados.**
- Validação matemática "Preço Final = Custo Base × (1 + BDI), tolerância R$ 1" é aritmética pura. Não precisa de LLM. Hoje você paga Sonnet para fazer uma subtração.
- Detector de duplicatas usa "sobreposição textual >80%" — ambíguo. A LLM aplica isso por feeling. Risco de falso positivo (remover item legítimo) e falso negativo (deixar duplicata passar).
- O slice `budgetItems.slice(0, 80)` no `getUserPrompt` é hard limit. Em obra de 250 itens, 170 nunca chegam ao Auditor — ele audita 32% do orçamento. **Esse é o pior achado da análise: o produto vende "auditor de consistência" sem auditar a obra inteira.**
- `corrections.totalImpact` exige soma das remoções proposta pela própria LLM — não há checagem matemática contra `correctedDirectCost`. LLM pode reportar números inconsistentes entre os campos.

---

## 4. Conclusão

O pipeline funciona, mas é frágil em três pontos de pressão e cara fora deles.

**Fragilidade.** Sem temperatura fixa, o mesmo memorial pode produzir orçamentos com diferença significativa entre execuções. Sem registro de tokens, não dá para precificar com método. Sem o engine determinístico plugado, o produto não tem segunda fonte para validar os números que a LLM gera. Sem CI, regressões em qualquer agente passam direto. Sem auditor cobrindo todos os itens, a promessa comercial de "auditor de consistência" é parcial.

**Custo desproporcional.** Cinco dos dez agentes rodam em Claude Opus 4.6 — modelo com input a US$ 15/Mtok e output a US$ 75/Mtok. Pelo menos três deles (Tributário, Comercial, Jurídico) executam tarefas que poderiam rodar em Sonnet ou Gemini Flash com perda mínima de qualidade. Comercial e parte do Financeiro não precisariam de LLM.

**Acoplamento tático com a Manus, mas LLM já desacoplado.** O caminho de saída para LLM existe (`ANTHROPIC_API_KEY`). O resto do tenant (OAuth, runtime, SDK) precisa de reescrita.

A lista de débitos abaixo organiza o que tratar primeiro.

---

## 5. Lista priorizada de débitos técnicos

### P0 — bloqueantes para qualidade do produto e para crescimento

**P0.1. Plugar o `deterministicEngine` como camada de validação cruzada.** O motor existe, está testado, e cobre todos os itens (não só 15). Religar como segundo caminho: o engine roda em paralelo aos agentes, gera totais, e o Auditor compara. Divergência >X% dispara alerta. Sem isso, o produto fica refém de alucinações da LLM. **Esforço:** 5-8 dias-homem.

**P0.2. Setar `temperature` explícita por agente.** Default zero para os agentes determinísticos por natureza (Comercial, Financeiro, Auditor) e 0.3 para os criativos (Engenheiro, Jurídico). Sem isso, o produto não é reproduzível. **Esforço:** 0,5 dia.

**P0.3. Persistir tokens consumidos por orçamento.** Adicionar tabela `agent_executions` no schema com `agent_type`, `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `project_id`. Wrapper em `invokeLLM` registra cada chamada. Sem isso, não há precificação informada. **Esforço:** 1-2 dias.

**P0.4. Remover hard limits ocultos.** `budgetItems.slice(0, 30)` em Gestão de Projetos e `slice(0, 80)` em Auditor truncam silenciosamente em obras médias-grandes. Substituir por chunking ou por sumarização explícita. **Esforço:** 2-3 dias.

**P0.5. CI com GitHub Actions.** Workflow em `.github/workflows/test.yml` rodando `pnpm test` e `pnpm check` (tsc) em cada push e PR. **Esforço:** 0,5 dia.

### P1 — necessários para escala e custo

**P1.1. Reduzir uso de Opus para tarefas que não exigem.** Migrar Tributário e Jurídico para Sonnet 4.6, Comercial para Haiku 4.5, Financeiro para Haiku 4.5 ou rule-based puro. Estimativa: corte de 50-65% no custo de tokens por orçamento. **Esforço:** 2-3 dias para migrar e revalidar com casos de regressão.

**P1.2. Trocar Comercial e Financeiro por funções determinísticas.** Comercial é multiplicação, Financeiro recebe cashflow pré-calculado e devolve alertas. Ambos podem virar funções TypeScript com testes unitários. Mantém um agente LLM "narrador" opcional para gerar alertas em texto. **Esforço:** 3-4 dias.

**P1.3. Revalidação cruzada entre chunks.** Tanto `mergeEngenheiroOutputs` quanto `mergeOrcamentistaOutputs` precisam de etapa pós-merge que detecte itens duplicados entre chunks (hash normalizado da descrição + categoria). **Esforço:** 2-3 dias.

**P1.4. Atualização das bases SINAPI/PINI.** SINAPI estática Jan/2025 + scraping orcamentor. Plano: implementar scraping ativo do PINI (já decidido na Fase 1), agendar refresh mensal automatizado das duas bases via job, persistir versionado em banco com `reference_date`. **Esforço:** 5-8 dias.

**P1.5. Corrigir fallback silencioso de `companyTaxSettings`.** Quando o usuário não configurou, o sistema usa lucro_presumido/ISS 5% sem aviso. Bloquear processamento e exigir setup, ou mostrar warning explícito no resultado. **Esforço:** 1 dia.

**P1.6. Templating estruturado para Jurídico.** Substituir geração livre por template Markdown com slots preenchidos. LLM só preenche slots, não escreve do zero. Garante consistência de marca e reduz risco contratual. **Esforço:** 3-4 dias.

### P2 — melhorias e dívida acumulada

**P2.1. Documentação técnica refletindo a versão atual.** `docs/DOCUMENTACAO_TECNICA.md` ainda fala em 9 agentes. Reescrever para refletir os 10 atuais e o pipeline real. **Esforço:** 1-2 dias.

**P2.2. Telemetria externa.** Plugar Langfuse ou OpenLLMetry no wrapper de `invokeLLM` (depois do P0.3 estar pronto). Permite visualização e debugging de cadeias de agentes. **Esforço:** 2-3 dias.

**P2.3. Minificação do JSON enviado nos user prompts.** `JSON.stringify(x, null, 2)` está em vários lugares — Board, Orçamentista, Auditor. Indentação custa ~15% de tokens à toa. Trocar por `JSON.stringify(x)`. **Esforço:** 0,5 dia.

**P2.4. Streaming de resposta.** Hoje o usuário espera 2-5 minutos sem feedback granular. Habilitar streaming na Forge/Anthropic e mostrar resultados parciais por agente. **Esforço:** 5-8 dias (envolve UX).

**P2.5. Schema de banco para versionamento de bases.** Criar `price_databases` com `source` (sinapi|pini), `state`, `reference_date`, `data_jsonb`. Substitui o array TypeScript estático. **Esforço:** 3-4 dias (depende de P1.4).

**P2.6. Detector de duplicatas determinístico.** O Auditor faz match por "sobreposição textual >80%" via LLM. Substituir por algoritmo (Levenshtein normalizado + categoria + unidade). LLM só explica o que o algoritmo já encontrou. **Esforço:** 2-3 dias.

**P2.7. Limpeza dos arquivos de análise antigos.** A pasta tem 18+ arquivos `.md` de análises anteriores (`ANALISE_GEMINI.md`, `ACHADOS_AUDITORIA_GEMINI.md`, `teste-v213-correcoes.md`, etc.). Mover para `docs/archive/` ou descartar. **Esforço:** 1 dia.

---

## 6. Estimativa agregada de esforço

P0 inteiro: ~10-15 dias-homem. P1 inteiro: ~17-25 dias-homem. P2 inteiro: ~14-22 dias-homem. Total: 41-62 dias-homem.

Com um desenvolvedor sênior dedicado, P0 fecha em 2-3 semanas; P0+P1 em 8-10 semanas. Esses números entram no Entregável C como base para o cronograma de reconstrução.

---

**Próxima ação.** Aguardo `segue` para gerar o **Entregável B — `02_unit_economics.xlsx` + script Python**, onde os números de custo por orçamento ganham forma de planilha com fórmulas nativas e os três cenários ficam visíveis em abas separadas.
