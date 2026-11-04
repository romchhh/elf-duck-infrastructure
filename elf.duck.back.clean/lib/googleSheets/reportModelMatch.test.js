import assert from "node:assert/strict";
import {
  findDayBlock,
  findReportModelRowInDayBlock,
} from "./dailyReportGrid.js";
import { getStatsSheetReportModelKey } from "../server/helpers/chunk09.js";

const rows = [
  ["04.11"],
  ["MODEL", "", "", "", "1шт.", "2шт.", "3-4", "5+"],
  ["YAMI 5%", "0", "0", "0", "0", "0", "0", "0"],
  ["YAMI 7%", "0", "0", "0", "0", "0", "0", "0"],
  ["VOZOL PRIME", "0", "0", "0", "0", "0", "0", "0"],
  ["КАССА", "0", "0", "0", "0", "0", "0", "0"],
];

const block = findDayBlock(rows, "04.11");
assert.ok(block, "day block");

const yamiRow = findReportModelRowInDayBlock(rows, block, "YAMI 5%");
assert.equal(yamiRow, 2);

const yamiFromProduct = getStatsSheetReportModelKey({
  productKey: "yami-30ml",
  productTitle1: "YAMI 30ML",
});
assert.equal(yamiFromProduct, "YAMI 5%");

console.log("reportModelMatch tests ok");
