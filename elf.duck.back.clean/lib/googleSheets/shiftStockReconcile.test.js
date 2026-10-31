import assert from "node:assert/strict";
import {
  buildAssortmentSyncWarningLines,
  buildShiftStockReconcile,
  splitShiftStockMessages,
} from "./shiftStockReconcile.js";

function reportGrid() {
  const header = [
    "MODEL",
    "БЫЛО",
    "СТАЛО",
    "ПРОДАНО",
    "1шт.",
    "2шт.",
    "3шт-4шт.",
    "5шт +",
    "СКИДКИ",
    "БРАК",
  ];
  return [
    ["22.10"],
    header,
    ["ELFLIQ", "300", "258", "42"],
    ["HQD", "10", "0", "10"],
    ["1500", "5", "", "0"],
    ["КАССА", "0", "0", "0"],
  ];
}

function assortmentGrid(elfliqQty = ["100", "158"]) {
  return [
    ["LIQ ELFLIQ", "КОЛ-ВО", "HQD 30 ML", "КОЛ-ВО", "ELF BAR 1500", "КОЛ-ВО"],
    ["Apple", elfliqQty[0], "Mint", "0", "Cherry", "5"],
    ["Banana", elfliqQty[1], "", "", "Grape", "1"],
  ];
}

const matched = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["ELFLIQ", "300", "258", "42"],
    ["HQD", "10", "0", "10"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО", "HQD 30 ML", "КОЛ-ВО"],
    ["Apple", "100", "Mint", "0"],
    ["Banana", "158", "", ""],
  ],
  dayKey: "2026-10-22",
});

assert.equal(matched.mismatches.length, 0, "258 = 100+158 and 0 = 0");
assert.equal(matched.errors.length, 0);
assert.equal(matched.message, "");

const more = buildShiftStockReconcile({
  reportRows: reportGrid(),
  assortmentRows: assortmentGrid(["100", "160"]),
  dayKey: "2026-10-22",
});

assert.equal(more.mismatches.length, 1);
assert.match(more.message, /⚠️ Расхождения остатков за 22\.10/);
assert.match(more.message, /▫️ELFLIQ:/);
assert.match(more.message, /• Отчёт — 258 шт\./);
assert.match(more.message, /• Ассортимент — 260 шт\./);
assert.match(
  more.message,
  /‼️ Результат: в ассортименте на 2 шт\. больше\. Проверить!!!/
);
assert.match(
  more.message,
  /▫️1500: не удалось прочитать количество в колонке «Стало»\./
);
assert.equal(
  more.errors.some((row) => row.model === "1500"),
  true
);
assert.equal(
  more.mismatches.some((row) => row.name === "1500"),
  false,
  "blank Стало is not zero"
);

const less = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "БЫЛО", "СТАЛО"],
    ["ELFLIQ", "300", "258"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО"],
    ["Apple", "200"],
    ["Banana", "50"],
  ],
  dayKey: "2026-10-22",
});
assert.match(
  less.message,
  /в ассортименте на 8 шт\. меньше\. Проверить!!!/
);

const staleStalo = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "50", "50", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "50"],
  ],
  dayKey: "2026-10-29",
});

assert.equal(
  staleStalo.mismatches.length,
  1,
  "stale Стало with Продано>0 should use Было−Продано"
);
assert.equal(staleStalo.mismatches[0].name, "VOZOL PRIME");
assert.equal(staleStalo.mismatches[0].reportQty, 49);
assert.equal(staleStalo.mismatches[0].assortmentQty, 50);
assert.match(
  staleStalo.message,
  /в ассортименте на 1 шт\. больше\. Проверить!!!/
);

const updatedStaloMatches = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "50", "49", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "49"],
  ],
  dayKey: "2026-10-29",
});
assert.equal(updatedStaloMatches.mismatches.length, 0);
assert.equal(updatedStaloMatches.errors.length, 0);
assert.equal(updatedStaloMatches.message, "");

const updatedStaloAssortmentStuck = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "50", "49", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "40"],
    ["Ice", "10"],
  ],
  dayKey: "2026-10-29",
});
assert.equal(updatedStaloAssortmentStuck.mismatches.length, 1);
assert.equal(updatedStaloAssortmentStuck.mismatches[0].reportQty, 49);
assert.equal(updatedStaloAssortmentStuck.mismatches[0].assortmentQty, 50);
assert.match(
  updatedStaloAssortmentStuck.message,
  /в ассортименте на 1 шт\. больше/
);

const noSalesKeepsStalo = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "50", "50", "0"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "50"],
  ],
  dayKey: "2026-10-29",
});
assert.equal(noSalesKeepsStalo.mismatches.length, 0);
assert.equal(noSalesKeepsStalo.message, "");

const deductedAssortmentWithStaleStalo = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "50", "50", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "49"],
  ],
  dayKey: "2026-10-29",
});
assert.equal(deductedAssortmentWithStaleStalo.mismatches.length, 0);
assert.equal(deductedAssortmentWithStaleStalo.message, "");

const blankStaloUsesSold = buildShiftStockReconcile({
  reportRows: [
    ["29.10"],
    ["MODEL", "БЫЛО", "СТАЛО", "ПРОДАНО"],
    ["VOZOL PRIME", "12", "", "2"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ VOZOL PRIME", "КОЛ-ВО"],
    ["Mint", "12"],
  ],
  dayKey: "2026-10-29",
});
assert.equal(blankStaloUsesSold.mismatches[0].reportQty, 10);
assert.equal(blankStaloUsesSold.mismatches[0].assortmentQty, 12);
assert.match(blankStaloUsesSold.message, /на 2 шт\. больше/);

const syncWarnings = buildAssortmentSyncWarningLines({
  pending: [{ orderNo: "ED-AAA" }, { orderNo: "ED-BBB" }],
  failed: [{ orderNo: "ED-AAA" }],
});
assert.equal(syncWarnings.length, 2);
assert.match(syncWarnings[0], /#ED-AAA, #ED-BBB/);
assert.match(syncWarnings[1], /#ED-AAA/);
assert.equal(buildAssortmentSyncWarningLines({}).length, 0);

const missingDay = buildShiftStockReconcile({
  reportRows: [["01.10"], ["MODEL", "СТАЛО"], ["ELFLIQ", "1"]],
  assortmentRows: assortmentGrid(),
  dayKey: "2026-10-22",
});
assert.match(missingDay.message, /Отчёт за 22\.10 отсутствует\./);
assert.equal(missingDay.mismatches.length, 0);

const badFormula = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["ELFLIQ", "#VALUE!"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО"],
    ["Apple", "1"],
  ],
  dayKey: "2026-10-22",
});
assert.match(badFormula.message, /не удалось прочитать количество в колонке «Стало»/);
assert.equal(badFormula.mismatches.length, 0);

const missingModel = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["ELFLIQ", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["HQD 30 ML", "КОЛ-ВО"],
    ["Mint", "1"],
  ],
  dayKey: "2026-10-22",
});
assert.match(missingModel.message, /ELFLIQ: модель не найдена во вкладке «Ассортимент»/);
assert.match(missingModel.message, /HQD 30 ML: модель не найдена во вкладке «Отчёт»/);

const blankAssortment = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["ELFLIQ", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО"],
    ["Apple", ""],
  ],
  dayKey: "2026-10-22",
});
assert.match(
  blankAssortment.message,
  /не удалось прочитать количество «Apple» во вкладке «Ассортимент»/
);
assert.equal(blankAssortment.mismatches.length, 0);

const emptyBlock = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["MERRY MI", "0"],
    ["КАССА"],
  ],
  assortmentRows: [["MERRY MI", "КОЛ-ВО"]],
  dayKey: "2026-10-22",
});
assert.equal(emptyBlock.mismatches.length, 0);
assert.equal(emptyBlock.errors.length, 0);

const emptyVersusStock = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["MERRY MI", "5"],
    ["КАССА"],
  ],
  assortmentRows: [["MERRY MI", "КОЛ-ВО"]],
  dayKey: "2026-10-22",
});
assert.match(
  emptyVersusStock.message,
  /в ассортименте на 5 шт\. меньше\. Проверить!!!/
);

const stackedModels = buildShiftStockReconcile({
  reportRows: [
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["ELFLIQ", "3"],
    ["HQD", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО"],
    ["Apple", "1"],
    ["Banana", "2"],
    ["HQD 30 ML", "КОЛ-ВО"],
    ["Mint", "1"],
  ],
  dayKey: "2026-10-22",
});
assert.equal(stackedModels.mismatches.length, 0);
assert.equal(stackedModels.errors.length, 0);

const calendarBeforeDay = buildShiftStockReconcile({
  reportRows: [
    ["21.10", "22.10", "23.10"],
    ["", "100 zł", ""],
    ["22.10"],
    ["MODEL", "СТАЛО"],
    ["ELFLIQ", "1"],
    ["КАССА"],
  ],
  assortmentRows: [
    ["LIQ ELFLIQ", "КОЛ-ВО"],
    ["Apple", "1"],
  ],
  dayKey: "2026-10-22",
});
assert.equal(calendarBeforeDay.mismatches.length, 0);
assert.equal(calendarBeforeDay.errors.length, 0);

const longMessage = splitShiftStockMessages(
  [
    "⚠️ Расхождения остатков за 22.10",
    ...Array.from({ length: 40 }, (_, index) =>
      [
        "",
        `▫️MODEL ${index}:`,
        "• Отчёт — 100 шт.",
        "• Ассортимент — 80 шт.",
        "‼️ Результат: в ассортименте на 20 шт. меньше. Проверить!!!",
      ].join("\n")
    ),
  ].join("\n")
);
assert.ok(longMessage.length > 1);
assert.ok(longMessage.every((part) => part.length <= 4096));
assert.match(longMessage[1], /^⚠️ Продолжение сверки/);
assert.match(longMessage.join("\n"), /MODEL 39/);

console.log("shift stock reconcile tests ok");
