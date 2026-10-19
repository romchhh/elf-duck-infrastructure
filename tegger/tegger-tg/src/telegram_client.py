import os

from urllib.parse import (
    unquote,
    urlparse,
)

import socks

from telethon import TelegramClient

from config import (
    API_ID,
    API_HASH,
    SESSIONS_DIR,
    SENDER_PROXIES,
)


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

    proxy = _parse_socks5_proxy(
        proxy_url
    )

    return TelegramClient(
        str(session_path),
        API_ID,
        API_HASH,
        proxy=proxy,
    )