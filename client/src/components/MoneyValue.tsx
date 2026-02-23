import { cn } from "@/lib/utils";

interface MoneyValueProps {
  value: number;
  size?: "sm" | "md" | "lg";
  colorize?: boolean;
  className?: string;
}

export default function MoneyValue({ value, size = "md", colorize = false, className }: MoneyValueProps) {
  const formatted = Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const [intPart, decPart] = formatted.split(",");
  const isNegative = value < 0;

  const sizeClasses = {
    sm: { prefix: "text-xs", main: "text-sm font-semibold", decimal: "text-xs" },
    md: { prefix: "text-sm", main: "text-lg font-bold", decimal: "text-sm" },
    lg: { prefix: "text-base", main: "text-2xl font-bold", decimal: "text-lg" },
  };

  const s = sizeClasses[size];

  const colorClass = colorize
    ? isNegative
      ? "text-red-400"
      : "text-emerald-400"
    : "";

  return (
    <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums", colorClass, className)}>
      {isNegative && <span className={s.prefix}>-</span>}
      <span className={cn(s.prefix, "text-muted-foreground")}>R$</span>
      <span className={s.main}>{intPart}</span>
      <span className={cn(s.decimal, "text-muted-foreground")}>,{decPart}</span>
    </span>
  );
}
