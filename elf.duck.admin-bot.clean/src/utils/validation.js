export function isValidKey(text) {
  return /^[a-z0-9-]{2,32}$/.test(String(text || "").trim());
}
