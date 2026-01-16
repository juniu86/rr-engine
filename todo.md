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

## Bug Crítico v1.8
- [x] Sistema interrompe leitura do memorial antes de processar todos os 9 grupos de serviços
- [x] Grupos omitidos: Estrutura, Cobertura, Instalações Hidráulicas e Elétricas
- [x] Critério de aceite: Proposta deve conter 100% dos itens do input

## Correções v1.9
- [x] Erro 500 no agente Board - "received bad response from upstream" (resumido payload)
- [x] Inverter ordem dos agentes Logística e Orçamentista (Orçamentista agora é 2º, Logística é 3º)

## Feature v1.10 - Sistema de Revisões do Memorial
- [x] Mostrar texto do memorial descritivo na interface do projeto
- [x] Campo de edição do memorial descritivo
- [x] Modal de confirmação ao editar memorial
- [x] Criar novo orçamento com nome "ORIGINAL_REV_XX" ao confirmar edição
- [x] Manter histórico de revisões vinculadas ao projeto original

## Bug v1.10.1
- [x] Erro 404 ao criar revisão de projeto - navegação para novo projeto falha (corrigido: /project/ -> /projects/)

## Feature v1.11 - Configuração Personalizada de Impostos e BDI por Empresa
- [x] Criar tabela company_settings no banco de dados
- [x] Campos: região de preços, taxa LS (leis sociais), BDI, lucro esperado, ISS, PIS, COFINS, IRPJ, CSLL
- [x] Endpoints CRUD para configurações de empresa
- [x] Interface de configuração no dashboard/perfil (/settings)
- [x] Integrar configurações nos agentes Comercial e Tributário
- [x] Atualizar geração de proposta para usar configurações do usuário

## Correção v1.12 - Remover Tipo de Contrato
- [x] Remover campo "Tipo de Contrato" do formulário de criação de projeto
- [x] Verificar e remover referências ao tipo de contrato nos agentes (evitar duplicação)
- [x] BDI e impostos devem vir apenas das configurações da empresa

## Auditoria e Melhorias v1.13
- [x] Auditoria técnica completa do código - identificar erros legados
- [x] Criar documentação detalhada do sistema (arquitetura, fluxo, componentes)
- [x] Redesign da página inicial - melhorar apresentação
- [x] Redesign da seção de agentes - visual mais profissional
- [x] Extrair relatório de usuários que acessaram o sistema
- [x] Extrair relatório de orçamentos gerados por usuário

## Redesign v1.14 - Seção de Agentes
- [x] Redesenhar seção de agentes com design sofisticado e profissional
- [x] Remover cores excessivas e criar visual elegante

## Feature v1.15 - Animações e Indicador de Progresso
- [x] Animação fade-in sequencial nos agentes ao rolar a página
- [x] Tooltips interativos com detalhes dos agentes
- [x] Indicador de progresso real na página de detalhes do projeto (Pipeline visual)

## Bug v1.15.1
- [x] Numeração dos agentes no Pipeline está incorreta - segunda linha mostra 08, 07, 06, 05 em vez de 06, 07, 08, 09

## Feature v1.16 - Melhorias Avançadas
- [x] Presets de Regime Tributário (Simples Nacional, Lucro Presumido, Lucro Real)
- [x] Dashboard Administrativo com métricas de usuários e projetos (/admin)
- [x] Comparativo de Revisões lado a lado com diferenças destacadas (/projects/:id/compare)

## Bug v1.16.1
- [x] Pipeline de Processamento - agentes 06 a 09 não têm espaçamento uniforme (corrigido com flex justify-between)

## Revisão v1.17 - Correções Críticas de Fluxo
- [x] Logística com popup de opcionais - itens opcionais identificados no output para seleção futura
- [x] Comercial ignorando custos de Logística - corrigido buildAgentInput para usar totalLogisticsCost
- [x] Gestão de Projetos com cronograma detalhado - reformulado para gerar relatório dia a dia com ações
- [x] Board crítico - implementado blockProposal, requiresUserConfirmation e validações obrigatórias

## Bug v1.17.1
- [x] Erro de JavaScript no frontend publicado - statusConfig não tinha os novos status (blocked, pending_confirmation)

## v1.18 - Novas Funcionalidades
- [x] Modal de confirmação do Board - exibir alertas quando status é "pending_confirmation" e pedir confirmação do usuário
- [x] Popup de itens opcionais da Logística - modal durante execução do agente para selecionar itens opcionais (placa de obra, tapume, etc.)
- [x] Exportação de cronograma em PDF - botão para gerar PDF do cronograma dia a dia com visualização Gantt
