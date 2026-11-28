"""ЛС-розсилка: бот кладёт шаблоны RU/PL в чат; аккаунты пересылают из чата."""

from __future__ import annotations

import asyncio
import os
import random
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from telethon.errors import (
    FloodWaitError,
    UserIsBlockedError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
)

from src.mailing_relay import (
    bot_get_me,
    post_locale_templates,
    template_bot_token,
    template_relay_chat_id,
)
from src.telegram_client import create_client
from src.user_language import DEFAULT_LANGUAGE, languages_for_entities


class MailingStopped(Exception):
    pass


async def _wait(seconds: float, cancel_event: asyncio.Event | None) -> None:
    if cancel_event is not None and cancel_event.is_set():
        raise MailingStopped()
    delay = max(0.0, float(seconds))
    if delay == 0:
        return
    if cancel_event is None:
        await asyncio.sleep(delay)
        return
    try:
        await asyncio.wait_for(cancel_event.wait(), timeout=delay)
    except asyncio.TimeoutError:
        return
    raise MailingStopped()


def _target_label(row: dict) -> str:
    if row.get("kind") == "id":
        return str(row.get("value") or "")
    return "@" + str(row.get("value") or "").lstrip("@")


def _skipable_resolve(exc: BaseException) -> bool:
    if isinstance(exc, (UsernameNotOccupiedError, UsernameInvalidError, ValueError)):
        return True
    if isinstance(exc, FloodWaitError):
        return False
    msg = str(exc)
    lower = msg.lower()
    if "No user has" in msg or "nobody is using this username" in lower:
        return True
    if "could not find the input entity" in lower:
        return True
    if "invalid object id" in lower or "peer id invalid" in lower:
        return True
    if "chat write forbidden" in lower or "can't write" in lower:
        return False
    return False


def _normalize_bot_chat_id(raw: str) -> int:
    """Bot API id супергруппы: -100XXXXXXXXXX."""
    s = str(raw or "").strip()
    if re.fullmatch(r"-100\d+", s):
        return int(s)
    if re.fullmatch(r"-\d+", s):
        return int(s)
    if re.fullmatch(r"\d+", s):
        return int(f"-100{s}")
    raise ValueError(f"Некорректный chat id: {raw!r}")


def _channel_id_variants(marked: int) -> set[int]:
    """Все распространённые представления одного и того же чата."""
    out = {int(marked)}
    s = str(abs(marked))
    if s.startswith("100") and len(s) > 3:
        tail = int(s[3:])
        out.add(tail)
        out.add(int(f"-100{tail}"))
    return out


async def _resolve_relay_chat(client, chat_id: str):
    """Peer чата шаблонов: только если сендер участник (есть в диалогах)."""
    marked = _normalize_bot_chat_id(chat_id)
    variants = _channel_id_variants(marked)
    username = str(os.environ.get("COMPLAINTS_CHAT_USERNAME") or "").strip().lstrip("@")
    if username:
        try:
            entity = await client.get_entity(username)
            return await client.get_input_entity(entity)
        except Exception:
            pass
    last_err: BaseException | None = None
    s_abs = str(abs(marked))
    tail = int(s_abs[3:]) if s_abs.startswith("100") and len(s_abs) > 3 else abs(marked)
    private_link = f"https://t.me/c/{tail}/1" if tail else ""
    tries = [marked, chat_id.strip()]
    if private_link:
        tries.append(private_link)
    for value in tries:
        try:
            entity = await client.get_entity(value)
            return await client.get_input_entity(entity)
        except Exception as exc:
            last_err = exc
    async for dialog in client.iter_dialogs(limit=None):
        if int(dialog.id) in variants:
            return dialog.input_entity
        ent = dialog.entity
        eid = getattr(ent, "id", None)
        if eid is not None and int(eid) in variants:
            return await client.get_input_entity(ent)
    detail = str(last_err or "нет в списке чатов")
    raise ValueError(
        "Сендер не видит чат шаблонов "
        f"({chat_id}). Добавь аккаунт в группу оценок/жалоб, "
        "открой её в Telegram с этого аккаунта (чтобы peer попал в кэш) и запусти снова. "
        f"({detail[:120]})"
    )


async def _resolve_target(client, row: dict):
    kind = str(row.get("kind") or "username")
    if kind == "id":
        raw = str(row.get("value") or "").strip()
        return await client.get_entity(int(raw))
    username = str(row.get("value") or "").strip().lstrip("@")
    while True:
        try:
            entity = await client.get_entity(username)
            break
        except FloodWaitError as wait_exc:
            await asyncio.sleep(int(getattr(wait_exc, "seconds", 0) or 0) + 1)
    return entity


async def publish_mailing(
    *,
    targets: list[dict],
    sender_ids: list[str],
    photo_path_ru: str | Path,
    photo_path_pl: str | Path | None,
    caption_ru: str,
    caption_pl: str,
    button_url: str,
    button_text_ru: str,
    button_text_pl: str,
    default_language: str = DEFAULT_LANGUAGE,
    interval_min: int = 3,
    interval_max: int = 8,
    on_progress: Callable[[dict], Awaitable[None]] | None = None,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    path_ru = Path(photo_path_ru)
    path_pl = Path(photo_path_pl) if photo_path_pl else path_ru
    if not path_ru.is_file():
        raise FileNotFoundError(f"Фото (RU) не найдено: {path_ru}")

    state = {
        "phase": "relay",
        "total": len(targets),
        "sent": [],
        "failed": [],
        "current": None,
        "pending": len(targets),
        "waitUntil": None,
        "relayChatId": None,
    }

    async def emit(**patch) -> None:
        state.update(patch)
        if on_progress is not None:
            await on_progress(dict(state))

    await emit()

    token = await asyncio.to_thread(template_bot_token)
    chat_id = await asyncio.to_thread(template_relay_chat_id)
    me = await asyncio.to_thread(bot_get_me, token)
    bot_username = str(me.get("username") or "").strip()

    relay: dict[str, int] = {}
    failed: list[dict] = []

    await _wait(0, cancel_event)
    try:
        relay = await asyncio.to_thread(
            post_locale_templates,
            token=token,
            chat_id=chat_id,
            photo_ru=path_ru,
            photo_pl=path_pl,
            caption_ru=caption_ru,
            caption_pl=caption_pl,
            button_url=button_url,
            button_text_ru=button_text_ru,
            button_text_pl=button_text_pl,
        )
        await emit(relayChatId=str(chat_id), phase="ready")
    except Exception as exc:
        failed.append(
            {
                "username": "relay",
                "error": f"Бот → чат {chat_id}: {type(exc).__name__}: {str(exc)[:160]}",
            }
        )
        await emit(failed=list(failed), phase="done", pending=0)
        return {
            "sent": [],
            "failed": failed,
            "relay": relay,
            "relayChatId": str(chat_id),
            "botUsername": bot_username,
        }

    allowed_senders = set(sender_ids)
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in targets:
        sender = str(row.get("sender") or "").strip()
        if sender in allowed_senders:
            grouped[sender].append(row)
        else:
            failed.append({"username": _target_label(row).lstrip("@"), "error": "Неизвестный сендер"})

    sent: list[str] = []
    interval_min = max(1, int(interval_min))
    interval_max = max(interval_min, int(interval_max))

    for sender_id, rows in grouped.items():
        client = create_client(sender_id)
        try:
            await emit(phase="connect", current=sender_id)
            await asyncio.wait_for(client.connect(), timeout=25)
            if not await client.is_user_authorized():
                raise RuntimeError(f"Сессия не авторизована: {sender_id}")
            try:
                from_peer = await _resolve_relay_chat(client, str(chat_id))
            except ValueError as exc:
                failed.append({"username": sender_id, "error": str(exc)[:220]})
                await emit(failed=list(failed), phase="resolve", current=sender_id)
                continue

            for index, row in enumerate(rows):
                await _wait(0, cancel_event)
                label = _target_label(row)
                store_name = (
                    str(row.get("value") or "").lstrip("@")
                    if row.get("kind") != "id"
                    else str(row.get("value") or "")
                )
                await emit(phase="resolve", current=label)
                try:
                    entity = await _resolve_target(client, row)
                except Exception as exc:
                    if not _skipable_resolve(exc):
                        raise
                    failed.append({"username": store_name, "error": str(exc)[:160]})
                    await emit(
                        failed=list(failed),
                        pending=max(0, len(targets) - len(sent) - len(failed)),
                    )
                    continue

                lang_map = await asyncio.to_thread(
                    languages_for_entities,
                    [entity],
                    default=default_language,
                )
                lang = lang_map.get(int(getattr(entity, "id", 0) or 0), default_language)
                if lang not in ("pl", "ru"):
                    lang = default_language if default_language in ("pl", "ru") else "ru"
                msg_id = int(relay.get(lang) or relay.get("ru") or 0)
                if not msg_id:
                    failed.append({"username": store_name, "error": "Нет шаблона для языка"})
                    continue

                await emit(phase="send", current=label)
                delivered = False
                try:
                    while True:
                        try:
                            await client.forward_messages(entity, msg_id, from_peer)
                            delivered = True
                            break
                        except FloodWaitError as wait_exc:
                            await asyncio.sleep(int(getattr(wait_exc, "seconds", 0) or 0) + 1)
                except UserIsBlockedError:
                    failed.append({"username": store_name, "error": "Пользователь заблокировал"})
                except Exception as exc:
                    msg = str(exc)
                    lower = msg.lower()
                    if "can't forward" in lower or "protected chat" in lower:
                        failed.append(
                            {
                                "username": store_name,
                                "error": "Нет доступа к чату шаблонов",
                            }
                        )
                    elif _skipable_resolve(exc):
                        failed.append({"username": store_name, "error": str(exc)[:160]})
                    else:
                        raise

                if delivered:
                    sent.append(store_name)

                await emit(
                    sent=list(sent),
                    failed=list(failed),
                    pending=max(0, len(targets) - len(sent) - len(failed)),
                )

                if index < len(rows) - 1:
                    gap = random.randint(interval_min, interval_max)
                    next_at = (datetime.now(timezone.utc) + timedelta(seconds=gap)).isoformat()
                    await emit(phase="wait", waitUntil=next_at)
                    await _wait(gap, cancel_event)

        finally:
            if client.is_connected():
                await client.disconnect()

    await emit(phase="done", pending=0, waitUntil=None, current=None)
    return {
        "sent": sent,
        "failed": failed,
        "relay": relay,
        "relayChatId": str(chat_id),
        "botUsername": bot_username,
    }