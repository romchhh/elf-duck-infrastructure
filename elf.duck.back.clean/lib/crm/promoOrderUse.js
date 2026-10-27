import mongoose from "mongoose";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import { PROMO_CODES_COLLECTION } from "../server/runtimeState.js";
import { normalizePromoCodeValue } from "./promoLimits.js";

const CLOSED_STATUSES = ["canceled", "annulled", "completed", "done", "shipped"];

function promoCollection() {
  return mongoose.connection.collection(PROMO_CODES_COLLECTION);
}

export function orderIsPromoSale(order) {
  if (!order) return false;

  const status = String(order.status || "").trim().toLowerCase();
  const deliveryType = String(order.deliveryType || "").trim().toLowerCase();
  const deliveryMethod = String(order.deliveryMethod || "").trim().toLowerCase();

  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    return status === "shipped" && Boolean(order.shippedAt);
  }

  return (
    (status === "completed" || status === "done") &&
    Boolean(order.completedAt)
  );
}

/**
 * Живые заказы, где код уже стоит скидкой, но покупка ещё не состоялась.
 * Они держат лимит, но не считаются активацией.
 */
export async function countOpenPromoHolds(code, { excludeOrderId, telegramId } = {}) {
  const safeCode = normalizePromoCodeValue(code);
  if (!safeCode) return 0;

  const query = {
    "payment.promoCode": safeCode,
    "payment.promoDiscountZl": { $gt: 0 },
    status: { $nin: CLOSED_STATUSES },
  };

  if (excludeOrderId) {
    query._id = { $ne: excludeOrderId };
  }

  if (telegramId) {
    query.userTelegramId = String(telegramId);
  }

  return Order.countDocuments(query);
}

async function clampActivationsCount(promoId) {
  await promoCollection().updateOne(
    { _id: promoId, activationsCount: { $lt: 0 } },
    { $set: { activationsCount: 0, updatedAt: new Date() } }
  );
}

/**
 * Снять списание кода с заказа, который не стал покупкой
 * (отмена, аннулирование или заказ так и не завершился).
 */
export async function releaseOrderPromoUse(order) {
  const orderId = String(order?._id || "").trim();
  if (!orderId) return { released: 0 };

  const promo = await promoCollection().findOne({
    activations: {
      $elemMatch: { orderId, asOrderDiscount: true },
    },
  });

  if (!promo) {
    await Order.updateOne(
      { _id: order._id },
      { $unset: { "payment.promoUseCommittedAt": "" } }
    );
    return { released: 0 };
  }

  const removed = (Array.isArray(promo.activations) ? promo.activations : []).filter(
    (row) => row?.asOrderDiscount === true && String(row?.orderId || "") === orderId
  );

  if (!removed.length) {
    return { released: 0 };
  }

  await promoCollection().updateOne(
    { _id: promo._id },
    {
      $pull: { activations: { orderId, asOrderDiscount: true } },
      $inc: { activationsCount: -removed.length },
      $set: { updatedAt: new Date() },
    }
  );
  await clampActivationsCount(promo._id);

  const telegramId = String(
    order?.userTelegramId || removed[0]?.telegramId || ""
  ).trim();

  if (telegramId) {
    await User.collection.updateOne(
      { telegramId },
      {
        $pull: {
          promoCodeActivations: {
            asOrderDiscount: true,
            orderId: { $in: [order._id, orderId] },
          },
        },
      }
    );
  }

  await Order.updateOne(
    { _id: order._id },
    { $unset: { "payment.promoUseCommittedAt": "" } }
  );

  return { released: removed.length };
}

/**
 * Покупка состоялась — только теперь код считается использованным.
 * Повторный вызов ничего не добавляет.
 */
export async function commitOrderPromoUse(order) {
  if (!orderIsPromoSale(order)) return { committed: false };

  const code = normalizePromoCodeValue(order?.payment?.promoCode);
  const discountZl = Math.max(0, Number(order?.payment?.promoDiscountZl || 0));
  const orderId = String(order?._id || "").trim();
  const telegramId = String(order?.userTelegramId || "").trim();

  if (!code || discountZl <= 0 || !orderId || !telegramId) {
    return { committed: false };
  }

  if (order?.payment?.promoUseCommittedAt) {
    return { committed: true, already: true };
  }

  const promoId = String(order?.payment?.promoCodeId || "").trim();
  const promo = promoId && mongoose.Types.ObjectId.isValid(promoId)
    ? await promoCollection().findOne({ _id: new mongoose.Types.ObjectId(promoId) })
    : await promoCollection().findOne({ code });

  if (!promo) return { committed: false };

  const already = (Array.isArray(promo.activations) ? promo.activations : []).some(
    (row) => row?.asOrderDiscount === true && String(row?.orderId || "") === orderId
  );

  const now = new Date();

  if (!already) {
    await promoCollection().updateOne(
      {
        _id: promo._id,
        activations: { $not: { $elemMatch: { orderId, asOrderDiscount: true } } },
      },
      {
        $inc: { activationsCount: 1 },
        $push: {
          activations: {
            telegramId,
            amountZl: discountZl,
            activatedAt: order?.payment?.promoAppliedAt || now,
            asOrderDiscount: true,
            orderId,
          },
        },
        $set: { lastActivatedAt: now, updatedAt: now },
      }
    );

    await User.collection.updateOne(
      {
        telegramId,
        promoCodeActivations: {
          $not: { $elemMatch: { asOrderDiscount: true, orderId: order._id } },
        },
      },
      {
        $push: {
          promoCodeActivations: {
            code,
            amountZl: discountZl,
            promoCodeId: promo._id,
            activatedAt: order?.payment?.promoAppliedAt || now,
            asOrderDiscount: true,
            orderId: order._id,
          },
        },
        $set: { updatedAt: now },
      }
    );
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { "payment.promoUseCommittedAt": now } }
  );

  return { committed: true };
}

/** Убрать активации по заказам, которые так и не стали покупкой. */
export async function reconcileUnsoldPromoUses(promo) {
  const list = Array.isArray(promo?.activations) ? promo.activations : [];
  const orderIds = [
    ...new Set(
      list
        .filter((row) => row?.asOrderDiscount && row?.orderId)
        .map((row) => String(row.orderId))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ];

  if (!orderIds.length) return;

  const orders = await Order.find({
    _id: { $in: orderIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select({
      status: 1,
      deliveryType: 1,
      deliveryMethod: 1,
      completedAt: 1,
      shippedAt: 1,
      userTelegramId: 1,
      payment: 1,
    })
    .lean();

  const byId = new Map(orders.map((row) => [String(row._id), row]));

  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (order && orderIsPromoSale(order)) {
      if (!order?.payment?.promoUseCommittedAt) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { "payment.promoUseCommittedAt": new Date() } }
        );
      }
      continue;
    }

    await releaseOrderPromoUse(
      order || {
        _id: new mongoose.Types.ObjectId(orderId),
        userTelegramId: list.find((row) => String(row?.orderId || "") === orderId)
          ?.telegramId,
      }
    );
  }
}

export async function reconcileAllUnsoldPromoUses() {
  const promos = await promoCollection()
    .find({ "activations.asOrderDiscount": true })
    .toArray();

  for (const promo of promos) {
    await reconcileUnsoldPromoUses(promo);
  }
}
