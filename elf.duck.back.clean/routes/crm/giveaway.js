import express from "express";
import { requireCrmPushAdmin } from "./deps.js";
import {
  creditGiveawayWinners,
  ensureGiveawayIndexes,
  getActiveGiveawayMonthKey,
  getGiveawayAdminState,
  listGiveawayMonths,
  notifyGiveawayWinners,
  runGiveawayDraw,
} from "../../lib/giveaway/service.js";

const router = express.Router();

function resolveMonthKey(req) {
  return (
    String(
      req.params?.monthKey ||
        req.query?.monthKey ||
        req.body?.monthKey ||
        ""
    ).trim() || getActiveGiveawayMonthKey()
  );
}

function requireConfirm(req, expectedPhrase) {
  const phrase = String(req.body?.confirmPhrase || "").trim();
  return phrase === expectedPhrase;
}

router.get("/giveaway/months", requireCrmPushAdmin, async (_req, res) => {
  try {
    await ensureGiveawayIndexes();
    const months = await listGiveawayMonths(24);
    return res.json({ ok: true, months });
  } catch (error) {
    console.error("GET /crm/giveaway/months error:", error);
    return res.status(500).json({ ok: false, error: "GIVEAWAY_MONTHS_FAILED" });
  }
});

router.get("/giveaway/current", requireCrmPushAdmin, async (req, res) => {
  try {
    await ensureGiveawayIndexes();
    const monthKey = resolveMonthKey(req);
    const state = await getGiveawayAdminState(monthKey);
    return res.json({ ok: true, ...state });
  } catch (error) {
    console.error("GET /crm/giveaway/current error:", error);
    return res.status(500).json({ ok: false, error: "GIVEAWAY_LOAD_FAILED" });
  }
});

router.post(
  "/giveaway/:monthKey/draw",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      if (!requireConfirm(req, "ПРОВЕСТИ РОЗЫГРЫШ")) {
        return res.status(400).json({
          ok: false,
          error: "CONFIRM_PHRASE_REQUIRED",
          hint: 'Укажите confirmPhrase: "ПРОВЕСТИ РОЗЫГРЫШ"',
        });
      }

      await ensureGiveawayIndexes();
      const monthKey = resolveMonthKey(req);
      const state = await runGiveawayDraw(monthKey, {
        username: req.crmAdmin?.username || "",
        adminId: req.crmAdmin?.telegramId || "",
      });

      return res.json({ ok: true, ...state });
    } catch (error) {
      const code = String(error?.message || "");
      if (
        code === "ALREADY_DRAWN" ||
        code === "NO_ENTRIES" ||
        code === "NO_UNIQUE_WINNERS"
      ) {
        return res.status(400).json({ ok: false, error: code });
      }
      console.error("POST /crm/giveaway draw error:", error);
      return res.status(500).json({ ok: false, error: "GIVEAWAY_DRAW_FAILED" });
    }
  }
);

router.post(
  "/giveaway/:monthKey/credit",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      if (!requireConfirm(req, "НАЧИСЛИТЬ ПРИЗЫ")) {
        return res.status(400).json({
          ok: false,
          error: "CONFIRM_PHRASE_REQUIRED",
          hint: 'confirmPhrase: "НАЧИСЛИТЬ ПРИЗЫ"',
        });
      }

      await ensureGiveawayIndexes();
      const monthKey = resolveMonthKey(req);
      const result = await creditGiveawayWinners(monthKey);
      const state = await getGiveawayAdminState(monthKey);
      return res.json({ ok: true, result, ...state });
    } catch (error) {
      const code = String(error?.message || "");
      if (code === "DRAW_REQUIRED_FIRST" || code === "NO_WINNERS") {
        return res.status(400).json({ ok: false, error: code });
      }
      console.error("POST /crm/giveaway credit error:", error);
      return res.status(500).json({ ok: false, error: "GIVEAWAY_CREDIT_FAILED" });
    }
  }
);

router.post(
  "/giveaway/:monthKey/notify",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      if (!requireConfirm(req, "ОТПРАВИТЬ ПОБЕДИТЕЛЯМ")) {
        return res.status(400).json({
          ok: false,
          error: "CONFIRM_PHRASE_REQUIRED",
          hint: 'confirmPhrase: "ОТПРАВИТЬ ПОБЕДИТЕЛЯМ"',
        });
      }

      await ensureGiveawayIndexes();
      const monthKey = resolveMonthKey(req);
      const result = await notifyGiveawayWinners(monthKey);
      const state = await getGiveawayAdminState(monthKey);
      return res.json({ ok: true, result, ...state });
    } catch (error) {
      const code = String(error?.message || "");
      if (code === "CREDIT_REQUIRED_FIRST" || code === "BOT_UNAVAILABLE") {
        return res.status(400).json({ ok: false, error: code });
      }
      console.error("POST /crm/giveaway notify error:", error);
      return res.status(500).json({ ok: false, error: "GIVEAWAY_NOTIFY_FAILED" });
    }
  }
);

export default router;
