import { Link } from "react-router-dom";

type LogoSize = "sm" | "md" | "lg";

interface AppLogoProps {
  size?: LogoSize;
  showText?: boolean;
  label?: string;
  textClassName?: string;
  to?: string;
  className?: string;
}

const sizeMap: Record<LogoSize, { icon: string; text: string; label: string }> = {
  sm: { icon: "h-8 w-8", text: "text-xl", label: "text-xs" },
  md: { icon: "h-9 w-9", text: "text-2xl", label: "text-sm" },
  lg: { icon: "h-11 w-11", text: "text-3xl", label: "text-base" },
};

function LogoMark({ className }: { className: string }) {
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center`} aria-hidden="true">
      <svg viewBox="0 0 64 56" className="h-full w-full">
        <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
          <line x1="4" y1="20" x2="20" y2="20" opacity="0.9" />
          <line x1="1.5" y1="28" x2="20" y2="28" />
          <line x1="7" y1="36" x2="20" y2="36" opacity="0.9" />
        </g>
        <path d="M23 8 h9.5 v26 h11.5 v9 H23 Z" fill="currentColor" />
        <path d="M39 15 l13 13 l-13 13 v-9 l3.6 -2.4 l-3.6 -1.6 Z" fill="#2563eb" />
      </svg>
    </span>
  );
}

export function AppLogo({
  size = "md",
  showText = true,
  label = "Admin Panel",
  textClassName = "text-foreground",
  to = "/",
  className = "",
}: AppLogoProps) {
  const { icon, text, label: labelSize } = sizeMap[size];
  const iconTone = textClassName.includes("text-white") ? "text-white" : "text-[#111827]";

  const content = (
    <>
      <LogoMark className={`${icon} ${iconTone}`} />
      {showText && (
        <span className="min-w-0">
          <strong className={`${text} font-extrabold leading-none tracking-normal whitespace-nowrap ${textClassName}`}>
            Logi<span className="text-[#2563eb]">corp</span>
          </strong>
          {label && (
            <span className={`${labelSize} mt-1 block font-semibold uppercase tracking-[0.18em] text-muted`}>
              {label}
            </span>
          )}
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`flex items-center gap-2.5 no-underline ${className}`} aria-label="Logicorp admin home">
        {content}
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {content}
    </div>
  );
}
