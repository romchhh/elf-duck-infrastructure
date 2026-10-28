const ZABKA_MAPS_BY_POINT_KEY = {
  praga:
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Praga",
  "r-dmie-cie":
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+%C5%9Ar%C3%B3dmie%C5%9Bcie",
  "mokot-w":
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Mokot%C3%B3w",
  wola: "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa+Wola",
  delivery:
    "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa",
};

export function resolveZabkaMapsUrl(pointKey = "", address = "") {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (ZABKA_MAPS_BY_POINT_KEY[key]) return ZABKA_MAPS_BY_POINT_KEY[key];

  const addr = String(address || "").trim();
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `Żabka ${addr}`
    )}`;
  }

  return "https://www.google.com/maps/search/?api=1&query=%C5%BBabka+Warszawa";
}
