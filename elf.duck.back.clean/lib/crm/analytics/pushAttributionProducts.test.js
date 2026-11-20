import assert from "node:assert/strict";
import {
  extractCampaignAttributionProductKeys,
  orderHasPaidProductKeys,
} from "./pushAttributionProducts.js";

const merryOnePlusOne = {
  name: "Merry Mi 1+1=3",
  message: {
    textRu:
      "Merry Mi: 1 плюс 1 равно 3 — третий в подарок! Откройте каталог.",
    buttonsRu: [{ text: "Купить", kind: "web_app", path: "/" }],
  },
};

assert.deepEqual(
  extractCampaignAttributionProductKeys(merryOnePlusOne).sort(),
  ["merry-mi", "merry-mi-blade-30k"]
);

assert.deepEqual(
  extractCampaignAttributionProductKeys({
    message: { text: "Скидка на весь магазин сегодня" },
  }),
  []
);

assert.equal(
  orderHasPaidProductKeys(
    [
      {
        productKey: "merry-mi-blade-30k",
        flavors: [{ qty: 3, giftQty: 1 }],
      },
    ],
    ["merry-mi-blade-30k"]
  ),
  true
);

assert.equal(
  orderHasPaidProductKeys(
    [
      {
        productKey: "xros-6-pod",
        flavors: [{ qty: 1, giftQty: 0 }],
      },
    ],
    ["merry-mi", "merry-mi-blade-30k"]
  ),
  false
);

assert.equal(
  orderHasPaidProductKeys(
    [{ productKey: "merry-mi", flavors: [{ qty: 1, giftQty: 1 }] }],
    ["merry-mi"]
  ),
  false
);

console.log("pushAttributionProducts.test.js ok");