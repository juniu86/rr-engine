import { cn } from "@/lib/utils";

interface RRLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export default function RRLogo({ size = "md", className, showText = true }: RRLogoProps) {
  const sizeMap = {
    sm: { icon: 24, text: "text-sm" },
    md: { icon: 32, text: "text-xl" },
    lg: { icon: 48, text: "text-3xl" },
  };

  const s = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer gear ring */}
        <path
          d="M24 4L27.2 7.6C28.4 7.2 29.6 7 30.8 6.8L33 3L36.2 5.2L35.4 9.2C36.4 9.8 37.4 10.4 38.2 11.2L42 9.6L43.8 13.2L40.6 15.8C41 17 41.2 18.2 41.2 19.4L45 21L44.2 25L40.2 24.6C39.8 25.8 39.2 27 38.4 28L41 31.4L38 34L35 31.8C34 32.4 32.8 33 31.6 33.2L31 37L27 36.6L26.4 32.6C25.2 32.6 24 32.4 22.8 32L20.2 35.4L17 33.2L18.4 29.4C17.4 28.6 16.6 27.6 16 26.4L12 27.4L10.6 23.6L14.2 21.4C14 20.2 14 19 14.2 17.8L10.4 16.2L11.8 12.2L15.8 13C16.4 11.8 17.2 10.8 18.2 10L17 6.2L20.6 4.4L23 7.6C23.3 7.3 23.7 7 24 4Z"
          stroke="url(#gear-gradient)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
          opacity="0.6"
        />

        {/* Inner building/structure shape */}
        <rect x="19" y="16" width="10" height="16" rx="1" fill="url(#building-gradient)" opacity="0.9" />
        <rect x="21" y="18" width="2.5" height="3" rx="0.5" fill="oklch(0.15 0.01 250)" />
        <rect x="24.5" y="18" width="2.5" height="3" rx="0.5" fill="oklch(0.15 0.01 250)" />
        <rect x="21" y="23" width="2.5" height="3" rx="0.5" fill="oklch(0.15 0.01 250)" />
        <rect x="24.5" y="23" width="2.5" height="3" rx="0.5" fill="oklch(0.15 0.01 250)" />

        {/* Roof/triangle */}
        <path d="M18 17L24 11L30 17" stroke="url(#building-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <defs>
          <linearGradient id="gear-gradient" x1="10" y1="4" x2="45" y2="37" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.70 0.14 195)" />
            <stop offset="1" stopColor="oklch(0.45 0.12 220)" />
          </linearGradient>
          <linearGradient id="building-gradient" x1="19" y1="11" x2="30" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.70 0.14 195)" />
            <stop offset="1" stopColor="oklch(0.55 0.14 220)" />
          </linearGradient>
        </defs>
      </svg>

      {showText && (
        <span className={cn("font-display font-bold tracking-tight", s.text)}>
          <span className="text-white">RR</span>
          <span className="text-primary">-Engine</span>
        </span>
      )}
    </div>
  );
}
