# Великі файли (орієнтир ≤ ~600–900 рядків на модуль)

## Розбито

| Було | Стало |
|------|--------|
| `routes/crm.js` (~6600) | `routes/crm/*.js` + `deps.js` |
| `lib/crm/analytics.js` (~2300) | `lib/crm/analytics/*.js` |
| `handlers/promoAndBroadcast.js` (~2000) | `promoCodes.js`, `broadcastHandlers.js` (barrel) |
| **`server.js` (~19800)** | **`server.js` (~320)** + `lib/server/helpers/chunk*.js` (14) + `routes/api/*.js` + `lib/telegram/shopBots.js` |
| `broadcastHandlers.js` (~1900) | `broadcastTemplateHandlers.js`, `broadcastWizardHandlers.js` |
| Push UI helpers | `elfduck.crm/src/pages/push/pushPeriod.js`, `pushFormUi.jsx` |

## Ще великі (наступний етап)

| Файл | ~рядків | Пропозиція |
|------|---------|------------|
| `lib/telegram/shopBots.js` | ~3500 | `shopBotCallbacks.js`, `shopBotCommands.js`, … |
| `lib/server/helpers/chunk07–08.js` | до 32k | дрібніші доменні модулі (orders, stats, telegram) |
| `routes/api/orders.js`, `cart.js` | 1–2k | handlers у `lib/shop/` |
| `elf.duck.clean/.../CartPage.jsx` | 6200 | кроки checkout + hooks |
| `elf.duck.clean/.../MainPage.jsx` | 4600 | каталог, фільтри, hooks |
| `elfduck.crm/.../Push.jsx` | ~2600 | `PushCampaignsTable`, `PushAudiencePanel`, … |
| `handlers/wizardState.js` | ~900 | `wizardPromo.js`, `wizardBroadcast.js`, `wizardCourier.js` |

Після змін: `docker compose build api crm admin-bot shop`.
