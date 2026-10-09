import { getServerContext } from "./context.js";
import {
  processDailyStockPull,
  processSheetStockPullCron,
  startSheetStockPullInterval,
} from "../googleSheets/stockPullScheduler.js";

const CART_AUTO_CLEAR_INTERVAL_MS = Number(
  process.env.CART_AUTO_CLEAR_INTERVAL_MS || 60 * 1000
);

export function startServerIntervals() {
  const ctx = getServerContext();
  Object.assign(globalThis, ctx);

  const {
    processCashbackLedgerExpirations,
    processOrdersWithoutPaymentConfirm,
    processStaleCarts,
    processDailyPointStats,
  } = ctx;

  setInterval(() => {
    processCashbackLedgerExpirations().catch((e) => {
      console.error("cashback expiration interval error:", e);
    });
  }, 6 * 60 * 60 * 1000);

  setInterval(() => {
    processOrdersWithoutPaymentConfirm();
  }, 60 * 1000);

  setInterval(() => {
    processStaleCarts();
  }, CART_AUTO_CLEAR_INTERVAL_MS);

  setTimeout(() => {
    processStaleCarts();
  }, 10 * 1000);

  processOrdersWithoutPaymentConfirm();

  processCashbackLedgerExpirations().catch((e) => {
    console.error("initial cashback expiration run error:", e);
  });

  setInterval(() => {
    processDailyPointStats().catch((e) => {
      console.error("daily point stats interval error:", e);
    });
  }, 60 * 1000);

  processDailyPointStats().catch((e) => {
    console.error("daily point stats initial run error:", e);
  });

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
}
