import path from "path";
import { fileURLToPath } from "url";
import { getGoogleSheetsConfig } from "../config/rootConfig.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const ASSORTMENT_SHEET_TITLE = "АССОРТИМЕНТ";
export const SYNC_ERRORS_SHEET_TITLE = "SYNC_ERRORS";
export const STATS_LOG_SHEET_TITLE = "STATS_LOG";

/** Width of one day mini-table in monthly report tabs */
export const REPORT_DAY_BLOCK_WIDTH = 11;

export const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  rootDir,
  "telebots-e-commerce-bc2114cbc876.json"
);

/** Spreadsheet id per pickup / delivery point key */
export const SPREADSHEET_ID_BY_POINT_KEY = {
  praga: "1JF6bs99j2GzstlhtDL8y2-5GwPdIPbv9REPyfs5xTUk",
  "r-dmie-cie": "1Ds6xx1d03tAdU8pAy4lAi0LbsyLcuUMoJaxZDn3kTL0",
  "mokot-w": "13YahfNpXkKKg8vN7mhius1jjr0YMRoP5-AsxB2nytKE",
  wola: "1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8",
  "delivery-2": "1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8",
  delivery: "1OsKPgUUHJHlGHoCOlfcT3z7-13j-9zCa4my9__rY6TU",
  "wola-inpost": "1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8",
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
  const rel = String(
    getGoogleSheetsConfig().serviceAccountJsonPath || ""
  ).trim();

  if (rel) {
    return path.isAbsolute(rel) ? rel : path.resolve(rootDir, rel);
  }

  return DEFAULT_SERVICE_ACCOUNT_PATH;
}
