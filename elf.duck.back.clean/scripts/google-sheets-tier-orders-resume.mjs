/** Доробити tier5 + stack після rate limit; або відкат часткового tier5 */
import { runGoogleSheetsOrderSync } from "../lib/googleSheets/orderSync.js";
import { SPREADSHEET_ID_BY_POINT_KEY } from "../lib/googleSheets/config.js";
import { applyAssortmentDelta } from "../lib/googleSheets/assortmentGrid.js";
import { getWarsawDayKey } from "../lib/server/helpers/chunk08.js";

const POINT = "mokot-w";
const spreadsheetId = SPREADSHEET_ID_BY_POINT_KEY[POINT];
const dayKey = getWarsawDayKey(new Date());

function order(qty, totalZl) {
  return {
    pickupPointKey: POINT,
    deliveryType: "pickup",
    stockCommittedAt: new Date(),
    createdAt: new Date(),
    totalZl,
    payment: {
      status: "paid",
      managerDisplayCurrency: "PLN",
      managerDisplayAmount: totalZl,
      cashbackAppliedZl: 0,
      referralFirstOrderDiscountTotalZl: 0,
    },
    items: [
      {
        productTitle1: "ELFLIQ",
        productTitle2: "30 ML",
        productKey: "elfliq-30-ml",
        flavors: [{ flavorLabel: "Blue Razz Ice", qty }],
      },
    ],
  };
}

const tier5 = order(5, 150);

const qty = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: "Mokotów",
  dayKey,
  modelName: "ELFLIQ 30 ML",
  productKey: "elfliq-30-ml",
  flavorLabel: "Blue Razz Ice",
  deltaQty: 0,
  dryRun: true,
});
console.log("assortment now:", qty.currentQty);

// Якщо після збою лишились «зайві» продажі — спочатку reverse
const rev = await runGoogleSheetsOrderSync(tier5, {
  direction: "reverse",
  dryRun: false,
});
console.log("reverse tier5 (cleanup):", rev.ok);

const qty2 = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: "Mokotów",
  dayKey,
  modelName: "ELFLIQ 30 ML",
  productKey: "elfliq-30-ml",
  flavorLabel: "Blue Razz Ice",
  deltaQty: 0,
  dryRun: true,
});
console.log("assortment after cleanup:", qty2.currentQty);

const apply = await runGoogleSheetsOrderSync(tier5, { dryRun: false });
console.log("apply tier5:", apply.ok, apply.results?.length);

const rev2 = await runGoogleSheetsOrderSync(tier5, {
  direction: "reverse",
  dryRun: false,
});
console.log("reverse tier5:", rev2.ok);

const qty3 = await applyAssortmentDelta({
  spreadsheetId,
  pointLabel: "Mokotów",
  dayKey,
  modelName: "ELFLIQ 30 ML",
  productKey: "elfliq-30-ml",
  flavorLabel: "Blue Razz Ice",
  deltaQty: 0,
  dryRun: true,
});
console.log("assortment final:", qty3.currentQty);
