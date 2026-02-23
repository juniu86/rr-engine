import { CheckCircle2, Circle, Settings, Plus, Eye, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OnboardingChecklistProps {
  hasSettings: boolean;
  hasProjects: boolean;
  className?: string;
}

const steps = [
  {
    key: "settings",
    title: "Configure sua empresa",
    description: "Defina impostos, BDI e regime tributário para propostas precisas.",
    href: "/settings",
    icon: Settings,
  },
  {
    key: "project",
    title: "Crie seu primeiro orçamento",
    description: "Cole o memorial descritivo e deixe os 10 agentes trabalharem.",
    href: "/projects/new",
    icon: Plus,
  },
  {
    key: "explore",
    title: "Explore os resultados",
    description: "Visualize orçamento, cronograma, fluxo de caixa e documentos.",
    href: "#",
    icon: Eye,
  },
];

export default function OnboardingChecklist({ hasSettings, hasProjects, className }: OnboardingChecklistProps) {
  const completed = [hasSettings, hasProjects, false];
  const completedCount = completed.filter(Boolean).length;

  if (completedCount >= 2) return null;

  return (
    <Card className={cn("border-primary/20 bg-primary/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display">Primeiros Passos</CardTitle>
          <span className="text-xs text-muted-foreground">{completedCount}/3 concluídos</span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
          <div
            className="h-full rounded-full gradient-brand transition-all duration-500"
            style={{ width: `${(completedCount / 3) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {steps.map((step, idx) => {
          const isDone = completed[idx];
          const StepIcon = isDone ? CheckCircle2 : step.icon;

          return (
            <Link key={step.key} href={step.href}>
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                isDone
                  ? "bg-emerald-500/5 border border-emerald-500/20"
                  : "bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-primary/20 cursor-pointer"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isDone ? "bg-emerald-500/20" : "bg-primary/10"
                )}>
                  <StepIcon className={cn(
                    "h-4 w-4",
                    isDone ? "text-emerald-400" : "text-primary"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    isDone && "line-through text-muted-foreground"
                  )}>{step.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                </div>
                {!isDone && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
