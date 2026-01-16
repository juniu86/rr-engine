# ANÁLISE DE INCONSISTÊNCIAS - Vania Esgoto REV06

## DADOS EXTRAÍDOS DOS DOCUMENTOS

### 1. Agentes (Print da Interface)
| Agente | Valor |
|--------|-------|
| Orçamentista | Direto: R$ 5.750,00 / Indireto: R$ 0,00 |
| Logística | Total: R$ 6.350,00 |
| Tributário | Total impostos: R$ 391,41 |
| Comercial | BDI: 30% / Preço: R$ 13.520,00 |
| Financeiro | Exposição máx: R$ 4.732,00 |

### 2. Planilha de Memória de Cálculo

**Aba Orçamento Detalhado:**
- Custo Direto: R$ 5.755,00
- Impostos: R$ 0,00 (ERRO - deveria ser R$ 391,41)
- BDI: R$ 3.165,25
- **Preço Final de Venda: R$ 8.920,25** (NÃO INCLUI LOGÍSTICA!)

**Aba Custos Logísticos:**
- Total Logística: R$ 6.350,00

**Aba Resumo:**
- Custo Direto: R$ 5.755,00
- Custos Logísticos: R$ 6.350,00
- Impostos: R$ 0,00
- BDI: R$ 3.165,25
- **Preço Final de Venda: R$ 8.920,25** (ERRADO - não soma logística!)

**Aba Fluxo de Caixa:**
- Despesas totais: R$ 13.520,00 (4 semanas x R$ 3.380)
- Receitas totais: R$ 13.520,00 (40% + 60%)

### 3. Proposta Comercial (PDF)
- **Valor Total da Proposta: R$ 8.920,25**
- Cláusula II menciona: "O valor total e irredutível dos serviços é de R$ 13.520,00"

## INCONSISTÊNCIAS IDENTIFICADAS

### ERRO 1: Preço Final não inclui Logística
- **Onde:** Aba "Orçamento Detalhado" linha 14 e Aba "Resumo"
- **Problema:** O "Preço Final de Venda" de R$ 8.920,25 é calculado apenas sobre o custo direto (R$ 5.755) + BDI (R$ 3.165,25)
- **Falta:** Os R$ 6.350,00 de logística não estão sendo somados ao preço final
- **Cálculo correto:** R$ 5.755 + R$ 6.350 + BDI = Base para preço de venda

### ERRO 2: Impostos zerados na planilha
- **Onde:** Aba "Orçamento Detalhado" e "Resumo"
- **Problema:** Mostra R$ 0,00 de impostos
- **Agente Tributário calculou:** R$ 391,41
- **Causa:** Os impostos do agente Tributário não estão sendo incluídos na planilha

### ERRO 3: BDI aplicado apenas sobre custo direto
- **Onde:** Cálculo do BDI
- **Problema:** BDI de 30% aplicado apenas sobre R$ 5.755 = R$ 1.726,50
- **Planilha mostra:** R$ 3.165,25 de BDI (55% sobre custo direto)
- **Deveria ser:** BDI sobre (Custo Direto + Logística) = R$ 12.105 x 30% = R$ 3.631,50

### ERRO 4: Proposta com valor errado
- **Onde:** PDF da Proposta Comercial
- **Problema:** Planilha de preços soma R$ 8.920,25
- **Cláusula II diz:** R$ 13.520,00
- **Inconsistência:** Dois valores diferentes no mesmo documento

### ERRO 5: Fluxo de Caixa com valores corretos mas planilha errada
- **Onde:** Aba "Fluxo de Caixa"
- **Problema:** Usa R$ 13.520 como receita total (valor correto do Comercial)
- **Mas:** A planilha de resumo mostra R$ 8.920,25 como preço de venda

## FLUXO DE CÁLCULO CORRETO

```
1. Custo Direto (Orçamentista): R$ 5.755,00
2. Custo Logística: R$ 6.350,00
3. CUSTO BASE TOTAL: R$ 12.105,00
4. Impostos (Tributário): R$ 391,41
5. CUSTO COM IMPOSTOS: R$ 12.496,41
6. BDI 30% sobre custo base: R$ 3.631,50
7. PREÇO FINAL DE VENDA: R$ 16.127,91

OU (se BDI já inclui impostos):
1. Custo Base Total: R$ 12.105,00
2. BDI 30%: R$ 3.631,50
3. PREÇO FINAL: R$ 15.736,50
```

## VALOR DO AGENTE COMERCIAL: R$ 13.520,00
- Custo Direto: R$ 5.755,00
- Logística: R$ 6.350,00
- Custo Total: R$ 12.105,00
- BDI aplicado: (13.520 - 12.105) / 12.105 = 11.7% (NÃO 30%!)

## CONCLUSÃO

O problema principal é que a **geração da planilha e da proposta** não está usando o valor calculado pelo Agente Comercial (R$ 13.520,00). Em vez disso, está recalculando o preço apenas com o custo direto do Orçamentista, ignorando:
1. Custos de Logística
2. Impostos do Tributário

O valor correto da proposta deveria ser **R$ 13.520,00** (conforme calculado pelo Comercial) ou até maior se o BDI de 30% for aplicado corretamente sobre a base total.
