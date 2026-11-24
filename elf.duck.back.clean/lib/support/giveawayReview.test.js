import assert from "node:assert/strict";
import {
  ratingLabelForGiveawayReview,
  validateGiveawayReviewInput,
  GIVEAWAY_REVIEW_SOURCE,
  buildGiveawayReviewWebAppUrl,
} from "./giveawayReview.js";

assert.equal(GIVEAWAY_REVIEW_SOURCE, "giveaway_promo");
assert.equal(typeof buildGiveawayReviewWebAppUrl(), "string");

assert.equal(validateGiveawayReviewInput({ rating: "great" }).ok, true);
assert.equal(validateGiveawayReviewInput({ rating: "GREAT" }).ratingKey, "great");
assert.equal(
  validateGiveawayReviewInput({ rating: "bad" }).reason,
  "DETAILS_TOO_SHORT"
);
assert.equal(
  validateGiveawayReviewInput({ rating: "bad", details: "ok" }).reason,
  "DETAILS_TOO_SHORT"
);
assert.equal(
  validateGiveawayReviewInput({ rating: "good", details: "trochę wolno" }).ok,
  true
);
assert.equal(
  validateGiveawayReviewInput({ rating: "meh" }).reason,
  "INVALID_RATING"
);

assert.equal(
  ratingLabelForGiveawayReview("ru", "great"),
  "Всё супер, понравилось!"
);
assert.match(ratingLabelForGiveawayReview("pl", "bad"), /Nie/);

console.log("giveawayReview.test.js ok");
