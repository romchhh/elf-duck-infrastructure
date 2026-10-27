import express from "express";
import { requireCrmPushAdmin } from "./deps.js";
import {
  PUSH_AUTOMATION_TRIGGERS,
  ensurePushAutomationIndexes,
  getPushAutomation,
  upsertPushAutomation,
} from "../../lib/crm/pushAutomations.js";

const router = express.Router();

router.get(
  "/push/automations",
  requireCrmPushAdmin,
  async (_req, res) => {
    try {
      await ensurePushAutomationIndexes();

      const [firstPurchase, leadFollowup] = await Promise.all([
        getPushAutomation(PUSH_AUTOMATION_TRIGGERS.FIRST_PURCHASE),
        getPushAutomation(PUSH_AUTOMATION_TRIGGERS.LEAD_FOLLOWUP),
      ]);

      return res.json({
        ok: true,
        automations: {
          first_purchase: firstPurchase,
          lead_followup: leadFollowup,
        },
      });
    } catch (error) {
      console.error("GET /crm/push/automations error:", error);
      return res.status(500).json({
        ok: false,
        error: "PUSH_AUTOMATIONS_LOAD_FAILED",
      });
    }
  }
);

router.put(
  "/push/automations/:trigger",
  requireCrmPushAdmin,
  express.json(),
  async (req, res) => {
    try {
      const trigger = String(req.params?.trigger || "").trim();
      const allowed = Object.values(PUSH_AUTOMATION_TRIGGERS);

      if (!allowed.includes(trigger)) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_AUTOMATION_TRIGGER",
        });
      }

      await ensurePushAutomationIndexes();

      const automation = await upsertPushAutomation(trigger, {
        enabled: req.body?.enabled === true,
        delayMinutes: req.body?.delayMinutes,
        message: req.body?.message || {},
      });

      return res.json({
        ok: true,
        automation,
      });
    } catch (error) {
      console.error("PUT /crm/push/automations error:", error);

      if (String(error?.message || "") === "MESSAGE_REQUIRED") {
        return res.status(400).json({
          ok: false,
          error: "MESSAGE_REQUIRED",
        });
      }

      return res.status(500).json({
        ok: false,
        error: "PUSH_AUTOMATION_SAVE_FAILED",
      });
    }
  }
);

export default router;
