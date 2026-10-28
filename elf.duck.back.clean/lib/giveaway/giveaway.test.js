import assert from "node:assert/strict";
import {
  prizeAmountForPlace,
  GIVEAWAY_WINNER_COUNT,
} from "./config.js";
import {
  getActiveGiveawayMonthKey,
  isGiveawayParticipationWindow,
  resolveGiveawayUiPhase,
  msUntilNextGiveawayMonth,
} from "./schedule.js";
import { isBlikOrderPayment } from "./payment.js";

assert.equal(prizeAmountForPlace(1), 150);
assert.equal(prizeAmountForPlace(5), 150);
assert.equal(prizeAmountForPlace(6), 100);
assert.equal(prizeAmountForPlace(10), 100);
assert.equal(prizeAmountForPlace(11), 50);
assert.equal(prizeAmountForPlace(25), 50);
assert.equal(GIVEAWAY_WINNER_COUNT, 25);

assert.equal(isBlikOrderPayment({ payment: { method: "blik" } }), true);
assert.equal(isBlikOrderPayment({ payment: { method: "cash" } }), false);
assert.equal(isBlikOrderPayment({ payment: { method: "BLIK" } }), true);

const openMonth = { status: "open" };
assert.equal(
  resolveGiveawayUiPhase(openMonth, new Date("2026-03-10T12:00:00Z")),
  "active"
);

const drawnMonth = { status: "drawn" };
assert.equal(
  resolveGiveawayUiPhase(drawnMonth, new Date("2026-03-10T12:00:00Z")),
  "results"
);

assert.ok(msUntilNextGiveawayMonth(new Date()) > 0);
assert.match(getActiveGiveawayMonthKey(), /^\d{4}-\d{2}$/);

console.log("giveaway tests ok");
