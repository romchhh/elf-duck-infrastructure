import argparse
import asyncio
import random

from telethon.errors import FloodWaitError

from telethon.tl.functions.account import (
    GetAuthorizationsRequest,
    ResetAuthorizationRequest,
)

from config import (
    SENDERS,
    TARGETS_PER_SENDER_PER_DAY,
    TARGETS_PER_STORY_MIN,
    TARGETS_PER_STORY_MAX,
    STORY_INTERVAL_MIN_SECONDS,
    STORY_INTERVAL_MAX_SECONDS,
    INTERACTION_STORY_DELAY,
    MAX_CONCURRENT_SENDERS,
    DRY_RUN,
)

from src.telegram_client import create_client
from src.contact import create_test_interaction
from src.story import repost_template_story
from src.notifier import (
    notify_campaign_started,
    notify_sender_started,
    notify_story_success,
    notify_target_error,
    notify_flood_wait,
    notify_worker_stopped,
    notify_circuit_breaker,
    notify_campaign_finished,
)

from src.targets import get_remaining_targets

from src.state import (

    load_state,

    get_processed,

    mark_targets_processed,

    mark_target_failed,

    remaining_daily_capacity,

    daily_limit_reached,

    get_sender_status,

    get_cooldown_until,

    set_sender_cooldown,

    set_sender_stopped,
)

async def list_sessions(sender_name):
    """
    Показывает Telegram-авторизации выбранного sender.
    Ничего не завершает и не изменяет.
    """

    if sender_name not in SENDERS:
        raise ValueError(
            f"Неизвестный sender: {sender_name}. "
            f"Доступные: {', '.join(SENDERS)}"
        )

    client = create_client(sender_name)

    try:
        print(
            f"[{sender_name}] "
            "Подключаемся к Telegram..."
        )

        await client.connect()

        if not await client.is_user_authorized():
            raise RuntimeError(
                f"[{sender_name}] "
                "session не авторизована"
            )

        me = await client.get_me()

        sender_display = (
            f"@{me.username}"
            if me.username
            else f"ID:{me.id}"
        )

        print(
            f"[{sender_name}] "
            f"Авторизован: {sender_display}"
        )

        result = await client(
            GetAuthorizationsRequest()
        )

        authorizations = list(
            result.authorizations
        )

        print()
        print(
            f"[{sender_name}] "
            f"Telegram-сессии: "
            f"{len(authorizations)}"
        )
        print("-" * 70)

        current_count = 0
        other_count = 0

        for index, auth in enumerate(
            authorizations,
            start=1,
        ):
            is_current = bool(
                getattr(
                    auth,
                    "current",
                    False,
                )
            )

            if is_current:
                current_count += 1
                marker = "CURRENT / TEGGER"
            else:
                other_count += 1
                marker = "OTHER"

            app_name = (
                getattr(
                    auth,
                    "app_name",
                    None,
                )
                or "Telegram"
            )

            app_version = (
                getattr(
                    auth,
                    "app_version",
                    None,
                )
                or "?"
            )

            device_model = (
                getattr(
                    auth,
                    "device_model",
                    None,
                )
                or "Unknown device"
            )

            platform = (
                getattr(
                    auth,
                    "platform",
                    None,
                )
                or "?"
            )

            system_version = (
                getattr(
                    auth,
                    "system_version",
                    None,
                )
                or "?"
            )

            date_active = getattr(
                auth,
                "date_active",
                None,
            )

            print(
                f"#{index} — {marker}"
            )

            print(
                f"  App: "
                f"{app_name} {app_version}"
            )

            print(
                f"  Device: {device_model}"
            )

            print(
                f"  Platform: "
                f"{platform} {system_version}"
            )

            print(
                f"  Last active: {date_active}"
            )

            print()

        print("-" * 70)

        print(
            f"Текущих сессий: "
            f"{current_count}"
        )

        print(
            f"Сторонних сессий: "
            f"{other_count}"
        )

        print(
            "Никакие сессии не были завершены."
        )

        return authorizations

    finally:

        if client.is_connected():
            await client.disconnect()

async def terminate_other_sessions(sender_name):
    """
    Завершает все сторонние Telegram-авторизации выбранного sender,
    сохраняя текущую Telethon-сессию Tegger.
    """

    if sender_name not in SENDERS:
        raise ValueError(
            f"Неизвестный sender: {sender_name}. "
            f"Доступные: {', '.join(SENDERS)}"
        )

    client = create_client(sender_name)

    try:
        print(
            f"[{sender_name}] "
            "Подключаемся к Telegram..."
        )

        await client.connect()

        if not await client.is_user_authorized():
            raise RuntimeError(
                f"[{sender_name}] "
                "session не авторизована"
            )

        me = await client.get_me()

        sender_display = (
            f"@{me.username}"
            if me.username
            else f"ID:{me.id}"
        )

        print(
            f"[{sender_name}] "
            f"Авторизован: {sender_display}"
        )

        result = await client(
            GetAuthorizationsRequest()
        )

        authorizations = list(
            result.authorizations
        )

        current = [
            auth
            for auth in authorizations
            if getattr(
                auth,
                "current",
                False,
            )
        ]

        others = [
            auth
            for auth in authorizations
            if not getattr(
                auth,
                "current",
                False,
            )
        ]

        # Защита:
        # если Telegram не позволил однозначно
        # определить текущую сессию,
        # ничего не удаляем.
        if len(current) != 1:
            raise RuntimeError(
                f"[{sender_name}] "
                "Не удалось однозначно определить "
                "текущую Tegger-сессию. "
                "Ничего не изменено."
            )

        print()
        print(
            f"[{sender_name}] "
            f"Всего авторизаций: "
            f"{len(authorizations)}"
        )

        print(
            f"[{sender_name}] "
            f"Сторонних авторизаций: "
            f"{len(others)}"
        )

        if not others:
            print(
                f"[{sender_name}] "
                "Сторонних сессий нет."
            )

            return 0

        terminated = 0

        for auth in others:

            device = (
                getattr(
                    auth,
                    "device_model",
                    None,
                )
                or "Unknown device"
            )

            app_name = (
                getattr(
                    auth,
                    "app_name",
                    None,
                )
                or "Telegram"
            )

            await client(
                ResetAuthorizationRequest(
                    hash=auth.hash
                )
            )

            terminated += 1

            print(
                f"[{sender_name}] "
                f"✓ Завершена: "
                f"{app_name} / {device}"
            )

        print()
        print(
            f"[{sender_name}] "
            f"Готово. Завершено "
            f"сторонних сессий: "
            f"{terminated}."
        )

        print(
            f"[{sender_name}] "
            "Текущая Tegger-сессия сохранена."
        )

        return terminated

    finally:

        if client.is_connected():
            await client.disconnect()


async def run_sender(
    sender_name,
    *,
    dry_run=None,
    target_usernames=None,
    execution_settings=None,
    campaign_id=None,
):
    """
    Независимый worker одного Telegram sender.

    Каждый sender имеет:
    - свою Telegram session;
    - свой targets.txt;
    - свой state.json;
    - свой daily_count;
    - свой processed.
    """

    # Explicit campaign context only; legacy Migration calls have no campaign_id.
    if campaign_id is not None:
        from src.campaign_progress import read_progress
        if target_usernames is None:
            raise ValueError("Campaign execution requires explicit target_usernames")
        if dry_run is False or (dry_run is None and not DRY_RUN):
            raise RuntimeError("Campaign LIVE execution is not enabled by this patch")

    # TEGGER CAMPAIGN SQLITE OFFLINE BRIDGE V1
    # Campaign previews must use durable queue, not legacy sender state.
    # LIVE stays explicitly forbidden by the guard above.
    if campaign_id is not None:
        from pathlib import Path as _CampaignPath
        import json as _campaign_json
        from config import DATA_DIR as _CAMPAIGN_DATA_DIR
        from src.campaign_executor import dry_run as _campaign_queue_dry_run
        from src.campaign_executor import normalize as _campaign_normalize

        _campaign_file = _CampaignPath(_CAMPAIGN_DATA_DIR) / "ui_campaigns.json"
        _campaign_records = _campaign_json.loads(_campaign_file.read_text(encoding="utf-8"))
        if not isinstance(_campaign_records, list):
            raise ValueError("Invalid campaign registry")
        _campaign = next((c for c in _campaign_records if c.get("id") == campaign_id), None)
        if _campaign is None:
            raise ValueError("Campaign not found")
        if sender_name not in _campaign.get("senderIds", []):
            raise ValueError("Sender not assigned to campaign")
        _assigned = {
            _campaign_normalize(t.get("username"))
            for t in _campaign.get("targets", []) if t.get("sender") == sender_name
        }
        _requested = {_campaign_normalize(u) for u in target_usernames}
        if _requested != _assigned:
            raise ValueError("Campaign target list does not match persisted assignments")
        _preview = _campaign_queue_dry_run(_campaign)
        _preview["sender"] = sender_name
        _preview["senderPreview"] = [
            row for row in _preview["queue"]["preview"] if row["sender"] == sender_name
        ]
        return _preview

    # Определяем режим до любых действий
    if dry_run is None:
        dry_run = DRY_RUN

    # Нормализуем таргеты кампании
    if target_usernames is not None:
        target_usernames = [
            str(username).strip().lstrip("@").lower()
            for username in target_usernames
            if str(username).strip()
        ]

    # Настройки конкретного запуска.
    # Если не переданы — сохраняем совместимость с CLI.
    settings = {
        "DRY_RUN": DRY_RUN,
        "TARGETS_PER_SENDER_PER_DAY": TARGETS_PER_SENDER_PER_DAY,
        "TARGETS_PER_STORY_MIN": TARGETS_PER_STORY_MIN,
        "TARGETS_PER_STORY_MAX": TARGETS_PER_STORY_MAX,
        "STORY_INTERVAL_MIN_SECONDS": STORY_INTERVAL_MIN_SECONDS,
        "STORY_INTERVAL_MAX_SECONDS": STORY_INTERVAL_MAX_SECONDS,
        "INTERACTION_STORY_DELAY": INTERACTION_STORY_DELAY,
    }

    # TEGGER RUNTIME UI SETTINGS V1
    # Read the same persisted execution settings as GET /api/settings.
    # This changes limits/timings only, never DRY_RUN or Telegram credentials.
    # Values are refreshed for each new run_sender invocation, not mid-story.
    from pathlib import Path as _SettingsPath
    import json as _settings_json
    from config import DATA_DIR as _SETTINGS_DATA_DIR

    _settings_file = _SettingsPath(_SETTINGS_DATA_DIR) / "ui_settings.json"
    if _settings_file.is_file():
        _settings_record = _settings_json.loads(_settings_file.read_text(encoding="utf-8"))
        if not isinstance(_settings_record, dict):
            raise ValueError("Invalid ui_settings.json: expected object")
        _stored_execution = _settings_record.get("execution", {})
        if not isinstance(_stored_execution, dict):
            raise ValueError("Invalid ui_settings.json execution: expected object")
        _allowed_settings = (
            "TARGETS_PER_SENDER_PER_DAY",
            "TARGETS_PER_STORY_MIN",
            "TARGETS_PER_STORY_MAX",
            "STORY_INTERVAL_MIN_SECONDS",
            "STORY_INTERVAL_MAX_SECONDS",
            "INTERACTION_STORY_DELAY",
        )
        for _key in _allowed_settings:
            if _key in _stored_execution:
                _value = _stored_execution[_key]
                if type(_value) is not int:
                    raise ValueError(f"Invalid ui_settings.json value: {_key}")
                settings[_key] = _value

    # Explicit per-invocation settings take precedence over UI defaults.
    if execution_settings is not None:
        settings.update(execution_settings)

    daily_limit = int(
        settings["TARGETS_PER_SENDER_PER_DAY"]
    )

    story_min = int(
        settings["TARGETS_PER_STORY_MIN"]
    )

    story_max = int(
        settings["TARGETS_PER_STORY_MAX"]
    )

    interval_min = int(
        settings["STORY_INTERVAL_MIN_SECONDS"]
    )

    interval_max = int(
        settings["STORY_INTERVAL_MAX_SECONDS"]
    )

    interaction_delay = int(
        settings["INTERACTION_STORY_DELAY"]
    )

    if daily_limit < 1:
        raise ValueError("Дневной лимит должен быть больше 0")

    if not 1 <= story_min <= story_max:
        raise ValueError("Некорректные лимиты Story")

    if not 0 <= interval_min <= interval_max:
        raise ValueError("Некорректные интервалы Stories")

    if interaction_delay < 0:
        raise ValueError("Некорректная задержка interaction")

    print()
    print("=" * 70)
    print(f"ЗАПУСК SENDER: {sender_name}")
    print("=" * 70)

    # Защита тестового режима
    if sender_name == "sender_test" and not dry_run:
        raise RuntimeError(
            "LIVE-запуск sender_test пока запрещён"
        )

    sender_status = get_sender_status(

        sender_name,

        read_only=dry_run,

    )

    if sender_status == "stopped":
        print(
            f"[{sender_name}] "
            "⛔ Sender остановлен в state.json."
        )

        return "stopped"

    if sender_status == "cooldown":
        print(
            f"[{sender_name}] "
            "⏳ Sender находится в cooldown до "
            f"{get_cooldown_until(sender_name)}"
        )

        return "cooldown"

    # ========================================================
    # DRY RUN
    # ========================================================
    #
    # Полностью офлайн-проверка.
    #
    # НЕ выполняется:
    # - подключение к Telegram;
    # - get_entity;
    # - interaction;
    # - Story;
    # - sleep;
    # - изменение processed;
    # - изменение daily_count.
    # ========================================================

    if dry_run:

        state = load_state(sender_name, read_only=True)

        processed = set(state.get("processed", []))

        if target_usernames is not None:
            # Таргеты новой кампании берём из интерфейса
            remaining = [
                username
                for username in dict.fromkeys(target_usernames)
                if username not in processed
            ]
        else:
            # Старые кампании используют migration_assignments.json
            remaining = get_remaining_targets(
                sender_name,
                processed,
            )

        capacity = max(

            0,

            daily_limit - int(state.get("daily_count", 0)),

        )

        planned_remaining = list(
            remaining
        )

        planned_capacity = capacity
        planned_story_number = 0
        planned_targets_count = 0

        while (
            planned_remaining
            and planned_capacity > 0
        ):

            desired_group_size = min(

                random.randint(

                    story_min,

                    story_max,

                ),

                planned_capacity,

                len(planned_remaining),

            )

            if desired_group_size <= 0:
                break

            planned_story_number += 1
            planned_targets_count += desired_group_size

            planned_remaining = planned_remaining[
                desired_group_size:
            ]

            planned_capacity -= desired_group_size

        print(
            f"[{sender_name}] DRY RUN | "
            f"date={state['date']} | "
            f"daily={state['daily_count']}/"
            f"{daily_limit} | "
            f"remaining={len(remaining)} | "
            f"planned={planned_targets_count} targets / "
            f"{planned_story_number} stories | OK"
        )

        return {

            "mode": "DRY_RUN",

            "sender": sender_name,

            "status": "completed",

            "date": state["date"],

            "dailyCount": state["daily_count"],

            "dailyLimit": daily_limit,

            "dailyCapacity": capacity,

            "remainingTargets": len(remaining),

            "plannedTargets": planned_targets_count,

            "plannedStories": planned_story_number,

            "telegramRequests": 0,

        }

    # ========================================================

    # TELEGRAM CLIENT

    # ========================================================

    #

    # Создаём клиент только в LIVE-режиме.

    # DRY_RUN сюда вообще не доходит.

    # ========================================================

    client = create_client(

        sender_name

    )

    try:

        print(

            f"[{sender_name}] "

            "Подключаемся к Telegram..."

        )

        await client.start()

        me = await client.get_me()

        sender_display = (
            f"@{me.username}"
            if me.username
            else f"ID:{me.id}"
        )

        print(

            f"[{sender_name}] "

            f"Авторизован: {sender_display}"

        )

        await notify_sender_started(

            sender_name,

            sender_display,

        )

        # ----------------------------------------------------

        # STATE
        # ----------------------------------------------------

        state = load_state(sender_name)

        processed = get_processed(
            sender_name
        )

        if target_usernames is not None:
            # Новая кампания: берём таргеты из интерфейса
            remaining = [
                username
                for username in dict.fromkeys(target_usernames)
                if username not in processed
            ]
        else:
            # Старая миграция: сохраняем прежнюю логику
            remaining = get_remaining_targets(
                sender_name,
                processed,
            )

        capacity = remaining_daily_capacity(
            sender_name,
            TARGETS_PER_SENDER_PER_DAY,
        )

        print()
        print(
            f"[{sender_name}] "
            f"Дата: {state['date']}"
        )

        print(
            f"[{sender_name}] "
            f"Сегодня обработано: "
            f"{state['daily_count']}/"
            f"{TARGETS_PER_SENDER_PER_DAY}"
        )

        print(
            f"[{sender_name}] "
            f"Осталось дневной квоты: "
            f"{capacity}"
        )

        print(
            f"[{sender_name}] "
            f"Необработанных allowlist targets: "
            f"{len(remaining)}"
        )

        # ----------------------------------------------------
        # NOTHING TO DO
        # ----------------------------------------------------

        if daily_limit_reached(

            sender_name,

            daily_limit,

        ):
            print(
                f"[{sender_name}] "
                "✓ Дневной лимит уже достигнут."
            )

            return

        if not remaining:
            print(
                f"[{sender_name}] "
                "✓ Нет необработанных targets."
            )

            return

        story_number = 0

        # ----------------------------------------------------
        # STORY LOOP
        # ----------------------------------------------------

        while remaining:

            # Проверяем дневной остаток заново.
            capacity = remaining_daily_capacity(
                sender_name,
                TARGETS_PER_SENDER_PER_DAY,
            )

            if capacity <= 0:
                print()
                print(
                    f"[{sender_name}] "
                    "✓ Дневной лимит достигнут."
                )

                break

            # Сколько ВАЛИДНЫХ targets нужно собрать
            # для следующей Story.
            # 2–3 случайно, но не больше дневного остатка.
            desired_group_size = min(

                random.randint(

                    story_min,

                    story_max,

                ),

                capacity,

            )

            if desired_group_size <= 0:
                break

            story_number += 1

            print()
            print("=" * 70)
            print(
                f"[{sender_name}] "
                f"STORY #{story_number}"
            )
            print("=" * 70)

            # ------------------------------------------------
            # RESOLVE UNTIL STORY IS FULL
            # ------------------------------------------------

            resolved_targets = []
            valid_usernames = []

            # Сколько элементов очереди мы уже проверили.
            consumed_count = 0

            for username in remaining:

                # Набрали нужное количество
                # валидных пользователей.
                if (
                    len(resolved_targets)
                    >= desired_group_size
                ):
                    break

                consumed_count += 1

                print()
                print(
                    f"[{sender_name}] "
                    f"🔎 Получаем @{username}..."
                )

                try:
                    target = await client.get_entity(
                        username
                    )

                    if not getattr(
                        target,
                        "username",
                        None,
                    ):
                        raise ValueError(
                            f"У @{username} "
                            "отсутствует username"
                        )

                except FloodWaitError:
                    raise

                except Exception as error:

                    mark_target_failed(
                        sender_name,
                        username,
                        error,
                    )

                    print(
                        f"[{sender_name}] "
                        f"⚠ @{username} пропущен: "
                        f"{type(error).__name__}: "
                        f"{error}"
                    )

                    await notify_target_error(

                        sender_name=sender_name,

                        username=username,

                        stage="resolve",

                        error=error,

                    )

                    continue

                print(
                    f"[{sender_name}] "
                    f"✓ @{target.username} "
                    f"ID={target.id}"
                )

                resolved_targets.append(
                    target
                )

                valid_usernames.append(
                    username
                )

            # Все usernames, которые мы уже проверили,
            # убираем из очереди ТОЛЬКО этого запуска.
            #
            # Невалидные при этом НЕ становятся processed.
            remaining = remaining[
                consumed_count:
            ]

            if not resolved_targets:

                print(
                    f"[{sender_name}] "
                    "⚠ Не удалось найти ни одного "
                    "валидного target для Story."
                )

                if not remaining:
                    break

                continue

            print()
            print(
                f"[{sender_name}] "
                f"Targets в Story: "
                f"{len(valid_usernames)}/"
                f"{desired_group_size}"
            )

            for username in valid_usernames:
                print(
                    f"  • @{username}"
                )

            # ------------------------------------------------
            # INTERACTIONS FOR WHOLE GROUP
            # ------------------------------------------------

            print()
            print(
                f"[{sender_name}] "
                "--- INTERACTIONS ---"
            )

            interaction_targets = []
            interaction_usernames = []

            for username, target in zip(
                valid_usernames,
                resolved_targets,
            ):

                try:
                    await create_test_interaction(
                        client,
                        target,
                    )

                except FloodWaitError:
                    raise

                except Exception as error:

                    mark_target_failed(
                        sender_name,
                        username,
                        error,
                    )

                    print(
                        f"[{sender_name}] "
                        f"⚠ Interaction для "
                        f"@{username} не выполнен: "
                        f"{type(error).__name__}: "
                        f"{error}"
                    )

                    await notify_target_error(

                        sender_name=sender_name,

                        username=username,

                        stage="interaction",

                        error=error,

                    )

                    continue

                interaction_targets.append(
                    target
                )

                interaction_usernames.append(
                    username
                )

            resolved_targets = (
                interaction_targets
            )

            valid_usernames = (
                interaction_usernames
            )

            if not resolved_targets:

                print(
                    f"[{sender_name}] "
                    "⚠ После interactions "
                    "не осталось доступных targets."
                )

                if not remaining:
                    break

                continue

            # ------------------------------------------------
            # WAIT ONCE AFTER ALL INTERACTIONS
            # ------------------------------------------------

            print()
            print(
                f"[{sender_name}] "
                f"✓ Все {len(resolved_targets)} "
                "interaction подготовлены"
            )

            print(
                f"[{sender_name}] "
                f"⏳ Ждём {INTERACTION_STORY_DELAY} сек. "
                "перед публикацией Story..."
            )

            await asyncio.sleep(

                interaction_delay

            )

            # ------------------------------------------------
            # ONE STORY FOR WHOLE GROUP
            # ------------------------------------------------

            print()
            print(
                f"[{sender_name}] "
                "--- STORY ---"
            )

            await repost_template_story(
                client,
                resolved_targets,
                sender_name,
            )

            # ------------------------------------------------
            # COMMIT STATE
            # ------------------------------------------------
            #
            # Только после успешного SendStoryRequest.
            # Если публикация упала, эта группа
            # processed не становится.
            # ------------------------------------------------

            added = mark_targets_processed(

                sender_name,

                valid_usernames,

            )

            # Only campaign-scoped runs write campaign journal.
            if campaign_id is not None:
                from src.campaign_progress import record_story_success
                record_story_success(campaign_id, sender_name, valid_usernames)

            print()
            print(
                f"[{sender_name}] "
                f"✓ Story #{story_number} завершена"
            )

            print(
                f"[{sender_name}] "
                f"В daily_count добавлено: {added}"
            )

            new_state = load_state(
                sender_name
            )

            await notify_story_success(
                sender_name=sender_name,
                story_number=story_number,
                usernames=valid_usernames,
                daily_count=new_state["daily_count"],
                daily_limit=daily_limit,
            )

            # ------------------------------------------------
            # CHECK IF ANOTHER STORY IS NEEDED
            # ------------------------------------------------

            capacity = remaining_daily_capacity(
                sender_name,
                TARGETS_PER_SENDER_PER_DAY,
            )

            if capacity <= 0:
                print(
                    f"[{sender_name}] "
                    "✓ Дневной лимит достигнут."
                )

                break

            if not remaining:
                print(
                    f"[{sender_name}] "
                    "✓ Allowlist на сегодня закончен."
                )

                break

            # ------------------------------------------------
            # INTERVAL
            # ------------------------------------------------

            delay = random.randint(

                interval_min,

                interval_max,

            )

            print()
            print(
                f"[{sender_name}] "
                f"Следующая Story через "
                f"{delay} сек."
            )

            await asyncio.sleep(delay)

    # ========================================================
    # FLOOD WAIT
    # ========================================================

    except FloodWaitError as error:

        wait_seconds = int(
            error.seconds
        )

        print()
        print("=" * 70)

        print(
            f"[{sender_name}] "
            f"⚠ FLOOD WAIT: "
            f"{wait_seconds} сек."
        )

        print(
            f"[{sender_name}] "
            "Telegram потребовал паузу."
        )

        print("=" * 70)

        set_sender_cooldown(
            sender_name,
            wait_seconds,
            error,
        )

        await notify_flood_wait(

            sender_name=sender_name,

            wait_seconds=wait_seconds,

            cooldown_until=get_cooldown_until(

                sender_name

            ),

            error=error,

        )

        return "cooldown"

    # ========================================================
    # OTHER ERROR
    # ========================================================

    except Exception as error:

        print()
        print("=" * 70)

        print(
            f"[{sender_name}] "
            "✗ ОШИБКА"
        )

        print(
            f"{type(error).__name__}: "
            f"{error}"
        )

        print(
            f"[{sender_name}] "
            "Worker остановлен."
        )

        print("=" * 70)

        set_sender_stopped(

            sender_name,

            error,

        )

        await notify_worker_stopped(

            sender_name=sender_name,

            error=error,

        )

        # Ошибка этого sender не должна

        # автоматически завершать другие workers.

        return "stopped"

    finally:

        if client.is_connected():
            await client.disconnect()

        print(
            f"[{sender_name}] "
            "Telegram отключён."
        )


async def main():

    print("=" * 70)
    print("TEGGER-TG — MULTI ACCOUNT")
    print("=" * 70)

    if DRY_RUN:
        print("🧪 DRY_RUN=true")

        print(
            "Telegram connections, interactions, "
            "Stories and state writes are disabled."
        )

        print("=" * 70)

    print(
        "Senders: "
        + ", ".join(SENDERS)
    )

    print(
        "Лимит targets / sender / сутки: "
        f"{TARGETS_PER_SENDER_PER_DAY}"
    )

    print(
        "Targets в одной Story: "
        f"{TARGETS_PER_STORY_MIN}–{TARGETS_PER_STORY_MAX}"
    )

    print(
        "Интервал между Stories: "
        f"{STORY_INTERVAL_MIN_SECONDS}–"
        f"{STORY_INTERVAL_MAX_SECONDS} сек."
    )

    print("=" * 70)

    await notify_campaign_started(
        dry_run=DRY_RUN,
        senders_count=len(SENDERS),
        daily_limit=TARGETS_PER_SENDER_PER_DAY,
        concurrent_senders=MAX_CONCURRENT_SENDERS,
    )

    # --------------------------------------------------------
    # STAGED BATCH EXECUTION
    # --------------------------------------------------------

    batch_size = MAX_CONCURRENT_SENDERS

    all_results = []

    for batch_start in range(
        0,
        len(SENDERS),
        batch_size,
    ):

        batch = SENDERS[
            batch_start:
            batch_start + batch_size
        ]

        print()
        print("=" * 70)

        print(
            "BATCH: "
            + ", ".join(batch)
        )

        print("=" * 70)

        # Только sender'ы текущего batch
        # работают одновременно.
        tasks = [
            asyncio.create_task(
                run_sender(sender_name)
            )
            for sender_name in batch
        ]

        batch_results = await asyncio.gather(
            *tasks,
            return_exceptions=True,
        )

        all_results.extend(
            zip(
                batch,
                batch_results,
            )
        )

        # ----------------------------------------------------
        # BATCH HEALTH CHECK
        # ----------------------------------------------------

        unhealthy = 0

        for sender_name, result in zip(
            batch,
            batch_results,
        ):
            if isinstance(result, BaseException):
                unhealthy += 1
                continue

            if isinstance(result, str) and result in {
                "cooldown",
                "stopped",
            }:
                unhealthy += 1

        print()
        print(
            f"Health batch: "
            f"{len(batch) - unhealthy}/"
            f"{len(batch)} healthy"
        )

        # ----------------------------------------------------
        # CIRCUIT BREAKER
        # ----------------------------------------------------
        #
        # Если сразу несколько sender получили
        # ограничения/ошибки, остальные аккаунты
        # в этом запуске не трогаем.
        # ----------------------------------------------------

        if unhealthy >= 2:

            print()

            print("=" * 70)

            print("⛔ CIRCUIT BREAKER")

            print(
                "Проблемных sender'ов: "
                f"{unhealthy}/{len(batch)}"
            )

            print(
                "Следующие batch автоматически "
                "не запускаются."
            )

            print("=" * 70)

            await notify_circuit_breaker(

                batch=batch,

                unhealthy=unhealthy,

            )

            break

    results_by_sender = dict(
        all_results
    )

    print()
    print("=" * 70)
    print("WORKERS ЗАВЕРШЕНЫ")
    print("=" * 70)

    for sender_name in SENDERS:

        if sender_name not in results_by_sender:

            print(
                f"○ {sender_name}: "
                "не запускался"
            )

            continue

        result = results_by_sender[
            sender_name
        ]

        if isinstance(
            result,
            BaseException,
        ):

            print(
                f"✗ {sender_name}: "
                f"{type(result).__name__}: "
                f"{result}"
            )

        elif result == "dry_run" or (

            isinstance(result, dict)

            and result.get("mode") == "DRY_RUN"

        ):

            print(
                f"🧪 {sender_name}: "
                "dry-run завершён"
            )

        elif result == "cooldown":

            print(
                f"⏳ {sender_name}: cooldown"
            )

        elif result == "stopped":

            print(
                f"⛔ {sender_name}: stopped"
            )

        else:

            print(

                f"✓ {sender_name}: завершён"

            )

    completed_count = 0

    dry_run_count = 0

    cooldown_count = 0

    stopped_count = 0

    exception_count = 0

    not_run_count = 0

    for sender_name in SENDERS:

        if sender_name not in results_by_sender:

            not_run_count += 1

            continue

        result = results_by_sender[

            sender_name

        ]

        if isinstance(

            result,

            BaseException,

        ):

            exception_count += 1

        elif result == "dry_run" or (

            isinstance(result, dict)

            and result.get("mode") == "DRY_RUN"

        ):

            dry_run_count += 1

        elif result == "cooldown":

            cooldown_count += 1

        elif result == "stopped":

            stopped_count += 1

        else:

            completed_count += 1

    await notify_campaign_finished(

        total_senders=len(SENDERS),

        completed=completed_count,

        dry_run=dry_run_count,

        cooldown=cooldown_count,

        stopped=stopped_count,

        exceptions=exception_count,

        not_run=not_run_count,

    )

if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--terminate-sessions",
        metavar="SENDER",
        help=(
            "завершить все сторонние Telegram-сессии "
            "выбранного sender, сохранив "
            "текущую Tegger-сессию"
        ),
    )

    parser.add_argument(
        "--list-sessions",
        metavar="SENDER",
        help=(
            "показать Telegram-сессии выбранного sender "
            "без каких-либо изменений"
        ),
    )

    args = parser.parse_args()

    try:

        if args.list_sessions:

            asyncio.run(
                list_sessions(
                    args.list_sessions
                )
            )

        elif args.terminate_sessions:

            asyncio.run(
                terminate_other_sessions(
                    args.terminate_sessions
                )
            )

        else:

            asyncio.run(
                main()
            )

    except KeyboardInterrupt:

        print(
            "\nОстановлено пользователем."
        )