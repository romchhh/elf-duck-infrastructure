"""Publish a one-shot Story: custom photo, caption, @mentions, optional URL button."""

from __future__ import annotations

import random
from pathlib import Path

from telethon import functions, types
from telethon.utils import add_surrogate


def _utf16_len(text: str) -> int:
    return len(add_surrogate(text))


def build_caption_entities(caption: str, usernames: list[str]):
    """Caption text + MessageEntityMention for each @username (UTF-16 offsets)."""
    parts: list[str] = []
    entities: list[types.TypeMessageEntity] = []

    clean_caption = str(caption or "").strip()
    if clean_caption:
        parts.append(clean_caption)

    normalized = []
    for raw in usernames:
        username = str(raw or "").strip().lstrip("@")
        if not username:
            continue
        normalized.append(username)

    if not normalized:
        raise ValueError("Нужен хотя бы один username для отметки")

    for username in normalized:
        mention = f"@{username}"
        if parts:
            prefix = "\n".join(parts) + "\n"
            offset = _utf16_len(prefix)
        else:
            offset = 0
        parts.append(mention)
        entities.append(
            types.MessageEntityMention(
                offset=offset,
                length=_utf16_len(mention),
            )
        )

    return "\n".join(parts), entities, normalized


def link_media_area(url: str):
    """Bottom-centered URL sticker area (coordinates are percent of story frame)."""
    clean = str(url or "").strip()
    if not clean:
        return None
    if not clean.startswith(("http://", "https://")):
        raise ValueError("Ссылка кнопки должна начинаться с http:// или https://")
    return types.MediaAreaUrl(
        coordinates=types.MediaAreaCoordinates(
            x=50.0,
            y=82.0,
            w=48.0,
            h=7.5,
            rotation=0.0,
        ),
        url=clean,
    )


async def publish_custom_story(
    client,
    *,
    photo_path: str | Path,
    caption: str,
    usernames: list[str],
    button_url: str = "",
):
    path = Path(photo_path)
    if not path.is_file():
        raise FileNotFoundError(f"Фото не найдено: {path}")

    text, entities, mentions = build_caption_entities(caption, usernames)

    uploaded = await client.upload_file(str(path))
    media = types.InputMediaUploadedPhoto(file=uploaded)

    media_areas = []
    area = link_media_area(button_url)
    if area is not None:
        media_areas.append(area)

    me = await client.get_input_entity("me")
    result = await client(
        functions.stories.SendStoryRequest(
            peer=me,
            media=media,
            privacy_rules=[types.InputPrivacyValueAllowAll()],
            random_id=random.randint(-(2**63), 2**63 - 1),
            media_areas=media_areas or None,
            caption=text,
            entities=entities,
            period=86400,
        )
    )
    return {
        "mentions": mentions,
        "caption": text,
        "resultType": type(result).__name__,
    }
