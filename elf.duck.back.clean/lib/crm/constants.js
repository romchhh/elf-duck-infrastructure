export const CRM_TIME_ZONE = "Europe/Warsaw";

export const BROADCAST_TEMPLATES_COLLECTION = "broadcast_templates";

export const CRM_FAVORITE_CUSTOMERS_COLLECTION = "crm_favorite_customers";

export const CRM_SESSION_COOKIE = "elfduck_crm_session";
export const CRM_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const CRM_PUSH_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export const CRM_PUSH_MEDIA_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Max telegram IDs returned for send when includeTelegramIds=true */
export const CRM_PUSH_AUDIENCE_ID_CAP = Math.min(
  50000,
  Math.max(1000, Number(process.env.CRM_PUSH_AUDIENCE_ID_CAP || 30000))
);

export const PUSH_ATTRIBUTION_WINDOW_DAYS = 7;
