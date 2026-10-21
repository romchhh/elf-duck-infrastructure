import express from "express";
import mongoose from "mongoose";
import { requireCrmPushAdmin } from "./deps.js";
import { PROMO_CODES_COLLECTION } from "../../lib/server/runtimeState.js";
import {
  normalizePromoCodeValue,
  getPromoMaxActivationsPerUser,
} from "../../lib/crm/promoLimits.js";

const router = express.Router();

function normalizePromoCode(value) {
  return normalizePromoCodeValue(value);
}

function mapPromoCode(row) {
  return {
    id: String(row?._id || ""),
    code: String(row?.code || ""),
    amountZl: Number(row?.amountZl || 0),
    isActive: row?.isActive !== false,
    expiresAt: row?.expiresAt || null,
    maxActivations: Math.max(0, Number(row?.maxActivations || 0)),
    maxActivationsPerUser: getPromoMaxActivationsPerUser(row),
    note: String(row?.note || ""),
    activationsCount: Number(row?.activationsCount || 0),
    createdAt: row?.createdAt || null,
  };
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
        promoCodes: promoCodes.map(mapPromoCode),
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
      const note = String(req.body?.note || "").trim().slice(0, 200);
      const maxActivations = Math.max(
        0,
        Math.min(1_000_000, Number(req.body?.maxActivations || 0))
      );

      const perUserRaw = req.body?.maxActivationsPerUser;
      const maxActivationsPerUser =
        perUserRaw === undefined || perUserRaw === null || perUserRaw === ""
          ? 1
          : Math.max(
              0,
              Math.min(1_000_000, Number(perUserRaw || 0))
            );

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

router.delete(
  "/promo-codes/:id",
  requireCrmPushAdmin,
  async (req, res) => {
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
  }
);

export default router;
