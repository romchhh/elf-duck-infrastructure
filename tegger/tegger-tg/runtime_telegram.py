"""Runtime Telegram API credentials — stored via Tegger Settings UI, not .env."""

from __future__ import annotations

import json
from pathlib import Path

from config import DATA_DIR


CONFIG_PATH = Path(DATA_DIR) / "ui_telegram_config.json"


def read_telegram_config() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def get_api_credentials(*, require_configured: bool = False) -> tuple[int, str]:
    """
    Resolve API_ID / API_HASH from ui_telegram_config.json.

    Env placeholders (bootstrap) are ignored — real values come from Settings.
    """
    data = read_telegram_config()
    raw_id = str(data.get("api_id") or "").strip()
    raw_hash = str(data.get("api_hash") or "").strip()

    api_id = 0
    if raw_id.isdigit():
        api_id = int(raw_id)

    api_hash = raw_hash

    configured = api_id > 1 and bool(api_hash) and api_hash != "bootstrap"

    if require_configured and not configured:
        raise ValueError(
            "Укажите Telegram API ID и API Hash в Настройках Tegger "
            "(https://my.telegram.org), затем добавьте аккаунт через логин сессии."
        )

    if not configured:
        return 1, "bootstrap"

    return api_id, api_hash


def credentials_configured() -> bool:
    try:
        get_api_credentials(require_configured=True)
        return True
    except ValueError:
        return False
