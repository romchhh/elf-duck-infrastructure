/**
 * Shared normalization for Mongo stock sync and Google Sheets assortment matching.
 */

export function normalizeSheetModelName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/🦆/g, "")
    .replace(/CARTRIDGE/g, "CATRIDGE")
    .replace(/\bPUFFY\s+30\s*ML\s*\/\s*70\s*MG\b/g, "PUFFY 7%")
    .replace(/\bPUFFY\s+30\s*ML\s*\/\s*50\s*MG\b/g, "PUFFY 5%")
    .replace(/\bPUFFY\s+30\s*ML\b/g, "PUFFY 5%")
    .replace(/\bPUFFY\s+70\s*%/g, "PUFFY 7%")
    .replace(/\bPUFFY\s+50\s*%/g, "PUFFY 5%")
    .replace(/\bPUFFY\s+70\b/g, "PUFFY 7%")
    .replace(/\bPUFFY\s+50\b/g, "PUFFY 5%")
    .replace(/\s*30\s*ML/g, "")
    .replace(/^CHASER\s+/g, "")
    .replace(/\bLIQ\s+ELFLIQ\b/g, "ELFLIQ")
    .replace(/\bLIQ\s+HQD\b/g, "HQD")
    .replace(/\bLIQ\s+ETHEREUM\b/g, "ETHEREUM")
    .replace(/\bLIQ\s+SPECIAL\b/g, "SPECIAL")
    .replace(/\bLIQ\s+BLACK\b/g, "BLACK")
    .replace(/\bLIQ\s+FOR\s+PODS\b/g, "FOR PODS")
    .replace(/\bLIQ\s+VOZOL\s+PRIME\b/g, "VOZOL PRIME")
    .replace(/\bLIQ\s+PUFFY\s+7%\b/g, "PUFFY 7%")
    .replace(/\bLIQ\s+PUFFY\s+5%\b/g, "PUFFY 5%")
    .replace(/\bLIQ\s+PUFFY\b/g, "PUFFY 5%")
    .replace(/\bELF\s+DUCK\s+D3\s+25K\b/g, "ELF BAR D3")
    .replace(/\bELF\s+DUCK\s+D3\b/g, "ELF BAR D3")
    .replace(/\bELF\s+BAR\s+D3\s+25K\b/g, "ELF BAR D3")
    .replace(/\bELF\s+DUCK\s+BC\s*45K\b/g, "ELF BAR BC45K")
    .replace(/\bELF\s+DUCK\s+BC\s*45000\b/g, "ELF BAR BC45K")
    .replace(/\bELF\s+BAR\s+BC45K\b/g, "ELF BAR BC45K")
    .replace(/\bELF\s+BC45K\b/g, "ELF BC45K")
    .replace(/\bELF\s+DUCK\s+1500\b/g, "ELF BAR 1500")
    .replace(/\bELF\s+BAR\s+1500\b/g, "ELF BAR 1500")
    .replace(/\bELF\s+DUCK\s+2000\b/g, "ELF BAR 2000")
    .replace(/\bELF\s+BAR\s+2000\b/g, "ELF BAR 2000")
    .replace(/\bELF\s+DUCK\s+3000\s+RI\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+DUCK\s+3000\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+3000\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+BAR\s+3000\s+RI\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+BAR\s+RI\s+3000\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+BAR\s+3000\b/g, "ELF BAR RI 3000")
    .replace(/\b3000\s+RI\b/g, "ELF BAR RI 3000")
    .replace(/\bELF\s+DUCK\s+GH\s+33000\s+PRO\b/g, "ELF BAR GH 33000")
    .replace(/\bELF\s+BAR\s+GH\s+33000\s+PRO\b/g, "ELF BAR GH 33000")
    .replace(/\bELF\s+BAR\s+GH\s+33000\b/g, "ELF BAR GH 33000")
    .replace(/\bGH\s+33000\s+PRO\b/g, "GH 33000 PRO")
    .replace(/\bELF\s+DUCK\s+MOON\s+40K\b/g, "ELF BAR MOON 40K")
    .replace(/\bELF\s+BAR\s+MOON\s+40K\b/g, "ELF BAR MOON 40K")
    .replace(/\bELF\s+MOON\s+40K\b/g, "ELF MOON 40K")
    .replace(/\bELF\s+DUCK\s+KING\s+30K\b/g, "ELF BAR KING 30K")
    .replace(/\bELF\s+DUCK\s+ICE\s+KING\s+30K\b/g, "ELF BAR KING 30K")
    .replace(/\bELF\s+DUCK\s+DUKE\s+30K\b/g, "ELF BAR DUKE 30K")
    .replace(/\bELF\s+DUCK\s+TRIO\s+40K\b/g, "ELF TRIO 40K")
    .replace(/\bELF\s+BAR\s+TRIO\s+40K\b/g, "ELF TRIO 40K")
    .replace(/\bELF\s+TRIO\s+40K\b/g, "ELF TRIO 40K")
    .replace(/\b70\s*MG\b/g, "7%")
    .replace(/\b50\s*MG\b/g, "5%")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSheetFlavor(value) {
  return normalizeSheetModelName(value).replace(
    /[^A-ZА-ЯІЇЄҐ0-9]+/g,
    ""
  );
}

/** Report tab uses short model labels (column MODEL). */
export function toReportModelLabel(normalizedModel) {
  const m = normalizeSheetModelName(normalizedModel);

  const map = {
    "ELF BAR 1500": "1500",
    "ELF BAR 2000": "2000",
    "ELF BAR RI 3000": "3000 RI",
    "ELF BAR D3": "ELF D3 25K",
    "ELF BAR BC45K": "ELF BC45K",
    "ELF BAR GH 33000": "GH 33000 PRO",
    "ELF BAR MOON 40K": "ELF MOON 40K",
    "ELF TRIO 40K": "ELF TRIO 40K",
    ELFLIQ: "ELFLIQ",
    HQD: "HQD",
    ETHEREUM: "ETHEREUM",
    SPECIAL: "SPECIAL",
    BLACK: " BLACK",
    "FOR PODS": "FOR PODS",
    "VOZOL PRIME": "VOZOL PRIME",
    "PUFFY 7%": "PUFFY 7%",
    "PUFFY 5%": "PUFFY 5%",
    YAMI: "YAMI",
    OXVA: "OXVA",
    "OXVA POD": "OXVA POD",
    "XROS 6 MINI POD": "XROS 6 MINI POD",
    "XROS 6 POD": "XROS 6 POD",
    "XROS 5 MINI POD": "XROS 5 MINI POD",
    "XROS 5 POD": "XROS 5 POD",
    "OXVA CATRIDGE": "OXVA CATRIDGE",
    "XROS CATRIDGE": "XROS CATRIDGE",
    "MERRY MI": "MERRY MI",
  };

  if (map[m]) return map[m];

  if (m.includes("ELF BAR D3")) return "ELF D3 25K";
  if (m.includes("BC45K") || m.includes("BC 45")) return "ELF BC45K";

  return m;
}

/** Assortment headers often use ELF BAR … / LIQ … prefixes */
export function toAssortmentHeaderCandidates(normalizedModel, productKey = "") {
  const m = normalizeSheetModelName(normalizedModel);
  const key = String(productKey || "").trim().toLowerCase();

  const byProductKey = {
    "puffy-30-ml": [
      "PUFFY 30 ML",
      "LIQ PUFFY 5%",
      "PUFFY 5%",
      "PUFFY 50%",
      "PUFFY 50",
    ],
    "puffy-30-ml-70-mg": [
      "LIQ PUFFY 7%",
      "PUFFY 7%",
      "PUFFY 70%",
      "PUFFY 70",
    ],
    "chaser-black-30-ml": ["LIQ BLACK", " BLACK"],
    "chaser-for-pods-30-ml": ["LIQ FOR PODS", "FOR PODS"],
    "chaser-special-30-ml": ["LIQ SPECIAL", "SPECIAL"],
    "ethereum-30-ml": ["LIQ ETHEREUM", "ETHEREUM"],
    "elfliq-30-ml": ["LIQ ELFLIQ", "ELFLIQ"],
    "hqd-30-ml": ["LIQ HQD", "HQD"],
    "vozol-prime-30-ml": ["LIQ VOZOL PRIME", "VOZOL PRIME"],
    "oxva-30-ml-20-mg": ["LIQ OXVA", "OXVA", "OXVA 20 MG", "OXVA 30 ML"],
    "elf-duck-d3-25k": ["ELF BAR D3 25K", "ELF BAR D3"],
    "elf-duck-bc-45k": ["ELF BAR BC45K", "ELF BC45K"],
  };

  if (byProductKey[key]) {
    return byProductKey[key].map((h) => normalizeSheetModelName(h));
  }

  const candidates = new Set([m]);

  if (/^\d+$/.test(m) || m === "1500" || m === "2000") {
    candidates.add(normalizeSheetModelName(`ELF BAR ${m}`));
  }

  if (m === "ELF BAR D3") candidates.add("ELF BAR D3 25K");
  if (m === "ELF BAR RI 3000") candidates.add("ELF BAR RI 3000");
  if (m === "ELF BAR BC45K") {
    candidates.add("ELF BAR BC45K");
    candidates.add("ELF BC45K");
  }
  if (m === "GH 33000 PRO") candidates.add("ELF BAR GH 33000");
  if (!m.startsWith("LIQ ") && ["ELFLIQ", "HQD", "ETHEREUM", "SPECIAL", "BLACK", "FOR PODS", "VOZOL PRIME"].includes(m)) {
    candidates.add(normalizeSheetModelName(`LIQ ${m}`));
  }
  if (m.startsWith("PUFFY")) {
    candidates.add(normalizeSheetModelName(`LIQ ${m}`));
  }

  return [...candidates];
}

export function headerMatchesWanted(header, wantedSet) {
  const h = normalizeSheetModelName(header);
  const compact = h.replace(/\s+/g, "");

  // Числові заголовки («0», «7») — лише точний збіг, інакше «OXVA 20 MG» ловить «0».
  if (/^\d+$/.test(compact)) {
    for (const wanted of wantedSet) {
      const w = normalizeSheetModelName(wanted);
      const wCompact = w.replace(/\s+/g, "");
      if (h === w || compact === wCompact) return true;
    }
    return false;
  }

  for (const wanted of wantedSet) {
    const w = normalizeSheetModelName(wanted);
    if (!w) continue;
    const wCompact = w.replace(/\s+/g, "");
    if (h === w || compact === wCompact) return true;
    const shorter = compact.length <= wCompact.length ? compact : wCompact;
    const longer = compact.length <= wCompact.length ? wCompact : compact;
    if (shorter.length < 3) continue;
    if (longer.includes(shorter)) return true;
  }

  return false;
}

/**
 * Додаткові назви смаку на листі АССОРТИМЕНТ (ключ каталогу → flavorKey → варіанти).
 */
export const ASSORTMENT_FLAVOR_ALIASES_BY_PRODUCT = {
  "chaser-for-pods-30-ml": {
    "l-ch": ["Лічі", "Личі", "Litchi", "Lychee"],
    "litchi": ["Лічі", "Личі"],
    "lychee": ["Лічі", "Личі"],
  },
  "vozol-prime-30-ml": {
    "bluebbery-watermelon": ["BLUEBBERY WATERMELON", "Blueberry Watermelon"],
    "blueberry-watermelon": ["BLUEBBERY WATERMELON", "Blueberry Watermelon"],
  },
};

export function getAssortmentFlavorAliasLabels(productKey = "", flavorKey = "") {
  const pk = String(productKey || "").trim().toLowerCase();
  const fk = String(flavorKey || "").trim().toLowerCase();
  if (!pk || !fk) return [];

  const byProduct = ASSORTMENT_FLAVOR_ALIASES_BY_PRODUCT[pk];
  if (!byProduct) return [];

  return Array.isArray(byProduct[fk]) ? byProduct[fk] : [];
}

function flavorTokens(compact) {
  return String(compact || "")
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

export function flavorMatchesWanted(flavorCell, wantedCompact) {
  const cell = compactSheetFlavor(flavorCell);
  if (!cell || !wantedCompact) return false;
  if (cell === wantedCompact) return true;
  if (cell.includes(wantedCompact) || wantedCompact.includes(cell)) return true;

  // banana ice vs banan ice
  const a = cell.replace(/ICE/g, "").replace(/BANANA/g, "BANAN");
  const b = wantedCompact.replace(/ICE/g, "").replace(/BANANA/g, "BANAN");
  if (a === b) return true;

  const cellTokens = flavorTokens(cell);
  const wantedTokens = flavorTokens(wantedCompact);
  if (!cellTokens.length || !wantedTokens.length) return false;

  const overlap = wantedTokens.filter((t) =>
    cellTokens.some((c) => c === t || c.includes(t) || t.includes(c))
  ).length;

  let need = Math.max(2, wantedTokens.length - 1);
  if (wantedTokens.length === 3) {
    need = 2;
  }
  return overlap >= need;
}
