/** Shared mutable state that shop helpers and the Telegram bot both touch. */
export const inpostTrackingInputState = new Map();
export const managerClientMessageState = new Map();
export const managerClientMessageStateByChat = new Map();
export const paymentReminderTimeouts = new Map();
export const paymentReminderIntervals = new Map();
export const broadcastJobs = new Map();

export const PROMO_CODES_COLLECTION = "promo_codes";
export const BROADCAST_TEMPLATES_COLLECTION = "broadcast_templates";

Object.assign(globalThis, {
  inpostTrackingInputState,
  managerClientMessageState,
  managerClientMessageStateByChat,
  paymentReminderTimeouts,
  paymentReminderIntervals,
  broadcastJobs,
  PROMO_CODES_COLLECTION,
  BROADCAST_TEMPLATES_COLLECTION,
});
