/**
 * Single source of truth for app theme.
 * No hardcoded colors elsewhere — use these tokens or CSS vars derived from them.
 *
 * Palette sampled directly from the Dreamz Services logo:
 *   primary = Vermilion Orange (#EF5C20)  — "DREAMZ" wordmark
 *   accent  = Deep Magenta     (#96286E)  — head dot / motion swoosh
 * Font: Plus Jakarta Sans
 */

/* ── Color palette shape (shared by light & dark) ── */

export interface ColorPalette {
  primary: string;
  primaryHover: string;
  primaryBg: string;
  primaryLight: string;

  accent: string;
  accentHover: string;
  accentBg: string;

  text: string;
  textSecondary: string;
  textTertiary: string;

  border: string;
  borderLight: string;

  bg: string;
  bgElevated: string;

  heroDark: string;
  heroGradientEnd: string;

  loadingOverlay: string;

  /** Skeleton shimmer stops */
  skeletonFrom: string;
  skeletonVia: string;

  /** Hero-light gradient endpoints */
  heroLightStart: string;
  heroLightEnd: string;

  /** Dot-grid overlay colors (full rgba value) */
  heroDotColor: string;
  heroLightDotColor: string;

  /** Muted surface for icon/logo backgrounds (replaces bg-gray-50) */
  surfaceMuted: string;

  /** Opaque equivalent of primaryBg — used for fixed table cells to prevent bleed-through */
  primaryBgSolid: string;

  /** Semantic status colors */
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
}

/* ── Light palette ── */

export const lightColors: ColorPalette = {
  primary: "#EF5C20",
  primaryHover: "#D04812",
  primaryBg: "rgba(239, 92, 32, 0.08)",
  primaryLight: "#FDE5D9",

  accent: "#96286E",
  accentHover: "#7E1F5C",
  accentBg: "rgba(150, 40, 110, 0.08)",

  text: "#1A0F1A",
  textSecondary: "#64556A",
  textTertiary: "#9B8AA0",

  border: "#E8DEE6",
  borderLight: "rgba(232, 222, 230, 0.6)",

  bg: "#FDFAFB",
  bgElevated: "#FFFFFF",

  heroDark: "#160B1A",
  heroGradientEnd: "#2C1228",

  loadingOverlay: "rgba(253, 250, 251, 0.92)",

  skeletonFrom: "#F5EEF1",
  skeletonVia: "#E8DEE6",

  heroLightStart: "#FFF8F4",
  heroLightEnd: "#FFFFFF",

  heroDotColor: "rgba(239, 92, 32, 0.15)",
  heroLightDotColor: "rgba(239, 92, 32, 0.04)",

  surfaceMuted: "#FBF6F8",

  primaryBgSolid: "#FEF0E6",

  success: "#16A34A",
  successBg: "#DCFCE7",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
};

/* ── Dark palette (neutral-cool, GitHub-inspired) ── */

export const darkColors: ColorPalette = {
  primary: "#FF7A45",
  primaryHover: "#FF9166",
  primaryBg: "rgba(255, 122, 69, 0.14)",
  primaryLight: "#3A1209",

  accent: "#D67BB0",
  accentHover: "#E498C2",
  accentBg: "rgba(214, 123, 176, 0.14)",

  text: "#F2E9EE",
  textSecondary: "#A99CA5",
  textTertiary: "#7B6F77",

  border: "#3A2A36",
  borderLight: "rgba(58, 42, 54, 0.7)",

  bg: "#120A11",
  bgElevated: "#1C121B",

  heroDark: "#0A0610",
  heroGradientEnd: "#1C121B",

  loadingOverlay: "rgba(18, 10, 17, 0.92)",

  skeletonFrom: "#1C121B",
  skeletonVia: "#2A1B27",

  heroLightStart: "#120A11",
  heroLightEnd: "#1C121B",

  heroDotColor: "rgba(255, 122, 69, 0.2)",
  heroLightDotColor: "rgba(255, 122, 69, 0.06)",

  surfaceMuted: "#2A1B27",

  primaryBgSolid: "#2A0F08",

  success: "#4ADE80",
  successBg: "rgba(74, 222, 128, 0.14)",
  danger: "#F87171",
  dangerBg: "rgba(248, 113, 113, 0.14)",
};

/* ── Non-color tokens (shared across modes) ── */

export const theme = {
  color: lightColors,
  fontFamily: {
    sans: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
  },
  spacing: {
    containerPadding: "1rem",
    containerPaddingSm: "1.5rem",
    sectionGap: "2.5rem",
    contentGap: "1.5rem",
    contentY: "1.5rem",
    contentYSm: "2rem",
    emptyStatePadding: "3rem",
    pageHeaderGap: "1rem",
    pageHeaderMargin: "2rem",
    loadingMinHeight: "200px",
  },
  containerMaxWidth: {
    sm: "48rem",
    md: "56rem",
    lg: "64rem",
    xl: "72rem",
    "2xl": "80rem",
  },
} as const;

export type Theme = typeof theme;

/* ── Theme mode ── */

export type ThemeMode = "light" | "dark";

/* ── CSS variable builders ── */

function buildColorVars(colors: ColorPalette): Record<string, string> {
  return {
    "--color-primary": colors.primary,
    "--color-primary-hover": colors.primaryHover,
    "--color-primary-bg": colors.primaryBg,
    "--color-primary-light": colors.primaryLight,
    "--color-accent": colors.accent,
    "--color-accent-hover": colors.accentHover,
    "--color-accent-bg": colors.accentBg,
    "--color-text": colors.text,
    "--color-text-secondary": colors.textSecondary,
    "--color-text-tertiary": colors.textTertiary,
    "--color-border": colors.border,
    "--color-border-light": colors.borderLight,
    "--color-bg": colors.bg,
    "--color-bg-elevated": colors.bgElevated,
    "--color-hero-dark": colors.heroDark,
    "--color-hero-gradient-end": colors.heroGradientEnd,
    "--color-loading-overlay": colors.loadingOverlay,
    "--color-skeleton-from": colors.skeletonFrom,
    "--color-skeleton-via": colors.skeletonVia,
    "--color-hero-light-start": colors.heroLightStart,
    "--color-hero-light-end": colors.heroLightEnd,
    "--color-hero-dot": colors.heroDotColor,
    "--color-hero-light-dot": colors.heroLightDotColor,
    "--color-surface-muted": colors.surfaceMuted,
    "--color-primary-bg-solid": colors.primaryBgSolid,
    "--color-success": colors.success,
    "--color-success-bg": colors.successBg,
    "--color-danger": colors.danger,
    "--color-danger-bg": colors.dangerBg,
  };
}

const sharedVars: Record<string, string> = {
  "--font-sans": theme.fontFamily.sans,
  "--radius-sm": `${theme.radius.sm}px`,
  "--radius-md": `${theme.radius.md}px`,
  "--radius-lg": `${theme.radius.lg}px`,
  "--radius-xl": `${theme.radius.xl}px`,
  "--spacing-container": theme.spacing.containerPadding,
  "--spacing-container-sm": theme.spacing.containerPaddingSm,
  "--spacing-section-gap": theme.spacing.sectionGap,
  "--spacing-content-gap": theme.spacing.contentGap,
  "--spacing-content-y": theme.spacing.contentY,
  "--spacing-content-y-sm": theme.spacing.contentYSm,
  "--spacing-empty-state": theme.spacing.emptyStatePadding,
  "--spacing-page-header-gap": theme.spacing.pageHeaderGap,
  "--spacing-page-header-margin": theme.spacing.pageHeaderMargin,
  "--loading-min-height": theme.spacing.loadingMinHeight,
  "--container-max-w-sm": theme.containerMaxWidth.sm,
  "--container-max-w-md": theme.containerMaxWidth.md,
  "--container-max-w-lg": theme.containerMaxWidth.lg,
  "--container-max-w-xl": theme.containerMaxWidth.xl,
  "--container-max-w-2xl": theme.containerMaxWidth["2xl"],
};

export const cssVars = {
  ...buildColorVars(lightColors),
  ...sharedVars,
} as const;

/**
 * Inject theme CSS variables onto :root.
 * Call with a mode to switch palettes; portaled elements (modals, drawers)
 * inherit from :root so this keeps them in sync.
 */
export function injectThemeVars(mode: ThemeMode = "light"): void {
  const root = document.documentElement;
  const colors = mode === "dark" ? darkColors : lightColors;
  const allVars = { ...sharedVars, ...buildColorVars(colors) };

  Object.entries(allVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Mirror data-theme onto <html> so Tailwind `dark:` utilities also match
  // inside portaled content (Modals, Drawers, Popovers) that mounts on body.
  root.setAttribute("data-theme", mode);
}

/**
 * Returns dark-mode CSS variable overrides as a React CSSProperties object.
 * Apply as `style` on a wrapper element to scope dark mode to its subtree.
 * Returns empty object for light mode (inherits :root light vars).
 */
export function getThemeVarsStyle(
  mode: ThemeMode,
): React.CSSProperties {
  if (mode === "light") return {};
  return buildColorVars(darkColors) as unknown as React.CSSProperties;
}
