import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

// ===== Public: categories =====

app.get("/categories", async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "1") === "1";
    const cacheKey = `categories:${onlyActive ? "1" : "0"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = onlyActive ? { isActive: true } : {};
    const categories = await Category.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const payload = { ok: true, categories };
    cacheSet(cacheKey, payload, 60 * 1000);
    res.json(payload);
  } catch (e) {
    console.error("GET /categories error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: создать категорию =====
app.post("/admin/categories", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) {
      return res.status(400).json({ ok: false, error: "title is required" });
    }

    // auto key if omitted
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
      badgeSide: (b.badgeSide === "right" ? "right" : "left"),
      sortOrder: Number(b.sortOrder || 0),
    });

    return res.json({ ok: true, category: created });
  } catch (e) {
    console.error("POST /admin/categories error:", e);
    // duplicate key
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Category key already exists" });
    }
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: обновить категорию =====
app.patch("/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const update = {};
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

    for (const k of allow) {
      if (b[k] !== undefined) update[k] = b[k];
    }

    if (update.key !== undefined) update.key = String(update.key);
    if (update.title !== undefined) update.title = String(update.title);
    if (update.sortOrder !== undefined) update.sortOrder = Number(update.sortOrder || 0);
    if (update.showOverlay !== undefined) update.showOverlay = !!update.showOverlay;
    if (update.badgeSide !== undefined) {
      update.badgeSide = (update.badgeSide === "right" ? "right" : "left");
    }

    const cat = await Category.findByIdAndUpdate(id, update, { new: true });
    if (!cat) return res.status(404).json({ ok: false, error: "Category not found" });

    return res.json({ ok: true, category: cat });
  } catch (e) {
    console.error("PATCH /admin/categories/:id error:", e);
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Category key already exists" });
    }
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Public: получить товары (с фильтром по categoryKey) =====

app.get("/products", async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "1") === "1";
    const categoryKey = req.query.categoryKey ? String(req.query.categoryKey) : "";
    const cacheKey = `products:${onlyActive ? "1" : "0"}:${categoryKey}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = onlyActive ? { isActive: true } : {};
    if (categoryKey) filter.categoryKey = categoryKey;

    const products = await Product.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();

    // totalsByManager (общее количество по товару для каждого менеджера)
    const withTotals = products.map((p) => {
      const map = new Map(); // managerTelegramId -> { totalQty, availableFlavorsCount }

      for (const fl of p.flavors || []) {
        if (fl.isActive === false) continue;

        for (const s of fl.stockByPickupPoint || []) {
          const mid = String(s.pickupPointId || "");
          if (!mid) continue;

          const qty = Number(s.totalQty || 0);
          const cur = map.get(mid) || { pickupPointId: mid, totalQty: 0, availableFlavorsCount: 0 };
          cur.totalQty += qty;
          if (qty > 0) cur.availableFlavorsCount += 1;

          map.set(mid, cur);
        }
      }

      return { ...p, totalsByPickupPoint: Array.from(map.values()) };
    });

    const payload = { ok: true, products: withTotals };
    cacheSet(cacheKey, payload, 30 * 1000);
    res.json(payload);
  } catch (e) {
    console.error("GET /products error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

}
