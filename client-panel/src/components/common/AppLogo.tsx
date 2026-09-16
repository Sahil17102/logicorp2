import { Link } from "react-router-dom";

type LogoSize = "sm" | "md" | "lg";

interface AppLogoProps {
  size?: LogoSize;
  showText?: boolean;
  textClassName?: string;
  to?: string;
  className?: string;
}

const sizeMap: Record<LogoSize, { icon: string; text: string }> = {
  sm: { icon: "h-8 w-8", text: "text-xl" },
  md: { icon: "h-9 w-9", text: "text-2xl" },
  lg: { icon: "h-11 w-11", text: "text-3xl" },
};

function LogoMark({ className }: { className: string }) {
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-full w-full overflow-visible">
        <rect x="8" y="8" width="32" height="32" rx="8" transform="rotate(45 24 24)" fill="none" stroke="#2b61d7" strokeWidth="2.8" />
        <path d="M14.5 26.5 24 17l9.5 9.5" fill="none" stroke="#ff7043" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function AppLogo({
  size = "md",
  showText = true,
  textClassName = "text-foreground",
  to = "/",
  className = "",
}: AppLogoProps) {
  const { icon, text } = sizeMap[size];
  const iconTone = textClassName.includes("text-white") ? "text-white" : "text-[#111d36]";

  const content = (
    <>
      <LogoMark className={`${icon} ${iconTone}`} />
      {showText && (
        <span className={`flex flex-col whitespace-nowrap font-extrabold leading-none tracking-[0.02em] ${text} ${textClassName}`}>
          ROCKETRIDE
          <small className="mt-1 text-[7px] font-bold tracking-[0.24em] text-[#ff7043]">BY RUDRA FREIGHT SOLUTIONS</small>
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`flex items-center gap-2.5 no-underline ${className}`} aria-label="Rocketride home">
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
