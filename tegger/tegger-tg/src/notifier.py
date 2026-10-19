from __future__ import annotations

import asyncio
import json
import urllib.parse
import urllib.request
from datetime import datetime

from config import (
    LOG_BOT_TOKEN,
    LOG_CHAT_ID,
)


def _now() -> str:
    """
    Текущее локальное время для отображения
    в сообщениях лог-чата.
    """
    return datetime.now().astimezone().strftime(
        "%Y-%m-%d %H:%M:%S %Z"
    )


def _send_sync(text: str) -> None:
    """
    Синхронная отправка сообщения через Telegram Bot API.

    Вызывается через asyncio.to_thread(),
    поэтому основной event loop Tegger
    не блокируется.
    """

    if not LOG_BOT_TOKEN:
        raise RuntimeError(
            "LOG_BOT_TOKEN не задан"
        )

    if not LOG_CHAT_ID:
        raise RuntimeError(
            "LOG_CHAT_ID не задан"
        )

    url = (
        "https://api.telegram.org/bot"
        f"{LOG_BOT_TOKEN}/sendMessage"
    )

    payload = urllib.parse.urlencode(
        {
            "chat_id": LOG_CHAT_ID,
            "text": text,
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
    )

    with urllib.request.urlopen(
        request,
        timeout=10,
    ) as response:
        body = response.read().decode(
            "utf-8"
        )

    result = json.loads(body)

    if not result.get("ok"):
        raise RuntimeError(
            "Telegram logger error: "
            f"{result}"
        )


async def notify(text: str) -> bool:
    """
    Базовая безопасная отправка сообщения
    в Telegram log chat.

    Ошибка логгера никогда не должна
    останавливать основной Tegger worker.
    """

    try:
        await asyncio.to_thread(
            _send_sync,
            text,
        )

        return True

    except Exception as error:
        print(
            "[LOGGER] ⚠ "
            f"{type(error).__name__}: "
            f"{error}"
        )

        return False


async def notify_campaign_started(
    *,
    dry_run: bool,
    senders_count: int,
    daily_limit: int,
    concurrent_senders: int,
) -> bool:
    """
    Кампания запущена.
    """

    mode = (
        "DRY RUN"
        if dry_run
        else "LIVE"
    )

    return await notify(
        "🚀 TEGGER-TG — CAMPAIGN STARTED\n\n"
        f"Time: {_now()}\n"
        f"Mode: {mode}\n"
        f"Senders: {senders_count}\n"
        f"Daily limit / sender: {daily_limit}\n"
        f"Concurrent senders: {concurrent_senders}"
    )


async def notify_sender_started(
    sender_name: str,
    sender_display: str,
) -> bool:
    """
    Sender успешно подключился к Telegram.
    """

    return await notify(
        "🟢 TEGGER-TG — SENDER STARTED\n\n"
        f"Time: {_now()}\n"
        f"Sender: {sender_name}\n"
        f"Account: {sender_display}"
    )


async def notify_story_success(
    *,
    sender_name: str,
    story_number: int,
    usernames: list[str],
    daily_count: int,
    daily_limit: int,
) -> bool:
    """
    Story успешно опубликована.

    Вызывается ТОЛЬКО после успешной
    публикации Story и записи processed.
    """

    targets_text = "\n".join(
        f"• @{username}"
        for username in usernames
    )

    return await notify(
        "✅ TEGGER-TG — STORY SUCCESS\n\n"
        f"Time: {_now()}\n"
        f"Sender: {sender_name}\n"
        f"Story: #{story_number}\n"
        f"Tagged: {len(usernames)}\n"
        f"Daily: {daily_count}/{daily_limit}\n\n"
        f"{targets_text}"
    )


async def notify_target_error(
    *,
    sender_name: str,
    username: str,
    stage: str,
    error: Exception,
) -> bool:
    """
    Ошибка обработки конкретного target.

    stage:
    resolve
    interaction
    story
    и т.д.
    """

    return await notify(
        "⚠️ TEGGER-TG — TARGET ERROR\n\n"
        f"Time: {_now()}\n"
        f"Sender: {sender_name}\n"
        f"Target: @{username}\n"
        f"Stage: {stage}\n"
        f"Error: {type(error).__name__}: "
        f"{error}"
    )


async def notify_flood_wait(
    *,
    sender_name: str,
    wait_seconds: int,
    cooldown_until: str | None,
    error: Exception | None = None,
) -> bool:
    """
    Telegram потребовал сделать паузу.

    FloodWait не считается автоматически
    блокировкой аккаунта.
    """

    error_text = ""

    if error is not None:
        error_text = (
            "\n"
            f"Error: {type(error).__name__}: "
            f"{error}"
        )

    return await notify(
        "⏳ TEGGER-TG — FLOOD WAIT\n\n"
        f"Time: {_now()}\n"
        f"Sender: {sender_name}\n"
        f"Wait: {wait_seconds} sec\n"
        f"Cooldown until: {cooldown_until}"
        f"{error_text}"
    )


async def notify_worker_stopped(
    *,
    sender_name: str,
    error: Exception,
) -> bool:
    """
    Worker остановился.

    Не называем любую ошибку блокировкой.
    Сохраняем настоящий класс и текст
    исключения Telegram/Python.
    """

    return await notify(
        "⛔ TEGGER-TG — WORKER STOPPED\n\n"
        f"Time: {_now()}\n"
        f"Sender: {sender_name}\n"
        f"Error type: {type(error).__name__}\n"
        f"Error: {error}"
    )


async def notify_circuit_breaker(
    *,
    batch: list[str],
    unhealthy: int,
) -> bool:
    """
    Несколько sender'ов одного batch
    оказались unhealthy и следующие
    batch не запускаются.
    """

    return await notify(
        "🚨 TEGGER-TG — CIRCUIT BREAKER\n\n"
        f"Time: {_now()}\n"
        f"Batch: {', '.join(batch)}\n"
        f"Unhealthy: {unhealthy}/{len(batch)}\n"
        "Следующие batch не запущены."
    )


async def notify_campaign_finished(
    *,
    total_senders: int,
    completed: int,
    dry_run: int,
    cooldown: int,
    stopped: int,
    exceptions: int,
    not_run: int,
) -> bool:
    """
    Финальная сводка одного запуска.
    """

    if stopped > 0 or exceptions > 0:
        status = "⚠️ FINISHED WITH ERRORS"

    elif not_run > 0:
        status = "⚠️ PARTIALLY COMPLETED"

    else:
        status = "✅ COMPLETED"

    return await notify(
        "🏁 TEGGER-TG — CAMPAIGN FINISHED\n\n"
        f"Time: {_now()}\n"
        f"Status: {status}\n\n"
        f"Completed: {completed}\n"
        f"Dry run: {dry_run}\n"
        f"Cooldown: {cooldown}\n"
        f"Stopped: {stopped}\n"
        f"Exceptions: {exceptions}\n"
        f"Not run: {not_run}\n"
        f"Total senders: {total_senders}"
    )