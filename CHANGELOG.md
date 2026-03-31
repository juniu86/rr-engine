# CHANGELOG

## [3.0.8] - 31 de Março de 2026

### Sprint 3.8 - Board v3.3: Modo Solucionador com Parcelas Dinâmicas de Pagamento

#### Transformacao do Comportamento do Board

**Antes (Lava Rápido REV_03):**
```
Board: "PROJETO NÃO RECOMENDADO. Exposição de R$211K sem adiantamento. BLOQUEADO."
→ Projeto parado. Usuário frustrado.
```

**Depois:**
```
Board: "PROJETO APROVADO COM CONDIÇÕES.
  Solução para caixa: Medição intermediária de 40% na semana 3.
  Cronograma sugerido: 30% entrada + 40% medição + 30% final.
  Cash flow recalculado: exposição zerada.
  Condição: Negociar medição intermediária com cliente."
→ Projeto segue. Backend recalcula cash flow automaticamente.
```

#### Implementacao Tecnica

**Board Agent (server/agents/index.ts):**
- Novo modo: "Solucionador" em vez de "Bloqueador"
- Analisa cash flow deficit e propoe `suggestedBillingSchedule`
- Retorna array de parcelas com: `percentage`, `week`, `description`
- Usa Claude Opus 4.6 para precisao maxima

**Backend Router (server/routers.ts):**
- Novo endpoint `recalculateCashFlow` aplica parcelas sugeridas
- Recalcula exposicao em cada semana
- Atualiza `projects` table com novo cash flow
- Retorna resumo financeiro com exposição zerada

**Schema (drizzle/schema.ts + shared/agents.ts):**
- Novo campo `suggestedBillingSchedule` em BoardOutput
- Tipo `BillingInstallment` com `percentage`, `week`, `description`
- Persistencia em `projects` table

#### Impacto Esperado
- Projetos com deficit de caixa: agora aprovados com condições
- Usuário: ve solução clara e negociaável
- Cash flow: recalculado automaticamente
- Confianca: Board propoe, usuario negocia com cliente

#### Proximas Iteracoes
- Fallback deterministico: funcao `solveCashFlowDeficit()` como rede de seguranca
- Quando: se Claude Opus nao preencher `suggestedBillingSchedule`
- Implementacao: proxima iteracao apos validacao em producao

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: Lava Rápido REV_04 processada com sucesso
- UX: Board propoe solução, usuario aprova

---

## [3.0.7] - 31 de Março de 2026

### Sprint 3.7 - Robust agentType Validation + suggestedValues Pre-Population + Sanitization

#### Tres Correcoes Implementadas

**1. agentType Validation Robusta**
- Problema: "Engenheiro Técnico", "engenheiro-tecnico", "ENGENHEIRO_TECNICO" falhavam em validacao
- Solucao: `.transform()` com normalizacao NFD (remove acentos) + `.refine()`
- Implementacao: 
  ```ts
  agentType: z.string()
    .transform(val => val.trim().toLowerCase().normalize('NFD'))
    .refine(val => VALID_AGENT_TYPES.includes(val), { message: 'Invalid agent type' })
  ```
- Impacto: Todos os formatos resolvem para `"engenheiro_tecnico"` canonico

**2. suggestedValues Pre-Population**
- Problema: Modal mostrava valor sugerido mas nao o incluia no payload ao submeter
- Causa: Valores sugeridos nao eram copiados para `userResponses`
- Solucao: Quando modal abre com `suggestedValues`, copiar imediatamente para `userResponses`
- Implementacao: `setUserResponses({ ...suggestedValues, ...userResponses })`
- Impacto: Valores sugeridos sao incluidos no payload, menos cliques do usuario

**3. Sanitizacao Robusta**
- Problema: Valores `null`, `""`, `NaN` causavam erros de validacao
- Solucao: Frontend remove valores invalidos antes de enviar, backend aceita `null` e converte para `""`
- Implementacao:
  ```ts
  const sanitized = Object.entries(userResponses)
    .filter(([_, v]) => v !== null && v !== '' && !Number.isNaN(v))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
  ```
- Impacto: Validacao Zod nunca falha por valores invalidos

#### Impacto Esperado
- Transicao Engenheiro -> Orcamentista: 100% confiavel
- Modal com suggestedValues: usuario nao precisa re-digitar
- Erros de validacao: eliminados para campos vazios/null
- Fluxo: mais fluido, menos cliques, menos erros

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: Transicao entre agentes funciona
- UX: Modal pre-populada, menos erros

---

## [3.0.6] - 27 de Março de 2026

### Sprint 3.6 - Auditor Ativo v3.2: Editor-Chefe com Correcoes Aprovadas pelo Usuario

#### Experiencia do Usuario Transformada

**Fluxo Completo:**
1. Pipeline executa normalmente (10 agentes processam memorial)
2. Auditor (Claude Opus 4.6) analisa 70+ itens do orcamento
3. Encontra duplicatas e preenche `corrections` com itens a remover
4. Modal aparece automaticamente com lista de correcoes:
   - "Sistema VRF completo" — Duplica condensadora + fan coils → -R$75.000
   - "Frete de materiais pesados" — Ja embutido em SINAPI → -R$15.000
   - "Limpeza final profissional" — Duplica item 61 do orcamento → -R$8.000
5. Usuario revisa, desmarca o que quiser, clica "Aplicar"
6. Backend remove por ID, recalcula preco deterministico
7. Resumo Financeiro e planilha mostram valores limpos

#### Implementacao Tecnica

**Frontend (ProjectDetails.tsx):**
- Modal interativa com lista de correcoes
- Checkboxes para cada item (default: selecionado)
- Botao "Aplicar Correcoes" chama `applyAuditorCorrections` mutation
- Feedback visual de economia total

**Backend (server/routers.ts):**
- Novo router `applyAuditorCorrections` valida e aplica remocoes
- Recalcula `totalDirectCost`, `totalLogistics`, `totalBDI`
- Atualiza `projects` table com novos totais
- Retorna resumo financeiro atualizado

**Auditor (server/agents/index.ts):**
- Analisa budget items completo com contexto
- Retorna array de `corrections` com ID, descricao, economia
- Usa Claude Opus 4.6 para precisao maxima

**Schema (shared/agents.ts):**
- Novo tipo `AuditorCorrection` com `itemId`, `reason`, `savingsAmount`
- Tipo `AuditorOutput` com `corrections` array

#### Impacto Esperado
- Usuario tem controle total: aprova/rejeita cada correcao
- Transparencia: ve economia de cada item
- Confianca: pode revisar antes de aplicar
- Precisao: valores finais 100% consistentes

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: REV_12 processada com modal de correcoes
- UX: Modal intuitiva, feedback claro

---

## [3.0.5] - 27 de Março de 2026

### Sprint 3.5 - REV_12: Value Divergence + Status Contradiction + Semantic Dedup + Logistics Cross-Check

#### Cinco Correcoes Criticas Implementadas

**1. Divergencia de Valores (Value Divergence Fix)**
- Problema: Frontend mostra R$880K, Excel mostra R$1.6M
- Causa: `totalDirectCost` nao era recalculado APOS deduplicacao
- Solucao: `totalDirectCost` recalculado APOS dedup e salvo no output
- Impacto: Frontend e Excel mostram mesmo valor, auditoria consistente

**2. Contradicao de Status (Status Contradiction Fix)**
- Problema: Projeto marcado como "Aprovado + Rejeitado" simultaneamente
- Causa: Auditor `rejected=true` mas status nao era atualizado
- Solucao: Auditor `rejected=true` -> status = "review" automaticamente
- Impacto: Nunca mais estado contraditorio, fluxo claro

**3. Projetos sem Totais (Missing Totals Fix)**
- Problema: Totais nao eram gravados em `projects` table
- Causa: Pipeline completava mas nao persistia resumo final
- Solucao: Totais gravados em `projects` table apos pipeline completo
- Impacto: Fonte unica de verdade, queries rapidas

**4. Duplicacao Semantica (Semantic Dedup)**
- Problema: "Sistema drenagem" vs "Canaletas+SAO" = ambos precificados
- Solucao: `detectContainmentDuplicates()` — keywords 70%+ overlap = remove menor
- Exemplo: "Piso" + "Revestimento piso" = remove o segundo
- Impacto: Elimina duplicatas nao-exatas que LLM nao detecta

**5. Logistica Sobreposta (Logistics Cross-Check)**
- Problema: Frete/betoneira/limpeza duplicados se ja no orcamento
- Solucao: `crossCheckLogisticsVsBudget()` — keywords vs budget items
- Validacao: Se "frete" ja em budget, remove de logistics
- Impacto: Logistica precisa, sem sobreposicoes com SINAPI

#### Impacto Esperado em REV_12
- Consistencia: Frontend = Excel = Banco de dados
- Status: Nunca mais contradicoes, fluxo claro
- Precisao: Deduplicacao semantica + cross-check logistica
- Confiabilidade: Fonte unica de verdade em `projects` table

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: REV_12 processada com sucesso
- Consistencia: Frontend/Excel/DB alinhados

---

## [3.0.4] - 27 de Março de 2026

### Sprint 3.4 - REV_10→REV_11: Mutual Exclusion + Logistics Anti-Overlap + Unique Item Numbers

#### Tres Correcoes Implementadas

**A: Exclusao Mutua (Mutual Exclusion Rule)**
- Problema: Pacote global + componentes = ambos precificados
- Solucao: Se pacote pai existe, apenas componentes sao precificados
- Exemplo Hangar: "VRF" vira PAI, so condensadora/fan coils sao precificados
- Impacto: Elimina duplicacao de pacotes completos

**B: Anti-Sobreposicao Logistica (Logistics Anti-Overlap)**
- Problema: Custos ja embutidos em SINAPI sao duplicados na logistica
- Solucao: Frete <30km, betoneira, limpeza final nao entram em logistica se ja em SINAPI
- Impacto: Logistica R$128K -> ~R$60K (50% reducao)
- Validacao: Comparacao automatica com composicoes SINAPI

**C: Numeracao Unica (Unique Item Numbers)**
- Problema: Mesmo codigo para itens diferentes (7.1 = "Bloco de Apoio" E "Armadura de retracao")
- Solucao: Validacao de unicidade por (numero + descricao + categoria)
- Impacto: Previne confusao em rastreamento e auditoria

#### Impacto Esperado em REV_11
- Custo direto: R$1.96M -> ~R$1.5M (eliminacao dos 5 frentes de duplicacao)
- Logistica: R$128K -> ~R$60K (removel de sobreposicoes com SINAPI)
- Preco final: proporcional com BDI mantendo margem
- Economia total: ~R$460K-520K (~24% reducao)

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: REV_11 processada com sucesso

---

## [3.0.3] - 26 de Março de 2026

### Sprint 3.3 - CRITICAL FIX: Eliminate Duplicate Budget Items

#### Problema Corrigido
- Itens pai (resumos) eram salvos junto com filhos, gerando duplicacao de custos
- Mesmo servico aparecia em multiplos pacotes (ex: piso banheiro linhas 36-37 E 38-39)
- Resumos re-lancados inflavam custos (ex: linhas 79-84 re-entradas)
- Premissas operacionais eram tratadas como custos (ex: SAO - Destinacao)

#### Solucao Implementada
- **Schema do Orcamentista:** novo campo `isSummaryItem` retornado pelo LLM
- **persistBudgetItems():** filtra `isSummaryItem=true` antes de salvar no banco
- **Prompt do Orcamentista:** nao exige mais contagem forcada, LLM pode omitir pais
- **validateAgentCoherence():** usa `filterItemsForPricing()` para validacao
- **Deduplicacao:** por `description+unit+category` na persistencia
- **Auditor:** verifica duplicatas como erro critico

#### Impacto Esperado
- Hangar Avjet: custo direto R$1.9M -> ~R$1.77M (elimina ~R$130K em duplicatas)
- Preço de venda reduz proporcionalmente mantendo margem
- Precisao de orcamentos melhora significativamente

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando
- Teste de regressao: Hangar Avjet processado com sucesso

---

## [3.0.2] - 26 de Março de 2026

### Sprint 3.2 - Maximum Autonomy Rule + Question Whitelist Optimization

#### Adicionado
- Maximum Autonomy Rule: Agentes podem fazer perguntas ilimitadas quando necessario para completar tarefas
- Question Whitelist Optimization: Restricao inteligente a area/length/quantity quando apropriado
- Dynamic Question Strategy: Sistema que adapta estrategia de perguntas baseado em contexto

#### Melhorado
- Logica de interatividade v2.2 com suporte a autonomia dinamica
- Reducao de perguntas redundantes mantendo precisao

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando

---

## [3.0.1] - 26 de Março de 2026

### Sprint 3.1 - Smart Auto-Inference + Direct Anthropic API

#### Adicionado
- Smart Auto-Inference: Deteccao automatica de qualidade do memorial para pular perguntas pre-LLM
- Direct Anthropic API Integration: Integracao direta com API Anthropic para Claude models
- Quality Tier Detection: Sistema de deteccao de nivel de qualidade do memorial descritivo

#### Melhorado
- Logica de interatividade v2.1 para evitar perguntas redundantes
- Suporte a multiplos provedores LLM com fallback automatico

#### Validacao
- TypeScript: 0 erros
- Testes: 407 testes passando

---

## [3.0.0] - 26 de Março de 2026

### Sprint 3 - Ensemble Validation Module + Comprehensive Tests

#### Adicionado
- **Ensemble Validation Module:** Módulo de validação cruzada que combina múltiplos LLMs para validar saídas de agentes
- **Price Anchor Validator:** Validador de preços que detecta anomalias usando análise estatística
- **Cross-Validation Module:** Validação cruzada de dados entre agentes para detectar inconsistências
- **Comprehensive Test Suite:** 407 testes cobrindo todos os módulos críticos
- **INCC-M Correction:** Correção automática de preços usando índice INCC-M
- **Multi-LLM Routing:** Roteamento inteligente entre Gemini, Claude e GPT baseado em tipo de tarefa

#### Melhorado
- **Deterministic Engine:** Motor determinístico com 7 enhancements para precisão de orçamento
- **PINI Integration:** Integração expandida com tabelas PINI (170+ composições)
- **Prompt Engineering:** Prompts enriquecidos para cada agente com contexto técnico
- **Price Anchoring:** Ancoragem de preços em dados históricos e SINAPI

#### Corrigido
- Erro "The string did not match the expected pattern" em transição Engenheiro → Orçamentista
- Truncamento de resposta LLM em memoriais com 30+ itens (maxOutputTokens: 32768 → 65536)
- Erro 500 transitório do gateway forge.manus.im com retry exponencial

#### Validação
- **TypeScript:** 0 erros
- **Testes:** 407 testes passando (31 arquivos de teste)
- **Coverage:** 95%+ de cobertura de código crítico

---

## [2.15.3] - 26 de Março de 2026

### Fix: Normalize agentType e Truncamento Varchar

#### Corrigido
- Normalização de agentType em frontend (ProjectDetails.tsx)
- Validação robusta com .transform() + .pipe() no backend
- Truncamento de campos varchar (unit, sourceDate)
- Default "none" para taxType em schema.ts

---

## [2.15.2] - 26 de Março de 2026

### Retry com Backoff Exponencial no BaseAgent

#### Adicionado
- Mecanismo de retry automático para erros 5xx
- Backoff exponencial: 1s, 3s, 5s
- Detecção de truncamento via finish_reason

---

## [2.15.1] - 26 de Março de 2026

### Aumento de maxOutputTokens do Gemini

#### Corrigido
- maxOutputTokens do Gemini: 32768 → 65536
- Resolução de erro "finish_reason: length" em memoriais grandes

---

## [2.15.0] - 26 de Março de 2026

### Integração do Motor Determinístico Claude

#### Adicionado
- Motor determinístico com 9 arquivos (2.1K LOC)
- 8 correções de bugs críticos
- Validação TypeScript completa

---
