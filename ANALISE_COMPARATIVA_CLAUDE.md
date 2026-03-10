# Análise Comparativa: Implementação Claude vs RR-Engine Atual

## Resumo Executivo

O Claude Code implementou um **motor de orçamentação independente** (pasta `engine/`) com 8 correções de bugs críticos identificados no backtest da obra **Reforma Bicuiba**. Este motor é **completamente separado** da arquitetura atual do RR-Engine (que roda em `/home/ubuntu/rr-engine` com 10 agentes e pipeline tRPC).

**Situação:** As duas implementações coexistem em branches diferentes do repositório `juniu86/RR-Engenharia`. O motor do Claude está em `claude/fix-rr-engine-backtest-A3gjo` e não foi sincronizado para o ambiente de produção online (rrengine.manus.space).

---

## Estrutura Comparativa

### RR-Engine Atual (Manus Sandbox - v2.14.0)

| Aspecto | Implementação |
|---------|---------------|
| **Localização** | `/home/ubuntu/rr-engine` |
| **Arquitetura** | 10 agentes especializados (Engenheiro, Orçamentista, Logística, Financeiro, etc.) |
| **Pipeline** | Sequencial via tRPC, com LLM em cada etapa |
| **Banco de dados** | PostgreSQL com Drizzle ORM |
| **Precificação** | Dinâmica (LLM gera preços baseado em SINAPI/PINI) |
| **BDI** | Dinâmico por agente (corrigido em v2.9.0) |
| **Testes** | 359 testes passando (vitest) |
| **Integração** | Stripe, OAuth, Cloud Run |
| **Status** | Produção online (rrengine.manus.space) |

### Motor Claude (GitHub Branch - Backtest)

| Aspecto | Implementação |
|---------|---------------|
| **Localização** | `engine/` (raiz do repositório RR-Engenharia) |
| **Arquitetura** | 4 módulos sequenciais (Parser → Pricing → Logistics → Budget) |
| **Pipeline** | Determinístico (sem LLM, apenas regras) |
| **Banco de dados** | Nenhum (processamento em memória) |
| **Precificação** | Determinística com FAR regional (1.0 / 0.90 / 0.80) |
| **BDI** | Fixo em 28% (constante) |
| **Testes** | 36 testes passando (vitest) |
| **Integração** | Nenhuma (standalone) |
| **Status** | Backtest validado, não sincronizado |

---

## Bugs Corrigidos pelo Claude (8 Críticos)

### P0 — CRÍTICO

#### BUG 1: Duplicação de Itens
- **Causa:** Parser criava duplicatas do texto + respostas de perguntas
- **Solução Claude:** Dedup por chave exata + similaridade semântica (Jaccard + containment)
- **Status RR-Engine:** Parcialmente corrigido em v2.9.0 (CODEX P0-3)
- **Diferença:** Claude usa 3 camadas de dedup; RR-Engine usa apenas normalização

#### BUG 2: Preços SINAPI sem Fator Regional
- **Causa:** Preços nacionais sem ajuste para localização
- **Solução Claude:** FAR configurável (Capital 1.0 / Metro 0.90 / Interior 0.80)
- **Status RR-Engine:** Não implementado (usa preços SINAPI brutos)
- **Diferença:** Claude separa custo do empreiteiro (com FAR) de preço comercial (sem FAR)

### P1 — GRAVE

#### BUG 3: Logística Inventa Itens
- **Causa:** Módulo criava alimentação/andaime automaticamente
- **Solução Claude:** Flag `permitir_logistica_inferida = false` (default)
- **Status RR-Engine:** Corrigido em v2.11.0 (removido duration hardcoded)
- **Diferença:** Claude bloqueia completamente; RR-Engine estima por índices

#### BUG 4: Equipamentos Contados 2x
- **Causa:** Aparecem em orçamento + logística
- **Solução Claude:** Cross-check entre módulos
- **Status RR-Engine:** Não detectado (agentes independentes)
- **Diferença:** Claude valida deduplicação entre módulos

#### BUG 5: Hospedagem Usa 7 dias/semana
- **Causa:** Cálculo ignorava fins de semana
- **Solução Claude:** `dias_uteis_semana: 5` (configurável)
- **Status RR-Engine:** Não implementado
- **Diferença:** Claude força 5 dias; RR-Engine não valida

### P2 — MODERADO

#### BUG 6: Sub-itens Incompletos
- **Causa:** Headers sem decomposição completa
- **Solução Claude:** Valida presença de todos os componentes
- **Status RR-Engine:** Parcialmente (agente Orçamentista valida)
- **Diferença:** Claude usa matriz de validação; RR-Engine usa LLM

#### BUG 7: BDI Variável entre Rodadas
- **Causa:** BDI variava de 11,3% a 43,3%
- **Solução Claude:** BDI fixo em 28%
- **Status RR-Engine:** Corrigido em v2.9.0 (BDI dinâmico propagado)
- **Diferença:** Claude força constante; RR-Engine permite variação por agente

#### BUG 8: Contrapiso Sempre Aplicado
- **Causa:** Adicionava R$ 60/m² mesmo em reforma
- **Solução Claude:** Detecta tipo de obra (reforma vs obra nova)
- **Status RR-Engine:** Não implementado
- **Diferença:** Claude detecta automaticamente; RR-Engine não valida

---

## Dados de Validação (Backtest Bicuiba)

| Métrica | Valor Real | Engine Antigo | **Motor Claude** | **RR-Engine Atual** |
|---------|-----------|---------------|------------------|-------------------|
| Receita | R$ 110.214 | R$ 406.899 | **R$ 91.000** ✓ | ? (não testado) |
| Custo base | R$ 51.231 | — | **R$ 46.000** ✓ | ? (não testado) |
| Itens duplicados | 0 | ~20 | **0** ✓ | ? (não testado) |
| Itens inventados | 0 | vários | **0** ✓ | ? (não testado) |
| BDI | constante | 43,3% | **28% fixo** ✓ | 28% (dinâmico) |
| Testes | — | — | **36/36 ✓** | **359/359 ✓** |

---

## Decisão Estratégica: Integração vs Substituição

### Opção 1: Integrar Motor Claude no RR-Engine (Recomendado)

**Vantagem:** Combina determinismo do Claude com flexibilidade dos 10 agentes.

```typescript
// server/lib/deterministicEngine.ts (novo)
import { processMemorial } from '../engine/index'; // Motor Claude

// Em routers.ts, antes do pipeline de agentes:
const deterministicResult = await processMemorial(memorial, config);

// Usar como input para agentes (validação + refinamento)
const engineeringInput = {
  ...deterministicResult,
  // Agentes refinam, não recalculam
};
```

**Impacto:**
- ✓ Elimina 6 dos 8 bugs imediatamente
- ✓ Mantém flexibilidade dos agentes
- ✓ Reduz carga de LLM (menos chamadas)
- ✗ Requer refatoração do pipeline

**Esforço:** 2-3 dias

---

### Opção 2: Substituir Pipeline por Motor Claude

**Vantagem:** Simplicidade, determinismo total, 36 testes já validados.

```typescript
// Remover 10 agentes, usar apenas motor Claude
const result = await processMemorial(memorial, config);
return result; // Direto para PDF
```

**Impacto:**
- ✓ Elimina todos os 8 bugs
- ✓ Reduz complexidade (4 módulos vs 10 agentes)
- ✓ Testes já prontos (36 passando)
- ✗ Perde flexibilidade de refinamento
- ✗ Perde capacidade de análise qualitativa

**Esforço:** 1 dia (mas perda de features)

---

### Opção 3: Manter Ambos (Atual)

**Vantagem:** Sem risco, sem refatoração.

**Impacto:**
- ✓ RR-Engine continua funcionando
- ✓ Motor Claude disponível para futuros projetos
- ✗ Bugs do Claude não são corrigidos no RR-Engine
- ✗ Duplicação de código

**Esforço:** 0 dias

---

## Recomendação

**Opção 1 (Integração)** é a melhor estratégia:

1. **Copiar módulos Claude** para `server/lib/deterministicEngine/`
2. **Criar wrapper** que chama motor Claude antes do pipeline
3. **Validar com backtest** Bicuiba
4. **Manter agentes** para refinamento qualitativo
5. **Atualizar testes** para cobrir integração

**Timeline:**
- Fase 1 (hoje): Copiar + integrar motor Claude
- Fase 2 (amanhã): Validar com backtest
- Fase 3 (dia seguinte): Sincronizar para produção

---

## Próximos Passos

1. **Ler arquivo** `RELATORIO_IMPLEMENTACAO_RR_ENGINE.md` completo do Claude
2. **Copiar pasta `engine/`** da branch `claude/fix-rr-engine-backtest-A3gjo` para `/home/ubuntu/rr-engine/server/lib/deterministicEngine/`
3. **Criar integração** em `server/routers.ts`
4. **Testar com Bicuiba** (memorial + dados reais)
5. **Sincronizar para produção** via checkpoint

---

## Referências

- **Branch Claude:** `claude/fix-rr-engine-backtest-A3gjo` (juniu86/RR-Engenharia)
- **Relatório:** `RELATORIO_IMPLEMENTACAO_RR_ENGINE.md`
- **Testes:** `engine/__tests__/engine.test.ts` (36 testes)
- **Dados:** `backtest-bicuiba/dados-reais.json`
