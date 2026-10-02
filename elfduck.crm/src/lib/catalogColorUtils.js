/** Парсинг формата бэкенда: `32, 130, 231` */
export function parseRgbTriplet(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if ([r, g, b].some((x) => x < 0 || x > 255)) return null;
  return { r, g, b };
}

export function formatRgbTriplet(r, g, b) {
  return `${r}, ${g}, ${b}`;
}

export function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function normalizeHex(hex, fallback = '#2082e7') {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : fallback;
}

export function rgbTripletToHex(triplet, fallback = '#2082e7') {
  const parsed = parseRgbTriplet(triplet);
  if (!parsed) return fallback;
  return rgbToHex(parsed.r, parsed.g, parsed.b);
}

export function hexToRgbTriplet(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  return formatRgbTriplet(rgb.r, rgb.g, rgb.b);
}
