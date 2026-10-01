/**
 * Wrapper — запускай з каталогу backend (там node_modules):
 *   cd elf.duck.back.clean && node scripts/diagnose-catalog-mongo.mjs
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const back = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "elf.duck.back.clean");
const r = spawnSync(
  process.execPath,
  ["scripts/diagnose-catalog-mongo.mjs"],
  { cwd: back, stdio: "inherit", env: process.env }
);
process.exit(r.status ?? 1);
