import { bindApiGlobals } from "./bindApiGlobals.js";
import { submitCustomerComplaint } from "../../lib/support/complaintsTelegram.js";

export function registerRoutes(app) {
  bindApiGlobals();

  app.post("/support/complaint", async (req, res) => {
    try {
      const telegramId = requireTrustedTelegramId(req, res);
      if (!telegramId) return;

      const { text, images, orderId, pickupPointId, source } = req.body || {};

      const result = await submitCustomerComplaint({
        telegramId,
        text,
        images,
        orderId,
        pickupPointId,
        source,
      });

      if (!result.ok) {
        const status =
          result.reason === "ORDER_NOT_FOUND"
            ? 404
            : result.reason === "TEXT_TOO_SHORT" ||
                result.reason === "TEXT_TOO_LONG" ||
                result.reason === "INVALID_IMAGE"
              ? 400
              : 502;

        return res.status(status).json({
          ok: false,
          error: result.reason,
          detail: result.detail || "",
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("POST /support/complaint error:", error);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
