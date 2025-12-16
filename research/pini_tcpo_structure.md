# Estrutura de Dados PINI TCPO

## Acesso
- URL: https://tcpoweb.pini.com.br
- Requer login com usuário e senha
- Credenciais salvas no navegador

## Bases de Dados Disponíveis
- TCPO BIM (codificação ABNT NBR-15965)
- TCPO PINI
- PREÇOS PINI
- DER_ES
- SINAPI
- NOVO_SICRO
- SEINFRA
- EMOP
- SIURB
- INFRAESTRUTURA

## Estrutura de Dados de uma Composição

### Dados Principais
- **Código**: 3R 10 61 10 00 00 00 05 24 (formato BIM)
- **Tipo**: SERVIÇO COMPOSTO
- **Unidade**: m²
- **Código Interno**: 22.150.000050.SER
- **Descrição**: Acabamento de superfície de concreto com desempenadeira mecânica elétrica

### Parâmetros Configuráveis
- **Região**: Aracaju, Belém, Belo Horizonte, Boa Vista, Brasília, Rio de Janeiro, etc.
- **Leis Sociais**: Digitada pelo usuário, Padrão, Desonerados (LEIS 12.884 e 12.973)
- **Data Preços**: 2025/10
- **Quantidade**: 1
- **LS (Leis Sociais)**: 128,23%
- **BDI**: 30%

### Composição (Tabela de Insumos)
| Código | Descrição | Un | Class | Coef | Preço unitário (R$) sem LS | Total (R$) sem taxas | Consumo |
|--------|-----------|-----|-------|------|---------------------------|---------------------|---------|
| 2N 36 16 25 12 34 | Servente | h | MOD | 0,01 | 9,79 | 0,10 | 0,01 |
| 3R 50 30 30 20 60 14 03 01 | Acabadora de superfície, elétrica, potência 2 HP 1,5 kW | h prod | EQH | 0,01 | 16,35 | 0,16 | 0,01 |

### Classificação de Itens
- **MOD**: Mão de Obra Direta
- **EQH**: Equipamento Hora

### Valores Totais
- Sem taxas: R$ 0,26
- Com taxas: R$ 0,73
- LS: R$ 0,30
- BDI: R$ 0,17

### Memorial Descritivo
- **Conteúdo do Serviço**: Descrição do que inclui o serviço
- **Critério de Medição**: Como medir (ex: "Pela área de piso executado")

## Funcionalidades
- Exportar para Excel
- Restaurar Preços
- Ajuste de Coeficiente
- Exibir composição detalhada (sem sub-composições)

## Integração
O site requer autenticação. A integração será feita via:
1. Sessão autenticada no navegador (cookies persistentes)
2. Web scraping das páginas de resultados
3. Parsing das tabelas HTML
4. Opção de exportação para Excel pode ser útil para dados em massa
