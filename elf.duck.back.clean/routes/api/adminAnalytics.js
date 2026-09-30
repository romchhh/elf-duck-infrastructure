import { getAdminBotAnalytics } from "../../lib/crm/adminBotAnalytics.js";
import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

  app.get("/admin/analytics/summary", requireAdmin, async (req, res) => {
    try {
      const period = String(req.query?.period || "today")
        .trim()
        .toLowerCase();

      const allowed = new Set(["today", "week", "month"]);
      const safePeriod = allowed.has(period) ? period : "today";

      const payload = await getAdminBotAnalytics(safePeriod);

      res.json({
        ok: true,
        ...payload,
      });
    } catch (e) {
      console.error("GET /admin/analytics/summary error:", e);
      res.status(500).json({
        ok: false,
        error: "Server error",
      });
    }
  });
}
