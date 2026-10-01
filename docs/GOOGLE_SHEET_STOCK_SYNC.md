# Google Таблиця → остатки в MongoDB

Інтеграція **асортименту / залишків** з таблиці менеджерів у бекенд ELF DUCK.

## Endpoint

```http
POST https://elfduck-api.telebots.site/admin/products/manual-sheet-stock-sync
Content-Type: application/json
x-admin-token: <ADMIN_API_TOKEN>
```

Тіло (приклад):

```json
{
  "pointKey": "mokot-w",
  "modelName": "ELF BAR D3",
  "normalizedModel": "ELF BAR D3",
  "flavorLabel": "Blue Razz",
  "normalizedFlavor": "BLUE RAZZ",
  "qty": 12
}
```

- `pointKey` — ключ точки з Mongo (`PickupPoint.key`), напр. `praga`, `mokot-w`, `r-dmie-cie`.
- `modelName` / `flavorLabel` — як у таблиці; нормалізація дублює логіку бекенду (див. `adminOrdersAndProducts.js`).
- `qty` — ціле число ≥ 0.

Успіх: `{ "ok": true, ... }`. Після оновлення скидається кеш `GET /products` (mini app підхопить залишки протягом ~60 с).

## Apps Script

1. У скрипті таблиці замініть базовий URL API на prod (`elfduck-api.telebots.site`).
2. Передавайте заголовок `x-admin-token` (той самий, що для адмін-бота).
3. На кожну зміну рядка (або batch за таймером) викликайте POST з полями вище.

## Вихід у таблицю (звіти)

Денна статистика складу відправляється в Google через webhook-и `GOOGLE_STATS_WEBHOOK_URL_*` (див. `docs/TELEBOTS_SITE.md`, §6). Це **звіти**, не синхронізація залишків назад у таблицю.

## CRM

Ручне редагування без таблиці: **Продажи → Остатки** (`/sales/stock`) — той самий склад, що й PATCH адмінського API, з сесією CRM.
