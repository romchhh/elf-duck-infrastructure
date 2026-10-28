import { bindApiGlobals } from "./bindApiGlobals.js";
import {
  ensureGiveawayIndexes,
  getGiveawayPublicState,
  getActiveGiveawayMonthKey,
  joinGiveaway,
} from "../../lib/giveaway/service.js";

export function registerRoutes(app) {
  bindApiGlobals();

  app.get("/giveaway/current", async (req, res) => {
    try {
      await ensureGiveawayIndexes();
      const telegramId = getTrustedTelegramIdFromRequest(req) || "";
      const monthKey =
        String(req.query?.monthKey || "").trim() ||
        getActiveGiveawayMonthKey();

      const state = await getGiveawayPublicState({ telegramId, monthKey });
      return res.json({ ok: true, ...state });
    } catch (error) {
      console.error("GET /giveaway/current error:", error);
      return res.status(500).json({ ok: false, error: "GIVEAWAY_LOAD_FAILED" });
    }
  });

  app.post("/giveaway/participate", async (req, res) => {
    try {
      await ensureGiveawayIndexes();
      const telegramId = requireTrustedTelegramId(req, res);
      if (!telegramId) return;

      const monthKey =
        String(req.body?.monthKey || "").trim() ||
        getActiveGiveawayMonthKey();

      const state = await joinGiveaway(monthKey, telegramId);
      return res.json({ ok: true, ...state });
    } catch (error) {
      const code = String(error?.message || "");
      if (code === "GIVEAWAY_CLOSED" || code === "GIVEAWAY_NOT_OPEN") {
        return res.status(400).json({ ok: false, error: code });
      }
      console.error("POST /giveaway/participate error:", error);
      return res.status(500).json({ ok: false, error: "GIVEAWAY_JOIN_FAILED" });
    }
  });
}
