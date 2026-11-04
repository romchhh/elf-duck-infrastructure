import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export function getGiveawayWinnerBannerDir() {
  return path.join(backendRoot, "assets/giveaway");
}

export function getGiveawayMediaPublicBaseUrl() {
  const base = String(
    process.env.GIVEAWAY_MEDIA_PUBLIC_BASE_URL ||
      process.env.PUSH_MEDIA_PUBLIC_BASE_URL ||
      process.env.CATALOG_MEDIA_PUBLIC_BASE_URL ||
      process.env.API_URL ||
      process.env.VITE_CRM_API_URL ||
      process.env.VITE_API_URL ||
      ""
  ).trim();

  if (base) return base.replace(/\/$/, "");

  const port = String(process.env.PORT || "3000");
  return `http://localhost:${port}`;
}

export function getDefaultGiveawayWinnerBannerFileName(lang = "ru") {
  return String(lang || "ru").toLowerCase() === "pl"
    ? "giveaway-winner-pl.webp"
    : "giveaway-winner-ru.webp";
}

export function getDefaultGiveawayWinnerBannerUrl(lang = "ru") {
  const file = getDefaultGiveawayWinnerBannerFileName(lang);
  return `${getGiveawayMediaPublicBaseUrl()}/giveaway-media/${file}`;
}
