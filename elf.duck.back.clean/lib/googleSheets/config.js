import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getGoogleSheetsConfig } from "../config/rootConfig.js";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const monorepoRoot = path.resolve(backendRoot, "..");

export const ASSORTMENT_SHEET_TITLE = "АССОРТИМЕНТ";
export const SYNC_ERRORS_SHEET_TITLE = "SYNC_ERRORS";
export const STATS_LOG_SHEET_TITLE = "STATS_LOG";

/** Width of one day mini-table in monthly report tabs */
export const REPORT_DAY_BLOCK_WIDTH = 11;

export const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  monorepoRoot,
  "telebots-e-commerce-bc2114cbc876.json"
);

/** Spreadsheet id per pickup / delivery point key */
/** Бойові таблиці (жовтень 2026). InPost / wola-inpost — та сама, що wola. */
export const SPREADSHEET_ID_BY_POINT_KEY = {
  praga: "1iNQFLX0I3VKFcBW2SZwtLz2YkPMVNtrCMoTSq6oStSQ",
  "r-dmie-cie": "1_NriybCDyUR2Aj-VeNj739pTZgK097cmLN_IuYfdPtY",
  "mokot-w": "1iidmQHEUX20sfOxrDzFJfRevhNQYosWyK3J__GlKpKk",
  wola: "1-LYkb8zbdJcIblnZskVndyhc2PdgtG_JxHcoy2kJj_w",
  "delivery-2": "1-LYkb8zbdJcIblnZskVndyhc2PdgtG_JxHcoy2kJj_w",
  delivery: "1LM_5g43L8unMbW-oN5DFmUf8FvgwHuCzf2m5nxWGeQ0",
  "wola-inpost": "1-LYkb8zbdJcIblnZskVndyhc2PdgtG_JxHcoy2kJj_w",
};

export function isGoogleSheetsEnabled() {
  const cfg = getGoogleSheetsConfig();
  if (cfg.enabled === false) return false;
  const flag = String(cfg.enabled ?? true)
    .trim()
    .toLowerCase();
  return !["0", "false", "no", "off"].includes(flag);
}

export function resolveSpreadsheetIdForPointKey(pointKey) {
  const key = String(pointKey || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  const overrides = getGoogleSheetsConfig().spreadsheetOverrides || {};
  const fromConfig = String(overrides[key] || "").trim();
  if (fromConfig) return fromConfig;

  return SPREADSHEET_ID_BY_POINT_KEY[key] || "";
}

export function resolveServiceAccountPath() {
  const fromEnv = String(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      ""
  ).trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const rel = String(
    getGoogleSheetsConfig().serviceAccountJsonPath || ""
  ).trim();
  const fileName = rel
    ? path.basename(rel)
    : path.basename(DEFAULT_SERVICE_ACCOUNT_PATH);

  const candidates = [
    rel && path.isAbsolute(rel) ? rel : "",
    rel ? path.join(backendRoot, rel) : "",
    path.join(backendRoot, fileName),
    rel ? path.join(monorepoRoot, rel) : "",
    path.join(monorepoRoot, fileName),
    DEFAULT_SERVICE_ACCOUNT_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1] || DEFAULT_SERVICE_ACCOUNT_PATH;
}
