# Tegger у Docker (ELF DUCK)

Сервіси в кореневому `docker-compose.yml`:

| Сервіс | Роль | Порт |
|--------|------|------|
| `tegger-api` | FastAPI / Telethon | внутрішній `:8000` |
| `tegger` | UI (nginx) + proxy `/api` → `tegger-api` | **3005** → host |

Публічний URL: **https://tegger.telebots.site** (nginx на VPS → `127.0.0.1:3005`).

## Запуск

```bash
# з кореня elf-duck-shop, після заповнення TEGGER_* у .env
git pull
docker compose build tegger-api tegger
docker compose up -d tegger-api tegger
curl -s http://localhost:3005/api/health
```

Якщо `npm install` падав з `edgesOut` — у репо вже є `tegger_ui/package-lock.json`, Dockerfile використовує `npm ci --legacy-peer-deps`.

CRM отримує посилання через `VITE_TEGGER_URL` (кнопка в «Клиенты» + пункт меню «Tegger»).

## Обовʼязкові змінні в кореневому `.env`

```env
TEGGER_API_ID=
TEGGER_API_HASH=
TEGGER_SENDERS=sender_1
TEGGER_ADMIN_USERNAME=admin
TEGGER_ADMIN_PASSWORD_HASH=
TEGGER_FRONTEND_ORIGIN=https://tegger.telebots.site
TEGGER_COOKIE_SECURE=true
TEGGER_DRY_RUN=true
# перший старт без Telegram credentials:
# TEGGER_BOOTSTRAP=true
```

Хеш пароля:

```bash
python3 -c 'from argon2 import PasswordHasher; import getpass; print(PasswordHasher().hash(getpass.getpass()))'
```

Адмін-логін (Compose-safe):

1. **`TEGGER_ADMIN_USERNAME` + `TEGGER_ADMIN_PASSWORD`** у кореневому `.env` (plaintext, без `$`), або
2. однорядковий argon2-хеш у **`docker/tegger-admin.hash`** (монтується в контейнер; не клади хеш у `.env` — Compose з’їдає `$`).

Якщо логін дає **502** — `tegger-api` не живий (UI на 3005 є, `/api` ні). На VPS:

```bash
# хеш-файл має існувати (можна порожній, якщо є TEGGER_ADMIN_PASSWORD)
test -f docker/tegger-admin.hash || cp docker/tegger-admin.hash.example docker/tegger-admin.hash

docker compose up -d --build --force-recreate tegger-api tegger
docker compose ps tegger tegger-api
docker compose logs --tail=80 tegger-api
curl -sS http://127.0.0.1:3006/api/health
curl -sS http://127.0.0.1:3005/api/health
```

Дані (сесії, sqlite) — volume `tegger_data` (`RUNTIME_DIR=/data`).
