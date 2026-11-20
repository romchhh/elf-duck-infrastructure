import assert from "node:assert/strict";
import { buildProductAggregates } from "./dailyStatsSync.js";
import {
  getStatsSheetGiftQty,
  getStatsSheetPaidQty,
  getStatsSheetProductQty,
} from "../server/helpers/chunk09.js";

const row = {
  productKey: "merry-mi",
  categoryKey: "liquids",
  productTitle1: "LIQUID MERRY MI",
  productTitle2: "30 ML / 30 MG",
  flavors: [
    {
      flavorKey: "mixed-berries",
      qty: 3,
      giftQty: 1,
      unitPrice: 55,
      label: "Mixed Berries",
    },
  ],
};

assert.equal(getStatsSheetProductQty(row), 3);
assert.equal(getStatsSheetPaidQty(row), 2);
assert.equal(getStatsSheetGiftQty(row), 1);

const aggregates = buildProductAggregates([{ items: [row] }]);
assert.equal(aggregates.length, 1);
assert.equal(aggregates[0].model, "MERRY MI 3%");
assert.equal(aggregates[0].sold, 2, "оплачені — у покупки");
assert.equal(aggregates[0].brak, 1, "подарунок — у БРАК");
assert.equal(
  aggregates[0].tier1 +
    aggregates[0].tier2 +
    aggregates[0].tier34 +
    aggregates[0].tier5,
  2,
  "у tier лише оплачені шт."
);

console.log("merry gift → brak tests ok");
