import express from "express";
import mongoose from "mongoose";
import { requireCrmPushAdmin } from "./deps.js";
import { PROMO_CODES_COLLECTION } from "../../lib/server/runtimeState.js";

const router = express.Router();

function normalizePromoCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

router.get(
  "/promo-codes",
  requireCrmPushAdmin,
  async (_req, res) => {
    try {
      const promoCodes = await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      return res.json({
        ok: true,
        promoCodes: promoCodes.map((row) => ({
          id: String(row?._id || ""),
          code: String(row?.code || ""),
          amountZl: Number(row?.amountZl || 0),
          isActive: row?.isActive !== false,
          expiresAt: row?.expiresAt || null,
          activationsCount: Number(row?.activationsCount || 0),
          createdAt: row?.createdAt || null,
        })),
      });
    } catch (error) {
      console.error("GET /crm/promo-codes error:", error);
      return res.status(500).json({
        ok: false,
        error: "PROMO_CODES_LIST_FAILED",
      });
    }
  }
);

router.post(
  "/promo-codes",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const code = normalizePromoCode(req.body?.code);
      const amountZl = Number(req.body?.amountZl || 0);
      const expiresAtRaw = req.body?.expiresAt;

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

      if (
        !Number.isFinite(amountZl) ||
        amountZl <= 0 ||
        amountZl > 100000
      ) {
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
        promoCode: {
          id: String(promoCode?._id || ""),
          code: String(promoCode?.code || code),
          amountZl: Number(promoCode?.amountZl || amountZl),
          isActive: promoCode?.isActive !== false,
          expiresAt: promoCode?.expiresAt || expiresAt,
        },
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

export default router;
