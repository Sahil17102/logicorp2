export function shouldUseStaticClientData(): boolean {
  const flag = import.meta.env.VITE_STATIC_DATA_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
