import json

import os

import tempfile

from pathlib import Path

import asyncio

from urllib.parse import urlsplit

from telethon.errors import RPCError

from telethon import functions, types
from telethon.errors import RPCError
from html import escape
import re

from config import SESSIONS_DIR
from src.telegram_client import create_client

from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse

from PIL import Image, UnidentifiedImageError

from fastapi.middleware.cors import CORSMiddleware

from auth import (
    router as auth_router,
    initialize_auth,
    get_current_user,
)

from config import (
    DATA_DIR,
    DRY_RUN,
    SENDERS,
    MAX_CONCURRENT_SENDERS,
    TARGETS_PER_SENDER_PER_DAY,
    TARGETS_PER_STORY_MIN,
    TARGETS_PER_STORY_MAX,
    STORY_INTERVAL_MIN_SECONDS,
    STORY_INTERVAL_MAX_SECONDS,
    INTERACTION_STORY_DELAY,
)


app = FastAPI(
    title="Tegger API",
    version="0.2.0",
)

initialize_auth()

app.include_router(auth_router)

_frontend_origin = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:5173",
).strip()

_cors_origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://localhost:3005",
    "https://tegger.telebots.site",
]

if _frontend_origin and _frontend_origin not in _cors_origins:
    _cors_origins.append(_frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


# ==========================================
# DATA HELPERS
# ==========================================

def read_json(filename, default=None):
    path = Path(DATA_DIR) / filename

    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    except FileNotFoundError:
        return default

    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Cannot read {filename}: {type(exc).__name__}",
        ) from exc


def normalize_username(value):
    if isinstance(value, dict):
        value = value.get("username", "")

    return str(value or "").strip().lstrip("@").lower()


# Read-only Railway Migration snapshot for UI statistics only.
def migration_snapshot_data():
    snapshot = Path(DATA_DIR) / "railway_snapshot"
    assignments_path = snapshot / "migration_assignments.json"
    processed_path = snapshot / "processed.json"
    if not assignments_path.is_file() or not processed_path.is_file():
        raise HTTPException(status_code=503, detail="Railway Migration snapshot unavailable")
    try:
        assignments_data = json.loads(assignments_path.read_text(encoding="utf-8"))
        processed_data = json.loads(processed_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="Railway Migration snapshot unreadable") from exc
    if not isinstance(assignments_data, dict) or not isinstance(assignments_data.get("assignments"), dict):
        raise HTTPException(status_code=500, detail="Invalid Railway assignments snapshot")
    if not isinstance(processed_data, list):
        raise HTTPException(status_code=500, detail="Invalid Railway processed snapshot")
    return assignments_data["assignments"], {
        username for item in processed_data
        if (username := normalize_username(item))
    }


def get_assignments():
    data = read_json("migration_assignments.json")

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=503,
            detail="Migration assignments unavailable",
        )

    if not isinstance(data.get("assignments"), dict):
        raise HTTPException(
            status_code=503,
            detail="Invalid assignments format",
        )

    return data


def get_processed():
    """Read-only union of legacy processed.txt and per-sender state.json."""
    processed = set()
    path = Path(DATA_DIR) / "processed.txt"
    try:
        with path.open("r", encoding="utf-8") as file:
            processed.update(
                username for line in file
                if (username := normalize_username(line))
            )
    except FileNotFoundError:
        pass
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Cannot read processed.txt") from exc

    for state_path in sorted(Path(DATA_DIR).glob("*/state.json")):
        try:
            with state_path.open("r", encoding="utf-8") as file:
                state = json.load(file)
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Cannot read state for {state_path.parent.name}: {type(exc).__name__}",
            ) from exc
        if not isinstance(state, dict):
            raise HTTPException(status_code=500, detail=f"Invalid state for {state_path.parent.name}")
        values = state.get("processed", [])
        if not isinstance(values, list):
            raise HTTPException(status_code=500, detail=f"Invalid processed list for {state_path.parent.name}")
        processed.update(
            username for value in values
            if (username := normalize_username(value))
        )
    return processed


# ==========================================
# TEST TELEGRAM ACCOUNT
# ==========================================

TEST_SENDER = "sender_test"


def is_known_sender(sender: str) -> bool:
    return sender in SENDERS or sender == TEST_SENDER or any(a.get("id") == sender for a in _added_accounts())

def get_sender_configuration(sender: str) -> dict:
    if not is_known_sender(sender):
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    added = next((a for a in _added_accounts() if a.get("id") == sender), None)
    if added is not None:
        return {"proxyUri": "Настроен" if added.get("proxy") else "", "proxyConfigured": bool(added.get("proxy")), "storyTemplate": added.get("storyTemplate", "")}

    # Получаем SOCKS5-прокси из .env
    proxy_key = f"PROXY_{sender.upper()}"
    raw_proxy = os.getenv(proxy_key, "").strip()

    proxy_display = ""

    if raw_proxy:
        try:
            parsed = urlsplit(raw_proxy)

            if parsed.hostname:
                proxy_display = (
                    f"{parsed.scheme}://{parsed.hostname}"
                )

                if parsed.port is not None:
                    proxy_display += f":{parsed.port}"
            else:
                proxy_display = "Настроен"

        except ValueError:
            proxy_display = "Настроен"

    # Получаем индивидуальный шаблон Stories,
    # а если его нет — общий
    story_key = f"TEMPLATE_STORY_URL_{sender.upper()}"

    story_template = (
        os.getenv(story_key, "").strip()
        or os.getenv("TEMPLATE_STORY_URL", "").strip()
    )

    return {
        "proxyUri": proxy_display,
        "proxyConfigured": bool(raw_proxy),
        "storyTemplate": story_template,
    }

def test_account_data() -> dict:
    return {
        "id": TEST_SENDER,
        "name": TEST_SENDER,
        "assigned": 0,
        "completed": 0,
        "remaining": 0,
        "dailyLimit": TARGETS_PER_SENDER_PER_DAY,
        **get_sender_configuration(TEST_SENDER),
        **account_ui_details(TEST_SENDER),
    }


async def check_test_telegram_session(sender: str) -> dict:
    session_file = Path(SESSIONS_DIR) / f"{sender}.session"

    if not session_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="sender_test.session не найден в SESSIONS_DIR",
        )

    client = create_client(sender)

    try:
        await asyncio.wait_for(client.connect(), timeout=20)

        authorized = await asyncio.wait_for(
            client.is_user_authorized(),
            timeout=20,
        )

        if not authorized:
            return {
                "connected": True,
                "authorized": False,
                "sender": sender,
                "message": "Сессия не авторизована",
            }

        me = await asyncio.wait_for(
            client.get_me(),
            timeout=20,
        )

        return {
            "connected": True,
            "authorized": True,
            "sender": sender,
            "telegramId": me.id,
            "firstName": me.first_name or "",
            "username": me.username or "",
            "premium": bool(getattr(me, "premium", False)),
        }

    except (OSError, RPCError, asyncio.TimeoutError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram connection failed: {type(exc).__name__}",
        ) from exc

    finally:
        await client.disconnect()

# ==========================================
# ACCOUNT STATISTICS
# ==========================================

def account_verification_path(sender: str) -> Path:
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Account not found")
    return Path(DATA_DIR) / "account_verification" / f"{sender}.json"


def read_account_verification(sender: str) -> dict:
    path = account_verification_path(sender)
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def save_account_verification(sender: str, value: dict) -> None:
    path = account_verification_path(sender)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=".verify-", suffix=".tmp", delete=False) as file:
            temp_path = Path(file.name)
            json.dump(value, file, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def account_ui_details(sender: str) -> dict:
    """Read local sender state only; never connect to Telegram."""
    from src.state import load_state

    if any(a.get("id") == sender for a in _added_accounts()):
        return _account_added_view(next(a for a in _added_accounts() if a["id"] == sender))
    state = load_state(sender, read_only=True)
    configuration = get_sender_configuration(sender)
    # Account identity comes from the saved appearance configuration, not .env.
    appearance = read_appearance(sender)
    verification = read_account_verification(sender)
    profile_username = (verification.get("username") if verification.get("authorized") is True else None)
    if profile_username is None:
        profile_username = appearance.get("username", "")
    profile_username = str(profile_username or "").strip().lstrip("@")
    session_exists = (Path(SESSIONS_DIR) / f"{sender}.session").is_file()
    return {
        "telegram": f"@{profile_username}" if profile_username else "—",
        "telegramVerified": verification.get("authorized") is True,
        "status": verification.get("status", "Не проверен"),
        "lastVerifiedAt": verification.get("checkedAt"),
        "telegramId": verification.get("telegramId"),
        "firstName": verification.get("firstName", appearance.get("firstName", "")),
        "lastName": verification.get("lastName", ""),
        "verificationError": verification.get("lastCheckError"),
        "session": session_exists,
        "proxy": bool(configuration["proxyConfigured"]),
        "story": bool(configuration["storyTemplate"]),
        "dailyCount": int(state.get("daily_count", 0)),
        "dailyLimit": execution_values()["TARGETS_PER_SENDER_PER_DAY"],
        "cooldownUntil": state.get("cooldown_until"),
        "lastError": state.get("last_error"),
        "senderStatus": state.get("status", "active"),
    }


def get_accounts_data():
    assignments, processed = migration_snapshot_data()

    accounts = []

    for sender in SENDERS:
        targets = assignments.get(sender, [])

        usernames = {
            username
            for target in targets
            if (username := normalize_username(target))
        }

        completed = len(usernames & processed)

        accounts.append({
            "id": sender,
            "name": sender,
            "assigned": len(usernames),
            "completed": completed,
            "remaining": len(usernames) - completed,
            "dailyLimit": TARGETS_PER_SENDER_PER_DAY,
            **get_sender_configuration(sender),
            **account_ui_details(sender),
        })

    accounts.append(test_account_data())
    accounts.extend(_account_added_view(item) for item in _added_accounts())
    # Hide only accounts explicitly logged out through the UI; preserve all records.
    accounts = [
        account for account in accounts
        if not read_account_verification(account["id"]).get("hiddenAfterLogout", False)
    ]

    membership = {a["id"]: [] for a in accounts}
    for sender in SENDERS:
        membership.setdefault(sender, []).append("migration")
    for item in read_ui_campaigns():
        for sender in item.get("senderIds", []):
            membership.setdefault(sender, []).append(item.get("id"))
    for item in accounts:
        item["campaignIds"] = membership.get(item["id"], [])
        item["campaignAssigned"] = bool(item["campaignIds"])
    return accounts


# ==========================================
# CAMPAIGN STATISTICS
# ==========================================

def get_campaign_data():
    """Read-only snapshot of migration assignments and processed.txt.

    A target is counted once across senders. An entry in processed.txt
    is only counted if it belongs to the migration assignment set.
    """
    assignments, processed = migration_snapshot_data()
    unique_targets = set()
    total_rows = 0
    for sender in SENDERS:
        for raw in assignments.get(sender, []):
            username = normalize_username(raw)
            if username:
                unique_targets.add(username)
                total_rows += 1
    total = len(unique_targets)
    completed = len(unique_targets & processed)
    return {
        "id": "migration",
        "name": "Migration campaign",
        "status": (
            "Завершена" if total > 0 and completed == total
            else "Статус запуска неизвестен"
        ),
        "senderIds": list(SENDERS),
        "totalTargets": total,
        "processed": completed,
        "remaining": total - completed,
        "assignmentRows": total_rows,
        "duplicateAssignments": total_rows - total,
        "progressPercent": round(completed * 100 / total, 2) if total else 0,
        "statisticsSource": "Railway snapshot (2026-10-14, read-only; not live)",
    }

# ==========================================
# ACCOUNT APPEARANCE
# ==========================================

class AccountAppearance(BaseModel):
    firstName: str = Field(default="", max_length=64)
    username: str = Field(default="", max_length=64)
    bio: str = Field(default="", max_length=256)

    channelTitle: str = Field(default="", max_length=128)
    channelUsername: str = Field(default="", max_length=64)
    channelBio: str = Field(default="", max_length=1024)

    postText: str = Field(default="", max_length=4096)
    actionText: str = Field(default="", max_length=128)
    actionUrl: str = Field(default="", max_length=2048)

def require_profile_sender(sender: str):
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    if sender in SENDERS:
        raise HTTPException(
            status_code=409,
            detail="Аккаунт входит в Migration. Telegram-изменения заблокированы до подтверждённой остановки воркера и синхронизации Railway.",
        )
    session_file = Path(SESSIONS_DIR) / f"{sender}.session"
    if not session_file.is_file():
        raise HTTPException(status_code=404, detail="Telegram-сессия аккаунта отсутствует")


async def apply_test_profile(sender: str, appearance: AccountAppearance) -> dict:
    require_profile_sender(sender)

    first_name = appearance.firstName.strip()
    username = appearance.username.strip().lstrip("@")
    bio = appearance.bio.strip()

    if not first_name:
        raise HTTPException(
            status_code=422,
            detail="Имя Telegram не может быть пустым",
        )

    client = create_client(sender)

    try:
        await asyncio.wait_for(client.connect(), timeout=20)

        if not await asyncio.wait_for(
            client.is_user_authorized(),
            timeout=20,
        ):
            raise HTTPException(
                status_code=409,
                detail="Тестовая сессия не авторизована",
            )

        me = await asyncio.wait_for(
            client.get_me(),
            timeout=20,
        )

        full_user = await asyncio.wait_for(
            client(
                functions.users.GetFullUserRequest(id="me")
            ),
            timeout=20,
        )

        current_name = me.first_name or ""
        current_username = me.username or ""
        current_bio = full_user.full_user.about or ""

        changed = []

        if first_name != current_name or (me.last_name or "") or bio != current_bio:
            await asyncio.wait_for(
                client(
                    functions.account.UpdateProfileRequest(
                        first_name=first_name,
                        last_name="",
                        about=bio,
                    )
                ),
                timeout=20,
            )

            if first_name != current_name:
                changed.append("firstName")

            if bio != current_bio:
                changed.append("bio")

        if username != current_username:
            await asyncio.wait_for(
                client(
                    functions.account.UpdateUsernameRequest(
                        username=username,
                    )
                ),
                timeout=20,
            )

            changed.append("username")

        verified_me = await asyncio.wait_for(client.get_me(), timeout=20)
        return {
            "applied": True,
            "changed": changed,
            "telegramIdentity": {
                "telegramId": verified_me.id,
                "username": verified_me.username or "",
                "firstName": verified_me.first_name or "",
                "lastName": verified_me.last_name or "",
            },
        }

    finally:
        await client.disconnect()

APPEARANCE_DIR = Path(DATA_DIR) / "appearance"

PROFILE_AVATAR_NAME = "profile_avatar.jpg"
CHANNEL_AVATAR_NAME = "channel_avatar.jpg"
CHANNEL_POST_IMAGE_NAME = "channel_post.jpg"
CHANNEL_STATE_NAME = "channel_state.json"

MAX_AVATAR_SIZE = 5 * 1024 * 1024


def profile_avatar_path(sender: str) -> Path:
    appearance_path(sender)

    return APPEARANCE_DIR / sender / PROFILE_AVATAR_NAME


def appearance_path(sender: str) -> Path:
    if not is_known_sender(sender):
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    return APPEARANCE_DIR / sender / "config.json"


def read_appearance(sender: str) -> dict:
    path = appearance_path(sender)

    if not path.exists():
        return AccountAppearance().model_dump()

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        return AccountAppearance.model_validate(data).model_dump()

    except (OSError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Cannot read appearance: {type(exc).__name__}",
        ) from exc


def save_appearance(sender: str, data: AccountAppearance) -> dict:
    path = appearance_path(sender)
    path.parent.mkdir(parents=True, exist_ok=True)

    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=".appearance-",
            suffix=".tmp",
            delete=False,
        ) as file:
            temporary_path = Path(file.name)

            json.dump(
                data.model_dump(),
                file,
                ensure_ascii=False,
                indent=2,
            )

        os.replace(temporary_path, path)

    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Cannot save appearance",
        ) from exc

    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return data.model_dump()

async def apply_test_avatar(sender: str, image_path: Path) -> dict:
    require_profile_sender(sender)

    client = create_client(sender)

    try:
        await asyncio.wait_for(
            client.connect(),
            timeout=20,
        )

        authorized = await asyncio.wait_for(
            client.is_user_authorized(),
            timeout=20,
        )

        if not authorized:
            raise HTTPException(
                status_code=409,
                detail="Тестовая сессия не авторизована",
            )

        uploaded_file = await asyncio.wait_for(
            client.upload_file(str(image_path)),
            timeout=60,
        )

        await asyncio.wait_for(
            client(
                functions.photos.UploadProfilePhotoRequest(
                    file=uploaded_file,
                )
            ),
            timeout=60,
        )

        return {
            "applied": True,
            "avatarUpdated": True,
        }

    finally:
        await client.disconnect()


# ==========================================
# LOCAL ACCOUNT REGISTRY AND REAL AUDIT EVENTS
# ==========================================

from datetime import datetime as _dt, timezone as _tz
from uuid import uuid4 as _uuid4
from telethon import TelegramClient as _TelegramClient
from telethon.errors import SessionPasswordNeededError as _SessionPasswordNeededError
from src.telegram_client import _parse_socks5_proxy as _parse_proxy
from config import API_ID as _API_ID, API_HASH as _API_HASH
from fastapi import Form as _Form
import sqlite3 as _sqlite3
import time as _time

_ADDED_ACCOUNTS_FILE = Path(DATA_DIR) / 'ui_added_accounts.json'
_AUDIT_FILE = Path(DATA_DIR) / 'ui_logs' / 'events.jsonl'
_LOGIN_DIR = Path(DATA_DIR) / 'ui_login_pending'
_PENDING_LOGINS = {}
_ADD_LOCK = asyncio.Lock()


def _audit(level, event, detail='', sender='system'):
    record = {'id': _uuid4().hex, 'at': _dt.now(_tz.utc).isoformat(),
              'level': level, 'sender': sender, 'event': event, 'detail': detail}
    _AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _AUDIT_FILE.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + '\n')


def _added_accounts():
    if not _ADDED_ACCOUNTS_FILE.is_file():
        return []
    try:
        value = json.loads(_ADDED_ACCOUNTS_FILE.read_text(encoding='utf-8'))
        if not isinstance(value, list):
            raise ValueError('Not a list')
        return value
    except (ValueError, OSError) as exc:
        raise HTTPException(500, 'Не удалось прочитать реестр добавленных аккаунтов') from exc


def _save_added_accounts(items):
    _ADDED_ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = _ADDED_ACCOUNTS_FILE.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(items, stream, ensure_ascii=False, indent=2)
    os.replace(temporary, _ADDED_ACCOUNTS_FILE)


def _validate_new_sender(sender):
    if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{2,39}', sender or ''):
        raise HTTPException(422, 'Имя: 3–40 символов, латиница, цифры и _')
    if sender in SENDERS or sender == TEST_SENDER or any(a.get('id') == sender for a in _added_accounts()):
        raise HTTPException(409, 'Аккаунт с таким именем уже существует')
    if (Path(SESSIONS_DIR) / f'{sender}.session').exists():
        raise HTTPException(409, 'Файл сессии с таким именем уже существует')


def _validate_new_proxy(raw):
    try:
        return _parse_proxy(raw or '')
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, 'Неверный SOCKS5 proxy') from exc


def _new_client(path, proxy):
    return _TelegramClient(str(path), _API_ID, _API_HASH, proxy=_validate_new_proxy(proxy))


def _account_added_view(record):
    sender = record['id']
    session_exists = (Path(SESSIONS_DIR) / f'{sender}.session').is_file()
    verification = read_account_verification(sender)
    authorized = verification.get('authorized') is True
    username = (verification.get('username') if authorized else record.get('username')) or ''
    status = ('Сессия отсутствует' if not session_exists else
              verification.get('status', 'Добавлен (не проверен)'))
    return {
        'id': sender, 'name': sender, 'telegram': '@' + username if username else '—',
        'telegramVerified': authorized, 'telegramId': verification.get('telegramId', record.get('telegramId')),
        'status': status,
        'assigned': 0, 'completed': 0, 'remaining': 0, 'dailyCount': 0,
        'dailyLimit': execution_values()['TARGETS_PER_SENDER_PER_DAY'],
        'session': session_exists, 'proxy': bool(record.get('proxy')),
        'story': bool(record.get('storyTemplate')), 'proxyConfigured': bool(record.get('proxy')),
        'proxyUri': 'Настроен' if record.get('proxy') else '',
        'storyTemplate': record.get('storyTemplate', ''),
        'senderStatus': 'not_assigned', 'lastVerifiedAt': record.get('createdAt'),
    }


def _commit_new_account(sender, session_path, proxy, story_template, me):
    final = Path(SESSIONS_DIR) / f'{sender}.session'
    _validate_new_sender(sender)
    if not session_path.is_file():
        raise HTTPException(500, 'Файл Telegram-сессии не создан')
    os.replace(session_path, final)
    try:
        items = _added_accounts()
        record = {'id': sender, 'username': me.username or '', 'telegramId': me.id,
                  'proxy': proxy, 'storyTemplate': story_template,
                  'createdAt': _dt.now(_tz.utc).isoformat()}
        items.append(record)
        _save_added_accounts(items)
    except Exception:
        # Roll back new session if registry write failed; never overwrite existing.
        if final.is_file():
            os.replace(final, session_path)
        raise
    _audit('SUCCESS', 'Добавлен Telegram-аккаунт', 'Авторизация подтверждена; без назначения на кампании', sender)
    return _account_added_view(record)


@app.get('/api/logs', dependencies=[Depends(get_current_user)])
async def list_real_logs(level: str = 'ALL', sender: str = 'all', search: str = '', limit: int = 500):
    if level not in {'ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'} or not 1 <= limit <= 2000:
        raise HTTPException(422, 'Некорректные параметры фильтра')
    if not _AUDIT_FILE.is_file():
        return []
    rows = []
    try:
        with _AUDIT_FILE.open(encoding='utf-8') as stream:
            for line in stream:
                try:
                    item = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(item, dict): continue
                if level != 'ALL' and item.get('level') != level: continue
                if sender != 'all' and item.get('sender') != sender: continue
                if search and search.casefold() not in ' '.join(str(item.get(k,'')) for k in ('event','detail','sender')).casefold(): continue
                at = str(item.get('at', ''))
                rows.append({**item, 'date': at[:10], 'time': at[11:19]})
    except OSError as exc:
        raise HTTPException(500, 'Ошибка чтения журнала') from exc
    return rows[-limit:][::-1]


@app.post('/api/accounts/add/import', dependencies=[Depends(get_current_user)])
async def import_new_account(sender: str = _Form(...), proxy: str = _Form(''),
                             storyTemplate: str = _Form(''), file: UploadFile = File(...)):
    async with _ADD_LOCK:
        _validate_new_sender(sender)
        _validate_new_proxy(proxy)
        if not file.filename.lower().endswith('.session'):
            raise HTTPException(422, 'Нужен файл .session')
        content = await file.read(4 * 1024 * 1024 + 1)
        if len(content) > 4 * 1024 * 1024 or len(content) < 100:
            raise HTTPException(422, 'Недопустимый размер файла .session')
        _LOGIN_DIR.mkdir(parents=True, exist_ok=True)
        staging = _LOGIN_DIR / (_uuid4().hex + '.session')
        staging.write_bytes(content)
        client = None
        try:
            with _sqlite3.connect(f'file:{staging}?mode=ro', uri=True) as db:
                if db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").fetchone() is None:
                    raise HTTPException(422, 'Это не Telethon SQLite session')
            client = _new_client(staging.with_suffix(''), proxy)
            await asyncio.wait_for(client.connect(), timeout=25)
            if not await asyncio.wait_for(client.is_user_authorized(), timeout=25):
                raise HTTPException(422, 'Telegram-сессия не авторизована')
            me = await asyncio.wait_for(client.get_me(), timeout=25)
            await client.disconnect()
            client = None
            return _commit_new_account(sender, staging, proxy, storyTemplate, me)
        except HTTPException:
            raise
        except Exception as exc:
            _audit('ERROR', 'Ошибка импорта аккаунта', type(exc).__name__, sender)
            raise HTTPException(502, f'Проверка Telegram не удалась: {type(exc).__name__}') from exc
        finally:
            if client is not None:
                await client.disconnect()
            staging.unlink(missing_ok=True)


class _PhoneStart(BaseModel):
    sender: str
    phone: str
    proxy: str = ''
    storyTemplate: str = ''


class _PhoneCode(BaseModel):
    token: str
    code: str


class _PhonePassword(BaseModel):
    token: str
    password: str


async def _cleanup_login(token):
    entry = _PENDING_LOGINS.pop(token, None)
    if entry:
        try:
            await entry['client'].disconnect()
        finally:
            entry['path'].unlink(missing_ok=True)


def _get_login(token):
    entry = _PENDING_LOGINS.get(token)
    if not entry:
        raise HTTPException(404, 'Авторизация не найдена; начни заново')
    if _time.monotonic() - entry['created'] > 600:
        raise HTTPException(410, 'Код устарел; начни заново')
    return entry


async def _complete_login(token, me):
    entry = _get_login(token)
    await entry['client'].disconnect()
    async with _ADD_LOCK:
        try:
            result = _commit_new_account(entry['sender'], entry['path'], entry['proxy'], entry['storyTemplate'], me)
        finally:
            await _cleanup_login(token)
    return {'status': 'complete', 'account': result}


@app.post('/api/accounts/add/phone/start', dependencies=[Depends(get_current_user)])
async def start_phone_login(payload: _PhoneStart):
    async with _ADD_LOCK:
        _validate_new_sender(payload.sender)
        _validate_new_proxy(payload.proxy)
        if not re.fullmatch(r'\+[1-9]\d{6,14}', payload.phone.strip()):
            raise HTTPException(422, 'Номер укажи в международном формате: +...')
        _LOGIN_DIR.mkdir(parents=True, exist_ok=True)
        token = _uuid4().hex
        staging = _LOGIN_DIR / token
        client = _new_client(staging, payload.proxy)
        try:
            await asyncio.wait_for(client.connect(), timeout=25)
            sent = await asyncio.wait_for(client.send_code_request(payload.phone.strip()), timeout=30)
        except Exception as exc:
            await client.disconnect()
            staging.with_suffix('.session').unlink(missing_ok=True)
            _audit('ERROR', 'Ошибка отправки кода Telegram', type(exc).__name__, payload.sender)
            raise HTTPException(502, f'Не удалось запросить код: {type(exc).__name__}') from exc
        _PENDING_LOGINS[token] = {'client': client, 'path': staging.with_suffix('.session'),
            'sender': payload.sender, 'phone': payload.phone.strip(),
            'phone_code_hash': sent.phone_code_hash, 'proxy': payload.proxy,
            'storyTemplate': payload.storyTemplate, 'created': _time.monotonic()}
        _audit('INFO', 'Запрошен код Telegram', 'Ожидается подтверждение', payload.sender)
        return {'status': 'code_required', 'token': token}


@app.post('/api/accounts/add/phone/code', dependencies=[Depends(get_current_user)])
async def submit_phone_code(payload: _PhoneCode):
    entry = _get_login(payload.token)
    try:
        await asyncio.wait_for(entry['client'].sign_in(phone=entry['phone'], code=payload.code.strip(),
            phone_code_hash=entry['phone_code_hash']), timeout=30)
    except _SessionPasswordNeededError:
        return {'status': 'password_required', 'token': payload.token}
    except Exception as exc:
        raise HTTPException(422, f'Код не принят: {type(exc).__name__}') from exc
    me = await entry['client'].get_me()
    return await _complete_login(payload.token, me)


@app.post('/api/accounts/add/phone/password', dependencies=[Depends(get_current_user)])
async def submit_phone_password(payload: _PhonePassword):
    entry = _get_login(payload.token)
    try:
        await asyncio.wait_for(entry['client'].sign_in(password=payload.password), timeout=30)
    except Exception as exc:
        raise HTTPException(422, f'2FA не пройдена: {type(exc).__name__}') from exc
    me = await entry['client'].get_me()
    return await _complete_login(payload.token, me)

# ==========================================
# HEALTH
# ==========================================

@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "service": "tegger-tg",
        "mode": "DRY RUN" if DRY_RUN else "LIVE",
    }


# ==========================================
# RAILWAY STORAGE READINESS (READ ONLY)
# ==========================================

@app.get("/api/system/storage-readiness", dependencies=[Depends(get_current_user)])
async def storage_readiness():
    """Inspect paths only. Never connect to Telegram or modify campaign state."""
    data_dir = Path(DATA_DIR).resolve()
    sessions_dir = Path(SESSIONS_DIR).resolve()
    raw_mount = os.getenv("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
    mount = Path(raw_mount).resolve() if raw_mount else None

    def inside_mount(path):
        return mount is not None and (path == mount or mount in path.parents)

    snapshot_dir = data_dir / "railway_snapshot"
    assignments = snapshot_dir / "migration_assignments.json"
    processed = snapshot_dir / "processed.json"
    checks = {
        "railwayVolumeDeclared": bool(raw_mount),
        "railwayVolumeMountExists": mount.is_dir() if mount else False,
        "dataOnDeclaredVolume": inside_mount(data_dir),
        "sessionsOnDeclaredVolume": inside_mount(sessions_dir),
        "dataDirectoryExists": data_dir.is_dir(),
        "sessionsDirectoryExists": sessions_dir.is_dir(),
        "migrationSnapshotFilesExist": assignments.is_file() and processed.is_file(),
    }
    return {
        "ok": True,
        "mode": "DRY RUN" if DRY_RUN else "LIVE",
        "checks": checks,
        "readyForPersistentStorage": all((
            checks["railwayVolumeDeclared"],
            checks["railwayVolumeMountExists"],
            checks["dataOnDeclaredVolume"],
            checks["sessionsOnDeclaredVolume"],
        )),
        "migrationLiveWorkerEnabledByThisPatch": False,
        "telegramRequests": 0,
        "note": "Read-only path checks. Restart durability, worker integration, and live safety NOT verified.",
    }


# ==========================================
# DASHBOARD
# ==========================================

@app.get(

    "/api/dashboard",

    dependencies=[Depends(get_current_user)],

)

async def dashboard():
    campaign = get_campaign_data()

    return {
        "mode": "DRY RUN" if DRY_RUN else "LIVE",
        "accounts": len(SENDERS),
        "campaigns": 1 + len(read_ui_campaigns()),
        "processed": campaign["processed"],
        "remaining": campaign["remaining"],
        "totalTargets": campaign["totalTargets"],
        "maxConcurrentSenders": MAX_CONCURRENT_SENDERS,
        # The API does not supervise the Telegram worker process.
        "workerStatus": "Не отслеживается",
        # API audit events are not worker target-processing events.
        "todayCount": None,
        "lastExecution": None,
    }


# ==========================================
# ACCOUNTS
# ==========================================


# --- ACCOUNT SYNC: manual, sequential, read-only Telegram inspection ---
_account_sync_lock = asyncio.Lock()


async def _sync_one_account(sender: str) -> dict:
    """Check a pre-existing session. Never create a new session or alter a profile."""
    from datetime import datetime, timezone

    checked_at = datetime.now(timezone.utc).isoformat()
    session_file = Path(SESSIONS_DIR) / f"{sender}.session"
    previous = read_account_verification(sender)

    def persist(status: str, authorized=None, error=None, identity=None):
        record = dict(previous)
        record.update({"status": status, "checkedAt": checked_at})
        if authorized is not None:
            record["authorized"] = authorized
        if error:
            record["lastCheckError"] = error
        else:
            record.pop("lastCheckError", None)
        if identity:
            record.update(identity)
        save_account_verification(sender, record)
        return {"sender": sender, "status": status, "checkedAt": checked_at,
                "username": record.get("username", ""), "error": error}

    if not session_file.is_file():
        return persist("Сессия отсутствует", authorized=False, error="Session file missing")

    client = None
    try:
        # The sender-specific proxy and session are configured by create_client.
        client = create_client(sender)
        await asyncio.wait_for(client.connect(), timeout=20)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=20)
        if not authorized:
            return persist("Не авторизован", authorized=False)
        me = await asyncio.wait_for(client.get_me(), timeout=20)
        return persist("Активен", authorized=True, identity={
            "telegramId": me.id,
            "username": me.username or "",
            "firstName": me.first_name or "",
            "lastName": me.last_name or "",
        })
    except Exception as exc:
        # A connection failure does not prove the session is unauthorized.
        return persist("Ошибка подключения", error=type(exc).__name__)
    finally:
        if client is not None:
            try:
                await asyncio.wait_for(client.disconnect(), timeout=10)
            except Exception:
                pass


@app.post("/api/accounts/sync", dependencies=[Depends(get_current_user)])
async def sync_accounts():
    if _account_sync_lock.locked():
        raise HTTPException(status_code=409, detail="Синхронизация уже выполняется")
    async with _account_sync_lock:
        results = []
        # Sequential checks avoid simultaneous Telegram connections.
        for sender in dict.fromkeys([*SENDERS, TEST_SENDER, *(item['id'] for item in _added_accounts())]):
            result = await _sync_one_account(sender)
            results.append(result)
            _audit("SUCCESS" if result["status"] == "Активен" else "WARNING", "Проверка Telegram-сессии", result["status"], sender)
        return {"results": results, "accounts": get_accounts_data()}

# --- END ACCOUNT SYNC ---

@app.get("/api/accounts", dependencies=[Depends(get_current_user)])
async def accounts():
    return get_accounts_data()


@app.get("/api/accounts/{sender}", dependencies=[Depends(get_current_user)])
async def account_detail(sender: str):
    accounts = get_accounts_data()

    for account in accounts:
        if account["id"] == sender:
            return account

    raise HTTPException(
        status_code=404,
        detail="Account not found",
    )

@app.get(
    "/api/accounts/{sender}/appearance",
    dependencies=[Depends(get_current_user)],
)
async def get_account_appearance(sender: str):
    return read_appearance(sender)


@app.put(
    "/api/accounts/{sender}/appearance",
    dependencies=[Depends(get_current_user)],
)
async def update_account_appearance(
    sender: str,
    appearance: AccountAppearance,
):
    require_profile_sender(sender)

    try:
        result = await apply_test_profile(sender, appearance)

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Не удалось применить изменения к Telegram: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    saved = save_appearance(sender, appearance)
    from datetime import datetime, timezone
    verification = read_account_verification(sender)
    verification.update({
        **result.get("telegramIdentity", {}),
        "authorized": True,
        "status": "Активен",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    })
    verification.pop("lastCheckError", None)
    save_account_verification(sender, verification)

    return {
        **saved,
        "telegram": result,
    }

@app.get(
    "/api/accounts/{sender}/telegram/status",
    dependencies=[Depends(get_current_user)],
)
async def telegram_account_status(sender: str):
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    from datetime import datetime, timezone
    try:
        result = await check_test_telegram_session(sender)
    except HTTPException:
        # Connection failures do not prove that authorization is invalid.
        raise
    save_account_verification(sender, {
        "authorized": bool(result.get("authorized")),
        "status": "Активен" if result.get("authorized") else "Не авторизован",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    })
    return result

@app.get(
    "/api/accounts/{sender}/avatar",
    dependencies=[Depends(get_current_user)],
)
async def get_account_avatar(sender: str):
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    path = profile_avatar_path(sender)

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Аватарка не найдена",
        )

    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
        },
    )

@app.post(
    "/api/accounts/{sender}/avatar",
    dependencies=[Depends(get_current_user)],
)
async def upload_account_avatar(
    sender: str,
    file: UploadFile = File(...),
):
    require_profile_sender(sender)

    if file.content_type not in (
        "image/jpeg",
        "image/png",
        "image/webp",
    ):
        raise HTTPException(
            status_code=415,
            detail="Разрешены только JPG, PNG и WEBP",
        )

    content = await file.read(MAX_AVATAR_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=422,
            detail="Файл изображения пустой",
        )

    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Максимальный размер изображения — 5 МБ",
        )

    destination = profile_avatar_path(sender)

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destination.parent,
            suffix=".jpg",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)

        try:
            with Image.open(temporary_path) as image:
                image = image.convert("RGB")
                image.thumbnail((1024, 1024))

                image.save(
                    temporary_path,
                    format="JPEG",
                    quality=90,
                )

        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="Не удалось обработать изображение",
            ) from exc

        result = await apply_test_avatar(sender, temporary_path)

        os.replace(
            temporary_path,
            destination,
        )

        return {
            "ok": True,
            "telegram": result,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Ошибка установки аватарки: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


# ==========================================
# TEST CHANNEL
# ==========================================

def channel_file(sender: str, name: str) -> Path:
    folder = appearance_path(sender).parent
    folder.mkdir(parents=True, exist_ok=True)
    return folder / name


def read_channel_state(sender: str) -> dict:
    path = channel_file(sender, CHANNEL_STATE_NAME)

    if not path.exists():
        return {
            "channelId": None,
            "accessHash": None,
            "username": "",
            "posted": False,
            "pinned": False,
        }

    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось прочитать состояние канала",
        ) from exc


def save_channel_state(sender: str, state: dict):
    path = channel_file(sender, CHANNEL_STATE_NAME)
    temporary = path.with_suffix(".tmp")

    try:
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(
                state,
                file,
                ensure_ascii=False,
                indent=2,
            )

        os.replace(temporary, path)

    finally:
        temporary.unlink(missing_ok=True)


def require_test_sender(sender: str):
    require_profile_sender(sender)


async def connect_test_sender(sender: str):
    require_profile_sender(sender)
    session_path = Path(SESSIONS_DIR) / f"{sender}.session"

    if not session_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="sender_test.session не найдена",
        )

    client = create_client(sender)

    await asyncio.wait_for(client.connect(), timeout=20)

    if not await asyncio.wait_for(
        client.is_user_authorized(),
        timeout=20,
    ):
        await client.disconnect()

        raise HTTPException(
            status_code=409,
            detail="sender_test не авторизован",
        )

    return client


@app.get(
    "/api/accounts/{sender}/channel",
    dependencies=[Depends(get_current_user)],
)
async def get_channel(sender: str):
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    return read_channel_state(sender)

@app.get(
    "/api/accounts/{sender}/channel/assets/{kind}",
    dependencies=[Depends(get_current_user)],
)
async def get_channel_asset(sender: str, kind: str):
    if not is_known_sender(sender):
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if kind not in ("avatar", "post"):
        raise HTTPException(
            status_code=404,
            detail="Неизвестный тип изображения",
        )

    filename = (
        CHANNEL_AVATAR_NAME
        if kind == "avatar"
        else CHANNEL_POST_IMAGE_NAME
    )

    path = channel_file(sender, filename)

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Изображение не найдено",
        )

    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )

@app.post(
    "/api/accounts/{sender}/channel/assets/{kind}",
    dependencies=[Depends(get_current_user)],
)
async def upload_channel_asset(
    sender: str,
    kind: str,
    file: UploadFile = File(...),
):
    require_test_sender(sender)

    if kind not in ("avatar", "post"):
        raise HTTPException(
            status_code=404,
            detail="Неизвестный тип изображения",
        )

    if file.content_type not in (
        "image/jpeg",
        "image/png",
        "image/webp",
    ):
        raise HTTPException(
            status_code=415,
            detail="Допустимы JPG, PNG и WEBP",
        )

    content = await file.read(MAX_AVATAR_SIZE + 1)

    if not content or len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Размер изображения должен быть не больше 5 МБ",
        )

    filename = (
        CHANNEL_AVATAR_NAME
        if kind == "avatar"
        else CHANNEL_POST_IMAGE_NAME
    )

    destination = channel_file(sender, filename)
    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent,
            suffix=".jpg",
            delete=False,
        ) as temp:
            temp.write(content)
            temporary = Path(temp.name)

        try:
            with Image.open(temporary) as image:
                image = image.convert("RGB")
                image.thumbnail((1024, 1024))
                image.save(
                    temporary,
                    format="JPEG",
                    quality=90,
                )

        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="Некорректное изображение",
            ) from exc

        os.replace(temporary, destination)

        return {
            "ok": True,
            "kind": kind,
        }

    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@app.post(
    "/api/accounts/{sender}/channel/create",
    dependencies=[Depends(get_current_user)],
)
async def create_channel(sender: str):
    require_test_sender(sender)

    appearance = AccountAppearance.model_validate(
        read_appearance(sender)
    )

    title = appearance.channelTitle.strip()
    username = appearance.channelUsername.strip().lstrip("@")
    about = appearance.channelBio.strip()
    post_text = appearance.postText.strip()

    if not title:
        raise HTTPException(
            status_code=422,
            detail="Укажи название канала",
        )

    if not post_text and not read_channel_state(sender).get("posted"):
        raise HTTPException(
            status_code=422,
            detail="Укажи текст первого поста",
        )

    state = read_channel_state(sender)
    client = await connect_test_sender(sender)

    try:
        if state.get("channelId"):
            channel = types.InputChannel(
                channel_id=int(state["channelId"]),
                access_hash=int(state["accessHash"]),
            )

            await client.get_entity(channel)
            # Edit the existing channel; never recreate it.
            await client(functions.channels.EditTitleRequest(channel=channel, title=title))
            await client(functions.channels.EditAboutRequest(channel=channel, about=about))

        else:
            result = await client(
                functions.channels.CreateChannelRequest(
                    title=title,
                    about=about,
                    broadcast=True,
                    megagroup=False,
                )
            )

            created = next(
                (
                    chat
                    for chat in result.chats
                    if isinstance(chat, types.Channel)
                ),
                None,
            )

            if created is None:
                raise HTTPException(
                    status_code=502,
                    detail="Telegram не вернул созданный канал",
                )

            channel = types.InputChannel(
                channel_id=created.id,
                access_hash=created.access_hash,
            )

            state = {
                "channelId": created.id,
                "accessHash": created.access_hash,
                "username": "",
                "posted": False,
                "pinned": False,
            }

            # Сохраняем ID сразу после создания,
            # чтобы повторный запрос не создал дубликат.
            save_channel_state(sender, state)

        if state.get("username", "") != username:
            await client(
                functions.channels.UpdateUsernameRequest(
                    channel=channel,
                    username=username,
                )
            )

            state["username"] = username
            save_channel_state(sender, state)

        avatar = channel_file(sender, CHANNEL_AVATAR_NAME)

        import hashlib
        avatar_digest = hashlib.sha256(avatar.read_bytes()).hexdigest() if avatar.is_file() else None
        if avatar_digest and state.get("avatarSha256") != avatar_digest:
            uploaded = await client.upload_file(str(avatar))

            photo_result = await client(
                functions.channels.EditPhotoRequest(
                    channel=channel,
                    photo=types.InputChatUploadedPhoto(
                        file=uploaded,
                    ),
                )
            )

            state["avatarApplied"] = True
            state["avatarSha256"] = avatar_digest
            save_channel_state(sender, state)

            photo_service_ids = [
                update.message.id
                for update in getattr(photo_result, "updates", [])
                if isinstance(
                    update,
                    (
                        types.UpdateNewChannelMessage,
                        types.UpdateNewMessage,
                    ),
                )
                and isinstance(update.message, types.MessageService)
                and isinstance(
                    update.message.action,
                    types.MessageActionChatEditPhoto,
                )
            ]

            if photo_service_ids:
                try:
                    await client.delete_messages(
                        channel,
                        photo_service_ids,
                    )
                except RPCError:
                    pass

        if not state.get("posted"):
            action_text = appearance.actionText.strip()
            action_url = appearance.actionUrl.strip()

            body = post_text

            # Не добавляем вторую ссылку,
            # если HTML-ссылка уже есть в тексте.
            has_html_link = bool(
                re.search(
                    r"<a\s+href=",
                    body,
                    re.IGNORECASE,
                )
            )

            if action_text and action_url and not has_html_link:
                if not action_url.startswith(
                    ("https://", "http://")
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Action-ссылка должна начинаться с https://",
                    )

                body += (
                    '\n\n➡️ <b><a href="'
                    + escape(action_url, quote=True)
                    + '">'
                    + escape(action_text)
                    + "</a></b> ⬅️"
                )

            image = channel_file(sender, CHANNEL_POST_IMAGE_NAME)

            if image.is_file():
                await client.send_file(
                    channel,
                    str(image),
                    caption=body,
                    parse_mode="html",
                )

            else:
                await client.send_message(
                    channel,
                    body,
                    parse_mode="html",
                )

            state["posted"] = True
            save_channel_state(sender, state)

        return {
            "ok": True,
            **state,
        }

    except HTTPException:
        raise

    except RPCError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram: {type(exc).__name__}: {exc}",
        ) from exc

    finally:
        await client.disconnect()


@app.post(
    "/api/accounts/{sender}/channel/pin",
    dependencies=[Depends(get_current_user)],
)
async def pin_channel_to_profile(sender: str):
    require_test_sender(sender)

    state = read_channel_state(sender)

    if not state.get("channelId"):
        raise HTTPException(
            status_code=409,
            detail="Сначала создай канал",
        )

    request_class = getattr(
        functions.account,
        "UpdatePersonalChannelRequest",
        None,
    )

    if request_class is None:
        raise HTTPException(
            status_code=501,
            detail=(
                "Установленная версия Telethon не поддерживает "
                "account.updatePersonalChannel"
            ),
        )

    client = await connect_test_sender(sender)

    try:
        channel = types.InputChannel(
            channel_id=int(state["channelId"]),
            access_hash=int(state["accessHash"]),
        )

        await client(
            request_class(channel=channel)
        )

        state["pinned"] = True
        save_channel_state(sender, state)

        return {
            "ok": True,
            **state,
        }

    except RPCError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Telegram: {type(exc).__name__}: {exc}",
        ) from exc

    finally:
        await client.disconnect()

class _LogoutConfirmation(BaseModel):
    confirmation: str


@app.post(
    "/api/accounts/{sender}/telegram/logout",
    dependencies=[Depends(get_current_user)],
)
async def terminate_account_session(sender: str, payload: _LogoutConfirmation):
    require_profile_sender(sender)  # also blocks all Migration senders
    if payload.confirmation != sender:
        raise HTTPException(status_code=422, detail="Для подтверждения введи точное имя аккаунта")
    # Avoid racing with pending phone logins for the same sender.
    async with _ADD_LOCK:
        session_path = Path(SESSIONS_DIR) / f"{sender}.session"
        if not session_path.is_file():
            raise HTTPException(status_code=409, detail="Файл сессии отсутствует")
        client = create_client(sender)
        try:
            await asyncio.wait_for(client.connect(), timeout=20)
            if not await asyncio.wait_for(client.is_user_authorized(), timeout=20):
                raise HTTPException(status_code=409, detail="Сессия уже не авторизована")
            # Telethon log_out revokes this authorization on Telegram and may
            # remove its own local session file. Other authorizations untouched.
            await asyncio.wait_for(client.log_out(), timeout=30)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Не удалось завершить сессию: {type(exc).__name__}: {exc}") from exc
        finally:
            try:
                await client.disconnect()
            except Exception:
                pass
        verification = read_account_verification(sender)
        verification.update({"authorized": False, "status": "Не авторизован", "username": "", "hiddenAfterLogout": True})
        save_account_verification(sender, verification)
        return {"ok": True, "sender": sender, "status": "Не авторизован"}


# ==========================================
# USER CAMPAIGNS
# ==========================================

from src.campaign_progress import merged_targets, read_progress

CAMPAIGNS_FILE = Path(DATA_DIR) / "ui_campaigns.json"


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    senderIds: list[str] = Field(default_factory=list)
    targets: list[str] = Field(default_factory=list, max_length=10000)


def read_ui_campaigns() -> list[dict]:
    try:
        with CAMPAIGNS_FILE.open("r", encoding="utf-8") as file:
            campaigns = json.load(file)

    except FileNotFoundError:
        return []

    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось прочитать кампании",
        ) from exc

    if not isinstance(campaigns, list):
        raise HTTPException(
            status_code=500,
            detail="Некорректный формат кампаний",
        )

    return campaigns


def save_ui_campaigns(campaigns: list[dict]) -> None:
    CAMPAIGNS_FILE.parent.mkdir(parents=True, exist_ok=True)

    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=CAMPAIGNS_FILE.parent,
            prefix=".ui-campaigns-",
            suffix=".tmp",
            delete=False,
        ) as file:
            temporary = Path(file.name)

            json.dump(
                campaigns,
                file,
                ensure_ascii=False,
                indent=2,
            )

        os.replace(temporary, CAMPAIGNS_FILE)

    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def campaign_view(campaign: dict) -> dict:
    targets = merged_targets(campaign)

    total = len(targets)

    processed = sum(
        target.get("status") == "Отмечен"
        for target in targets
    )

    return {
        "id": campaign["id"],
        "name": campaign["name"],
        "status": campaign.get("status", "Черновик"),
        "senderIds": campaign["senderIds"],
        "totalTargets": total,
        "processed": processed,
        "remaining": total - processed,
    }

@app.post(
    "/api/campaigns",
    status_code=201,
    dependencies=[Depends(get_current_user)],
)
async def create_ui_campaign(payload: CampaignCreate):
    import uuid

    name = payload.name.strip()

    if not name:
        raise HTTPException(
            status_code=422,
            detail="Название не может быть пустым",
        )

    senders = list(dict.fromkeys(payload.senderIds))

    if not senders:
        raise HTTPException(
            status_code=422,
            detail="Выбери хотя бы один аккаунт",
        )

    usernames = []
    seen = set()

    for raw in payload.targets:
        username = normalize_username(raw)

        if not re.fullmatch(r"[a-zA-Z0-9_]{5,32}", username):
            raise HTTPException(
                status_code=422,
                detail=f"Некорректный username: {raw}",
            )

        if username not in seen:
            usernames.append(username)
            seen.add(username)

    invalid = [
        sender
        for sender in senders
        if not is_known_sender(sender)
    ]

    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Неизвестные аккаунты: {', '.join(invalid)}",
        )

    campaign = {
        "id": uuid.uuid4().hex,
        "name": name,
        "senderIds": senders,
        "status": "Черновик",
        "targets": [

            {
                "username": f"@{username}",
                "sender": senders[index % len(senders)],
                "status": "Ожидает",
                "error": None,
            }

            for index, username in enumerate(usernames)
        ],
    }

    campaigns = read_ui_campaigns()
    campaigns.append(campaign)

    save_ui_campaigns(campaigns)
    _audit("SUCCESS", "Создан черновик кампании", name)

    return campaign_view(campaign)

# ==========================================
# CAMPAIGNS
# ==========================================

class CampaignAddSender(BaseModel):
    senderId: str


@app.post("/api/campaigns/{campaign_id}/accounts", dependencies=[Depends(get_current_user)])
async def add_sender_to_campaign(campaign_id: str, payload: CampaignAddSender):
    """Draft campaign only. Never change Migration snapshot or live worker."""
    if campaign_id == "migration":
        raise HTTPException(status_code=409, detail="Migration использует снимок Railway. Сначала нужна безопасная синхронизация с рабочим состоянием; назначение отключено.")
    sender = payload.senderId.strip()
    if not is_known_sender(sender):
        raise HTTPException(status_code=422, detail="Аккаунт не найден")
    if sender in SENDERS:
        raise HTTPException(status_code=409, detail="Аккаунт закреплён за Migration")
    campaigns = read_ui_campaigns()
    selected = next((c for c in campaigns if c.get("id") == campaign_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    if selected.get("status") not in ("Черновик", "Остановлена"):
        raise HTTPException(status_code=409, detail="Останови кампанию перед изменением аккаунтов")
    if any(sender in c.get("senderIds", []) for c in campaigns):
        raise HTTPException(status_code=409, detail="Аккаунт уже назначен другой кампании")
    if sender in selected.get("senderIds", []):
        raise HTTPException(status_code=409, detail="Аккаунт уже назначен")
    updated_senders = list(selected.get("senderIds", [])) + [sender]
    # Preserve processed records; only waiting targets may change sender.
    done = {normalize_username(t["username"]) for t in merged_targets(selected) if t.get("status") == "Отмечен"}
    pending = [t for t in selected.get("targets", []) if normalize_username(t.get("username")) not in done]
    for i, target in enumerate(pending):
        target["sender"] = updated_senders[i % len(updated_senders)]
    selected["senderIds"] = updated_senders
    save_ui_campaigns(campaigns)
    return campaign_view(selected)


@app.get("/api/campaigns", dependencies=[Depends(get_current_user)])

async def campaigns():
    return [
        get_campaign_data(),
        *(
            campaign_view(campaign)
            for campaign in read_ui_campaigns()
        ),
    ]


@app.get(
    "/api/campaigns/{campaign_id}",
    dependencies=[Depends(get_current_user)],
)
async def campaign_detail(campaign_id: str):
    if campaign_id == "migration":
        return get_campaign_data()

    for campaign in read_ui_campaigns():
        if campaign.get("id") == campaign_id:
            return campaign_view(campaign)

    raise HTTPException(
        status_code=404,
        detail="Campaign not found",
    )

@app.get(
    "/api/campaigns/{campaign_id}/accounts",
    dependencies=[Depends(get_current_user)],
)
async def campaign_accounts(campaign_id: str):
    if campaign_id == "migration":
        return get_accounts_data()

    campaign = next(
        (
            item
            for item in read_ui_campaigns()
            if item.get("id") == campaign_id
        ),
        None,
    )

    if campaign is None:
        raise HTTPException(
            status_code=404,
            detail="Campaign not found",
        )

    targets = merged_targets(campaign)
    result = []

    for sender in campaign.get("senderIds", []):
        assigned = [
            target
            for target in targets
            if target.get("sender") == sender
        ]

        completed = sum(
            target.get("status") == "Отмечен"
            for target in assigned
        )

        result.append({
            "id": sender,
            "name": sender,
            "assigned": len(assigned),
            "completed": completed,
            "remaining": len(assigned) - completed,
            "dailyLimit": TARGETS_PER_SENDER_PER_DAY,
            "status": "Не проверен",
        })

    return result

class CampaignStatusUpdate(BaseModel):
    status: str


@app.post(
    "/api/campaigns/{campaign_id}/status",
    dependencies=[Depends(get_current_user)],
)
async def update_campaign_status(
    campaign_id: str,
    payload: CampaignStatusUpdate,
):
    if campaign_id == "migration":
        raise HTTPException(
            status_code=403,
            detail="Управление migration через UI запрещено",
        )

    allowed = {
        "Черновик",
        "Готова",
        "Остановлена",
    }

    if payload.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail="Недопустимый статус",
        )

    campaigns = read_ui_campaigns()

    campaign = next(
        (
            item
            for item in campaigns
            if item.get("id") == campaign_id
        ),
        None,
    )

    if campaign is None:
        raise HTTPException(
            status_code=404,
            detail="Campaign not found",
        )

    campaign["status"] = payload.status

    save_ui_campaigns(campaigns)
    _audit("INFO", "Изменён статус кампании", f"{campaign_id}: {payload.status}")

    return campaign_view(campaign)

# ==========================================
# CAMPAIGN PREFLIGHT
# ==========================================

@app.get(
    "/api/campaigns/{campaign_id}/preflight",
    dependencies=[Depends(get_current_user)],
)
async def campaign_preflight(campaign_id: str):
    if campaign_id == "migration":
        raise HTTPException(403, "Migration недоступна")

    campaign = next(
        (c for c in read_ui_campaigns() if c["id"] == campaign_id),
        None,
    )

    if campaign is None:
        raise HTTPException(404, "Кампания не найдена")

    errors = []
    warnings = []
    senders = campaign.get("senderIds", [])
    targets = campaign.get("targets", [])

    if not senders:
        errors.append("Нет аккаунтов")

    if not targets:
        errors.append("Нет таргетов")

    accounts = []

    for sender in senders:
        session_exists = (
            Path(SESSIONS_DIR) / f"{sender}.session"
        ).is_file()

        config = get_sender_configuration(sender)

        if not session_exists:
            errors.append(f"Сессия не найдена: {sender}")

        if not config["proxyConfigured"]:
            warnings.append(f"Прокси не настроен: {sender}")

        if not config["storyTemplate"]:
            errors.append(f"Нет шаблона Stories: {sender}")

        accounts.append({
            "sender": sender,
            "sessionExists": session_exists,
            "proxyConfigured": config["proxyConfigured"],
            "storyTemplateConfigured": bool(config["storyTemplate"]),
            "assigned": sum(
                t["sender"] == sender for t in targets
            ),
        })

    for target in targets:
        if target["sender"] not in senders:
            errors.append(
                f"Не назначен аккаунт: {target['username']}"
            )

    return {
        "ok": not errors,
        "mode": "PREFLIGHT",
        "telegramRequests": 0,
        "totalTargets": len(targets),
        "senders": accounts,
        "errors": errors,
        "warnings": warnings,
    }

# ==========================================
# WORKER CHECK
# ==========================================

@app.post(
    "/api/campaigns/{campaign_id}/worker/check",
    dependencies=[Depends(get_current_user)],
)
async def check_campaign_worker(campaign_id: str):
    import inspect
    import main as worker

    if campaign_id == "migration":
        raise HTTPException(
            status_code=403,
            detail="Migration недоступна",
        )

    campaign = next(
        (
            item
            for item in read_ui_campaigns()
            if item.get("id") == campaign_id
        ),
        None,
    )

    if campaign is None:
        raise HTTPException(
            status_code=404,
            detail="Кампания не найдена",
        )

    if campaign.get("senderIds") != ["sender_test"]:
        raise HTTPException(
            status_code=409,
            detail="Проверка доступна только для sender_test",
        )

    # Проверяем, что обработчик поддерживает
    # параметры конкретной кампании.
    parameters = inspect.signature(
        worker.run_sender
    ).parameters

    required = {"dry_run", "target_usernames"}

    if not required.issubset(parameters):
        raise HTTPException(
            status_code=409,
            detail="run_sender не поддерживает параметры кампании",
        )

    # Запрещаем выполнение при выключенном DRY_RUN.
    if DRY_RUN is not True or worker.DRY_RUN is not True:
        raise HTTPException(
            status_code=409,
            detail="Для проверки необходимо включить DRY_RUN",
        )

    # Проверяем конфигурацию кампании.
    preflight = await campaign_preflight(campaign_id)

    if not preflight["ok"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Кампания не готова",
                "errors": preflight["errors"],
            },
        )

    usernames = [
        normalize_username(target.get("username"))
        for target in campaign.get("targets", [])
    ]

    if not usernames:
        raise HTTPException(
            status_code=409,
            detail="Нет таргетов",
        )

    return {
        "ok": True,
        "mode": "DRY_RUN",
        "sender": "sender_test",
        "totalTargets": len(usernames),
        "targets": usernames,
        "workerReady": True,
        "workerExecuted": False,
        "telegramRequests": 0,
    }

# ==========================================
# CAMPAIGN DRY RUN
# ==========================================

@app.post(
    "/api/campaigns/{campaign_id}/worker/dry-run",
    dependencies=[Depends(get_current_user)],
)
async def run_campaign_dry_run(campaign_id: str):
    """Offline queue preview: never connect to Telegram or run a worker."""
    if campaign_id == "migration":
        raise HTTPException(status_code=403, detail="Migration недоступна")

    campaign = next(
        (item for item in read_ui_campaigns() if item.get("id") == campaign_id),
        None,
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    if DRY_RUN is not True:
        raise HTTPException(status_code=409, detail="DRY_RUN выключен в конфигурации сервера")

    from src.campaign_executor import reconcile

    queue = reconcile(campaign)
    return {
        "ok": True,
        "mode": "DRY_RUN",
        "workerExecuted": False,
        "telegramRequests": 0,
        "storiesPublished": 0,
        "targetsMarkedCompleted": 0,
        "campaignId": campaign_id,
        "queue": queue,
        "note": "No Telegram calls. Pending remains pending; uncertain requires manual reconciliation.",
    }

# ==========================================
# TARGETS
# ==========================================

@app.get("/api/campaigns/{campaign_id}/targets", dependencies=[Depends(get_current_user)])
async def campaign_targets(campaign_id: str):
    if campaign_id != "migration":
        campaign = next(
            (
                item
                for item in read_ui_campaigns()
                if item.get("id") == campaign_id
            ),
            None,
        )

        if campaign is None:
            raise HTTPException(
                status_code=404,
                detail="Campaign not found",
            )

        return [
            {
                "id": f"{campaign_id}:{index}",
                **target,
            }
            for index, target in enumerate(
                merged_targets(campaign)
            )
        ]

    assignments, processed = migration_snapshot_data()

    result = []

    for sender in SENDERS:
        targets = assignments.get(sender, [])

        for target in targets:
            username = normalize_username(target)

            if not username:
                continue

            result.append({
                "id": f"{sender}:{username}",
                "username": f"@{username}",
                "sender": sender,
                "status": (
                    "Отмечен"
                    if username in processed
                    else "Ожидает"
                ),
                "error": None,
            })

    return result


# ==========================================
# SETTINGS
# ==========================================

SETTINGS_FILE = Path(DATA_DIR) / "ui_settings.json"


class ExecutionSettings(BaseModel):
    TARGETS_PER_SENDER_PER_DAY: int = Field(ge=1)
    TARGETS_PER_STORY_MIN: int = Field(ge=1)
    TARGETS_PER_STORY_MAX: int = Field(ge=1)
    STORY_INTERVAL_MIN_SECONDS: int = Field(ge=0)
    STORY_INTERVAL_MAX_SECONDS: int = Field(ge=0)
    INTERACTION_STORY_DELAY: int = Field(ge=0)


def execution_values():
    defaults = {
        "TARGETS_PER_SENDER_PER_DAY": TARGETS_PER_SENDER_PER_DAY,
        "TARGETS_PER_STORY_MIN": TARGETS_PER_STORY_MIN,
        "TARGETS_PER_STORY_MAX": TARGETS_PER_STORY_MAX,
        "STORY_INTERVAL_MIN_SECONDS": STORY_INTERVAL_MIN_SECONDS,
        "STORY_INTERVAL_MAX_SECONDS": STORY_INTERVAL_MAX_SECONDS,
        "INTERACTION_STORY_DELAY": INTERACTION_STORY_DELAY,
    }
    stored = read_json("ui_settings.json", default={})
    if not isinstance(stored, dict) or not isinstance(stored.get("execution", {}), dict):
        raise HTTPException(status_code=500, detail="Некорректный формат настроек")
    try:
        values = ExecutionSettings.model_validate({
            **defaults, **stored.get("execution", {})
        }).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Некорректные сохранённые настройки") from exc
    if (values["TARGETS_PER_STORY_MIN"] > values["TARGETS_PER_STORY_MAX"]
            or values["STORY_INTERVAL_MIN_SECONDS"] > values["STORY_INTERVAL_MAX_SECONDS"]):
        raise HTTPException(status_code=500, detail="Некорректные диапазоны настроек")
    return values


@app.put("/api/settings", dependencies=[Depends(get_current_user)])
async def update_settings(payload: ExecutionSettings):
    values = payload.model_dump()
    if (values["TARGETS_PER_STORY_MIN"] > values["TARGETS_PER_STORY_MAX"]
            or values["STORY_INTERVAL_MIN_SECONDS"] > values["STORY_INTERVAL_MAX_SECONDS"]):
        raise HTTPException(status_code=422, detail="Минимум диапазона больше максимума")
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=SETTINGS_FILE.parent,
            prefix=".ui-settings-", suffix=".tmp", delete=False,
        ) as file:
            temporary = Path(file.name)
            existing = read_json("ui_settings.json", default={}) or {}
            if not isinstance(existing, dict):
                existing = {}
            json.dump({**existing, "execution": values}, file, ensure_ascii=False, indent=2)
        os.replace(temporary, SETTINGS_FILE)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return await settings()


# Settings entered in the UI are staged, not applied to an already running worker.
# The process's effective Telegram credentials and DRY_RUN remain in config.py/.env.
from typing import Literal
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

class TelegramConfigUpdate(BaseModel):
    requested_mode: Literal["DRY_RUN", "PRODUCTION"]
    api_id: str | None = None
    api_hash: str | None = None
    bot_token: str | None = None
    chat_id: str | None = None


def _private_config():
    path = Path(DATA_DIR) / "ui_telegram_config.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        if not isinstance(data, dict):
            raise ValueError("Invalid settings")
        return data
    except (OSError, ValueError) as exc:
        raise HTTPException(500, "Не удалось прочитать настройки подключения") from exc


def _store_private_config(data):
    path = Path(DATA_DIR) / "ui_telegram_config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".telegram-config-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False)
        os.replace(name, path)
        os.chmod(path, 0o600)
    finally:
        Path(name).unlink(missing_ok=True)


@app.get("/api/settings/telegram", dependencies=[Depends(get_current_user)])
async def get_telegram_config():
    from config import API_ID as configured_id, API_HASH as configured_hash
    data = _private_config()
    return {
        "requested_mode": data.get("requested_mode", "DRY_RUN" if DRY_RUN else "PRODUCTION"),
        "effective_mode": "DRY_RUN" if DRY_RUN else "PRODUCTION",
        "api_id": "<REDACTED>",
        "api_hash_set": bool(data.get("api_hash") or configured_hash),
        "bot_token_set": bool(data.get("bot_token") or os.getenv("LOG_BOT_TOKEN")),
        "chat_id": data.get("chat_id", os.getenv("LOG_CHAT_ID", "")),
        "pending_restart": bool(data.get("api_id") or data.get("api_hash") or data.get("requested_mode", "DRY_RUN") != ("DRY_RUN" if DRY_RUN else "PRODUCTION")),
        "note": "Режим и API-ключи сохранены как запрос. Они не переключают действующий worker; применение требует отдельного контролируемого перезапуска.",
    }


@app.put("/api/settings/telegram", dependencies=[Depends(get_current_user)])
async def save_telegram_config(payload: TelegramConfigUpdate):
    data = _private_config()
    data["requested_mode"] = payload.requested_mode
    if payload.api_id is not None:
        data["api_id"] = payload.api_id
    for key in ("api_hash", "bot_token"):
        value = getattr(payload, key)
        if value is not None and value.strip():
            data[key] = value.strip()
    if payload.chat_id is not None:
        data["chat_id"] = payload.chat_id.strip()
    _store_private_config(data)
    return await get_telegram_config()


@app.post("/api/settings/connection-test", dependencies=[Depends(get_current_user)])
async def test_log_bot():
    data = _private_config()
    token = data.get("bot_token") or os.getenv("LOG_BOT_TOKEN", "")
    chat = data.get("chat_id") or os.getenv("LOG_CHAT_ID", "")
    if not token or not chat:
        raise HTTPException(422, "Укажите Bot Token и Chat ID")
    import urllib.parse
    def send():
        body = urllib.parse.urlencode({"chat_id": chat, "text": "Tegger: тест подключения журнала событий"}).encode()
        req = Request("https://api.telegram.org/bot" + token + "/sendMessage", data=body, method="POST")
        with urlopen(req, timeout=12) as response:
            return json.loads(response.read())
    try:
        result = await asyncio.to_thread(send)
        if not result.get("ok"):
            raise ValueError("Telegram returned non-OK")
    except (URLError, HTTPError, ValueError, TimeoutError) as exc:
        # Never include Telegram's URL or exception string: it may contain the bot token.
        raise HTTPException(502, "Не удалось отправить тестовое сообщение. Проверьте Bot Token, Chat ID и доступ бота к чату.") from None
    return {"ok": True, "message": "Тестовое сообщение отправлено"}


@app.get("/api/settings", dependencies=[Depends(get_current_user)])
async def settings():
    values = execution_values()
    return {
        "general": {
            "DRY_RUN": DRY_RUN,
            "MAX_CONCURRENT_SENDERS": MAX_CONCURRENT_SENDERS,
        },
        "limits": {
            key: values[key]
            for key in ("TARGETS_PER_SENDER_PER_DAY", "TARGETS_PER_STORY_MIN", "TARGETS_PER_STORY_MAX")
        },
        "timings": {
            key: values[key]
            for key in ("STORY_INTERVAL_MIN_SECONDS", "STORY_INTERVAL_MAX_SECONDS", "INTERACTION_STORY_DELAY")
        },
    }


# ==========================================
# DRY_RUN CAMPAIGN SIMULATION MANAGER
# No Telegram calls, no sender state mutations.
# ==========================================

from datetime import datetime, timezone
from uuid import uuid4

SIMULATION_DIR = Path(DATA_DIR) / "ui_simulations"
_SIMULATION_TASKS = {}
_SIMULATION_LOCKS = {}
_SIMULATION_BOOT = uuid4().hex


def _simulation_path(campaign_id):
    # Campaign ids are UUID-like, but enforce a safe filename regardless.
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", campaign_id):
        raise HTTPException(422, "Недопустимый ID кампании")
    return SIMULATION_DIR / f"{campaign_id}.json"


def _simulation_read(campaign_id):
    path = _simulation_path(campaign_id)
    if not path.exists():
        return {"status": "idle", "completed": 0, "total": 0, "events": [], "telegramRequests": 0}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(500, "Не удалось прочитать состояние симуляции") from exc
    if data.get("status") == "running" and data.get("boot") != _SIMULATION_BOOT:
        data["status"] = "interrupted"
        _simulation_event(data, "API перезапущен; симуляция прервана")
        _simulation_write(campaign_id, data)
    return data


def _simulation_write(campaign_id, data):
    path = _simulation_path(campaign_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".simulation-", suffix=".tmp", delete=False) as stream:
            temp_path = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def _simulation_event(data, message):
    data.setdefault("events", []).append({
        "at": datetime.now(timezone.utc).isoformat(), "message": message,
    })
    data["events"] = data["events"][-100:]


def _simulation_campaign(campaign_id):
    # Simulation is isolated from the real Telegram worker and progress.
    if DRY_RUN is not True:
        raise HTTPException(409, "DRY_RUN выключен на сервере")
    if campaign_id == "migration":
        return get_campaign_data()  # Read-only snapshot; NOT live worker state.
    campaign = next((c for c in read_ui_campaigns() if c.get("id") == campaign_id), None)
    if campaign is None:
        raise HTTPException(404, "Кампания не найдена")
    if not campaign.get("senderIds"):
        raise HTTPException(409, "В кампании нет аккаунтов")
    return campaign


async def _simulation_loop(campaign_id):
    try:
        while True:
            await asyncio.sleep(1)
            data = _simulation_read(campaign_id)
            if data.get("status") != "running" or data.get("boot") != _SIMULATION_BOOT:
                return
            if data["completed"] >= data["total"]:
                data["status"] = "completed"
                _simulation_event(data, "Тестовое планирование завершено")
                _simulation_write(campaign_id, data)
                return
            data["completed"] += 1
            _simulation_event(data, f"Симуляция шага {data['completed']} из {data['total']}; Telegram: 0")
            if data["completed"] >= data["total"]:
                data["status"] = "completed"
                _simulation_event(data, "Тестовое планирование завершено")
            _simulation_write(campaign_id, data)
            if data["status"] == "completed":
                return
    except asyncio.CancelledError:
        return
    except Exception:
        data = _simulation_read(campaign_id)
        data["status"] = "failed"
        _simulation_event(data, "Ошибка выполнения тестовой симуляции")
        _simulation_write(campaign_id, data)


@app.get("/api/campaigns/{campaign_id}/simulation", dependencies=[Depends(get_current_user)])
async def get_campaign_simulation(campaign_id: str):
    _simulation_campaign(campaign_id)
    return _simulation_read(campaign_id)


@app.post("/api/campaigns/{campaign_id}/simulation/{action}", dependencies=[Depends(get_current_user)])
async def control_campaign_simulation(campaign_id: str, action: str):
    campaign = _simulation_campaign(campaign_id)
    if action not in {"start", "pause", "resume", "stop"}:
        raise HTTPException(422, "Неизвестное действие")
    lock = _SIMULATION_LOCKS.setdefault(campaign_id, asyncio.Lock())
    async with lock:
        data = _simulation_read(campaign_id)
        status = data["status"]
        if action == "start":
            if status in {"running", "paused"}:
                raise HTTPException(409, "Симуляция уже запущена")
            if campaign_id == "migration":
                # Snapshot only: never touch live Migration assignments/state.
                total = campaign["remaining"]
            else:
                total = sum(1 for t in merged_targets(campaign)
                            if t.get("status") != "Отмечен" and normalize_username(t.get("username")))
            if total <= 0:
                raise HTTPException(409, "Нет оставшихся целей для тестовой симуляции")
            data = {"status": "running", "completed": 0, "total": total,
                    "sender": "simulation-only", "telegramRequests": 0,
                    "boot": _SIMULATION_BOOT, "events": []}
            _simulation_event(data, "Запущена локальная симуляция (без Telegram)")
        elif action == "pause":
            if status != "running":
                raise HTTPException(409, "Пауза доступна только во время симуляции")
            data["status"] = "paused"
            _simulation_event(data, "Симуляция приостановлена")
        elif action == "resume":
            if status != "paused":
                raise HTTPException(409, "Продолжить можно только приостановленную симуляцию")
            data["status"] = "running"
            data["boot"] = _SIMULATION_BOOT
            _simulation_event(data, "Симуляция продолжена")
        else:
            if status not in {"running", "paused", "interrupted"}:
                raise HTTPException(409, "Нет активной симуляции")
            data["status"] = "stopped"
            _simulation_event(data, "Симуляция остановлена")
        _simulation_write(campaign_id, data)
        previous = _SIMULATION_TASKS.pop(campaign_id, None)
        if previous and not previous.done():
            previous.cancel()
        if data["status"] == "running":
            _SIMULATION_TASKS[campaign_id] = asyncio.create_task(_simulation_loop(campaign_id))
        return data



# ===== TEGGER PARSER API (isolated from campaigns and worker) =====
import csv as _parser_csv
import sys as _parser_sys
import uuid as _parser_uuid
from datetime import datetime as _parser_datetime, timezone as _parser_timezone
from pydantic import BaseModel as _ParserBaseModel

_parser_lock = asyncio.Lock()

class _ParserRunRequest(_ParserBaseModel):
    chat: str
    account: str
    historyDays: int = 30
    minActiveDays: int = 2
    activityFilter: str = "48h_recent"
    premium: str = "all"
    avatar: str = "all"
    username: str = "yes"

@app.get("/api/parser/accounts", dependencies=[Depends(get_current_user)])
async def parser_accounts():
    # Never use a sender participating in Migration for UI parsing.
    rows = get_accounts_data()
    return [
        {"id": a["id"], "name": a.get("name", a["id"]), "telegram": a.get("telegram", "")}
        for a in rows
        if a["id"] not in SENDERS
        and (Path(SESSIONS_DIR) / (a["id"] + ".session")).is_file()
        and a.get("session", False)
    ]

@app.post("/api/parser/run", dependencies=[Depends(get_current_user)])
async def parser_run(payload: _ParserRunRequest):
    chat = payload.chat.strip()
    if not chat or len(chat) > 250 or any(c in chat for c in "\r\n\x00"):
        raise HTTPException(422, "Укажи корректный чат")
    allowed = {a["id"] for a in await parser_accounts()}
    if payload.account not in allowed:
        raise HTTPException(403, "Выбранный аккаунт не имеет доступной сессии или защищён Migration")
    if not (1 <= payload.historyDays <= 365 and 1 <= payload.minActiveDays <= 365):
        raise HTTPException(422, "Недопустимый диапазон дней")
    activities = {"24h":"24h", "48h":"48h", "recent":"recently", "24h_recent":"24h_recently", "48h_recent":"48h_recently"}
    if payload.activityFilter not in activities or any(v not in ("all", "yes", "no") for v in (payload.premium, payload.avatar, payload.username)):
        raise HTTPException(422, "Недопустимые фильтры")
    if _parser_lock.locked():
        raise HTTPException(409, "Парсер уже выполняет другую задачу")
    parser_script = Path(__file__).resolve().parent / "parser.py"
    if not parser_script.is_file():
        raise HTTPException(503, "В backend отсутствует parser.py")
    async with _parser_lock:
        run_id = _parser_uuid.uuid4().hex
        relative_output = f"data/parser/ui_runs/{run_id}"
        output_dir = Path(__file__).resolve().parent / relative_output
        env = os.environ.copy()
        env.update({
            "PARSER_SESSION": payload.account,
            "PARSER_CHAT": chat,
            "PARSER_HISTORY_DAYS": str(payload.historyDays),
            "PARSER_MIN_ACTIVE_DAYS": str(payload.minActiveDays),
            "PARSER_ACTIVITY_FILTER": activities[payload.activityFilter],
            "PARSER_PREMIUM_FILTER": "any" if payload.premium == "all" else payload.premium,
            "PARSER_AVATAR_FILTER": "any" if payload.avatar == "all" else payload.avatar,
            "PARSER_REQUIRE_USERNAME": "no" if payload.username == "no" else "yes",
            "PARSER_OUTPUT_DIR": relative_output,
            "PYTHONUNBUFFERED": "1",
        })
        process = await asyncio.create_subprocess_exec(
            _parser_sys.executable, str(parser_script),
            cwd=str(parser_script.parent), env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            stdin=asyncio.subprocess.DEVNULL,
        )
        try:
            output, _ = await asyncio.wait_for(process.communicate(), timeout=600)
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            raise HTTPException(504, "Парсинг превысил 10 минут и остановлен")
        log = output.decode("utf-8", errors="replace")[-1800:]
        if process.returncode != 0:
            raise HTTPException(502, "Ошибка парсера: " + log[-700:])
        csv_files = sorted(output_dir.glob("*.csv"))
        if not csv_files:
            raise HTTPException(502, "Парсер не создал CSV. " + log[-400:])
        with csv_files[-1].open("r", encoding="utf-8-sig", newline="") as f:
            records = list(_parser_csv.DictReader(f))
        usernames = ["@" + r["username"].lstrip("@") for r in records if r.get("username")]
        return {
            "count": len(usernames), "totalScanned": len(records),
            "usernames": usernames, "chat": chat,
            "timestamp": _parser_datetime.now(_parser_timezone.utc).isoformat(),
            "csvFile": csv_files[-1].name,
            "note": "Просканировано: число строк результата после фильтров; исходное число сообщений см. в журнале parser.py",
        }
# ===== END TEGGER PARSER API =====


# ==========================================
# OFFLINE CAMPAIGN QUEUE — NO TELEGRAM CALLS
# ==========================================
@app.get("/api/campaigns/{campaign_id}/execution/queue", dependencies=[Depends(get_current_user)])
async def campaign_execution_queue(campaign_id: str):
    from src.campaign_executor import reconcile
    if campaign_id == "migration":
        raise HTTPException(status_code=403, detail="Migration недоступна")
    campaign = next((c for c in read_ui_campaigns() if c.get("id") == campaign_id), None)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        return {"campaignId": campaign_id, "queue": reconcile(campaign), "telegramRequests": 0}
    except (ValueError, OSError, _sqlite3.Error) as exc:
        raise HTTPException(status_code=409, detail=f"Очередь не синхронизирована: {type(exc).__name__}: {exc}") from exc


@app.post("/api/campaigns/{campaign_id}/execution/dry-run", dependencies=[Depends(get_current_user)])
async def campaign_execution_dry_run(campaign_id: str):
    from src.campaign_executor import dry_run
    if campaign_id == "migration":
        raise HTTPException(status_code=403, detail="Migration недоступна")
    campaign = next((c for c in read_ui_campaigns() if c.get("id") == campaign_id), None)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        return dry_run(campaign)
    except (ValueError, OSError, _sqlite3.Error) as exc:
        raise HTTPException(status_code=409, detail=f"DRY_RUN не выполнен: {type(exc).__name__}: {exc}") from exc


# TEGGER PERSISTENT WORKER FOUNDATION V1
# Deliberately does not publish Stories or alter Migration state.
# Uses durable state on DATA_DIR, survives browser closure and API restart.
from contextlib import asynccontextmanager as _worker_asynccontextmanager
from datetime import datetime as _worker_datetime, timezone as _worker_timezone
import fcntl as _worker_fcntl
import threading as _worker_threading
import time as _worker_time

_WORKER_CONTROL = Path(DATA_DIR) / "worker_control_v1.json"
_WORKER_LOCK = Path(DATA_DIR) / "worker_control_v1.lock"
_WORKER_MUTEX = _worker_threading.RLock()
_WORKER_STOP = _worker_threading.Event()
_WORKER_THREAD = None

def _worker_atomic_write(value):
    _WORKER_CONTROL.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".worker-", suffix=".tmp", dir=_WORKER_CONTROL.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, _WORKER_CONTROL)
    finally:
        Path(name).unlink(missing_ok=True)

def _worker_read():
    if not _WORKER_CONTROL.is_file():
        return {"status": "not_started", "campaignId": None, "telegramRequests": 0,
                "liveEnabled": False, "note": "Worker foundation installed; LIVE execution not connected."}
    return json.loads(_WORKER_CONTROL.read_text(encoding="utf-8"))

def _worker_loop():
    _WORKER_LOCK.parent.mkdir(parents=True, exist_ok=True)
    with _WORKER_LOCK.open('a+') as lock:
        try:
            _worker_fcntl.flock(lock.fileno(), _worker_fcntl.LOCK_EX | _worker_fcntl.LOCK_NB)
        except BlockingIOError:
            return
        from src import campaign_worker as _cw
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        task = None
        try:
            while not _WORKER_STOP.is_set():
                with _WORKER_MUTEX:
                    state = _worker_read()
                    state['heartbeatUTC'] = _worker_datetime.now(_worker_timezone.utc).isoformat()
                    state['status'] = 'standby'
                    state['liveEnabled'] = False
                    state['telegramRequests'] = 0
                    _worker_atomic_write(state)
                    job = _cw.read()
                if task is None or task.done():
                    if task is not None:
                        try:
                            task.result()
                        except Exception:
                            pass
                    task = None
                    if job.get('status') in ('running', 'stopping'):
                        task = loop.create_task(_cw.run(_WORKER_STOP))
                loop.run_until_complete(asyncio.sleep(1))
        finally:
            if task and not task.done():
                task.cancel()
                try:
                    loop.run_until_complete(task)
                except BaseException:
                    pass
            loop.close()

@app.on_event("startup")
async def _worker_foundation_start():
    global _WORKER_THREAD
    if _WORKER_THREAD is None or not _WORKER_THREAD.is_alive():
        _WORKER_STOP.clear()
        _WORKER_THREAD = _worker_threading.Thread(target=_worker_loop, name="tegger-worker-foundation", daemon=True)
        _WORKER_THREAD.start()

@app.on_event("shutdown")
async def _worker_foundation_stop():
    _WORKER_STOP.set()
    if _WORKER_THREAD is not None:
        _WORKER_THREAD.join(timeout=12)

@app.get("/api/worker/status", dependencies=[Depends(get_current_user)])
async def worker_foundation_status():
    state = _worker_read()
    heartbeat = state.get("heartbeatUTC")
    try:
        age = (_worker_datetime.now(_worker_timezone.utc) - _worker_datetime.fromisoformat(heartbeat)).total_seconds()
    except (TypeError, ValueError):
        age = None
    return {**state, "heartbeatAgeSeconds": age, "workerAlive": age is not None and age < 35}

@app.post("/api/worker/start/{campaign_id}", dependencies=[Depends(get_current_user)])
async def worker_foundation_start_campaign(campaign_id: str):
    raise HTTPException(status_code=409, detail="LIVE worker is not connected yet. No Telegram operation was started.")

@app.post("/api/worker/stop/{campaign_id}", dependencies=[Depends(get_current_user)])
async def worker_foundation_stop_campaign(campaign_id: str):
    raise HTTPException(status_code=409, detail="No LIVE campaign is managed by this worker foundation.")

# TEGGER OPT-IN CAMPAIGN WORKER V1
from src import campaign_worker as _cw

@app.get('/api/campaign-worker/status', dependencies=[Depends(get_current_user)])
async def campaign_worker_status():
    state = _cw.read()
    cid = state.get('campaignId')
    if cid:
        from src.campaign_executor import snapshot
        state['queue'] = snapshot(cid)
    return state

class _ConsentStart(BaseModel):
    consentConfirmed: bool = False

@app.post('/api/campaign-worker/start/{campaign_id}', dependencies=[Depends(get_current_user)])
async def campaign_worker_start(campaign_id: str, payload: _ConsentStart):
    if not payload.consentConfirmed:
        raise HTTPException(422, 'Подтверди согласие получателей')
    if not _WORKER_THREAD or not _WORKER_THREAD.is_alive():
        raise HTTPException(503, 'Worker heartbeat не работает')
    with _WORKER_MUTEX:
        state = _cw.read()
        if state.get('status') in ('running', 'stopping'):
            raise HTTPException(409, 'Другая кампания уже запущена')
        campaign = _cw.campaign_by_id(campaign_id)
        if campaign is None:
            raise HTTPException(404, 'Кампания не найдена')
        # Consent must be explicitly confirmed by the operator for this campaign.
        campaign['consentConfirmed'] = True
        try:
            _cw.check(campaign)
            from src.campaign_executor import reconcile
            reconcile(campaign)
        except Exception as exc:
            raise HTTPException(409, str(exc)) from exc
        # Consent marker is stored in campaign config for safe restart.
        if campaign_id != 'migration':
            campaigns = read_ui_campaigns()
            for item in campaigns:
                if item['id'] == campaign_id:
                    item['consentConfirmed'] = True
            save_ui_campaigns(campaigns)
        _cw.write({'status':'running','campaignId':campaign_id,'storiesPublished':0,
                   'telegramRequests':0,'startedAt':_worker_datetime.now(_worker_timezone.utc).isoformat()})
    return _cw.read()

@app.post('/api/campaign-worker/stop/{campaign_id}', dependencies=[Depends(get_current_user)])
async def campaign_worker_stop(campaign_id: str):
    with _WORKER_MUTEX:
        state = _cw.read()
        if state.get('campaignId') != campaign_id or state.get('status') not in ('running', 'stopping'):
            raise HTTPException(409, 'Кампания не запущена')
        state['status'] = 'stopping'
        _cw.write(state)
    return state
