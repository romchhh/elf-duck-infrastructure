import assert from "node:assert/strict";
import { findAssortmentBlockForModel } from "./assortmentGrid.js";
import {
  findDayBlock,
  findReportModelRowInDayBlock,
  reportModelMatches,
} from "./dailyReportGrid.js";
import { sheetModelMatchRank } from "./shiftStockReconcile.js";
import {
  getAssortmentSheetModelName,
  getStatsSheetReportModelKey,
  getStatsSheetTierQty,
  isStatsSheetDisposable,
  isStatsSheetLiquid,
} from "../server/helpers/chunk09.js";

const liquid = {
  productKey: "merry-mi",
  categoryKey: "liquids",
  productTitle1: "LIQUID MERRY MI",
  productTitle2: "30 ML / 30 MG",
  flavors: [{ flavorKey: "mixed-berries", qty: 2, label: "Mixed Berries" }],
};

const blade = {
  productKey: "merry-mi-blade-30k",
  categoryKey: "disposables",
  productTitle1: "MERRY MI",
  productTitle2: "BLADE 30K",
  flavors: [{ flavorKey: "mixed-berries", qty: 1, label: "Mixed Berries" }],
};

const liquidKey = getStatsSheetReportModelKey(liquid);
const bladeKey = getStatsSheetReportModelKey(blade);
assert.equal(liquidKey, "MERRY MI 3%");
assert.equal(bladeKey, "MERRY MI 30K");
assert.notEqual(liquidKey, bladeKey);
assert.equal(reportModelMatches(liquidKey, bladeKey), false);
assert.equal(reportModelMatches("MERRY MI 3%", "MERRY MI BLADE 30K"), false);

const reportRows = [
  ["14.11"],
  ["MODEL", "", "", "", "1шт.", "2шт.", "3-4", "5+"],
  ["MERRY MI 3%", "0", "0", "0", "0", "0", "0", "0"],
  ["MERRY MI 30K", "0", "0", "0", "0", "0", "0", "0"],
  ["КАССА", "0", "0", "0", "0", "0", "0", "0"],
];
const day = findDayBlock(reportRows, "14.11");
const liquidRow = findReportModelRowInDayBlock(reportRows, day, liquidKey);
const bladeRow = findReportModelRowInDayBlock(reportRows, day, bladeKey);
assert.equal(liquidRow, 2);
assert.equal(bladeRow, 3);
assert.notEqual(liquidRow, bladeRow);

assert.equal(isStatsSheetLiquid(liquid), true);
assert.equal(isStatsSheetDisposable(liquid), false);
assert.equal(isStatsSheetLiquid(blade), false);
assert.equal(isStatsSheetDisposable(blade), true);

const mixedOrder = { items: [liquid, blade] };
assert.equal(getStatsSheetTierQty(mixedOrder, liquid), 2);
assert.equal(getStatsSheetTierQty(mixedOrder, blade), 1);

assert.equal(getAssortmentSheetModelName(liquid), "LIQ MERRY MI 3%");
assert.equal(getAssortmentSheetModelName(blade), "MERRY MI 30K");

const assortment = [
  ["MERRY MI 3%", "КОЛ-ВО", "MERRY MI 30K", "КОЛ-ВО"],
  ["Miami Mint", "4", "Prime Strawberry", "2"],
  ["Mixed Berries", "3", "Mixed Berries", "9"],
];
const liquidBlock = findAssortmentBlockForModel(
  assortment,
  getAssortmentSheetModelName(liquid),
  liquid.productKey
);
const bladeBlock = findAssortmentBlockForModel(
  assortment,
  getAssortmentSheetModelName(blade),
  blade.productKey
);
assert.equal(liquidBlock.header, "MERRY MI 3%");
assert.equal(liquidBlock.flavorCol, 0);
assert.equal(bladeBlock.header, "MERRY MI 30K");
assert.equal(bladeBlock.flavorCol, 2);

const onlyDevice = [["MERRY MI 30K", "КОЛ-ВО"], ["Prime Strawberry", "2"]];
assert.equal(
  findAssortmentBlockForModel(
    onlyDevice,
    "LIQ MERRY MI 3%",
    "merry-mi"
  ),
  null
);
const onlyLiquid = [["MERRY MI 3%", "КОЛ-ВО"], ["Miami Mint", "4"]];
assert.equal(
  findAssortmentBlockForModel(onlyLiquid, "MERRY MI 30K", "merry-mi-blade-30k"),
  null
);

assert.equal(sheetModelMatchRank("MERRY MI 3%", "MERRY MI 3%"), 2);
assert.equal(sheetModelMatchRank("MERRY MI 30K", "MERRY MI 30K"), 2);
assert.equal(sheetModelMatchRank("MERRY MI 3%", "MERRY MI 30K"), 1);
assert.ok(
  sheetModelMatchRank("MERRY MI 3%", "MERRY MI 3%") >
    sheetModelMatchRank("MERRY MI 3%", "MERRY MI 30K")
);

console.log("merry mi split tests ok");