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
  Zap
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
      description: "Sistema sequencial de IA: Engenheiro, Logística, Orçamentista, Tributário, Comercial, Gestão, Financeiro, Jurídico e Board"
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
            <Button size="lg" variant="outline" className="text-lg px-8 border-slate-600 text-slate-300 hover:bg-slate-800">
              Ver Demonstração
            </Button>
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

      {/* Agent Flow Section */}
      <section className="container py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Fluxo de Agentes Inteligentes
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            9 agentes especializados trabalham em cadeia para garantir 
            precisão e conformidade em cada etapa do orçamento.
          </p>
        </div>
        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500/0 via-amber-500/50 to-amber-500/0 -translate-y-1/2 hidden lg:block" />
          <div className="grid grid-cols-3 lg:grid-cols-9 gap-4">
            {[
              { num: 1, name: "Engenheiro", short: "ENG" },
              { num: 2, name: "Logística", short: "LOG" },
              { num: 3, name: "Orçamentista", short: "ORC" },
              { num: 4, name: "Tributário", short: "TRI" },
              { num: 5, name: "Comercial", short: "COM" },
              { num: 6, name: "Gestão", short: "GES" },
              { num: 7, name: "Financeiro", short: "FIN" },
              { num: 8, name: "Jurídico", short: "JUR" },
              { num: 9, name: "Board", short: "BRD" },
            ].map((agent) => (
              <div key={agent.num} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-amber-500 font-bold mb-2 relative z-10">
                  {agent.num}
                </div>
                <span className="text-xs text-slate-400 text-center hidden lg:block">{agent.name}</span>
                <span className="text-xs text-slate-400 text-center lg:hidden">{agent.short}</span>
              </div>
            ))}
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
            © 2024 RR Engenharia. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
