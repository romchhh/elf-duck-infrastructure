import { getServerContext } from "../../lib/server/context.js";

export function registerRoutes(app) {
  Object.assign(globalThis, getServerContext());

// ===== Admin: создать товар ====

app.post("/admin/products", requireAdmin, async (req, res) => {
  try {
    
    const b = req.body || {};
    const t1 = String(b.title1 || "").trim();
    const t2 = String(b.title2 || "").trim();
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

    res.json({ ok: true, product: created });
  } catch (e) {
    console.error("POST /admin/products error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: обновить товар (categoryKey, isActive, media, UI fields) =====
app.patch("/admin/products/:id", requireAdmin, async (req, res) => {
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

    if (update.productKey !== undefined) update.productKey = String(update.productKey);
    if (update.sortOrder !== undefined) update.sortOrder = Number(update.sortOrder || 0);
    if (update.categoryKey !== undefined) update.categoryKey = String(update.categoryKey);
    if (update.title1 !== undefined) update.title1 = String(update.title1);
    if (update.title2 !== undefined) update.title2 = String(update.title2);
    if (update.titleModal !== undefined) update.titleModal = String(update.titleModal);
    if (update.price !== undefined) update.price = Number(update.price || 0);
    if (update.cardBgUrl !== undefined) update.cardBgUrl = String(update.cardBgUrl);
    if (update.cardDuckUrl !== undefined) update.cardDuckUrl = String(update.cardDuckUrl);
    if (update.orderImgUrl !== undefined) update.orderImgUrl = String(update.orderImgUrl);
    if (update.classCardDuck !== undefined) update.classCardDuck = String(update.classCardDuck);
    if (update.classActions !== undefined) update.classActions = String(update.classActions);
    if (update.classNewBadge !== undefined) update.classNewBadge = String(update.classNewBadge);
    if (update.newBadge !== undefined) update.newBadge = String(update.newBadge);
    if (update.accentColor !== undefined) update.accentColor = String(update.accentColor);

    const updated = await Product.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ ok: false, error: "Product not found" });

    return res.json({ ok: true, product: updated });
  } catch (e) {
    console.error("PATCH /admin/products/:id error:", e);
    // duplicate key
    if (e?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Product key already exists" });
    }
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: удалить товар =====
app.delete("/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const productId = String(
      req.params?.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    const deletedProduct =
      await Product.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    cacheInvalidate("products:");

    return res.json({
      ok: true,

      deletedProductId: String(
        deletedProduct._id
      ),

      deletedProductKey: String(
        deletedProduct.productKey || ""
      ),
    });
  } catch (error) {
    console.error(
      "DELETE /admin/products/:id error:",
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        error?.message ||
        "INTERNAL_SERVER_ERROR",
    });
  }
});

// ===== Admin: создать/обновить вкус у товара =====
app.post("/admin/products/:id/flavors", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const rawFlavorKey = String(b.flavorKey || "").trim().toLowerCase();
    const label = String(b.label || "").trim();

    if (!label) {
      return res.status(400).json({ ok: false, error: "label is required" });
    }

    const gradient = Array.isArray(b.gradient) ? b.gradient.map((x) => String(x)) : [];
    if (gradient.length !== 2) {
      return res.status(400).json({ ok: false, error: "gradient must contain exactly 2 colors" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ ok: false, error: "Product not found" });

    const requestedFlavorKey = rawFlavorKey || slugifyFlavorLabel(label);

    const existing = (product.flavors || []).find(
      (f) => String(f.flavorKey || "").trim().toLowerCase() === requestedFlavorKey
    );

    const sameFlavorByLabel = (product.flavors || []).find(
      (f) => String(f.label || "").trim().toLowerCase() === label.toLowerCase()
    );

    if (existing && sameFlavorByLabel && String(existing._id) === String(sameFlavorByLabel._id)) {
      // обновляем только если это реально тот же вкус
      existing.label = label;
      existing.gradient = gradient;
      if (b.isActive !== undefined) existing.isActive = !!b.isActive;
    } else {
      const uniqueFlavorKey = ensureUniqueFlavorKeyForProduct(product, requestedFlavorKey);

      product.flavors.push({
        flavorKey: uniqueFlavorKey,
        label,
        isActive: b.isActive ?? true,
        gradient,
        stockByPickupPoint: [],
      });
    }

    await product.save();
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("POST /admin/products/:id/flavors error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ===== Admin: обновить склад вкуса по точке самовывоза =====
app.patch("/admin/products/:id/flavors/:flavorId/stock", requireAdmin, async (req, res) => {
  try {
    const { id, flavorId } = req.params;
    const { pickupPointId, totalQty, updatedByTelegramId } = req.body || {};

    if (!pickupPointId) {
      return res.status(400).json({ ok: false, error: "pickupPointId is required" });
    }

    const nextQty = Math.max(0, Number(totalQty ?? 0));

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ ok: false, error: "Product not found" });

    const flavor = product.flavors.id(flavorId);
    if (!flavor) return res.status(404).json({ ok: false, error: "Flavor not found" });

    const pid = String(pickupPointId);

    const syncedPointIds = await getSyncedPickupPointIdsByAnyPoint(pickupPointId);
    const pointIdsToSync = syncedPointIds.length ? syncedPointIds : [String(pickupPointId)];

    const existingRows = (flavor.stockByPickupPoint || []).filter((s) =>
      pointIdsToSync.includes(String(s.pickupPointId))
    );

    const syncedReservedQty = existingRows.length
      ? Math.max(...existingRows.map((row) => Math.max(0, Number(row?.reservedQty || 0))))
      : 0;

    for (const syncPickupPointId of pointIdsToSync) {
      const existing = (flavor.stockByPickupPoint || []).find(
        (s) => String(s.pickupPointId) === String(syncPickupPointId)
      );

      if (existing) {
        existing.totalQty = nextQty;
        existing.reservedQty = Math.min(syncedReservedQty, nextQty);
        existing.updatedAt = new Date();
        existing.updatedByTelegramId = String(updatedByTelegramId || "");
      } else {
        flavor.stockByPickupPoint.push({
          pickupPointId: syncPickupPointId,
          totalQty: nextQty,
          reservedQty: Math.min(syncedReservedQty, nextQty),
          updatedAt: new Date(),
          updatedByTelegramId: String(updatedByTelegramId || ""),
        });
      }
    }

    await product.save();
    return res.json({ ok: true, product });
  } catch (e) {
    console.error("PATCH /admin/products/:id/flavors/:flavorId/stock error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// app.post(
//   "/admin/products/manual-sheet-stock-sync",
//   requireAdmin,
//   async (req, res) => {
//     try {
//       const pointKey = String(
//         req.body?.pointKey || ""
//       )
//         .trim()
//         .replace(/,+$/, "");

//       const modelName = String(
//         req.body?.modelName || ""
//       ).trim();

//       const normalizedModel =
//         String(
//           req.body
//             ?.normalizedModel ||
//           modelName
//         )
//           .trim()
//           .toUpperCase();

//       const flavorLabel = String(
//         req.body?.flavorLabel || ""
//       ).trim();

//       const normalizedFlavor =
//         String(
//           req.body
//             ?.normalizedFlavor ||
//           flavorLabel
//         )
//           .trim()
//           .toUpperCase();

//       const qty =
//         Number(req.body?.qty);

//       if (
//         !pointKey ||
//         !modelName ||
//         !flavorLabel ||
//         !Number.isInteger(qty) ||
//         qty < 0
//       ) {
//         return res.status(400).json({
//           ok: false,
//           error:
//             "INVALID_MANUAL_STOCK_DATA",
//         });
//       }

//       const pickupPoint =
//         await PickupPoint.findOne({
//           key: {
//             $in: [
//               pointKey,
//               `${pointKey},`,
//             ],
//           },
//         });

//       if (!pickupPoint) {
//         return res.status(404).json({
//           ok: false,
//           error:
//             "PICKUP_POINT_NOT_FOUND",
//           pointKey,
//         });
//       }

//       const normalizeValue = (
//         value
//       ) =>
//         String(value || "")
//           .toUpperCase()
//           .replace(/🦆/g, "")
//           .replace(
//             /CARTRIDGE/g,
//             "CATRIDGE"
//           )
//           .replace(
//             /\s*30\s*ML/g,
//             ""
//           )
//           .replace(
//             /^CHASER\s+/g,
//             ""
//           )
//           .replace(/\s+/g, " ")
//           .trim();

//       const compactValue = (
//         value
//       ) =>
//         normalizeValue(value)
//           .replace(
//             /[^A-ZА-ЯІЇЄҐ0-9]+/g,
//             ""
//           );

//       const wantedModel =
//         normalizeValue(
//           normalizedModel
//         );

//       const wantedFlavor =
//         compactValue(
//           normalizedFlavor
//         );

//       const products =
//         await Product.find({});

//       let foundProduct = null;
//       let foundFlavor = null;

//       for (
//         const product of products
//       ) {
//         const productNames = [
//           product?.productKey,
//           product?.title,
//           product?.title1,
//           product?.title2,
//           [
//             product?.title1,
//             product?.title2,
//           ]
//             .filter(Boolean)
//             .join(" "),
//           product?.name,
//           product?.model,
//         ]
//           .map(normalizeValue)
//           .filter(Boolean);

//         const modelMatches =
//           productNames.some(
//             (candidate) =>
//               candidate ===
//                 wantedModel ||
//               candidate.includes(
//                 wantedModel
//               ) ||
//               wantedModel.includes(
//                 candidate
//               )
//           );

//         if (!modelMatches) {
//           continue;
//         }

//         const flavors =
//           Array.isArray(
//             product?.flavors
//           )
//             ? product.flavors
//             : [];

//         for (
//           const flavor of flavors
//         ) {
//           const flavorNames = [
//             flavor?.flavorKey,
//             flavor?.flavorLabel,
//             flavor?.label,
//             flavor?.name,
//           ]
//             .map(compactValue)
//             .filter(Boolean);

//           if (
//             flavorNames.includes(
//               wantedFlavor
//             )
//           ) {
//             foundProduct =
//               product;

//             foundFlavor =
//               flavor;

//             break;
//           }
//         }

//         if (
//           foundProduct &&
//           foundFlavor
//         ) {
//           break;
//         }
//       }

//       if (!foundProduct) {
//         return res.status(404).json({
//           ok: false,
//           error:
//             "PRODUCT_NOT_FOUND",
//           modelName,
//           normalizedModel,
//         });
//       }

//       if (!foundFlavor) {
//         return res.status(404).json({
//           ok: false,
//           error:
//             "FLAVOR_NOT_FOUND",
//           modelName,
//           flavorLabel,
//           normalizedFlavor,
//         });
//       }

//       foundFlavor
//         .stockByPickupPoint =
//           Array.isArray(
//             foundFlavor
//               ?.stockByPickupPoint
//           )
//             ? foundFlavor
//                 .stockByPickupPoint
//             : [];

//       let stockRow =
//         foundFlavor
//           .stockByPickupPoint
//           .find(
//             (row) =>
//               String(
//                 row?.pickupPointId ||
//                 ""
//               ) ===
//               String(
//                 pickupPoint._id
//               )
//           );

//       if (!stockRow) {
//         foundFlavor
//           .stockByPickupPoint
//           .push({
//             pickupPointId:
//               pickupPoint._id,

//             qty,

//             reservedQty: 0,
//           });
//       } else {
//         /*
//          * Меняем только физический остаток.
//          *
//          * reservedQty не трогаем,
//          * потому что там могут быть
//          * активные заказы.
//          */
//         stockRow.qty = qty;
//       }

//       foundProduct.markModified(
//         "flavors"
//       );

//       await foundProduct.save();

//       cacheInvalidate(
//         "products"
//       );

//       console.log(
//         "[MANUAL SHEET STOCK SYNC]",
//         {
//           source:
//             req.body?.source,

//           spreadsheetId:
//             req.body
//               ?.spreadsheetId,

//           sheetName:
//             req.body?.sheetName,

//           editorEmail:
//             req.body
//               ?.editorEmail,

//           pointKey,

//           pickupPointId:
//             String(
//               pickupPoint._id
//             ),

//           productId:
//             String(
//               foundProduct._id
//             ),

//           productKey:
//             String(
//               foundProduct
//                 ?.productKey || ""
//             ),

//           modelName,

//           flavorLabel,

//           qty,
//         }
//       );

//       return res.json({
//         ok: true,

//         pointKey,

//         pickupPointId:
//           String(
//             pickupPoint._id
//           ),

//         productId:
//           String(
//             foundProduct._id
//           ),

//         productKey:
//           String(
//             foundProduct
//               ?.productKey || ""
//           ),

//         modelName,

//         flavorLabel,

//         qty,
//       });
//     } catch (error) {
//       console.error(
//         "POST /admin/products/manual-sheet-stock-sync error:",
//         error
//       );

//       return res.status(500).json({
//         ok: false,
//         error:
//           "MANUAL_SHEET_STOCK_SYNC_FAILED",
//       });
//     }
//   }
// );

app.post("/admin/products/manual-sheet-stock-sync", requireAdmin, async (req, res) => {
    try {
      const pointKey = String(
        req.body?.pointKey || ""
      )
        .trim()
        .replace(/,+$/, "");

      const modelName = String(
        req.body?.modelName || ""
      ).trim();

      const normalizedModel =
        String(
          req.body
            ?.normalizedModel ||
          modelName
        )
          .trim()
          .toUpperCase();

      const flavorLabel = String(
        req.body?.flavorLabel || ""
      ).trim();

      const normalizedFlavor =
        String(
          req.body
            ?.normalizedFlavor ||
          flavorLabel
        )
          .trim()
          .toUpperCase();

      const qty =
        Number(req.body?.qty);

      if (
        !pointKey ||
        !modelName ||
        !flavorLabel ||
        !Number.isInteger(qty) ||
        qty < 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "INVALID_MANUAL_STOCK_DATA",
        });
      }

      const pickupPoint =
        await PickupPoint.findOne({
          key: {
            $in: [
              pointKey,
              `${pointKey},`,
            ],
          },
        });

      if (!pickupPoint) {
        return res.status(404).json({
          ok: false,
          error:
            "PICKUP_POINT_NOT_FOUND",
          pointKey,
        });
      }

    const normalizeValue = (value) =>
      String(value || "")
        .toUpperCase()
        .replace(/🦆/g, "")
        .replace(/CARTRIDGE/g, "CATRIDGE")
        .replace(/\s*30\s*ML/g, "")
        .replace(/^CHASER\s+/g, "")

        // жидкости
        .replace(/\bLIQ\s+ELFLIQ\b/g, "ELFLIQ")
        .replace(/\bLIQ\s+HQD\b/g, "HQD")
        .replace(/\bLIQ\s+ETHEREUM\b/g, "ETHEREUM")
        .replace(/\bLIQ\s+SPECIAL\b/g, "SPECIAL")
        .replace(/\bLIQ\s+BLACK\b/g, "BLACK")
        .replace(/\bLIQ\s+FOR\s+PODS\b/g, "FOR PODS")
        .replace(/\bLIQ\s+VOZOL\s+PRIME\b/g, "VOZOL PRIME")
        .replace(/\bLIQ\s+PUFFY\b/g, "PUFFY")

        // ELF BAR / ELF DUCK
        .replace(/\bELF\s+DUCK\s+D3\s+25K\b/g, "ELF BAR D3")
        .replace(/\bELF\s+DUCK\s+D3\b/g, "ELF BAR D3")
        .replace(/\bELF\s+BAR\s+D3\s+25K\b/g, "ELF BAR D3")

        .replace(/\bELF\s+DUCK\s+1500\b/g, "ELF BAR 1500")
        .replace(/\bELF\s+BAR\s+1500\b/g, "ELF BAR 1500")

        .replace(/\bELF\s+DUCK\s+2000\b/g, "ELF BAR 2000")
        .replace(/\bELF\s+BAR\s+2000\b/g, "ELF BAR 2000")

        .replace(/\bELF\s+DUCK\s+3000\s+RI\b/g, "ELF BAR 3000")
        .replace(/\bELF\s+DUCK\s+3000\b/g, "ELF BAR 3000")
        .replace(/\bELF\s+3000\b/g, "ELF BAR 3000")
        .replace(/\bELF\s+BAR\s+3000\s+RI\b/g, "ELF BAR 3000")
        .replace(/\bELF\s+BAR\s+RI\s+3000\b/g, "ELF BAR 3000")
        .replace(/\bELF\s+BAR\s+3000\b/g, "ELF BAR 3000")

        .replace(/\bELF\s+DUCK\s+GH\s+33000\s+PRO\b/g, "ELF BAR GH 33000")
        .replace(/\bELF\s+BAR\s+GH\s+33000\s+PRO\b/g, "ELF BAR GH 33000")
        .replace(/\bELF\s+BAR\s+GH\s+33000\b/g, "ELF BAR GH 33000")

        .replace(/\bELF\s+DUCK\s+MOON\s+40K\b/g, "ELF BAR MOON 40K")
        .replace(/\bELF\s+BAR\s+MOON\s+40K\b/g, "ELF BAR MOON 40K")

        .replace(/\bELF\s+DUCK\s+KING\s+30K\b/g, "ELF BAR KING 30K")
        .replace(/\bELF\s+DUCK\s+ICE\s+KING\s+30K\b/g, "ELF BAR KING 30K")
        .replace(/\bELF\s+BAR\s+KING\s+30K\b/g, "ELF BAR KING 30K")

        .replace(/\bELF\s+DUCK\s+DUKE\s+30K\b/g, "ELF BAR DUKE 30K")
        .replace(/\bELF\s+BAR\s+DUKE\s+30K\b/g, "ELF BAR DUKE 30K")

        .replace(/\bELF\s+DUCK\s+TRIO\s+40K\b/g, "ELF TRIO 40K")
        .replace(/\bELF\s+BAR\s+TRIO\s+40K\b/g, "ELF TRIO 40K")

        .replace(/\s+/g, " ")
        .trim();

      const compactValue = (
        value
      ) =>
        normalizeValue(value)
          .replace(
            /[^A-ZА-ЯІЇЄҐ0-9]+/g,
            ""
          );

      const wantedModel =
        normalizeValue(
          normalizedModel
        );

      const wantedFlavor =
        compactValue(
          normalizedFlavor
        );

      const products =
        await Product.find({});

      let foundProduct = null;
      let foundFlavor = null;

      for (
        const product of products
      ) {
        const productNames = [
          product?.productKey,
          product?.title,
          product?.title1,
          product?.title2,
          [
            product?.title1,
            product?.title2,
          ]
            .filter(Boolean)
            .join(" "),
          product?.name,
          product?.model,
        ]
          .map(normalizeValue)
          .filter(Boolean);

        const modelMatches =
          productNames.some(
            (candidate) =>
              candidate ===
                wantedModel ||
              candidate.includes(
                wantedModel
              ) ||
              wantedModel.includes(
                candidate
              )
          );

        if (!modelMatches) {
          continue;
        }

        const flavors =
          Array.isArray(
            product?.flavors
          )
            ? product.flavors
            : [];

        for (
          const flavor of flavors
        ) {
          const flavorNames = [
            flavor?.flavorKey,
            flavor?.flavorLabel,
            flavor?.label,
            flavor?.name,
          ]
            .map(compactValue)
            .filter(Boolean);

          if (
            flavorNames.includes(
              wantedFlavor
            )
          ) {
            foundProduct =
              product;

            foundFlavor =
              flavor;

            break;
          }
        }

        if (
          foundProduct &&
          foundFlavor
        ) {
          break;
        }
      }

      console.log("=== MANUAL STOCK SEARCH ===");

      console.log({
        wantedModel,
        wantedFlavor,
      });

      for (const product of products) {
        console.log({
          product: product.productKey,
          names: [
            product.productKey,
            product.title,
            product.title1,
            product.title2,
            product.name,
            product.model,
          ].map(normalizeValue),
        });
      }

      if (!foundProduct) {
        return res.status(404).json({
          ok: false,
          error:
            "PRODUCT_NOT_FOUND",
          modelName,
          normalizedModel,
        });
      }

      if (!foundFlavor) {
        return res.status(404).json({
          ok: false,
          error:
            "FLAVOR_NOT_FOUND",
          modelName,
          flavorLabel,
          normalizedFlavor,
        });
      }

      foundFlavor
        .stockByPickupPoint =
          Array.isArray(
            foundFlavor
              ?.stockByPickupPoint
          )
            ? foundFlavor
                .stockByPickupPoint
            : [];

      let stockRow =
        foundFlavor
          .stockByPickupPoint
          .find(
            (row) =>
              String(
                row?.pickupPointId ||
                ""
              ) ===
              String(
                pickupPoint._id
              )
          );

        const syncedPointIds =
          await getSyncedPickupPointIdsByAnyPoint(
            pickupPoint._id
          );

        const pointIdsToSync =
          syncedPointIds.length
            ? syncedPointIds
            : [String(pickupPoint._id)];

        const existingRows =
          (foundFlavor.stockByPickupPoint || [])
            .filter((row) =>
              pointIdsToSync.includes(
                String(row?.pickupPointId || "")
              )
            );

        const syncedReservedQty =
          existingRows.length
            ? Math.max(
                ...existingRows.map((row) =>
                  Math.max(
                    0,
                    Number(row?.reservedQty || 0)
                  )
                )
              )
            : 0;

        for (const syncPickupPointId of pointIdsToSync) {
          const existing =
            (foundFlavor.stockByPickupPoint || [])
              .find(
                (row) =>
                  String(row?.pickupPointId || "") ===
                  String(syncPickupPointId)
              );

          if (existing) {
            existing.totalQty = qty;

            existing.reservedQty = Math.min(
              syncedReservedQty,
              qty
            );

            existing.updatedAt = new Date();

            existing.updatedByTelegramId =
              "google-sheet";
          } else {
            foundFlavor.stockByPickupPoint.push({
              pickupPointId:
                syncPickupPointId,

              totalQty:
                qty,

              reservedQty:
                Math.min(
                  syncedReservedQty,
                  qty
                ),

              updatedAt:
                new Date(),

              updatedByTelegramId:
                "google-sheet",
            });
          }
        }

      foundProduct.markModified(
        "flavors"
      );

      await foundProduct.save();

      cacheInvalidate("products:");

      console.log(
        "[MANUAL SHEET STOCK SYNC]",
        {
          source:
            req.body?.source,

          spreadsheetId:
            req.body
              ?.spreadsheetId,

          sheetName:
            req.body?.sheetName,

          editorEmail:
            req.body
              ?.editorEmail,

          pointKey,

          pickupPointId:
            String(
              pickupPoint._id
            ),

          productId:
            String(
              foundProduct._id
            ),

          productKey:
            String(
              foundProduct
                ?.productKey || ""
            ),

          modelName,

          flavorLabel,

          qty,
        }
      );

      return res.json({
        ok: true,

        pointKey,

        pickupPointId:
          String(
            pickupPoint._id
          ),

        productId:
          String(
            foundProduct._id
          ),

        productKey:
          String(
            foundProduct
              ?.productKey || ""
          ),

        modelName,

        flavorLabel,

        qty,
      });
    } catch (error) {
      console.error(
        "POST /admin/products/manual-sheet-stock-sync error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "MANUAL_SHEET_STOCK_SYNC_FAILED",
      });
    }
  }
);

app.get("/orders/:id/payment-config", async (req, res) => {
  try {
    const telegramId = requireTrustedTelegramId(req, res);
    if (!telegramId) return;
    const orderId = String(req.params?.id || "").trim();

    if (!telegramId) {
      return res.status(400).json({ ok: false, error: "telegramId is required" });
    }

    if (!orderId) {
      return res.status(400).json({ ok: false, error: "order id is required" });
    }

    const order = await Order.findOne(
      { _id: orderId, userTelegramId: telegramId },
      {
        _id: 1,
        orderNo: 1,
        totalZl: 1,
        currency: 1,
        deliveryType: 1,
        deliveryMethod: 1,
        pickupPointId: 1,
        status: 1,
        payment: 1,
      }
    ).lean();

    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    const point = await resolveOrderPaymentPoint(order);

    const methods = Array.isArray(point?.paymentConfig?.methods)
      ? point.paymentConfig.methods
          .filter((m) => m && m.isActive !== false && String(m.key || "").trim())
          .map((m) => ({
            key: String(m.key || "").trim(),
            label: String(m.label || "").trim(),
            detailsValue: String(m.detailsValue || "").trim(),
            badge: String(m.badge || "").trim(),
          }))
      : [];

    return res.json({
      ok: true,
      paymentConfig: {
        pointId: point?._id || null,
        pointTitle: point?.title || "",
        pointAddress: point?.address || "",
        methods,
      },
    });
  } catch (e) {
    console.error("GET /orders/:id/payment-config error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/promo-codes/activate", async (req, res) => {
    try {
      const telegramId =
        requireTrustedTelegramId(req, res);

      if (!telegramId) {
        return;
      }

      const code = normalizePromoCode(
        req.body?.code
      );

      if (!code) {
        return res.status(400).json({
          ok: false,
          error: "PROMO_NOT_FOUND",
        });
      }

      const promoCode =
        await getPromoCodeByCode(code);

      if (
        !promoCode ||
        promoCode?.isActive !== true
      ) {
        return res.status(404).json({
          ok: false,
          error: "PROMO_NOT_FOUND",
        });
      }

      const amountZl = Number(
        promoCode?.amountZl || 0
      );

      if (
        !Number.isFinite(amountZl) ||
        amountZl <= 0
      ) {
        return res.status(400).json({
          ok: false,
          error: "PROMO_NOT_FOUND",
        });
      }

      const safeAmountZl = Number(
        amountZl.toFixed(2)
      );

      const now = new Date();

      const existingUser =
        await User.collection.findOne(
          { telegramId },
          {
            projection: {
              _id: 1,
              promoCodeActivations: 1,
            },
          }
        );

      if (!existingUser) {
        return res.status(404).json({
          ok: false,
          error: "USER_NOT_FOUND",
        });
      }

      const alreadyUsed = Array.isArray(
        existingUser?.promoCodeActivations
      )
        ? existingUser.promoCodeActivations.some(
            (activation) =>
              normalizePromoCode(
                activation?.code
              ) === code
          )
        : false;

      if (alreadyUsed) {
        return res.status(409).json({
          ok: false,
          error: "PROMO_ALREADY_USED",
          usedCode: code,
        });
      }

      const updateResult =
        await User.collection.findOneAndUpdate(
          {
            telegramId,

            "promoCodeActivations.code": {
              $ne: code,
            },
          },

          {
            $inc: {
              cashbackBalance: safeAmountZl,
            },

            $push: {
              promoCodeActivations: {
                code,
                amountZl: safeAmountZl,
                promoCodeId: promoCode._id,
                activatedAt: now,
              },
            },

            $set: {
              updatedAt: now,
            },

            $unset: {
              promoCodeUsed: "",
              promoCodeUsedAt: "",
              promoCodeAmountZl: "",
            },
          },

          {
            returnDocument: "after",
          }
        );

      const updatedUser =
        updateResult?.value || updateResult;

      if (!updatedUser?._id) {
        return res.status(409).json({
          ok: false,
          error: "PROMO_ALREADY_USED",
          usedCode: code,
        });
      }

      await mongoose.connection
        .collection(PROMO_CODES_COLLECTION)
        .updateOne(
          {
            _id: promoCode._id,
          },

          {
            $inc: {
              activationsCount: 1,
            },

            $push: {
              activations: {
                telegramId,
                amountZl: safeAmountZl,
                activatedAt: now,
              },
            },

            $set: {
              lastActivatedAt: now,
              updatedAt: now,
            },
          }
        );

      return res.json({
        ok: true,
        code,
        amountZl: safeAmountZl,

        cashbackBalance: Number(
          updatedUser?.cashbackBalance || 0
        ),

        activation: {
          code,
          amountZl: safeAmountZl,
          activatedAt: now,
        },
      });
    } catch (error) {
      console.error(
        "POST /promo-codes/activate error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "PROMO_ACTIVATION_FAILED",
      });
    }
  }
);

}
