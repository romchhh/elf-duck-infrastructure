import express from "express";
import {
  Category,
  Product,
  CRM_PUSH_MEDIA_MAX_BYTES,
  CRM_PUSH_MEDIA_ALLOWED_TYPES,
} from "./deps.js";
import { cacheInvalidate } from "../../lib/server/helpers/chunk01.js";
import {
  ensureUniqueCategoryKey,
  ensureUniqueProductKey,
  ensureUniqueFlavorKeyForProduct,
  slugifyFlavorLabel,
  translitRuToLat,
} from "../../lib/server/helpers/chunk12.js";
import { saveCatalogMediaBuffer } from "../../lib/crm/catalogMediaStorage.js";

const router = express.Router();

function invalidateCatalogCache() {
  cacheInvalidate("categories:");
  cacheInvalidate("products:");
}

router.get("/catalog/categories", async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "0") !== "0";
    const filter = onlyActive ? { isActive: true } : {};
    const categories = await Category.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return res.json({ ok: true, categories });
  } catch (e) {
    console.error("GET /crm/catalog/categories error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.post("/catalog/categories", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) {
      return res.status(400).json({ ok: false, error: "TITLE_REQUIRED" });
    }

    const rawTitle = String(b.title || "");
    const baseKey = b.key ? String(b.key) : translitRuToLat(rawTitle);
    const finalKey = await ensureUniqueCategoryKey(baseKey);

    const created = await Category.create({
      key: finalKey,
      title: String(b.title),
      isActive: b.isActive ?? true,
      cardBgUrl: b.cardBgUrl || "",
      cardDuckUrl: b.cardDuckUrl || "",
      classCardDuck: b.classCardDuck || "",
      titleClass: b.titleClass || "cardTitle",
      showOverlay: !!b.showOverlay,
      badgeText: b.badgeText || "",
      badgeSide: b.badgeSide === "right" ? "right" : "left",
      sortOrder: Number(b.sortOrder || 0),
    });

    invalidateCatalogCache();
    return res.json({ ok: true, category: created });
  } catch (e) {
    console.error("POST /crm/catalog/categories error:", e);
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "KEY_EXISTS" });
    }
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.patch("/catalog/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const allow = [
      "key",
      "title",
      "isActive",
      "cardBgUrl",
      "cardDuckUrl",
      "classCardDuck",
      "titleClass",
      "showOverlay",
      "badgeText",
      "badgeSide",
      "sortOrder",
    ];

    const update = {};
    for (const k of allow) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if (update.sortOrder !== undefined) {
      update.sortOrder = Number(update.sortOrder || 0);
    }
    if (update.badgeSide !== undefined) {
      update.badgeSide = update.badgeSide === "right" ? "right" : "left";
    }
    if (update.showOverlay !== undefined) {
      update.showOverlay = !!update.showOverlay;
    }

    const cat = await Category.findByIdAndUpdate(id, update, { new: true });
    if (!cat) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    invalidateCatalogCache();
    return res.json({ ok: true, category: cat });
  } catch (e) {
    console.error("PATCH /crm/catalog/categories/:id error:", e);
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "KEY_EXISTS" });
    }
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.delete("/catalog/categories/:id", async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id).lean();
    if (!cat) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const productsCount = await Product.countDocuments({
      categoryKey: cat.key,
    });
    if (productsCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "CATEGORY_HAS_PRODUCTS",
        productsCount,
      });
    }

    await Category.findByIdAndDelete(req.params.id);
    invalidateCatalogCache();
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /crm/catalog/categories/:id error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.get("/catalog/products", async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "0") !== "0";
    const categoryKey = String(req.query.categoryKey || "").trim();
    const filter = onlyActive ? { isActive: true } : {};
    if (categoryKey) filter.categoryKey = categoryKey;

    const products = await Product.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json({ ok: true, products });
  } catch (e) {
    console.error("GET /crm/catalog/products error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.get("/catalog/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("GET /crm/catalog/products/:id error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.post("/catalog/products", async (req, res) => {
  try {
    const b = req.body || {};
    const t1 = String(b.title1 || "").trim();
    const t2 = String(b.title2 || "").trim();
    if (!b.categoryKey) {
      return res.status(400).json({ ok: false, error: "CATEGORY_REQUIRED" });
    }

    const baseFromTitle = translitRuToLat([t1, t2].filter(Boolean).join(" "));
    const baseKey = b.productKey ? String(b.productKey) : baseFromTitle;
    const finalProductKey = await ensureUniqueProductKey(baseKey);

    const created = await Product.create({
      productKey: finalProductKey,
      sortOrder: Number(b.sortOrder || 0),
      categoryKey: String(b.categoryKey),
      isActive: b.isActive ?? true,
      title1: b.title1 || "",
      title2: b.title2 || "",
      titleModal: b.titleModal || "",
      price: Number(b.price || 0),
      cardBgUrl: b.cardBgUrl || "",
      cardDuckUrl: b.cardDuckUrl || "",
      orderImgUrl: b.orderImgUrl || "",
      classCardDuck: b.classCardDuck || "",
      classActions: b.classActions || "",
      classNewBadge: b.classNewBadge || "",
      newBadge: b.newBadge || "",
      accentColor: b.accentColor || "",
      flavors: Array.isArray(b.flavors) ? b.flavors : [],
    });

    invalidateCatalogCache();
    return res.json({ ok: true, product: created });
  } catch (e) {
    console.error("POST /crm/catalog/products error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.patch("/catalog/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const allow = [
      "productKey",
      "sortOrder",
      "categoryKey",
      "isActive",
      "title1",
      "title2",
      "titleModal",
      "price",
      "cardBgUrl",
      "cardDuckUrl",
      "orderImgUrl",
      "classCardDuck",
      "classActions",
      "classNewBadge",
      "newBadge",
      "accentColor",
    ];

    const update = {};
    for (const k of allow) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if (update.price !== undefined) update.price = Number(update.price || 0);
    if (update.sortOrder !== undefined) {
      update.sortOrder = Number(update.sortOrder || 0);
    }

    const updated = await Product.findByIdAndUpdate(id, update, { new: true });
    if (!updated) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    invalidateCatalogCache();
    return res.json({ ok: true, product: updated });
  } catch (e) {
    console.error("PATCH /crm/catalog/products/:id error:", e);
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "KEY_EXISTS" });
    }
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.delete("/catalog/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    invalidateCatalogCache();
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /crm/catalog/products/:id error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.post("/catalog/products/:id/flavors", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const label = String(b.label || "").trim();
    if (!label) {
      return res.status(400).json({ ok: false, error: "LABEL_REQUIRED" });
    }

    const gradient = Array.isArray(b.gradient)
      ? b.gradient.map((x) => String(x))
      : [];
    if (gradient.length !== 2) {
      return res.status(400).json({ ok: false, error: "GRADIENT_INVALID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const rawFlavorKey = String(b.flavorKey || "")
      .trim()
      .toLowerCase();
    const requestedFlavorKey =
      rawFlavorKey || slugifyFlavorLabel(label);

    const existing = (product.flavors || []).find(
      (f) =>
        String(f.flavorKey || "").trim().toLowerCase() === requestedFlavorKey
    );

    if (existing) {
      existing.label = label;
      existing.gradient = gradient;
      if (b.isActive !== undefined) existing.isActive = !!b.isActive;
    } else {
      const uniqueFlavorKey = ensureUniqueFlavorKeyForProduct(
        product,
        requestedFlavorKey
      );
      product.flavors.push({
        flavorKey: uniqueFlavorKey,
        label,
        isActive: b.isActive ?? true,
        gradient,
        stockByPickupPoint: [],
      });
    }

    await product.save();
    invalidateCatalogCache();
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("POST /crm/catalog/products/:id/flavors error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.delete("/catalog/products/:id/flavors/:flavorId", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const flavorId = String(req.params.flavorId || "");
    const before = (product.flavors || []).length;
    product.flavors = (product.flavors || []).filter(
      (f) => String(f._id) !== flavorId
    );

    if (product.flavors.length === before) {
      return res.status(404).json({ ok: false, error: "FLAVOR_NOT_FOUND" });
    }

    await product.save();
    invalidateCatalogCache();
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("DELETE /crm/catalog/products/:id/flavors error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.post(
  "/catalog/upload-media",
  express.json({ limit: "14mb" }),
  async (req, res) => {
    try {
      const dataUrl = String(req.body?.dataUrl || "").trim();
      const match = dataUrl.match(
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/
      );

      if (!match) {
        return res.status(400).json({ ok: false, error: "INVALID_MEDIA" });
      }

      const contentType = match[1];
      if (!CRM_PUSH_MEDIA_ALLOWED_TYPES.has(contentType)) {
        return res.status(400).json({ ok: false, error: "UNSUPPORTED_TYPE" });
      }

      const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
      if (buffer.length <= 0 || buffer.length > CRM_PUSH_MEDIA_MAX_BYTES) {
        return res.status(400).json({ ok: false, error: "FILE_TOO_LARGE" });
      }

      let photoPreviewUrl = "";

      try {
        const saved = await saveCatalogMediaBuffer({ buffer, contentType });
        photoPreviewUrl = String(saved?.url || "").trim();
      } catch (diskErr) {
        console.warn(
          "POST /crm/catalog/upload-media disk save failed:",
          diskErr?.message || diskErr
        );

        const upload = req.app.locals.uploadCrmBroadcastPhoto;
        if (typeof upload !== "function") {
          throw diskErr;
        }

        const result = await upload({ buffer, contentType });
        photoPreviewUrl = String(result?.photoPreviewUrl || "").trim();
      }

      if (!photoPreviewUrl) {
        return res.status(500).json({ ok: false, error: "UPLOAD_FAILED" });
      }

      return res.json({
        ok: true,
        url: photoPreviewUrl,
        photoPreviewUrl,
        fileId: "",
      });
    } catch (e) {
      const message = String(
        e?.response?.description || e?.message || e || "SERVER_ERROR"
      );
      console.error("POST /crm/catalog/upload-media error:", e);
      return res.status(500).json({
        ok: false,
        error: "SERVER_ERROR",
        message,
      });
    }
  }
);

export default router;
