import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Calculator, Percent, Receipt, Save, RefreshCw, CreditCard, Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import Breadcrumbs from "@/components/Breadcrumbs";
import { cn } from "@/lib/utils";

const ESTADOS_BRASIL = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapa" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceara" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espirito Santo" },
  { value: "GO", label: "Goias" },
  { value: "MA", label: "Maranhao" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Para" },
  { value: "PB", label: "Paraiba" },
  { value: "PR", label: "Parana" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piaui" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondonia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "Sao Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const REGIMES_TRIBUTARIOS = [
  {
    value: "simples_nacional",
    label: "Simples Nacional",
    description: "Microempresas e EPPs com faturamento ate R$ 4,8M/ano. Aliquotas menores e simplificadas.",
  },
  {
    value: "lucro_presumido",
    label: "Lucro Presumido",
    description: "Empresas com faturamento ate R$ 78M/ano. Aliquotas intermediarias com base de calculo presumida.",
  },
  {
    value: "lucro_real",
    label: "Lucro Real",
    description: "Obrigatorio para faturamento acima de R$ 78M/ano. Aliquotas calculadas sobre o lucro efetivo.",
  },
];

// Presets de regime tributario
const PRESETS: Record<string, Record<string, string>> = {
  simples_nacional: {
    regimeTributario: 'simples_nacional',
    issPercentual: '3.00',
    pisPercentual: '0.00',
    cofinsPercentual: '0.00',
    irpjPercentual: '0.00',
    csllPercentual: '0.00',
    taxaLeisSociais: '68.00',
    adminCentralPercentual: '3.00',
    despesasFinanceirasPercentual: '0.50',
    riscosPercentual: '0.50',
    lucroPercentual: '8.00',
  },
  lucro_presumido: {
    regimeTributario: 'lucro_presumido',
    issPercentual: '5.00',
    pisPercentual: '0.65',
    cofinsPercentual: '3.00',
    irpjPercentual: '1.20',
    csllPercentual: '1.08',
    taxaLeisSociais: '128.23',
    adminCentralPercentual: '4.00',
    despesasFinanceirasPercentual: '1.00',
    riscosPercentual: '1.00',
    lucroPercentual: '8.00',
  },
  lucro_real: {
    regimeTributario: 'lucro_real',
    issPercentual: '5.00',
    pisPercentual: '1.65',
    cofinsPercentual: '7.60',
    irpjPercentual: '2.40',
    csllPercentual: '1.44',
    taxaLeisSociais: '128.23',
    adminCentralPercentual: '5.00',
    despesasFinanceirasPercentual: '1.50',
    riscosPercentual: '1.50',
    lucroPercentual: '10.00',
  },
};

export default function Settings() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const { data: settings, isLoading, refetch } = trpc.settings.get.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: hasCustomSettings } = trpc.settings.hasCustomSettings.useQuery();
  // P1.5: query usado para mostrar banner persistente quando a config
  // tributária está incompleta. Same source of truth do backend.
  const { data: taxStatus } = trpc.settings.isTaxSettingsComplete.useQuery(undefined, {
    enabled: !!user,
  });

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configuracoes salvas com sucesso!");
      refetch();
      // Exit wizard mode on successful save
      if (showSetupWizard) {
        setShowSetupWizard(false);
      }
    },
    onError: (error) => {
      toast.error("Erro ao salvar: " + error.message);
    },
  });

  // Setup wizard state
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estado para parcelas de faturamento
  const [installments, setInstallments] = useState<{name: string, percentage: number}[]>([
    { name: "Entrada", percentage: 40 },
    { name: "Final", percentage: 60 }
  ]);

  // Form state
  const [formData, setFormData] = useState({
    companyName: "",
    cnpj: "",
    priceRegion: "SP",
    taxaLeisSociais: "128.23",
    bdiPercentual: "25.00",
    lucroPercentual: "8.00",
    issPercentual: "5.00",
    pisPercentual: "0.65",
    cofinsPercentual: "3.00",
    irpjPercentual: "1.20",
    csllPercentual: "1.08",
    adminCentralPercentual: "4.00",
    despesasFinanceirasPercentual: "1.00",
    riscosPercentual: "1.00",
    regimeTributario: "lucro_presumido",
    // P1.5.1: faixa do Simples Nacional. "" = não selecionada.
    // Visível apenas quando regimeTributario === "simples_nacional".
    faixaSimples: "" as "" | "1" | "2" | "3" | "4" | "5" | "6",
    dataReferenciaPrecos: "2025/01",
  });

  // Show setup wizard for new users
  useEffect(() => {
    if (hasCustomSettings === false && !isLoading) {
      setShowSetupWizard(true);
    }
  }, [hasCustomSettings, isLoading]);

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        companyName: settings.companyName || "",
        cnpj: settings.cnpj || "",
        priceRegion: settings.priceRegion || "SP",
        taxaLeisSociais: settings.taxaLeisSociais || "128.23",
        bdiPercentual: settings.bdiPercentual || "25.00",
        lucroPercentual: settings.lucroPercentual || "8.00",
        issPercentual: settings.issPercentual || "5.00",
        pisPercentual: settings.pisPercentual || "0.65",
        cofinsPercentual: settings.cofinsPercentual || "3.00",
        irpjPercentual: settings.irpjPercentual || "1.20",
        csllPercentual: settings.csllPercentual || "1.08",
        adminCentralPercentual: settings.adminCentralPercentual || "4.00",
        despesasFinanceirasPercentual: settings.despesasFinanceirasPercentual || "1.00",
        riscosPercentual: settings.riscosPercentual || "1.00",
        regimeTributario: settings.regimeTributario || "lucro_presumido",
        faixaSimples: (settings.faixaSimples
          ? String(settings.faixaSimples)
          : "") as "" | "1" | "2" | "3" | "4" | "5" | "6",
        dataReferenciaPrecos: settings.dataReferenciaPrecos || "2025/01",
      });
      if (settings.billingInstallments && Array.isArray(settings.billingInstallments)) {
        setInstallments(settings.billingInstallments as {name: string, percentage: number}[]);
      }
    }
  }, [settings]);

  // Apply preset
  const applyPreset = (preset: string) => {
    const selected = PRESETS[preset];
    if (selected) {
      setFormData(prev => ({ ...prev, ...selected }));
      // Also auto-calculate BDI
      setTimeout(() => calculateBdi(), 50);
    }
  };

  // Calculate BDI from components
  const calculateBdi = () => {
    const adminCentral = parseFloat(formData.adminCentralPercentual) || 0;
    const despesasFinanceiras = parseFloat(formData.despesasFinanceirasPercentual) || 0;
    const riscos = parseFloat(formData.riscosPercentual) || 0;
    const lucro = parseFloat(formData.lucroPercentual) || 0;
    const iss = parseFloat(formData.issPercentual) || 0;
    const pis = parseFloat(formData.pisPercentual) || 0;
    const cofins = parseFloat(formData.cofinsPercentual) || 0;
    const irpj = parseFloat(formData.irpjPercentual) || 0;
    const csll = parseFloat(formData.csllPercentual) || 0;

    const tributos = (iss + pis + cofins + irpj + csll) / 100;
    const despesas = (adminCentral + despesasFinanceiras + riscos + lucro) / 100;

    const bdi = ((1 + despesas) / (1 - tributos)) - 1;
    const bdiPercentual = (bdi * 100).toFixed(2);

    setFormData(prev => ({ ...prev, bdiPercentual }));
    return bdiPercentual;
  };

  // Installment functions
  const addInstallment = () => {
    setInstallments(prev => [...prev, { name: `Parcela ${prev.length + 1}`, percentage: 0 }]);
  };

  const removeInstallment = (index: number) => {
    if (installments.length <= 2) {
      toast.error("Minimo de 2 parcelas necessarias");
      return;
    }
    setInstallments(prev => prev.filter((_, i) => i !== index));
  };

  const updateInstallment = (index: number, field: 'name' | 'percentage', value: string | number) => {
    setInstallments(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: field === 'percentage' ? Number(value) : value } : item
    ));
  };

  const totalInstallmentPercentage = () => {
    return installments.reduce((sum, item) => sum + item.percentage, 0);
  };

  const applyInstallmentPreset = (preset: '40-60' | '50-50' | '30-40-30') => {
    const presets = {
      '40-60': [{ name: 'Entrada', percentage: 40 }, { name: 'Final', percentage: 60 }],
      '50-50': [{ name: 'Entrada', percentage: 50 }, { name: 'Final', percentage: 50 }],
      '30-40-30': [{ name: 'Entrada', percentage: 30 }, { name: 'Intermediaria', percentage: 40 }, { name: 'Final', percentage: 30 }],
    };
    setInstallments(presets[preset]);
    toast.success(`Preset "${preset}" aplicado!`);
  };

  // Calculate total taxes
  const totalTributos = () => {
    const iss = parseFloat(formData.issPercentual) || 0;
    const pis = parseFloat(formData.pisPercentual) || 0;
    const cofins = parseFloat(formData.cofinsPercentual) || 0;
    const irpj = parseFloat(formData.irpjPercentual) || 0;
    const csll = parseFloat(formData.csllPercentual) || 0;
    return (iss + pis + cofins + irpj + csll).toFixed(2);
  };

  const handleSave = () => {
    const totalPercent = totalInstallmentPercentage();
    if (totalPercent !== 100) {
      toast.error(`A soma das parcelas deve ser 100%. Atual: ${totalPercent}%`);
      return;
    }

    // P1.5.1: validação client-side de faixaSimples antes do mutate.
    // Backend tambem valida (BAD_REQUEST), aqui dá feedback imediato.
    if (
      formData.regimeTributario === "simples_nacional" &&
      !formData.faixaSimples
    ) {
      toast.error(
        "Regime Simples Nacional exige seleção de faixa (1 a 6). Selecione na aba Tributos antes de salvar."
      );
      return;
    }

    updateSettings.mutate({
      ...formData,
      priceRegion: formData.priceRegion as any,
      regimeTributario: formData.regimeTributario as any,
      // Envia número quando regime é Simples; null caso contrário.
      faixaSimples:
        formData.regimeTributario === "simples_nacional" && formData.faixaSimples
          ? (parseInt(formData.faixaSimples, 10) as 1 | 2 | 3 | 4 | 5 | 6)
          : null,
      billingInstallments: JSON.stringify(installments),
    });
  };

  // Wizard save - applies preset and saves
  const handleWizardSave = () => {
    // Calculate BDI before saving
    const bdi = calculateBdi();

    const totalPercent = totalInstallmentPercentage();
    if (totalPercent !== 100) {
      toast.error(`A soma das parcelas deve ser 100%. Atual: ${totalPercent}%`);
      return;
    }

    // P1.5.1: wizard tambem valida faixaSimples quando regime e Simples
    if (
      formData.regimeTributario === "simples_nacional" &&
      !formData.faixaSimples
    ) {
      toast.error(
        "Regime Simples Nacional exige seleção de faixa (1 a 6) antes de salvar."
      );
      return;
    }

    updateSettings.mutate({
      ...formData,
      bdiPercentual: bdi,
      priceRegion: formData.priceRegion as any,
      regimeTributario: formData.regimeTributario as any,
      faixaSimples:
        formData.regimeTributario === "simples_nacional" && formData.faixaSimples
          ? (parseInt(formData.faixaSimples, 10) as 1 | 2 | 3 | 4 | 5 | 6)
          : null,
      billingInstallments: JSON.stringify(installments),
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  // ========== SETUP WIZARD (first-time experience) ==========
  if (showSetupWizard) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary border border-primary/20 mb-4">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Configuracao Rapida</span>
            </div>
            <h1 className="text-3xl font-bold">Vamos configurar sua empresa</h1>
            <p className="text-muted-foreground">
              3 passos simples. Todos os valores tecnicos serao preenchidos automaticamente.
            </p>
          </div>

          {/* Wizard step indicator */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                  wizardStep === step && "bg-primary text-white",
                  wizardStep > step && "bg-emerald-500 text-white",
                  wizardStep < step && "bg-muted text-muted-foreground"
                )}>
                  {wizardStep > step ? <CheckCircle2 className="h-4 w-4" /> : step}
                </div>
                {step < 3 && (
                  <div className={cn(
                    "w-16 h-px mx-2",
                    wizardStep > step ? "bg-emerald-500" : "bg-border"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Regime Tributario */}
          {wizardStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Qual o regime tributario da sua empresa?</CardTitle>
                <CardDescription>
                  Isso define automaticamente todas as aliquotas de impostos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {REGIMES_TRIBUTARIOS.map((regime) => (
                  <button
                    key={regime.value}
                    type="button"
                    onClick={() => {
                      applyPreset(regime.value);
                      setFormData(prev => ({ ...prev, regimeTributario: regime.value }));
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all",
                      "hover:border-primary/30 hover:bg-primary/5",
                      formData.regimeTributario === regime.value
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{regime.label}</p>
                        <p className="text-sm text-muted-foreground mt-1">{regime.description}</p>
                      </div>
                      {formData.regimeTributario === regime.value && (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Estado + Empresa */}
          {wizardStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Onde sua empresa atua?</CardTitle>
                <CardDescription>
                  Os precos SINAPI variam por estado. Tambem podemos identificar sua empresa nos documentos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Estado de atuacao principal</Label>
                  <Select
                    value={formData.priceRegion}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, priceRegion: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BRASIL.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label} ({estado.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Razao Social (opcional)</Label>
                    <Input
                      placeholder="Nome da empresa"
                      value={formData.companyName}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ (opcional)</Label>
                    <Input
                      placeholder="00.000.000/0000-00"
                      value={formData.cnpj}
                      onChange={(e) => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Margem de Lucro */}
          {wizardStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Qual sua margem de lucro desejada?</CardTitle>
                <CardDescription>
                  O BDI sera calculado automaticamente. Voce pode ajustar depois em configuracoes avancadas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Lucro esperado (%)</Label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="3"
                      max="20"
                      step="0.5"
                      value={formData.lucroPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, lucroPercentual: e.target.value }))}
                      className="flex-1 accent-primary"
                    />
                    <div className="w-20 text-center">
                      <span className="text-2xl font-bold text-primary">{formData.lucroPercentual}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>3% (conservador)</span>
                    <span>8-12% (mercado)</span>
                    <span>20% (agressivo)</span>
                  </div>
                </div>

                {/* Summary of what will be configured */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Configuracao automatica:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <span>Regime: <strong className="text-foreground">{REGIMES_TRIBUTARIOS.find(r => r.value === formData.regimeTributario)?.label}</strong></span>
                    <span>Estado: <strong className="text-foreground">{ESTADOS_BRASIL.find(e => e.value === formData.priceRegion)?.label}</strong></span>
                    <span>Impostos: <strong className="text-foreground">{totalTributos()}%</strong></span>
                    <span>Leis Sociais: <strong className="text-foreground">{formData.taxaLeisSociais}%</strong></span>
                    <span>Lucro: <strong className="text-foreground">{formData.lucroPercentual}%</strong></span>
                    <span>BDI estimado: <strong className="text-primary">{(() => {
                      const adminCentral = parseFloat(formData.adminCentralPercentual) || 0;
                      const despesasFinanceiras = parseFloat(formData.despesasFinanceirasPercentual) || 0;
                      const riscos = parseFloat(formData.riscosPercentual) || 0;
                      const lucro = parseFloat(formData.lucroPercentual) || 0;
                      const tributos = (parseFloat(formData.issPercentual) + parseFloat(formData.pisPercentual) + parseFloat(formData.cofinsPercentual) + parseFloat(formData.irpjPercentual) + parseFloat(formData.csllPercentual)) / 100;
                      const despesas = (adminCentral + despesasFinanceiras + riscos + lucro) / 100;
                      return (((1 + despesas) / (1 - tributos)) - 1).toFixed(2);
                    })()}%</strong></span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <div>
              {wizardStep > 1 ? (
                <Button variant="outline" onClick={() => setWizardStep(prev => prev - 1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setShowSetupWizard(false)}>
                  Pular e configurar depois
                </Button>
              )}
            </div>
            <div>
              {wizardStep < 3 ? (
                <Button onClick={() => setWizardStep(prev => prev + 1)} className="bg-primary hover:bg-primary/90">
                  Proximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleWizardSave}
                  disabled={updateSettings.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  {updateSettings.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar e Comecar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ========== FULL SETTINGS PAGE (returning users) ==========
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Configuracoes" },
        ]} />

        {/* P1.5/P1.5.1: banner com copy distinto por motivo de incompletude */}
        {taxStatus && !taxStatus.isComplete && (() => {
          const isFaixaMissing = taxStatus.reason === "simples_faixa_missing";
          const isNeverSaved = taxStatus.reason === "never_saved";
          return (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900" role="alert">
              <div className="flex items-start gap-3">
                <span className="text-xl" aria-hidden>⚠️</span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {isFaixaMissing
                      ? "Faixa do Simples Nacional pendente"
                      : isNeverSaved
                      ? "Configurações ainda não salvas"
                      : "Configuração tributária incompleta"}
                  </p>
                  <p className="text-sm mt-1">
                    {isFaixaMissing ? (
                      <>
                        Você selecionou regime <strong>Simples Nacional</strong> mas
                        ainda não escolheu a faixa (1 a 6). Selecione na aba{" "}
                        <strong>Tributos</strong> abaixo e salve para liberar a geração
                        de orçamentos.
                      </>
                    ) : isNeverSaved ? (
                      <>
                        Preencha os dados da empresa, regime tributário e alíquotas nas
                        abas abaixo e clique em <strong>Salvar Configurações</strong>.
                        Sem isso, orçamentos não podem ser gerados.
                      </>
                    ) : (
                      <>
                        Orçamentos não poderão ser gerados até que você complete a aba{" "}
                        <strong>Tributos</strong> abaixo.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl">Configuracoes</h1>
            <p className="text-muted-foreground">Impostos, BDI e parametros de orcamentacao</p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="gradient-brand text-white border-0">
            <Save className="h-4 w-4 mr-2" />
            {updateSettings.isPending ? "Salvando..." : "Salvar Configuracoes"}
          </Button>
        </div>
        <Tabs defaultValue="empresa" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
            <TabsTrigger value="empresa" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Empresa</span>
            </TabsTrigger>
            <TabsTrigger value="tributos" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Tributos</span>
            </TabsTrigger>
            <TabsTrigger value="bdi" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">BDI</span>
            </TabsTrigger>
            <TabsTrigger value="faturamento" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Faturamento</span>
            </TabsTrigger>
            <TabsTrigger value="precos" className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              <span className="hidden sm:inline">Precos</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab: Empresa */}
          <TabsContent value="empresa">
            <Card>
              <CardHeader>
                <CardTitle>Dados da Empresa</CardTitle>
                <CardDescription>
                  Informacoes basicas da sua empresa para identificacao nas propostas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Razao Social</Label>
                    <Input
                      id="companyName"
                      placeholder="Nome da empresa"
                      value={formData.companyName}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input
                      id="cnpj"
                      placeholder="00.000.000/0000-00"
                      value={formData.cnpj}
                      onChange={(e) => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="regimeTributario">Regime Tributario</Label>
                  <Select
                    value={formData.regimeTributario}
                    onValueChange={(value) =>
                      setFormData(prev => ({
                        ...prev,
                        regimeTributario: value,
                        // P1.5.1: ao mudar de regime para fora do Simples,
                        // zerar a faixa para evitar estado inconsistente.
                        faixaSimples:
                          value === "simples_nacional" ? prev.faixaSimples : "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o regime" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMES_TRIBUTARIOS.map((regime) => (
                        <SelectItem key={regime.value} value={regime.value}>
                          {regime.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O regime tributario afeta as aliquotas de PIS, COFINS e outros tributos
                  </p>
                </div>

                {/* P1.5.1: Faixa do Simples Nacional — visível só para esse regime */}
                {formData.regimeTributario === "simples_nacional" && (
                  <div className="space-y-2">
                    <Label htmlFor="faixaSimples">
                      Faixa do Simples Nacional <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.faixaSimples}
                      onValueChange={(value) =>
                        setFormData(prev => ({
                          ...prev,
                          faixaSimples: value as "" | "1" | "2" | "3" | "4" | "5" | "6",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a faixa (1 a 6)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Faixa 1 — Receita até R$ 180 mil</SelectItem>
                        <SelectItem value="2">Faixa 2 — Receita até R$ 360 mil</SelectItem>
                        <SelectItem value="3">Faixa 3 — Receita até R$ 720 mil</SelectItem>
                        <SelectItem value="4">Faixa 4 — Receita até R$ 1,8 milhão</SelectItem>
                        <SelectItem value="5">Faixa 5 — Receita até R$ 3,6 milhões</SelectItem>
                        <SelectItem value="6">Faixa 6 — Receita até R$ 4,8 milhões</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      A faixa determina as alíquotas efetivas aplicadas. Quando a receita
                      bruta acumulada nos últimos 12 meses ultrapassar a faixa atual,
                      atualize aqui — o sistema não detecta automaticamente.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Tributos */}
          <TabsContent value="tributos">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Configuracao de Tributos</CardTitle>
                    <CardDescription>
                      Defina as aliquotas de impostos aplicaveis a sua empresa. Total atual: <strong>{totalTributos()}%</strong>
                    </CardDescription>
                  </div>
                </div>
                {/* Preset Buttons */}
                <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground mr-2 self-center">Presets:</span>
                  {(['simples_nacional', 'lucro_presumido', 'lucro_real'] as const).map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                      className={formData.regimeTributario === preset ? 'border-primary bg-primary/10' : ''}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {REGIMES_TRIBUTARIOS.find(r => r.value === preset)?.label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[
                    { id: "iss", label: "ISS - Imposto Sobre Servicos (%)", key: "issPercentual", hint: "Tipico: 2% a 5%", max: "5" },
                    { id: "pis", label: "PIS (%)", key: "pisPercentual", hint: "Cumulativo: 0.65% | Nao-cumulativo: 1.65%", max: "2" },
                    { id: "cofins", label: "COFINS (%)", key: "cofinsPercentual", hint: "Cumulativo: 3% | Nao-cumulativo: 7.6%", max: "8" },
                    { id: "irpj", label: "IRPJ (%)", key: "irpjPercentual", hint: "Sobre faturamento presumido: ~1.2%", max: "5" },
                    { id: "csll", label: "CSLL (%)", key: "csllPercentual", hint: "Sobre faturamento presumido: ~1.08%", max: "3" },
                    { id: "leisSociais", label: "Leis Sociais - LS (%)", key: "taxaLeisSociais", hint: "Encargos trabalhistas: 80% a 130%", max: "150" },
                  ].map(field => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Input
                        id={field.id}
                        type="number"
                        step="0.01"
                        min="0"
                        max={field.max}
                        value={formData[field.key as keyof typeof formData]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <p className="text-sm text-amber-200">
                    <strong>Importante:</strong> Os tributos configurados aqui sao utilizados no calculo do BDI e na
                    precificacao das propostas.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: BDI */}
          <TabsContent value="bdi">
            <Card>
              <CardHeader>
                <CardTitle>Composicao do BDI</CardTitle>
                <CardDescription>
                  Bonificacao e Despesas Indiretas. BDI atual: <strong>{formData.bdiPercentual}%</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { id: "adminCentral", label: "Administracao Central (%)", key: "adminCentralPercentual", hint: "Tipico: 3% a 5%", max: "10" },
                    { id: "despesasFinanceiras", label: "Despesas Financeiras (%)", key: "despesasFinanceirasPercentual", hint: "Tipico: 0.5% a 2%", max: "5" },
                    { id: "riscos", label: "Riscos e Imprevistos (%)", key: "riscosPercentual", hint: "Tipico: 0.5% a 2%", max: "5" },
                    { id: "lucro", label: "Lucro Esperado (%)", key: "lucroPercentual", hint: "Tipico: 5% a 12%", max: "20" },
                  ].map(field => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Input
                        id={field.id}
                        type="number"
                        step="0.01"
                        min="0"
                        max={field.max}
                        value={formData[field.key as keyof typeof formData]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="bdiTotal">BDI Total (%)</Label>
                    <Input
                      id="bdiTotal"
                      type="number"
                      step="0.01"
                      value={formData.bdiPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, bdiPercentual: e.target.value }))}
                      className="text-lg font-bold"
                    />
                  </div>
                  <Button variant="outline" onClick={calculateBdi} className="mt-6">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Recalcular BDI
                  </Button>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Formula do BDI:</p>
                  <code className="text-xs bg-background px-2 py-1 rounded">
                    BDI = ((1 + AC + DF + R + L) / (1 - Tributos)) - 1
                  </code>
                  <p className="text-xs text-muted-foreground mt-2">
                    Onde: AC = Administracao Central, DF = Despesas Financeiras, R = Riscos, L = Lucro
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Faturamento */}
          <TabsContent value="faturamento">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Configuracao de Parcelas</CardTitle>
                    <CardDescription>
                      Defina como o valor total sera dividido em parcelas de faturamento.
                      Total atual: <strong className={totalInstallmentPercentage() === 100 ? 'text-green-500' : 'text-red-500'}>{totalInstallmentPercentage()}%</strong>
                    </CardDescription>
                  </div>
                </div>
                {/* Preset Buttons */}
                <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground mr-2 self-center">Presets:</span>
                  <Button variant="outline" size="sm" onClick={() => applyInstallmentPreset('40-60')}>
                    40/60
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyInstallmentPreset('50-50')}>
                    50/50
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyInstallmentPreset('30-40-30')}>
                    30/40/30
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {installments.map((installment, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="flex-1">
                        <Label htmlFor={`installment-name-${index}`} className="text-xs text-muted-foreground">Nome</Label>
                        <Input
                          id={`installment-name-${index}`}
                          value={installment.name}
                          onChange={(e) => updateInstallment(index, 'name', e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="w-32">
                        <Label htmlFor={`installment-percent-${index}`} className="text-xs text-muted-foreground">Percentual</Label>
                        <div className="flex items-center gap-1 mt-1">
                          <Input
                            id={`installment-percent-${index}`}
                            type="number"
                            min="0"
                            max="100"
                            value={installment.percentage}
                            onChange={(e) => updateInstallment(index, 'percentage', e.target.value)}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => removeInstallment(index)}
                        disabled={installments.length <= 2}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button variant="outline" onClick={addInstallment} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Parcela
                </Button>

                {totalInstallmentPercentage() !== 100 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-sm text-red-200">
                      <strong>Atencao:</strong> A soma das parcelas deve ser exatamente 100%.
                      Faltam <strong>{100 - totalInstallmentPercentage()}%</strong> para completar.
                    </p>
                  </div>
                )}

                {totalInstallmentPercentage() === 100 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-sm text-green-200">
                      <strong>Valido:</strong> As parcelas somam 100% e estao prontas para uso.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Precos */}
          <TabsContent value="precos">
            <Card>
              <CardHeader>
                <CardTitle>Referencia de Precos</CardTitle>
                <CardDescription>
                  Configure a regiao e data de referencia para consultas SINAPI/PINI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priceRegion">Regiao de Precos</Label>
                    <Select
                      value={formData.priceRegion}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, priceRegion: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_BRASIL.map((estado) => (
                          <SelectItem key={estado.value} value={estado.value}>
                            {estado.label} ({estado.value})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Os precos SINAPI variam por estado
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataReferencia">Data de Referencia</Label>
                    <Input
                      id="dataReferencia"
                      placeholder="YYYY/MM"
                      value={formData.dataReferenciaPrecos}
                      onChange={(e) => setFormData(prev => ({ ...prev, dataReferenciaPrecos: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Formato: 2025/01 (ano/mes)
                    </p>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Dica:</strong> Mantenha a data de referencia atualizada para garantir que os precos
                    das composicoes estejam alinhados com o mercado atual.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
