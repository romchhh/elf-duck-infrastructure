import express from "express";
import { requireCrmPushAdmin } from "./deps.js";
import {
  loadSmartPricingSettings,
  saveSmartPricingSettings,
} from "../../lib/crm/smartPricingSettings.js";

const router = express.Router();

router.get(
  "/settings/smart-pricing",
  requireCrmPushAdmin,
  async (_req, res) => {
    try {
      const settings = await loadSmartPricingSettings({ force: true });
      return res.json({ ok: true, settings });
    } catch (error) {
      console.error("GET /crm/settings/smart-pricing error:", error);
      return res.status(500).json({
        ok: false,
        error: "SMART_PRICING_LOAD_FAILED",
      });
    }
  }
);

router.put(
  "/settings/smart-pricing",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const settings = await saveSmartPricingSettings(req.body?.settings || req.body);
      return res.json({ ok: true, settings });
    } catch (error) {
      console.error("PUT /crm/settings/smart-pricing error:", error);
      return res.status(500).json({
        ok: false,
        error: "SMART_PRICING_SAVE_FAILED",
      });
    }
  }
);

export default router;
