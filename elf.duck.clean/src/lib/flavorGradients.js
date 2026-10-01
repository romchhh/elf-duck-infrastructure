/** Ті самі правила, що в catalog-sync (кольори смаків у mini app). */

const RULES = [
  { re: /strawberry|cherry|raspberry/i, g: ["#e63946", "#ff758f"] },
  { re: /grape/i, g: ["#7b2cbf", "#b5179e"] },
  { re: /carbon\s*fiber|silk\s*gray|fiber\s*gray/i, g: ["#8a8a8a", "#c4c4c4"] },
  { re: /titanium\s*black|cosmic\s*black|slate\s*black/i, g: ["#1a1a1a", "#3d3d3d"] },
  { re: /\bblack\b|carbon/i, g: ["#2b2b2b", "#5c5c5c"] },
  { re: /titanium\s*silver|silver|pearl/i, g: ["#e8e8e8", "#b8b8b8"] },
  { re: /\bwhite\b/i, g: ["#f5f5f5", "#d8d8d8"] },
  { re: /gray|grey/i, g: ["#8a8a8a", "#c4c4c4"] },
  { re: /pineapple/i, g: ["#f9c74f", "#ff8c42"] },
  { re: /pink|rose|dreamy/i, g: ["#ff6fae", "#ffc1da"] },
  { re: /purple|grape|blackberry|blackcurrant/i, g: ["#7b2cbf", "#b5179e"] },
  { re: /blue|abyssal|aurora/i, g: ["#3a7bd5", "#87ceeb"] },
  { re: /green|mint|menthol|mojito|apple/i, g: ["#2d6a4f", "#95d5b2"] },
  { re: /brown|silk\s*brown|cola|cuban/i, g: ["#6f4e37", "#a67c52"] },
  { re: /orange|mango|peach|apricot|scorching/i, g: ["#ff8c42", "#ffd166"] },
  { re: /yellow|lemon|lime|banana|energy|vmt|red\s*energy/i, g: ["#f9c74f", "#f9844a"] },
  { re: /red|watermelon/i, g: ["#e63946", "#ff758f"] },
  { re: /blueberry/i, g: ["#4a5bd4", "#9bb5ff"] },
  { re: /ice|icy|cool/i, g: ["#7fdbff", "#b8fff1"] },
  { re: /tea/i, g: ["#c9a66b", "#8b5e3c"] },
  { re: /gummy|sour/i, g: ["#ff6b6b", "#ffd93d"] },
];

const DEFAULT = ["#6b5b95", "#3d3352"];

export function gradientForFlavorLabel(label) {
  const text = String(label || "").trim();
  if (!text) return DEFAULT.slice();
  for (const { re, g } of RULES) {
    if (re.test(text)) return g.slice();
  }
  return DEFAULT.slice();
}

export function hexToRgbTriplet(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) {
    return "137, 117, 201";
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function applyFlavorGradientsToProduct(product) {
  if (!product || !Array.isArray(product.flavors) || !product.flavors.length) {
    return product;
  }
  const flavors = product.flavors.map((f) => ({
    ...f,
    gradient: gradientForFlavorLabel(f.label),
  }));
  return {
    ...product,
    flavors,
    accentColor: hexToRgbTriplet(flavors[0]?.gradient?.[0]),
  };
}
