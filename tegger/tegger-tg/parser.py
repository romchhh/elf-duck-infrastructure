import asyncio
import csv
import os

from collections import defaultdict
from datetime import (
    datetime,
    timedelta,
    timezone,
)
from pathlib import Path

from dotenv import load_dotenv

from telethon import (
    TelegramClient,
    types,
)
from telethon.errors import FloodWaitError

from telethon.tl.functions.messages import (
    CheckChatInviteRequest,
)

from config import (
    API_ID,
    API_HASH,
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

SESSIONS_DIR = (
    BASE_DIR
    / "sessions"
)

SESSIONS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

load_dotenv(
    BASE_DIR / ".env"
)


# ============================================================
# CONFIG
# ============================================================

PARSER_SESSION = os.getenv(
    "PARSER_SESSION",
    "parser",
).strip()

PARSER_CHAT = os.getenv(
    "PARSER_CHAT",
    "",
).strip()

PARSER_HISTORY_DAYS = int(
    os.getenv(
        "PARSER_HISTORY_DAYS",
        "30",
    )
)

PARSER_MIN_ACTIVE_DAYS = int(
    os.getenv(
        "PARSER_MIN_ACTIVE_DAYS",
        "3",
    )
)

PARSER_ACTIVITY_FILTER = os.getenv(
    "PARSER_ACTIVITY_FILTER",
    "any",
).strip().lower()

PARSER_PREMIUM_FILTER = os.getenv(
    "PARSER_PREMIUM_FILTER",
    "any",
).strip().lower()

PARSER_AVATAR_FILTER = os.getenv(
    "PARSER_AVATAR_FILTER",
    "any",
).strip().lower()

PARSER_REQUIRE_USERNAME = (
    os.getenv(
        "PARSER_REQUIRE_USERNAME",
        "yes",
    )
    .strip()
    .lower()
)

PARSER_OUTPUT_DIR = os.getenv(
    "PARSER_OUTPUT_DIR",
    "data/parser",
).strip()


# ============================================================
# VALIDATION
# ============================================================

if not PARSER_CHAT:
    raise RuntimeError(
        "PARSER_CHAT не указан в .env"
    )

if PARSER_HISTORY_DAYS < 1:
    raise RuntimeError(
        "PARSER_HISTORY_DAYS должен быть >= 1"
    )

if PARSER_MIN_ACTIVE_DAYS < 1:
    raise RuntimeError(
        "PARSER_MIN_ACTIVE_DAYS должен быть >= 1"
    )

if PARSER_ACTIVITY_FILTER not in {
    "24h",
    "48h",
    "recently",
    "24h_recently",
    "48h_recently",
    "any",
}:
    raise RuntimeError(
        "Некорректный PARSER_ACTIVITY_FILTER"
    )

if PARSER_PREMIUM_FILTER not in {
    "yes",
    "no",
    "any",
}:
    raise RuntimeError(
        "Некорректный PARSER_PREMIUM_FILTER"
    )

if PARSER_AVATAR_FILTER not in {
    "yes",
    "no",
    "any",
}:
    raise RuntimeError(
        "Некорректный PARSER_AVATAR_FILTER"
    )

if PARSER_REQUIRE_USERNAME not in {
    "yes",
    "no",
}:
    raise RuntimeError(
        "PARSER_REQUIRE_USERNAME "
        "должен быть yes или no"
    )


# ============================================================
# CLIENT
# ============================================================

SESSION_PATH = (
    SESSIONS_DIR
    / PARSER_SESSION
)

client = TelegramClient(
    str(SESSION_PATH),
    API_ID,
    API_HASH,
)


# ============================================================
# CHAT RESOLVER
# ============================================================

async def resolve_chat(value):
    value = value.strip()

    # --------------------------------------------------------
    # PRIVATE INVITE
    # --------------------------------------------------------

    if (
        "t.me/+" in value
        or "telegram.me/+" in value
    ):
        try:
            invite_hash = (
                value
                .split("+", 1)[1]
                .split("?", 1)[0]
                .strip("/")
            )

        except Exception:
            raise RuntimeError(
                "Не удалось получить hash "
                "приватной ссылки."
            )

        print(
            "Проверяем приватную "
            "invite-ссылку..."
        )

        invite = await client(
            CheckChatInviteRequest(
                invite_hash
            )
        )

        if isinstance(
            invite,
            types.ChatInviteAlready,
        ):
            print(
                "✓ Аккаунт уже имеет "
                "доступ к чату"
            )

            return invite.chat

        if isinstance(
            invite,
            types.ChatInvite,
        ):
            title = (
                getattr(
                    invite,
                    "title",
                    None,
                )
                or "Без названия"
            )

            raise RuntimeError(
                f'Чат "{title}" найден, '
                "но аккаунт parser "
                "не состоит в нём."
            )

        raise RuntimeError(
            "Telegram не вернул "
            "доступный чат."
        )

    # --------------------------------------------------------
    # PUBLIC LINK
    # --------------------------------------------------------

    for domain in (
        "t.me/",
        "telegram.me/",
    ):
        if domain in value:
            value = (
                value
                .split(domain, 1)[1]
                .split("?", 1)[0]
                .strip("/")
            )

            break

    value = value.lstrip("@")

    try:
        return await client.get_entity(
            value
        )

    except Exception as error:
        raise RuntimeError(
            f"Не удалось открыть чат: "
            f"{error}"
        )


# ============================================================
# TELEGRAM STATUS
# ============================================================

def get_telegram_status(user):
    status = getattr(
        user,
        "status",
        None,
    )

    if isinstance(
        status,
        types.UserStatusOnline,
    ):
        return (
            "online",
            datetime.now(
                timezone.utc
            ),
        )

    if isinstance(
        status,
        types.UserStatusOffline,
    ):
        return (
            "exact",
            status.was_online,
        )

    if isinstance(
        status,
        types.UserStatusRecently,
    ):
        return (
            "recently",
            None,
        )

    if isinstance(
        status,
        types.UserStatusLastWeek,
    ):
        return (
            "last_week",
            None,
        )

    if isinstance(
        status,
        types.UserStatusLastMonth,
    ):
        return (
            "last_month",
            None,
        )

    return (
        "unknown",
        None,
    )


# ============================================================
# SAFE UTC
# ============================================================

def ensure_utc(value):
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


# ============================================================
# ACTIVITY FILTER
# ============================================================

def passes_activity_filter(
    status_name,
    last_seen,
):
    selected = (
        PARSER_ACTIVITY_FILTER
    )

    now = datetime.now(
        timezone.utc
    )

    if selected == "any":
        return True

    if selected == "recently":
        return (
            status_name
            == "recently"
        )

    if selected == "24h":
        if status_name == "online":
            return True

        return (
            status_name == "exact"
            and last_seen is not None
            and now - last_seen
            <= timedelta(hours=24)
        )

    if selected == "48h":
        if status_name == "online":
            return True

        return (
            status_name == "exact"
            and last_seen is not None
            and now - last_seen
            <= timedelta(hours=48)
        )

    if selected == "24h_recently":
        if status_name in {
            "online",
            "recently",
        }:
            return True

        return (
            status_name == "exact"
            and last_seen is not None
            and now - last_seen
            <= timedelta(hours=24)
        )

    if selected == "48h_recently":
        if status_name in {
            "online",
            "recently",
        }:
            return True

        return (
            status_name == "exact"
            and last_seen is not None
            and now - last_seen
            <= timedelta(hours=48)
        )

    return False


# ============================================================
# YES / NO / ANY FILTER
# ============================================================

def passes_three_way_filter(
    value,
    selected,
):
    if selected == "yes":
        return value is True

    if selected == "no":
        return value is False

    return True


# ============================================================
# MAIN
# ============================================================

async def main():
    print()
    print("=" * 70)
    print("TEGGER-TG — CHAT PARSER")
    print("=" * 70)

    await client.connect()
    if not await client.is_user_authorized():
        raise RuntimeError("Сессия аккаунта-парсера не авторизована. Авторизуй аккаунт в Tegger.")

    me = await client.get_me()

    account_name = (
        me.first_name
        or "Без имени"
    )

    account_username = (
        f"@{me.username}"
        if me.username
        else "без username"
    )

    print(
        f"Parser session: "
        f"{PARSER_SESSION}"
    )

    print(
        f"Аккаунт: "
        f"{account_name} "
        f"{account_username}"
    )

    print(
        f"Чат: {PARSER_CHAT}"
    )

    print(
        f"История: "
        f"{PARSER_HISTORY_DAYS} дней"
    )

    print(
        f"Минимум активных дней: "
        f"{PARSER_MIN_ACTIVE_DAYS}"
    )

    print(
        f"Activity: "
        f"{PARSER_ACTIVITY_FILTER}"
    )

    print(
        f"Premium: "
        f"{PARSER_PREMIUM_FILTER}"
    )

    print(
        f"Avatar: "
        f"{PARSER_AVATAR_FILTER}"
    )

    print(
        f"Require username: "
        f"{PARSER_REQUIRE_USERNAME}"
    )

    print("=" * 70)

    # ========================================================
    # CHAT
    # ========================================================

    chat = await resolve_chat(
        PARSER_CHAT
    )

    chat_name = (
        getattr(
            chat,
            "title",
            None,
        )
        or getattr(
            chat,
            "username",
            None,
        )
        or str(
            getattr(
                chat,
                "id",
                "unknown",
            )
        )
    )

    print(
        f"\n✓ Чат открыт: "
        f"{chat_name}"
    )

    # ========================================================
    # TIME RANGES
    # ========================================================

    now = datetime.now(
        timezone.utc
    )

    history_start = (
        now
        - timedelta(
            days=PARSER_HISTORY_DAYS
        )
    )

    seven_days_start = (
        now
        - timedelta(days=7)
    )

    day_start = (
        now
        - timedelta(hours=24)
    )

    # ========================================================
    # DATA
    # ========================================================

    users = {}

    active_days = defaultdict(
        set
    )

    messages_history = defaultdict(
        int
    )

    messages_7d = defaultdict(
        int
    )

    messages_24h = defaultdict(
        int
    )

    last_message = {}

    processed_messages = 0

    print(
        "\nЧитаем историю сообщений..."
    )

    # ========================================================
    # READ HISTORY
    # ========================================================

    try:
        async for message in client.iter_messages(
            chat
        ):
            message_date = ensure_utc(
                message.date
            )

            if message_date is None:
                continue

            if message_date < history_start:
                break

            processed_messages += 1

            sender = getattr(
                message,
                "sender",
                None,
            )

            if sender is None:
                try:
                    sender = (
                        await message.get_sender()
                    )
                except Exception:
                    continue

            if not isinstance(
                sender,
                types.User,
            ):
                continue

            if sender.deleted:
                continue

            if sender.bot:
                continue

            user_id = sender.id

            users[user_id] = sender

            active_days[user_id].add(
                message_date.date()
            )

            messages_history[
                user_id
            ] += 1

            if (
                message_date
                >= seven_days_start
            ):
                messages_7d[
                    user_id
                ] += 1

            if (
                message_date
                >= day_start
            ):
                messages_24h[
                    user_id
                ] += 1

            previous = last_message.get(
                user_id
            )

            if (
                previous is None
                or message_date > previous
            ):
                last_message[
                    user_id
                ] = message_date

            if (
                processed_messages
                % 500
                == 0
            ):
                print(
                    "\r"
                    f"Сообщений: "
                    f"{processed_messages:,} | "
                    f"Авторов: "
                    f"{len(users):,}",
                    end="",
                    flush=True,
                )

    except FloodWaitError as error:
        print()
        print(
            "Telegram запросил "
            f"FloodWait: "
            f"{error.seconds} сек."
        )

        return

    print(
        "\r"
        f"Сообщений: "
        f"{processed_messages:,} | "
        f"Авторов: "
        f"{len(users):,}"
    )

    # ========================================================
    # CANDIDATES
    # ========================================================

    candidates = []

    for user_id, user in users.items():
        days_count = len(
            active_days[user_id]
        )

        if (
            days_count
            < PARSER_MIN_ACTIVE_DAYS
        ):
            continue

        if user.deleted:
            continue

        if user.bot:
            continue

        candidates.append(
            user_id
        )

    print(
        f"\nУникальных авторов: "
        f"{len(users):,}"
    )

    print(
        f"≥{PARSER_MIN_ACTIVE_DAYS} "
        f"активных дней: "
        f"{len(candidates):,}"
    )

    # ========================================================
    # FILTER
    # ========================================================

    results = []

    print(
        "\nПрименяем фильтры..."
    )

    total_candidates = len(
        candidates
    )

    for index, user_id in enumerate(
        candidates,
        start=1,
    ):
        user = users[user_id]

        premium = bool(
            getattr(
                user,
                "premium",
                False,
            )
        )

        if not passes_three_way_filter(
            premium,
            PARSER_PREMIUM_FILTER,
        ):
            continue

        has_avatar = (
            getattr(
                user,
                "photo",
                None,
            )
            is not None
        )

        if not passes_three_way_filter(
            has_avatar,
            PARSER_AVATAR_FILTER,
        ):
            continue

        username = getattr(
            user,
            "username",
            None,
        )

        if (
            PARSER_REQUIRE_USERNAME
            == "yes"
            and not username
        ):
            continue

        (
            status_name,
            last_seen,
        ) = get_telegram_status(
            user
        )

        last_seen = ensure_utc(
            last_seen
        )

        if not passes_activity_filter(
            status_name,
            last_seen,
        ):
            continue

        results.append(
            {
                "user_id": user.id,

                "username": (
                    f"@{username}"
                    if username
                    else ""
                ),

                "first_name": (
                    user.first_name
                    or ""
                ),

                "last_name": (
                    user.last_name
                    or ""
                ),

                "premium": premium,

                "has_avatar": (
                    has_avatar
                ),

                "telegram_status": (
                    status_name
                ),

                "telegram_last_seen": (
                    last_seen.isoformat()
                    if last_seen
                    else ""
                ),

                "last_message_at": (
                    last_message[
                        user_id
                    ].isoformat()
                ),

                "active_days": len(
                    active_days[
                        user_id
                    ]
                ),

                "messages_history": (
                    messages_history[
                        user_id
                    ]
                ),

                "messages_7d": (
                    messages_7d[
                        user_id
                    ]
                ),

                "messages_24h": (
                    messages_24h[
                        user_id
                    ]
                ),
            }
        )

        if (
            index % 100 == 0
            or index
            == total_candidates
        ):
            percent = (
                index
                / total_candidates
                * 100
            ) if total_candidates else 100

            print(
                "\r"
                f"Проверено: "
                f"{index}/"
                f"{total_candidates} "
                f"({percent:.1f}%) | "
                f"Прошли: "
                f"{len(results)}",
                end="",
                flush=True,
            )

    # ========================================================
    # SORT
    # ========================================================

    results.sort(
        key=lambda item: (
            item["active_days"],
            item["messages_7d"],
            item["messages_history"],
        ),
        reverse=True,
    )

    # ========================================================
    # OUTPUT
    # ========================================================

    output_dir = (
        BASE_DIR
        / PARSER_OUTPUT_DIR
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    timestamp = datetime.now().strftime(
        "%Y-%m-%d_%H-%M-%S"
    )

    safe_chat_name = "".join(
        character
        if (
            character.isalnum()
            or character in "-_"
        )
        else "_"
        for character in str(
            chat_name
        )
    )

    output_path = (
        output_dir
        / (
            f"{safe_chat_name}_"
            f"{timestamp}.csv"
        )
    )

    fields = [
        "user_id",
        "username",
        "first_name",
        "last_name",
        "premium",
        "has_avatar",
        "telegram_status",
        "telegram_last_seen",
        "last_message_at",
        "active_days",
        "messages_history",
        "messages_7d",
        "messages_24h",
    ]

    with output_path.open(
        "w",
        newline="",
        encoding="utf-8-sig",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fields,
        )

        writer.writeheader()
        writer.writerows(
            results
        )

    # ========================================================
    # STATISTICS
    # ========================================================

    premium_count = sum(
        1
        for item in results
        if item["premium"]
    )

    avatar_count = sum(
        1
        for item in results
        if item["has_avatar"]
    )

    username_count = sum(
        1
        for item in results
        if item["username"]
    )

    print()
    print()
    print("=" * 70)
    print("ГОТОВО")
    print("=" * 70)

    print(
        f"Чат: {chat_name}"
    )

    print(
        f"Сообщений обработано: "
        f"{processed_messages:,}"
    )

    print(
        f"Уникальных авторов: "
        f"{len(users):,}"
    )

    print(
        f"≥{PARSER_MIN_ACTIVE_DAYS} "
        f"активных дней: "
        f"{len(candidates):,}"
    )

    print(
        f"После фильтров: "
        f"{len(results):,}"
    )

    print()
    print(
        f"Premium: "
        f"{premium_count:,}"
    )

    print(
        f"С аватаром: "
        f"{avatar_count:,}"
    )

    print(
        f"С username: "
        f"{username_count:,}"
    )

    print()
    print("CSV:")
    print(output_path)

    print("=" * 70)


# ============================================================
# START
# ============================================================

async def run():
    try:
        await main()

    finally:
        if client.is_connected():
            await client.disconnect()


if __name__ == "__main__":
    asyncio.run(
        run()
    )