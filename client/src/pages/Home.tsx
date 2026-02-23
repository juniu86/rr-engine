import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getLoginUrl } from "@/const";
import RRLogo from "@/components/RRLogo";
import {
  FileText,
  Calculator,
  Users,
  TrendingUp,
  Shield,
  Clock,
  ArrowRight,
  Zap,
  ChevronRight,
  CheckCircle2,
  Truck,
  Receipt,
  DollarSign,
  CalendarDays,
  Wallet,
  Scale,
  UserCheck,
  ClipboardCheck
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
      title: "10 Agentes Especialistas",
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
      output: "Lista técnica com todos os itens especificados",
      icon: FileText,
      color: "text-sky-400"
    },
    { 
      num: "02", 
      name: "Orçamentista", 
      desc: "Precifica com bases SINAPI e PINI",
      details: "Consulta as bases de dados oficiais SINAPI e PINI para obter composições de custos atualizadas. Calcula custos de material e mão de obra para cada item com rastreabilidade de fonte.",
      output: "Planilha orçamentária com custos unitários",
      icon: Calculator,
      color: "text-emerald-400"
    },
    { 
      num: "03", 
      name: "Logística", 
      desc: "Calcula custos indiretos e mobilização",
      details: "Estima custos de mobilização, frete, caçambas para entulho, aluguel de equipamentos e deslocamentos. Não inclui mão de obra direta (já calculada pelo Orçamentista).",
      output: "Custos logísticos e de mobilização",
      icon: Truck,
      color: "text-amber-400"
    },
    { 
      num: "04", 
      name: "Tributário", 
      desc: "Classifica incidência fiscal",
      details: "Analisa cada item quanto à incidência de ISS, ICMS, PIS, COFINS e demais tributos aplicáveis. Utiliza as alíquotas configuradas nas preferências da empresa.",
      output: "Classificação fiscal por item",
      icon: Receipt,
      color: "text-purple-400"
    },
    { 
      num: "05", 
      name: "Comercial", 
      desc: "Aplica BDI e define preço de venda",
      details: "Aplica o BDI (Bonificação e Despesas Indiretas) configurado pela empresa sobre o custo base. Define o preço de venda final garantindo a margem de lucro desejada.",
      output: "Preço de venda por item",
      icon: DollarSign,
      color: "text-green-400"
    },
    { 
      num: "06", 
      name: "Gestão de Projetos", 
      desc: "Cria cronograma com produtividade",
      details: "Calcula o prazo de execução baseado em índices de produtividade SINAPI (Hh/unidade). Cria cronograma físico detalhado por atividade e semana.",
      output: "Cronograma físico em semanas",
      icon: CalendarDays,
      color: "text-blue-400"
    },
    { 
      num: "07", 
      name: "Financeiro", 
      desc: "Analisa fluxo de caixa",
      details: "Projeta o fluxo de caixa com faturamento 40% na entrada e 60% ao final do prazo. Identifica alertas de capital de giro e necessidade de financiamento.",
      output: "Fluxo de caixa e alertas",
      icon: Wallet,
      color: "text-teal-400"
    },
    { 
      num: "08", 
      name: "Jurídico", 
      desc: "Redige cláusulas contratuais",
      details: "Elabora a proposta comercial com cláusulas de objeto, preço, condições de pagamento, prazo, garantias e responsabilidades conforme padrões da construção civil.",
      output: "Texto da proposta comercial",
      icon: Scale,
      color: "text-indigo-400"
    },
    { 
      num: "09", 
      name: "Board", 
      desc: "Aprova e emite parecer final",
      details: "Revisa todos os outputs dos agentes anteriores, verifica consistência dos dados e emite parecer final de aprovação ou lista de ajustes necessários.",
      output: "Decisão final e observações",
      icon: UserCheck,
      color: "text-rose-400"
    },
    { 
      num: "10", 
      name: "Auditor", 
      desc: "Valida consistência matemática",
      details: "Executa validação cruzada entre todos os outputs dos agentes. Verifica se Preço Final = (Custo Direto + Logística) × (1 + BDI). Emite selo de auditoria: Aprovado, Com Alertas ou Rejeitado.",
      output: "Selo de auditoria e relatório",
      icon: ClipboardCheck,
      color: "text-cyan-400"
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-[oklch(0.12_0.02_250)]">
        {/* Header */}
        <header className="border-b border-white/5 bg-[oklch(0.12_0.02_250)]/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container flex h-16 items-center justify-between">
            <RRLogo size="md" />
            <nav className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <span className="text-slate-400 text-sm">Olá, {user?.name || "Usuário"}</span>
                  <Link href="/dashboard">
                    <Button variant="default" className="bg-primary hover:bg-primary/90">
                      Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </>
              ) : (
                <a href={getLoginUrl()}>
                  <Button variant="default" className="bg-primary hover:bg-primary/90">
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
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary border border-primary/20">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Powered by AI</span>
            </div>
            <h1 className="mb-6 text-5xl font-bold tracking-tight text-white md:text-7xl font-display">
              Engenharia e{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[oklch(0.70_0.14_195)] via-[oklch(0.65_0.17_160)] to-[oklch(0.75_0.15_70)]">
                Viabilidade Econômica
              </span>
            </h1>
            <p className="mb-10 text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Transforme memoriais descritivos em propostas comerciais completas com
              inteligência artificial. Precisão técnica, conformidade com NBRs e
              total transparência.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link href="/projects/new">
                  <Button size="lg" className="gradient-brand text-white border-0 text-lg px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                    Novo Orçamento
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="gradient-brand text-white border-0 text-lg px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                    Começar Agora
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
              <a href="#agentes">
                <Button size="lg" variant="outline" className="text-lg px-8 border-slate-700 text-slate-300 hover:bg-slate-800/50 hover:border-primary/30 transition-all">
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
              <Card key={index} className="bg-[oklch(0.18_0.012_250)] border-white/5 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
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
          <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.12_0.02_250)] via-[oklch(0.15_0.015_250)] to-[oklch(0.12_0.02_250)]" />
          
          <div className="container relative" ref={agentsRef}>
            <div className="text-center mb-16">
              <p className="text-primary text-sm font-medium tracking-widest uppercase mb-3">
                Pipeline de Processamento
              </p>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                10 Agentes Especializados
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Cada orçamento passa por uma cadeia sequencial de especialistas em IA, 
                garantindo precisão e conformidade em cada etapa.
              </p>
            </div>

            {/* Desktop: Grid Layout 5x2 */}
            <div className="hidden lg:block max-w-6xl mx-auto">
              {/* Top row - agents 1-5 */}
              <div className="grid grid-cols-5 gap-4 mb-4">
                {agents.slice(0, 5).map((agent, idx) => (
                  <Tooltip key={agent.num}>
                    <TooltipTrigger asChild>
                      <div 
                        className={`group flex flex-col items-center p-4 rounded-xl bg-[oklch(0.18_0.012_250)] border border-white/5 hover:border-primary/30 cursor-pointer transition-all duration-500 hover:shadow-lg hover:shadow-primary/10 ${
                          agentsInView 
                            ? 'opacity-100 translate-y-0' 
                            : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: `${idx * 80}ms` }}
                      >
                        <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform ${agent.color}`}>
                          <agent.icon className="w-6 h-6" />
                        </div>
                        <div className="text-2xl font-light text-slate-600 mb-1 tabular-nums group-hover:text-primary/70 transition-colors">
                          {agent.num}
                        </div>
                        <h3 className="text-white font-medium text-sm text-center mb-1">
                          {agent.name}
                        </h3>
                        <p className="text-slate-500 text-xs text-center leading-relaxed line-clamp-2">
                          {agent.desc}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="bottom" 
                      className="max-w-xs bg-[oklch(0.22_0.012_250)] border-white/10 p-4"
                    >
                      <div className="space-y-2">
                        <p className="text-sm text-slate-300">{agent.details}</p>
                        <div className="flex items-center gap-2 text-xs text-primary pt-2 border-t border-white/10">
                          <ArrowRight className="h-3 w-3" />
                          <span>{agent.output}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              
              {/* Connection line with arrow */}
              <div className={`relative h-12 my-2 transition-all duration-1000 ${
                agentsInView ? 'opacity-100' : 'opacity-0'
              }`} style={{ transitionDelay: '400ms' }}>
                <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />
                <div className="absolute top-1/2 right-[10%] w-6 h-6 border-r-2 border-b-2 border-primary/40 rotate-45 -translate-y-1/2 translate-x-3" />
              </div>

              {/* Bottom row - agents 6-10 */}
              <div className="grid grid-cols-5 gap-4">
                {agents.slice(5).map((agent, idx) => (
                  <Tooltip key={agent.num}>
                    <TooltipTrigger asChild>
                      <div 
                        className={`group flex flex-col items-center p-4 rounded-xl bg-[oklch(0.18_0.012_250)] border border-white/5 hover:border-primary/30 cursor-pointer transition-all duration-500 hover:shadow-lg hover:shadow-primary/10 ${
                          agentsInView 
                            ? 'opacity-100 translate-y-0' 
                            : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: `${500 + idx * 80}ms` }}
                      >
                        <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform ${agent.color}`}>
                          <agent.icon className="w-6 h-6" />
                        </div>
                        <div className="text-2xl font-light text-slate-600 mb-1 tabular-nums group-hover:text-primary/70 transition-colors">
                          {agent.num}
                        </div>
                        <h3 className="text-white font-medium text-sm text-center mb-1">
                          {agent.name}
                        </h3>
                        <p className="text-slate-500 text-xs text-center leading-relaxed line-clamp-2">
                          {agent.desc}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      className="max-w-xs bg-[oklch(0.22_0.012_250)] border-white/10 p-4"
                    >
                      <div className="space-y-2">
                        <p className="text-sm text-slate-300">{agent.details}</p>
                        <div className="flex items-center gap-2 text-xs text-primary pt-2 border-t border-white/10">
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
            <div className="lg:hidden space-y-2">
              {agents.map((agent, idx) => (
                <Tooltip key={agent.num}>
                  <TooltipTrigger asChild>
                    <div 
                      className={`group flex items-center gap-4 p-4 rounded-xl bg-[oklch(0.18_0.012_250)] border border-white/5 hover:border-primary/30 transition-all duration-500 cursor-pointer ${
                        agentsInView 
                          ? 'opacity-100 translate-x-0' 
                          : 'opacity-0 -translate-x-8'
                      }`}
                      style={{ transitionDelay: `${idx * 60}ms` }}
                    >
                      <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${agent.color}`}>
                        <agent.icon className="w-5 h-5" />
                      </div>
                      <div className="text-2xl font-light text-slate-600 tabular-nums w-10 text-center group-hover:text-primary/70 transition-colors">
                        {agent.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium mb-0.5 truncate">
                          {agent.name}
                        </h3>
                        <p className="text-slate-500 text-sm truncate">
                          {agent.desc}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-700 group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="left" 
                    className="max-w-xs bg-[oklch(0.22_0.012_250)] border-white/10 p-4"
                  >
                    <div className="space-y-2">
                      <p className="text-sm text-slate-300">{agent.details}</p>
                      <div className="flex items-center gap-2 text-xs text-primary pt-2 border-t border-white/10">
                        <ArrowRight className="h-3 w-3" />
                        <span>{agent.output}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Stats with Animation */}
            <div className={`mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto transition-all duration-700 ${
              agentsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`} style={{ transitionDelay: '1000ms' }}>
              <div className="text-center">
                <div className="text-4xl font-light text-white mb-2">100%</div>
                <div className="text-slate-500 text-sm">Automático</div>
              </div>
              <div className="text-center border-x border-white/10">
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

        {/* Pricing Section */}
        <section id="precos" className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.12_0.02_250)] via-[oklch(0.14_0.018_250)] to-[oklch(0.12_0.02_250)]" />
          <div className="container relative">
            <div className="text-center mb-16">
              <p className="text-primary text-sm font-medium tracking-widest uppercase mb-3">
                Planos e Preços
              </p>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Escolha o Modelo Ideal
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Assinatura mensal para operações recorrentes ou pagamento avulso por demanda.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Plano Mensal */}
              <div className="relative rounded-2xl bg-[oklch(0.18_0.012_250)] border border-primary/30 p-8 flex flex-col">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Mais Popular
                  </span>
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-1">Plano Profissional</h3>
                  <p className="text-slate-400 text-sm">Até 10 orçamentos por mês</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">R$ 450</span>
                  <span className="text-slate-400">/mês</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {[
                    "Até 10 orçamentos por mês",
                    "10 agentes de IA especializados",
                    "Integração SINAPI + PINI em tempo real",
                    "Exportação XLSX e PDF",
                    "Suporte prioritário",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-slate-300 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Custo por orçamento: <span className="text-primary font-medium">R$ 45,00</span></p>
                </div>
              </div>

              {/* Plano Avulso */}
              <div className="rounded-2xl bg-[oklch(0.18_0.012_250)] border border-white/10 p-8 flex flex-col">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-1">Orçamento Avulso</h3>
                  <p className="text-slate-400 text-sm">Pagamento único por demanda</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">R$ 89</span>
                  <span className="text-lg text-white">,90</span>
                  <span className="text-slate-400"> /orçamento</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {[
                    "1 orçamento completo",
                    "10 agentes de IA especializados",
                    "Integração SINAPI + PINI",
                    "Exportação XLSX e PDF",
                    "Histórico de interações",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-slate-300 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Sem compromisso mensal</p>
                </div>
              </div>
            </div>

            {/* CTA para planos */}
            <div className="text-center mt-12">
              {isAuthenticated ? (
                <Link href="/planos">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8">
                    Ver Detalhes e Assinar
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8">
                    Começar Agora
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="container py-16">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.38_0.10_220)] p-12 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[oklch(0.32_0.08_220)]/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Pronto para Automatizar seus Orçamentos?
              </h2>
              <p className="text-white/80 mb-8 max-w-2xl mx-auto text-lg">
                Reduza o tempo de elaboração de propostas de dias para minutos, 
                com precisão técnica e conformidade garantida.
              </p>
              {isAuthenticated ? (
                <Link href="/projects/new">
                  <Button size="lg" variant="secondary" className="text-lg px-8 bg-white text-primary hover:bg-white/90">
                    Criar Primeiro Orçamento
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" variant="secondary" className="text-lg px-8 bg-white text-primary hover:bg-white/90">
                    Começar Gratuitamente
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-8">
          <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
            <RRLogo size="sm" />
            <p className="text-sm text-slate-600">
              © 2026 RR Engenharia. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
