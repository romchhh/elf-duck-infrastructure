import assert from "node:assert/strict";
import {
  applyMerryOnePlusOne,
  chargeableQtyOf,
  isMerryOnePlusOneActive,
  lineChargeZl,
  merryGiftSheetsDiscountZl,
} from "./merryOnePlusOne.js";

const at = new Date("2026-11-20T12:00:00+01:00");
const before = new Date("2026-11-19T22:00:00+01:00");

assert.equal(isMerryOnePlusOneActive(at), true);
assert.equal(isMerryOnePlusOneActive(before), false);

const two = applyMerryOnePlusOne(
  [
    { productKey: "merry-mi", qty: 2, unitPrice: 55 },
  ],
  at
);
assert.equal(two[0].giftQty, 0);
assert.equal(lineChargeZl(two[0]), 110);

const three = applyMerryOnePlusOne(
  [
    { productKey: "merry-mi", qty: 1, unitPrice: 60, flavorKey: "a" },
    { productKey: "merry-mi", qty: 2, unitPrice: 40, flavorKey: "b" },
  ],
  at
);
const giftA = three.find((x) => x.flavorKey === "a");
const giftB = three.find((x) => x.flavorKey === "b");
assert.equal(giftA.giftQty, 0, "дорожча не стає подарунком");
assert.equal(giftB.giftQty, 1, "найдешевша з трьох — подарунок");
assert.equal(lineChargeZl(giftA) + lineChargeZl(giftB), 60 + 40);

const mixed = applyMerryOnePlusOne(
  [
    { productKey: "merry-mi", qty: 2, unitPrice: 55 },
    { productKey: "merry-mi-blade-30k", qty: 2, unitPrice: 110 },
  ],
  at
);
assert.equal(mixed[0].giftQty, 0);
assert.equal(mixed[1].giftQty, 0, "різні лінійки не змішуються");

const six = applyMerryOnePlusOne(
  [{ productKey: "merry-mi-blade-30k", qty: 6, unitPrice: 110 }],
  at
);
assert.equal(six[0].giftQty, 2);
assert.equal(chargeableQtyOf(six[0]), 4);
assert.equal(lineChargeZl(six[0]), 440);

const closed = applyMerryOnePlusOne(
  [{ productKey: "merry-mi", qty: 3, unitPrice: 55, giftQty: 3 }],
  before
);
assert.equal(closed[0].giftQty, 0, "клієнтський giftQty до старту скидається");

const priced = applyMerryOnePlusOne(
  [{ productKey: "merry-mi", qty: 3, unitPrice: 50, giftQty: 9 }],
  at
);
assert.equal(priced[0].giftQty, 1);
assert.equal(lineChargeZl(priced[0]), 100);
assert.equal(
  merryGiftSheetsDiscountZl([
    {
      flavors: [
        {
          qty: 3,
          giftQty: 1,
          unitPrice: 45,
          referralFirstOrderDiscountPerItem: 5,
        },
      ],
    },
  ]),
  50,
  "скидка в таблиці = подарунок × ціна до реф-знижки"
);

console.log("merry 1+1=3 tests ok");
