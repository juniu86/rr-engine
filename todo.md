# RR-Engine - TODO

## Banco de Dados e Estrutura
- [x] Schema para projetos/orçamentos
- [x] Schema para itens orçados com rastreabilidade
- [x] Schema para agentes e status de processamento
- [x] Schema para documentos gerados

## Sistema de Agentes
- [x] Agente 1: Engenheiro Técnico (Auditor)
- [x] Agente 2: Logística e Mobilização
- [x] Agente 3: Orçamentista & Suprimentos
- [x] Agente 4: Tributário (Fiscal)
- [x] Agente 5: Comercial (Estrategista)
- [x] Agente 6: Gestão de Projetos (Planejador)
- [x] Agente 7: Financeiro (Tesoureiro)
- [x] Agente 8: Jurídico (Protetor)
- [x] Agente 9: Board (Aprovação Final)

## Integrações
- [x] Integração SINAPI via Orcamentor (base de dados)
- [x] Integração PINI TCPO (base de dados)
- [x] Motor de análise com GPT/LLM

## Frontend
- [x] Upload e processamento de Memorial Descritivo
- [x] Dashboard de acompanhamento do fluxo
- [x] Visualização de status dos agentes em tempo real
- [x] Interface de loop de correção
- [x] Formulário de contexto da obra

## Cálculos e Análises
- [x] Cálculo de custos diretos (materiais/mão de obra)
- [x] Cálculo de custos indiretos (logística/mobilização)
- [x] Cálculo de impostos (ISS/ICMS)
- [x] Cronograma físico
- [x] Análise de fluxo de caixa
- [x] Alertas de capital de giro

## Geração de Documentos
- [x] Proposta Comercial (HTML/PDF)
- [x] Memória de Cálculo (CSV/Excel)
- [x] Sistema de rastreabilidade de fontes

## Qualidade
- [x] Testes unitários do sistema de agentes
- [x] Validação de conformidade com NBRs

## Bugs
- [x] Botão "Novo Orçamento" na Home redireciona para login desnecessáriamente (resolvido - era problema de sessão)
- [x] Erro "Cannot read properties of undefined (reading '0')" ao executar agente Engenheiro Técnico
- [x] Itens de orçamento não estão sendo salvos no banco após execução dos agentes (aba Orçamento vazia)
- [x] Fluxo de Caixa mostrando valores zerados (dados não sendo populados)
- [x] Aba Documentos sem botões para gerar Proposta Comercial e Memória de Cálculo
- [x] Valores zerados na Proposta Comercial (cálculo corrigido)

## Melhorias Solicitadas
- [x] Botão para baixar planilha aberta junto com a proposta comercial
- [x] Modal de detalhes do agente - clicar no card abre painel com conteúdo completo (observações, análises)
- [x] Corrigir Fluxo de Caixa zerado - dados não estão sendo exibidos
- [x] Corrigir exibição do BDI - mostrando 6000% quando deveria ser 55%

## Bugs Reportados
- [x] Fluxo de Caixa - saldo acumulado não está sendo calculado (mostrando R$ 0,00)
- [x] Proposta Comercial - planilha de custos não está sendo exibida ao gerar documento

## Melhorias v1.4
- [x] Board decisor - transformar de analista para decisor com relatório de decisões tomadas (não apenas observações)
- [x] Fluxo de Caixa - corrigir cálculo negativo e considerar adiantamento corretamente
- [x] Proposta Comercial - distribuir preço final proporcionalmente entre itens (não mostrar custos abertos)
- [x] Proposta Comercial - gerar em HTML com botão de imprimir/salvar PDF
- [x] Planilha de Custos - gerar em formato XLS (Excel 2003 XML)
- [x] Download conjunto - permitir baixar proposta e planilha simultaneamente

## Bugs Graves v1.4
- [x] Impostos zerados - Agente Tributário corrigido com prompt mais explícito sobre cálculo de alíquotas
- [x] Valor da proposta duplicado - adicionada validação para evitar duplicação de BDI (máximo 2.5x custo base)

## Melhorias v1.6
- [x] Agente Logística - calcular diárias baseado em índices SINAPI de homem-hora por unidade de serviço

## Revisão Crítica v1.7
- [x] Logística calculando mão de obra duplicada - Orçamentista já inclui na composição SINAPI
- [x] Bitributação - Tributário calcula impostos e Comercial aplica BDI que já inclui impostos
- [x] Cronograma genérico de 4 semanas - Gestão de Projetos deve calcular prazo real baseado em produtividade
- [x] Faturamento incorreto - Deve ser 40% adiantamento + 60% ao final do prazo real
- [x] Proposta mostrando custos em vez de preço cheio proporcional (regressão)
