import mongoose from "mongoose";
import Order from "../../models/Order.js";

const GIVEAWAY_ENTRIES = "crm_giveaway_entries";

export function isGiveawayTestOrderId(orderId) {
  const id = String(orderId || "").trim();
  return !id || id.startsWith("giveaway-test:");
}

/** Одне замовлення: брутто та чиста оплата (без промо/кешбеку з балансу). */
export function breakdownGiveawayOrderEconomics(order) {
  const grossZl = Math.max(0, Number(order?.totalZl || 0));
  const promoDiscountZl = Math.max(0, Number(order?.payment?.promoDiscountZl || 0));
  const cashbackAppliedZl = Math.max(
    0,
    Number(order?.payment?.cashbackAppliedZl || 0)
  );

  const remainingRaw = order?.payment?.cashbackRemainingToPayZl;
  const remaining = Number(remainingRaw);
  const netEarnedZl =
    Number.isFinite(remaining) && remaining >= 0
      ? Number(remaining.toFixed(2))
      : Number(
          Math.max(0, grossZl - promoDiscountZl - cashbackAppliedZl).toFixed(2)
        );

  return {
    grossZl,
    promoDiscountZl,
    cashbackAppliedZl,
    netEarnedZl,
    orderNo: String(order?.orderNo || ""),
  };
}

export async function loadGiveawayOrderEconomicsMap(orderIds) {
  const validIds = [
    ...new Set(
      (orderIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => !isGiveawayTestOrderId(id) && mongoose.isValidObjectId(id))
    ),
  ];

  if (!validIds.length) {
    return new Map();
  }

  const orders = await Order.find({ _id: { $in: validIds } })
    .select({
      totalZl: 1,
      orderNo: 1,
      payment: 1,
    })
    .lean();

  const map = new Map();
  for (const order of orders) {
    map.set(String(order._id), breakdownGiveawayOrderEconomics(order));
  }
  return map;
}

export async function computeGiveawayMonthRevenue(monthKey) {
  const key = String(monthKey || "").trim();
  const entries = await mongoose.connection
    .collection(GIVEAWAY_ENTRIES)
    .find({ monthKey: key })
    .project({ orderId: 1, isTestEntry: 1, telegramId: 1 })
    .toArray();

  const realOrderIds = [
    ...new Set(
      entries
        .map((row) => String(row.orderId || "").trim())
        .filter((id) => !isGiveawayTestOrderId(id))
    ),
  ];

  const testEntriesCount = entries.filter(
    (row) =>
      row.isTestEntry === true || isGiveawayTestOrderId(row.orderId)
  ).length;

  const economicsMap = await loadGiveawayOrderEconomicsMap(realOrderIds);

  let grossTotalZl = 0;
  let promoDiscountZl = 0;
  let cashbackAppliedZl = 0;
  let netEarnedZl = 0;

  for (const id of realOrderIds) {
    const row = economicsMap.get(id);
    if (!row) continue;
    grossTotalZl += row.grossZl;
    promoDiscountZl += row.promoDiscountZl;
    cashbackAppliedZl += row.cashbackAppliedZl;
    netEarnedZl += row.netEarnedZl;
  }

  const round2 = (n) => Number(Number(n || 0).toFixed(2));

  return {
    ordersCount: economicsMap.size,
    entriesCount: entries.length,
    realEntriesCount: entries.length - testEntriesCount,
    testEntriesCount,
    grossTotalZl: round2(grossTotalZl),
    promoDiscountZl: round2(promoDiscountZl),
    cashbackAppliedZl: round2(cashbackAppliedZl),
    netEarnedZl: round2(netEarnedZl),
  };
}

/** Сума net по orderId з entries учасника. */
export function sumNetForParticipantEntries(entries, economicsMap) {
  const orderIds = [
    ...new Set(
      (entries || [])
        .map((row) => String(row.orderId || "").trim())
        .filter((id) => !isGiveawayTestOrderId(id))
    ),
  ];
  let netEarnedZl = 0;
  let ordersCount = 0;
  for (const id of orderIds) {
    const row = economicsMap.get(id);
    if (!row) continue;
    ordersCount += 1;
    netEarnedZl += row.netEarnedZl;
  }
  return {
    ordersCount,
    netEarnedZl: Number(Number(netEarnedZl || 0).toFixed(2)),
  };
}
