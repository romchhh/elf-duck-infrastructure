/**
 * Додає на лист АССОРТИМЕНТ усіх точок правило: число < 0 → червона клітинка (ідемпотентно).
 *
 * docker compose exec api node scripts/install-assortment-negative-highlight.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, "..", ".env") });

import { ensureNegativeStockHighlight } from "../lib/googleSheets/assortmentGrid.js";
import {
  resolveSpreadsheetIdForPointKey,
  SPREADSHEET_ID_BY_POINT_KEY,
} from "../lib/googleSheets/config.js";
import { ASSORTMENT_RETRY_POINT_KEYS } from "../lib/googleSheets/statsScriptPoints.js";

let failed = 0;
for (const key of ASSORTMENT_RETRY_POINT_KEYS.filter((k) => SPREADSHEET_ID_BY_POINT_KEY[k])) {
  const id = resolveSpreadsheetIdForPointKey(key);
  try {
    const r = await ensureNegativeStockHighlight(id);
    console.log(key, r);
    if (!r.ok) failed += 1;
  } catch (e) {
    failed += 1;
    console.error(key, "FAIL", e?.message || e);
  }
}
process.exit(failed ? 1 : 0);
