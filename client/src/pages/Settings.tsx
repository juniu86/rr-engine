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
import { ArrowLeft, Building2, Calculator, Percent, Receipt, Save, RefreshCw, CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ESTADOS_BRASIL = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const REGIMES_TRIBUTARIOS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
];

export default function Settings() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  const { data: settings, isLoading, refetch } = trpc.settings.get.useQuery(undefined, {
    enabled: !!user,
  });
  
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error("Erro ao salvar: " + error.message);
    },
  });

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
    dataReferenciaPrecos: "2025/01",
  });

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
        dataReferenciaPrecos: settings.dataReferenciaPrecos || "2025/01",
      });
      // Carregar parcelas de faturamento
      if (settings.billingInstallments && Array.isArray(settings.billingInstallments)) {
        setInstallments(settings.billingInstallments as {name: string, percentage: number}[]);
      }
    }
  }, [settings]);

  // Presets de regime tributário
  const applyPreset = (preset: 'simples_nacional' | 'lucro_presumido' | 'lucro_real') => {
    const presets = {
      simples_nacional: {
        regimeTributario: 'simples_nacional',
        issPercentual: '3.00',
        pisPercentual: '0.00',
        cofinsPercentual: '0.00',
        irpjPercentual: '0.00',
        csllPercentual: '0.00',
        taxaLeisSociais: '68.00', // Menor encargo trabalhista
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

    const selectedPreset = presets[preset];
    setFormData(prev => ({
      ...prev,
      ...selectedPreset,
    }));

    const regimeLabels = {
      simples_nacional: 'Simples Nacional',
      lucro_presumido: 'Lucro Presumido',
      lucro_real: 'Lucro Real',
    };

    toast.success(`Preset "${regimeLabels[preset]}" aplicado! Clique em Salvar para confirmar.`);
  };

  // Funções para gerenciar parcelas de faturamento
  const addInstallment = () => {
    setInstallments(prev => [...prev, { name: `Parcela ${prev.length + 1}`, percentage: 0 }]);
  };

  const removeInstallment = (index: number) => {
    if (installments.length <= 2) {
      toast.error("Mínimo de 2 parcelas necessárias");
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
      '30-40-30': [{ name: 'Entrada', percentage: 30 }, { name: 'Intermediária', percentage: 40 }, { name: 'Final', percentage: 30 }],
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
    // Validar soma das parcelas
    const totalPercent = totalInstallmentPercentage();
    if (totalPercent !== 100) {
      toast.error(`A soma das parcelas deve ser 100%. Atual: ${totalPercent}%`);
      return;
    }
    
    updateSettings.mutate({
      ...formData,
      priceRegion: formData.priceRegion as "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO",
      regimeTributario: formData.regimeTributario as "simples_nacional" | "lucro_presumido" | "lucro_real",
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Configurações da Empresa</h1>
              <p className="text-sm text-muted-foreground">Impostos, BDI e parâmetros de orçamentação</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateSettings.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </header>

      <main className="container py-8">
        <Tabs defaultValue="empresa" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="empresa" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Empresa</span>
            </TabsTrigger>
            <TabsTrigger value="tributos" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Tributos</span>
            </TabsTrigger>
            <TabsTrigger value="faturamento" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Faturamento</span>
            </TabsTrigger>
            <TabsTrigger value="precos" className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              <span className="hidden sm:inline">Preços</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab: Empresa */}
          <TabsContent value="empresa">
            <Card>
              <CardHeader>
                <CardTitle>Dados da Empresa</CardTitle>
                <CardDescription>
                  Informações básicas da sua empresa para identificação nas propostas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Razão Social</Label>
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
                  <Label htmlFor="regimeTributario">Regime Tributário</Label>
                  <Select
                    value={formData.regimeTributario}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, regimeTributario: value }))}
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
                    O regime tributário afeta as alíquotas de PIS, COFINS e outros tributos
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Tributos */}
          <TabsContent value="tributos">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Configuração de Tributos</CardTitle>
                    <CardDescription>
                      Defina as alíquotas de impostos aplicáveis à sua empresa. Total atual: <strong>{totalTributos()}%</strong>
                    </CardDescription>
                  </div>
                </div>
                {/* Preset Buttons */}
                <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground mr-2 self-center">Presets:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset('simples_nacional')}
                    className={formData.regimeTributario === 'simples_nacional' ? 'border-green-500 bg-green-500/10' : ''}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Simples Nacional
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset('lucro_presumido')}
                    className={formData.regimeTributario === 'lucro_presumido' ? 'border-primary bg-primary/10' : ''}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Lucro Presumido
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset('lucro_real')}
                    className={formData.regimeTributario === 'lucro_real' ? 'border-blue-500 bg-blue-500/10' : ''}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Lucro Real
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="iss">ISS - Imposto Sobre Serviços (%)</Label>
                    <Input
                      id="iss"
                      type="number"
                      step="0.01"
                      min="0"
                      max="5"
                      value={formData.issPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, issPercentual: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Típico: 2% a 5%</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pis">PIS (%)</Label>
                    <Input
                      id="pis"
                      type="number"
                      step="0.01"
                      min="0"
                      max="2"
                      value={formData.pisPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, pisPercentual: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Cumulativo: 0.65% | Não-cumulativo: 1.65%</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cofins">COFINS (%)</Label>
                    <Input
                      id="cofins"
                      type="number"
                      step="0.01"
                      min="0"
                      max="8"
                      value={formData.cofinsPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, cofinsPercentual: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Cumulativo: 3% | Não-cumulativo: 7.6%</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="irpj">IRPJ (%)</Label>
                    <Input
                      id="irpj"
                      type="number"
                      step="0.01"
                      min="0"
                      max="5"
                      value={formData.irpjPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, irpjPercentual: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Sobre faturamento presumido: ~1.2%</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="csll">CSLL (%)</Label>
                    <Input
                      id="csll"
                      type="number"
                      step="0.01"
                      min="0"
                      max="3"
                      value={formData.csllPercentual}
                      onChange={(e) => setFormData(prev => ({ ...prev, csllPercentual: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Sobre faturamento presumido: ~1.08%</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="leisSociais">Leis Sociais - LS (%)</Label>
                    <Input
                      id="leisSociais"
                      type="number"
                      step="0.01"
                      min="0"
                      max="150"
                      value={formData.taxaLeisSociais}
                      onChange={(e) => setFormData(prev => ({ ...prev, taxaLeisSociais: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Encargos trabalhistas: 80% a 130%</p>
                  </div>
                </div>

                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <p className="text-sm text-amber-200">
                    <strong>Importante:</strong> Os tributos configurados aqui são utilizados no cálculo do BDI e na 
                    precificação das propostas. Certifique-se de que os valores estão corretos para o regime tributário 
                    da sua empresa.
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
                    <CardTitle>Configuração de Parcelas</CardTitle>
                    <CardDescription>
                      Defina como o valor total será dividido em parcelas de faturamento.
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
                {/* Lista de Parcelas */}
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

                {/* Botão Adicionar Parcela */}
                <Button variant="outline" onClick={addInstallment} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Parcela
                </Button>

                {/* Aviso de Validação */}
                {totalInstallmentPercentage() !== 100 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-sm text-red-200">
                      <strong>Atenção:</strong> A soma das parcelas deve ser exatamente 100%.
                      Faltam <strong>{100 - totalInstallmentPercentage()}%</strong> para completar.
                    </p>
                  </div>
                )}

                {totalInstallmentPercentage() === 100 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-sm text-green-200">
                      <strong>✓ Válido:</strong> As parcelas somam 100% e estão prontas para uso.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Preços */}
          <TabsContent value="precos">
            <Card>
              <CardHeader>
                <CardTitle>Referência de Preços</CardTitle>
                <CardDescription>
                  Configure a região e data de referência para consultas SINAPI/PINI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priceRegion">Região de Preços</Label>
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
                      Os preços SINAPI variam por estado
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataReferencia">Data de Referência</Label>
                    <Input
                      id="dataReferencia"
                      placeholder="YYYY/MM"
                      value={formData.dataReferenciaPrecos}
                      onChange={(e) => setFormData(prev => ({ ...prev, dataReferenciaPrecos: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Formato: 2025/01 (ano/mês)
                    </p>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Dica:</strong> Mantenha a data de referência atualizada para garantir que os preços 
                    das composições estejam alinhados com o mercado atual.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
