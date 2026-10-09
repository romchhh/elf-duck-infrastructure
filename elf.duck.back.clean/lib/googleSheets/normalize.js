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

/** Кирилічні літери, візуально ідентичні латинським («Bananа» з кирилічною а на листі). */
const CYRILLIC_LATIN_LOOKALIKES = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  У: "Y",
  І: "I",
};

export function compactSheetFlavor(value) {
  return normalizeSheetModelName(value)
    .replace(/[^A-ZА-ЯІЇЄҐ0-9]+/g, "")
    .replace(/[АВЕКМНОРСТХУІ]/g, (ch) => CYRILLIC_LATIN_LOOKALIKES[ch] || ch);
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
    // Каталог: chaser-black-30-ml = HQD 30 ML → блок LIQ HQD.
    "chaser-black-30-ml": ["LIQ HQD", "HQD"],
    "chaser-black-30-ml-2": ["LIQ BLACK", " BLACK"],
    "chaser-for-pods-30-ml": ["LIQ FOR PODS", "FOR PODS"],
    "chaser-special-30-ml": ["LIQ SPECIAL", "SPECIAL"],
    "ethereum-30-ml": ["LIQ ETHEREUM", "ETHEREUM"],
    "elfliq-30-ml": ["LIQ ELFLIQ", "ELFLIQ"],
    "hqd-30-ml": ["LIQ HQD", "HQD"],
    "vozol-prime-30-ml": ["LIQ VOZOL PRIME", "VOZOL PRIME"],
    "yami-30ml": ["YAMI", "YAMI 30ML", "LIQ YAMI"],
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
const CARTRIDGE_RESISTANCE_ALIASES = {
  "cartridge-3ml-0-4-1-szt": ["0.4", "0,4", "0.4 Ω", "0.4 ohm"],
  "cartridge-3ml-0-6-1-szt": ["0.6", "0,6", "0.6 Ω", "0.6 ohm"],
  "cartridge-3ml-0-8-1-szt": ["0.8", "0,8", "0.8 Ω", "0.8 ohm"],
};

export const ASSORTMENT_FLAVOR_ALIASES_BY_PRODUCT = {
  // Картриджі: у каталозі «CARTRIDGE 3ML 0.4 1 SZT.», на листі рядок «0.4».
  "cartridge-oxva": CARTRIDGE_RESISTANCE_ALIASES,
  "xros-cartridge": CARTRIDGE_RESISTANCE_ALIASES,
  "xros-5-mini-pod": {
    black: ["XROS Black"],
    purple: ["XROS Purple"],
    "sky-blue": ["XROS Blue", "XROS Sky Blue"],
  },
  "puffy-30-ml-70-mg": {
    "grape-raspberry-black-plum": ["Grape Raspberry Plum"],
  },
  "chaser-for-pods-30-ml": {
    "l-ch": ["Личи", "Лічі", "Личі", "Litchi", "Lychee"],
    "lichi": ["Личи", "Лічі", "Личі", "Litchi", "Lychee"],
    "litchi": ["Личи", "Лічі", "Личі"],
    "lychee": ["Личи", "Лічі", "Личі"],
  },
  "vozol-prime-30-ml": {
    "bluebbery-watermelon": ["BLUEBBERY WATERMELON", "Blueberry Watermelon"],
    "blueberry-watermelon": ["BLUEBBERY WATERMELON", "Blueberry Watermelon"],
    "vanilla-cream-tobacco": [
      "Vanilla Cream Tobacco",
      "Vanilla cream tobacco",
      "VANILLA CREAM TOBACCO",
    ],
  },
  "elfliq-30-ml": {
    "blackcurrant-aniseed": [
      "Blackcurrant anissed",
      "Blackcurrant Anissed",
      "Blackcurrant Aniseed",
    ],
  },
  "puffy-30-ml": {
    "kiwi-berry": ["Berri kiwi", "Berry kiwi", "Kiwi Berry"],
    "grape-raspberry-plum": ["Grape Raspberry Black Plum"],
  },
  "chaser-black-30-ml": {
    "strawberry-raspberry-cherry-ice": ["Strawberry Raspberry Cherry"],
    "kiwi-wild-strawberry": [
      "Kiwi Wild Strawberry",
      "Wld Strawberry Kiwi",
      "Wild Strawberry Kiwi",
    ],
    "triple-raspberry": ["Tripple Raspberry", "Triple Raspberry"],
    "blackberry-sour-raspberry": [
      "Blackberry Sour Rasp",
      "Blackberry Sour Raspberry",
    ],
    "blue-raz-apple": ["Blue Raz Apple", "Blue Razz Apple"],
  },
  "chaser-black-30-ml-2": {
    "kiwi-wild-strawberry": [
      "Kiwi Wild Strawberry",
      "Wld Strawberry Kiwi",
      "Wild Strawberry Kiwi",
    ],
    "triple-raspberry": ["Tripple Raspberry", "Triple Raspberry"],
    "blackcurrant-peach-apple": [
      "Blackcurrant Peach Apple",
      "Black Currant Peach Apple",
    ],
    "blue-raz-apple": ["Blue Raz Apple", "Blue Razz Apple"],
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

/**
 * Рівень збігу смаку (щоб не списувати з «першого схожого» рядка):
 * 1 — точний (compact), 2 — banana/banan або LUX-суфікс, 3 — число в кінці на листі («Aurora Blue 10»),
 * 0 — немає збігу. Підрядки («Blueberry Lemon» ⊂ «Blueberry Lemonade») НЕ збігаються.
 */
export function flavorMatchTier(flavorCell, wantedCompact) {
  const cell = compactSheetFlavor(flavorCell);
  if (!cell || !wantedCompact) return 0;
  if (cell === wantedCompact) return 1;

  // banana ice vs banan ice (без викидання ICE — «Watermelon» ≠ «Watermelon Ice»)
  const a = cell.replace(/BANANA/g, "BANAN");
  const b = wantedCompact.replace(/BANANA/g, "BANAN");
  if (a === b) return 2;

  // «Cola Lux» ↔ «Cola» (на деяких точках рядок без LUX)
  const aNoLux = a.replace(/LUX$/, "");
  const bNoLux = b.replace(/LUX$/, "");
  if (aNoLux.length >= 3 && aNoLux === bNoLux) return 2;

  // «Scorching Cloud 15» ↔ «Scorching Cloud» (число в кінці назви на листі)
  const aNoNum = aNoLux.replace(/\d+$/, "");
  const bNoNum = bNoLux.replace(/\d+$/, "");
  if (aNoNum.length >= 5 && aNoNum === bNoNum) return 3;

  return 0;
}

const FLAVOR_IGNORED_WORDS = new Set(["LUX", "XROS"]);

function foldLookalikes(s) {
  return String(s || "").replace(
    /[АВЕКМНОРСТХУІ]/g,
    (ch) => CYRILLIC_LATIN_LOOKALIKES[ch] || ch
  );
}

function flavorWords(value) {
  return foldLookalikes(
    normalizeSheetModelName(value).replace(/[^A-ZА-ЯІЇЄҐ0-9]+/g, " ")
  )
    .trim()
    .split(" ")
    .filter((w) => w && !FLAVOR_IGNORED_WORDS.has(w))
    .map((w) => FLAVOR_WORD_ABBREVIATIONS[w] || w);
}

/** Відстань Дамерау–Левенштейна (OSA). */
function editDistance(a, b) {
  const la = a.length;
  const lb = b.length;
  const d = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[la][lb];
}

/** Скорочення на листах (лише явні, без «префіксів»: Blue ≠ Blueberry). */
const FLAVOR_WORD_ABBREVIATIONS = { RASP: "RASPBERRY" };

function flavorWordsEquivalent(a, b) {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  const dist = editDistance(a, b);
  if (dist <= 1) return true;
  // довгі слова: допускаємо 2 помилки (Blackccurant ↔ Blackcurrant)
  return min >= 9 && dist <= 2;
}

/**
 * Рівень 4: ті ж слова (>= 2) в іншому порядку та/або з опечаткою в 1 літеру, без «LUX»/«XROS».
 * Використовувати лише коли єдиний кандидат у блоці.
 */
export function flavorWordsMatch(flavorCell, label) {
  const a = flavorWords(flavorCell);
  const b = flavorWords(label);
  if (a.length < 2 || a.length !== b.length) return false;

  const used = new Array(b.length).fill(false);
  for (const wa of a) {
    const idx = b.findIndex((wb, i) => !used[i] && flavorWordsEquivalent(wa, wb));
    if (idx < 0) return false;
    used[idx] = true;
  }
  return true;
}

/** @deprecated використовуйте flavorMatchTier; лишено для зворотної сумісності. */
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
