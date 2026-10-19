import json
from datetime import date, datetime, timedelta, timezone

from config import DATA_DIR


STATUS_ACTIVE = "active"
STATUS_COOLDOWN = "cooldown"
STATUS_STOPPED = "stopped"

VALID_STATUSES = {
    STATUS_ACTIVE,
    STATUS_COOLDOWN,
    STATUS_STOPPED,
}


def normalize_username(username):
    """
    Приводит username к единому формату.

    @SomeUser -> someuser
    SomeUser  -> someuser
    someuser  -> someuser
    """
    return (
        str(username or "")
        .strip()
        .lstrip("@")
        .lower()
    )


def get_sender_dir(sender_name, *, create=True):

    sender_dir = DATA_DIR / sender_name

    if create:

        sender_dir.mkdir(parents=True, exist_ok=True)

    return sender_dir


def get_state_path(sender_name, *, create=True):
    return get_sender_dir(
        sender_name,
        create=create,
    ) / "state.json"


def default_state():
    """
    Начальное состояние sender.
    """
    return {
        "date": date.today().isoformat(),
        "daily_count": 0,
        "processed": [],
        "failed": {},
        "status": STATUS_ACTIVE,
        "cooldown_until": None,
        "last_error": None,
    }


def load_state(sender_name, *, read_only=False):
    """
    Загружает состояние конкретного sender.

    processed:
        сохраняется постоянно.

    failed:
        сохраняется постоянно.

    daily_count:
        автоматически сбрасывается
        при наступлении нового дня.

    Старые state.json автоматически
    дополняются новыми полями.
    """

    state_path = get_state_path(

        sender_name,

        create=not read_only,

    )

    if not state_path.exists():
        state = default_state()

        if not read_only:
            save_state(sender_name, state)

        return state

    try:
        with state_path.open(
            "r",
            encoding="utf-8",
        ) as file:
            state = json.load(file)

    except (
        json.JSONDecodeError,
        OSError,
    ) as error:
        raise RuntimeError(
            f"Не удалось прочитать "
            f"{state_path}: {error}"
        )

    defaults = default_state()

    changed = False

    # Добавляем отсутствующие поля
    # в старые state.json.
    for key, value in defaults.items():

        if key not in state:
            state[key] = value
            changed = True

    # Нормализуем processed.
    normalized_processed = sorted(
        {
            normalized
            for username in state.get(
                "processed",
                [],
            )
            if (
                normalized
                := normalize_username(
                    username
                )
            )
        }
    )

    if (
        normalized_processed
        != state.get(
            "processed",
            [],
        )
    ):
        state["processed"] = (
            normalized_processed
        )

        changed = True

    # Проверяем failed.
    if not isinstance(
        state.get("failed"),
        dict,
    ):
        state["failed"] = {}
        changed = True

    # Проверяем статус.
    if (
        state.get("status")
        not in VALID_STATUSES
    ):
        state["status"] = (
            STATUS_ACTIVE
        )

        state["cooldown_until"] = None

        changed = True

    today = date.today().isoformat()

    # Новый день:
    # сбрасываем только daily_count.
    #
    # processed НЕ очищается.
    # failed НЕ очищается.
    if state["date"] != today:

        state["date"] = today
        state["daily_count"] = 0

        changed = True

    # Проверяем, закончился ли cooldown.
    if (
        state.get("status")
        == STATUS_COOLDOWN
    ):

        cooldown_until = state.get(
            "cooldown_until"
        )

        if cooldown_until:

            try:
                until = (
                    datetime.fromisoformat(
                        cooldown_until
                    )
                )

                now = datetime.now(
                    timezone.utc
                )

                if until.tzinfo is None:
                    until = until.replace(
                        tzinfo=timezone.utc
                    )

                if now >= until:

                    state["status"] = (
                        STATUS_ACTIVE
                    )

                    state[
                        "cooldown_until"
                    ] = None

                    changed = True

            except (
                TypeError,
                ValueError,
            ):
                # Если cooldown повреждён,
                # безопаснее остановить sender.
                state["status"] = (
                    STATUS_STOPPED
                )

                state[
                    "cooldown_until"
                ] = None

                state["last_error"] = (
                    "Некорректное значение "
                    "cooldown_until "
                    "в state.json"
                )

                changed = True

    if changed and not read_only:

        save_state(
            sender_name,
            state,
        )

    return state


def save_state(
    sender_name,
    state,
):
    """
    Атомарно сохраняет state.json.

    Сначала пишем .tmp,
    затем заменяем основной файл.
    """

    state_path = get_state_path(
        sender_name
    )

    temp_path = (
        state_path.with_suffix(
            ".json.tmp"
        )
    )

    with temp_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            state,
            file,
            ensure_ascii=False,
            indent=2,
        )

    temp_path.replace(
        state_path
    )


def get_daily_count(sender_name):
    """
    Сколько targets sender
    успешно обработал сегодня.
    """

    state = load_state(
        sender_name
    )

    return int(
        state.get(
            "daily_count",
            0,
        )
    )


def get_processed(sender_name):
    """
    Возвращает множество уже
    успешно обработанных usernames.
    """

    state = load_state(
        sender_name
    )

    return set(
        state.get(
            "processed",
            [],
        )
    )


def get_failed(sender_name):
    """
    Возвращает ошибки targets.
    """

    state = load_state(
        sender_name
    )

    return dict(
        state.get(
            "failed",
            {},
        )
    )


def mark_targets_processed(
    sender_name,
    usernames,
):
    """
    Вызывать только после успешной
    публикации Story.

    Успешные usernames:

    1. добавляются в processed;
    2. удаляются из failed;
    3. увеличивают daily_count.
    """

    state = load_state(
        sender_name
    )

    processed = set(
        state.get(
            "processed",
            [],
        )
    )

    failed = dict(
        state.get(
            "failed",
            {},
        )
    )

    added_count = 0

    for username in usernames:

        username = (
            normalize_username(
                username
            )
        )

        if not username:
            continue

        # Если раньше была ошибка,
        # после успеха её убираем.
        failed.pop(
            username,
            None,
        )

        if username in processed:
            continue

        processed.add(
            username
        )

        added_count += 1

    state["processed"] = sorted(
        processed
    )

    state["failed"] = failed

    state["daily_count"] = (
        int(
            state.get(
                "daily_count",
                0,
            )
        )
        + added_count
    )

    save_state(
        sender_name,
        state,
    )

    return added_count


def mark_target_failed(
    sender_name,
    username,
    error,
):
    """
    Записывает ошибку конкретного target.

    Target при этом НЕ считается
    успешно обработанным.
    """

    username = normalize_username(
        username
    )

    if not username:
        return

    state = load_state(
        sender_name
    )

    failed = dict(
        state.get(
            "failed",
            {},
        )
    )

    previous = failed.get(
        username,
        {},
    )

    failed[username] = {
        "count": (
            int(
                previous.get(
                    "count",
                    0,
                )
            )
            + 1
        ),
        "last_error": str(
            error
        ),
        "updated_at": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),
    }

    state["failed"] = failed

    save_state(
        sender_name,
        state,
    )


def get_sender_status(sender_name, *, read_only=False):
    state = load_state(
        sender_name,
        read_only=read_only,
    )

    return state.get(
        "status",
        STATUS_ACTIVE,
    )


def get_cooldown_until(
    sender_name,
):
    """
    Возвращает время окончания
    cooldown либо None.
    """

    state = load_state(
        sender_name
    )

    return state.get(
        "cooldown_until"
    )


def set_sender_active(
    sender_name,
):
    """
    Возвращает sender
    в рабочее состояние.
    """

    state = load_state(
        sender_name
    )

    state["status"] = (
        STATUS_ACTIVE
    )

    state["cooldown_until"] = None
    state["last_error"] = None

    save_state(
        sender_name,
        state,
    )


def set_sender_cooldown(
    sender_name,
    seconds,
    error=None,
):
    """
    Переводит sender в cooldown
    на срок, который вернул Telegram.
    """

    seconds = max(
        0,
        int(seconds),
    )

    until = (
        datetime.now(
            timezone.utc
        )
        + timedelta(
            seconds=seconds
        )
    )

    state = load_state(
        sender_name
    )

    state["status"] = (
        STATUS_COOLDOWN
    )

    state["cooldown_until"] = (
        until.isoformat()
    )

    state["last_error"] = (
        str(error)
        if error
        else None
    )

    save_state(
        sender_name,
        state,
    )

    return until


def set_sender_stopped(
    sender_name,
    error=None,
):
    """
    Полностью останавливает sender
    до ручного восстановления.
    """

    state = load_state(
        sender_name
    )

    state["status"] = (
        STATUS_STOPPED
    )

    state["cooldown_until"] = None

    state["last_error"] = (
        str(error)
        if error
        else None
    )

    save_state(
        sender_name,
        state,
    )


def remaining_daily_capacity(
    sender_name,
    daily_limit,
):
    """
    Сколько targets sender
    ещё может обработать сегодня.
    """

    used = get_daily_count(
        sender_name
    )

    return max(
        0,
        int(daily_limit) - used,
    )


def daily_limit_reached(
    sender_name,
    daily_limit,
):
    """
    Достигнут ли дневной лимит.
    """

    return (
        remaining_daily_capacity(
            sender_name,
            daily_limit,
        )
        <= 0
    )