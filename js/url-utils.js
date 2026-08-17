export function safeHttps(value, origin = window.location.origin) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value.trim(), origin);
    if (url.protocol !== "https:" && url.origin !== origin) return "";
    return url.toString();
  } catch {
    return "";
  }
}
