# CRM backend modules

| Модуль | Призначення |
|--------|-------------|
| `constants.js` | TZ, cookie, push limits |
| `session.js` | CRM cookie/session, `requireCrmPushAdmin` |
| `datetime.js` | Warsaw timezone, `getPeriodRange` |
| `sales.js` | завершені продажі, скасування |
| `analytics/` | dashboard, продукти, точки, партнери, клієнти, push-аналітика |
| `analytics.js` | re-export `./analytics/index.js` |
| `orderFormatters.js` | рядки для таблиці замовлень |
| `ordersList.js` | пагінація замовлень у MongoDB |
| `orderDate.js` | `crmOrderDate` aggregation |
| `pushText.js` | нормалізація тексту push |
| `pushAudience.js` | прев’ю аудиторії (cursor + cap) |
| `cashbackExpiring.js` | «скоро сгорит» для push/CRM |

## HTTP routes

`routes/crm.js` → `routes/crm/index.js` + модулі:

- `auth.js`, `middleware.js`
- `orders.js`, `debug.js`
- `pushMedia.js`, `pushMeta.js`, `pushTemplates.js`, `pushSend.js`, `pushCampaigns.js`
- `cashback.js`, `locations.js`, `products.js`, `partners.js`, `leads.js`, `customers.js`, `dashboard.js`
- `deps.js` — спільні імпорти для роутів

Нові ендпоінти: логіка в `lib/crm/*`, HTTP у відповідному файлі в `routes/crm/`.
