import json

from config import DATA_DIR, SENDERS


MIGRATION_TARGETS_FILE = (
    DATA_DIR / "migration_targets.json"
)

ASSIGNMENTS_FILE = (
    DATA_DIR / "migration_assignments.json"
)


def normalize_username(username):
    """
    Приводит username к единому виду.

    @SomeUser -> someuser
    SomeUser  -> someuser
    """

    return (
        str(username or "")
        .strip()
        .lstrip("@")
        .lower()
    )


def load_master_targets():
    """
    Загружает единую базу пользователей
    старого бота.

    Файл:

    data/migration_targets.json

    Поддерживается полный JSON:

    [
        {
            "telegramId": "123456",
            "username": "Example"
        }
    ]

    Для распределения используется
    только username.
    """

    if not MIGRATION_TARGETS_FILE.exists():
        raise FileNotFoundError(
            "Не найден master allowlist: "
            f"{MIGRATION_TARGETS_FILE}"
        )

    try:
        raw = json.loads(
            MIGRATION_TARGETS_FILE.read_text(
                encoding="utf-8"
            )
        )

    except (
        json.JSONDecodeError,
        OSError,
    ) as error:

        raise RuntimeError(
            "Не удалось прочитать "
            "master allowlist "
            f"{MIGRATION_TARGETS_FILE}: "
            f"{error}"
        )

    if not isinstance(raw, list):
        raise ValueError(
            "migration_targets.json "
            "должен содержать JSON-массив"
        )

    targets = []
    seen = set()

    for item in raw:

        # Разрешаем также простой
        # JSON-массив usernames.
        if isinstance(item, str):

            username = normalize_username(
                item
            )

        elif isinstance(item, dict):

            username = normalize_username(
                item.get("username")
            )

        else:
            continue

        if not username:
            continue

        # Дедупликация общей базы.
        if username in seen:
            continue

        seen.add(username)

        targets.append(
            username
        )

    return targets


def _validate_senders():
    """
    Проверяет список sender'ов
    из .env/config.py.
    """

    senders = [
        str(sender).strip()
        for sender in SENDERS
        if str(sender).strip()
    ]

    if not senders:
        raise RuntimeError(
            "В SENDERS не указан "
            "ни один sender"
        )

    if len(senders) != len(set(senders)):
        raise RuntimeError(
            "В SENDERS обнаружены дубли"
        )

    return senders


def build_assignments():
    """
    ОДИН РАЗ распределяет master allowlist
    между sender'ами.

    Используется round-robin:

    target_1  -> sender_1
    target_2  -> sender_2
    ...
    target_10 -> sender_10
    target_11 -> sender_1
    ...

    Результат сохраняется:

    data/migration_assignments.json

    После создания этого файла
    распределение автоматически
    НЕ меняется.
    """

    senders = _validate_senders()

    targets = load_master_targets()

    assignments = {
        sender: []
        for sender in senders
    }

    for index, username in enumerate(
        targets
    ):

        sender = senders[
            index % len(senders)
        ]

        assignments[
            sender
        ].append(
            username
        )

    payload = {
        "senders": senders,
        "total_targets": len(targets),
        "assignments": assignments,
    }

    temp_path = (
        ASSIGNMENTS_FILE.with_suffix(
            ".json.tmp"
        )
    )

    temp_path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    temp_path.replace(
        ASSIGNMENTS_FILE
    )

    return payload


def load_assignments():
    """
    Загружает постоянное распределение
    targets между sender'ами.

    Если migration_assignments.json
    ещё не существует, он создаётся.

    ВАЖНО:

    после создания assignments изменение
    SENDERS не приводит к автоматическому
    перераспределению пользователей.
    """

    if not ASSIGNMENTS_FILE.exists():

        return build_assignments()

    try:
        payload = json.loads(
            ASSIGNMENTS_FILE.read_text(
                encoding="utf-8"
            )
        )

    except (
        json.JSONDecodeError,
        OSError,
    ) as error:

        raise RuntimeError(
            "Не удалось прочитать "
            "assignments "
            f"{ASSIGNMENTS_FILE}: "
            f"{error}"
        )

    if not isinstance(
        payload,
        dict,
    ):
        raise ValueError(
            "migration_assignments.json "
            "имеет неверный формат"
        )

    assignments = payload.get(
        "assignments"
    )

    if not isinstance(
        assignments,
        dict,
    ):
        raise ValueError(
            "В migration_assignments.json "
            "отсутствует assignments"
        )

    return payload


def load_targets(sender_name):
    """
    Возвращает постоянную allowlist
    конкретного sender.
    """

    sender_name = str(
        sender_name
    ).strip()

    payload = load_assignments()

    assignments = payload[
        "assignments"
    ]

    if sender_name not in assignments:

        raise KeyError(
            f"Sender {sender_name!r} "
            "отсутствует в "
            "migration_assignments.json. "
            "Не пересоздавай assignments "
            "во время кампании."
        )

    targets = []
    seen = set()

    for value in assignments[
        sender_name
    ]:

        username = normalize_username(
            value
        )

        if not username:
            continue

        if username in seen:
            continue

        seen.add(username)

        targets.append(
            username
        )

    return targets


def get_remaining_targets(sender_name, processed):
    """Read-only union of processed history across all senders for Migration.

    This is NOT a concurrency lock or exactly-once delivery guarantee.
    """
    from pathlib import Path

    processed_normalized = {
        normalized
        for value in processed
        if (normalized := normalize_username(value))
    }

    for state_path in sorted(Path(DATA_DIR).glob("*/state.json")):
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot read {state_path}; migration stopped") from exc
        if not isinstance(state, dict) or not isinstance(state.get("processed", []), list):
            raise RuntimeError(f"Invalid processed state in {state_path}; migration stopped")
        processed_normalized.update(
            normalized
            for value in state.get("processed", [])
            if (normalized := normalize_username(value))
        )

    legacy_path = Path(DATA_DIR) / "processed.txt"
    if legacy_path.exists():
        try:
            processed_normalized.update(
                normalized
                for value in legacy_path.read_text(encoding="utf-8").splitlines()
                if (normalized := normalize_username(value))
            )
        except OSError as exc:
            raise RuntimeError("Cannot read processed.txt; migration stopped") from exc

    return [
        username for username in load_targets(sender_name)
        if username not in processed_normalized
    ]


def get_assignment_stats():
    """
    Статистика распределения.

    Например:

    {
        "sender_01": 374,
        "sender_02": 374,
        ...
    }

    Используем для dry-run
    перед реальным запуском.
    """

    payload = load_assignments()

    return {
        sender: len(targets)
        for sender, targets
        in payload[
            "assignments"
        ].items()
    }