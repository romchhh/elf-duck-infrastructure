/**
 * Прибирає «привиди» reservedQty: порівнює Mongo з відкритими замовленнями/кошиками.
 * Працює з Mongo (не setTimeout) — після рестарту API знову підхоплює.
 */
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import PickupPoint from "../../models/PickupPoint.js";
import Order from "../../models/Order.js";
import { getSyncedPickupPointIdsByAnyPoint } from "./pickupPointSync.js";

const OPEN_ORDER_STATUSES_EXCLUDED = [
  "canceled",
  "cancelled",
  "completed",
  "done",
  "annulled",
];

/** Зібране замовлення старше цього віку вже не тримає склад. */
const STALE_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Ці точки не мінусують таблицю з замовлення — лист правлять руками, резерв після відправки лишній. */
const SHEET_MANUAL_POINT_KEYS = new Set(["wola", "delivery-2"]);

function pointKeyOf(pointById, pointId) {
  return String(pointById.get(String(pointId))?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

function orderStillHoldsReserve(order, now, pointKey) {
  const status = String(order?.status || "").trim().toLowerCase();
  if (OPEN_ORDER_STATUSES_EXCLUDED.includes(status)) return false;

  if (status === "shipped") {
    if (order?.googleSheetSync?.appliedAt) return false;
    if (SHEET_MANUAL_POINT_KEYS.has(pointKey)) return false;
    return true;
  }

  const createdAt = new Date(order?.createdAt || 0).getTime();
  if (!createdAt || now - createdAt > STALE_HOLD_MS) return false;
  return true;
}

/**
 * @returns {{ ok: boolean, scanned: number, fixed: number, samples: object[] }}
 */
export async function reconcileGhostReservedStock({ limitFixes = 2000 } = {}) {
  const startedAt = Date.now();
  const points = await PickupPoint.find({}, { _id: 1, key: 1 }).lean();
  const pointById = new Map(points.map((point) => [String(point._id), point]));
  if (!points.length) {
    return { ok: true, scanned: 0, fixed: 0, samples: [] };
  }

  const linkedCache = new Map();
  async function linkedIdsFor(pointId) {
    const key = String(pointId);
    if (linkedCache.has(key)) return linkedCache.get(key);
    const ids = await getSyncedPickupPointIdsByAnyPoint(pointId);
    const list = (ids.length ? ids : [pointId]).map(String);
    linkedCache.set(key, list);
    return list;
  }

  // Агрегуємо очікуваний резерв: productKey|flavorKey|pointId → qty
  const expected = new Map();
  const bump = (productKey, flavorKey, pointId, qty) => {
    if (!productKey || !flavorKey || !pointId || qty <= 0) return;
    const k = `${productKey}\0${flavorKey}\0${pointId}`;
    expected.set(k, (expected.get(k) || 0) + qty);
  };

  const nowMs = Date.now();
  const releaseOrderIds = [];

  const openOrders = await Order.find({
    status: { $nin: OPEN_ORDER_STATUSES_EXCLUDED },
    stockReservedAt: { $type: "date" },
    $and: [
      {
        $or: [
          { stockReleasedAt: null },
          { stockReleasedAt: { $exists: false } },
        ],
      },
      {
        $or: [
          { stockCommittedAt: null },
          { stockCommittedAt: { $exists: false } },
        ],
      },
    ],
  })
    .select({
      items: 1,
      pickupPointId: 1,
      status: 1,
      createdAt: 1,
      deliveryType: 1,
      deliveryMethod: 1,
      googleSheetSync: 1,
    })
    .lean();

  for (const order of openOrders) {
    let holdPointId = order.pickupPointId;
    if (order.deliveryType === "delivery") {
      const deliveryKey =
        order.deliveryMethod === "inpost" ? "delivery-2" : "delivery";
      const deliveryPoint = points.find(
        (point) => pointKeyOf(pointById, point._id) === deliveryKey
      );
      if (deliveryPoint) holdPointId = deliveryPoint._id;
    }

    const pointKey = pointKeyOf(pointById, holdPointId);
    if (!orderStillHoldsReserve(order, nowMs, pointKey)) {
      releaseOrderIds.push(order._id);
      continue;
    }

    const linked = await linkedIdsFor(holdPointId);
    for (const it of order.items || []) {
      const productKey = String(it?.productKey || "").trim();
      for (const fl of it.flavors || []) {
        const flavorKey = String(fl?.flavorKey || "").trim();
        const qty = Math.max(0, Number(fl?.qty || 0));
        if (!productKey || !flavorKey || !qty) continue;
        for (const pointId of linked) {
          bump(productKey, flavorKey, pointId, qty);
        }
      }
    }
  }

  // Кошики більше не резервують stock — очікуваний reserved лише з відкритих замовлень.

  const products = await Product.find(
    { "flavors.stockByPickupPoint.reservedQty": { $gt: 0 } },
    { productKey: 1, flavors: 1 }
  ).lean();

  let scanned = 0;
  let fixed = 0;
  const samples = [];
  const ops = [];

  for (const product of products) {
    const productKey = String(product.productKey || "").trim();
    for (const flavor of product.flavors || []) {
      const flavorKey = String(flavor.flavorKey || "").trim();
      if (!flavorKey) continue;

      for (const stock of flavor.stockByPickupPoint || []) {
        const pointId = String(stock.pickupPointId || "").trim();
        const reserved = Math.max(0, Number(stock.reservedQty || 0));
        if (!pointId || reserved <= 0) continue;

        scanned += 1;
        const total = Math.max(0, Number(stock.totalQty || 0));
        const key = `${productKey}\0${flavorKey}\0${pointId}`;
        const wantRaw = Math.max(0, Number(expected.get(key) || 0));
        const want = Math.min(wantRaw, total);

        // Лише знімаємо зайве. Не нарощуємо резерв — інакше живий залишок знову зникає.
        if (want >= reserved) continue;
        if (fixed >= limitFixes) continue;

        fixed += 1;
        if (samples.length < 30) {
          samples.push({
            productKey,
            flavorKey,
            pointId,
            from: reserved,
            to: want,
            total,
          });
        }

        const pointObjId = mongoose.isValidObjectId(pointId)
          ? new mongoose.Types.ObjectId(pointId)
          : pointId;

        ops.push({
          updateOne: {
            filter: { _id: product._id },
            update: {
              $set: {
                "flavors.$[f].stockByPickupPoint.$[s].reservedQty": want,
                "flavors.$[f].stockByPickupPoint.$[s].updatedAt": new Date(),
                "flavors.$[f].stockByPickupPoint.$[s].updatedByTelegramId":
                  "ghost-reserve-reconcile",
              },
            },
            arrayFilters: [
              { "f.flavorKey": flavorKey },
              { "s.pickupPointId": pointObjId },
            ],
          },
        });
      }
    }
  }

  if (releaseOrderIds.length) {
    await Order.updateMany(
      { _id: { $in: releaseOrderIds } },
      { $set: { stockReleasedAt: new Date() } }
    );
  }

  for (let i = 0; i < ops.length; i += 200) {
    await Product.bulkWrite(ops.slice(i, i + 200), { ordered: false });
  }

  return {
    ok: true,
    scanned,
    fixed,
    samples,
    durationMs: Date.now() - startedAt,
  };
}
