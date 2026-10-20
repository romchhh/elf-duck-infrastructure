# Tegger у Docker (ELF DUCK)

| Сервіс | Роль | Порт |
|--------|------|------|
| `tegger-api` | FastAPI / Telethon | **3006** + внутрішній `:8000` |
| `tegger` | UI (nginx) + `/api` → `tegger-api` | **3005** |

Публічний URL: **https://tegger.telebots.site**.

## Запуск

```bash
rm -rf docker/tegger-admin.hash   # якщо лишилась директорія від старого mount
docker compose up -d --build tegger-api tegger
curl -sS http://127.0.0.1:3006/api/health
```

## .env (лише адмін-панель)

```env
TEGGER_ADMIN_USERNAME=admin
TEGGER_ADMIN_PASSWORD=your-strong-password
TEGGER_BOOTSTRAP=true
TEGGER_FRONTEND_ORIGIN=https://tegger.telebots.site
TEGGER_COOKIE_SECURE=true
TEGGER_DRY_RUN=true
```

**Не потрібні в .env:** `API_ID`, `API_HASH`, `SENDERS` — їх задають у UI.

## Після входу в Tegger Admin

1. **Настройки** → Telegram API ID + API Hash ([my.telegram.org](https://my.telegram.org)) → Сохранить  
2. **Аккаунты** → добавить через «Авторизация Telegram» (код/2FA) или импорт `.session`

Данные (сессии, sqlite, `ui_telegram_config.json`) — volume `tegger_data`.
