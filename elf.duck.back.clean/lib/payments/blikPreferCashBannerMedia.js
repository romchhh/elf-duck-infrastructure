import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export function getBlikPreferCashBannerDir() {
  return path.join(backendRoot, "assets/payment");
}

export function getPaymentMediaPublicBaseUrl() {
  const base = String(
    process.env.PAYMENT_MEDIA_PUBLIC_BASE_URL ||
      process.env.GIVEAWAY_MEDIA_PUBLIC_BASE_URL ||
      process.env.PUSH_MEDIA_PUBLIC_BASE_URL ||
      process.env.API_URL ||
      process.env.VITE_API_URL ||
      ""
  ).trim();

  if (base) return base.replace(/\/$/, "");

  const port = String(process.env.PORT || "3000");
  return `http://localhost:${port}`;
}

export function getBlikPreferCashBannerFileName(lang = "ru") {
  return String(lang || "ru").toLowerCase() === "pl"
    ? "paymentBlikPreferCash-pl.webp"
    : "paymentBlikPreferCash-ru.webp";
}

export function getBlikPreferCashBannerUrl(lang = "ru") {
  const file = getBlikPreferCashBannerFileName(lang);
  return `${getPaymentMediaPublicBaseUrl()}/payment-media/${file}`;
}
