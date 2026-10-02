import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const credPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../telebots-e-commerce-bc2114cbc876.json"
);

const SPREADSHEETS = [
  { label: "praga", id: "1JF6bs99j2GzstlhtDL8y2-5GwPdIPbv9REPyfs5xTUk", gid: 1554750964 },
  { label: "sheet1", id: "1Ds6xx1d03tAdU8pAy4lAi0LbsyLcuUMoJaxZDn3kTL0", gid: 1438599914 },
  { label: "sheet2", id: "13YahfNpXkKKg8vN7mhius1jjr0YMRoP5-AsxB2nytKE", gid: 610356927 },
  { label: "sheet3", id: "1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8", gid: 1087382641 },
  { label: "sheet4", id: "1OsKPgUUHJHlGHoCOlfcT3z7-13j-9zCa4my9__rY6TU", gid: 1463621849 },
];

const auth = new google.auth.GoogleAuth({
  keyFile: credPath,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

for (const sp of SPREADSHEETS) {
  console.log("\n========", sp.label, sp.id, "========");
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sp.id,
      fields: "properties.title,sheets(properties(sheetId,title,index,gridProperties))",
    });
    console.log("title:", meta.data.properties?.title);
    const tabList = meta.data.sheets || [];
    for (const tab of tabList.slice(-3)) {
      const p = tab.properties;
      console.log(`  tab: ${p?.title} (sheetId=${p?.sheetId}, rows=${p?.gridProperties?.rowCount})`);
    }
    console.log(`  ... total tabs: ${tabList.length}`);
    const match = tabList.find((t) => t.properties?.sheetId === sp.gid);
    const targetTitle = match?.properties?.title || tabList[tabList.length - 1]?.properties?.title;
    if (!targetTitle) continue;
    console.log("  reading tab:", targetTitle);
    const values = await sheets.spreadsheets.values.get({
      spreadsheetId: sp.id,
      range: `'${targetTitle.replace(/'/g, "''")}'!A1:Z80`,
      majorDimension: "ROWS",
    });
    const rows = values.data.values || [];
    for (let i = 0; i < Math.min(rows.length, 45); i++) {
      const line = rows[i].map((c) => String(c || "").slice(0, 28)).join(" | ");
      if (line.trim()) console.log(`    R${i + 1}: ${line}`);
    }
  } catch (e) {
    console.error("ERR:", e.message);
  }
}
