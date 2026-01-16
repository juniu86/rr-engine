import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  HardHat,
  Truck,
  Receipt,
  Briefcase,
  CalendarDays,
  Wallet,
  Scale,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  const features = [
    {
      icon: FileText,
      title: "Memorial Descritivo",
      description: "Upload e processamento inteligente de memoriais com extração automática de itens"
    },
    {
      icon: Users,
      title: "9 Agentes Especialistas",
      description: "Sistema sequencial de IA: Engenheiro, Orçamentista, Logística, Tributário, Comercial, Gestão, Financeiro, Jurídico e Board"
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

  const agentDetails = [
    {
      num: 1,
      name: "Engenheiro Técnico",
      icon: HardHat,
      color: "from-blue-500 to-blue-600",
      description: "Interpreta o memorial descritivo e extrai todos os itens de serviço com especificações técnicas detalhadas.",
      output: "Lista de itens técnicos com quantitativos"
    },
    {
      num: 2,
      name: "Orçamentista",
      icon: Calculator,
      color: "from-emerald-500 to-emerald-600",
      description: "Precifica cada item utilizando bases SINAPI e PINI, com composição de custos de material e mão de obra.",
      output: "Planilha orçamentária completa"
    },
    {
      num: 3,
      name: "Logística",
      icon: Truck,
      color: "from-orange-500 to-orange-600",
      description: "Calcula custos indiretos: mobilização, frete, caçambas, equipamentos e deslocamentos.",
      output: "Custos logísticos detalhados"
    },
    {
      num: 4,
      name: "Tributário",
      icon: Receipt,
      color: "from-red-500 to-red-600",
      description: "Classifica cada item quanto à incidência de ISS, ICMS e demais tributos aplicáveis.",
      output: "Classificação fiscal dos itens"
    },
    {
      num: 5,
      name: "Comercial",
      icon: Briefcase,
      color: "from-purple-500 to-purple-600",
      description: "Aplica BDI configurável e define o preço de venda final com margem de lucro.",
      output: "Preço de venda por item"
    },
    {
      num: 6,
      name: "Gestão de Projetos",
      icon: CalendarDays,
      color: "from-cyan-500 to-cyan-600",
      description: "Cria cronograma físico baseado em índices de produtividade SINAPI para cada atividade.",
      output: "Cronograma detalhado em semanas"
    },
    {
      num: 7,
      name: "Financeiro",
      icon: Wallet,
      color: "from-green-500 to-green-600",
      description: "Analisa fluxo de caixa com faturamento 40% entrada + 60% final, identificando alertas.",
      output: "Fluxo de caixa e alertas"
    },
    {
      num: 8,
      name: "Jurídico",
      icon: Scale,
      color: "from-indigo-500 to-indigo-600",
      description: "Redige a proposta comercial com cláusulas contratuais e condições de pagamento.",
      output: "Texto da proposta comercial"
    },
    {
      num: 9,
      name: "Board",
      icon: CheckCircle2,
      color: "from-amber-500 to-amber-600",
      description: "Revisa todos os outputs e emite parecer final de aprovação ou ajustes necessários.",
      output: "Decisão final e observações"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-amber-500" />
            <span className="text-xl font-bold text-white">RR-Engine</span>
          </div>
          <nav className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-slate-300 text-sm">Olá, {user?.name || "Usuário"}</span>
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
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-amber-500">
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
              <Button size="lg" variant="outline" className="text-lg px-8 border-slate-600 text-slate-300 hover:bg-slate-800">
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
            <Card key={index} className="bg-slate-800/50 border-slate-700 hover:border-amber-500/50 transition-colors">
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

      {/* Agent Flow Section - Redesigned */}
      <section id="agentes" className="py-20 bg-slate-800/30">
        <div className="container">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-amber-500 mb-4">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Pipeline de IA</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">
              9 Agentes Especializados
            </h2>
            <p className="text-slate-400 max-w-3xl mx-auto text-lg">
              Cada orçamento passa por uma cadeia de 9 agentes de inteligência artificial, 
              onde cada especialista contribui com sua expertise para garantir precisão, 
              conformidade e transparência em cada etapa do processo.
            </p>
          </div>

          {/* Visual Pipeline */}
          <div className="relative mb-16">
            {/* Connection Line */}
            <div className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 hidden lg:block" />
            
            {/* Agent Numbers */}
            <div className="flex flex-wrap justify-center gap-4 lg:gap-0 lg:justify-between">
              {agentDetails.map((agent, index) => (
                <div key={agent.num} className="flex flex-col items-center group">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${agent.color} flex items-center justify-center text-white font-bold shadow-lg shadow-${agent.color.split('-')[1]}-500/20 relative z-10 group-hover:scale-110 transition-transform`}>
                    {agent.num}
                  </div>
                  <span className="text-xs text-slate-400 mt-2 text-center max-w-[80px] leading-tight">
                    {agent.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Agent Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agentDetails.map((agent) => (
              <Card 
                key={agent.num} 
                className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:shadow-slate-900/50 group"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shadow-md`}>
                      <agent.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">#{agent.num}</span>
                        <CardTitle className="text-white text-base">{agent.name}</CardTitle>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-slate-400 text-sm mb-3">
                    {agent.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-500/10 rounded-md px-2 py-1.5">
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-medium">{agent.output}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Process Summary */}
          <div className="mt-12 bg-slate-800/50 rounded-xl border border-slate-700 p-6">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-amber-500 mb-1">100%</div>
                <div className="text-slate-400 text-sm">Processamento Automático</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-amber-500 mb-1">9</div>
                <div className="text-slate-400 text-sm">Especialistas em Cadeia</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-amber-500 mb-1">SINAPI/PINI</div>
                <div className="text-slate-400 text-sm">Bases de Preços Oficiais</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-16">
        <Card className="bg-gradient-to-r from-amber-600 to-amber-700 border-0">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Pronto para Automatizar seus Orçamentos?
            </h2>
            <p className="text-amber-100 mb-8 max-w-2xl mx-auto">
              Reduza o tempo de elaboração de propostas de dias para minutos, 
              com precisão técnica e conformidade garantida.
            </p>
            {isAuthenticated ? (
              <Link href="/projects/new">
                <Button size="lg" variant="secondary" className="text-lg px-8">
                  Criar Primeiro Orçamento
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="lg" variant="secondary" className="text-lg px-8">
                  Começar Gratuitamente
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-amber-500" />
            <span className="font-semibold text-white">RR Engenharia</span>
          </div>
          <p className="text-sm text-slate-500">
            © 2026 RR Engenharia. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
