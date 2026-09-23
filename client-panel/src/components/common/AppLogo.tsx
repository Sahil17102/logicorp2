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

const sizeMap: Record<LogoSize, { full: string; compact: string }> = {
  sm: { full: "h-14 w-36", compact: "h-10 w-10" },
  md: { full: "h-16 w-44", compact: "h-11 w-11" },
  lg: { full: "h-24 w-60", compact: "h-14 w-14" },
};

export function AppLogo({
  size = "md",
  showText = true,
  label = "Client Panel",
  to = "/",
  className = "",
}: AppLogoProps) {
  const content = (
    <img
      src="/logicorp-logo.jpeg"
      alt={label ? `Logicorp ${label}` : "Logicorp"}
      className={`${showText ? sizeMap[size].full : sizeMap[size].compact} shrink-0 rounded-md bg-white object-contain`}
    />
  );

  if (to) {
    return (
      <Link to={to} className={`flex items-center gap-2.5 no-underline ${className}`} aria-label="Logicorp home">
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
