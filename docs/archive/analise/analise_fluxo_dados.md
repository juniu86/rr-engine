# ANÁLISE DO FLUXO DE DADOS - RR Engine

## FLUXO ATUAL (COM ERROS)

### 1. Orçamentista
- **Input:** Memorial descritivo
- **Output:** budgetItems com custos diretos
- **Cálculo:** totalDirectCost = soma dos custos de materiais + mão de obra

### 2. Logística
- **Input:** budgetItems do Orçamentista
- **Output:** costs[] com custos logísticos
- **Cálculo:** totalLogisticsCost = soma dos custos logísticos

### 3. Tributário
- **Input:** budgetItems do Orçamentista
- **Output:** totalTaxes (para classificação fiscal)
- **NOTA:** Impostos são apenas para classificação, BDI já inclui tributos

### 4. Comercial
- **Input:** 
  - totalDirectCost (do Orçamentista)
  - totalIndirectCost (da Logística) ✅ CORRETO
  - totalTaxes (do Tributário - apenas para referência)
- **Cálculo:** 
  - custoBase = totalDirectCost + totalIndirectCost
  - finalPrice = custoBase × (1 + BDI)
- **Output:** finalPrice = R$ 13.520,00 ✅ CORRETO

### 5. Salvamento dos budgetItems (ERRO!)
```typescript
// Linhas 321-346 do routers.ts
const bdiPercent = 0.55; // BDI FIXO DE 55%!
const bdiAmount = totalCost * bdiPercent;
const finalPrice = totalCost + bdiAmount;
```
**PROBLEMA:** O BDI é aplicado APENAS sobre o custo direto dos itens, NÃO inclui logística!

### 6. Geração da Planilha (ERRO!)
```typescript
// Linhas 441-446 do documents.ts
const totalDirect = budgetItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
const totalFinal = budgetItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
const totalLogistics = logisticsCosts.reduce((sum, cost) => sum + Number(cost.totalCost || 0), 0);
```
**PROBLEMA:** totalFinal NÃO inclui totalLogistics!

### 7. Aba Resumo da Planilha (ERRO!)
```typescript
// Linha 677 do documents.ts
<Cell ss:StyleID="Total"><Data ss:Type="Number">${totalFinal}</Data></Cell>
```
**PROBLEMA:** Mostra totalFinal (R$ 8.920,25) que é apenas custo direto + BDI, sem logística!

## VALORES DO CASO "Vania Esgoto REV06"

| Componente | Valor | Fonte |
|------------|-------|-------|
| Custo Direto | R$ 5.755,00 | Orçamentista |
| Custo Logística | R$ 6.350,00 | Logística |
| **Custo Base Total** | **R$ 12.105,00** | Direto + Logística |
| Impostos (classificação) | R$ 391,41 | Tributário |
| BDI Configurado | 30% | Empresa |
| BDI Aplicado | R$ 3.631,50 | 30% de R$ 12.105 |
| **Preço Final Correto** | **R$ 15.736,50** | Base + BDI |

### O que o sistema está fazendo:
- Preço na planilha: R$ 8.920,25 (apenas custo direto R$ 5.755 + BDI 55%)
- Preço do Comercial: R$ 13.520,00 (correto, inclui logística)
- Diferença: R$ 4.599,75 (logística não incluída na planilha)

## ERROS IDENTIFICADOS

### ERRO 1: BDI aplicado apenas sobre custo direto
**Local:** routers.ts, linhas 321-346 e 524-549
**Problema:** Ao salvar budgetItems, aplica BDI fixo de 55% apenas sobre o custo direto de cada item
**Solução:** O BDI deve ser aplicado sobre (custo direto + custo logístico proporcional)

### ERRO 2: Planilha não soma logística ao preço final
**Local:** documents.ts, linhas 441-446 e 677
**Problema:** totalFinal é calculado apenas dos budgetItems, sem incluir logística
**Solução:** Preço final deve ser: totalDirect + totalLogistics + BDI sobre ambos

### ERRO 3: Proposta com dois valores diferentes
**Local:** documents.ts, função generateProposalHTML
**Problema:** Planilha de preços mostra R$ 8.920,25 mas cláusula II menciona R$ 13.520,00
**Solução:** Usar o mesmo valor em toda a proposta (o do agente Comercial)

### ERRO 4: BDI fixo de 55% ignorando configuração da empresa
**Local:** routers.ts, linhas 324 e 527
**Problema:** Usa `const bdiPercent = 0.55` em vez do BDI configurado pela empresa
**Solução:** Usar o BDI das configurações da empresa ou do agente Comercial

## SOLUÇÃO PROPOSTA

### Opção A: Distribuir logística proporcionalmente nos itens
1. Calcular peso de cada item: peso_i = custo_item / custo_total_direto
2. Distribuir logística: logistica_item = peso_i × totalLogistics
3. Novo custo do item: custo_item + logistica_item
4. Aplicar BDI sobre o novo custo

### Opção B: Usar preço do Comercial e distribuir proporcionalmente
1. Usar finalPrice do agente Comercial como preço total
2. Distribuir proporcionalmente entre os itens para a planilha
3. Manter logística como linha separada na memória de cálculo

### Opção C (RECOMENDADA): Corrigir o cálculo do preço final
1. Preço Final = (Custo Direto + Logística) × (1 + BDI)
2. Usar o valor do agente Comercial como fonte única de verdade
3. Atualizar planilha para mostrar o preço correto
4. Garantir consistência em todos os documentos

## IMPLEMENTAÇÃO

### Arquivos a modificar:
1. **server/routers.ts** - Corrigir cálculo do finalPrice nos budgetItems
2. **server/services/documents.ts** - Corrigir cálculo do preço final na planilha
3. **server/services/documents.ts** - Garantir que proposta use valor do Comercial

### Fórmula correta:
```
Custo Base = Custo Direto + Custo Logística
BDI = Custo Base × bdiPercentual
Preço Final = Custo Base + BDI
```

### Validação:
- Preço Final da Planilha = Preço do Agente Comercial
- Preço da Proposta = Preço do Agente Comercial
- Fluxo de Caixa = Baseado no Preço do Agente Comercial
