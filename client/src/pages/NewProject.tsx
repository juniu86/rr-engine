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
  Loader2
} from "lucide-react";

export default function NewProject() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    restrictions: "",
    memorialDescritivo: "",
  });

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
      toast.error("Nome do projeto é obrigatório");
      return;
    }
    createProject.mutate(formData);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Novo Orçamento</h1>
          <p className="text-muted-foreground">
            Preencha as informações do projeto para iniciar o processamento
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Informações Básicas
              </CardTitle>
              <CardDescription>
                Dados gerais do projeto
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Breve descrição do escopo do projeto..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Localização e Contexto
              </CardTitle>
              <CardDescription>
                Informações sobre o local da obra e restrições
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location">Localização</Label>
                <Input
                  id="location"
                  placeholder="Ex: São Paulo - SP, Shopping Center Norte"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restrictions" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Restrições e Condições Especiais
                </Label>
                <Textarea
                  id="restrictions"
                  placeholder="Ex: Trabalho noturno obrigatório, acesso restrito de caminhões, obra em funcionamento..."
                  value={formData.restrictions}
                  onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Memorial Descritivo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Memorial Descritivo
              </CardTitle>
              <CardDescription>
                Cole o conteúdo do memorial descritivo ou descreva os serviços a serem orçados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="memorial">Conteúdo do Memorial</Label>
                <Textarea
                  id="memorial"
                  placeholder={`Ex:
1. SERVIÇOS PRELIMINARES
- Mobilização e instalação de canteiro
- Tapumes e proteções

2. DEMOLIÇÕES
- Demolição de piso cerâmico existente (área aproximada 200m²)
- Remoção de forro de gesso

3. INSTALAÇÕES ELÉTRICAS
- Substituição de quadro de distribuição
- Instalação de novos pontos de iluminação LED

4. ACABAMENTOS
- Pintura geral das paredes internas
- Instalação de piso vinílico

...`}
                  value={formData.memorialDescritivo}
                  onChange={(e) => setFormData({ ...formData, memorialDescritivo: e.target.value })}
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Dica: Quanto mais detalhado o memorial, mais preciso será o orçamento. 
                Inclua quantidades quando disponíveis.
              </p>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="bg-primary hover:bg-primary/90"
              disabled={createProject.isPending}
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
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
