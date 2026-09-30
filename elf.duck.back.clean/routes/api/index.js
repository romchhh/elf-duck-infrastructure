import { registerRoutes as registerCourier } from "./adminCourier.js";
import { registerRoutes as registerCore } from "./core.js";
import { registerRoutes as registerFavorites } from "./favoritesAndShare.js";
import { registerRoutes as registerPickupAdmin } from "./pickupAndAdminUsers.js";
import { registerRoutes as registerCategoriesProducts } from "./categoriesAndProducts.js";
import { registerRoutes as registerCart } from "./cart.js";
import { registerRoutes as registerOrders } from "./orders.js";
import { registerRoutes as registerAdminProducts } from "./adminOrdersAndProducts.js";
import { registerRoutes as registerBroadcast } from "./broadcastTemplates.js";
import { registerRoutes as registerAdminAnalytics } from "./adminAnalytics.js";

export function registerShopApiRoutes(app) {
  registerCourier(app);
  registerCore(app);
  registerFavorites(app);
  registerPickupAdmin(app);
  registerCategoriesProducts(app);
  registerCart(app);
  registerOrders(app);
  registerAdminProducts(app);
  registerBroadcast(app);
  registerAdminAnalytics(app);
}
