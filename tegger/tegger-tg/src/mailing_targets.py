"""Парсинг аудитории для ЛС-розсилки: @username или числовой Telegram user id."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{5,32}$")
_SKIP_TOKENS = frozenset({"username", "telegram_id", "user", "id"})
_MAX_TARGETS = 2000


def _add_username(seen: set, out: list[dict], token: str, sender: str) -> None:
    username = str(token or "").strip().lstrip("@").lower()
    if not username or username in _SKIP_TOKENS:
        return
    if not _USERNAME_RE.fullmatch(username):
        raise HTTPException(422, f"Некорректный username: @{username}")
    key = ("u", username)
    if key in seen:
        return
    seen.add(key)
    out.append({"kind": "username", "value": username, "sender": sender})


def _add_user_id(seen: set, out: list[dict], raw: str, sender: str) -> None:
    value = str(raw or "").strip()
    if not re.fullmatch(r"\d{5,20}", value):
        raise HTTPException(422, f"Некорректный telegram id: {value}")
    key = ("i", value)
    if key in seen:
        return
    seen.add(key)
    out.append({"kind": "id", "value": value, "sender": sender})


def parse_mailing_targets(raw: str, sender_ids: list[str]) -> list[dict[str, Any]]:
    """@user, id, CSV `telegram_id,username` (username или только id)."""
    text = str(raw or "").replace("\r\n", "\n").replace("\r", "\n").strip("\ufeff")
    if not sender_ids:
        raise HTTPException(422, "Выбери хотя бы один аккаунт-сендер")
    senders = [str(s).strip() for s in sender_ids if str(s).strip()]
    if not senders:
        raise HTTPException(422, "Выбери хотя бы один аккаунт-сендер")

    seen: set = set()
    out: list[dict] = []
    lines = [ln.strip() for ln in text.split("\n")] if text else []
    idx = 0

    def next_sender() -> str:
        nonlocal idx
        sender = senders[idx % len(senders)]
        idx += 1
        return sender

    if lines:
        for line in lines:
            if not line:
                continue
            low = line.lower().replace(" ", "")
            if low in ("telegram_id,username", "telegram_id,username,"):
                continue
            if "," in line:
                cells = [c.strip().strip('"').strip("'") for c in line.split(",")]
                picked_username = None
                picked_id = None
                for cell in reversed(cells):
                    token = str(cell or "").strip()
                    bare = token.lstrip("@").lower()
                    if bare and bare not in _SKIP_TOKENS and _USERNAME_RE.fullmatch(bare):
                        picked_username = bare
                        break
                for cell in cells:
                    token = str(cell or "").strip()
                    if re.fullmatch(r"\d{5,20}", token):
                        picked_id = token
                        break
                sender = next_sender()
                if picked_username:
                    _add_username(seen, out, picked_username, sender)
                elif picked_id:
                    _add_user_id(seen, out, picked_id, sender)
                continue
            sender = next_sender()
            for part in re.split(r"[\s,;]+", line):
                part = part.strip()
                if not part:
                    continue
                bare = part.lstrip("@").lower()
                if re.fullmatch(r"\d{5,20}", bare):
                    _add_user_id(seen, out, bare, sender)
                else:
                    _add_username(seen, out, part, sender)
    else:
        for part in re.split(r"[\s,;]+", text):
            part = part.strip()
            if not part:
                continue
            sender = next_sender()
            bare = part.lstrip("@").lower()
            if re.fullmatch(r"\d{5,20}", bare):
                _add_user_id(seen, out, bare, sender)
            else:
                _add_username(seen, out, part, sender)

    if not out:
        raise HTTPException(422, "Укажи хотя бы одного получателя (@username или числовой id)")
    if len(out) > _MAX_TARGETS:
        raise HTTPException(422, f"Слишком много получателей (максимум {_MAX_TARGETS})")
    return out


def target_stats(targets: list[dict]) -> dict[str, int]:
    stats = {"username": 0, "id": 0}
    for row in targets:
        kind = str(row.get("kind") or "username")
        if kind == "id":
            stats["id"] += 1
        else:
            stats["username"] += 1
    return stats


def target_keys(targets: list[dict]) -> list[str]:
    """Человекочитаемые метки для UI и CRM."""
    keys = []
    for row in targets:
        if row.get("kind") == "id":
            keys.append(str(row.get("value") or ""))
        else:
            keys.append(str(row.get("value") or "").lstrip("@"))
    return keys


def language_stats_by_targets(targets: list[dict]) -> dict[str, int]:
    from src.user_language import DEFAULT_LANGUAGE, language_stats_by_usernames, normalize_app_language

    stats = {"pl": 0, "ru": 0, "unknown": 0}
    usernames = [
        str(t.get("value") or "").lower().lstrip("@")
        for t in targets
        if t.get("kind") != "id" and str(t.get("value") or "").strip()
    ]
    ids = [str(t.get("value") or "").strip() for t in targets if t.get("kind") == "id"]
    if usernames:
        ustats = language_stats_by_usernames(usernames)
        for key in ("pl", "ru", "unknown"):
            stats[key] += int(ustats.get(key) or 0)
    id_only = len(ids)
    if not id_only:
        return stats
    try:
        from src.user_language import _users_collection

        coll = _users_collection()
        if coll is None:
            stats["unknown"] += id_only
            return stats
        found = set()
        for row in coll.find({"telegramId": {"$in": ids}}, {"telegramId": 1, "language": 1}):
            tid = str(row.get("telegramId") or "").strip()
            if not tid:
                continue
            found.add(tid)
            lang = normalize_app_language(row.get("language"))
            if lang == "pl":
                stats["pl"] += 1
            elif lang == "ru":
                stats["ru"] += 1
            else:
                stats["unknown"] += 1
        stats["unknown"] += max(0, id_only - len(found))
    except Exception:
        stats["unknown"] += id_only
    return stats