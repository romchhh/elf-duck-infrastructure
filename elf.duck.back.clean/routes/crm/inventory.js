import express from "express";
import {
  Product,
  PickupPoint,
  requireCrmPushAdmin,
} from "./deps.js";
import { setFlavorStockAtPickupPoint } from "../../lib/crm/inventoryStock.js";

const router = express.Router();

router.get("/inventory/pickup-points", async (req, res) => {
  try {
    const points = await PickupPoint.find({
      isActive: { $ne: false },
    })
      .select({ key: 1, title: 1, address: 1, sortOrder: 1 })
      .sort({ sortOrder: 1, title: 1 })
      .lean();

    const rows = points
      .filter((p) => {
        const key = String(p?.key || "")
          .trim()
          .toLowerCase()
          .replace(/,+$/, "");
        return key !== "delivery" && key !== "delivery-2";
      })
      .map((p) => ({
        id: String(p._id),
        key: String(p.key || ""),
        title: String(p.title || p.address || p.key || "Точка"),
      }));

    return res.json({ ok: true, pickupPoints: rows });
  } catch (e) {
    console.error("GET /crm/inventory/pickup-points error:", e);
    return res.status(500).json({ ok: false, error: "INVENTORY_META_FAILED" });
  }
});

router.get("/inventory/stock", async (req, res) => {
  try {
    const pickupPointId = String(
      req.query?.pickupPointId || ""
    ).trim();

    if (!pickupPointId) {
      return res.status(400).json({
        ok: false,
        error: "PICKUP_POINT_ID_REQUIRED",
      });
    }

    const products = await Product.find({
      isActive: { $ne: false },
    })
      .select({
        productKey: 1,
        title1: 1,
        title2: 1,
        sortOrder: 1,
        flavors: 1,
      })
      .sort({ sortOrder: 1, title1: 1, title2: 1 })
      .lean();

    const rows = [];

    for (const product of products) {
      const flavors = (product.flavors || []).filter(
        (f) => f.isActive !== false
      );

      if (!flavors.length) {
        continue;
      }

      const flavorRows = flavors.map((flavor) => {
        const stockRow = (
          flavor.stockByPickupPoint || []
        ).find(
          (s) =>
            String(s.pickupPointId) === pickupPointId
        );

        return {
          flavorId: String(flavor._id),
          flavorKey: String(flavor.flavorKey || ""),
          label: String(
            flavor.label || flavor.flavorKey || "Вкус"
          ),
          totalQty: Math.max(
            0,
            Number(stockRow?.totalQty || 0)
          ),
          reservedQty: Math.max(
            0,
            Number(stockRow?.reservedQty || 0)
          ),
        };
      });

      rows.push({
        productId: String(product._id),
        productKey: String(product.productKey || ""),
        title: [product.title1, product.title2]
          .filter(Boolean)
          .join(" ")
          .trim(),
        flavors: flavorRows,
      });
    }

    return res.json({
      ok: true,
      pickupPointId,
      products: rows,
    });
  } catch (e) {
    console.error("GET /crm/inventory/stock error:", e);
    return res.status(500).json({ ok: false, error: "INVENTORY_STOCK_FAILED" });
  }
});

router.patch(
  "/inventory/stock",
  requireCrmPushAdmin,
  async (req, res) => {
    if (!["1", "true", "yes"].includes(String(process.env.ALLOW_MANUAL_STOCK_EDIT || "").trim().toLowerCase())) {
      return res.status(403).json({
        ok: false,
        error: "MANUAL_STOCK_EDIT_DISABLED",
      });
    }

    try {
      const pickupPointId = String(
        req.body?.pickupPointId || ""
      ).trim();

      const updates = Array.isArray(req.body?.updates)
        ? req.body.updates
        : [];

      if (!pickupPointId || !updates.length) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_INVENTORY_PAYLOAD",
        });
      }

      let applied = 0;

      for (const row of updates) {
        const productId = String(row?.productId || "").trim();
        const flavorId = String(row?.flavorId || "").trim();
        const totalQty = row?.totalQty;

        if (!productId || !flavorId) {
          continue;
        }

        await setFlavorStockAtPickupPoint({
          productId,
          flavorId,
          pickupPointId,
          totalQty,
          updatedByTelegramId: "crm",
        });

        applied += 1;
      }

      return res.json({ ok: true, applied });
    } catch (e) {
      console.error("PATCH /crm/inventory/stock error:", e);
      return res.status(500).json({
        ok: false,
        error: "INVENTORY_UPDATE_FAILED",
      });
    }
  }
);

export default router;
