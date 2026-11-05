import assert from "node:assert/strict";
import {
  findDayBlock,
  findReportModelRowInDayBlock,
  reportModelMatches,
} from "./dailyReportGrid.js";
import { getStatsSheetReportModelKey } from "../server/helpers/chunk09.js";
import { sameSheetModel } from "./shiftStockReconcile.js";
import { normalizeSheetModelName } from "./normalize.js";

const rows = [
  ["04.11"],
  ["MODEL", "", "", "", "1шт.", "2шт.", "3-4", "5+"],
  ["YAMI 5%", "0", "0", "0", "0", "0", "0", "0"],
  ["YAMI 7%", "0", "0", "0", "0", "0", "0", "0"],
  ["MERRY MI 30K", "0", "0", "0", "0", "0", "0", "0"],
  ["ETHEREUM", "0", "0", "0", "0", "0", "0", "0"],
  ["SPECIAL", "0", "0", "0", "0", "0", "0", "0"],
  ["OXVA", "0", "0", "0", "0", "0", "0", "0"],
  ["VOZOL PRIME", "0", "0", "0", "0", "0", "0", "0"],
  ["КАССА", "0", "0", "0", "0", "0", "0", "0"],
];

const block = findDayBlock(rows, "04.11");
assert.ok(block, "day block");

const yamiRow = findReportModelRowInDayBlock(rows, block, "YAMI 5%");
assert.equal(yamiRow, 2);

const yami7 = findReportModelRowInDayBlock(rows, block, "YAMI 7%");
assert.equal(yami7, 3);

const yamiBare = findReportModelRowInDayBlock(rows, block, "YAMI");
assert.equal(yamiBare, 2, "bare YAMI finds first 5% row for writes");

assert.equal(reportModelMatches("YAMI 5%", "YAMI 7%"), false);
assert.equal(reportModelMatches("YAMI", "YAMI 5%"), true);
assert.equal(reportModelMatches("MERRY MI", "MERRY MI 30K"), true);

assert.equal(sameSheetModel("YAMI 5%", "YAMI 30ML"), true);
assert.equal(sameSheetModel("YAMI 7%", "LIQ YAMI"), true);
assert.equal(sameSheetModel("MERRY MI 30K", "MERRY MI"), true);
assert.equal(sameSheetModel("LIQ ETHEREUM", "ETHEREUM"), true);
assert.equal(sameSheetModel("LIQ SPECIAL", "SPECIAL"), true);
assert.equal(sameSheetModel("OXVA", "LIQ OXVA"), true);
assert.equal(normalizeSheetModelName("MERRY MI 30K"), "MERRY MI");

const yamiFromProduct = getStatsSheetReportModelKey({
  productKey: "yami-30ml",
  productTitle1: "YAMI 30ML",
});
assert.equal(yamiFromProduct, "YAMI 5%");

const merryRow = findReportModelRowInDayBlock(rows, block, "MERRY MI");
assert.equal(merryRow, 4);

console.log("reportModelMatch tests ok");
