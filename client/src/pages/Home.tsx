import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getLoginUrl } from "@/const";
import { 
  FileText, 
  Calculator, 
  Users, 
  TrendingUp, 
  Shield, 
  Clock,
  ArrowRight,
  Building2,
  Zap,
  ChevronRight
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";

// Hook para detectar quando elemento entra na viewport
function useInView(options = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isInView };
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { ref: agentsRef, isInView: agentsInView } = useInView();

  const features = [
    {
      icon: FileText,
      title: "Memorial Descritivo",
      description: "Upload e processamento inteligente de memoriais com extração automática de itens"
    },
    {
      icon: Users,
      title: "9 Agentes Especialistas",
      description: "Sistema sequencial de IA que analisa cada aspecto do orçamento"
    },
    {
      icon: Calculator,
      title: "Integração SINAPI/PINI",
      description: "Consulta automática de composições e preços de referência atualizados"
    },
    {
      icon: TrendingUp,
      title: "Análise Financeira",
      description: "Fluxo de caixa, cronograma físico e alertas de capital de giro"
    },
    {
      icon: Shield,
      title: "Rastreabilidade Total",
      description: "Cada item com fonte declarada: SINAPI, PINI ou cotação de mercado"
    },
    {
      icon: Clock,
      title: "Propostas em Minutos",
      description: "Geração automática de PDF comercial e planilha Excel detalhada"
    }
  ];

  const agents = [
    { 
      num: "01", 
      name: "Engenheiro Técnico", 
      desc: "Extrai e especifica itens do memorial",
      details: "Interpreta o memorial descritivo completo, identificando todos os serviços necessários com especificações técnicas, quantitativos e unidades de medida. Garante que nenhum item seja omitido.",
      output: "Lista técnica com todos os itens especificados"
    },
    { 
      num: "02", 
      name: "Orçamentista", 
      desc: "Precifica com bases SINAPI e PINI",
      details: "Consulta as bases de dados oficiais SINAPI e PINI para obter composições de custos atualizadas. Calcula custos de material e mão de obra para cada item com rastreabilidade de fonte.",
      output: "Planilha orçamentária com custos unitários"
    },
    { 
      num: "03", 
      name: "Logística", 
      desc: "Calcula custos indiretos e mobilização",
      details: "Estima custos de mobilização, frete, caçambas para entulho, aluguel de equipamentos e deslocamentos. Não inclui mão de obra direta (já calculada pelo Orçamentista).",
      output: "Custos logísticos e de mobilização"
    },
    { 
      num: "04", 
      name: "Tributário", 
      desc: "Classifica incidência fiscal",
      details: "Analisa cada item quanto à incidência de ISS, ICMS, PIS, COFINS e demais tributos aplicáveis. Utiliza as alíquotas configuradas nas preferências da empresa.",
      output: "Classificação fiscal por item"
    },
    { 
      num: "05", 
      name: "Comercial", 
      desc: "Aplica BDI e define preço de venda",
      details: "Aplica o BDI (Bonificação e Despesas Indiretas) configurado pela empresa sobre o custo base. Define o preço de venda final garantindo a margem de lucro desejada.",
      output: "Preço de venda por item"
    },
    { 
      num: "06", 
      name: "Gestão de Projetos", 
      desc: "Cria cronograma com produtividade",
      details: "Calcula o prazo de execução baseado em índices de produtividade SINAPI (Hh/unidade). Cria cronograma físico detalhado por atividade e semana.",
      output: "Cronograma físico em semanas"
    },
    { 
      num: "07", 
      name: "Financeiro", 
      desc: "Analisa fluxo de caixa",
      details: "Projeta o fluxo de caixa com faturamento 40% na entrada e 60% ao final do prazo. Identifica alertas de capital de giro e necessidade de financiamento.",
      output: "Fluxo de caixa e alertas"
    },
    { 
      num: "08", 
      name: "Jurídico", 
      desc: "Redige cláusulas contratuais",
      details: "Elabora a proposta comercial com cláusulas de objeto, preço, condições de pagamento, prazo, garantias e responsabilidades conforme padrões da construção civil.",
      output: "Texto da proposta comercial"
    },
    { 
      num: "09", 
      name: "Board", 
      desc: "Aprova e emite parecer final",
      details: "Revisa todos os outputs dos agentes anteriores, verifica consistência dos dados e emite parecer final de aprovação ou lista de ajustes necessários.",
      output: "Decisão final e observações"
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-8 w-8 text-amber-500" />
              <span className="text-xl font-bold text-white">RR-Engine</span>
            </div>
            <nav className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <span className="text-slate-400 text-sm">Olá, {user?.name || "Usuário"}</span>
                  <Link href="/dashboard">
                    <Button variant="default" className="bg-amber-600 hover:bg-amber-700">
                      Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button variant="default" className="bg-amber-600 hover:bg-amber-700">
                    Entrar
                  </Button>
                </a>
              )}
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="container py-24 text-center">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-amber-500 border border-amber-500/20">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Powered by AI</span>
            </div>
            <h1 className="mb-6 text-5xl font-bold tracking-tight text-white md:text-6xl">
              Sistema de Engenharia e{" "}
              <span className="text-amber-500">Viabilidade Econômica</span>
            </h1>
            <p className="mb-8 text-xl text-slate-400 max-w-2xl mx-auto">
              Transforme memoriais descritivos em propostas comerciais completas com 
              inteligência artificial. Precisão técnica, conformidade com NBRs e 
              total transparência.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link href="/projects/new">
                  <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-lg px-8">
                    Novo Orçamento
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-lg px-8">
                    Começar Agora
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
              <a href="#agentes">
                <Button size="lg" variant="outline" className="text-lg px-8 border-slate-700 text-slate-300 hover:bg-slate-800/50">
                  Ver Agentes
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Orçamentação Automatizada de Ponta a Ponta
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Do memorial descritivo à proposta comercial, cada etapa é processada 
              por agentes especializados com rastreabilidade total.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-amber-500 mb-2" />
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Agent Flow Section with Animations */}
        <section id="agentes" className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950" />
          
          <div className="container relative" ref={agentsRef}>
            <div className="text-center mb-16">
              <p className="text-amber-500 text-sm font-medium tracking-widest uppercase mb-3">
                Pipeline de Processamento
              </p>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                9 Agentes Especializados
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Cada orçamento passa por uma cadeia sequencial de especialistas em IA, 
                garantindo precisão e conformidade em cada etapa.
              </p>
            </div>

            {/* Elegant Agent Timeline with Animations */}
            <div className="max-w-5xl mx-auto">
              {/* Desktop: Horizontal Flow */}
              <div className="hidden lg:block">
                {/* Top row - agents 1-5 */}
                <div className="flex justify-between items-start mb-2">
                  {agents.slice(0, 5).map((agent, idx) => (
                    <Tooltip key={agent.num}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`flex flex-col items-center w-40 cursor-pointer transition-all duration-700 ${
                            agentsInView 
                              ? 'opacity-100 translate-y-0' 
                              : 'opacity-0 translate-y-8'
                          }`}
                          style={{ transitionDelay: `${idx * 100}ms` }}
                        >
                          <div className="text-5xl font-extralight text-slate-700 mb-2 tabular-nums hover:text-amber-500/70 transition-colors">
                            {agent.num}
                          </div>
                          <h3 className="text-white font-medium text-sm text-center mb-1">
                            {agent.name}
                          </h3>
                          <p className="text-slate-500 text-xs text-center leading-relaxed">
                            {agent.desc}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="bottom" 
                        className="max-w-xs bg-slate-800 border-slate-700 p-4"
                      >
                        <div className="space-y-2">
                          <p className="text-sm text-slate-300">{agent.details}</p>
                          <div className="flex items-center gap-2 text-xs text-amber-500 pt-2 border-t border-slate-700">
                            <ArrowRight className="h-3 w-3" />
                            <span>{agent.output}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                
                {/* Connection line */}
                <div className={`relative h-16 my-4 transition-all duration-1000 ${
                  agentsInView ? 'opacity-100' : 'opacity-0'
                }`} style={{ transitionDelay: '500ms' }}>
                  <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-slate-800 via-amber-500/30 to-slate-800" />
                  <div className="absolute top-1/2 left-[10%] right-[10%] flex justify-between -translate-y-1/2">
                    {[...Array(5)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full bg-amber-500/50 transition-all duration-500 ${
                          agentsInView ? 'scale-100' : 'scale-0'
                        }`}
                        style={{ transitionDelay: `${600 + i * 100}ms` }}
                      />
                    ))}
                  </div>
                  <div className="absolute right-[10%] top-1/2 w-8 h-8 border-r border-b border-amber-500/30 -translate-y-1/2 translate-x-4" />
                </div>

                {/* Bottom row - agents 6-9 (reversed for flow) */}
                <div className="flex justify-end items-start gap-8 pr-[10%]">
                  {agents.slice(5).reverse().map((agent, idx) => (
                    <Tooltip key={agent.num}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`flex flex-col items-center w-40 cursor-pointer transition-all duration-700 ${
                            agentsInView 
                              ? 'opacity-100 translate-y-0' 
                              : 'opacity-0 translate-y-8'
                          }`}
                          style={{ transitionDelay: `${800 + idx * 100}ms` }}
                        >
                          <div className="text-5xl font-extralight text-slate-700 mb-2 tabular-nums hover:text-amber-500/70 transition-colors">
                            {agent.num}
                          </div>
                          <h3 className="text-white font-medium text-sm text-center mb-1">
                            {agent.name}
                          </h3>
                          <p className="text-slate-500 text-xs text-center leading-relaxed">
                            {agent.desc}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top" 
                        className="max-w-xs bg-slate-800 border-slate-700 p-4"
                      >
                        <div className="space-y-2">
                          <p className="text-sm text-slate-300">{agent.details}</p>
                          <div className="flex items-center gap-2 text-xs text-amber-500 pt-2 border-t border-slate-700">
                            <ArrowRight className="h-3 w-3" />
                            <span>{agent.output}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>

              {/* Mobile/Tablet: Vertical List with Animations */}
              <div className="lg:hidden space-y-1">
                {agents.map((agent, idx) => (
                  <Tooltip key={agent.num}>
                    <TooltipTrigger asChild>
                      <div 
                        className={`group flex items-center gap-6 p-4 rounded-lg hover:bg-slate-800/30 transition-all duration-500 cursor-pointer ${
                          agentsInView 
                            ? 'opacity-100 translate-x-0' 
                            : 'opacity-0 -translate-x-8'
                        }`}
                        style={{ transitionDelay: `${idx * 80}ms` }}
                      >
                        <div className="text-4xl font-extralight text-slate-700 tabular-nums w-16 text-right group-hover:text-amber-500/70 transition-colors">
                          {agent.num}
                        </div>
                        <div className="h-px w-8 bg-slate-800 group-hover:bg-amber-500/50 transition-colors" />
                        <div className="flex-1">
                          <h3 className="text-white font-medium mb-0.5">
                            {agent.name}
                          </h3>
                          <p className="text-slate-500 text-sm">
                            {agent.desc}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-700 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="left" 
                      className="max-w-xs bg-slate-800 border-slate-700 p-4"
                    >
                      <div className="space-y-2">
                        <p className="text-sm text-slate-300">{agent.details}</p>
                        <div className="flex items-center gap-2 text-xs text-amber-500 pt-2 border-t border-slate-700">
                          <ArrowRight className="h-3 w-3" />
                          <span>{agent.output}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            {/* Stats with Animation */}
            <div className={`mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto transition-all duration-700 ${
              agentsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`} style={{ transitionDelay: '1200ms' }}>
              <div className="text-center">
                <div className="text-4xl font-light text-white mb-2">100%</div>
                <div className="text-slate-500 text-sm">Automático</div>
              </div>
              <div className="text-center border-x border-slate-800">
                <div className="text-4xl font-light text-white mb-2">SINAPI</div>
                <div className="text-slate-500 text-sm">Base de Preços</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-light text-white mb-2">NBR</div>
                <div className="text-slate-500 text-sm">Conformidade</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="container py-16">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 to-amber-700 p-12 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-800/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Pronto para Automatizar seus Orçamentos?
              </h2>
              <p className="text-amber-100/80 mb-8 max-w-2xl mx-auto text-lg">
                Reduza o tempo de elaboração de propostas de dias para minutos, 
                com precisão técnica e conformidade garantida.
              </p>
              {isAuthenticated ? (
                <Link href="/projects/new">
                  <Button size="lg" variant="secondary" className="text-lg px-8 bg-white text-amber-700 hover:bg-amber-50">
                    Criar Primeiro Orçamento
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" variant="secondary" className="text-lg px-8 bg-white text-amber-700 hover:bg-amber-50">
                    Começar Gratuitamente
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/50 py-8">
          <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-amber-500" />
              <span className="font-semibold text-white">RR Engenharia</span>
            </div>
            <p className="text-sm text-slate-600">
              © 2026 RR Engenharia. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
