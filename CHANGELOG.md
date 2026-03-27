# CHANGELOG

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
