# CHANGELOG

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
