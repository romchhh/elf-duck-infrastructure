# Деплой ELF DUCK на власний сервер (VPS)

Один VPS може тримати **API + бота**, **admin-бот**, **статику Mini App і CRM**, **MongoDB** (локально або окремо).

## Мінімальні вимоги

| Компонент | Рекомендація |
|-----------|----------------|
| OS | Ubuntu 22.04+ / Debian 12+ |
| RAM | 2 GB (4 GB комфортніше з MongoDB на тому ж хості) |
| Node.js | **18+** (як у `package.json` backend) |
| Домени + HTTPS | Обов’язково для Telegram Mini App |
| Порти | 443 (nginx), 80 → редірект; стек ELF DUCK: **3000** API, **3001** shop, **3002** CRM, **3004** Mongo (Docker) — див. `docs/DOCKER.md` |

## Архітектура (типовий варіант)

```text
Internet
   │
   ▼
nginx (TLS)
   ├── api.example.com     → proxy → 127.0.0.1:3000  (elf.duck.back.clean)
   ├── shop.example.com    → /var/www/elf-shop       (build elf.duck.clean)
   └── crm.example.com     → /var/www/elf-crm        (build elfduck.crm)

PM2/systemd:
   • elf-backend   (node server.js)  — API + основний Telegram bot (long polling)
   • elf-admin-bot (node index.js)   — окремий admin-бот

MongoDB:
   • mongod на VPS  АБО  MongoDB Atlas / інший хост → MONGODB_URI
```

Backend використовує **`bot.launch()`** (long polling), окремий webhook для Telegram **не обов’язковий**, якщо не перемикаєте на webhook вручну.

---

## 1. MongoDB

**Варіант A — залишити хмару (найпростіша міграція з Railway):**  
У `.env` backend лишаєте поточний `MONGODB_URI`, на VPS відкриваєте доступ до Atlas для IP сервера (або `0.0.0.0/0` лише якщо розумієте ризик).

**Варіант B — MongoDB на VPS:**

```bash
# Ubuntu, спрощено
sudo apt update && sudo apt install -y mongodb-org  # або офіційний репозиторій MongoDB 7.x
sudo systemctl enable --now mongod
```

`MONGODB_URI=mongodb://127.0.0.1:27017/elfduck`  
Користувача + пароль для prod краще створити окремо (`mongosh`, role readWrite).

**Бекапи:** `mongodump` / cron або snapshot диска.

---

## 2. Backend (`elf.duck.back.clean`)

На сервері:

```bash
cd /opt/elf-duck/elf.duck.back.clean
npm ci --omit=dev
# env один раз у корені монорепо (elf-duck-shop/.env), див. ../.env.example
```

Ключові змінні для **свого** сервера:

```env
PORT=3000
NODE_ENV=production

APP_URL=https://shop.example.com
WEBAPP_URL=https://shop.example.com

MONGODB_URI=...
TELEGRAM_BOT_TOKEN=...
ADMIN_API_TOKEN=...          # довгий random, один для backend + admin-bot

CRM_ADMIN_PASSWORD=...       # пароль входу в CRM
CRM_SESSION_SECRET=...       # окремий довгий random (не = ADMIN_API_TOKEN)
CRM_ALLOWED_ORIGINS=https://crm.example.com

# Google, Telegram chat IDs, webhooks — як у .env.example
```

Запуск через **PM2**:

```bash
npm install -g pm2
pm2 start server.js --name elf-backend --cwd /opt/elf-duck/elf.duck.back.clean
pm2 save && pm2 startup
```

Перевірка: `curl -s http://127.0.0.1:3000/ping` → `{"ok":true}`.

---

## 3. Admin-бот (`elf.duck.admin-bot.clean`)

```bash
cd /opt/elf-duck/elf.duck.admin-bot.clean
npm ci --omit=dev
```

`.env`:

```env
ADMIN_BOT_TOKEN=...
API_URL=https://api.example.com
ADMIN_API_TOKEN=...    # той самий, що на backend
ADMIN_IDS=123456789,...
```

```bash
pm2 start index.js --name elf-admin-bot --cwd /opt/elf-duck/elf.duck.admin-bot.clean
```

---

## 4. Mini App (`elf.duck.clean`) — статика

Змінні **підставляються на етапі збірки**:

```bash
cd /opt/elf-duck/elf.duck.clean
echo 'VITE_API_URL=https://api.example.com' > .env.production
npm ci && npm run build
sudo mkdir -p /var/www/elf-shop
sudo rsync -a dist/ /var/www/elf-shop/
```

У **BotFather** для Mini App вкажіть URL: `https://shop.example.com`.

---

## 5. CRM (`elfduck.crm`) — статика

```bash
cd /opt/elf-duck/elfduck.crm
echo 'VITE_CRM_API_URL=https://api.example.com' > .env.production
npm ci && npm run build
sudo mkdir -p /var/www/elf-crm
sudo rsync -a dist/ /var/www/elf-crm/
```

Після деплою backend з `CRM_ADMIN_PASSWORD` — вхід на `https://crm.example.com`.

---

## 6. nginx + Let's Encrypt

Приклад фрагментів (адаптуйте домени):

```nginx
# API
server {
  listen 443 ssl http2;
  server_name api.example.com;
  # ssl_certificate ... (certbot)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 15m;   # CRM push media
  }
}

# Mini App / CRM — SPA
server {
  listen 443 ssl http2;
  server_name shop.example.com;
  root /var/www/elf-shop;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com -d shop.example.com -d crm.example.com
```

---

## 7. CORS і cookies CRM

На backend:

- `APP_URL` = URL Mini App (дозволений origin).
- `CRM_ALLOWED_ORIGINS` = URL CRM (через кому, якщо кілька).
- У коді є додаткове правило для старих Vercel-preview — на своєму сервері достатньо **`CRM_ALLOWED_ORIGINS`**.

CRM-сесія: cookie `secure` + `sameSite=none` — потрібен **HTTPS** на API і CRM; фронт шле також заголовок `x-crm-session`.

---

## 8. Google Apps Script / webhooks

URL webhook-ів у Google мають вказувати на **публічний** API, напр.  
`https://api.example.com/...` (як зараз на Railway, лише змінити домен у скриптах і в `.env`).

Переконайтесь, що nginx не блокує POST від Google.

---

## 9. Чеклист після міграції з Railway

1. Експорт/імпорт Mongo (якщо переносите БД на VPS) або оновлення `MONGODB_URI`.
2. Деплой backend + admin-bot, перевірка `/ping`.
3. **`/crm/orders` без cookie/токена → 401** (після фікса безпеки).
4. Збірка shop + crm з новими `VITE_*`.
5. Оновити BotFather (Mini App URL), `@BotFather` admin-бот без змін токена якщо той самий.
6. Ротація `ADMIN_API_TOKEN`, якщо старий світився в логах/чатах.
7. Firewall: `ufw allow 22,80,443` — **не** відкривати 27017 і 3000 назовні.

---

## 10. Оновлення релізу

```bash
git pull   # у кожному репо
cd elf.duck.back.clean && npm ci --omit=dev && pm2 restart elf-backend
cd ../elf.duck.admin-bot.clean && npm ci --omit=dev && pm2 restart elf-admin-bot
# frontends: npm run build && rsync dist/ ...
```

Якщо потрібен **Docker Compose** або один скрипт `deploy.sh` під ваш домен — можна додати окремо.
