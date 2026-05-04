import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  MapPin,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CreditCard,
  ShieldAlert,
  CheckCircle2,
  ClipboardList,
  Building2,
  Wrench,
  Paintbrush,
  Zap,
  Droplets,
  HardHat,
  Copy
} from "lucide-react";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import Breadcrumbs from "@/components/Breadcrumbs";

// Templates de memorial descritivo
const MEMORIAL_TEMPLATES = [
  {
    id: "reforma_comercial",
    name: "Reforma Comercial",
    icon: Building2,
    description: "Lojas, escritorios, restaurantes",
    content: `1. SERVICOS PRELIMINARES
- Mobilizacao e instalacao de canteiro
- Tapumes e protecoes provisorias
- Demolicao de revestimentos existentes

2. INFRAESTRUTURA
- Regularizacao de piso (area aproximada: ___m2)
- Impermeabilizacao de areas molhadas

3. INSTALACOES ELETRICAS
- Substituicao de quadro de distribuicao
- Instalacao de pontos de iluminacao LED (quantidade: ___)
- Instalacao de tomadas e interruptores

4. INSTALACOES HIDRAULICAS
- Instalacao de pontos de agua fria e esgoto
- Instalacao de loucas e metais

5. ACABAMENTOS
- Pintura geral das paredes internas (area: ___m2)
- Instalacao de piso (tipo: ___, area: ___m2)
- Instalacao de forro (tipo: ___, area: ___m2)

6. FACHADA
- Pintura externa ou revestimento
- Instalacao de letreiro/identidade visual`,
  },
  {
    id: "manutencao_predial",
    name: "Manutencao Predial",
    icon: Wrench,
    description: "Condominios, edificios corporativos",
    content: `1. COBERTURA E IMPERMEABILIZACAO
- Reparo de telhado (area: ___m2)
- Impermeabilizacao de laje de cobertura
- Limpeza e desobstrucao de calhas e rufos

2. FACHADA
- Reparo de trincas e fissuras
- Pintura externa (area: ___m2)
- Rejuntamento de pastilhas/ceramica

3. AREAS COMUNS
- Pintura de halls e corredores (area: ___m2)
- Substituicao de piso em areas danificadas
- Reparos em forros de gesso

4. INSTALACOES ELETRICAS
- Revisao do quadro geral
- Substituicao de luminarias em areas comuns (quantidade: ___)
- Revisao de aterramento e DPS

5. INSTALACOES HIDRAULICAS
- Reparo de tubulacoes com vazamento
- Substituicao de registros e valvulas
- Limpeza de caixas d'agua

6. SISTEMA DE COMBATE A INCENDIO
- Recarga de extintores
- Revisao de mangueiras e hidrantes`,
  },
  {
    id: "pintura_geral",
    name: "Pintura e Acabamentos",
    icon: Paintbrush,
    description: "Residencial ou comercial",
    content: `1. PREPARACAO DE SUPERFICIES
- Lixamento e limpeza de paredes internas (area: ___m2)
- Lixamento e limpeza de paredes externas (area: ___m2)
- Aplicacao de massa corrida PVA interno (area: ___m2)
- Aplicacao de massa acrilica externo (area: ___m2)

2. PINTURA INTERNA
- Aplicacao de tinta latex PVA (2 demaos, area: ___m2)
- Pintura de teto com tinta latex (area: ___m2)
- Pintura de portas e batentes com esmalte sintetico (quantidade: ___)

3. PINTURA EXTERNA
- Aplicacao de tinta acrilica externa (2 demaos, area: ___m2)
- Pintura de grades e portoes com esmalte (area: ___m2)

4. ACABAMENTOS ESPECIAIS
- Textura projetada em areas especificas (area: ___m2)
- Pintura epoxy em pisos (area: ___m2)`,
  },
  {
    id: "eletrica",
    name: "Instalacoes Eletricas",
    icon: Zap,
    description: "Retrofit, ampliacao, nova instalacao",
    content: `1. QUADROS E DISJUNTORES
- Fornecimento e instalacao de quadro de distribuicao (circuitos: ___)
- Instalacao de disjuntores e barramentos
- Instalacao de DPS e DR

2. CABEAMENTO
- Instalacao de eletrodutos (metros lineares: ___)
- Passagem de cabos e fios (metros lineares: ___)
- Instalacao de eletrocalhas (metros lineares: ___)

3. PONTOS DE UTILIZACAO
- Pontos de iluminacao (quantidade: ___)
- Pontos de tomada 127V (quantidade: ___)
- Pontos de tomada 220V (quantidade: ___)
- Pontos para ar condicionado (quantidade: ___)

4. LUMINARIAS
- Fornecimento e instalacao de luminarias LED (quantidade: ___)
- Instalacao de arandelas e spots (quantidade: ___)

5. ATERRAMENTO
- Instalacao de malha de aterramento
- Interligacao de equipotencializacao

6. SPDA (se aplicavel)
- Instalacao de sistema de protecao contra descargas atmosfericas`,
  },
  {
    id: "hidraulica",
    name: "Instalacoes Hidraulicas",
    icon: Droplets,
    description: "Agua, esgoto, pluvial",
    content: `1. AGUA FRIA
- Instalacao de tubulacao PPR/PVC (metros lineares: ___)
- Pontos de agua fria (quantidade: ___)
- Instalacao de registro de pressao e gaveta
- Instalacao de reservatorio (capacidade: ___ litros)

2. AGUA QUENTE (se aplicavel)
- Instalacao de tubulacao CPVC/PPR (metros lineares: ___)
- Pontos de agua quente (quantidade: ___)
- Instalacao de aquecedor (tipo: ___)

3. ESGOTO
- Instalacao de tubulacao PVC esgoto (metros lineares: ___)
- Instalacao de caixas de inspecao (quantidade: ___)
- Instalacao de caixas sifonadas

4. AGUAS PLUVIAIS
- Instalacao de tubulacao de aguas pluviais (metros lineares: ___)
- Instalacao de calhas (metros lineares: ___)
- Instalacao de ralos e grelhas

5. LOUCAS E METAIS
- Instalacao de vasos sanitarios (quantidade: ___)
- Instalacao de lavatorios (quantidade: ___)
- Instalacao de torneiras e misturadores`,
  },
  {
    id: "obra_nova",
    name: "Obra Civil Completa",
    icon: HardHat,
    description: "Construcao nova ou grande reforma",
    content: `1. SERVICOS PRELIMINARES
- Mobilizacao e instalacao de canteiro
- Locacao da obra
- Movimento de terra (volume estimado: ___m3)

2. FUNDACAO
- Escavacao para fundacao
- Forma e concretagem de sapatas/radier (area: ___m2)
- Impermeabilizacao de fundacao

3. ESTRUTURA
- Alvenaria estrutural ou convencional (area: ___m2)
- Pilares e vigas (se concreto armado)
- Laje (tipo: ___, area: ___m2)

4. COBERTURA
- Estrutura de telhado em madeira ou metalica
- Telhas (tipo: ___, area: ___m2)
- Calhas e rufos

5. INSTALACOES ELETRICAS
- Quadro de distribuicao (circuitos: ___)
- Pontos de iluminacao (quantidade: ___)
- Pontos de tomada (quantidade: ___)

6. INSTALACOES HIDRAULICAS
- Pontos de agua fria (quantidade: ___)
- Pontos de esgoto (quantidade: ___)
- Reservatorio (capacidade: ___ litros)

7. REVESTIMENTOS
- Chapisco e reboco interno (area: ___m2)
- Revestimento ceramico em areas molhadas (area: ___m2)
- Contrapiso (area: ___m2)

8. ACABAMENTOS
- Pintura interna e externa (area total: ___m2)
- Piso (tipo: ___, area: ___m2)
- Forro (tipo: ___, area: ___m2)
- Esquadrias (quantidade: ___)`,
  },
];

const STEPS = [
  { id: 1, label: "Informacoes", icon: ClipboardList },
  { id: 2, label: "Localizacao", icon: MapPin },
  { id: 3, label: "Memorial", icon: FileText },
];

export default function NewProject() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    restrictions: "",
    memorialDescritivo: "",
  });

  const { data: budgetCheck, isLoading: budgetCheckLoading } = trpc.stripe.canCreateBudget.useQuery();
  // P1.5: bloqueia criação de projeto se config tributária estiver incompleta.
  // Bloquear na origem é melhor UX que deixar o usuário escrever o memorial
  // e tomar erro na hora de gerar.
  const { data: taxStatus } = trpc.settings.isTaxSettingsComplete.useQuery();
  const taxIncomplete = taxStatus !== undefined && !taxStatus.isComplete;

  const createProject = trpc.project.create.useMutation({
    onSuccess: (data) => {
      toast.success("Projeto criado com sucesso!");
      navigate(`/projects/${data.projectId}`);
    },
    onError: (error) => {
      toast.error("Erro ao criar projeto: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Nome do projeto e obrigatorio");
      return;
    }
    createProject.mutate(formData);
  };

  const applyTemplate = (templateId: string) => {
    const template = MEMORIAL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setFormData(prev => ({ ...prev, memorialDescritivo: template.content }));
      toast.success(`Template "${template.name}" aplicado! Preencha os campos com "___".`);
    }
  };

  const canAdvance = () => {
    if (currentStep === 1) return formData.name.trim().length > 0;
    if (currentStep === 2) return true; // location is optional
    return true;
  };

  const noBudget = !budgetCheckLoading && budgetCheck && !budgetCheck.allowed;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Novo Orcamento" },
        ]} />

        {/* P1.5: bloqueio quando config tributária está incompleta */}
        {taxIncomplete && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900" role="alert">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden>⚠️</span>
              <div className="flex-1">
                <p className="font-semibold">Configuração tributária incompleta</p>
                <p className="text-sm mt-1">
                  Configure os impostos da sua empresa em{" "}
                  <button
                    type="button"
                    className="underline font-medium"
                    onClick={() => navigate("/settings")}
                  >
                    Configurações → Empresa
                  </button>{" "}
                  antes de criar um novo orçamento.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Novo Orcamento</h1>
          <p className="text-muted-foreground">
            Siga os passos abaixo para criar seu orcamento
          </p>
        </div>

        {/* Credit alerts */}
        {!budgetCheckLoading && budgetCheck && !budgetCheck.allowed && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Sem creditos disponiveis</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>{budgetCheck.reason}</span>
              <Link href="/planos">
                <Button size="sm" variant="outline" className="mt-1">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Ver Planos e Precos
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {!budgetCheckLoading && budgetCheck && budgetCheck.allowed && (
          <Alert>
            <CreditCard className="h-4 w-4" />
            <AlertTitle>
              {budgetCheck.plan === "mensal"
                ? `Plano Profissional — ${budgetCheck.quotaUsed}/${budgetCheck.quotaLimit} orcamentos usados`
                : budgetCheck.plan === "avulso"
                ? `${budgetCheck.creditsAvailable} credito(s) avulso(s) disponivel(is)`
                : "Acesso administrativo"}
            </AlertTitle>
            <AlertDescription>
              {budgetCheck.plan === "mensal"
                ? "Cada orcamento criado consome 1 unidade da sua cota mensal."
                : budgetCheck.plan === "avulso"
                ? "Cada orcamento criado consome 1 credito avulso."
                : "Administradores podem criar orcamentos sem limite."}
            </AlertDescription>
          </Alert>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-between px-2">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  onClick={() => {
                    if (isCompleted || isActive) setCurrentStep(step.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                    isActive && "bg-primary/10 text-primary border border-primary/30",
                    isCompleted && "text-emerald-400 cursor-pointer hover:bg-emerald-500/10",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                    isActive && "bg-primary text-white",
                    isCompleted && "bg-emerald-500 text-white",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                  </div>
                  <div className="hidden sm:block">
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium hidden md:block">{step.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-px mx-3",
                    currentStep > step.id ? "bg-emerald-500" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Informacoes Basicas
                </CardTitle>
                <CardDescription>
                  Dados gerais do projeto. Apenas o nome e obrigatorio.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Projeto *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Reforma Posto Shell - BR 101"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descricao</Label>
                  <Textarea
                    id="description"
                    placeholder="Breve descricao do escopo do projeto..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Location */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Localizacao e Contexto
                </CardTitle>
                <CardDescription>
                  Informacoes opcionais que ajudam na precisao do orcamento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Localizacao</Label>
                  <Input
                    id="location"
                    placeholder="Ex: Sao Paulo - SP, Shopping Center Norte"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    A localizacao ajuda a selecionar precos regionais corretos da base de referencia.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restrictions" className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Restricoes e Condicoes Especiais
                  </Label>
                  <Textarea
                    id="restrictions"
                    placeholder="Ex: Trabalho noturno obrigatorio, acesso restrito de caminhoes, obra em funcionamento..."
                    value={formData.restrictions}
                    onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Restricoes afetam custos de logistica e mobilizacao.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Memorial Descritivo */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Template selector */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Memorial Descritivo
                  </CardTitle>
                  <CardDescription>
                    Escolha um template para comecar ou cole seu proprio memorial.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Template grid */}
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Iniciar com um template:</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {MEMORIAL_TEMPLATES.map((template) => {
                        const Icon = template.icon;
                        const isSelected = selectedTemplate === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyTemplate(template.id)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
                              "hover:border-primary/30 hover:bg-primary/5",
                              isSelected
                                ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                                : "border-border"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className={cn(
                                "text-sm font-medium",
                                isSelected && "text-primary"
                              )}>{template.name}</p>
                              <p className="text-xs text-muted-foreground">{template.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Memorial textarea */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="memorial">Conteudo do Memorial</Label>
                      {formData.memorialDescritivo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(formData.memorialDescritivo);
                            toast.success("Copiado!");
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id="memorial"
                      placeholder="Cole aqui seu memorial descritivo ou use um dos templates acima como ponto de partida..."
                      value={formData.memorialDescritivo}
                      onChange={(e) => {
                        setFormData({ ...formData, memorialDescritivo: e.target.value });
                        if (selectedTemplate) setSelectedTemplate(null);
                      }}
                      rows={18}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                    <p className="text-sm text-primary/80">
                      <strong>Dica:</strong> Quanto mais detalhado o memorial, mais preciso sera o orcamento.
                      Inclua quantidades, areas e especificacoes tecnicas quando disponiveis.
                      Substitua os campos com "___" pelos valores reais.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Summary card before submitting */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium">Resumo do projeto</p>
                      <p className="text-sm text-muted-foreground">
                        <strong>{formData.name || "Sem nome"}</strong>
                        {formData.location && ` — ${formData.location}`}
                      </p>
                      {formData.description && (
                        <p className="text-xs text-muted-foreground">{formData.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Memorial: {formData.memorialDescritivo ? `${formData.memorialDescritivo.length} caracteres` : "Vazio"}
                        {selectedTemplate && ` (template: ${MEMORIAL_TEMPLATES.find(t => t.id === selectedTemplate)?.name})`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-6">
            <div>
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(prev => prev - 1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
              )}
              {currentStep === 1 && (
                <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                  Cancelar
                </Button>
              )}
            </div>

            <div>
              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  disabled={!canAdvance()}
                  className="bg-primary hover:bg-primary/90"
                >
                  Proximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90"
                  disabled={
                    createProject.isPending ||
                    !!noBudget ||
                    !formData.name.trim() ||
                    taxIncomplete
                  }
                  title={
                    taxIncomplete
                      ? "Configure os impostos da sua empresa em Configurações antes de criar projetos."
                      : undefined
                  }
                >
                  {createProject.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      Criar Projeto
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
