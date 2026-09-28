# ELF DUCK — admin Telegram bot

Управление каталогом, точками, рассылками и кэшбеком.

## Доступ

1. В корневом `.env` задайте:
   - `ADMIN_BOT_TOKEN` — токен **отдельного** admin-бота (@BotFather).
   - `ADMIN_API_TOKEN` — тот же секрет, что у API.
   - `ADMIN_IDS` — Telegram ID пользователей с доступом (через запятую).
   - `SUPER_ADMIN_IDS` — супер-админы (полное меню, выгрузка базы клиентов).

2. Запустите сервис `admin-bot` (Docker: `docker compose up -d admin-bot`).

3. В Telegram откройте **вашего admin-бота** и отправьте `/start`.

Если ID есть в `ADMIN_IDS`, появится меню «ELF DUCK — Admin Panel». Супер-админы видят кнопку **«👥 Выгрузка базы»** — бот пришлёт CSV со всеми пользователями.

## Локально

```bash
cd elf.duck.admin-bot.clean
npm install
API_URL=http://localhost:3000 npm start
```
