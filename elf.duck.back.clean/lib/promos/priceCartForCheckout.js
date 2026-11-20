import Product from "../../models/Product.js";
import { loadSmartPricingSettings } from "../crm/smartPricingSettings.js";
import { repriceCartItemsWithSmartPricing } from "../server/helpers/chunk05.js";
import {
  applyReferralFirstOrderDiscountToCartItems,
  getIsReferralFirstOrderDiscountEligible,
} from "../server/helpers/chunk06.js";
import { applyMerryOnePlusOne } from "./merryOnePlusOne.js";

/**
 * Ціна на підтвердженні замовлення рахується тільки на сервері.
 * Клієнтські unitPrice і giftQty не використовуються.
 */
export async function priceCartItemsForCheckout(items, telegramId) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];

  const productKeys = Array.from(
    new Set(source.map((it) => String(it?.productKey || "").trim()).filter(Boolean))
  );

  const products = productKeys.length
    ? await Product.find(
        { productKey: { $in: productKeys } },
        {
          productKey: 1,
          categoryKey: 1,
          price: 1,
          listPriceZl: 1,
          title1: 1,
          title2: 1,
          newBadge: 1,
          flavors: 1,
        }
      ).lean()
    : [];

  const settings = await loadSmartPricingSettings();
  const { repricedItems } = repriceCartItemsWithSmartPricing(
    source,
    products,
    settings
  );
  const merryItems = applyMerryOnePlusOne(repricedItems);
  const eligibility = await getIsReferralFirstOrderDiscountEligible(
    telegramId,
    merryItems
  );

  if (!eligibility.eligible) {
    return merryItems.map((it) => ({
      ...it,
      referralFirstOrderDiscountPercent: 0,
      referralFirstOrderDiscountPerItem: 0,
      referralFirstOrderDiscountTotalZl: 0,
    }));
  }

  return applyReferralFirstOrderDiscountToCartItems(
    merryItems,
    eligibility.percent
  ).items;
}
