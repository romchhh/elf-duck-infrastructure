# Google Таблиці ↔ ELF DUCK API

## Точки та таблиці (service account)

| `pointKey` | Таблиця |
|------------|---------|
| `praga` | `1JF6bs99j2GzstlhtDL8y2-5GwPdIPbv9REPyfs5xTUk` |
| `r-dmie-cie` | `1Ds6xx1d03tAdU8pAy4lAi0LbsyLcuUMoJaxZDn3kTL0` |
| `mokot-w` | `13YahfNpXkKKg8vN7mhius1jjr0YMRoP5-AsxB2nytKE` |
| `wola`, `delivery-2`, `wola-inpost` | `1kLnMHbHwS5q-V6z4xfy6OSAEpe9IwMy3OhzTYMWydZ8` |
| `delivery` (курʼєр / DOSTAWA) | `1OsKPgUUHJHlGHoCOlfcT3z7-13j-9zCa4my9__rY6TU` |

Доступ редактором для email сервісного акаунта:  
`elfduck@telebots-e-commerce.iam.gserviceaccount.com`

Інший id для Praga (рідко): `GOOGLE_SHEETS_SPREADSHEET_PRAGA` у `.env` перекриває значення з таблиці вище.

## Конфіг

`elf.duck.back.clean/config/googleSheets.json`:

```json
{
  "enabled": true,
  "serviceAccountJsonPath": "telebots-e-commerce-bc2114cbc876.json",
  "spreadsheetOverrides": {}
}
```

Файл ключа лежить у корені репозиторію (не комітити; див. `.gitignore`). ID таблиць за замовчуванням у `lib/googleSheets/config.js`; перекриття — у `spreadsheetOverrides` по `pointKey`.

## Було (Apps Script) → стало (API)

| Що | Раніше | Зараз |
|----|--------|--------|
| Продаж / відміна | Часто лише вечірній webhook з агрегатами + ручні правки | **Миттєво** після списання/повернення складу (`orderSync.js`) |
| Денний звіт | `POST` на `script.google.com/...` (`GOOGLE_STATS_WEBHOOK_URL_*`) | `writeDayBlockFromAggregates` через service account |
| Асортимент −N | У payload webhook (`assortmentItems`) | При кожному продажі в `АССОРТИМЕНТ` |
| Місячний блок / ІТОГО | Скрипт у таблиці | Дельти при продажі (`applyMonthItogoDelta` + рядки моделей) |
| Таблиця → бот | `onEdit` → `manual-sheet-stock-sync` | **Без змін** (за потреби лишити легкий onEdit) |
| Новий місяць | Вручну / скрипт у таблиці | Авто останні 3 дні місяця (`monthReportScheduler.js`) |

Що API **ще не** робить: платні доставки по днях, зміна прайсу MODEL/ПРОДАЖА, повний «pull» асортименту в Mongo по крону (лише push при продажі + admin sync).

## Продаж → таблиця (автоматично)

Після **списання складу** (`commitOrderStock`):

1. Лист місяця `ОТЧЕТ 01.MM.YYYY` — міні-таблиця дня (`DD.MM`): `ПРОДАНО`, `СТАЛО`, tier-колонки.
2. **Нижній місячний блок** (заголовок `01.MM–31.MM` на тому ж листі):
   - зліва (`31.MM`) — `БЫЛО` / `СТАЛО` по моделях;
   - справа — місячні `ПРОДАНО` + tier-и;
   - `ИТОГО` — `КАССА`, `ЗАРПЛАТА` (16% від каси), суми tier-ів, `СКИДКИ`.
3. Лист `АССОРТИМЕНТ` — мінус кількість по смаку (`lib/googleSheets/normalize.js`).

Довідкові блоки **MODEL / ПРОДАЖА** (ціни) та **ПЛАТНЫЕ ДОСТАВКИ** (доставка) API не змінює.

При **поверненні складу** (`restoreCommittedOrderStock`, відміна після оплати) — зворотна операція.

Стан у Mongo: `order.googleSheetSync.appliedAt` / `reversedAt`.

## Денний звіт (крон)

`sendDailyPointStatsToGoogleSheet` викликає **Google Sheets API** (перезапис міні-таблиці дня з замовлень Mongo). Старий **Apps Script webhook** (`GOOGLE_STATS_WEBHOOK_URL_*`) **не викликається**, поки `GOOGLE_SHEETS_ENABLED=1` і не задано `GOOGLE_STATS_WEBHOOK_FALLBACK=1`. У кожній таблиці вручну вимкніть тригери Apps Script (якщо лишились), щоб не було подвійного запису.

## Таблиця → залишки в боті

```http
POST /admin/products/manual-sheet-stock-sync
x-admin-token: <ADMIN_API_TOKEN>
```

Тіло як раніше (`pointKey`, `modelName`, `flavorLabel`, `qty`, …).  
Можна лишити легкий Apps Script `onEdit` → цей endpoint, або окремо зробити pull з API (асортимент читається тим самим service account).

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
node scripts/test-google-sheets-sync.mjs
node scripts/test-google-sheets-sync.mjs --model "ELFLIQ 30 ML" --flavor "Blue Razz Ice"
node scripts/inspect-google-sheets.mjs
```

## CRM

Ручні залишки: **Продажи → Остатки** — той самий склад, що й PATCH адмінського API.
