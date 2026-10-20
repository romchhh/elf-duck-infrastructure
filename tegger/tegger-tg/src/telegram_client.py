import os

from urllib.parse import (
    unquote,
    urlparse,
)

import socks

from telethon import TelegramClient

from config import (
    DATA_DIR,
    SESSIONS_DIR,
    SENDER_PROXIES,
)
from runtime_telegram import get_api_credentials


def _parse_socks5_proxy(
    proxy_url: str,
):
    """
    Преобразует:

    socks5://user:password@host:port

    в формат proxy для Telethon.
    """

    proxy_url = str(
        proxy_url or ""
    ).strip()

    if not proxy_url:
        return None

    parsed = urlparse(
        proxy_url
    )

    if (
        parsed.scheme.lower()
        != "socks5"
    ):
        raise ValueError(
            "Поддерживается только "
            "SOCKS5 proxy"
        )

    if not parsed.hostname:
        raise ValueError(
            "В proxy отсутствует host"
        )

    if parsed.port is None:
        raise ValueError(
            "В proxy отсутствует port"
        )

    username = (
        unquote(
            parsed.username
        )
        if parsed.username is not None
        else None
    )

    password = (
        unquote(
            parsed.password
        )
        if parsed.password is not None
        else None
    )

    return (
        socks.SOCKS5,
        parsed.hostname,
        parsed.port,
        True,
        username,
        password,
    )


def create_client(
    sender_name: str,
) -> TelegramClient:
    """
    Создаёт TelegramClient
    конкретного sender.

    Session:

    sessions/<sender_name>.session

    Если для sender задан proxy,
    используется закреплённый за ним
    SOCKS5.

    Если proxy отсутствует,
    используется прямое соединение.
    """

    sender_name = (
        sender_name.strip()
    )

    if not sender_name:
        raise ValueError(
            "sender_name не может "
            "быть пустым"
        )

    if (
        "/" in sender_name
        or "\\" in sender_name
        or sender_name in {
            ".",
            "..",
        }
    ):
        raise ValueError(
            f"Некорректное имя sender: "
            f"{sender_name!r}"
        )

    session_path = (
        SESSIONS_DIR
        / sender_name
    )

    if sender_name == "sender_test":
        proxy_url = os.getenv("PROXY_SENDER_TEST", "")
        if not proxy_url:
            raise ValueError(
                "PROXY_SENDER_TEST не настроен"
            )
    else:
        proxy_url = SENDER_PROXIES.get(
            sender_name,
            "",
        )
        if not proxy_url:
            # UI-added accounts store proxy in ui_added_accounts.json
            try:
                import json
                from pathlib import Path

                added_path = Path(DATA_DIR) / "ui_added_accounts.json"
                if added_path.is_file():
                    items = json.loads(added_path.read_text(encoding="utf-8"))
                    if isinstance(items, list):
                        match = next(
                            (
                                item
                                for item in items
                                if isinstance(item, dict)
                                and item.get("id") == sender_name
                            ),
                            None,
                        )
                        if match:
                            proxy_url = str(match.get("proxy") or "")
            except (OSError, ValueError, TypeError):
                pass

    proxy = _parse_socks5_proxy(
        proxy_url
    )

    api_id, api_hash = get_api_credentials(
        require_configured=True,
    )

    return TelegramClient(
        str(session_path),
        api_id,
        api_hash,
        proxy=proxy,
    )