import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";

type LogoSize = "sm" | "md" | "lg";

interface AppLogoProps {
  size?: LogoSize;
  showText?: boolean;
  label?: string;
  textClassName?: string;
  to?: string;
  className?: string;
}

// Logo is wide (~2:1) — set height-bound dims so the wordmark stays legible.
const sizeMap: Record<LogoSize, { img: string; text: string }> = {
  sm: { img: "h-9 w-auto max-w-[150px]", text: "text-base" },
  md: { img: "h-11 w-auto max-w-[180px]", text: "text-lg" },
  lg: { img: "h-16 w-auto max-w-[260px]", text: "text-2xl" },
};

export function AppLogo({
  size = "md",
  showText = true,
  label = "Admin Panel",
  textClassName = "text-foreground",
  to = "/",
  className = "",
}: AppLogoProps) {
  const { img, text } = sizeMap[size];

  const content = (
    <>
      <img
        src={logo}
        alt="Dreamz Services"
        className={`${img} object-contain shrink-0`}
      />
      {showText && (
        <span className={`${text} font-bold tracking-tight whitespace-nowrap ${textClassName}`}>
          {label}
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`flex items-center gap-2.5 no-underline ${className}`}>
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
