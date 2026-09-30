import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";

/**
 * Idempotent index creation for production (autoIndex is off in prod).
 */
export async function ensureDbIndexes() {
  try {
    await Promise.all([
      Cart.collection.createIndex(
        { cartAutoClearAt: 1, updatedAt: 1 },
        {
          name: "cart_stale_sweep",
          partialFilterExpression: {
            "items.0": { $exists: true },
          },
        }
      ),
      Order.collection.createIndex(
        { status: 1, "payment.status": 1, createdAt: 1 },
        { name: "order_payment_reminder_cron" }
      ),
      Order.collection.createIndex(
        { pickupPointId: 1, createdAt: -1 },
        { name: "order_pickup_point_created" }
      ),
      Order.collection.createIndex(
        { "items.productId": 1 },
        { name: "order_items_product_id" }
      ),
      Order.collection.createIndex(
        { status: 1, completedAt: -1 },
        {
          name: "order_completed_at",
          partialFilterExpression: {
            completedAt: { $type: "date" },
          },
        }
      ),
      Order.collection.createIndex(
        { status: 1, shippedAt: -1 },
        {
          name: "order_shipped_at",
          partialFilterExpression: {
            shippedAt: { $type: "date" },
          },
        }
      ),
      User.collection.createIndex(
        { "referral.code": 1 },
        { name: "user_referral_code", sparse: true }
      ),
      User.collection.createIndex(
        { username: 1 },
        { name: "user_username", sparse: true }
      ),
      Product.collection.createIndex(
        { isActive: 1, categoryKey: 1, sortOrder: 1, createdAt: -1 },
        { name: "product_catalog_list" }
      ),
      Category.collection.createIndex(
        { isActive: 1, sortOrder: 1 },
        { name: "category_active_sort" }
      ),
    ]);

    console.log("✅ MongoDB shop indexes ensured");
  } catch (error) {
    console.error(
      "MongoDB shop index sync failed:",
      error?.message || error
    );
  }
}
