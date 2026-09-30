import { getServerContext } from "../../lib/server/context.js";

export function registerRoutes(app) {
  Object.assign(globalThis, getServerContext());

// ===== Public: get cart by telegramId =====
app.get("/cart", async (req, res) => {
  try {
    // const telegramId = String(req.query.telegramId || "").trim();
    // if (!telegramId) {
    //   return res.status(400).json({ ok: false, error: "telegramId is required" });
    // }

    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;

    const cart = await Cart.findOne({ telegramId }).lean();

    const safeCart =
      cart || {
        telegramId,
        items: [],
        checkoutDeliveryType: null,
        checkoutDeliveryMethod: null,
        checkoutPickupPointId: null,
        arrivalTime: null,
      };

    const safeItems = Array.isArray(safeCart.items) ? safeCart.items : [];

    const applied = safeItems.some(
      (it) => Number(it?.referralFirstOrderDiscountPercent || 0) > 0
    );

    const percent = applied
      ? Math.max(
          0,
          ...safeItems.map((it) => Number(it?.referralFirstOrderDiscountPercent || 0))
        )
      : 0;

    const totalDiscountZl = Number(
      safeItems
        .reduce(
          (sum, it) => sum + Number(it?.referralFirstOrderDiscountTotalZl || 0),
          0
        )
        .toFixed(2)
    );

    const totalBeforeDiscount = Number(
      safeItems
        .reduce((sum, it) => {
          const qty = Math.max(1, Number(it?.qty || 1));
          const unitPrice = Number(it?.unitPrice || 0);
          const discountPerItem = Number(it?.referralFirstOrderDiscountPerItem || 0);
          return sum + qty * (unitPrice + discountPerItem);
        }, 0)
        .toFixed(2)
    );

    let reason = null;

    if (!applied) {
      const eligibility = await getIsReferralFirstOrderDiscountEligible(telegramId, safeItems);
      reason = eligibility?.reason || null;
    }

    return res.json({
      ok: true,
      cart: safeCart,
      referralFirstOrderDiscount: {
        eligible: applied
          ? true
          : ![
              "NO_USED_REFERRAL_CODE",
              "INVITER_NOT_FOUND",
              "FIRST_ORDER_ALREADY_DONE",
              "PAID_ORDER_ALREADY_EXISTS",
            ].includes(reason),
        applied,
        percent,
        totalBeforeDiscount,
        totalDiscountZl,
        reason,
      },
    });
  } catch (e) {
    console.error("GET /cart error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.delete("/cart/item", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;
    const itemKey = String(req.body?.itemKey || "").trim();

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    if (!itemKey) {
      return res.status(400).json({ ok: false, error: "itemKey is required" });
    }

    const [productKeyRaw, flavorKeyRaw] = itemKey.split("__");
    const productKey = String(productKeyRaw || "").trim();
    const flavorKey = String(flavorKeyRaw || "").trim();

    if (!productKey || !flavorKey) {
      return res.status(400).json({ ok: false, error: "itemKey is invalid" });
    }

    const cart = await Cart.findOne({ telegramId });
    if (!cart) {
      return res.json({ ok: true, cart: { telegramId, items: [] } });
    }

    const existingItems = Array.isArray(cart.items) ? cart.items : [];

    const itemToRemove = existingItems.find(
      (it) =>
        String(it?.productKey || "").trim() === productKey &&
        String(it?.flavorKey || "").trim() === flavorKey
    );

    if (!itemToRemove) {
      return res.json({ ok: true, cart });
    }

    const removeQty = Math.max(1, Number(itemToRemove?.qty || 1));

    const normId = (v) => String(v || "").trim().replace(/,+$/, "");
    const toObjId = (v) => {
      const s = normId(v);
      return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
    };

    const [courierPP, inpostPP] = await Promise.all([
      PickupPoint.findOne({ key: { $in: ["delivery", "delivery,"] } }, { _id: 1, key: 1 }).lean(),
      PickupPoint.findOne({ key: { $in: ["delivery-2", "delivery-2,"] } }, { _id: 1, key: 1 }).lean(),
    ]);

    const courierWarehouseId = courierPP?._id || null;
    const inpostWarehouseId = inpostPP?._id || null;

    const stockContextIdFor = ({ type, method, pickupPointId }) => {
      if (type === "pickup") return toObjId(pickupPointId);
      if (type === "delivery") {
        if (method === "inpost") return inpostWarehouseId;
        return courierWarehouseId;
      }
      return null;
    };

    const contextId = stockContextIdFor({
      type: cart.checkoutDeliveryType,
      method: cart.checkoutDeliveryMethod,
      pickupPointId: cart.checkoutPickupPointId,
    });

    const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

    if (contextId) {
      const fkNorm = normFlavorKey(flavorKey);
      const fkCandidates = Array.from(
        new Set([String(flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );

      const ppCandidates = [contextId, String(contextId)].filter(Boolean);

      await Product.updateOne(
        {
          productKey,
          "flavors.flavorKey": { $in: fkCandidates },
          "flavors.stockByPickupPoint.pickupPointId": { $in: ppCandidates },
        },
        {
          $inc: {
            "flavors.$[f].stockByPickupPoint.$[s].reservedQty": -removeQty,
          },
        },
        {
          arrayFilters: [
            { "f.flavorKey": { $in: fkCandidates } },
            { "s.pickupPointId": { $in: ppCandidates } },
          ],
        }
      );

      await Product.updateOne(
        {
          productKey,
          "flavors.flavorKey": { $in: fkCandidates },
          "flavors.stockByPickupPoint.pickupPointId": { $in: ppCandidates },
        },
        {
          $max: {
            "flavors.$[f].stockByPickupPoint.$[s].reservedQty": 0,
          },
        },
        {
          arrayFilters: [
            { "f.flavorKey": { $in: fkCandidates } },
            { "s.pickupPointId": { $in: ppCandidates } },
          ],
        }
      );
    }

    cart.items = existingItems.filter(
      (it) =>
        !(
          String(it?.productKey || "").trim() === productKey &&
          String(it?.flavorKey || "").trim() === flavorKey
        )
    );

    await cart.save();

    return res.json({ ok: true, cart });
  } catch (e) {
    console.error("DELETE /cart/item error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Public: replace cart (save full state) =====
app.put("/cart", async (req, res) => {
  try {
    const b = req.body || {};
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;

    const items = Array.isArray(b.items) ? b.items : [];

    const checkoutPickupPointId = b.checkoutPickupPointId || null;

    const checkoutDeliveryType =
      b.checkoutDeliveryType === "pickup" || b.checkoutDeliveryType === "delivery"
        ? b.checkoutDeliveryType
        : null;

    const checkoutDeliveryMethod =
      b.checkoutDeliveryMethod === "courier" || b.checkoutDeliveryMethod === "inpost"
        ? b.checkoutDeliveryMethod
        : null;

      const courierAddress =
        b.courierAddress === null || b.courierAddress === undefined
          ? null
          : String(b.courierAddress || "").trim();

      const arrivalTime =
        b.arrivalTime === null || b.arrivalTime === undefined
          ? null
          : String(b.arrivalTime || "").trim();

      const deliveryPricing = await resolveWarsawDeliveryPricing(courierAddress);
      const courierDistrict = deliveryPricing.districtLabel || null;
      const deliveryFeeZl = deliveryPricing.matched ? Number(deliveryPricing.deliveryFeeZl || 0) : 0;

      const deliveryTimeWindow =
        b.deliveryTimeWindow === null || b.deliveryTimeWindow === undefined
          ? null
          : String(b.deliveryTimeWindow || "").trim();

      const inpostDataRaw = b.inpostData && typeof b.inpostData === "object" ? b.inpostData : {};

      const inpostData = {
        fullName:
          inpostDataRaw.fullName === null || inpostDataRaw.fullName === undefined
            ? null
            : String(inpostDataRaw.fullName || "").trim(),
        phone:
          inpostDataRaw.phone === null || inpostDataRaw.phone === undefined
            ? null
            : String(inpostDataRaw.phone || "").trim(),
        email:
          inpostDataRaw.email === null || inpostDataRaw.email === undefined
            ? null
            : String(inpostDataRaw.email || "").trim(),
        city:
          inpostDataRaw.city === null || inpostDataRaw.city === undefined
            ? null
            : String(inpostDataRaw.city || "").trim(),
        lockerAddress:
          inpostDataRaw.lockerAddress === null || inpostDataRaw.lockerAddress === undefined
            ? null
            : String(inpostDataRaw.lockerAddress || "").trim(),
      };


    const comment =
      b.comment === null || b.comment === undefined
        ? null
        : String(b.comment || "").trim().slice(0, 500) || null;

    const forceCheckoutSelection = !!b.forceCheckoutSelection;

    // минимальная нормализация
    const cleanItemsBase = items
      .map((it) => ({
        productKey: String(it.productKey || "").trim(),
        flavorKey: String(it.flavorKey || "").trim(),
        qty: Math.max(1, Number(it.qty || 1)),

        // цена будет пересчитана ниже по smart-price логике
        unitPrice: Number(it.unitPrice || 0),
        baseUnitPrice: Number(it.baseUnitPrice || it.unitPrice || 0),
        referralFirstOrderDiscountPercent: Number(it.referralFirstOrderDiscountPercent || 0),
        referralFirstOrderDiscountPerItem: Number(it.referralFirstOrderDiscountPerItem || 0),
        referralFirstOrderDiscountTotalZl: Number(it.referralFirstOrderDiscountTotalZl || 0),

        // для UI вкуса
        flavorLabel: String(it.flavorLabel || ""),
        gradient: Array.isArray(it.gradient) ? it.gradient.slice(0, 2) : [],
      }))
      .filter((it) => it.productKey && it.flavorKey);

    const pricingProductKeys = Array.from(
      new Set(cleanItemsBase.map((it) => String(it.productKey || "").trim()).filter(Boolean))
    );

    const pricingProducts = pricingProductKeys.length
      ? await Product.find(
          { productKey: { $in: pricingProductKeys } },
          { productKey: 1, categoryKey: 1, price: 1, title1: 1, title2: 1 }
        ).lean()
      : [];

  const { repricedItems: smartPricedItems, smartPricingMeta } =
    repriceCartItemsWithSmartPricing(cleanItemsBase, pricingProducts);

  const referralFirstOrderDiscountEligibility =
    await getIsReferralFirstOrderDiscountEligible(telegramId, smartPricedItems);

  const {
    items: cleanItems,
    meta: referralFirstOrderDiscountMeta,
  } = referralFirstOrderDiscountEligibility.eligible
    ? applyReferralFirstOrderDiscountToCartItems(
        smartPricedItems,
        referralFirstOrderDiscountEligibility.percent
      )
    : {
        items: smartPricedItems.map((it) => ({
          ...it,
          referralFirstOrderDiscountPercent: 0,
          referralFirstOrderDiscountPerItem: 0,
          referralFirstOrderDiscountTotalZl: 0,
        })),
        meta: {
          applied: false,
          usedCode: String(referralFirstOrderDiscountEligibility.usedCode || "").trim(),
          percent: 0,
          totalBeforeDiscount: referralFirstOrderDiscountEligibility.totalBeforeDiscount,
          totalDiscountZl: 0,
          reason: referralFirstOrderDiscountEligibility.reason,
        },
      };

    const existing = await Cart.findOne({ telegramId }).lean();

    const prevType = existing?.checkoutDeliveryType ?? null;
    const prevMethod = existing?.checkoutDeliveryMethod ?? null;
    const prevPickup = existing?.checkoutPickupPointId ?? null;

    const existingItemsCount = Array.isArray(existing?.items) ? existing.items.length : 0;
    const nextItemsCount = Array.isArray(cleanItems) ? cleanItems.length : 0;

    const isStartingNewCart = existingItemsCount === 0 && nextItemsCount > 0;
    const isClearingCart = nextItemsCount === 0;

    const finalCheckoutDeliveryType = isClearingCart
      ? null
      : isStartingNewCart && checkoutDeliveryType
      ? checkoutDeliveryType
      : forceCheckoutSelection && checkoutDeliveryType
      ? checkoutDeliveryType
      : String(existing?.checkoutDeliveryType || checkoutDeliveryType || "pickup");

    const finalCheckoutDeliveryMethod =
      finalCheckoutDeliveryType === "delivery"
        ? (isStartingNewCart && checkoutDeliveryMethod
            ? checkoutDeliveryMethod
            : forceCheckoutSelection && checkoutDeliveryMethod
            ? checkoutDeliveryMethod
            : String(existing?.checkoutDeliveryMethod || checkoutDeliveryMethod || "courier"))
        : "courier";

    const products = await Product.find(
      {
        productKey: {
          $in: [...new Set(cleanItems.map((it) => String(it?.productKey || "").trim()).filter(Boolean))],
        },
      },
      {
        productKey: 1,
        price: 1,
        categoryKey: 1,
      }
    ).lean();


const inpostPricing =
  finalCheckoutDeliveryType === "delivery" && finalCheckoutDeliveryMethod === "inpost"
    ? resolveInpostDeliveryPricing(cleanItems, products)
    : { packageUnits: 0, deliveryFeeZl: 0 };

    const finalCheckoutPickupPointId = isClearingCart
      ? null
      : finalCheckoutDeliveryType !== "pickup"
      ? null
      : isStartingNewCart
      ? checkoutPickupPointId
      : forceCheckoutSelection
      ? checkoutPickupPointId
      : (prevPickup ?? checkoutPickupPointId ?? null);

    // ✅ Guard: pickup requires a pickup point when cart has items
    if (finalCheckoutDeliveryType === "pickup" && !finalCheckoutPickupPointId && cleanItems.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "pickupPointId is required for pickup when cart has items",
      });
    }

    // if (
    //   forceCheckoutSelection &&
    //   finalCheckoutDeliveryType === "delivery" &&
    //   finalCheckoutDeliveryMethod === "courier" &&
    //   cleanItems.length > 0
    // ) {
    //   if (!String(courierAddress || "").trim()) {
    //     return res.status(400).json({
    //       ok: false,
    //       field: "courierAddress",
    //       error: "Для доставки курьером нужно заполнить адрес доставки.",
    //     });
    //   }

    //   if (!String(deliveryTimeWindow || "").trim()) {
    //     return res.status(400).json({
    //       ok: false,
    //       field: "deliveryTimeWindow",
    //       error: "Для доставки курьером нужно выбрать временной промежуток",
    //     });
    //   }
    // }

    // ================= STOCK RESERVATION (reservedQty) =================
    // Goal: when items are in the cart, we reserve their qty on the selected stock context
    // (pickup point OR delivery warehouse), so other users can't over-buy.

    const normPPKey = (v) => String(v || "").trim().toLowerCase().replace(/,+$/, "");

    // Delivery warehouses are stored as PickupPoints with key "delivery" and "delivery-2"
    const [courierPP, inpostPP] = await Promise.all([
      PickupPoint.findOne({ key: { $in: ["delivery", "delivery,"] } }, { _id: 1, key: 1 }).lean(),
      PickupPoint.findOne({ key: { $in: ["delivery-2", "delivery-2,"] } }, { _id: 1, key: 1 }).lean(),
    ]);

    const courierWarehouseId = courierPP?._id || null;
    const inpostWarehouseId = inpostPP?._id || null;

    const normId = (v) => String(v || "").trim().replace(/,+$/, "");
    const toObjId = (v) => {
      const s = normId(v);
      return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
    };

    const stockContextIdFor = ({ type, method, pickupPointId }) => {
      if (type === "pickup") return toObjId(pickupPointId);
      if (type === "delivery") {
        if (method === "inpost") return inpostWarehouseId;
        return courierWarehouseId;
      }
      return null;
    };

    const getLinkedContextIds = async (contextId) => {
      if (!contextId) return [];
      const ids = await getSyncedPickupPointIdsByAnyPoint(contextId);
      return ids.map((id) => toObjId(id)).filter(Boolean);
    };

    const prevContextId = stockContextIdFor({
      type: prevType,
      method: prevMethod,
      pickupPointId: prevPickup,
    });

    const nextContextId = stockContextIdFor({
      type: finalCheckoutDeliveryType,
      method: finalCheckoutDeliveryMethod,
      pickupPointId: finalCheckoutPickupPointId,
    });

    const nextStockContextId = nextContextId ? String(nextContextId) : "";

    const existingCartAutoClearAt = existing?.cartAutoClearAt
      ? new Date(existing.cartAutoClearAt)
      : null;

    const cleanItemsWithReserveContext = cleanItems.map((item) => ({
      ...item,
      stockContextId: nextStockContextId,
      reservedContextId: nextStockContextId,
    }));

    // ===== DEBUG: stock context mismatch catcher =====
    const dbg = {
      telegramId,
      prev: {
        type: prevType,
        method: prevMethod,
        pickupPointId: prevPickup,
        contextId: prevContextId ? String(prevContextId) : null,
      },
      next: {
        type: finalCheckoutDeliveryType,
        method: finalCheckoutDeliveryMethod,
        pickupPointId: finalCheckoutPickupPointId,
        contextId: nextContextId ? String(nextContextId) : null,
      },
      deliveryWarehouses: {
        courierWarehouseId: courierWarehouseId ? String(courierWarehouseId) : null,
        inpostWarehouseId: inpostWarehouseId ? String(inpostWarehouseId) : null,
      },
      cartCounts: {
        prevItems: Array.isArray(existing?.items) ? existing.items.length : 0,
        nextItems: Array.isArray(cleanItems) ? cleanItems.length : 0,
      },
    };

    console.log("[CART][CTX]", JSON.stringify(dbg));

    if (cleanItems.length && !nextContextId) {
      console.warn("[CART][CTX][WARN] Items present but nextContextId is null — reservation will NOT be applied", JSON.stringify(dbg));
    }

    if (prevContextId && nextContextId && String(prevContextId) !== String(nextContextId)) {
      console.warn("[CART][CTX][WARN] Context changed — will release prev and reserve next", JSON.stringify(dbg));
    }
    // ===== /DEBUG =====

    const sumItems = (itemsArr) => {
      const map = new Map();
      for (const it of Array.isArray(itemsArr) ? itemsArr : []) {
        const pk = String(it.productKey || "").trim();
        const fk = String(it.flavorKey || "").trim();
        if (!pk || !fk) continue;
        const key = `${pk}__${fk}`;
        const qty = Math.max(1, Number(it.qty || 1));
        map.set(key, (map.get(key) || 0) + qty);
      }
      return map;
    };

    const prevSum = sumItems(existing?.items);
    const nextSum = sumItems(cleanItemsWithReserveContext);

    const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

    const checkReserveAvailable = async ({ productKey, flavorKey, pickupPointId, delta }) => {
        const normId = (v) => String(v || "").trim().replace(/,+$/, "");
        const toObjId = (v) => {
          if (v instanceof mongoose.Types.ObjectId) return v;
          if (v && typeof v === "object" && mongoose.isValidObjectId(String(v))) {
            return new mongoose.Types.ObjectId(String(v));
          }
          const s = normId(v);
          return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
        };

      const ppObj = toObjId(pickupPointId);
      if (!ppObj) return;

      if (!Number.isFinite(delta) || delta <= 0) return;

      const linkedPointIds = await getLinkedContextIds(ppObj);
      const pointIdsToCheck = linkedPointIds.length ? linkedPointIds : [ppObj];

      const fkNorm = normFlavorKey(flavorKey);
      const fkCandidates = Array.from(
        new Set([String(flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );

      const prod = await Product.findOne(
        { productKey, "flavors.flavorKey": { $in: fkCandidates } },
        { flavors: 1 }
      ).lean();

      const fl = (prod?.flavors || []).find((f) =>
        fkCandidates.includes(String(f?.flavorKey || "").trim())
      );

      if (!fl) {
        const err = new Error("RESERVE_CONFLICT");
        err.meta = {
          productKey,
          flavorKey: fkCandidates[0],
          pickupPointId: String(ppObj),
          total: 0,
          reserved: 0,
          delta,
          reason: "FLAVOR_NOT_FOUND",
        };
        throw err;
      }

      const stockRows = (fl.stockByPickupPoint || []).filter((s) =>
        pointIdsToCheck.some((pointId) => String(s?.pickupPointId) === String(pointId))
      );

      const total = stockRows.length
        ? Math.min(...stockRows.map((row) => Number(row?.totalQty || 0)))
        : 0;

      const reserved = stockRows.length
        ? Math.max(...stockRows.map((row) => Number(row?.reservedQty || 0)))
        : 0;

      const available = Math.max(0, total - reserved);

      if (available < delta) {
        const err = new Error("RESERVE_CONFLICT");
        err.meta = {
          productKey,
          flavorKey: fkCandidates[0],
          pickupPointId: String(ppObj),
          total,
          reserved,
          delta,
          reason: "NOT_ENOUGH_AVAILABLE",
        };
        throw err;
      }
    };

    const applyReservedDelta = async ({ productKey, flavorKey, pickupPointId, delta }) => {
      const normId = (v) => String(v || "").trim().replace(/,+$/, "");
      const toObjId = (v) => {
        if (v instanceof mongoose.Types.ObjectId) return v;
        if (v && typeof v === "object" && mongoose.isValidObjectId(String(v))) {
          return new mongoose.Types.ObjectId(String(v));
        }
        const s = normId(v);
        return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
      };

      const ppObj = toObjId(pickupPointId);
      if (!ppObj) return;
      if (!Number.isFinite(delta) || delta === 0) return;

      const linkedPointIds = await getLinkedContextIds(ppObj);
      const pointIdsToApply = linkedPointIds.length ? linkedPointIds : [ppObj];

      const fkNorm = normFlavorKey(flavorKey);
      const fkCandidates = Array.from(
        new Set([String(flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );

      console.log("[CART][RESERVE][DELTA]", {
        telegramId,
        productKey,
        flavorKey,
        pickupPointIds: pointIdsToApply.map((id) => String(id)),
        delta,
        fkCandidates,
      });
      const session = await mongoose.startSession();
      const MAX_RETRIES = 3;

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await session.withTransaction(async () => {
              // 1) читаем нужные данные (внутри транзакции)
              const prod = await Product.findOne(
                { productKey, "flavors.flavorKey": { $in: fkCandidates } },
                { flavors: 1 }
              ).session(session).lean();

              const fl = (prod?.flavors || []).find((f) =>
                fkCandidates.includes(String(f?.flavorKey || "").trim())
              );

              if (!fl) return;

              const rowsByPointId = new Map(
                (fl.stockByPickupPoint || []).map((row) => [String(row?.pickupPointId || ""), row])
              );

              // 2) если строки склада нет — создаём для всех синхронизированных точек
              for (const pointId of pointIdsToApply) {
                if (rowsByPointId.has(String(pointId))) continue;

                await Product.updateOne(
                  { productKey, "flavors.flavorKey": { $in: fkCandidates } },
                  {
                    $push: {
                      "flavors.$[f].stockByPickupPoint": {
                        pickupPointId: pointId,
                        totalQty: 0,
                        reservedQty: 0,
                      },
                    },
                  },
                  {
                    session,
                    arrayFilters: [{ "f.flavorKey": { $in: fkCandidates } }],
                  }
                );
              }

              const prod2 = await Product.findOne(
                { productKey, "flavors.flavorKey": { $in: fkCandidates } },
                { flavors: 1 }
              ).session(session).lean();

              const fl2 = (prod2?.flavors || []).find((f) =>
                fkCandidates.includes(String(f?.flavorKey || "").trim())
              );

              const linkedRows = (fl2?.stockByPickupPoint || []).filter((row) =>
                pointIdsToApply.some((pointId) => String(row?.pickupPointId) === String(pointId))
              );

              const total = linkedRows.length
                ? Math.min(...linkedRows.map((row) => Number(row?.totalQty || 0)))
                : 0;

              const reserved = linkedRows.length
                ? Math.max(...linkedRows.map((row) => Number(row?.reservedQty || 0)))
                : 0;

              // 3) ГАРД: не даём зарезервировать больше доступного
              if (delta > 0) {
                const available = Math.max(0, total - reserved);
                if (available < delta) {
                  const err = new Error("RESERVE_CONFLICT");
                  err.meta = {
                    productKey,
                    flavorKey: fkCandidates[0],
                    pickupPointIds: pointIdsToApply.map((pointId) => String(pointId)),
                    total,
                    reserved,
                    delta,
                  };
                  throw err;
                }
              }

            // 4) инкремент резерва на всех синхронизированных точках
            for (const pointId of pointIdsToApply) {
              await Product.updateOne(
                {
                  productKey,
                  "flavors.flavorKey": { $in: fkCandidates },
                  "flavors.stockByPickupPoint.pickupPointId": pointId,
                },
                {
                  $inc: {
                    "flavors.$[f].stockByPickupPoint.$[s].reservedQty": delta,
                  },
                },
                {
                  session,
                  arrayFilters: [
                    { "f.flavorKey": { $in: fkCandidates } },
                    { "s.pickupPointId": pointId },
                  ],
                }
              );
            }

            // 5) защита от отрицательного резерва / синхронизация reserve <= total
            for (const pointId of pointIdsToApply) {
              await Product.updateOne(
                { productKey },
                [
                  {
                    $set: {
                      flavors: {
                        $map: {
                          input: "$flavors",
                          as: "f",
                          in: {
                            $cond: [
                              { $in: ["$$f.flavorKey", fkCandidates] },
                              {
                                $mergeObjects: [
                                  "$$f",
                                  {
                                    stockByPickupPoint: {
                                      $map: {
                                        input: "$$f.stockByPickupPoint",
                                        as: "s",
                                        in: {
                                          $cond: [
                                            { $eq: ["$$s.pickupPointId", pointId] },
                                            {
                                              $let: {
                                                vars: {
                                                  safeTotal: {
                                                    $max: [0, { $ifNull: ["$$s.totalQty", 0] }],
                                                  },
                                                  safeReservedRaw: {
                                                    $max: [0, { $ifNull: ["$$s.reservedQty", 0] }],
                                                  },
                                                },
                                                in: {
                                                  $mergeObjects: [
                                                    "$$s",
                                                    {
                                                      totalQty: "$$safeTotal",
                                                      reservedQty: {
                                                        $min: ["$$safeReservedRaw", "$$safeTotal"],
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                            },
                                            "$$s",
                                          ],
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                              "$$f",
                            ],
                          },
                        },
                      },
                    },
                  },
                ],
                { session }
              );
            }
          });

            // успех — выходим из retry loop
            return;
          } catch (e) {
            if (e && String(e.message) === "RESERVE_CONFLICT") throw e;

            const msg = String(e?.message || "");
            const isTransient =
              msg.includes("WriteConflict") ||
              msg.includes("TransientTransactionError") ||
              msg.includes("write conflict");

            if (isTransient && attempt < MAX_RETRIES) continue;

            throw e;
          }
        }
      } finally {
        try { session.endSession(); } catch {}
      }
    };

    // Build reservation deltas
    const deltas = [];

    if (prevContextId && nextContextId && String(prevContextId) === String(nextContextId)) {
      // same context: apply only diffs
      const allKeys = new Set([...prevSum.keys(), ...nextSum.keys()]);
      for (const k of allKeys) {
        const [productKey, flavorKey] = k.split("__");
        const before = prevSum.get(k) || 0;
        const after = nextSum.get(k) || 0;
        const delta = after - before;
        if (delta !== 0) deltas.push({ productKey, flavorKey, pickupPointId: nextContextId, delta });
      }
    } else {
      // context changed (or one is missing): release prev, reserve next
      if (prevContextId) {
        for (const [k, qty] of prevSum.entries()) {
          const [productKey, flavorKey] = k.split("__");
          deltas.push({ productKey, flavorKey, pickupPointId: prevContextId, delta: -qty });
        }
      }
      if (nextContextId) {
        for (const [k, qty] of nextSum.entries()) {
          const [productKey, flavorKey] = k.split("__");
          deltas.push({ productKey, flavorKey, pickupPointId: nextContextId, delta: qty });
        }
      }
    }

    // Apply deltas sequentially (simple + safe). If you ever need speed, we can batch later.
for (const d of deltas) {
  if (Number(d.delta) <= 0) continue;

  try {
    await checkReserveAvailable(d);
  } catch (e) {
    if (e?.message === "RESERVE_CONFLICT") {
      return res.status(409).json({
        ok: false,
        error: "OUT_OF_STOCK",
        message: "Not enough stock to reserve items",
        meta: e.meta || null,
      });
    }

    return res.status(500).json({
      ok: false,
      error: "RESERVE_CHECK_FAILED",
      message: "Failed to check item reserve",
    });
  }
}

for (const d of deltas) {
  try {
    await applyReservedDelta(d);
  } catch (e) {
    if (e?.message === "RESERVE_CONFLICT") {
      return res.status(409).json({
        ok: false,
        error: "OUT_OF_STOCK",
        message: "Not enough stock to reserve items",
        meta: e.meta || null,
      });
    }

    console.error("reservedQty update failed", d, e);
    return res.status(500).json({
      ok: false,
      error: "RESERVE_UPDATE_FAILED",
      message: "Failed to update item reserve",
    });
  }
}

    const hasCartItems = cleanItemsWithReserveContext.length > 0;
    const hasReserveDelta = deltas.some((d) => Number(d?.delta || 0) !== 0);

    const shouldResetCartAutoClearTimer =
      hasCartItems && (!existingCartAutoClearAt || hasReserveDelta);

    const cartAutoClearAt = hasCartItems
      ? shouldResetCartAutoClearTimer
        ? new Date(Date.now() + Math.max(1, Number(CART_AUTO_CLEAR_AFTER_MINUTES || 10)) * 60 * 1000)
        : existingCartAutoClearAt
      : null;


    // ================= END STOCK RESERVATION =================

    console.log("[CART][SAVE][FINAL]", {
      telegramId,
      deltas,
      stockContextId: nextStockContextId,
      cartAutoClearAt,
      cleanItems: cleanItemsWithReserveContext,
    });

    const updated = await Cart.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          telegramId,
          items: cleanItemsWithReserveContext,
          stockContextId: isClearingCart ? "" : nextStockContextId,
          reservedContextId: isClearingCart ? "" : nextStockContextId,
          cartAutoClearAt,

          checkoutDeliveryType: finalCheckoutDeliveryType,
          checkoutDeliveryMethod: finalCheckoutDeliveryMethod,
          checkoutPickupPointId: finalCheckoutPickupPointId,

          checkout: isClearingCart
            ? {}
            : {
                stockContextId: nextStockContextId,
                reservedContextId: nextStockContextId,
                deliveryType: finalCheckoutDeliveryType,
                deliveryMethod: finalCheckoutDeliveryMethod,
                pickupPointId: finalCheckoutPickupPointId,
              },

          courierAddress,
          inpostData,
          arrivalTime,
          deliveryTimeWindow,
          comment,

          courierDistrict:
            finalCheckoutDeliveryType === "delivery" && finalCheckoutDeliveryMethod === "courier"
              ? courierDistrict
              : null,

          deliveryFeeZl:
            finalCheckoutDeliveryType === "delivery" && finalCheckoutDeliveryMethod === "courier"
              ? Number(deliveryPricing?.deliveryFeeZl || 0)
              : 0,

          inpostDeliveryFeeZl:
            finalCheckoutDeliveryType === "delivery" && finalCheckoutDeliveryMethod === "inpost"
              ? Number(inpostPricing.deliveryFeeZl || 0)
              : 0,

          inpostPackageUnits:
            finalCheckoutDeliveryType === "delivery" && finalCheckoutDeliveryMethod === "inpost"
              ? Number(inpostPricing.packageUnits || 0)
              : 0,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      ok: true,
      cart: updated,
      smartPricingMeta,
      referralFirstOrderDiscount: {
        eligible: referralFirstOrderDiscountEligibility.eligible,
        applied: Boolean(referralFirstOrderDiscountMeta?.applied),
        usedCode: String(referralFirstOrderDiscountMeta?.usedCode || "").trim(),
        percent: Number(referralFirstOrderDiscountMeta?.percent || 0),
        totalBeforeDiscount: Number(referralFirstOrderDiscountMeta?.totalBeforeDiscount || 0),
        totalDiscountZl: Number(referralFirstOrderDiscountMeta?.totalDiscountZl || 0),
        reason: referralFirstOrderDiscountEligibility.reason || null,
      },
    });
  } catch (e) {
    console.error("PUT /cart error:", e);
    if (String(e?.message || "").trim() === "RESERVE_CONFLICT") {
  return res.status(409).json({
    ok: false,
    error: "OUT_OF_STOCK",
    meta: e?.meta || null,
  });
}
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

}
