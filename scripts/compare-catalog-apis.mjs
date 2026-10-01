/**
 * Порівняння каталогу local vs prod API.
 * node scripts/compare-catalog-apis.mjs
 * LOCAL_API_URL=http://localhost:3000 PROD_API_URL=https://elfduck-api.telebots.site node scripts/compare-catalog-apis.mjs
 */
const localUrl = String(process.env.LOCAL_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);
const prodUrl = String(
  process.env.PROD_API_URL || "https://elfduck-api.telebots.site"
).replace(/\/+$/, "");

async function loadProducts(base) {
  const r = await fetch(`${base}/products?active=1`);
  const d = await r.json();
  if (!r.ok) throw new Error(`${base} HTTP ${r.status}`);
  const list = Array.isArray(d) ? d : d.products || [];
  const map = new Map();
  for (const p of list) {
    map.set(String(p.productKey || ""), p);
  }
  return map;
}

function line(p) {
  if (!p) return "—";
  return `${p.categoryKey}|${p.price}|${p.title1}|${p.title2}`;
}

const local = await loadProducts(localUrl).catch((e) => {
  console.error("LOCAL:", e.message);
  return null;
});
const prod = await loadProducts(prodUrl).catch((e) => {
  console.error("PROD:", e.message);
  return null;
});

if (!local || !prod) process.exit(1);

const keys = new Set([...local.keys(), ...prod.keys()]);
const diff = [];
for (const k of [...keys].sort()) {
  if (!k) continue;
  const a = local.get(k);
  const b = prod.get(k);
  if (!a) {
    diff.push(`only PROD: ${k} ${line(b)}`);
    continue;
  }
  if (!b) {
    diff.push(`only LOCAL: ${k} ${line(a)}`);
    continue;
  }
  if (line(a) !== line(b)) {
    diff.push(`DIFF ${k}:\n  local: ${line(a)}\n  prod:  ${line(b)}`);
  }
}

console.log(`Local: ${local.size} products | Prod: ${prod.size} products`);
if (!diff.length) {
  console.log("✅ Catalogs match (productKey, category, price, titles).");
} else {
  console.log(`❌ ${diff.length} difference(s):\n`);
  console.log(diff.join("\n"));
  process.exit(1);
}
