import { getServerContext } from "./context.js";
import {
  processDailyStockPull,
  processSheetStockPullCron,
  startSheetStockPullInterval,
} from "../googleSheets/stockPullScheduler.js";
import { processPickupShiftCloseReminders } from "./pickupShiftClose.js";
import { processDueFirstPurchaseAutomations } from "../crm/pushAutomations.js";
import { reconcileGhostReservedStock } from "./reconcileGhostReserved.js";
import helpers from "./helpers/index.js";

const CART_AUTO_CLEAR_INTERVAL_MS = Number(
  process.env.CART_AUTO_CLEAR_INTERVAL_MS || 60 * 1000
);

function resolveIntervalFn(name) {
  const ctx = getServerContext() || {};
  const fromCtx = ctx[name];
  if (typeof fromCtx === "function") return fromCtx;
  const fromHelpers = helpers?.[name];
  if (typeof fromHelpers === "function") return fromHelpers;
  return null;
}

function runIntervalJob(name) {
  try {
    const fn = resolveIntervalFn(name);
    if (typeof fn !== "function") {
      console.error(`[intervals] ${name} is not a function — skip`);
      return;
    }
    Promise.resolve(fn())
      .then((result) => {
        if (
          name === "processOrdersWithoutPaymentConfirm" &&
          (result?.annulled > 0 || result?.orphansReleased > 0)
        ) {
          console.log(
            `[intervals] payment-timeout: annulled=${result?.annulled || 0} orphansReleased=${result?.orphansReleased || 0}`
          );
        }
      })
      .catch((e) => {
        console.error(`[intervals] ${name} error:`, e);
      });
  } catch (e) {
    console.error(`[intervals] ${name} sync error:`, e);
  }
}

export function startServerIntervals() {
  const ctx = getServerContext();
  Object.assign(globalThis, ctx);

  console.log("[intervals] starting server intervals (payment-timeout + stock jobs)");

  setInterval(() => {
    runIntervalJob("processCashbackLedgerExpirations");
  }, 6 * 60 * 60 * 1000);

  // Кожні 60с: неоплачені без способу оплати → зняти резерв (~10 хв)
  setInterval(() => {
    runIntervalJob("processOrdersWithoutPaymentConfirm");
  }, 60 * 1000);

  setInterval(() => {
    runIntervalJob("processStaleCarts");
  }, CART_AUTO_CLEAR_INTERVAL_MS);

  setInterval(() => {
    processPickupShiftCloseReminders().catch((e) => {
      console.error("pickup shift close reminder error:", e);
    });
  }, 60 * 1000);

  setTimeout(() => {
    runIntervalJob("processStaleCarts");
  }, 10 * 1000);

  runIntervalJob("processOrdersWithoutPaymentConfirm");

  runIntervalJob("processCashbackLedgerExpirations");

  // Ghost reserved: звірка з відкритими замовленнями (переживає рестарт)
  const runGhostReconcile = () => {
    reconcileGhostReservedStock()
      .then((r) => {
        if (r?.fixed > 0) {
          console.log(
            `[intervals] ghost-reserve reconcile: fixed=${r.fixed} scanned=${r.scanned} ${r.durationMs}ms`
          );
        }
      })
      .catch((e) => {
        console.error("[intervals] ghost-reserve reconcile error:", e);
      });
  };
  setTimeout(runGhostReconcile, 20 * 1000);
  setInterval(runGhostReconcile, 5 * 60 * 1000);

  setInterval(() => {
    runIntervalJob("processDailyPointStats");
  }, 60 * 1000);

  runIntervalJob("processDailyPointStats");

  // Щоденно о 08:00 (Europe/Warsaw): всі склади Google Таблиця → Mongo
  setInterval(() => {
    processDailyStockPull().catch((e) => {
      console.error("daily stock pull interval error:", e);
    });
  }, 60 * 1000);

  setTimeout(() => {
    processDailyStockPull().catch((e) => {
      console.error("daily stock pull initial run error:", e);
    });
  }, 30 * 1000);

  startSheetStockPullInterval();

  setInterval(() => {
    processSheetStockPullCron().catch((e) => {
      console.error("sheet stock pull cron error:", e);
    });
  }, 60 * 1000);

  // Отложенные автопуши после первой покупки (переживают рестарт API)
  setInterval(() => {
    processDueFirstPurchaseAutomations().catch((e) => {
      console.error("first purchase automation due error:", e);
    });
  }, 30 * 1000);

  setTimeout(() => {
    processDueFirstPurchaseAutomations().catch((e) => {
      console.error("first purchase automation initial run error:", e);
    });
  }, 15 * 1000);
}
