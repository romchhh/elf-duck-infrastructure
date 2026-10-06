import { bindApiGlobals } from "./bindApiGlobals.js";

export function registerRoutes(app) {
  bindApiGlobals();

app.post("/orders/confirm", async (req, res) => {
  console.time("orders/confirm total");
  try {
    const actor = resolveOrderShoppingActor(req, res);
    if (!actor) return;

    const telegramId = actor.telegramId;
    const isGuestOrder = Boolean(actor.isGuest);

    if (!isGuestOrder) {
      await persistShopBotIndexFromInitData(req, telegramId);
    }

    const orderShopBotIndex = !isGuestOrder
      ? resolveShopBotIndexFromRequest(req) ??
        (await resolveShopBotIndexForTelegramId(telegramId))
      : 0;

  console.time("orders/confirm load cart+user");

  let cart;
  let user;

  if (isGuestOrder) {
    cart = normalizeGuestCartPayload(req.body?.cart);
    const nameParts = String(actor.guestContact?.fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const firstName = nameParts[0] || actor.guestContact.fullName;
    const lastName = nameParts.slice(1).join(" ");

    await User.updateOne(
      { telegramId },
      {
        $set: {
          telegramId,
          firstName,
          lastName,
          username: "",
        },
      },
      { upsert: true }
    );

    if (!cart.inpostData?.fullName) {
      cart.inpostData = {
        ...(cart.inpostData || {}),
        fullName: actor.guestContact.fullName,
        phone: actor.guestContact.phone,
        email: actor.guestContact.email || cart.inpostData?.email || null,
      };
    }

    user = await User.findOne(
      { telegramId },
      { telegramId: 1, referral: 1 }
    ).lean();
  } else {
    [cart, user] = await Promise.all([
      Cart.findOne({ telegramId }).lean(),
      User.findOne(
        { telegramId },
        { telegramId: 1, referral: 1 }
      ).lean(),
    ]);
  }

  console.timeEnd("orders/confirm load cart+user");

    const referralDiscountMeta = {
      applied: Array.isArray(cart?.items)
        ? cart.items.some((it) => Number(it?.referralFirstOrderDiscountTotalZl || 0) > 0)
        : false,

      usedCode: String(user?.referral?.usedCode || "").trim(),

      percent: Array.isArray(cart?.items)
        ? Number(
            cart.items.find((it) => Number(it?.referralFirstOrderDiscountPercent || 0) > 0)
              ?.referralFirstOrderDiscountPercent || 0
          )
        : 0,

      totalDiscountZl: Number(
        (Array.isArray(cart?.items) ? cart.items : []).reduce((sum, it) => {
          return sum + Number(it?.referralFirstOrderDiscountTotalZl || 0);
        }, 0).toFixed(2)
      ),

      totalBeforeDiscount: Number(
        (Array.isArray(cart?.items) ? cart.items : []).reduce((sum, it) => {
          const qty = Math.max(1, Number(it?.qty || 1));
          const baseUnitPrice = Number(it?.baseUnitPrice || it?.unitPrice || 0);
          return sum + qty * baseUnitPrice;
        }, 0).toFixed(2)
      ),
    };

    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({ ok: false, error: "Cart is empty" });
    }

    const itemsTotalZl = cart.items.reduce((sum, it) => {
      const qty = Math.max(1, Number(it.qty || 1));
      const price = Number(it.unitPrice || 0);
      return sum + qty * price;
    }, 0);

    if (cart.checkoutDeliveryType === "delivery" && cart.checkoutDeliveryMethod === "courier") {
      if (!String(cart?.courierAddress || "").trim()) {
        return res.status(400).json({
          ok: false,
          field: "courierAddress",
          error: "Для доставки курьером нужно заполнить адрес доставки.",
        });
      }

      if (!String(cart?.deliveryTimeWindow || "").trim()) {
        return res.status(400).json({
          ok: false,
          field: "deliveryTimeWindow",
          error: "Для доставки курьером нужно выбрать временной промежуток",
        });
      }
    }

    // 1) delivery mapping (из Cart -> Order)
    const deliveryType = cart.checkoutDeliveryType === "pickup" ? "pickup" : "delivery";
    const deliveryMethod =
      deliveryType === "delivery"
        ? (cart.checkoutDeliveryMethod === "inpost"
            ? "inpost"
            : (cart.checkoutDeliveryMethod === "courier" ? "courier" : null))
        : null;

    if (
      deliveryType === "delivery" &&
      deliveryMethod === "courier" &&
      Number(itemsTotalZl || 0) < COURIER_MIN_ORDER_TOTAL_ZL
    ) {
      return res.status(400).json({
        ok: false,
        error: "COURIER_MIN_ORDER_NOT_REACHED",
        field: "courierMinOrder",
        message: `Courier delivery requires a minimum order of ${COURIER_MIN_ORDER_TOTAL_ZL} PLN`,
        minOrderZl: COURIER_MIN_ORDER_TOTAL_ZL,
      });
    }

    const isFreeCourierDelivery =
      itemsTotalZl >= FREE_COURIER_DELIVERY_THRESHOLD_ZL;

    const confirmedDeliveryPricing =
      deliveryType === "delivery" && deliveryMethod === "courier"
        ? (
            String(cart?.courierDistrict || "").trim() &&
            (Number(cart?.deliveryFeeZl || 0) > 0 || isFreeCourierDelivery)
              ? {
                  districtLabel: String(cart.courierDistrict || "").trim(),
                  deliveryFeeZl: isFreeCourierDelivery
                    ? 0
                    : Number(cart.deliveryFeeZl || 0),
                }
              : await resolveWarsawDeliveryPricing(
                  cart.courierAddress || "",
                  itemsTotalZl
                )
          )
        : { districtLabel: null, deliveryFeeZl: 0 };

    if (deliveryType === "delivery" && deliveryMethod === "courier") {
      const savedCourierDistrict = String(cart?.courierDistrict || "").trim();
      const savedDeliveryFeeZl = Number(cart?.deliveryFeeZl || 0);

      if (!savedCourierDistrict || (!isFreeCourierDelivery && savedDeliveryFeeZl <= 0)) {
        const deliveryPricing = await resolveWarsawDeliveryPricing(
          cart?.courierAddress || "",
          itemsTotalZl
        );

        if (!deliveryPricing.matched) {
          return res.status(400).json({
            ok: false,
            field: "courierAddress",
            error: "Не удалось определить район Варшавы по адресу. Укажите адрес точнее, например: Puławska 12, Warszawa.",
          });
        }
      }
    }

    const courierDeliveryFeeZl =
      deliveryType === "delivery" && deliveryMethod === "courier"
        ? (isFreeCourierDelivery
            ? 0
            : Number(confirmedDeliveryPricing?.deliveryFeeZl || cart.deliveryFeeZl || 0))
        : 0;

    const inpostDeliveryFeeZl =

      deliveryType === "delivery" && deliveryMethod === "inpost"

        ? Number(itemsTotalZl || 0) >= 200

          ? 0

          : Number(cart.inpostDeliveryFeeZl || 0)

        : 0;

    const totalZl = Number((itemsTotalZl + courierDeliveryFeeZl + inpostDeliveryFeeZl).toFixed(2));

    const orderDeliveryFeeZl =
      deliveryType === "delivery" && deliveryMethod === "courier"
        ? Number(courierDeliveryFeeZl || 0)
        : 0;

    const pickupPointId = deliveryType === "pickup" ? (cart.checkoutPickupPointId || null) : null;

    let schedulePoint = null;

    if (deliveryType === "pickup" && pickupPointId) {
      schedulePoint = await PickupPoint.findById(
        pickupPointId,
        { title: 1, address: 1, key: 1, scheduleByDate: 1 }
      ).lean();
    } else if (deliveryType === "delivery" && deliveryMethod === "courier") {
      schedulePoint = await PickupPoint.findOne(
        { key: { $in: ["delivery", "delivery,"] } },
        { title: 1, address: 1, key: 1, scheduleByDate: 1 }
      ).lean();
    } else if (deliveryType === "delivery" && deliveryMethod === "inpost") {
      schedulePoint = await PickupPoint.findOne(
        { key: { $in: ["delivery-2", "delivery-2,"] } },
        { title: 1, address: 1, key: 1, scheduleByDate: 1 }
      ).lean();
    }

    if (schedulePoint) {
      const isCourierDelivery =
        deliveryType === "delivery" && deliveryMethod === "courier";

      const openState = getPointOpenStateNow(schedulePoint);

      const courierWindowFitsSchedule = isCourierDelivery
        ? isTimeWindowInsidePointSchedule(schedulePoint, cart?.deliveryTimeWindow)
        : false;

      const isPickupOrder = deliveryType === "pickup";

        if (isPickupOrder) {
          const selectedArrivalTime = String(cart?.arrivalTime || "").trim();

          if (!selectedArrivalTime) {
            return res.status(400).json({
              ok: false,
              field: "arrivalTime",
              error: "Для самовывоза нужно выбрать время прибытия.",
            });
          }

          const selectedArrivalMinutes = timeToMinutes(selectedArrivalTime);
          const periods = Array.isArray(openState?.periods) ? openState.periods : [];
          const scheduleOpenFromMinutes = periods.length
            ? timeToMinutes(periods[0].openFrom)
            : openState?.openFrom
            ? timeToMinutes(openState.openFrom)
            : 0;
          const scheduleOpenToMinutes = periods.length
            ? timeToMinutes(periods[periods.length - 1].openTo)
            : openState?.openTo
            ? timeToMinutes(openState.openTo)
            : 24 * 60;

          // До відкриття зміни earliest = openFrom; під час зміни — не раніше now+10
          const minArrivalMinutes = Math.max(
            getWarsawNowMinutes() + 10,
            scheduleOpenFromMinutes
          );

          if (selectedArrivalMinutes < minArrivalMinutes) {
            return res.status(400).json({
              ok: false,
              field: "arrivalTime",
              error: `Выберите время прибытия не раньше ${minutesToTime(minArrivalMinutes)}.`,
              minArrivalTime: minutesToTime(minArrivalMinutes),
            });
          }

          if (selectedArrivalMinutes > scheduleOpenToMinutes) {
            return res.status(400).json({
              ok: false,
              field: "arrivalTime",
              error: `Выберите время прибытия не позже ${minutesToTime(scheduleOpenToMinutes)}.`,
            });
          }
        }

      // Замовлення на сьогодні: можна до відкриття і під час зміни; після openTo — ні.
      // «На завтра» немає — після 00:00 Warsaw з’являється новий день.
      const nowMinutes = getWarsawNowMinutes();
      const periods = Array.isArray(openState?.periods) ? openState.periods : [];
      const dayOpenFrom = periods[0]?.openFrom || openState?.openFrom || "";
      const dayOpenTo =
        periods[periods.length - 1]?.openTo || openState?.openTo || "";

      const noWorkingDay =
        openState?.reason === "NO_SCHEDULE" ||
        openState?.reason === "CLOSED_TODAY" ||
        openState?.reason === "NO_HOURS" ||
        !periods.length;

      const afterClose =
        !noWorkingDay &&
        dayOpenTo &&
        nowMinutes > timeToMinutes(dayOpenTo);

      const pointCannotAcceptToday = noWorkingDay || afterClose;

      if (
        pointCannotAcceptToday ||
        (isCourierDelivery && !courierWindowFitsSchedule)
      ) {
        const pointLabel =
          String(schedulePoint?.title || "").trim() ||
          String(schedulePoint?.address || "").trim() ||
          (deliveryType === "delivery" && deliveryMethod === "courier"
            ? "Курьер"
            : deliveryType === "delivery" && deliveryMethod === "inpost"
            ? "InPost"
            : "Точка самовывоза");

        const scheduleText =
          periods.length
            ? `График сегодня: ${periods
                .map((p) => `${p.openFrom}–${p.openTo}`)
                .join(", ")}.`
            : dayOpenFrom && dayOpenTo
            ? `График сегодня: ${dayOpenFrom}–${dayOpenTo}.`
            : `График на сегодня не настроен.`;

        const selectedWindowText =
          isCourierDelivery && String(cart?.deliveryTimeWindow || "").trim()
            ? ` Выбранный промежуток: ${String(cart.deliveryTimeWindow).trim()}.`
            : "";

        return res.status(400).json({
          ok: false,
          field: "schedule",
          error: pointCannotAcceptToday
            ? afterClose
              ? `${pointLabel}: рабочий день уже закончился. ${scheduleText}`
              : `${pointLabel}: сегодня заказ недоступен. ${scheduleText}`
            : `${pointLabel}: выберите время в рамках рабочего графика. ${scheduleText}${selectedWindowText}`,
        });
      }
    }

    // 3) methodLabel (готовая строка для UI)
    let methodLabel = "";
    if (deliveryType === "pickup") {
      if (pickupPointId) {
        const pp = await PickupPoint.findById(pickupPointId).lean();
        methodLabel = `Самовывоз — ${pp?.title || pp?.address || "Точка"}`;
      } else {
        methodLabel = "Самовывоз";
      }
    } else {
      if (deliveryMethod === "inpost") methodLabel = "Доставка — InPost";
      else if (deliveryMethod === "courier") methodLabel = "Доставка — Курьер";
      else methodLabel = "Доставка";
    }

    // 4) bgUrl from FIRST cart item product
    const first = cart.items[0];
    let bgUrl = "";
    if (first?.productKey) {
      const prod = await Product.findOne(
        { productKey: String(first.productKey) },
        { cardBgUrl: 1 }
      ).lean();

      bgUrl = String(prod?.cardBgUrl || "");
    }

    // 5) Собрать items snapshot в твою структуру (product -> flavors[])
    const productKeys = Array.from(
      new Set(cart.items.map((it) => String(it.productKey || "").trim()).filter(Boolean))
    );

    const products = await Product.find(
      { productKey: { $in: productKeys } },
      {
        _id: 1,
        productKey: 1,
        title1: 1,
        title2: 1,
        orderImgUrl: 1,
        cardBgUrl: 1,
        price: 1,
        listPriceZl: 1,
        newBadge: 1,
        categoryKey: 1,
      }
    ).lean();

    const prodByKey = new Map(products.map((p) => [String(p.productKey), p]));
    const byProduct = new Map(); // productKey -> row

    console.time("orders/confirm build order items");
    for (const it of cart.items) {
      const pk = String(it.productKey || "").trim();
      const fk = String(it.flavorKey || "").trim();
      if (!pk || !fk) continue;

      const qty = Math.max(1, Number(it.qty || 1));
      const unitPrice = Number(it.unitPrice || 0);
      const flavorLabel = String(it.flavorLabel || "");
      const gradient = Array.isArray(it.gradient) ? it.gradient.slice(0, 2) : [];

      const prod = prodByKey.get(pk);
      if (!prod?._id) continue; // если товар не найден — пропускаем

      let originalBaseUnitPrice = Number(it?.baseUnitPrice || 0);
      if (isSalePromoProduct(prod)) {
        const salePrice = Number(prod?.price || unitPrice || 0);
        const listPrice = Number(prod?.listPriceZl || 0);
        if (listPrice > salePrice) {
          originalBaseUnitPrice = listPrice;
        } else if (!originalBaseUnitPrice) {
          originalBaseUnitPrice = salePrice;
        }
      }

      const referralFirstOrderDiscountPerItem = Number(it?.referralFirstOrderDiscountPerItem || 0);
      const referralFirstOrderDiscountTotalZl = Number(it?.referralFirstOrderDiscountTotalZl || 0);

      const smartDiscountPerItem = Number(
        Math.max(0, originalBaseUnitPrice - unitPrice - referralFirstOrderDiscountPerItem).toFixed(2)
      );

      const smartDiscountTotalZl = Number(
        Math.max(0, smartDiscountPerItem * qty).toFixed(2)
      );

      const baseUnitPrice = Number(prod?.price || unitPrice || 0);

      let row = byProduct.get(pk);
      if (!row) {
        row = {
          productId: prod._id,
          productKey: pk,
          categoryKey: String(prod.categoryKey || "").trim(),
          productTitle1: String(prod.title1 || ""),
          productTitle2: String(prod.title2 || ""),
          orderImgUrl: String(prod.orderImgUrl || ""),
          cardBgUrl: String(prod.cardBgUrl || ""),
          flavorsMap: new Map(), // fk -> flavor snapshot
        };
        byProduct.set(pk, row);
      }

      const prev = row.flavorsMap.get(fk);
      if (!prev) {
        row.flavorsMap.set(fk, {
          flavorKey: fk,
          qty,
          unitPrice,
          baseUnitPrice: Number(originalBaseUnitPrice || baseUnitPrice || unitPrice || 0),
          smartDiscountPerItem,
          smartDiscountTotalZl,
          referralFirstOrderDiscountPercent: Number(it?.referralFirstOrderDiscountPercent || 0),
          referralFirstOrderDiscountPerItem,
          referralFirstOrderDiscountTotalZl,
          flavorLabel,
          gradient,
        });
      } else {
        prev.qty += qty;
        if (unitPrice) prev.unitPrice = unitPrice;
        if (baseUnitPrice) prev.baseUnitPrice = Number(originalBaseUnitPrice || baseUnitPrice || unitPrice || 0);

        prev.smartDiscountPerItem = Number(smartDiscountPerItem || prev.smartDiscountPerItem || 0);
        prev.smartDiscountTotalZl = Number(
          (Number(prev.smartDiscountTotalZl || 0) + Number(smartDiscountTotalZl || 0)).toFixed(2)
        );

        prev.referralFirstOrderDiscountPercent = Number(it?.referralFirstOrderDiscountPercent || prev.referralFirstOrderDiscountPercent || 0);
        prev.referralFirstOrderDiscountPerItem = Number(referralFirstOrderDiscountPerItem || prev.referralFirstOrderDiscountPerItem || 0);
        prev.referralFirstOrderDiscountTotalZl = Number(
          (Number(prev.referralFirstOrderDiscountTotalZl || 0) + Number(referralFirstOrderDiscountTotalZl || 0)).toFixed(2)
        );

        if (flavorLabel) prev.flavorLabel = flavorLabel;
        if (gradient.length) prev.gradient = gradient;
      }
    }

    const orderItems = Array.from(byProduct.values()).map((row) => ({
      productId: row.productId,
      productKey: row.productKey,
      categoryKey: row.categoryKey,
      productTitle1: row.productTitle1,
      productTitle2: row.productTitle2,
      orderImgUrl: row.orderImgUrl,
      cardBgUrl: row.cardBgUrl,
      flavors: Array.from(row.flavorsMap.values()),
    }));
    console.timeEnd("orders/confirm build order items");

    // ================= STOCK CHECK (avoid context mismatch) =================
    // IMPORTANT: use THE SAME stock context logic as /cart reservations.
    // Product.flavors.stockByPickupPoint.pickupPointId is ObjectId -> always use ObjectId.

    const normId = (v) => String(v || "").trim().replace(/,+$/, "");
    const toObjId = (v) => {
      const s = normId(v);
      return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
    };

    // Delivery warehouses are stored as PickupPoints with key "delivery" and "delivery-2"
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

    console.log(
      "[ORDER][CONFIRM][CTX]",
      JSON.stringify({
        telegramId,
        checkoutDeliveryType: cart.checkoutDeliveryType ?? null,
        checkoutDeliveryMethod: cart.checkoutDeliveryMethod ?? null,
        checkoutPickupPointId: cart.checkoutPickupPointId ?? null,
        contextId: contextId ? String(contextId) : null,
        deliveryWarehouses: {
          courierWarehouseId: courierWarehouseId ? String(courierWarehouseId) : null,
          inpostWarehouseId: inpostWarehouseId ? String(inpostWarehouseId) : null,
        },
      })
    );

    if (!contextId) {
      return res.status(400).json({ ok: false, error: "Stock context is not set (pickup point / delivery warehouse)" });
    }

    // Availability check: available = totalQty - reservedQty.
    // BUT reservedQty already includes THIS cart reservation, so for self-check we add back my qty.
    const cartSum = new Map(); // key -> qty
    for (const it of cart.items) {
      const pk = String(it.productKey || "").trim();
      const fk = String(it.flavorKey || "").trim();
      if (!pk || !fk) continue;
      const key = `${pk}__${fk}`;
      const q = Math.max(1, Number(it.qty || 1));
      cartSum.set(key, (cartSum.get(key) || 0) + q);
    }

    const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

    const productKeysForCheck = Array.from(
      new Set(cart.items.map((it) => String(it.productKey || "").trim()).filter(Boolean))
    );

    const productsForCheck = await Product.find(
      { productKey: { $in: productKeysForCheck } },
      { productKey: 1, title1: 1, title2: 1, flavors: 1 }
    ).lean();

    const prodByKey2 = new Map(productsForCheck.map((p) => [String(p.productKey), p]));

    const missing = [];

    for (const [k, myQty] of cartSum.entries()) {
      const [productKey, flavorKey] = k.split("__");
      const p = prodByKey2.get(productKey);

      if (!p) {
        missing.push({ productKey, flavorKey, need: myQty, have: 0, reason: "product_not_found" });
        continue;
      }

      const fkNorm = normFlavorKey(flavorKey);
      const fkCandidates = Array.from(new Set([String(flavorKey).trim(), fkNorm, `${fkNorm},`].filter(Boolean)));
      const flavor = (p.flavors || []).find((f) => fkCandidates.includes(String(f.flavorKey || "").trim()));

      if (!flavor) {
        missing.push({ productKey, flavorKey, need: myQty, have: 0, reason: "flavor_not_found" });
        continue;
      }

      const syncedContextIds = await getSyncedPickupPointIdsByAnyPoint(contextId);
      const pointIdsToCheck = syncedContextIds.length ? syncedContextIds : [String(contextId)];

      const stockRows = (flavor.stockByPickupPoint || []).filter((s) =>
        pointIdsToCheck.includes(String(s?.pickupPointId || ""))
      );

      const total = stockRows.length
        ? Math.min(...stockRows.map((row) => Number(row?.totalQty || 0)))
        : 0;

      const reserved = stockRows.length
        ? Math.max(...stockRows.map((row) => Number(row?.reservedQty || 0)))
        : 0;

      const effectiveHave = isGuestOrder
        ? Math.max(0, total - reserved)
        : Math.max(0, total - reserved + myQty);

      if (effectiveHave < myQty) {
        missing.push({
          productKey,
          flavorKey,
          need: myQty,
          have: effectiveHave,
          total,
          reserved,
          syncedContextIds: pointIdsToCheck,
          reason: "not_enough_stock",
        });
      }
    }

    if (missing.length) {
      console.warn("[ORDER][CONFIRM][STOCK][MISSING]", JSON.stringify({ telegramId, contextId: String(contextId), missing }));
      return res.status(409).json({ ok: false, error: "Not enough stock", missing });
    }

    // ================= /STOCK CHECK =================

    // 6) COMMIT stock: totalQty -= qty AND reservedQty -= qty (ВАЖНО!)
    // const [courierPP, inpostPP] = await Promise.all([
    //   PickupPoint.findOne({ key: { $in: ["delivery", "delivery,"] } }, { _id: 1 }).lean(),
    //   PickupPoint.findOne({ key: { $in: ["delivery-2", "delivery-2,"] } }, { _id: 1 }).lean(),
    // ]);

    // const courierWarehouseId = courierPP?._id || null;
    // const inpostWarehouseId = inpostPP?._id || null;

    // const stockContextIdFor = ({ type, method, pickupPointId }) => {
    //   if (type === "pickup") return pickupPointId || null;
    //   if (type === "delivery") {
    //     if (method === "inpost") return inpostWarehouseId;
    //     return courierWarehouseId;
    //   }
    //   return null;
    // };

    // const contextId = stockContextIdFor({
    //   type: cart.checkoutDeliveryType,
    //   method: cart.checkoutDeliveryMethod,
    //   pickupPointId: cart.checkoutPickupPointId,
    // });

    // const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

    // const applyPurchaseDelta = async ({ productKey, flavorKey, pickupPointId, qty }) => {
    //   const q = Math.max(1, Number(qty || 1));
    //   if (!pickupPointId || !productKey || !flavorKey || !Number.isFinite(q) || q <= 0) return;

    //   const ppIdObj = pickupPointId;
    //   const ppIdStr = String(pickupPointId);

    //   const fkNorm = normFlavorKey(flavorKey);
    //   const fkCandidates = Array.from(new Set([String(flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean)));
    //   const ppCandidates = [ppIdObj, ppIdStr].filter(Boolean);

    //   await Product.updateOne(
    //     {
    //       productKey,
    //       "flavors.flavorKey": { $in: fkCandidates },
    //       "flavors.stockByPickupPoint.pickupPointId": { $in: ppCandidates },
    //     },
    //     {
    //       $inc: {
    //         "flavors.$[f].stockByPickupPoint.$[s].totalQty": -q,
    //         "flavors.$[f].stockByPickupPoint.$[s].reservedQty": -q,
    //       },
    //     },
    //     {
    //       arrayFilters: [
    //         { "f.flavorKey": { $in: fkCandidates } },
    //         { "s.pickupPointId": { $in: ppCandidates } },
    //       ],
    //     }
    //   );

    //   // clamp
    //   await Product.updateOne(
    //     {
    //       productKey,
    //       "flavors.flavorKey": { $in: fkCandidates },
    //       "flavors.stockByPickupPoint.pickupPointId": { $in: ppCandidates },
    //     },
    //     {
    //       $max: {
    //         "flavors.$[f].stockByPickupPoint.$[s].totalQty": 0,
    //         "flavors.$[f].stockByPickupPoint.$[s].reservedQty": 0,
    //       },
    //     },
    //     {
    //       arrayFilters: [
    //         { "f.flavorKey": { $in: fkCandidates } },
    //         { "s.pickupPointId": { $in: ppCandidates } },
    //       ],
    //     }
    //   );
    // };

    // if (contextId) {
    //   for (const it of cart.items) {
    //     const productKey = String(it.productKey || "").trim();
    //     const flavorKey = String(it.flavorKey || "").trim();
    //     const qty = Math.max(1, Number(it.qty || 1));
    //     if (!productKey || !flavorKey) continue;
    //     await applyPurchaseDelta({ productKey, flavorKey, pickupPointId: contextId, qty });
    //   }
    // }

    

    // 7) unique orderNo
    let orderNo = genOrderNo();
    for (let i = 0; i < 5; i++) {
      const exists = await Order.findOne({ orderNo }, { _id: 1 }).lean();
      if (!exists) break;
      orderNo = genOrderNo();
    }

    // 8) create order

    // const isFreeCourierDelivery =
    //   itemsTotalZl >= FREE_COURIER_DELIVERY_THRESHOLD_ZL;

    // const confirmedDeliveryPricing =
    //   deliveryType === "delivery" && deliveryMethod === "courier"
    //     ? (
    //         String(cart?.courierDistrict || "").trim() &&
    //         (Number(cart?.deliveryFeeZl || 0) > 0 || isFreeCourierDelivery)
    //           ? {
    //               districtLabel: String(cart.courierDistrict || "").trim(),
    //               deliveryFeeZl: isFreeCourierDelivery
    //                 ? 0
    //                 : Number(cart.deliveryFeeZl || 0),
    //             }
    //           : await resolveWarsawDeliveryPricing(
    //               cart.courierAddress || "",
    //               itemsTotalZl
    //             )
    //       )
    //     : { districtLabel: null, deliveryFeeZl: 0 };

    const confirmedInpostPricing =
      deliveryType === "delivery" && deliveryMethod === "inpost"
        ? {
            packageUnits: Number(cart?.inpostPackageUnits || 0),
            deliveryFeeZl: Number(itemsTotalZl || 0) >= 200 ? 0 : Number(cart?.inpostDeliveryFeeZl || 0),
          }
        : { packageUnits: 0, deliveryFeeZl: 0 };

    const duplicateCreatedAfter = new Date(Date.now() - 15 * 1000);

    const currentOrderFingerprint = JSON.stringify({
      telegramId,
      totalZl: Number(totalZl.toFixed(2)),
      deliveryType,
      deliveryMethod,
      pickupPointId: pickupPointId ? String(pickupPointId) : null,
      arrivalTime: cart.arrivalTime ?? null,
      deliveryTimeWindow: cart.deliveryTimeWindow ?? null,
      courierAddress: cart.courierAddress ?? null,
      inpostData: cart.inpostData ?? {},
      items: orderItems.map((row) => ({
        productKey: String(row?.productKey || ""),
        flavors: (Array.isArray(row?.flavors) ? row.flavors : []).map((f) => ({
          flavorKey: String(f?.flavorKey || ""),
          qty: Number(f?.qty || 0),
          unitPrice: Number(f?.unitPrice || 0),
        })),
      })),
    });

    console.time("orders/confirm duplicate check");
    const recentDuplicateCandidates = await Order.find(
      {
        userTelegramId: telegramId,
        totalZl: Number(totalZl.toFixed(2)),
        deliveryType,
        deliveryMethod,
        pickupPointId,
        status: "created",
        createdAt: { $gte: duplicateCreatedAfter },
      },
      {
        _id: 1,
        userTelegramId: 1,
        totalZl: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
        arrivalTime: 1,
        deliveryTimeWindow: 1,
        courierAddress: 1,
        inpostData: 1,
        items: 1,
        createdAt: 1,
      }
    )
      .sort({ createdAt: -1 })
      .lean();

    const duplicateOrder = recentDuplicateCandidates.find((existing) => {
      const existingFingerprint = JSON.stringify({
        telegramId: String(existing?.userTelegramId || "").trim(),
        totalZl: Number(existing?.totalZl || 0),
        deliveryType: existing?.deliveryType || null,
        deliveryMethod: existing?.deliveryMethod || null,
        pickupPointId: existing?.pickupPointId ? String(existing.pickupPointId) : null,
        arrivalTime: existing?.arrivalTime ?? null,
        deliveryTimeWindow: existing?.deliveryTimeWindow ?? null,
        courierAddress: existing?.courierAddress ?? null,
        inpostData: existing?.inpostData ?? {},
        items: (Array.isArray(existing?.items) ? existing.items : []).map((row) => ({
          productKey: String(row?.productKey || ""),
          flavors: (Array.isArray(row?.flavors) ? row.flavors : []).map((f) => ({
            flavorKey: String(f?.flavorKey || ""),
            qty: Number(f?.qty || 0),
            unitPrice: Number(f?.unitPrice || 0),
          })),
        })),
      });

      return existingFingerprint === currentOrderFingerprint;
    });

    console.timeEnd("orders/confirm duplicate check");
    if (duplicateOrder) {
      return res.json({ ok: true, order: duplicateOrder, duplicate: true });
    }
    
    console.time("orders/confirm create order")
    const created = await Order.create({
      userTelegramId: telegramId,
      shopBotIndex: Number(orderShopBotIndex) || 0,

      orderNo,
      totalZl: Number(totalZl.toFixed(2)),
      currency: "PLN",

      bgUrl,
      methodLabel,

      deliveryType,
      deliveryMethod,
      pickupPointId,

      arrivalTime: cart.arrivalTime ?? null,
      deliveryTimeWindow: cart.deliveryTimeWindow ?? null,
      comment: String(

        req.body?.comment ?? cart?.comment ?? ""

      )

        .trim()

        .slice(0, 500) || null,
      courierAddress: cart.courierAddress ?? null,
      inpostData: cart.inpostData ?? {},

      courierDistrict:
        deliveryType === "delivery" && deliveryMethod === "courier"
          ? (confirmedDeliveryPricing.districtLabel || cart.courierDistrict || null)
          : null,

      deliveryFeeZl: orderDeliveryFeeZl,

      inpostDeliveryFeeZl:
        deliveryType === "delivery" && deliveryMethod === "inpost"
          ? Number(confirmedInpostPricing.deliveryFeeZl || 0)
          : 0,

      inpostPackageUnits:
        deliveryType === "delivery" && deliveryMethod === "inpost"
          ? Number(confirmedInpostPricing.packageUnits || 0)
          : 0,

      items: orderItems,

      payment: {
        status: "unpaid",
        amountZl: Number(totalZl.toFixed(2)),
        referralUsedCode: referralDiscountMeta.usedCode,
        referralFirstOrderDiscountApplied: Boolean(referralDiscountMeta.applied),
        referralFirstOrderDiscountPercent: Number(referralDiscountMeta.percent || 0),
        referralFirstOrderDiscountTotalZl: Number(referralDiscountMeta.totalDiscountZl || 0),
        subtotalBeforeReferralDiscountZl: Number(referralDiscountMeta.totalBeforeDiscount || 0),
        totalBeforeReferralDiscountZl: Number(referralDiscountMeta.totalBeforeDiscount || 0),
      },

      status: "created",
      // ✅ заказ создан: товар остаётся в reservedQty (как в корзине)
      stockReservedAt: new Date(),
      stockCommittedAt: null,
      stockReleasedAt: null,
    });

    // 9) clear cart
    console.time("orders/confirm clear cart");
    if (!isGuestOrder) {
      await Cart.updateOne(
        { telegramId },
        {
          $set: {
            items: [],
            checkout: {},
            stockContextId: "",
            reservedContextId: "",
            cartAutoClearAt: null,
            staleClearedAt: null,
            checkoutDeliveryType: null,
            checkoutDeliveryMethod: null,
            checkoutPickupPointId: null,
            arrivalTime: null,
            deliveryTimeWindow: null,
            comment: "",
            courierAddress: null,
            courierDistrict: null,
            deliveryFeeZl: 0,
            inpostDeliveryFeeZl: 0,
            inpostPackageUnits: 0,
            inpostData: {
              fullName: null,
              phone: null,
              email: null,
              city: null,
              lockerAddress: null,
            },
          },
        }
      );
    }
    console.timeEnd("orders/confirm clear cart");

    console.timeEnd("orders/confirm total");
    res.json({ ok: true, order: created });

    Promise.resolve()
      .then(() => sendClientOrderCreatedInfo(created))
      .catch((e) => console.error("sendClientOrderCreatedInfo post-response error:", e));

    Promise.resolve()
      .then(() => startPaymentReminder(created))
      .catch((e) => console.error("startPaymentReminder post-response error:", e));

    // Promise.resolve()
    //   .then(() => sendOrderCreatedNotification(created))
    //   .catch((e) => console.error("sendOrderCreatedNotification post-response error:", e));

    return;
  } catch (e) {
    console.error("POST /orders/confirm error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Public: cancel order by user =====
app.post("/orders/:id/cancel", async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;

    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId is required" });
    }

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    if (String(order.userTelegramId || "") !== telegramId) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const status = String(order.status || "").toLowerCase();

    if (status === "completed") {
      return res.status(400).json({
        ok: false,
        error: "COMPLETED_ORDER_CANNOT_BE_CANCELED",
      });
    }

    if (status === "canceled") {
      return res.json({ ok: true, order });
    }

    if (!order.stockReleasedAt) {
      await releaseOrderReservedStock(order);
      order.stockReleasedAt = new Date();
    }

    await refundOrderCashback(order);

    const freshOrderAfterRefund = await Order.findById(order._id);
    if (!freshOrderAfterRefund) {
      throw new Error("ORDER_NOT_FOUND_AFTER_REFUND");
    }

    order.payment = {
      ...(freshOrderAfterRefund.payment?.toObject
        ? freshOrderAfterRefund.payment.toObject()
        : freshOrderAfterRefund.payment || {}),
      status: "unpaid",
      paidAt: null,
      checkedAt: new Date(),
      checkedByTelegramId: telegramId,
    };

    order.status = "canceled";
    order.canceledAt = new Date();
    order.canceledByTelegramId = telegramId;

    await order.save();

    await refreshManagerOrderMessage(order);

    try {
      stopPaymentReminder(order._id);
    } catch {}

    return res.json({ ok: true, order });
  } catch (e) {
    console.error("POST /orders/:id/cancel error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Repeat order (create new order from existing snapshot) =====
app.post("/orders/repeat", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;
    const orderNo = req.body?.orderNo ? String(req.body.orderNo).trim() : null;
    const orderId = req.body?.orderId ? String(req.body.orderId).trim() : null;

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    if (!orderNo && !orderId) {
      return res.status(400).json({ ok: false, error: "orderNo or orderId is required" });
    }

    const orig = await Order.findOne(
      { userTelegramId: telegramId, ...(orderId ? { _id: orderId } : { orderNo }) },
      {
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
        arrivalTime: 1,
        courierAddress: 1,
        inpostData: 1,
        items: 1,
      }
    ).lean();

    if (!orig) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    const repeatedItems = [];

    for (const p of Array.isArray(orig.items) ? orig.items : []) {
      const productKey = String(p?.productKey || "").trim();
      if (!productKey) continue;

      for (const f of Array.isArray(p?.flavors) ? p.flavors : []) {
        const flavorKey = String(f?.flavorKey || "").trim();
        if (!flavorKey) continue;

        repeatedItems.push({
          productKey,
          flavorKey,
          qty: Math.max(1, Number(f?.qty || 1)),
          unitPrice: Number(f?.unitPrice || 0),
          flavorLabel: String(f?.flavorLabel || ""),
          gradient: Array.isArray(f?.gradient) ? f.gradient.slice(0, 2) : [],
        });
      }
    }

    if (!repeatedItems.length) {
      return res.status(400).json({ ok: false, error: "Order has no items" });
    }

    const allPoints = await PickupPoint.find({}, { _id: 1, key: 1, title: 1, address: 1 }).lean();
    const pointById = new Map(allPoints.map((p) => [String(p._id), p]));
    const pointByKey = new Map(
      allPoints.map((p) => [String(p.key || "").trim().replace(/,+$/, ""), p])
    );

    const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

    const makePointLabel = (point) => {
      const k = String(point?.key || "").trim().replace(/,+$/, "");
      if (k === "delivery") return "Доставка — Курьер";
      if (k === "delivery-2") return "Доставка — InPost";
      return point?.address || point?.title || "Точка";
    };

    const targetPoint =
      orig.deliveryType === "pickup"
        ? pointById.get(String(orig.pickupPointId || "")) || null
        : pointByKey.get(orig.deliveryMethod === "inpost" ? "delivery-2" : "delivery") || null;

    const targetContextId = targetPoint?._id ? String(targetPoint._id) : "";
    const targetLabel = makePointLabel(targetPoint);

    const missing = [];

    for (const it of repeatedItems) {
      const productKey = String(it.productKey || "").trim();
      const flavorKey = String(it.flavorKey || "").trim();
      if (!productKey || !flavorKey) continue;

      const fkNorm = normFlavorKey(flavorKey);
      const fkCandidates = Array.from(
        new Set([String(flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );

      const prod = await Product.findOne(
        { productKey, "flavors.flavorKey": { $in: fkCandidates } },
        { productKey: 1, title1: 1, title2: 1, flavors: 1 }
      ).lean();

      const fl = (prod?.flavors || []).find((f) =>
        fkCandidates.includes(String(f?.flavorKey || "").trim())
      );

      const row = (fl?.stockByPickupPoint || []).find(
        (s) => String(s?.pickupPointId) === String(targetContextId)
      );

      const total = Number(row?.totalQty || 0);
      const reserved = Number(row?.reservedQty || 0);
      const available = Math.max(0, total - reserved);
      const requested = Math.max(1, Number(it.qty || 1));

      if (available >= requested) continue;

      const productTitle =
        [prod?.title1, prod?.title2].filter(Boolean).join(" ").trim() || productKey;

      const flavorLabel = String(
        it.flavorLabel || fl?.label || fl?.flavorKey || flavorKey
      ).trim();

      const alternatives = (fl?.stockByPickupPoint || [])
        .map((s) => {
          const point = pointById.get(String(s?.pickupPointId || ""));
          const altAvailable = Math.max(
            0,
            Number(s?.totalQty || 0) - Number(s?.reservedQty || 0)
          );

          return {
            pointId: String(s?.pickupPointId || ""),
            label: makePointLabel(point),
            available: altAvailable,
          };
        })
        .filter((x) => x.pointId && x.pointId !== String(targetContextId) && x.available > 0)
        .sort((a, b) => b.available - a.available)
        .slice(0, 6);

      missing.push({
        productTitle,
        flavorLabel,
        requested,
        available,
        alternatives,
      });
    }

    if (missing.length) {
      const message = [
        `На «${targetLabel}» сейчас недостаточно наличия для повторного заказа.`,
        ``,
        ...missing.flatMap((m) => {
          const head = `• ${m.productTitle} — ${m.flavorLabel}: нужно ${m.requested} шт., доступно ${m.available} шт.`;

          if (!m.alternatives.length) {
            return [head, `  Альтернатива: выберите другой вкус, позицию или другой склад.`];
          }

          return [
            head,
            `  Где ещё есть:`,
            ...m.alternatives.map((a) => `  – ${a.label}: ${a.available} шт.`),
          ];
        }),
        ``,
        `Попробуйте выбрать другой склад, другой вкус или другую позицию.`,
      ].join("\n");

      return res.status(409).json({
        ok: false,
        error: "OUT_OF_STOCK",
        message,
        targetLabel,
        missing,
      });
    }

    return res.json({
      ok: true,
      cartDraft: {
        items: repeatedItems,
        checkoutDeliveryType: orig.deliveryType || null,
        checkoutDeliveryMethod: orig.deliveryMethod || null,
        checkoutPickupPointId: orig.pickupPointId || null,
        arrivalTime: orig.deliveryType === "pickup" ? null : (orig.arrivalTime ?? null),
        courierAddress: orig.courierAddress ?? null,
        inpostData: orig.inpostData ?? {
          fullName: null,
          phone: null,
          email: null,
          city: null,
          lockerAddress: null,
        },
      },
    });
  } catch (e) {
    console.error("POST /orders/repeat error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/orders", async (req, res) => {
  try {
  const telegramId = requireTrustedTelegramId(req, res);

  if (!telegramId) return;

    const orders = await Order.find({ userTelegramId: telegramId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, orders });
  } catch (e) {
    console.error("GET /orders error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/orders/:id/apply-cashback", async (req, res) => {
  try {
    const { id } = req.params;

    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;

    const { mode } = req.body || {};

    const safeMode = String(mode || "partial").trim().toLowerCase();
    const requestedCashbackAmountZl = Number(req.body?.amountZl || 0);

    if (!["partial", "full", "custom"].includes(safeMode)) {
      return res.status(400).json({ ok: false, error: "INVALID_CASHBACK_MODE" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
    }

    if (String(order.userTelegramId || "") !== String(telegramId || "")) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    if (String(order.status || "") === "canceled") {
      return res.status(400).json({ ok: false, error: "ORDER_CANCELED" });
    }

    if (
      String(order.payment?.status || "") === "checking" ||
      String(order.payment?.status || "") === "paid"
    ) {
      return res.status(400).json({ ok: false, error: "PAYMENT_ALREADY_SUBMITTED" });
    }

    // const user = await User.findOne({ telegramId: String(telegramId || "") });
    // user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];
    // if (!user) {
    //   return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    // }

    const user = await User.findOne({ telegramId: String(telegramId || "") });

    if (!user) {

      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

    }

    user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

    const orderTotalZl = Number(order.totalZl || 0);
    const cashbackBalance = Number(user.cashbackBalance || 0);
    const alreadyAppliedZl = Number(order?.payment?.cashbackAppliedZl || 0);
    const maxAvailableCashbackZl = Number((cashbackBalance + alreadyAppliedZl).toFixed(2));

    if (maxAvailableCashbackZl <= 0) {
      return res.status(400).json({ ok: false, error: "NO_CASHBACK_BALANCE" });
    }

    const targetAppliedCashbackZl = (() => {
      if (safeMode === "custom") {
        return Number(Math.min(requestedCashbackAmountZl, maxAvailableCashbackZl, orderTotalZl).toFixed(2));
      }

      if (safeMode === "full") {
        return Number(orderTotalZl.toFixed(2));
      }

      return Number(Math.min(alreadyAppliedZl + cashbackBalance, orderTotalZl).toFixed(2));
    })();

    if (!Number.isFinite(targetAppliedCashbackZl) || targetAppliedCashbackZl < 0) {
      return res.status(400).json({ ok: false, error: "INVALID_CASHBACK_AMOUNT" });
    }

    if (safeMode === "custom" && requestedCashbackAmountZl > maxAvailableCashbackZl) {
      return res.status(400).json({ ok: false, error: "INSUFFICIENT_CASHBACK_BALANCE" });
    }

    if (safeMode === "custom" && requestedCashbackAmountZl > orderTotalZl) {

      return res.status(400).json({ ok: false, error: "CASHBACK_AMOUNT_EXCEEDS_ORDER_TOTAL" });

    }

    if (safeMode === "full" && maxAvailableCashbackZl < orderTotalZl) {
      return res.status(400).json({ ok: false, error: "INSUFFICIENT_CASHBACK_FOR_FULL_PAYMENT" });
    }

    const cashbackDeltaZl = Number((targetAppliedCashbackZl - alreadyAppliedZl).toFixed(2));
    const cashbackAppliedZl = targetAppliedCashbackZl;
    const remainingToPayZl = Number(Math.max(0, orderTotalZl - cashbackAppliedZl).toFixed(2));
    const cashbackFullyPaid = remainingToPayZl <= 0;

    let cashbackLeftToDeduct = Math.max(0, Number(cashbackDeltaZl || 0));

    const activeRows = [...user.cashbackLedger]
      .filter((row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0)
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

    for (const row of activeRows) {
      if (cashbackLeftToDeduct <= 0) break;

      const available = Math.max(0, Number(row.remainingZl || 0));
      if (available <= 0) continue;

      const used = Math.min(available, cashbackLeftToDeduct);

      row.remainingZl = Number((available - used).toFixed(2));
      cashbackLeftToDeduct = Number((cashbackLeftToDeduct - used).toFixed(2));
    }

    if (cashbackDeltaZl < 0) {
      user.cashbackLedger.push({
        type: "refund",
        amountZl: Math.abs(cashbackDeltaZl),
        remainingZl: Math.abs(cashbackDeltaZl),
        source: "cashback_replace",
        orderId: order._id,
        createdAt: new Date(),
        expiresAt: null,
      });
    }

    recalcUserCashbackBalanceFromLedger(user);

    await user.save();

    const prevPayment = order.payment?.toObject ? order.payment.toObject() : (order.payment || {});
    order.payment = {
      ...prevPayment,
      method: cashbackFullyPaid ? "cashback" : String(prevPayment?.method || ""),
      cashbackAppliedZl,
      cashbackRemainingToPayZl: remainingToPayZl,
      cashbackFullyPaid,
      cashbackAppliedAt: new Date(),
      cashbackRefundedAt: null,
      checkedAt: null,
      checkedByTelegramId: "",
      status: "unpaid",
    };

    await order.save();

    const freshOrder = await Order.findById(order._id).lean();

    return res.json({
      ok: true,
      order: freshOrder,
      cashbackBalance: Number(user.cashbackBalance || 0),
      cashbackAppliedZl,
      cashbackRemainingToPayZl: remainingToPayZl,
      cashbackFullyPaid,
    });
  } catch (e) {
    console.error("apply cashback error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

app.post("/orders/:id/arrived-at-pickup", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;
    const { id } = req.params;

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    const order = await Order.findOne({ _id: id, userTelegramId: telegramId });
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    if (String(order.deliveryType || "") !== "pickup") {
      return res.status(400).json({ ok: false, error: "Only pickup orders are supported" });
    }

    if (String(order.status || "") === "completed") {
      return res.json({ ok: true, order, alreadyCompleted: true });
    }

    order.arrivedNotifiedAt = new Date();
    await order.save();

    await notifyManagerClientArrived(order);

    return res.json({ ok: true, order });
  } catch (e) {
    console.error("POST /orders/:id/arrived-at-pickup error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/orders/:id/payment-check", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);

    if (!telegramId) return;
    const { id } = req.params;

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    const order = await Order.findOne({ _id: id, userTelegramId: telegramId });
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    const point = await resolveOrderPaymentPoint(order);

    const allowedMethods = Array.isArray(point?.paymentConfig?.methods)
      ? point.paymentConfig.methods
          .filter((m) => m && m.isActive !== false)
          .map((m) => String(m.key || "").trim())
          .filter(Boolean)
      : [];

    const requestedMethod = req.body?.paymentMethod
      ? String(req.body.paymentMethod).trim()
      : "";

    const cashbackFullyPaid = Boolean(order?.payment?.cashbackFullyPaid);

    if (!requestedMethod && !cashbackFullyPaid) {
      return res.status(400).json({ ok: false, error: "paymentMethod is required" });
    }

    if (requestedMethod && requestedMethod !== "cashback" && allowedMethods.length && !allowedMethods.includes(requestedMethod)) {
      return res.status(400).json({
        ok: false,
        error: "Payment method is not available for this order",
      });
    }

    if (String(order?.payment?.status || "") === "paid") {
      return res.json({ ok: true, order });
    }

    const prevPayment = order.payment?.toObject
      ? order.payment.toObject()
      : (order.payment || {});

    const managerDisplayAmount = Number(req.body?.managerDisplayAmount || 0);

    // const cashbackUsedZl = Number(
    //   req.body?.cashbackUsedZl ||
    //   req.body?.cashbackAppliedZl ||
    //   prevPayment?.cashbackAppliedZl ||
    //   0
    // );

    const cashbackUsedZl = Number(prevPayment?.cashbackAppliedZl || 0);

    const fallbackCashbackRemainingToPayZl = Math.max(
      0,
      Number(order?.totalZl || 0) - Number(cashbackUsedZl || 0)
    );

    // const cashbackRemainingToPayZl = Number(
    //   req.body?.cashbackRemainingToPayZl ||
    //   prevPayment?.cashbackRemainingToPayZl ||
    //   fallbackCashbackRemainingToPayZl ||
    //   0
    // );

    const cashbackRemainingToPayZl = Number(
      prevPayment?.cashbackRemainingToPayZl ||
      fallbackCashbackRemainingToPayZl ||
      0
    );

    // const cashbackFullyPaidFromBody = Boolean(
    //   req.body?.paymentMethod === "cashback" || req.body?.cashbackFullyPaid === true
    // );

    const cashbackFullyPaidFromBody = Boolean(prevPayment?.cashbackFullyPaid === true);

    const finalCashbackFullyPaid = Boolean(
      cashbackFullyPaidFromBody ||
      prevPayment?.cashbackFullyPaid === true ||
      cashbackRemainingToPayZl <= 0
    );
    const managerDisplayCurrency = String(req.body?.managerDisplayCurrency || "PLN").trim() || "PLN";
    const managerDisplayRate =
      req.body?.managerDisplayRate === null ||
      req.body?.managerDisplayRate === undefined ||
      req.body?.managerDisplayRate === ""
        ? null
        : Number(req.body.managerDisplayRate || 0);

    order.payment = {
      ...prevPayment,
      status: "checking",
      method: finalCashbackFullyPaid
        ? "cashback"
        : (req.body?.paymentMethod
            ? String(req.body.paymentMethod)
            : (prevPayment?.method || null)),
      cashChangeType: finalCashbackFullyPaid
        ? null
        : (req.body?.cashChangeType
            ? String(req.body.cashChangeType)
            : null),
      cashAmount: finalCashbackFullyPaid
        ? null
        : (req.body?.cashAmount
            ? String(req.body.cashAmount)
            : null),
      cashbackAppliedZl: Number(Number(cashbackUsedZl || 0).toFixed(2)),
      cashbackRemainingToPayZl: Number(Number(cashbackRemainingToPayZl || 0).toFixed(2)),
      cashbackFullyPaid: finalCashbackFullyPaid,
      managerDisplayAmount,
      managerDisplayCurrency,
      managerDisplayRate,
      checkedAt: new Date(),
      checkedByTelegramId: "",
    };

    await order.save();

    stopPaymentReminder(order._id);

    await sendOrderCreatedNotification(

      order,

      {

        skipClientNotification: true,

      }

    );
    return res.json({ ok: true, order });
  } catch (e) {
    console.error("POST /orders/:id/payment-check error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.patch("/admin/orders/:id/payment-status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || "").trim();
    const checkedByTelegramId = String(req.body?.checkedByTelegramId || "").trim();

    if (!["paid", "unpaid"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be paid or unpaid" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    order.payment = {
      ...(order.payment?.toObject ? order.payment.toObject() : order.payment || {}),
      status,
      paidAt: status === "paid" ? new Date() : null,
      checkedAt: new Date(),
      checkedByTelegramId,
    };

    await order.save();
    if (
      status === "paid" &&
      String(order?.deliveryType || "") === "delivery" &&
      String(order?.deliveryMethod || "") === "courier"
    ) {
      const deliveryPromptChatId = String(
        order?.payment?.managerMessageChatId || ""
      ).trim();

      const deliveryPromptMessageIds = Array.isArray(order?.managerArrivalMessageIds)
        ? order.managerArrivalMessageIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        : [];

      if (bot && deliveryPromptChatId && deliveryPromptMessageIds.length) {
        for (const msgId of deliveryPromptMessageIds) {
          try {
            await bot.telegram.deleteMessage(deliveryPromptChatId, Number(msgId));
          } catch (e) {
            console.error("delete courier delivery prompt on paid error:", {
              orderNo: order?.orderNo,
              chatId: deliveryPromptChatId,
              msgId,
              error: e?.message || e,
            });
          }
        }
      }

      if (deliveryPromptMessageIds.length) {
        order.managerArrivalMessageIds = [];
        await order.save();
      }
    }
    return res.json({ ok: true, order });
  } catch (e) {
    console.error("PATCH /admin/orders/:id/payment-status error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

}
