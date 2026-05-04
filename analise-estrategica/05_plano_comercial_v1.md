# 05 — Plano comercial

**Versão:** v1
**Data:** 04/05/2026
**Premissa:** unit economics fechado (Entregável B). Achado-chave: plano mensal em obra grande tende a margem 0% — o pricing recomendado nesta v1 corrige isso.

---

## 1. Pricing recomendado

### 1.1 Estrutura proposta — três tiers + white-label

| Plano | Preço | Quota | Limite por orçamento | Público-alvo |
|---|---|---|---|---|
| Avulso | R$ 89,90 por orçamento | 1 unidade | sem limite | Engenheiro autônomo, validação inicial |
| Profissional | R$ 450/mês | 10 orçamentos | até 100 itens / 20k tokens de memorial | Construtora pequena (10-30 obras/ano) |
| Empresarial | R$ 990/mês | 25 orçamentos | até 300 itens / 50k tokens de memorial | Construtora média (30-100 obras/ano) |
| White-label | R$ 2.500/mês + R$ 30 por orçamento | ilimitado | sem limite | Escritório de engenharia consultiva |

### 1.2 Justificativa quantitativa

**Avulso (R$ 89,90).** Mantém o preço atual. Margem bruta saudável em todos os tamanhos de obra — 87% no pequeno, 74% no médio, 48% no grande (planilha de unit economics aba Cenários). Funciona como porta de entrada e validação.

**Profissional (R$ 450/mês = R$ 45 por orçamento).** Mantém preço de mercado, mas adiciona **limite explícito por tamanho de orçamento**. O achado da planilha mostra que sem limite, obra grande consome margem inteira (R$ 0,18 de sobra). Limite de 100 itens / 20k tokens cobre obra pequena/média confortavelmente, e quem precisar mais é direcionado para Empresarial. Para construtora típica de 10-30 obras/ano (~2-3 obras/mês ativas), 10 orçamentos cobre o pipeline.

**Empresarial (R$ 990/mês = R$ 39,60 por orçamento).** Plano novo. Construtoras médias com 30-100 obras/ano costumam ter pipeline de 8-15 propostas em paralelo, parte delas em obras grandes. R$ 990 por 25 orçamentos com limite de 300 itens / 50k tokens dá margem positiva mesmo no maior cenário. Custo LLM estimado por orçamento grande: R$ 43; receita líquida por orçamento alocada: R$ 38. **Margem fica negativa em ~R$ 5 por orçamento grande, compensada pelos pequenos/médios da mesma quota** (mix esperado: 60% pequeno, 30% médio, 10% grande).

**White-label (R$ 2.500/mês + R$ 30/orçamento).** Para escritórios de engenharia consultiva que querem revender com a marca deles. Cobertura: licença mensal cobre infra fixa + parte da margem; valor por orçamento é custo direto + 50% de margem. Lógica: o escritório agrega valor (curadoria de cliente, suporte presencial, customização de proposta) e o RR Engine fica como motor.

### 1.3 Comparação com a tabela do Entregável B

A planilha v1 mostra:

- Avulso/Pequeno: 87% margem ✅
- Avulso/Médio: 74% margem ✅
- Avulso/Grande: 48% margem ✅
- Mensal/Pequeno (R$ 45/orç): 79% margem ✅
- Mensal/Médio: 53% margem ✅
- Mensal/Grande: **0,4% margem ❌** — o problema que o Empresarial resolve

Empresarial muda o cenário: R$ 39,60 efetivo por orçamento × mix realista = ~R$ 12-18 de custo médio LLM, deixando R$ 22-28 de margem por orçamento. Atende construtora maior com receita previsível.

## 2. Auditoria competitiva

| Aspecto | OrçaFascio | Sienge eCustos | Compor 90 | ORSE | RR Engine |
|---|---|---|---|---|---|
| **Pricing público** | R$ 89-249/mês por usuário | R$ 600-2.000/mês | Licença vitalícia R$ 1.500-3.000 | Gratuito (governo SE) | R$ 89,90 avulso / R$ 450-2.500 mensal |
| **Modelo** | SaaS web | SaaS enterprise integrado a ERP | Desktop legado | Web pública | SaaS web com IA |
| **Base de preços** | SINAPI + curadoria própria | SINAPI + ERP integrado | SINAPI manual | SINAPI oficial | SINAPI + PINI atualizadas, IA + base de referência |
| **Velocidade de orçar** | 4-8h por orçamento | 2-4h (com integração ERP) | 8-12h (manual) | Variável (consulta livre) | 5-15 min via IA |
| **Geração de proposta** | Não automática | Sim, via template | Sim, via template | Não | Sim, automática (Jurídico + cláusulas estruturadas) |
| **Cronograma físico** | Manual | Sim, via Project | Manual | Não | Automático |
| **Memória de cálculo** | XLSX manual | Sim, integrada | Sim, formato proprietário | XLSX exportável | XLSX automática |
| **Base de clientes estimada** | 5-10 mil construtoras | 1.500-3.000 enterprise | 10-15 mil licenças vitalícias | Uso público (sem cobrança) | 0 (validação) |
| **Diferenciação declarada** | "Mais usado do Brasil" | "Integração ERP completa" | "Software consagrado" | "Padrão Sergipe" | "10 agentes de IA — proposta + memória + cronograma em horas" |
| **Ponto fraco aproveitável** | Sem IA, sem geração automática de proposta jurídica | Caro e enterprise demais para construtora pequena | Desktop legado, UX dos anos 2000 | Sem suporte, sem comercial, sem update | Marca nova, base de clientes zero |

### 2.1 Diferenciação posicional

OrçaFascio é o concorrente direto em pricing (R$ 89-249/mês). RR Engine vence pela velocidade (15 min vs 4-8h) e pela geração automática de proposta + cronograma (eles não têm). Ponto fraco do RR Engine vs OrçaFascio: marca, comunidade, suporte estabelecido.

Sienge é categoria diferente — vende para construtora grande integrada a ERP. RR Engine não compete com Sienge no enterprise; compete onde construtora média acha o Sienge caro demais.

Compor 90 e ORSE são legados. Construtora que ainda usa essas opções é alvo perfeito para RR Engine (eles têm dor de UX e atualização).

### 2.2 Posicionamento recomendado

**"O motor de orçamentação que pensa em horas o que sua equipe pensa em dias. Pipeline de 10 agentes especializados produz proposta comercial, memória de cálculo e cronograma físico a partir do memorial descritivo."**

Mensagens-âncora:
- Para construtora pequena: "Reduza o tempo de orçamento de 2 semanas para 2 horas."
- Para escritório de engenharia: "Multiplique sua capacidade de atender clientes sem aumentar a equipe."
- Para construtora média/grande: "Padronize a qualidade da proposta em todas as filiais."

## 3. 50 construtoras-alvo no eixo Rio-São Paulo

Lista de empresas de médio porte (estimativa de 10 a 50 obras/ano), conhecidas no mercado, que entram no perfil ideal de cliente Profissional ou Empresarial. **Os contatos específicos por nome de pessoa precisam ser confirmados antes do outreach** — instruções abaixo. Para cargos genéricos (Diretor de Engenharia, Sócio, Engenheiro de Custos), o canal LinkedIn Sales Navigator filtrando por empresa + cargo é o mais rápido.

### Como ler a tabela

- **Decisor provável** = cargo, não nome individual. Confirmar nome via LinkedIn Sales Navigator antes do toque 1.
- **Canal sugerido** = ordem recomendada de aproximação.
- **Fit estimado** = hipótese baseada em porte e perfil público; validar.

### Eixo Rio de Janeiro (25 empresas)

| # | Empresa | Cidade | Foco | Decisor provável | Canal sugerido | Fit |
|---|---|---|---|---|---|---|
| 1 | Carvalho Hosken | Rio de Janeiro | Residencial alto padrão, Olímpico | Diretor de Engenharia | LinkedIn Sales Navigator | Empresarial |
| 2 | João Fortes Engenharia | Rio de Janeiro | Residencial e comercial | Engenheiro Chefe | LinkedIn → e-mail | Empresarial |
| 3 | Concal Engenharia | Rio de Janeiro | Comercial, hospitalar | Diretor Técnico | LinkedIn → cold call | Empresarial |
| 4 | Calçada Engenharia | Rio de Janeiro | Residencial, retrofit | Sócio-fundador | LinkedIn | Profissional |
| 5 | Pollux Engenharia | Niterói | Comercial, industrial | Diretor de Custos | LinkedIn | Empresarial |
| 6 | Construtora Cota | Rio de Janeiro | Residencial popular | Diretor de Engenharia | LinkedIn → e-mail | Profissional |
| 7 | Brookfield (Rio operações) | Rio de Janeiro | Residencial premium | Gerente de Custos | LinkedIn Sales | Empresarial |
| 8 | Mozak | Rio de Janeiro | Residencial alto padrão | Sócio | LinkedIn | Profissional |
| 9 | Toledo Ferrari | Rio de Janeiro | Comercial, retrofit | Diretor de Engenharia | LinkedIn | Profissional |
| 10 | Construtora Senpar | Rio de Janeiro | Residencial popular MCMV | Engenheiro Chefe | E-mail via site | Empresarial |
| 11 | Construtora Tenda | Rio de Janeiro | Residencial popular | Gerente Regional Custos | LinkedIn Sales | Empresarial |
| 12 | LPS Brasil | Rio de Janeiro | Residencial, vendas | Diretor de Operações | LinkedIn | Profissional |
| 13 | RJZ Cyrela | Rio de Janeiro | Residencial premium | Engenheiro de Planejamento | LinkedIn Sales | Empresarial |
| 14 | Caenge Engenharia | Niterói | Residencial, comercial | Sócio-fundador | LinkedIn | Profissional |
| 15 | Concrejato | Rio de Janeiro | Industrial, infraestrutura | Diretor Técnico | LinkedIn | Empresarial |
| 16 | RR Engenharia (cliente interno) | Rio de Janeiro | Comercial, residencial | Você | direto | — |
| 17 | Bairro Carioca Construções | Rio de Janeiro | Residencial popular | Diretor | LinkedIn → e-mail | Profissional |
| 18 | Norte Sul Engenharia | Rio de Janeiro | Comercial, hospitalar | Engenheiro de Custos | LinkedIn | Profissional |
| 19 | Cyrela RJ | Rio de Janeiro | Residencial alto | Gerente de Custos | LinkedIn Sales | Empresarial |
| 20 | Construtora Patrimar (RJ ops) | Rio de Janeiro | Residencial mid | Diretor Comercial | LinkedIn | Profissional |
| 21 | Even (RJ ops) | Rio de Janeiro | Residencial premium | Engenheiro de Custos | LinkedIn | Empresarial |
| 22 | Construtora Tegra | Rio de Janeiro | Residencial alto | Gerente Regional | LinkedIn Sales | Empresarial |
| 23 | Construtora Plinio | Niterói | Residencial mid | Sócio | LinkedIn | Profissional |
| 24 | Construtora Direcional | Rio de Janeiro | Residencial popular | Diretor Regional | LinkedIn Sales | Empresarial |
| 25 | Construtora MRV (RJ ops) | Rio de Janeiro | Residencial popular | Gerente Regional | LinkedIn Sales | Empresarial |

### Eixo São Paulo (25 empresas)

| # | Empresa | Cidade | Foco | Decisor provável | Canal sugerido | Fit |
|---|---|---|---|---|---|---|
| 26 | Cury Construtora | São Paulo | Residencial popular | Gerente de Custos | LinkedIn Sales | Empresarial |
| 27 | Plano&Plano | São Paulo | Residencial popular MCMV | Diretor de Engenharia | LinkedIn → e-mail | Empresarial |
| 28 | Trisul | São Paulo | Residencial mid | Engenheiro de Custos | LinkedIn | Empresarial |
| 29 | Eztec | São Paulo | Residencial premium | Engenheiro de Custos | LinkedIn Sales | Empresarial |
| 30 | Mitre Realty | São Paulo | Residencial mid | Sócio-fundador | LinkedIn | Empresarial |
| 31 | Tarjab | São Paulo | Residencial premium | Diretor Técnico | LinkedIn | Profissional |
| 32 | Vitacon | São Paulo | Residencial compacto | Gerente de Custos | LinkedIn Sales | Empresarial |
| 33 | Lavvi | São Paulo | Residencial mid | Diretor de Operações | LinkedIn | Empresarial |
| 34 | Inpar (Viver) | São Paulo | Residencial mid | Engenheiro Chefe | LinkedIn | Profissional |
| 35 | One Innovation | São Paulo | Residencial premium | Sócio-fundador | LinkedIn | Profissional |
| 36 | Idea!Zarvos | São Paulo | Residencial alto padrão | Sócio | LinkedIn | Profissional |
| 37 | Construtora Stéfani | São Paulo | Comercial, retrofit | Sócio-fundador | LinkedIn | Profissional |
| 38 | Construtora Carmo (Construtora SP) | São Paulo | Residencial mid | Diretor de Engenharia | LinkedIn | Profissional |
| 39 | Yuny Incorporadora | São Paulo | Residencial premium | Engenheiro de Custos | LinkedIn | Empresarial |
| 40 | Construtora Setin | São Paulo | Residencial mid | Diretor Técnico | LinkedIn | Profissional |
| 41 | Tecnisa | São Paulo | Residencial mid-premium | Gerente de Custos | LinkedIn Sales | Empresarial |
| 42 | Adolpho Lindenberg | São Paulo | Residencial premium | Diretor Técnico | LinkedIn | Profissional |
| 43 | Hagaplan | São Paulo | Residencial mid | Sócio | LinkedIn | Profissional |
| 44 | Helbor Empreendimentos | São Paulo | Residencial mid-alto | Engenheiro de Custos | LinkedIn Sales | Empresarial |
| 45 | Esser Construtora | Campinas | Residencial mid | Diretor de Engenharia | LinkedIn | Profissional |
| 46 | Real Engenharia | Campinas | Residencial mid | Sócio-fundador | LinkedIn | Profissional |
| 47 | Construbase Engenharia | Campinas | Comercial | Diretor Técnico | LinkedIn | Profissional |
| 48 | OAS Construtora (SP ops) | São Paulo | Comercial e infraestrutura | Gerente de Orçamento | LinkedIn Sales | Empresarial |
| 49 | Construtora Maraponga | Sorocaba | Residencial mid | Sócio | LinkedIn | Profissional |
| 50 | A.Yoshii Engenharia | São Paulo | Comercial, retrofit | Diretor de Engenharia | LinkedIn | Empresarial |

### Como abordar a lista

1. **Priorizar por similaridade com você.** Construtoras de porte semelhante à RR Engenharia, mesmo eixo geográfico, mesma faixa de orçamento médio. Toques 1 e 2 dessa fatia primeiro.
2. **Validar contato antes do toque.** Para cada empresa, abra LinkedIn Sales Navigator (R$ 600/mês — vale a pena para 50+ contatos), filtre por empresa + cargo, identifique o decisor real, valide se está ativo (postou nos últimos 60 dias).
3. **Iniciar com 10 alvos por semana.** 50 contatos em 5 semanas é ritmo sustentável para um founder sem time comercial.
4. **Não fazer outbound em massa.** Cada toque deve ser personalizado para o decisor específico — copy abaixo é template, não spam.

## 4. Sequência outbound — 5 toques

Janela total: 4-5 semanas por contato. Espaçamento permite resposta sem ser invasivo.

### Toque 1 — E-mail frio (dia 0)

**Assunto:** Construtora [nome] — orçamento em horas, não em dias

```
Olá [primeiro nome],

Sou Reginaldo Rodrigues, sócio da RR Engenharia e founder do RR Engine. Vi que a [empresa] tem foco em [residencial popular / comercial / etc.] e que o ciclo típico de orçamento numa construtora deste porte costuma travar 2-4 dias da equipe técnica por proposta.

Construímos uma plataforma que recebe o memorial descritivo e devolve proposta comercial + memória de cálculo + cronograma físico em ~15 minutos. Pipeline de 10 agentes de IA com base SINAPI/PINI atualizada — não é template estático, é orçamento real auditado.

Você teria 20 minutos esta semana ou na próxima para uma demo? Posso fazer com um caso real seu — me manda um memorial qualquer (mesmo de obra antiga) que eu rodo na sua frente.

Reginaldo
RR Engenharia | RR Engine
[telefone] | [LinkedIn]
```

**Aviso:** se a empresa for direta concorrente da RR Engenharia (mesmo bairro, mesmo nicho), considere se faz sentido — venda interna pode gerar conflito.

### Toque 2 — LinkedIn (dia 5-7)

**Connect request com nota:**

```
Oi [nome], te mandei um e-mail recente sobre o RR Engine. Fiquei curioso pra saber como vocês orçamentam hoje na [empresa]. Adicionei como contato — se tiver 5 minutos pra trocar uma ideia, sigo daqui.
```

**Após aceitar:** comentar com substância em 1 ou 2 posts recentes do contato. Não pitch — só engagement orgânico para construir reconhecimento.

### Toque 3 — WhatsApp via referral (dia 10-14)

Identificar uma conexão em comum (LinkedIn 2nd degree). Pedir intro:

```
Oi [conexão], tudo bem? Você já trabalhou com [decisor] da [empresa] né? Estou rodando uma plataforma de orçamentação que acho que pode interessar — IA que faz orçamento em 15 min do memorial descritivo. Conseguiria me apresentar?
```

Se vier intro, a abertura no WhatsApp já é direta:

```
Oi [decisor], [conexão] me apresentou. Reginaldo da RR Engenharia. Sobre o RR Engine que comentei por e-mail — você teria 20 min essa semana?
```

### Toque 4 — E-mail follow-up com substância (dia 18-21)

**Assunto:** [empresa] orçamento em 15 min — caso real

```
[primeiro nome],

Não tive resposta ao e-mail anterior. Pra concretizar o que estou propondo, segue um caso real: a Reforma Vânia (REV08), uma reforma residencial de R$ 180k.

Anexo:
1. memorial descritivo recebido (PDF, 8 páginas)
2. proposta comercial gerada pelo RR Engine (PDF, 4 páginas)
3. memória de cálculo XLSX com 80+ itens
4. cronograma físico

Tempo de geração: 12 minutos. Feito por uma equipe de orçamentação tradicional, isso teria custado 16-20 horas de engenheiro.

Se quiser ver rodar com um memorial seu, me manda. Não cobro nada pela demo — só por orçamento gerado depois (R$ 89,90).

Reginaldo
```

**Anexos necessários:** os 3 documentos que existem no repo (memoria_calculo_Reforma_Vania, proposta_exemplo, cronograma) — todos sanitizados de dados pessoais.

### Toque 5 — E-mail breakup (dia 28-30)

**Assunto:** Última mensagem desta sequência

```
[primeiro nome],

Esse é o último contato desta sequência — não quero ser inconveniente.

Caso o timing não esteja bom agora, fico aberto para retomar quando fizer sentido. Se quiser receber atualizações ocasionais sobre o RR Engine (quando publicarmos cases novos ou updates de produto), responda esta com "ok".

Caso prefira sair definitivamente da minha lista, responda com "remover".

Obrigado pelo tempo,
Reginaldo
```

E-mails de breakup costumam ter taxa de resposta 4-7% acima dos toques anteriores — é a última chance de conversão e a mensagem é honesta.

## 5. Parcerias institucionais

### 5.1 CREA-RJ

**Estrutura proposta:** convênio que dá benefício para profissionais filiados.

- **Para o filiado:** desconto de 30% no plano Profissional ou Empresarial nos primeiros 6 meses (cupom institucional).
- **Para o CREA:** divulgação do convênio na newsletter mensal + visibilidade na seção "Vantagens para o filiado" do site.
- **Para o RR Engine:** acesso a ~20 mil profissionais filiados (engenheiros civis e arquitetos), credibilidade institucional, link de autoridade.

**Contato inicial:** Departamento de Desenvolvimento Profissional ou Comunicação. Pitch inicial via e-mail (`comunicacao@crea-rj.org.br` ou via diretoria), proposta de reunião de 30 min, follow-up via filiado da própria RR Engenharia se possível (caminho mais curto).

**Contrapartida do RR Engine:** webinar gratuito de 60 min para filiados sobre "Atualização das bases SINAPI/PINI e produtividade na engenharia de custos" — Reginaldo apresenta, CREA divulga.

### 5.2 Sinduscon-RJ

**Estrutura proposta:** parceria de visibilidade + benefício para sindicalizados.

- **Para sindicalizados:** primeiro mês grátis no plano Empresarial.
- **Para o Sinduscon:** patrocínio de evento/seminário (valor a negociar — começar em R$ 5-10k para presença em evento médio).
- **Para o RR Engine:** acesso a construtoras associadas (~150-200 no RJ), apresentação em eventos do calendário do sindicato, autoridade institucional.

**Contato inicial:** presidência do Sinduscon-RJ ou área de relacionamento com associados. Pedir reunião institucional.

**Contrapartida do RR Engine:** disponibilizar, em período fechado, demos exclusivas para 10-15 construtoras associadas selecionadas pelo Sinduscon.

### 5.3 IBAPE-RJ

**Estrutura proposta:** integração para peritos e avaliadores.

- **Para o associado:** módulo específico de avaliação rápida — entrada do imóvel + memorial sucinto, saída de estimativa de custo de obra (útil para laudos de avaliação patrimonial).
- **Para o IBAPE-RJ:** participação em curso/seminário do instituto sobre "tecnologia em avaliações imobiliárias".
- **Para o RR Engine:** público técnico engajado, vertical complementar (peritos não são target principal mas são influenciadores).

**Contato inicial:** secretaria do IBAPE-RJ. Pitch institucional por e-mail.

**Contrapartida do RR Engine:** licença anual gratuita para diretoria do IBAPE-RJ.

## 6. White-label para escritórios de engenharia

### 6.1 Estrutura comercial

**Modelo:** licença mensal + valor por orçamento gerado.

- **Licença mensal (R$ 2.500):** acesso ilimitado, marca do escritório no PDF da proposta, configurações personalizadas de BDI/impostos da empresa.
- **Por orçamento gerado (R$ 30):** custo direto de execução cobrado em cima.

Margem do RR Engine: ~40-50% após custos LLM e infra.
Margem do escritório (revendendo a R$ 150-200 por orçamento ao cliente final): ~75-80%.

### 6.2 Contrato-tipo (cláusulas-chave)

- **Vigência:** 12 meses, renovação automática por iguais períodos com aviso prévio de 60 dias.
- **Marca:** o escritório usa logomarca própria nos PDFs e XLSX gerados. Footer "Powered by RR Engine" mantém-se discreto, sem marca conflitante.
- **Suporte:** 1 canal direto WhatsApp/e-mail com SLA de 4h em horário comercial.
- **Confidencialidade:** dados de orçamentos do escritório não são compartilhados, agregados ou usados para treino — só persistem para auditoria interna do RR Engine (telemetria de uso).
- **Atualizações:** 100% das atualizações da plataforma incluídas. Mudanças de pricing aplicáveis após 90 dias de notificação.
- **Rescisão:** sem multa após o sexto mês. Antes disso, multa proporcional ao saldo restante.

### 6.3 Primeiros 5 alvos

| # | Escritório | Cidade | Foco | Decisor | Aproximação |
|---|---|---|---|---|---|
| 1 | Concremat Engenharia e Tecnologia | Rio de Janeiro | Consultoria, gerenciamento, orçamentação | Diretor de Operações | Apresentação institucional via CREA |
| 2 | Themag Engenharia | São Paulo | Consultoria infraestrutura | Sócio-diretor | LinkedIn + intro via Sinduscon |
| 3 | Maubertec Engenharia | São Paulo | Consultoria de obras públicas | Engenheiro Chefe | LinkedIn |
| 4 | Engenheiros Associados (escritório regional) | Niterói | Custos e orçamentação | Sócio-fundador | LinkedIn + indicação |
| 5 | DBO Engenharia | São Paulo | Estrutural e custos | Sócio | LinkedIn |

Estratégia de aproximação: oferecer 60 dias grátis de white-label em troca de feedback estruturado e direito de citar o escritório como cliente piloto em material comercial.

## 7. Plano de execução comercial — 90 dias

### Mês 1
- Definir Sales Navigator (R$ 600) ou usar busca grátis do LinkedIn por 30 dias.
- Validar contatos das 25 primeiras construtoras-alvo (10/semana).
- Disparar Toque 1 para os 25 contatos validados.
- Começar pitch institucional com CREA-RJ e Sinduscon-RJ (paralelo).

### Mês 2
- Continuar sequência outbound (Toques 2, 3, 4, 5 dos primeiros 25).
- Validar e iniciar outreach para os 25 da fase 2.
- Primeiras demos agendadas — esperar 3-8 demos por mês de outbound a frio.
- Webinar com CREA-RJ ou similar (se já fechado).

### Mês 3
- Fechar primeiros 2-5 clientes Profissionais.
- Iniciar conversa white-label com 5 escritórios.
- Começar fluxo de SEO (Entregável D, mês 1 de conteúdo).
- Ajustar copy do outbound com base em respostas reais (objeções recorrentes viram FAQ).

### Métricas de acompanhamento

- Taxa de resposta toque 1 (e-mail frio): meta 8-12%
- Taxa de demo agendada por toque: meta 3-5%
- Taxa de fechamento por demo: meta 25-40%
- Tempo médio de fechamento (toque 1 → assinatura): meta 30-45 dias para Profissional, 60-90 para Empresarial

### Esperado em 90 dias

- 50 toques iniciais disparados
- 5-8 demos realizadas
- 2-5 clientes Profissionais fechados (R$ 900-2.250 MRR)
- 0-1 contrato white-label fechado (R$ 2.500 MRR potencial)
- 1-2 parcerias institucionais iniciadas (sem receita direta, mas pipeline)

**MRR esperado fim do mês 3:** R$ 1.000 a R$ 5.000.
**MRR esperado fim do mês 6:** R$ 5.000 a R$ 15.000.
**MRR esperado fim do mês 12:** R$ 20.000 a R$ 50.000 (com SEO começando a contribuir).
**MRR esperado fim do mês 18:** R$ 50.000 a R$ 100.000 (escala via white-label + parcerias).

Esses números assumem founder dedicando 50-70% do tempo a vendas após produto consolidado pós-migração. Com tempo menor, dividir os números pela metade.

## 8. O que NÃO fazer

- **Não fazer outbound em massa antes de validar o produto com 1-2 clientes pagantes reais.** Risco de queimar lista boa antes de ter case study.
- **Não dar desconto agressivo no Avulso.** R$ 89,90 é o preço-âncora — descontos em mensal/empresarial são preferíveis.
- **Não vender white-label antes de ter caso de uso comprovado.** Escritório vai pedir referências — sem isso, perde credibilidade.
- **Não competir em preço com OrçaFascio.** Competir em velocidade e qualidade da proposta gerada.
- **Não prometer integração com sistemas de cliente nas primeiras 5 vendas.** Foque em valor standalone primeiro.

---

**Próximo entregável:** F (resumo executivo) consolida tudo em uma página: tese, decisões críticas, métricas de 90 dias, MRR mês 6/12/18.
