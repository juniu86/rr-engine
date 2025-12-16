# Estrutura de Dados SINAPI - Orcamentor

## URL Base
- Pesquisa: `https://orcamentor.com/compositions/pesquisa/?q={termo}`
- Composição: `https://orcamentor.com/composicao/{codigo}/`

## Estrutura de Dados de uma Composição

### Dados Principais
- **Código SINAPI**: 102487
- **Descrição**: CONCRETO CICLÓPICO FCK = 15MPA, 30% PEDRA DE MÃO EM VOLUME REAL, INCLUSIVE LANÇAMENTO. AF_05/2021
- **Unidade**: M3
- **Preço Unitário**: R$ 624,00 / M3
- **Base de Referência**: SINAPI 09/2025 (Não Desonerado)

### Insumos e Composições (Tabela)
| Tipo | Código | Nome | Custo Unitário | Quantidade | Unidade | Custo Total |
|------|--------|------|----------------|------------|---------|-------------|
| C | 94963 | CONCRETO FCK = 15MPA... | 411,49 | 0,805 | M3 | 331,24 |
| C | 90587 | VIBRADOR DE IMERSÃO... | 0,56 | 0,6377 | CHI | 0,35 |
| C | 90586 | VIBRADOR DE IMERSÃO... | 1,37 | 0,2198 | CHP | 0,30 |
| C | 88316 | SERVENTE COM ENCARGOS | 30,84 | 6,4684 | H | 199,48 |
| C | 88309 | PEDREIRO COM ENCARGOS | 35,58 | 1,6702 | H | 59,42 |
| I | 4730 | PEDRA DE MAO OU PEDRA RACHAO | 73,11 | 0,4543 | M3 | 33,21 |

### Tipos de Itens
- **C**: Composição (serviço composto)
- **I**: Insumo (material)

### Caderno Técnico
- Itens necessários
- Equipamentos
- Quantificação
- Aferição
- Execução
- Complementares

## Categorias Disponíveis
- Canteiro de obras (CANT)
- Cobertura (COBE)
- Esquadrias/ferragens/vidros (ESQV)
- Fundações e estruturas (FUES)
- Impermeabilizações e proteções diversas (IMPE)
- Paredes/painéis (PARE)
- Pavimentação (PAVI)
- Pinturas (PINT)
- Pisos (PISO)
- Revestimento e tratamento de superfícies (REVE)
- Serviços preliminares (SERP)
- Serviços técnicos (SERT)
- Instalação elétrica/eletrificação e iluminação externa (INEL)
- Instalações especiais (INES)
- Instalações hidrossanitárias (INHI)
- Serviços diversos (SEDI)
- Assentamento de tubos e peças (ASTU)
- Custos horários de máquinas e equipamentos (CHOR)
- Drenagem/obras de contenção/poços de visita e caixas (DROP)
- Escoramento (ESCO)
- Ligações prediais água/esgoto/energia/telefone (LIPR)
- Movimento de terra (MOVT)
- Serviços empreitados (SEEM)
- Transportes, cargas e descargas (TRAN)
- Urbanização (URBA)
- Equipamentos (EQUI)

## Integração via Web Scraping
O site não possui API pública documentada. A integração será feita via:
1. Requisições HTTP para pesquisa
2. Parsing do HTML/Markdown retornado
3. Extração de dados estruturados das tabelas
