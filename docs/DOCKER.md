# Docker (ELF DUCK)

## Порти на localhost

| Порт | Сервіс |
|------|--------|
| **3000** | API + основний Telegram-бот |
| **3001** | Mini App (shop) |
| **3002** | CRM |
| **3003** | Admin-бот (без HTTP; лише процес у мережі Docker) |
| **3004** | MongoDB (`mongodb://localhost:3004/elfduck` з хоста) |
| **3005** | Tegger UI (`/api` → внутрішній `tegger-api`) |
| **3006** | Tegger API (debug/health: `/api/health`) |

Tegger стартує з `docker compose up -d`. Адмін: `TEGGER_ADMIN_USERNAME` + `TEGGER_ADMIN_PASSWORD` у `.env`.  
Telegram API ID/Hash і акаунти — лише в UI Tegger (Настройки / Аккаунты).  
Якщо раніше був помилковий mount: `rm -rf docker/tegger-admin.hash`

Локальний dev **без Docker**: ті самі порти — `vite` у shop (3001) і CRM (3002), backend `PORT=3000`.

## Швидкий старт

```bash
cd elf-duck-shop
cp .env.example .env
# заповни секрети в .env

docker compose build
docker compose up -d
```

Перевірка:

- http://localhost:3000/ping  
- http://localhost:3001 — магазин  
- http://localhost:3002 — CRM  
- http://localhost:3005 — Tegger (`/api/health`)  

Tegger потребує змінних `TEGGER_*` у кореневому `.env` (див. `.env.example`). Сесії/БД tegger зберігаються у volume `tegger_data`.

## MongoDB Atlas замість контейнера

У кореневому `.env`:

```env
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/elfduck?appName=elf-duck-shop
```

Backend бере URI з `.env`; `depends_on: mongo` необов’язковий — API стартує одразу з Atlas (контейнер `mongo` можна не піднімати: `docker compose up -d api shop crm admin-bot`).

## Prod на VPS

Заміни в `.env`:

```env
VITE_API_URL=https://api.example.com
VITE_CRM_API_URL=https://api.example.com
APP_URL=https://shop.example.com
CRM_ALLOWED_ORIGINS=https://crm.example.com
```

Перезбери frontends: `docker compose build shop crm && docker compose up -d`.

Зовні nginx + TLS на 443; порти 3000–3004 лишай на `127.0.0.1` або за firewall.

## Синхронизация каталога в Mongo (без Node на хосте)

```bash
docker compose build api
docker compose --profile tools run --rm --no-deps catalog-sync --dry-run
docker compose --profile tools run --rm --no-deps catalog-sync
```

Подробнее prod URL: [`TELEBOTS_SITE.md`](TELEBOTS_SITE.md) §5.1.
