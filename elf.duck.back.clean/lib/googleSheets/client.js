import { google } from "googleapis";
import {
  isGoogleSheetsEnabled,
  resolveServiceAccountPath,
} from "./config.js";

let sheetsClient = null;

export function getSheetsApi() {
  if (!isGoogleSheetsEnabled()) {
    return null;
  }

  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: resolveServiceAccountPath(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheetsClient = google.sheets({ version: "v4", auth });
  }

  return sheetsClient;
}

export function escapeSheetTitle(title) {
  return `'${String(title || "").replace(/'/g, "''")}'`;
}

export async function readSheetValues(spreadsheetId, rangeA1) {
  const sheets = getSheetsApi();
  if (!sheets) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeA1,
    majorDimension: "ROWS",
  });

  return res.data.values || [];
}

export async function batchUpdateValues(spreadsheetId, data) {
  const sheets = getSheetsApi();
  if (!sheets) return null;

  return sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

export async function getSpreadsheetMeta(spreadsheetId, fields) {
  const sheets = getSheetsApi();
  if (!sheets) return null;

  const res = await sheets.spreadsheets.get({ spreadsheetId, fields });
  return res.data;
}

export async function batchUpdateSpreadsheet(spreadsheetId, requests) {
  const sheets = getSheetsApi();
  if (!sheets) return null;

  return sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

export async function appendSheetRow(spreadsheetId, sheetTitle, values) {
  const sheets = getSheetsApi();
  if (!sheets) return null;

  return sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${escapeSheetTitle(sheetTitle)}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [values],
    },
  });
}
