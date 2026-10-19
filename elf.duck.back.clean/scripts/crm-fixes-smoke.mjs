/**
 * Offline smoke tests for CRM fix helpers (no DB / network).
 * Run: node scripts/crm-fixes-smoke.mjs
 */
import assert from "node:assert/strict";
import { getCustomerStatus } from "../lib/crm/analytics/customers.js";
import {
  usersExportRowsToTeggerCsv,
} from "../lib/usersExport.js";

function testCustomerStatusAllPeriod() {
  const now = new Date("2026-10-19T12:00:00.000Z");
  const range = {
    key: "all",
    from: new Date("2000-01-01T00:00:00.000Z"),
    to: now,
  };

  assert.equal(
    getCustomerStatus({
      firstSaleAt: new Date("2026-10-15T12:00:00.000Z"),
      lastSaleAt: new Date("2026-10-15T12:00:00.000Z"),
      range,
    }),
    "new",
    "first purchase within 14d of all-period end => new"
  );

  assert.equal(
    getCustomerStatus({
      firstSaleAt: new Date("2025-01-01T12:00:00.000Z"),
      lastSaleAt: new Date("2026-10-16T12:00:00.000Z"),
      range,
    }),
    "active",
    "recent repurchase, old first sale => active"
  );

  assert.equal(
    getCustomerStatus({
      firstSaleAt: new Date("2025-01-01T12:00:00.000Z"),
      lastSaleAt: new Date("2026-08-01T12:00:00.000Z"),
      range,
    }),
    "sleeping",
    "old last sale => sleeping"
  );

  // Must NOT mark everyone as new just because firstSale >= 2000-01-01
  assert.equal(
    getCustomerStatus({
      firstSaleAt: new Date("2024-06-01T12:00:00.000Z"),
      lastSaleAt: new Date("2024-06-01T12:00:00.000Z"),
      range,
    }),
    "sleeping",
    "old customer on period=all is not new"
  );
}

function testTeggerCsv() {
  const csv = usersExportRowsToTeggerCsv([
    { username: "@Alice_Shop" },
    { username: "alice_shop" },
    { username: "bad" },
    { username: "" },
    { username: "Valid_User_Name" },
    { username: "with space" },
  ]);

  assert.ok(csv.startsWith("\uFEFF"), "BOM for Excel");
  assert.ok(csv.includes("username\n"), "header");
  assert.ok(csv.includes("alice_shop\n"), "normalized username");
  assert.ok(csv.includes("valid_user_name\n"), "valid long username");
  assert.equal(
    (csv.match(/\nalice_shop\n/g) || []).length,
    1,
    "dedupe usernames"
  );
  assert.ok(!csv.includes("bad\n"), "reject short usernames");
  assert.ok(!csv.includes("with space"), "reject invalid usernames");
}

function testCourierLocationRule() {
  // Mirrors routes/crm/orders.js location mapping
  function resolveLocation(order, pickupById = new Map()) {
    let location = "—";
    if (order?.deliveryType === "pickup") {
      location =
        pickupById.get(String(order?.pickupPointId || "")) || "Самовывоз";
    } else if (order?.deliveryMethod === "courier") {
      location = "Доставка — Варшава";
    } else if (order?.deliveryMethod === "inpost") {
      location = "InPost / Польша";
    }
    return location;
  }

  assert.equal(
    resolveLocation({
      deliveryType: "delivery",
      deliveryMethod: "courier",
      courierDistrict: "Ursynów",
    }),
    "Доставка — Варшава",
    "courier district must not appear as point"
  );

  assert.equal(
    resolveLocation({
      deliveryType: "pickup",
      pickupPointId: "p1",
    }, new Map([["p1", "Mokotów"]])),
    "Mokotów"
  );
}

try {
  testCustomerStatusAllPeriod();
  testTeggerCsv();
  testCourierLocationRule();
  console.log("crm-fixes-smoke: OK");
} catch (error) {
  console.error("crm-fixes-smoke: FAIL");
  console.error(error);
  process.exit(1);
}
