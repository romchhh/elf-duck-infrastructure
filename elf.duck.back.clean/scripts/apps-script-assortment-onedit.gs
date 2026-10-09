/**
 * Google Таблиця → Mongo (міні-додаток).
 * Вставити в Apps Script КОЖНОЇ таблиці складу (Розширення → Apps Script).
 *
 * Script properties (Project settings → Script properties):
 *   API_URL          https://elfduck-api.telebots.site
 *   ADMIN_API_TOKEN  той самий, що ADMIN_API_TOKEN на VPS
 *   POINT_KEY        praga | wola | delivery | mokot-w | r-dmie-cie
 *
 * Тригер: onEdit → функція onAssortmentEdit
 * Лист: АССОРТИМЕНТ
 */
var ASSORTMENT_SHEET_NAME = "АССОРТИМЕНТ";

function onAssortmentEdit(e) {
  try {
    if (!e || !e.source) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== ASSORTMENT_SHEET_NAME) return;

    var props = PropertiesService.getScriptProperties();
    var apiUrl = String(props.getProperty("API_URL") || "").replace(/\/$/, "");
    var token = String(props.getProperty("ADMIN_API_TOKEN") || "");
    var pointKey = String(props.getProperty("POINT_KEY") || "").trim();

    if (!apiUrl || !token || !pointKey) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Налаштуйте API_URL, ADMIN_API_TOKEN, POINT_KEY у Script properties",
        "Синхронизация",
        8
      );
      return;
    }

    var payload = {
      pointKey: pointKey,
      spreadsheetId: e.source.getId(),
      source: "apps-script-onedit",
    };

    var res = UrlFetchApp.fetch(apiUrl + "/admin/products/manual-sheet-stock-sync", {
      method: "post",
      contentType: "application/json",
      headers: { "x-admin-token": token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    var code = res.getResponseCode();
    var body = {};
    try {
      body = JSON.parse(res.getContentText() || "{}");
    } catch (err) {}

    if (code >= 200 && code < 300 && body.ok) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        body.message || "БД оновлено",
        "Синхронизация",
        4
      );
      return;
    }

    var msg =
      body.message ||
      body.error ||
      "HTTP " + code + " — не вдалося оновити БД";
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, "Ошибка синхронизации", 10);
  } catch (err) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      String(err && err.message ? err.message : err),
      "Ошибка синхронизации",
      10
    );
  }
}
