# ELF DUCK — локальна екосистема

Монорепо **ELF DUCK** (backend, Mini App, CRM, admin-бот). Один кореневий `.env` для всіх сервісів.

GitHub: [romchhh/elf-duck-infrastructure](https://github.com/romchhh/elf-duck-infrastructure)

| Каталог | Призначення | Деплой (типовий) |
|---------|-------------|------------------|
| `elf.duck.back.clean` | API (Express + MongoDB), основний Telegram-бот, інтеграція Google Sheets | **VPS** (Node + PM2), порт за nginx |
| `elf.duck.clean` | Telegram Mini App (клієнтський магазин) | **VPS** — `npm run build`, nginx статика |
| `elfduck.crm` | Веб-CRM (дашборд, замовлення, push) | **VPS** — `npm run build`, nginx статика |
| `elf.duck.admin-bot.clean` | Окремий Telegram-бот для адмінів (керування через API) | **VPS** (окремий процес PM2) |

Покроковий гайд для власного сервера: [`docs/DEPLOY_SELF_HOSTED.md`](docs/DEPLOY_SELF_HOSTED.md).

**Docker:** [`docs/DOCKER.md`](docs/DOCKER.md) — порти **3000–3004**.

**Prod на telebots.site:** [`docs/TELEBOTS_SITE.md`](docs/TELEBOTS_SITE.md) — DNS, nginx, BotFather, чеклист.

## Медіа та прибирання

- CRM: `elfduck.crm/public/brand/`, `public/products/` — WebP (див. `public/README.md`).
- Mini App: `elf.duck.clean/src/assets/` — переважно WebP; зайві `cashbackFx.*` (gif/mp4/webm) прибрано.
- Скрипти: `scripts/optimize-crm-images.sh`, `scripts/clean-workspace.sh`.
- `node_modules/` і `dist/` не треба тримати в архівах — `dist` збирається на сервері (`npm run build`).

## Потік даних

```text
Клієнт (Mini App) → Backend API → MongoDB
                 ↘ Telegram (група замовлень, канал статистики)
Google Таблиці (склад / звіти) ↔ Backend (webhook Apps Script)
Admin bot / CRM → Backend (`x-admin-token` або CRM-сесія)
```

## Швидкий старт (локально)

1. **Один env:** у корені `cp .env.example .env` і заповни секрети (усі 4 сервіси читають його).
2. **Backend:** `cd elf.duck.back.clean && npm install && npm start`
3. **Mini App:** `cd elf.duck.clean && npm install && npm run dev` (порт 3001)
4. **CRM:** `cd elfduck.crm && npm install && npm run dev` (порт 3002)
5. **Admin bot:** `cd elf.duck.admin-bot.clean && npm install && npm start`

## Безпека

- `.env` у всіх проєктах у `.gitignore` — не комітити секрети.
- CRM API захищено паролем (`CRM_ADMIN_PASSWORD` + `CRM_SESSION_SECRET` у `.env` backend на сервері).
- Рекомендовано **ротація** `ADMIN_API_TOKEN`, якщо файли `.env` колись передавалися третім особам.

## Доступи для повного адміністрування

Див. `docs/ACCESS.md`.
