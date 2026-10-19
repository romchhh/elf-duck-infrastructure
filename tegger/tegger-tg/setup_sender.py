from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

from telethon.tl.functions.account import (
    UpdatePersonalChannelRequest,
    UpdateProfileRequest,
    UpdateUsernameRequest,
)

from telethon.tl.functions.photos import (
    UploadProfilePhotoRequest,
)

from telethon.tl.functions.channels import (
    CreateChannelRequest,
    EditPhotoRequest,
    UpdateUsernameRequest as UpdateChannelUsernameRequest,
)

from src.telegram_client import create_client


BASE_DIR = Path(__file__).resolve().parent

load_dotenv(
    BASE_DIR / ".env"
)


# ============================================================
# ENV HELPERS
# ============================================================


def env(name: str, default: str = "") -> str:
    return os.getenv(
        name,
        default,
    ).strip()


def sender_env_key(
    prefix: str,
    sender_name: str,
) -> str:

    normalized = "".join(
        char.upper()
        if char.isalnum()
        else "_"
        for char in sender_name
    )

    return (
        f"{prefix}_{normalized}"
    )


def get_sender_value(
    prefix: str,
    sender_name: str,
) -> str:

    key = sender_env_key(
        prefix,
        sender_name,
    )

    return env(key)


def resolve_path(
    value: str,
) -> Path:

    path = Path(value)

    if not path.is_absolute():
        path = BASE_DIR / path

    return path.resolve()


# ============================================================
# VALIDATION
# ============================================================


def validate_file(
    env_name: str,
    value: str,
) -> Path:

    if not value:
        raise RuntimeError(
            f"{env_name} не задан"
        )

    path = resolve_path(value)

    if not path.exists():
        raise FileNotFoundError(
            f"{env_name}: "
            f"файл не найден: {path}"
        )

    if not path.is_file():
        raise RuntimeError(
            f"{env_name}: "
            f"это не файл: {path}"
        )

    return path


# ============================================================
# PROFILE
# ============================================================


async def setup_profile(
    client,
    sender_name: str,
):

    first_name = env(
        "PROFILE_FIRST_NAME"
    )

    last_name = env(
        "PROFILE_LAST_NAME"
    )

    about = env(
        "PROFILE_ABOUT"
    )

    username = get_sender_value(
        "PROFILE_USERNAME",
        sender_name,
    )

    avatar_path = validate_file(
        "PROFILE_AVATAR",
        env("PROFILE_AVATAR"),
    )

    if not first_name:
        raise RuntimeError(
            "PROFILE_FIRST_NAME не задан"
        )

    if not username:
        raise RuntimeError(
            "Не задан username для "
            f"{sender_name}"
        )

    print()
    print(
        f"[{sender_name}] "
        "Обновляем профиль..."
    )

    await client(
        UpdateProfileRequest(
            first_name=first_name,
            last_name=last_name,
            about=about,
        )
    )

    print(
        f"[{sender_name}] "
        "✓ Имя и описание установлены"
    )

    me = await client.get_me()
    current_username = (me.username or "").lower()

    if current_username == username.lower():
        print(
            f"[{sender_name}] "
            f"✓ Username уже установлен: @{username}"
        )
    else:
        await client(
            UpdateUsernameRequest(
                username=username
            )
        )

        print(
            f"[{sender_name}] "
            f"✓ Username: @{username}"
        )

    uploaded_avatar = (
        await client.upload_file(
            str(avatar_path)
        )
    )

    await client(
        UploadProfilePhotoRequest(
            file=uploaded_avatar
        )
    )

    print(
        f"[{sender_name}] "
        "✓ Аватар профиля установлен"
    )


# ============================================================
# FIND EXISTING CHANNEL
# ============================================================


async def find_existing_channel(
    client,
    channel_username: str,
):

    try:

        entity = await client.get_entity(
            channel_username
        )

        if getattr(
            entity,
            "broadcast",
            False,
        ):
            return entity

    except Exception:
        pass

    return None


# ============================================================
# CREATE / GET CHANNEL
# ============================================================


async def get_or_create_channel(
    client,
    sender_name: str,
):

    channel_title = env(
        "CHANNEL_TITLE"
    )

    channel_about = env(
        "CHANNEL_ABOUT"
    )

    channel_username = (
        get_sender_value(
            "CHANNEL_USERNAME",
            sender_name,
        )
    )

    if not channel_title:
        raise RuntimeError(
            "CHANNEL_TITLE не задан"
        )

    if not channel_username:
        raise RuntimeError(
            "Не задан CHANNEL_USERNAME для "
            f"{sender_name}"
        )

    print()
    print(
        f"[{sender_name}] "
        f"Ищем канал @{channel_username}..."
    )

    channel = (
        await find_existing_channel(
            client,
            channel_username,
        )
    )

    if channel:

        print(
            f"[{sender_name}] "
            "✓ Канал уже существует"
        )

        return channel

    print(
        f"[{sender_name}] "
        "Создаём broadcast channel..."
    )

    result = await client(
        CreateChannelRequest(
            title=channel_title,
            about=channel_about,
            broadcast=True,
            megagroup=False,
        )
    )

    channel = result.chats[0]

    print(
        f"[{sender_name}] "
        f"✓ Канал создан: "
        f"{channel.title}"
    )

    await client(
        UpdateChannelUsernameRequest(
            channel=channel,
            username=channel_username,
        )
    )

    print(
        f"[{sender_name}] "
        f"✓ Канал публичный: "
        f"@{channel_username}"
    )

    return channel


# ============================================================
# CHANNEL AVATAR
# ============================================================


async def setup_channel_avatar(
    client,
    channel,
    sender_name: str,
):

    avatar_path = validate_file(
        "CHANNEL_AVATAR",
        env("CHANNEL_AVATAR"),
    )

    uploaded = await client.upload_file(
        str(avatar_path)
    )

    await client(
        EditPhotoRequest(
            channel=channel,
            photo=uploaded,
        )
    )

    # Telegram создаёт служебное сообщение
    # после изменения аватара канала.
    # Находим его отдельно и удаляем.
    async for message in client.iter_messages(
        channel,
        limit=10,
    ):
        action = getattr(message, "action", None)

        if (
            action is not None
            and action.__class__.__name__
            == "MessageActionChatEditPhoto"
        ):
            await client.delete_messages(
                channel,
                message.id,
                revoke=True,
            )

            print(
                f"[{sender_name}] "
                f"✓ Служебное сообщение "
                f"{message.id} удалено"
            )
            break

    print(
        f"[{sender_name}] "
        "✓ Аватар канала установлен"
    )


# ============================================================
# CHANNEL POST
# ============================================================


async def create_channel_post(
    client,
    channel,
    sender_name: str,
):

    post_text = env(
        "CHANNEL_POST_TEXT"
    ).replace(
        "\\n",
        "\n",
    )

    post_image = validate_file(
        "CHANNEL_POST_IMAGE",
        env("CHANNEL_POST_IMAGE"),
    )

    print(
        f"[{sender_name}] "
        "Публикуем пост..."
    )

    message = await client.send_file(
        channel,
        str(post_image),
        caption=post_text,
        parse_mode="html",
    )

    print(
        f"[{sender_name}] "
        f"✓ Пост опубликован "
        f"(message_id={message.id})"
    )

    return message

# ============================================================
# PERSONAL CHANNEL
# ============================================================


async def setup_personal_channel(
    client,
    channel,
    sender_name: str,
):

    input_channel = await client.get_input_entity(
        channel
    )

    await client(
        UpdatePersonalChannelRequest(
            channel=input_channel
        )
    )

    print(
        f"[{sender_name}] "
        "✓ Канал добавлен в профиль"
    )

# ============================================================
# CLEAN CHANNEL SERVICE MESSAGES
# ============================================================


async def clean_channel_service_messages(
    client,
    channel,
    sender_name: str,
):

    service_actions = {
        "MessageActionChannelCreate",
        "MessageActionChatCreate",
        "MessageActionChatEditPhoto",
    }

    ids_to_delete = []

    async for message in client.iter_messages(
        channel,
        limit=30,
    ):
        action = getattr(
            message,
            "action",
            None,
        )

        if action is None:
            continue

        if (
            action.__class__.__name__
            in service_actions
        ):
            ids_to_delete.append(
                message.id
            )

    if not ids_to_delete:
        return

    await client.delete_messages(
        channel,
        ids_to_delete,
        revoke=True,
    )

    print(
        f"[{sender_name}] "
        f"✓ Служебные сообщения канала удалены: "
        f"{len(ids_to_delete)}"
    )

# ============================================================
# MAIN
# ============================================================


async def setup_sender(
    sender_name: str,
):

    print()
    print("=" * 70)

    print(
        f"SETUP SENDER: {sender_name}"
    )

    print("=" * 70)

    client = create_client(
        sender_name
    )

    try:

        print(
            f"[{sender_name}] "
            "Подключаемся..."
        )

        await client.connect()

        if not await client.is_user_authorized():

            raise RuntimeError(
                f"{sender_name} "
                "не авторизован. "
                "Сначала выполни auth_sender.py."
            )

        me = await client.get_me()

        print(
            f"[{sender_name}] "
            "Авторизован как "
            f"@{me.username or me.id}"
        )

        # ----------------------------------------------------
        # PROFILE
        # ----------------------------------------------------

        await setup_profile(
            client,
            sender_name,
        )

        # ----------------------------------------------------
        # CHANNEL
        # ----------------------------------------------------

        channel = (
            await get_or_create_channel(
                client,
                sender_name,
            )
        )

        # ----------------------------------------------------
        # CHANNEL AVATAR
        # ----------------------------------------------------

        await setup_channel_avatar(
            client,
            channel,
            sender_name,
        )

        # ----------------------------------------------------
        # FIRST POST
        # ----------------------------------------------------

        await create_channel_post(
            client,
            channel,
            sender_name,
        )

        # ----------------------------------------------------
        # PERSONAL CHANNEL
        # ----------------------------------------------------

        await setup_personal_channel(
            client,
            channel,
            sender_name,
        )

        # ----------------------------------------------------
        # CLEAN SERVICE MESSAGES
        # ----------------------------------------------------

        await clean_channel_service_messages(
            client,
            channel,
            sender_name,
        )

        print()
        print("=" * 70)

        print(
            f"[{sender_name}] "
            "✓ SETUP ЗАВЕРШЁН"
        )

        print("=" * 70)

    finally:

        if client.is_connected():
            await client.disconnect()

        print(
            f"[{sender_name}] "
            "Telegram отключён."
        )


def parse_args():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "sender",
        help=(
            "Имя sender, например "
            "sender_3"
        ),
    )

    return parser.parse_args()


async def main():

    args = parse_args()

    await setup_sender(
        args.sender
    )


if __name__ == "__main__":

    try:
        asyncio.run(
            main()
        )

    except KeyboardInterrupt:
        print(
            "\nОстановлено пользователем."
        )