import Product from "../../models/Product.js";
import { getSyncedPickupPointIdsByAnyPoint } from "../server/helpers/chunk04.js";
import { cacheInvalidate } from "../server/helpers/chunk01.js";

export async function setFlavorStockAtPickupPoint({
  productId,
  flavorId,
  pickupPointId,
  totalQty,
  updatedByTelegramId = "crm",
}) {
  if (!productId || !flavorId || !pickupPointId) {
    throw new Error("INVALID_STOCK_PARAMS");
  }

  const nextQty = Math.max(0, Number(totalQty ?? 0));
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const flavor = product.flavors.id(flavorId);
  if (!flavor) {
    throw new Error("FLAVOR_NOT_FOUND");
  }

  const syncedPointIds =
    await getSyncedPickupPointIdsByAnyPoint(
      pickupPointId
    );
  const pointIdsToSync = syncedPointIds.length
    ? syncedPointIds
    : [String(pickupPointId)];

  const existingRows = (
    flavor.stockByPickupPoint || []
  ).filter((s) =>
    pointIdsToSync.includes(String(s.pickupPointId))
  );

  const syncedReservedQty = existingRows.length
    ? Math.max(
        ...existingRows.map((row) =>
          Math.max(0, Number(row?.reservedQty || 0))
        )
      )
    : 0;

  for (const syncPickupPointId of pointIdsToSync) {
    const existing = (
      flavor.stockByPickupPoint || []
    ).find(
      (s) =>
        String(s.pickupPointId) ===
        String(syncPickupPointId)
    );

    if (existing) {
      existing.totalQty = nextQty;
      existing.reservedQty = Math.min(
        syncedReservedQty,
        nextQty
      );
      existing.updatedAt = new Date();
      existing.updatedByTelegramId = String(
        updatedByTelegramId || ""
      );
    } else {
      flavor.stockByPickupPoint.push({
        pickupPointId: syncPickupPointId,
        totalQty: nextQty,
        reservedQty: Math.min(
          syncedReservedQty,
          nextQty
        ),
        updatedAt: new Date(),
        updatedByTelegramId: String(
          updatedByTelegramId || ""
        ),
      });
    }
  }

  await product.save();
  cacheInvalidate("products:");
  return product;
}
