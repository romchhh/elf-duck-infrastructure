const MERRY_MI_PRODUCT_KEYS = ["merry-mi", "merry-mi-blade-30k"];

const ONE_PLUS_ONE_PROMO_RE =
  /1\s*\+\s*1|1\+1\s*=\s*3|1\s*плюс\s*1|трет\w*\s+в\s+подарок|трет\w*\s+0|gratis|подарок/i;

function collectPushButtons(message = {}) {
  return [
    ...(Array.isArray(message?.buttons) ? message.buttons : []),
    ...(Array.isArray(message?.buttonsRu) ? message.buttonsRu : []),
    ...(Array.isArray(message?.buttonsPl) ? message.buttonsPl : []),
  ];
}

function addProductKeysFromUrlish(value, keys) {
  const raw = String(value || "").trim();
  if (!raw) return;

  const tryParse = (urlLike) => {
    try {
      const parsed = new URL(urlLike, "https://shop.local");
      for (const name of ["productKey", "openProductKey", "pk", "product"]) {
        const item = String(parsed.searchParams.get(name) || "").trim();
        if (item) keys.add(item);
      }
      const path = String(parsed.pathname || "");
      for (const match of path.matchAll(
        /\b(merry-mi(?:-blade-30k)?|xros-[\w-]+|oxva-[\w-]+|puffy-special)\b/gi
      )) {
        keys.add(String(match[1] || "").toLowerCase());
      }
    } catch {
      // ignore
    }
  };

  tryParse(raw);
  if (raw.includes("?")) {
    const query = raw.slice(raw.indexOf("?"));
    tryParse(`https://shop.local/${query.startsWith("?") ? "" : "/"}${query}`);
  }

  for (const match of raw.matchAll(/\b(merry-mi(?:-blade-30k)?)\b/gi)) {
    keys.add(String(match[1] || "").toLowerCase());
  }
}

/**
 * Якщо розсилка явно про конкретні товари — лічимо лише закази з цими SKU (paid qty).
 * Інакше — будь-яка завершена покупка отримувача (як раніше).
 */
export function extractCampaignAttributionProductKeys(campaign = {}) {
  const keys = new Set();

  const fav = String(campaign?.filters?.favProduct || "").trim();
  if (fav) keys.add(fav);

  for (const button of collectPushButtons(campaign?.message)) {
    addProductKeysFromUrlish(button?.path, keys);
    addProductKeysFromUrlish(button?.url, keys);
  }

  const blob = [
    campaign?.name,
    campaign?.message?.title,
    campaign?.message?.text,
    campaign?.message?.textRu,
    campaign?.message?.textPl,
  ]
    .map((part) => String(part || ""))
    .join("\n");

  for (const match of blob.matchAll(/\b(merry-mi(?:-blade-30k)?)\b/gi)) {
    keys.add(String(match[1] || "").toLowerCase());
  }

  const merryMiMentioned = /merry\s*mi|меррі/i.test(blob);
  if (merryMiMentioned && ONE_PLUS_ONE_PROMO_RE.test(blob)) {
    for (const key of MERRY_MI_PRODUCT_KEYS) {
      keys.add(key);
    }
  }

  return [...keys].filter(Boolean);
}

export function orderHasPaidProductKeys(items, productKeys) {
  const want = new Set(
    (Array.isArray(productKeys) ? productKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  );
  if (!want.size) return true;

  for (const item of Array.isArray(items) ? items : []) {
    const productKey = String(item?.productKey || "").trim();
    if (!want.has(productKey)) continue;

    const flavors = Array.isArray(item?.flavors) ? item.flavors : [];
    if (!flavors.length) {
      return true;
    }

    let paidQty = 0;
    for (const flavor of flavors) {
      const qty = Math.max(0, Number(flavor?.qty || 0));
      const giftQty = Math.min(
        Math.max(0, Number(flavor?.giftQty || 0)),
        qty
      );
      paidQty += Math.max(0, qty - giftQty);
    }

    if (paidQty > 0) {
      return true;
    }
  }

  return false;
}