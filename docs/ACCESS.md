# Доступи для адміністрування ELF DUCK

## Уже є / згадано

- **Google Таблиця** (склад менеджерів, звіти) — акаунт ELF DUCK
- **Кореневий `.env`** (`elf-duck-shop/.env`) — один файл для всіх сервісів

## Обов’язково для production (власний сервер)

| Що | Навіщо |
|----|--------|
| **SSH / root або deploy-користувач на VPS** | Деплой, PM2, nginx, логи |
| **Домени + TLS** | `api.*`, `shop.*` (Mini App), `crm.*`; Telegram вимагає HTTPS для Web App |
| **MongoDB** | Локально на VPS або зовнішній URI (`MONGODB_URI`); бекапи |
| **Telegram / BotFather** | Основний бот (`TELEGRAM_BOT_TOKEN`), admin-бот (`ADMIN_BOT_TOKEN`); ID груп і каналів |
| **Google Apps Script** | Webhook-и таблиці (`GOOGLE_STATS_WEBHOOK_URL_*`) → новий URL API |

Railway / Vercel **не потрібні**, якщо все на одному VPS (див. `DEPLOY_SELF_HOSTED.md`).

## Секрети в `.env` backend (ключові)

- `MONGODB_URI`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_TOKEN`
- `CRM_ADMIN_PASSWORD`, `CRM_SESSION_SECRET` (CRM-панель)
- `ADMIN_IDS`, `SUPER_ADMIN_IDS` (Telegram admin)
- `APP_URL` / `WEBAPP_URL` — URL Mini App (CORS + посилання в боті)
- `CRM_ALLOWED_ORIGINS` — URL CRM (напр. `https://crm.example.com`)
- Webhook-и Google + ID чатів для фото замовлень (`TG_ORDER_PHOTO_*`, `TG_CLIENT_ORDER_PHOTO_*`)

## Admin bot

- `API_URL` — публічний URL API (`https://api.example.com`, **без** trailing slash)
- `ADMIN_API_TOKEN` — **той самий**, що на backend
- `ADMIN_IDS` — Telegram user id адмінів

## Фронтенди (збірка на сервері)

- `elf.duck.clean`: `VITE_API_URL` → публічний API
- `elfduck.crm`: `VITE_CRM_API_URL` → публічний API  

Це **build-time** змінні Vite — після зміни домену потрібен **перезбір** `npm run build`.

## Бажано для супроводу

- PM2 або systemd + автозапуск
- `mongodump` / snapshot диска
- UFW: лише 22, 80, 443 ззовні
- Документ: менеджер → вкладка Google Sheet → `pickup point key` у БД

## Не обов’язково на старті

- Окремий CDN (nginx на VPS достатньо)
- Пошта ELF DUCK (якщо таблиця вже доступна)
