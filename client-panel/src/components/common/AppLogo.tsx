import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";

type LogoSize = "sm" | "md" | "lg";

interface AppLogoProps {
  size?: LogoSize;
  /** The logo image already contains the "DREAMZ SERVICES" wordmark, so the
   *  side-by-side text label is off by default. Set to true to render the
   *  fallback text next to the image (used in places where the image may not
   *  render — e.g. plain-text email shells). */
  showText?: boolean;
  textClassName?: string;
  to?: string;
  className?: string;
}

// Logo aspect is ~2:1 (wordmark + runner). Width set wide enough for the
// "DREAMZ SERVICES" wordmark to remain legible at each size.
const sizeMap: Record<LogoSize, { img: string; text: string }> = {
  sm: { img: "h-9 w-auto max-w-[150px]", text: "text-base" },
  md: { img: "h-11 w-auto max-w-[180px]", text: "text-lg" },
  lg: { img: "h-16 w-auto max-w-[260px]", text: "text-2xl" },
};

export function AppLogo({
  size = "md",
  showText = false,
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
          Dreamz Services
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
