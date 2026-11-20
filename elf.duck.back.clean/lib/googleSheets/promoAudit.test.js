import assert from "node:assert/strict";
import {
  applyMerryOnePlusOne,
  lineChargeZl,
  merryGiftSheetsDiscountZl,
} from "../promos/merryOnePlusOne.js";
import {
  getStatsSheetGiftQty,
  getStatsSheetPaidQty,
  getStatsSheetProductQty,
  getStatsSheetTierQty,
} from "../server/helpers/chunk09.js";
import { buildProductAggregates } from "./dailyStatsSync.js";
import {
  getOrderItemsSubtotalZl,
  getOrderMerryGiftDiscountZl,
  getOrderSheetsDiscountTotalZl,
} from "../server/helpers/chunk08.js";
import { repriceCartItemsWithSmartPricing } from "../server/helpers/chunk05.js";
import { collectProductSales } from "../crm/analytics/products.js";
import { buildDailyStatsMessage } from "../server/helpers/chunk10.js";

function flavor(productKey, qty, unitPrice, extra = {}) {
  return {
    productKey,
    categoryKey: productKey.includes("blade") ? "disposables" : "liquids",
    productTitle1: productKey,
    flavors: [
      {
        flavorKey: extra.flavorKey || "a",
        qty,
        unitPrice,
        giftQty: extra.giftQty,
        label: extra.label || "A",
      },
    ],
  };
}

function orderFromCart(items) {
  const priced = applyMerryOnePlusOne(items);
  return {
    crmSaleDate: new Date("2026-11-20T12:00:00Z"),
    userTelegramId: "1",
    payment: { cashbackAppliedZl: 0, referralFirstOrderDiscountTotalZl: 0, promoDiscountZl: 0 },
    items: priced.map((it) => ({
      productKey: it.productKey,
      categoryKey: it.productKey.includes("blade") ? "disposables" : "liquids",
      productTitle1: it.productKey,
      flavors: [
        {
          flavorKey: it.flavorKey || "a",
          qty: it.qty,
          giftQty: it.giftQty,
          unitPrice: it.unitPrice,
          label: it.flavorKey || "A",
        },
      ],
    })),
  };
}

const three = orderFromCart([
  { productKey: "merry-mi", flavorKey: "mint", qty: 3, unitPrice: 55 },
]);
const row3 = three.items[0];
assert.equal(row3.flavors[0].giftQty, 1);
assert.equal(lineChargeZl(row3.flavors[0]), 110);
assert.equal(getStatsSheetProductQty(row3), 3, "зі складу йде 3 шт.");
assert.equal(getStatsSheetPaidQty(row3), 2, "покупки — 2");
assert.equal(getStatsSheetGiftQty(row3), 1, "брак — 1");
assert.equal(getStatsSheetTierQty(three, row3), 2, "tier по оплачених, не по подарунку");
assert.equal(getOrderItemsSubtotalZl(three), 110);
assert.equal(getOrderMerryGiftDiscountZl(three), 55);
assert.equal(getOrderSheetsDiscountTotalZl(three), 55);

const agg = buildProductAggregates([three]);
assert.equal(agg[0].sold, 2);
assert.equal(agg[0].brak, 1);
assert.equal(agg[0].tier2, 2);
assert.equal(agg[0].tier34, 0);

const mixedPrices = applyMerryOnePlusOne([
  { productKey: "merry-mi", flavorKey: "dear", qty: 1, unitPrice: 60 },
  { productKey: "merry-mi", flavorKey: "cheap", qty: 2, unitPrice: 40 },
]);
assert.equal(mixedPrices[0].giftQty, 0);
assert.equal(mixedPrices[1].giftQty, 1);
assert.equal(lineChargeZl(mixedPrices[0]) + lineChargeZl(mixedPrices[1]), 100);

const separate = applyMerryOnePlusOne([
  { productKey: "merry-mi", qty: 2, unitPrice: 55 },
  { productKey: "merry-mi-blade-30k", qty: 2, unitPrice: 110 },
]);
assert.equal(separate[0].giftQty, 0);
assert.equal(separate[1].giftQty, 0);

const six = orderFromCart([
  { productKey: "merry-mi-blade-30k", qty: 6, unitPrice: 110 },
]);
assert.equal(getStatsSheetPaidQty(six.items[0]), 4);
assert.equal(getStatsSheetGiftQty(six.items[0]), 2);
assert.equal(getOrderItemsSubtotalZl(six), 440);
assert.equal(getOrderSheetsDiscountTotalZl(six), 220);

const products = [
  { productKey: "merry-mi", categoryKey: "liquids", price: 55 },
  { productKey: "merry-mi-blade-30k", categoryKey: "disposables", price: 110 },
  { productKey: "puffy-30-ml", categoryKey: "liquids", price: 50 },
];
const smart = repriceCartItemsWithSmartPricing(
  [
    { productKey: "merry-mi", qty: 3, unitPrice: 1 },
    { productKey: "merry-mi-blade-30k", qty: 3, unitPrice: 1 },
    { productKey: "puffy-30-ml", qty: 1, unitPrice: 1 },
  ],
  products
);
const byKey = Object.fromEntries(
  smart.repricedItems.map((it) => [it.productKey, it.unitPrice])
);
assert.equal(smart.smartPricingMeta.liquidUnitsQty, 1, "Merry Mi не входить у smart liquids");
assert.equal(smart.smartPricingMeta.disposableUnitsQty, 0, "Blade не входить у smart disposables");
assert.equal(byKey["merry-mi"], 55);
assert.equal(byKey["merry-mi-blade-30k"], 110);

const sales = collectProductSales([three]);
const sale = [...sales.values()][0];
assert.equal(sale.sold, 2, "CRM «Продано» без подарунка");
assert.equal(sale.revenue, 110);

const stats = buildDailyStatsMessage(
  { key: "mokotow", title: "Mokotów" },
  [three],
  "2026-11-20"
);
assert.match(stats, /Продано штук: <b>2<\/b>/);
assert.match(stats, /Брак \(0 zł\): <b>1<\/b>/);
assert.match(stats, /Брак: <b>1<\/b> шт\./);
assert.doesNotMatch(stats, /Продано штук: <b>3<\/b>/);

console.log("promo audit ok");
console.log({
  charge: 110,
  paid: 2,
  brak: 1,
  stock: 3,
  discounts: 55,
  crmSold: sale.sold,
  crmRevenue: sale.revenue,
});
