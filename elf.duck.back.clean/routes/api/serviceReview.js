import { bindApiGlobals } from "./bindApiGlobals.js";
import {
  getServiceReviewContext,
  submitServiceReview,
} from "../../lib/support/serviceReviewInvite.js";

export function registerRoutes(app) {
  bindApiGlobals();

  app.get("/support/service-review/context", async (req, res) => {
    try {
      const telegramId = requireTrustedTelegramId(req, res);
      if (!telegramId) return;

      const result = await getServiceReviewContext(telegramId);
      if (!result.ok) {
        const status = result.reason === "NO_TELEGRAM" ? 401 : 400;
        return res.status(status).json({ ok: false, error: result.reason });
      }

      return res.json(result);
    } catch (error) {
      console.error("GET /support/service-review/context error:", error);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/support/service-review/submit", async (req, res) => {
    try {
      const telegramId = requireTrustedTelegramId(req, res);
      if (!telegramId) return;

      const { rating, details } = req.body || {};

      const result = await submitServiceReview({
        telegramId,
        rating,
        details,
      });

      if (!result.ok) {
        const status =
          result.reason === "NOT_ELIGIBLE" ||
          result.reason === "ALREADY_COMPLETED"
            ? 409
            : result.reason === "DETAILS_TOO_SHORT" ||
                result.reason === "INVALID_RATING"
              ? 400
              : 400;

        return res.status(status).json({
          ok: false,
          error: result.reason,
        });
      }

      return res.json(result);
    } catch (error) {
      console.error("POST /support/service-review/submit error:", error);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
