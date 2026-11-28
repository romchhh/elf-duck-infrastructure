"""Шаблон розсилки через Bot API: фото + текст + inline URL-кнопка."""

from __future__ import annotations

import json
import mimetypes
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _telegram_ui_config() -> dict:
    import json as _json

    from config import DATA_DIR

    path = Path(DATA_DIR) / "ui_telegram_config.json"
    if not path.is_file():
        return {}
    try:
        data = _json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def template_bot_token() -> str:
    data = _telegram_ui_config()
    token = str(data.get("template_bot_token") or data.get("bot_token") or "").strip()
    if not token:
        token = str(
            os.environ.get("TEMPLATE_BOT_TOKEN")
            or os.environ.get("TELEGRAM_BOT_TOKEN")
            or os.environ.get("LOG_BOT_TOKEN")
            or ""
        ).strip()
    if not token:
        raise RuntimeError(
            "Не задан бот шаблонов: Настройки → «Бот для шаблонов розсилки»"
        )
    return token


MAILING_RELAY_CHAT_ID = "-1005728531495"
_STALE_RELAY_CHATS = {"-1003968794671"}


def template_relay_chat_id() -> str:
    """Група, куди бот кладе RU/PL шаблон. Сендери самі вступають за інвайтом."""
    env_chat = str(
        os.environ.get("TEMPLATE_RELAY_CHAT_ID")
        or os.environ.get("MAILING_RELAY_CHAT_ID")
        or ""
    ).strip()
    if env_chat:
        return env_chat
    data = _telegram_ui_config()
    stored = str(
        data.get("template_relay_chat_id")
        or data.get("mailing_relay_chat_id")
        or ""
    ).strip()
    if stored and stored not in _STALE_RELAY_CHATS:
        return stored
    return MAILING_RELAY_CHAT_ID


def _api_json(method: str, token: str, payload: dict | None = None) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method="POST" if payload else "GET")
    with urlopen(request, timeout=90) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    if not data.get("ok"):
        desc = str(data.get("description") or "Bot API error")
        raise RuntimeError(desc)
    return data


def bot_get_me(token: str) -> dict:
    return _api_json("getMe", token)["result"]


def _multipart_send(
    token: str,
    method: str,
    fields: dict[str, str],
    file_field: str,
    file_path: Path,
) -> dict:
    boundary = f"----TeggerMailing{uuid4().hex}"
    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "application/octet-stream"
    file_bytes = file_path.read_bytes()
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n".encode()
        )
    chunks.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
    )
    chunks.append(file_bytes)
    chunks.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    url = f"https://api.telegram.org/bot{token}/{method}"
    request = Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bot API HTTP {exc.code}: {detail[:200]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Bot API: {exc}") from exc
    data = json.loads(raw)
    if not data.get("ok"):
        raise RuntimeError(str(data.get("description") or "sendPhoto failed"))
    return data["result"]


def _build_reply_markup(button_text: str, button_url: str) -> str | None:
    text = str(button_text or "").strip()
    url = str(button_url or "").strip()
    if not text or not url:
        return None
    if not url.startswith(("http://", "https://")):
        raise ValueError("Ссылка кнопки: http:// или https://")
    return json.dumps(
        {"inline_keyboard": [[{"text": text[:64], "url": url[:500]}]]},
        ensure_ascii=False,
    )


def stamp_bot_start(url: str, start_param: str) -> str:
    """Додає ?start= до посилання t.me/<bot>, щоб CRM бачила перехід з цієї розсилки."""
    from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

    raw = str(url or "").strip()
    param = str(start_param or "").strip()
    if not raw or not param:
        return raw
    parsed = urlparse(raw)
    host = (parsed.netloc or "").lower()
    if host not in {"t.me", "telegram.me"}:
        return raw
    path = parsed.path.strip("/")
    if not path or "/" in path or path.startswith("+") or not path.lower().endswith("bot"):
        return raw
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["start"] = param[:64]
    return urlunparse(parsed._replace(query=urlencode(query)))


def create_sender_invite(token: str, chat_id: str) -> str:
    data = _api_json(
        "createChatInviteLink",
        token,
        {"chat_id": str(chat_id), "name": "tegger-mail"},
    )
    link = str((data.get("result") or {}).get("invite_link") or "").strip()
    if not link:
        raise RuntimeError("Telegram не вернул ссылку приглашения в чат шаблонов")
    return link


def send_template_photo(
    *,
    token: str,
    chat_id: int | str,
    photo_path: Path,
    caption: str,
    button_text: str = "",
    button_url: str = "",
    start_param: str = "",
) -> int:
    if not photo_path.is_file():
        raise FileNotFoundError(f"Фото не найдено: {photo_path}")
    cap = str(caption or "").strip()
    if len(cap) > 1024:
        raise ValueError("Подпись слишком длинная (макс. 1024)")
    fields: dict[str, str] = {
        "chat_id": str(chat_id),
        "caption": cap,
        "parse_mode": "HTML",
    }
    markup = _build_reply_markup(button_text, stamp_bot_start(button_url, start_param))
    if markup:
        fields["reply_markup"] = markup
    result = _multipart_send(token, "sendPhoto", fields, "photo", photo_path)
    mid = result.get("message_id")
    if not mid:
        raise RuntimeError("Bot API не вернул message_id")
    return int(mid)


def post_locale_templates(
    *,
    token: str,
    chat_id: str | int,
    photo_ru: Path,
    photo_pl: Path,
    caption_ru: str,
    caption_pl: str,
    button_url: str,
    button_text_ru: str,
    button_text_pl: str,
    start_param: str = "",
) -> dict[str, int]:
    """Два повідомлення в спільний чат — одна пара на всю розсилку."""
    ru_id = send_template_photo(
        token=token,
        chat_id=chat_id,
        photo_path=photo_ru,
        caption=caption_ru,
        button_text=button_text_ru,
        button_url=button_url,
        start_param=start_param,
    )
    pl_path = photo_pl if photo_pl.is_file() else photo_ru
    pl_cap = str(caption_pl or "").strip() or caption_ru
    btn_pl = str(button_text_pl or "").strip() or button_text_ru
    pl_id = send_template_photo(
        token=token,
        chat_id=chat_id,
        photo_path=pl_path,
        caption=pl_cap,
        button_text=btn_pl,
        button_url=button_url,
        start_param=start_param,
    )
    return {"ru": ru_id, "pl": pl_id}


def relay_label_from_target(row: dict) -> str:
    if row.get("kind") == "id":
        return str(row.get("value") or "")
    return str(row.get("value") or "").lstrip("@")