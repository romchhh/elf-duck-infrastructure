#!/usr/bin/env node
/**
 * Обёртка: запускает elf.duck.back.clean/scripts/sync-xros-oxva-catalog.mjs
 * На VPS без Node используй Docker (см. docs/TELEBOTS_SITE.md).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backRoot = path.join(repoRoot, "elf.duck.back.clean");
const script = path.join(backRoot, "scripts", "sync-xros-oxva-catalog.mjs");

const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: backRoot,
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
