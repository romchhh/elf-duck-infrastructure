/**
 * Очистити кошик користувача + зняти reservedQty зі складу.
 *
 * docker compose exec api node scripts/clear-user-cart.mjs --telegram 123456789
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import { releaseReservedStockForCart } from "../lib/server/helpers/chunk08.js";
import { cacheInvalidate } from "../lib/server/helpers/chunk01.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendRoot, "..", ".env") });

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "").trim() : "";
}

const telegramId = arg("--telegram") || arg("--telegramId");
if (!telegramId) {
  console.error("Usage: node scripts/clear-user-cart.mjs --telegram <telegramId>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const cart = await Cart.findOne({ telegramId });
if (!cart) {
  console.log("no cart for", telegramId);
  await mongoose.disconnect();
  process.exit(0);
}

console.log("before", {
  items: cart.items?.length || 0,
  stockContextId: cart.stockContextId || "",
  checkoutPickupPointId: String(cart.checkoutPickupPointId || ""),
  cartAutoClearAt: cart.cartAutoClearAt,
});

let release = await releaseReservedStockForCart(cart);
if (release?.ok === false && cart.checkoutPickupPointId) {
  release = await releaseReservedStockForCart({
    ...cart.toObject(),
    stockContextId: String(cart.checkoutPickupPointId),
    reservedContextId: String(cart.checkoutPickupPointId),
  });
}

cart.items = [];
cart.checkout = {};
cart.stockContextId = "";
cart.reservedContextId = "";
cart.cartAutoClearAt = null;
cart.staleClearedAt = new Date();
await cart.save();

cacheInvalidate("products:");

console.log("after", { released: release?.released, releaseOk: release?.ok, reason: release?.reason });
await mongoose.disconnect();
