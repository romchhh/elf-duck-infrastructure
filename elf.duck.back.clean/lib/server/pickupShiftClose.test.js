import assert from "node:assert/strict";
import { isPickupShiftOrder } from "./pickupShiftClose.js";

assert.equal(
  isPickupShiftOrder({ status: "created", payment: { status: "unpaid" } }),
  false,
  "unpaid checkout that never reached the group is not a shift order"
);

assert.equal(
  isPickupShiftOrder({
    status: "created",
    payment: { status: "checking", managerMessageId: "88421" },
  }),
  true,
  "order already posted to the manager group counts"
);

assert.equal(
  isPickupShiftOrder({ status: "assembled", payment: { status: "paid" } }),
  true
);

assert.equal(
  isPickupShiftOrder({ status: "completed" }),
  true
);

assert.equal(
  isPickupShiftOrder({ status: "canceled", payment: { status: "paid" } }),
  false
);

assert.equal(
  isPickupShiftOrder({
    status: "created",
    payment: { status: "unpaid", managerMessageId: "__sending__" },
  }),
  false,
  "notification lock is not a real group message"
);

console.log("pickupShiftClose.test.js ok");
