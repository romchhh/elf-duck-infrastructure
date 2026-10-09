# Google Таблиці ↔ ELF DUCK API

## Точки та таблиці (service account)

| `pointKey` | Таблиця |
|------------|---------|
| `praga` | `1iNQFLX0I3VKFcBW2SZwtLz2YkPMVNtrCMoTSq6oStSQ` |
| `r-dmie-cie` | `1_NriybCDyUR2Aj-VeNj739pTZgK097cmLN_IuYfdPtY` |
| `mokot-w` | `1iidmQHEUX20sfOxrDzFJfRevhNQYosWyK3J__GlKpKk` |
| `wola`, `delivery-2`, `wola-inpost` | `1-LYkb8zbdJcIblnZskVndyhc2PdgtG_JxHcoy2kJj_w` |
| `delivery` (курʼєр / DOSTAWA) | `1LM_5g43L8unMbW-oN5DFmUf8FvgwHuCzf2m5nxWGeQ0` |

Доступ редактором для email сервісного акаунта:  
`elfduck@telebots-e-commerce.iam.gserviceaccount.com`

Інший id для Praga (рідко): `GOOGLE_SHEETS_SPREADSHEET_PRAGA` у `.env` перекриває значення з таблиці вище.

## Конфіг

`elf.duck.back.clean/config/googleSheets.json`:

```json
{
  "enabled": true,
  "serviceAccountJsonPath": "telebots-e-commerce-bc2114cbc876.json",
  "spreadsheetOverrides": {},
  "stockPullCron": {
    "intervalMs": 300000,
    "staggerMs": 1500
  }
}
```

`stockPullCron.intervalMs` — інтервал fingerprint-cron (мс); `0` вимикає. `staggerMs` — пауза між читаннями різних таблиць у одному циклі.

Файл ключа лежить у корені репозиторію (не комітити; див. `.gitignore`). ID таблиць за замовчуванням у `lib/googleSheets/config.js`; перекриття — у `spreadsheetOverrides` по `pointKey`.

### Docker (VPS)

У `docker-compose.yml` для сервісу `api`:

- volume: `./telebots-e-commerce-bc2114cbc876.json` → `/app/telebots-e-commerce-bc2114cbc876.json`
- `GOOGLE_SERVICE_ACCOUNT_JSON=/app/telebots-e-commerce-bc2114cbc876.json`

Після `git pull` і `docker compose up -d api`:

```bash
docker compose exec api node scripts/verify-google-sheets-server.mjs
docker compose exec api node scripts/google-sheets-e2e-test.mjs
```

Продажі в таблиці з’являються **після підтвердження оплати менеджером** (списання складу). Помилки: `docker compose logs api | grep googleSheets`.

Тестовий ±1 продаж (без Mongo): `node scripts/google-sheets-mark-test-sale.mjs --point praga` / `--reverse`.

## Було (Apps Script) → стало (API)

| Що | Раніше | Зараз |
|----|--------|--------|
| Продаж / відміна | Часто лише вечірній webhook з агрегатами + ручні правки | **Миттєво** після списання/повернення складу (`orderSync.js`) |
| Денний звіт | `POST` на `script.google.com/...` (`GOOGLE_STATS_WEBHOOK_URL_*`) | `writeDayBlockFromAggregates` через service account |
| Асортимент −N | У payload webhook (`assortmentItems`) | При кожному продажі в `АССОРТИМЕНТ` |
| Місячний блок / ІТОГО | Скрипт у таблиці | Дельти при продажі (`applyMonthItogoDelta` + рядки моделей) |
| Таблиця → бот | `onEdit` → `manual-sheet-stock-sync` | **Без змін** (за потреби лишити легкий onEdit) |
| Новий місяць | Вручну / скрипт у таблиці | Авто останні 3 дні місяця (`monthReportScheduler.js`) |

Що API **ще не** робить: платні доставки по днях, зміна прайсу MODEL/ПРОДАЖА.

## Продаж → таблиця (автоматично)

Після кнопки **«Заказ выполнен»** (статус `completed`): **списання складу** (`commitOrderStock`) і запис у таблицю. До этого момента (оплата, InPost «отправлен» и т.д.) склад и tier-колонки **не** меняются.

Після **списання складу** (`commitOrderStock`):

1. Лист місяця `ОТЧЕТ 01.MM.YYYY` — міні-таблиця дня (`DD.MM`): лише колонки **1шт / 2шт / 3-4шт / 5шт** (+ скидки в рядку підсумків). `БЫЛО` / `СТАЛО` / `ПРОДАНО` / `КАССА` — **формули в таблиці**, API їх не перезаписує.
2. **Нижній місячний блок** (заголовок `01.MM–31.MM` на тому ж листі):
   - зліва (`31.MM`) — `БЫЛО` / `СТАЛО` лишаються формулами (API не чіпає);
   - справа — лише tier-колонки (+ `СКИДКИ` в `ИТОГО`); `ПРОДАНО` / `КАССА` / `ЗАРПЛАТА` — формули.
3. Лист `АССОРТИМЕНТ` — мінус кількість по смаку (`lib/googleSheets/normalize.js`).

Довідкові блоки **MODEL / ПРОДАЖА** (ціни) та **ПЛАТНЫЕ ДОСТАВКИ** (доставка) API не змінює.

При **поверненні складу** (`restoreCommittedOrderStock`, відміна після оплати) — зворотна операція.

Стан у Mongo: `order.googleSheetSync.appliedAt` / `reversedAt`.

## Денний звіт (крон)

`sendDailyPointStatsToGoogleSheet` викликає **Google Sheets API** (перезапис міні-таблиці дня з замовлень Mongo). Старий **Apps Script webhook** (`GOOGLE_STATS_WEBHOOK_URL_*`) **не викликається**, поки `GOOGLE_SHEETS_ENABLED=1` і не задано `GOOGLE_STATS_WEBHOOK_FALLBACK=1`. У кожній таблиці вручну вимкніть тригери Apps Script (якщо лишились), щоб не було подвійного запису.

## Таблиця → Mongo / міні-додаток

При зміні клітинки на **АССОРТИМЕНТ** Apps Script викликає API; сервер **тягне весь блок складу** з Google (той самий метч, що при замовленнях і `pull-stock-from-sheets.mjs`), оновлює Mongo і скидає кеш `/products`.

```http
POST /admin/products/manual-sheet-stock-sync
x-admin-token: <ADMIN_API_TOKEN>
Content-Type: application/json

{ "pointKey": "wola", "spreadsheetId": "<id таблиці>" }
```

Альтернативний шлях: `POST /admin/products/sheet-stock-pull` (те саме).

**Apps Script:** файл `elf.duck.back.clean/scripts/apps-script-assortment-onedit.gs` — у кожній таблиці в Script properties: `API_URL`, `ADMIN_API_TOKEN`, `POINT_KEY` (praga, wola, delivery, mokot-w, r-dmie-cie). Тригер **onEdit** → `onAssortmentEdit`.

**Резерв без onEdit:** кожні ~5 хв cron (`stockPullCron` у `googleSheets.json`) — **одне читання** листа АССОРТИМЕНТ на таблицю, порівняння SHA-256 fingerprint у Mongo (`SheetAssortmentFingerprint`); bulkWrite у продукти лише якщо залишки змінились. Також щодня о 08:00 повний pull + після кожного замовлення.

Помилка в таблиці «Не вдалося оновити БД» — перевірте `ADMIN_API_TOKEN` у Script properties і в `.env` на VPS, `docker compose logs api | grep stockPull`, доступ service account до таблиці.

## Перевірка локально

### Автоматичні листи на наступний місяць

Під час щоденного `processDailyPointStats` (останні **3 календарні дні** місяця, час Europe/Warsaw) один раз створюються листи `ОТЧЕТ 01.{наступний місяць}.{рік}` у всіх п’яти таблицях: копія поточного місяця, дати зсунуті, денна та місячна статистика в нулях. Дедуплікація в Mongo: ключ `google_sheet_next_month:YYYY-MM`.

Потрібно `"enabled": true` у `config/googleSheets.json` і JSON service account на диску.

Ручний запуск (те саме, що cron):

```bash
cd elf.duck.back.clean
node scripts/ensure-next-month-report-tabs.mjs
node scripts/ensure-next-month-report-tabs.mjs --force-window   # поза вікном 29–31
```

Одноразово листопад 2026 з жовтня:

```bash
cd elf.duck.back.clean
node scripts/create-november-2026-tabs.mjs
node scripts/create-november-2026-tabs.mjs --replace   # перестворити
```

```bash
cd elf.duck.back.clean
node scripts/google-sheets-mark-test-sale.mjs --point mokot-w
node scripts/google-sheets-mark-test-sale.mjs --point mokot-w --reverse
node scripts/test-google-sheets-sync.mjs
node scripts/inspect-google-sheets.mjs
```

Продаж пише **лише** `1шт` / `2шт` / `3-4шт` / `5шт` + `СКИДКИ` (+ Assortment). Колонки з формулами (`БЫЛО` / `СТАЛО` / `ПРОДАНО` / `КАССА` / `ЗАРПЛАТА`) не перезаписуються.

## CRM

Ручні залишки: **Продажи → Остатки** — той самий склад, що й PATCH адмінського API.
