# 06 — Resumo executivo

**Versão:** v1
**Data:** 04/05/2026
**Para:** Reginaldo (founder)

---

## Tese central

O RR Engine é defensável pelo **orquestrador**, não pela base de preço. SINAPI e PINI são commodity — qualquer concorrente pode usar. O que ninguém replica facilmente é o pipeline de 10 agentes especializados que produz proposta comercial, memória de cálculo e cronograma físico em ~15 minutos a partir de um memorial descritivo. Os entregáveis A a E confirmam: o produto está consolidado em qualidade (P0+P1 fechados), unit economics tem margem saudável no avulso e no Empresarial, mercado tem buracos competitivos exploráveis (OrçaFascio sem IA, Sienge enterprise demais, Compor 90 desktop legado, ORSE sem comercial). A janela de oportunidade nos próximos 12 meses é capturar construtoras médias do eixo Rio-São Paulo antes que algum concorrente acrescente IA ao stack atual.

Decisão estratégica derivada: parar de melhorar produto e começar a vender. P0+P1 e três P2 estão fechados; o produto não precisa de mais código antes de validar pricing com cliente real. Agora a alavanca é comercial e migração para fora do Manus, em paralelo.

---

## Três decisões críticas — próximas duas semanas

**1. Ativar pricing de três tiers + cap por tamanho de obra.** A planilha de unit economics mostra que o plano mensal atual (R$ 450 para 10 orçamentos) tem margem 0,4% em obra grande. A correção exige adicionar plano Empresarial (R$ 990/mês para 25 orçamentos com cap 300 itens) e implementar cap explícito de itens/tokens no plano Profissional. Sem isso, o primeiro cliente médio que assinar mensal e usar a quota em obras grandes destrói a margem do produto. Esforço: 1-2 dias de implementação no Stripe + frontend (entra como ticket P1.7 a criar). Decisão depende de você: aceita tiers conforme proposto no Entregável E ou ajusta?

**2. Disparar Fase 1 do plano de migração (landing site fora do Manus).** Subir `engine.rres.com.br` apontando para Vercel + landing institucional independente do app. 5-10 dias, custo R$ 3-53/mês. Permite começar SEO no mês 1 sem esperar pela reconstrução do app (4-7 semanas). Decisão: começa esta semana ou espera primeiro cliente comercial validar?

**3. Iniciar outbound para os primeiros 10 alvos da lista de 50 construtoras.** O plano comercial (Entregável E) tem copy pronto, sequência de 5 toques mapeada, e 50 contatos identificados. Sem demanda real, o produto não calibra pricing nem prioridades. Decisão: contratar Sales Navigator (R$ 600/mês) e começar fase 1 do outreach? Ou começar pelo CREA-RJ/Sinduscon-RJ com pitch de parceria institucional, que é mais lento mas constrói autoridade?

Recomendação consolidada: **(1) sim, (2) sim começa agora, (3) ambos em paralelo — outreach direto para 5 contatos validados + pitch institucional para CREA e Sinduscon na mesma semana**.

---

## Três métricas — próximos 90 dias

**1. Custo médio de LLM por orçamento em produção (R$).** Mede unit economics real. Telemetria do P0.3 já coleta. Estimativa atual da planilha: R$ 7,55 (pequeno), R$ 19,53 (médio), R$ 42,99 (grande). Meta: confirmar que a média ponderada fica abaixo de **R$ 25 por orçamento**. Frequência de leitura: semanal a partir do primeiro orçamento real. Ação se desvio > 30%: revisitar P1.1 (modelos) e considerar redução adicional para Haiku em mais agentes.

**2. Taxa de demo agendada por toque 1 (e-mail frio).** Mede qualidade do outbound. Padrão B2B SaaS para construção: 3-5%. Meta: **acima de 3%**. Frequência: mensal. Ação se abaixo de 2%: revisar copy, validar contatos, repensar segmentação. Ação se acima de 8%: aumentar volume de outbound.

**3. CAC (custo de aquisição de cliente) por cliente Profissional fechado.** Mede sustentabilidade da venda. Meta: **abaixo de R$ 1.500 por cliente fechado** (LTV/CAC > 3 em horizonte de 12 meses, considerando assinatura R$ 450/mês × 12 = R$ 5.400 LTV mínimo). Inclui Sales Navigator, tempo do founder valorizado a R$ 200/h, ferramentas. Frequência: mensal a partir do primeiro fechamento. Ação se acima de R$ 2.500: renegociar canal de aquisição, priorizar parcerias institucionais.

---

## Projeção de MRR

| Marco | MRR (faixa realista) | Pressuposto |
|---|---|---|
| Mês 3 | R$ 1.000 - R$ 5.000 | 2-5 clientes Profissional via outbound direto, fechados nas primeiras demos |
| Mês 6 | R$ 5.000 - R$ 15.000 | 10-20 clientes Profissional, primeiros 1-2 Empresarial, 1 white-label fechado |
| Mês 12 | R$ 20.000 - R$ 50.000 | 30-60 Profissional, 5-10 Empresarial, 2-3 white-label, SEO começando a contribuir 5-10 leads/mês |
| Mês 18 | R$ 50.000 - R$ 100.000 | Escala via white-label e parcerias institucionais; pipeline orgânico do SEO maduro |

Premissas: founder dedica 50-70% do tempo a vendas após Fase 2 da migração concluir (mês 4-5). Sem essa dedicação, dividir números pela metade. Sem migração para fora do Manus, manter o produto rodando no tenant tem efeito limitado em vendas porque o teto comercial fica aceitável até R$ 30-50k MRR — depois disso a dependência da Manus vira risco para clientes corporativos exigirem soberania de dados.

A faixa otimista (R$ 50-100k em 18 meses) é defensável se: (i) Fase 2 da migração concluir até mês 5, (ii) primeiros 2-3 cases públicos saírem até mês 6, (iii) parceria com pelo menos uma instituição (CREA-RJ ou Sinduscon-RJ) for fechada até mês 9, (iv) SEO começar a converter leads orgânicos a partir do mês 7-9.

---

## O que NÃO está nesta página

- Implementação técnica restante (P2.1, P2.4, P2.5) — sai do roadmap imediato; revisitar pós-migração.
- Validação cruzada dos entregáveis B, C e E em outros modelos LLM — incluso no plano original como `validacao_cross_AI.md`, gerar quando for útil.
- Análise de valuation atualizada — depende de MRR real e múltiplos de SaaS B2B brasileiro em 2026; revisitar quando MRR > R$ 20k.
- Decisão sobre TCPOWeb e fonte de scraping de PINI — rastreado em P1.4.1, ativar quando primeiro cliente cobrar atualização frequente da base.

---

## Próximo passo único

Pegar uma das três decisões críticas e executar nesta semana. Recomendação: **começar pela #2 (Fase 1 da migração)**, porque é independente do produto, tem prazo curto (5-10 dias), destrava SEO e dá um ativo público (landing site) para apoiar outbound. As outras duas (#1 pricing, #3 outbound) podem rodar em paralelo a partir da semana 2.
