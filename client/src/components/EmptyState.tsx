import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  variant: "projects" | "budget" | "cashflow" | "documents" | "schedule" | "generic";
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  className?: string;
}

function EmptyIllustration({ variant }: { variant: EmptyStateProps["variant"] }) {
  const illustrations: Record<string, JSX.Element> = {
    projects: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Blueprint grid */}
        <rect x="20" y="20" width="120" height="80" rx="4" fill="oklch(0.55 0.14 220 / 0.05)" stroke="oklch(0.55 0.14 220 / 0.2)" strokeWidth="1" strokeDasharray="4 4" />
        {/* Building outline */}
        <rect x="55" y="40" width="50" height="45" rx="2" fill="oklch(0.55 0.14 220 / 0.08)" stroke="oklch(0.55 0.14 220 / 0.3)" strokeWidth="1.5" />
        <path d="M50 42L80 22L110 42" stroke="oklch(0.70 0.14 195 / 0.5)" strokeWidth="1.5" strokeLinecap="round" />
        {/* Windows */}
        <rect x="62" y="50" width="8" height="8" rx="1" fill="oklch(0.75 0.15 70 / 0.3)" />
        <rect x="76" y="50" width="8" height="8" rx="1" fill="oklch(0.75 0.15 70 / 0.3)" />
        <rect x="90" y="50" width="8" height="8" rx="1" fill="oklch(0.75 0.15 70 / 0.3)" />
        <rect x="62" y="65" width="8" height="8" rx="1" fill="oklch(0.75 0.15 70 / 0.2)" />
        <rect x="76" y="65" width="8" height="20" rx="1" fill="oklch(0.70 0.14 195 / 0.2)" />
        <rect x="90" y="65" width="8" height="8" rx="1" fill="oklch(0.75 0.15 70 / 0.2)" />
        {/* Helmet */}
        <ellipse cx="38" cy="55" rx="12" ry="8" fill="oklch(0.75 0.15 70 / 0.2)" stroke="oklch(0.75 0.15 70 / 0.4)" strokeWidth="1" />
        <path d="M26 55H50" stroke="oklch(0.75 0.15 70 / 0.4)" strokeWidth="1" />
        {/* Plus sign hint */}
        <circle cx="130" cy="80" r="12" fill="oklch(0.55 0.14 220 / 0.1)" stroke="oklch(0.55 0.14 220 / 0.3)" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M126 80H134M130 76V84" stroke="oklch(0.55 0.14 220 / 0.4)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    budget: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Spreadsheet grid */}
        <rect x="30" y="20" width="100" height="80" rx="4" fill="oklch(0.55 0.14 220 / 0.05)" stroke="oklch(0.55 0.14 220 / 0.2)" strokeWidth="1" />
        {/* Header row */}
        <rect x="30" y="20" width="100" height="14" rx="4" fill="oklch(0.55 0.14 220 / 0.1)" />
        {/* Rows */}
        <line x1="30" y1="47" x2="130" y2="47" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        <line x1="30" y1="60" x2="130" y2="60" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        <line x1="30" y1="73" x2="130" y2="73" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        <line x1="30" y1="86" x2="130" y2="86" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        {/* Columns */}
        <line x1="65" y1="20" x2="65" y2="100" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        <line x1="100" y1="20" x2="100" y2="100" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
        {/* Data placeholders */}
        <rect x="36" y="40" width="22" height="3" rx="1.5" fill="oklch(0.55 0.14 220 / 0.2)" />
        <rect x="72" y="40" width="16" height="3" rx="1.5" fill="oklch(0.65 0.17 160 / 0.3)" />
        <rect x="106" y="40" width="18" height="3" rx="1.5" fill="oklch(0.75 0.15 70 / 0.3)" />
        <rect x="36" y="53" width="18" height="3" rx="1.5" fill="oklch(0.55 0.14 220 / 0.15)" />
        <rect x="72" y="53" width="12" height="3" rx="1.5" fill="oklch(0.65 0.17 160 / 0.2)" />
        <rect x="106" y="53" width="14" height="3" rx="1.5" fill="oklch(0.75 0.15 70 / 0.2)" />
        <rect x="36" y="66" width="20" height="3" rx="1.5" fill="oklch(0.55 0.14 220 / 0.1)" />
        <rect x="72" y="66" width="14" height="3" rx="1.5" fill="oklch(0.65 0.17 160 / 0.15)" />
        <rect x="106" y="66" width="16" height="3" rx="1.5" fill="oklch(0.75 0.15 70 / 0.15)" />
        {/* Calculator icon */}
        <rect x="15" y="70" width="16" height="22" rx="2" fill="oklch(0.70 0.14 195 / 0.1)" stroke="oklch(0.70 0.14 195 / 0.3)" strokeWidth="1" />
        <rect x="18" y="73" width="10" height="4" rx="1" fill="oklch(0.70 0.14 195 / 0.2)" />
      </svg>
    ),
    cashflow: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Chart area */}
        <rect x="25" y="15" width="110" height="80" rx="4" fill="oklch(0.55 0.14 220 / 0.03)" stroke="oklch(0.55 0.14 220 / 0.15)" strokeWidth="1" />
        {/* Grid lines */}
        <line x1="25" y1="35" x2="135" y2="35" stroke="oklch(1 0 0 / 0.05)" strokeWidth="0.5" />
        <line x1="25" y1="55" x2="135" y2="55" stroke="oklch(1 0 0 / 0.05)" strokeWidth="0.5" />
        <line x1="25" y1="75" x2="135" y2="75" stroke="oklch(1 0 0 / 0.05)" strokeWidth="0.5" />
        {/* Income area (green) */}
        <path d="M30 70L50 60L70 55L90 45L110 35L130 30L130 95L30 95Z" fill="oklch(0.65 0.17 160 / 0.1)" />
        <path d="M30 70L50 60L70 55L90 45L110 35L130 30" stroke="oklch(0.65 0.17 160 / 0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Expense area (warm) */}
        <path d="M30 80L50 75L70 68L90 63L110 58L130 50L130 95L30 95Z" fill="oklch(0.75 0.15 70 / 0.08)" />
        <path d="M30 80L50 75L70 68L90 63L110 58L130 50" stroke="oklch(0.75 0.15 70 / 0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
        {/* Data points */}
        <circle cx="70" cy="55" r="3" fill="oklch(0.65 0.17 160 / 0.6)" />
        <circle cx="110" cy="35" r="3" fill="oklch(0.65 0.17 160 / 0.6)" />
        {/* Arrow up */}
        <path d="M140 75L140 55M136 59L140 55L144 59" stroke="oklch(0.65 0.17 160 / 0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    documents: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Back document */}
        <rect x="50" y="15" width="60" height="78" rx="3" fill="oklch(0.55 0.14 220 / 0.05)" stroke="oklch(0.55 0.14 220 / 0.15)" strokeWidth="1" transform="rotate(5 80 54)" />
        {/* Front document */}
        <rect x="42" y="20" width="60" height="78" rx="3" fill="oklch(0.55 0.14 220 / 0.08)" stroke="oklch(0.55 0.14 220 / 0.25)" strokeWidth="1" />
        {/* Header bar */}
        <rect x="42" y="20" width="60" height="12" rx="3" fill="oklch(0.55 0.14 220 / 0.12)" />
        {/* Lines */}
        <rect x="50" y="40" width="36" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.15)" />
        <rect x="50" y="48" width="28" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.1)" />
        <rect x="50" y="56" width="32" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.1)" />
        {/* Table in document */}
        <rect x="50" y="66" width="44" height="20" rx="2" fill="oklch(0.70 0.14 195 / 0.05)" stroke="oklch(0.70 0.14 195 / 0.15)" strokeWidth="0.5" />
        <line x1="66" y1="66" x2="66" y2="86" stroke="oklch(0.70 0.14 195 / 0.1)" strokeWidth="0.5" />
        <line x1="82" y1="66" x2="82" y2="86" stroke="oklch(0.70 0.14 195 / 0.1)" strokeWidth="0.5" />
        {/* Stamp/seal */}
        <circle cx="115" cy="80" r="15" fill="oklch(0.65 0.17 160 / 0.06)" stroke="oklch(0.65 0.17 160 / 0.2)" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M110 80L114 84L121 76" stroke="oklch(0.65 0.17 160 / 0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    schedule: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Gantt container */}
        <rect x="20" y="20" width="120" height="80" rx="4" fill="oklch(0.55 0.14 220 / 0.03)" stroke="oklch(0.55 0.14 220 / 0.15)" strokeWidth="1" />
        {/* Labels column */}
        <rect x="20" y="20" width="30" height="80" rx="4" fill="oklch(0.55 0.14 220 / 0.05)" />
        {/* Gantt bars */}
        <rect x="55" y="30" width="40" height="8" rx="4" fill="oklch(0.55 0.14 220 / 0.25)" />
        <rect x="70" y="44" width="50" height="8" rx="4" fill="oklch(0.70 0.14 195 / 0.25)" />
        <rect x="85" y="58" width="35" height="8" rx="4" fill="oklch(0.65 0.17 160 / 0.25)" />
        <rect x="60" y="72" width="60" height="8" rx="4" fill="oklch(0.75 0.15 70 / 0.25)" />
        <rect x="100" y="86" width="30" height="8" rx="4" fill="oklch(0.55 0.14 220 / 0.15)" />
        {/* Label lines */}
        <rect x="24" y="32" width="18" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.15)" />
        <rect x="24" y="46" width="14" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.12)" />
        <rect x="24" y="60" width="16" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.1)" />
        <rect x="24" y="74" width="20" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.1)" />
        <rect x="24" y="88" width="12" height="2.5" rx="1.25" fill="oklch(0.55 0.14 220 / 0.08)" />
        {/* Today line */}
        <line x1="95" y1="20" x2="95" y2="100" stroke="oklch(0.75 0.15 70 / 0.4)" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    ),
    generic: (
      <svg width="160" height="120" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="55" r="30" fill="oklch(0.55 0.14 220 / 0.05)" stroke="oklch(0.55 0.14 220 / 0.15)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M70 55L77 62L92 48" stroke="oklch(0.55 0.14 220 / 0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };

  return illustrations[variant] || illustrations.generic;
}

export default function EmptyState({
  variant,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="mb-6 opacity-80">
        <EmptyIllustration variant={variant} />
      </div>
      <h3 className="text-lg font-semibold mb-2 text-center">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
          {description}
        </p>
      )}
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <Link href={actionHref}>
            <Button className="gradient-brand text-white border-0">
              {actionLabel}
            </Button>
          </Link>
        ) : (
          <Button onClick={onAction} className="gradient-brand text-white border-0">
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}
