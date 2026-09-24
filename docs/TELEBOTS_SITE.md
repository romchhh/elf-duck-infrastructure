# ELF DUCK на telebots.site

## Піддомени

| Піддомен | Сервіс | Порт на VPS (localhost) |
|----------|--------|-------------------------|
| **https://elfduck-api.telebots.site** | API + основний Telegram-бот | 3000 |
| **https://elfduck.telebots.site** | Mini App (магазин) | 3001 |
| **https://elfduck-crm.telebots.site** | CRM | 3002 |
| *(немає HTTP)* | Admin-бот | — |
| *(опційно)* | MongoDB з хоста | 3004 |

У `.env` уже мають бути (prod):

```env
APP_URL=https://elfduck.telebots.site
WEBAPP_URL=https://elfduck.telebots.site
WEB_APP_URL=https://elfduck.telebots.site
VITE_API_URL=https://elfduck-api.telebots.site
VITE_CRM_API_URL=https://elfduck-api.telebots.site
CRM_ALLOWED_ORIGINS=https://elfduck-crm.telebots.site
API_URL=https://elfduck-api.telebots.site
NODE_ENV=production
```

---

## Чеклист: що зробити на сервері

### 1. DNS (у панелі telebots.site)

A-записи на **IP VPS** (один IP для всіх):

- `elfduck-api` → `YOUR_VPS_IP`
- `elfduck` → `YOUR_VPS_IP`
- `elfduck-crm` → `YOUR_VPS_IP`

Перевірка: `dig +short elfduck-api.telebots.site`

### 2. Docker або PM2 + nginx

**Docker:** `docker compose build && docker compose up -d` (після `.env`).

**nginx** (фрагмент — один server на піддомен):

```nginx
# API
server {
  server_name elfduck-api.telebots.site;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 15m;
  }
}

# Mini App
server {
  server_name elfduck.telebots.site;
  root /var/www/elfduck-shop;   # або proxy_pass http://127.0.0.1:3001;
  location / { try_files $uri $uri/ /index.html; }
}

# CRM
server {
  server_name elfduck-crm.telebots.site;
  root /var/www/elfduck-crm;
  location / { try_files $uri $uri/ /index.html; }
}
```

TLS: `certbot --nginx -d elfduck-api.telebots.site -d elfduck.telebots.site -d elfduck-crm.telebots.site`

### 3. Збірка фронтів (обовʼязково після зміни `.env`)

```bash
# з кореня, коли VITE_* вже prod URL
docker compose build shop crm
# або локально:
cd elf.duck.clean && npm run build
cd elfduck.crm && npm run build
```

Без цього в бандлі лишаться старі Railway/Vercel URL.

### 4. Telegram (@BotFather)

- **Main bot** → Bot Settings → **Menu Button / Web App URL**:  
  `https://elfduck.telebots.site`
- Перевір **домен** для Web App (якщо BotFather просить — додай через `/setdomain` або актуальний flow для telebots.site).

Admin-бот: токен у `.env` як `ADMIN_BOT_TOKEN`; з VPS ходить на `API_URL` (у Docker внутрішньо `http://api:3000`).

### 5. MongoDB Atlas

- Network Access: **IP VPS** (або тимчасово для тесту).
- `MONGODB_URI` у `.env` без змін, якщо вже Atlas + база `elfduck`.

### 6. Google Apps Script / таблиці

Усі webhook-и, що били на Railway, переключити на публічний API, напр.:  
`https://elfduck-api.telebots.site/...` (шлях як у ваших скриптах).

### 7. Безпека

- `CRM_ADMIN_PASSWORD`, `CRM_SESSION_SECRET`, `ADMIN_API_TOKEN` — задані в `.env`.
- Firewall: ззовні лише **80/443**; 3000–3004 — localhost.

### 8. Перевірка після деплою

```bash
curl -s https://elfduck-api.telebots.site/ping
curl -s -o /dev/null -w "%{http_code}" https://elfduck.telebots.site/
curl -s -o /dev/null -w "%{http_code}" https://elfduck-crm.telebots.site/
```

CRM: `/crm/orders` без авторизації → **401**.  
Mini App: відкрити з Telegram, оформити тестовий запит.

---

## Локальна розробка

Скопіюй блок localhost з `.env.example` у `.env` (або окремий `.env.local` — зараз один файл, для dev тимчасово змінюй URL на localhost).
