import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

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
          {
            productKey: 1,
            categoryKey: 1,
            price: 1,
            title1: 1,
            title2: 1,
            newBadge: 1,
            flavors: 1,
          }
        ).lean()
      : [];

    const prodByKeyForValidation = new Map(
      pricingProducts.map((p) => [String(p.productKey), p])
    );
    for (const it of cleanItemsBase) {
      const prod = prodByKeyForValidation.get(it.productKey);
      if (!prod) {
        return res.status(400).json({
          ok: false,
          error: "PRODUCT_NOT_FOUND",
          productKey: it.productKey,
        });
      }
      const hasFlavor = (prod.flavors || []).some(
        (f) => String(f?.flavorKey || "").trim() === it.flavorKey
      );
      if (!hasFlavor) {
        return res.status(400).json({
          ok: false,
          error: "FLAVOR_NOT_IN_PRODUCT",
          productKey: it.productKey,
          flavorKey: it.flavorKey,
        });
      }
    }

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

    // ================= STOCK CONTEXT (без reservedQty) =================
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

    const nextContextId = stockContextIdFor({
      type: finalCheckoutDeliveryType,
      method: finalCheckoutDeliveryMethod,
      pickupPointId: finalCheckoutPickupPointId,
    });

    const nextStockContextId = nextContextId ? String(nextContextId) : "";

    const cleanItemsWithReserveContext = cleanItems.map((item) => ({
      ...item,
      stockContextId: nextStockContextId,
    }));

    const cartAutoClearAt = null;

    console.log("[CART][CTX]", {
      telegramId,
      stockContextId: nextStockContextId,
      itemCount: cleanItemsWithReserveContext.length,
    });

    // ================= END STOCK RESERVATION =================

    console.log("[CART][SAVE][FINAL]", {
      telegramId,
      stockContextId: nextStockContextId,
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
