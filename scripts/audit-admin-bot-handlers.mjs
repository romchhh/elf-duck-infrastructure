/**
 * Static check: identifier calls in handler files should be imported or defined locally.
 * Run: node scripts/audit-admin-bot-handlers.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const handlersDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../elf.duck.admin-bot.clean/src/handlers"
);

const GLOBALS = new Set([
  "console",
  "String",
  "Number",
  "Array",
  "Object",
  "Date",
  "Math",
  "JSON",
  "fetch",
  "parseInt",
  "parseFloat",
  "Boolean",
  "Error",
  "Promise",
  "Set",
  "Map",
  "RegExp",
  "Intl",
  "Buffer",
  "process",
  "undefined",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",
  "bot",
  "ctx",
  "next",
  "Markup",
  "Input",
  "e",
  "error",
  "st",
  "d",
  "id",
  "data",
  "text",
  "step",
  "field",
  "p",
  "points",
  "point",
  "payload",
  "patch",
  "updated",
  "fresh",
  "r",
  "res",
  "req",
  "api",
]);

function parseImports(content) {
  const names = new Set();
  const re =
    /import\s+(?:\{([^}]+)\}|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = re.exec(content))) {
    if (m[1]) {
      m[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
        .filter(Boolean)
        .forEach((n) => names.add(n));
    }
    if (m[2]) names.add(m[2]);
    if (m[3]) {
      m[3]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
        .filter(Boolean)
        .forEach((n) => names.add(n));
    }
  }
  return names;
}

function parseDefinitions(content) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /(?:^|\n)\s*(?:async\s+)?function\s+(\w+)/g,
    /(?:^|\n)\s*const\s+(\w+)\s*=/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content))) names.add(m[1]);
  }
  return names;
}

function parseCalls(content) {
  const calls = new Set();
  const re = /(?<![.\w])([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const name = m[1];
    if (name === "if" || name === "for" || name === "while" || name === "switch" || name === "catch") continue;
    calls.add(name);
  }
  return calls;
}

const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith(".js"));
let issues = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(handlersDir, file), "utf8");
  const imported = parseImports(content);
  const defined = parseDefinitions(content);
  const scope = new Set([...imported, ...defined, ...GLOBALS]);
  const calls = parseCalls(content);

  const missing = [...calls].filter((c) => !scope.has(c)).sort();
  if (missing.length) {
    console.log(`\n${file}:`);
    for (const name of missing) {
      console.log(`  ? ${name}()`);
      issues++;
    }
  }
}

if (issues) {
  console.error(`\n⚠️  ${issues} possible missing bindings (heuristic — verify manually)`);
  process.exit(1);
}

console.log("✅ Admin bot handler import audit: no obvious missing symbols");
