import express from "express";
import mongoose from "mongoose";
import {
  requireCrmPushAdmin,
  getPeriodRange,
  getCompletedOrderMatch,
  getSaleDateExpression,
} from "./deps.js";
import { getCompletedSaleDateBoundsMatch } from "../../lib/crm/sales.js";
import { PROMO_CODES_COLLECTION } from "../../lib/server/runtimeState.js";
import {
  normalizePromoCodeValue,
  getPromoMaxActivationsPerUser,
} from "../../lib/crm/promoLimits.js";
import Order from "../../models/Order.js";
import { reconcileAllUnsoldPromoUses } from "../../lib/crm/promoOrderUse.js";

const router = express.Router();

function normalizePromoCode(value) {
  return normalizePromoCodeValue(value);
}

function countPeriodActivations(row, from, to, periodKey = "") {
  const list = Array.isArray(row?.activations) ? row.activations : [];
  if (!list.length) {
    // Старые записи без массива activations — только для «всё время».
    return periodKey === "all"
      ? Number(row?.activationsCount || 0)
      : 0;
  }

  let count = 0;
  for (const item of list) {
    const at = new Date(item?.activatedAt || "");
    if (!Number.isFinite(at.getTime())) continue;
    if (from && at < from) continue;
    if (to && at >= to) continue;
    count += 1;
  }
  return count;
}

function mapPromoCode(row, statsByCode = new Map(), range = null) {
  const code = String(row?.code || "").trim().toUpperCase();
  const stats = statsByCode.get(code) || {
    orders: 0,
    buyers: 0,
    revenue: 0,
    discountZl: 0,
  };

  const activationsCount = Number(row?.activationsCount || 0);
  const periodActivations = range
    ? countPeriodActivations(row, range.from, range.to, range.key)
    : activationsCount;
  const orders = Number(stats.orders || 0);
  const buyers = Number(stats.buyers || 0);

  return {
    id: String(row?._id || ""),
    code: String(row?.code || ""),
    amountZl: Number(row?.amountZl || 0),
    isActive: row?.isActive !== false,
    expiresAt: row?.expiresAt || null,
    maxActivations: Math.max(0, Number(row?.maxActivations || 0)),
    maxActivationsPerUser: getPromoMaxActivationsPerUser(row),
    note: String(row?.note || ""),
    activationsCount,
    periodActivations,
    lastActivatedAt: row?.lastActivatedAt || null,
    createdAt: row?.createdAt || null,
    createdVia: String(row?.createdVia || ""),
    orders,
    buyers,
    revenue: Number(Number(stats.revenue || 0).toFixed(2)),
    discountZl: Number(Number(stats.discountZl || 0).toFixed(2)),
    /**
     * Конверсия промо в периоде:
     * завершённые заказы с этим кодом / активации, которые уже стали покупкой.
     * Ввод кода без покупки сюда не входит.
     */
    conversion:
      periodActivations > 0
        ? Number(((orders / periodActivations) * 100).toFixed(1))
        : 0,
  };
}

async function loadPromoOrderStats(from, to) {
  const match = {
    ...getCompletedOrderMatch(),
    "payment.promoCode": { $type: "string", $ne: "" },
  };

  const dateBounds = getCompletedSaleDateBoundsMatch(from, to);
  if (dateBounds) {
    Object.assign(match, dateBounds);
  }

  const rows = await Order.aggregate([
    { $match: match },
    {
      $addFields: {
        crmSaleDate: getSaleDateExpression(),
        promoCodeNorm: {
          $toUpper: {
            $trim: { input: { $ifNull: ["$payment.promoCode", ""] } },
          },
        },
      },
    },
    {
      $match: {
        promoCodeNorm: { $ne: "" },
        ...(from || to
          ? {
              crmSaleDate: {
                ...(from ? { $gte: from } : {}),
                ...(to ? { $lt: to } : {}),
              },
            }
          : {}),
      },
    },
    {
      $group: {
        _id: "$promoCodeNorm",
        orders: { $sum: 1 },
        buyers: { $addToSet: "$userTelegramId" },
        revenue: { $sum: { $ifNull: ["$totalZl", 0] } },
        discountZl: {
          $sum: { $ifNull: ["$payment.promoDiscountZl", 0] },
        },
      },
    },
  ]);

  const byCode = new Map();
  for (const row of rows) {
    const code = String(row?._id || "").trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, {
      orders: Number(row?.orders || 0),
      buyers: Array.isArray(row?.buyers)
        ? row.buyers.filter(Boolean).length
        : 0,
      revenue: Number(row?.revenue || 0),
      discountZl: Number(row?.discountZl || 0),
    });
  }
  return byCode;
}

router.get("/promo-codes", requireCrmPushAdmin, async (req, res) => {
  try {
    const range = getPeriodRange(
      req.query?.period || "all",
      req.query?.from || "",
      req.query?.to || ""
    );

    await reconcileAllUnsoldPromoUses();

    const [promoCodes, statsByCode] = await Promise.all([
      mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      loadPromoOrderStats(range.from, range.to),
    ]);

    const mapped = promoCodes.map((row) =>
      mapPromoCode(row, statsByCode, range)
    );

    const summary = {
      total: mapped.length,
      active: mapped.filter((row) => row.isActive).length,
      activations: mapped.reduce(
        (sum, row) => sum + Number(row.periodActivations || 0),
        0
      ),
      activationsAllTime: mapped.reduce(
        (sum, row) => sum + Number(row.activationsCount || 0),
        0
      ),
      orders: 0,
      buyers: 0,
      revenue: 0,
      discountZl: 0,
      conversion: 0,
    };

    for (const stats of statsByCode.values()) {
      summary.orders += Number(stats.orders || 0);
      summary.buyers += Number(stats.buyers || 0);
      summary.revenue += Number(stats.revenue || 0);
      summary.discountZl += Number(stats.discountZl || 0);
    }

    summary.revenue = Number(summary.revenue.toFixed(2));
    summary.discountZl = Number(summary.discountZl.toFixed(2));
    summary.conversion =
      summary.activations > 0
        ? Number(((summary.orders / summary.activations) * 100).toFixed(1))
        : 0;

    return res.json({
      ok: true,
      period: {
        key: range.key,
        from: range.from,
        to: range.to,
      },
      summary,
      promoCodes: mapped,
    });
  } catch (error) {
    console.error("GET /crm/promo-codes error:", error);
    return res.status(500).json({
      ok: false,
      error: "PROMO_CODES_LIST_FAILED",
    });
  }
});

router.post(
  "/promo-codes",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const code = normalizePromoCode(req.body?.code);
      const amountZl = Number(req.body?.amountZl || 0);
      const expiresAtRaw = req.body?.expiresAt;
      const note = String(req.body?.note || "").trim().slice(0, 200);
      const maxActivations = Math.max(
        0,
        Math.min(1_000_000, Number(req.body?.maxActivations || 0))
      );

      const perUserRaw = req.body?.maxActivationsPerUser;
      const maxActivationsPerUser =
        perUserRaw === undefined || perUserRaw === null || perUserRaw === ""
          ? 1
          : Math.max(0, Math.min(1_000_000, Number(perUserRaw || 0)));

      let expiresAt = null;

      if (
        expiresAtRaw !== null &&
        expiresAtRaw !== undefined &&
        String(expiresAtRaw).trim() !== ""
      ) {
        expiresAt = new Date(expiresAtRaw);

        if (!Number.isFinite(expiresAt.getTime())) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_PROMO_CODE_EXPIRES_AT",
          });
        }

        if (expiresAt.getTime() <= Date.now()) {
          return res.status(400).json({
            ok: false,
            error: "PROMO_CODE_EXPIRATION_MUST_BE_IN_FUTURE",
          });
        }
      }

      if (!code || code.length < 3) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_PROMO_CODE",
        });
      }

      if (!Number.isFinite(amountZl) || amountZl <= 0 || amountZl > 100000) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_PROMO_AMOUNT",
        });
      }

      const now = new Date();

      const result = await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .findOneAndUpdate(
          { code },
          {
            $set: {
              code,
              amountZl: Number(amountZl.toFixed(2)),
              isActive: true,
              expiresAt,
              maxActivations,
              maxActivationsPerUser,
              note,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              createdByTelegramId: "",
              createdVia: "crm",
              activationsCount: 0,
            },
          },
          {
            upsert: true,
            returnDocument: "after",
          }
        );

      const promoCode = result?.value || result;

      return res.json({
        ok: true,
        promoCode: mapPromoCode(
          promoCode || {
            code,
            amountZl,
            expiresAt,
            maxActivations,
            maxActivationsPerUser,
            note,
          }
        ),
      });
    } catch (error) {
      console.error("POST /crm/promo-codes error:", error);
      return res.status(500).json({
        ok: false,
        error: "PROMO_CODE_CREATE_FAILED",
      });
    }
  }
);

router.patch(
  "/promo-codes/:id/toggle",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const id = String(req.params?.id || "").trim();
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_PROMO_CODE_ID",
        });
      }

      const existing = await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .findOne({ _id: new mongoose.Types.ObjectId(id) });

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "PROMO_NOT_FOUND",
        });
      }

      const nextActive =
        typeof req.body?.isActive === "boolean"
          ? req.body.isActive
          : existing.isActive === false;

      const result = await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .findOneAndUpdate(
          { _id: existing._id },
          {
            $set: {
              isActive: nextActive,
              updatedAt: new Date(),
            },
          },
          { returnDocument: "after" }
        );

      const promoCode = result?.value || result;

      return res.json({
        ok: true,
        promoCode: mapPromoCode(promoCode),
      });
    } catch (error) {
      console.error("PATCH /crm/promo-codes/:id/toggle error:", error);
      return res.status(500).json({
        ok: false,
        error: "PROMO_CODE_TOGGLE_FAILED",
      });
    }
  }
);

router.delete("/promo-codes/:id", requireCrmPushAdmin, async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PROMO_CODE_ID",
      });
    }

    const result = await mongoose.connection
      .collection(PROMO_CODES_COLLECTION)
      .deleteOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!result?.deletedCount) {
      return res.status(404).json({
        ok: false,
        error: "PROMO_NOT_FOUND",
      });
    }

    return res.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error("DELETE /crm/promo-codes/:id error:", error);
    return res.status(500).json({
      ok: false,
      error: "PROMO_CODE_DELETE_FAILED",
    });
  }
});

export default router;
