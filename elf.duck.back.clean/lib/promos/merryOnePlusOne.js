/**
 * Акция 1+1=3 на линейку Merry Mi.
 * В каждой линейке (жижа merry-mi / одноразка merry-mi-blade-30k) отдельно:
 * на каждые 3 штуки самая дешёвая — подарок (0 zł).
 * Клиент не выбирает, какая позиция бесплатная.
 */

export const MERRY_ONE_PLUS_ONE_PRODUCT_KEYS = [
  "merry-mi",
  "merry-mi-blade-30k",
];

/** Старт по Варшаве. Пока без даты окончания. */
const START_WARSAW_DAY = "2026-11-20";

function warsawDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isMerryOnePlusOneActive(date = new Date()) {
  return warsawDayKey(date) >= START_WARSAW_DAY;
}

export function merryGiftQtyOf(row) {
  const qty = Math.max(0, Number(row?.qty || 0));
  const gift = Math.max(0, Number(row?.giftQty || 0));
  return Math.min(qty, gift);
}

export function chargeableQtyOf(row) {
  const qty = Math.max(0, Number(row?.qty || 0));
  return Math.max(0, qty - merryGiftQtyOf(row));
}

export function lineChargeZl(row) {
  return Number(
    (chargeableQtyOf(row) * Number(row?.unitPrice || 0)).toFixed(2)
  );
}

/** Номінал подарунків (0 zł). У колонку «Скидки» не пишеться — лише «Брак». */
export function merryGiftSheetsDiscountZl(rows) {
  let sum = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const flavors = Array.isArray(row?.flavors) ? row.flavors : [row];
    for (const flavor of flavors) {
      const gift = merryGiftQtyOf(flavor);
      if (!gift) continue;
      const unit = Number(flavor?.unitPrice || 0);
      const referralPer = Number(flavor?.referralFirstOrderDiscountPerItem || 0);
      sum += gift * (unit + referralPer);
    }
  }
  return Number(sum.toFixed(2));
}

/**
 * @param {Array<{productKey:string, unitPrice?:number, qty?:number, giftQty?:number}>} items
 */
export function applyMerryOnePlusOne(items, date = new Date()) {
  const list = (Array.isArray(items) ? items : []).map((it) => ({
    ...it,
    giftQty: 0,
  }));

  if (!isMerryOnePlusOneActive(date)) return list;

  const eligible = new Set(MERRY_ONE_PLUS_ONE_PRODUCT_KEYS);
  const groups = new Map();

  list.forEach((it, index) => {
    const pk = String(it?.productKey || "").trim().toLowerCase();
    if (!eligible.has(pk)) return;
    if (!groups.has(pk)) groups.set(pk, []);
    groups.get(pk).push(index);
  });

  for (const indexes of groups.values()) {
    const units = [];
    for (const index of indexes) {
      const price = Number(list[index]?.unitPrice || 0);
      const qty = Math.max(0, Number(list[index]?.qty || 0));
      for (let n = 0; n < qty; n += 1) {
        units.push({ index, price });
      }
    }

    const free = Math.floor(units.length / 3);
    if (free <= 0) continue;

    units.sort((a, b) => a.price - b.price || a.index - b.index);
    const giftByIndex = new Map();
    for (let i = 0; i < free; i += 1) {
      const index = units[i].index;
      giftByIndex.set(index, (giftByIndex.get(index) || 0) + 1);
    }
    for (const [index, giftQty] of giftByIndex) {
      list[index].giftQty = giftQty;
    }
  }

  return list;
}
