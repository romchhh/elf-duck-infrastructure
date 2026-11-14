import assert from "node:assert/strict";
import { isOrderEligibleForEarnedCashback } from "./eligibility.js";

const inpostBlik = {
  deliveryType: "delivery",
  deliveryMethod: "inpost",
  payment: { method: "blik" },
};
const pickupBlik = {
  deliveryType: "pickup",
  deliveryMethod: "",
  payment: { method: "BLIK" },
};
const courierBlik = {
  deliveryType: "delivery",
  deliveryMethod: "courier",
  payment: { method: "blik" },
};
const inpostCash = {
  deliveryType: "delivery",
  deliveryMethod: "inpost",
  payment: { method: "cash" },
};
const pickupCrypto = {
  deliveryType: "pickup",
  payment: { method: "crypto" },
};

assert.equal(isOrderEligibleForEarnedCashback(inpostBlik), true);
assert.equal(isOrderEligibleForEarnedCashback(pickupBlik), false);
assert.equal(isOrderEligibleForEarnedCashback(courierBlik), false);
assert.equal(isOrderEligibleForEarnedCashback(inpostCash), true);
assert.equal(isOrderEligibleForEarnedCashback(pickupCrypto), true);

console.log("cashback eligibility tests ok");
