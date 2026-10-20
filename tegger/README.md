# Tegger — пакет исходников для передачи заказчику

В архиве **две директории**: `tegger-tg/` (Python/FastAPI/Telethon API) и `tegger_ui/` (React/Vite). Сессии Telegram, базы данных, списки пользователей, прокси, логи, `.env`, токены, пароли, настройки аккаунтов и другие runtime-данные **не включены**.

> **Важное ограничение:** исходники собраны из ранее предоставленного диагностического снимка, а не напрямую из текущих папок Mac. Поэтому **нельзя гарантировать**, что это именно откатанные коммиты `f8e5b40` / `d6f74f3`, или что вся функциональность работает совместно. Проверка реального запуска и интеграционные тесты не проводились. Диагностический снимок содержал заменённые на `<REDACTED>` значения; повреждённые этими заменами места исправлены, но требуется проверка заказчиком.

## 1. Распаковка

Распаковать ZIP. Появятся папки `tegger-tg` и `tegger_ui`. Требуются Python 3.12+ и Node.js 20+.

## 2. Backend (локально)

```bash
cd tegger-tg
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

В `.env` достаточно админ-логина (`TEGGER_ADMIN_USERNAME` + `TEGGER_ADMIN_PASSWORD` или hash) и при необходимости `FRONTEND_ORIGIN`. **По умолчанию DRY_RUN=true.**

Telegram **API ID / API Hash** и аккаунты задаются в UI после входа: Настройки → API ID/Hash ([my.telegram.org](https://my.telegram.org)), затем Аккаунты → логин по телефону или импорт `.session`.

Запуск API:

```bash
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

Проверка API: `http://127.0.0.1:8000/api/health` (если endpoint доступен в этой версии).

## 3. Frontend (локально)

```bash
cd tegger_ui
npm install
npm run dev
```

По умолчанию клиент отправляет относительные `/api/...` запросы. При локальном запуске Vite потребуется прокси `/api` на `http://127.0.0.1:8000` (настроить в `vite.config.js`) **или** временно изменить `API_URL` в `src/api/teggerClient.js` на `http://127.0.0.1:8000` и согласовать CORS/cookies.

## 4. Публикация

**Backend:** развернуть `tegger-tg` на Python-хостинге, например Railway. Установить переменные окружения из `.env.example` (без тестовых значений), стартовая команда `uvicorn api:app --host 0.0.0.0 --port $PORT`. Для хранения сессий и базы нужен **постоянный том** и корректно заданный `RUNTIME_DIR`.

**Frontend:** развернуть `tegger_ui` на Vercel (Vite; build `npm run build`; output `dist`). В `tegger_ui/vercel.json` **заменить** `YOUR-RAILWAY-DOMAIN` на собственный домен бэкенда; это обязательный шаг. Задать `FRONTEND_ORIGIN` на backend равным фактическому HTTPS-домену фронтенда.

## 5. Проверки перед передачей в эксплуатацию

1. `python -m compileall -q .` в backend.
2. `npm install && npm run build` во frontend.
3. Проверить `/api/health`, авторизацию, cookies, API-роуты и совместимость версий.
4. Создать собственные Telegram-сессии и настроить sender/шаблоны.
5. Проверить права доступа и использовать только разрешённые аккаунты и аудитории.

## Что намеренно отсутствует

`.env`, `.session`, `data/`, `sessions/`, `runtime/`, `*.sqlite*`, `*.db`, `node_modules/`, `.venv/`, `.git/`, `dist/`, кеши, логи и персональные данные.
