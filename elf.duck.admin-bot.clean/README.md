# Admin Telegram bot

## Структура

| Файл | Роль |
|------|------|
| `index.js` | env + `launchAdminBot()` (~15 рядків) |
| `src/launchAdminBot.js` | підключення handler-модулів, launch |
| `src/bot/single.js` | один екземпляр Telegraf |
| `src/config.js`, `api.js`, `auth.js`, `state.js` | спільна інфраструктура |
| `src/handlers/*.js` | меню, wizard-и, actions (див. таблицю нижче) |

### Handlers (за порядком завантаження)

1. `menu.js` — клавіатура, reply → callback  
2. `wizardState.js` — promo / broadcast / courier wizard helpers  
3. `broadcastTemplates.js` — шаблони розсилки з API  
4. `cashback.js` — начисление кэшбека  
5. `categoryProductDefs.js` — константи категорій і товарів  
6. `flavorFlow.js` / `flavorActions.js` — вкусы и наличие  
7. `productFlow.js` / `productActions.js` — конструктор товара  
8. `pickupFlow.js` / `pickupCrud.js` — точки самовывоза  
9. `commands.js` — /start, /id, export  
10. `categoryEdit.js` / `categoryWizard.js`  
11. `promoAndBroadcast.js` — промокоды, рассылка, общий `text`  
12. `mediaHandlers.js` — photo для courier message  

Запуск: `npm start` (потрібні `ADMIN_BOT_TOKEN`, `API_URL`, `ADMIN_API_TOKEN`).
