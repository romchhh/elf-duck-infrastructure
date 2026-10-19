import random
import re

from telethon import functions, types

from config import (

    TEMPLATE_STORY_URLS,

    STORY_CAPTION,

)


def parse_story_url(url):
    """
    Разбирает:

    https://t.me/carterauto/s/1688

    в:

    username = carterauto
    story_id = 1688
    """

    pattern = (
        r"^https?://t\.me/"
        r"([A-Za-z0-9_]+)/s/(\d+)/?$"
    )

    match = re.match(
        pattern,
        url.strip(),
    )

    if not match:
        raise ValueError(
            "Некорректный TEMPLATE_STORY_URL. "
            "Ожидается формат: "
            "https://t.me/username/s/123"
        )

    username = match.group(1)
    story_id = int(match.group(2))

    return username, story_id


def build_caption_and_entities(targets):
    """
    Создаёт caption и отдельный MessageEntityMention
    для каждого разрешённого target.

    Например:

    Бу-бу-бу!
    @target1
    @target2
    @target3
    """

    if not targets:
        raise ValueError(
            "Список targets пуст"
        )

    usernames = []

    for target in targets:
        username = getattr(
            target,
            "username",
            None,
        )

        if not username:
            raise RuntimeError(
                f"У target ID="
                f"{getattr(target, 'id', '?')} "
                "отсутствует username"
            )

        usernames.append(username)

    parts = []
    entities = []

    if STORY_CAPTION:
        parts.append(STORY_CAPTION)

    for username in usernames:
        mention = f"@{username}"

        # Если caption уже содержит текст,
        # сначала добавляем перенос строки.
        if parts:
            current_text = "\n".join(parts)
            offset = len(current_text) + 1
        else:
            offset = 0

        parts.append(mention)

        entities.append(
            types.MessageEntityMention(
                offset=offset,
                length=len(mention),
            )
        )

    caption = "\n".join(parts)

    return (
        caption,
        entities,
        usernames,
    )


async def repost_template_story(

    client,

    targets,

    sender_name: str,

):

    template_story_url = (
        TEMPLATE_STORY_URLS.get(
            sender_name,
            "",
        )
    )

    if not template_story_url:
        raise RuntimeError(
            "Не задан TEMPLATE_STORY_URL "
            f"для sender: {sender_name}"
        )
    
    # ========================================================
    # TEMPLATE
    # ========================================================

    source_username, source_story_id = (
        parse_story_url(
            template_story_url
        )
    )

    print("=" * 60)
    print(
        f"Получаем исходную Story "
        f"@{source_username} "
        f"#{source_story_id}"
    )
    print("=" * 60)

    source_peer = await client.get_input_entity(
        source_username
    )

    result = await client(
        functions.stories.GetStoriesByIDRequest(
            peer=source_peer,
            id=[source_story_id],
        )
    )

    if not result.stories:
        raise RuntimeError(
            "Исходная Story не найдена"
        )

    source_story = result.stories[0]

    print("✓ Исходная Story получена")

    # ========================================================
    # MEDIA
    # ========================================================

    media = source_story.media

    if not isinstance(
        media,
        types.MessageMediaPhoto,
    ):
        raise RuntimeError(
            "Сейчас поддерживается только "
            "Story с фотографией. "
            f"Получено: {type(media).__name__}"
        )

    photo = media.photo

    if not isinstance(
        photo,
        types.Photo,
    ):
        raise RuntimeError(
            "Не удалось получить Photo "
            "из исходной Story"
        )

    input_media = types.InputMediaPhoto(
        id=types.InputPhoto(
            id=photo.id,
            access_hash=photo.access_hash,
            file_reference=photo.file_reference,
        )
    )

    # ========================================================
    # MEDIA AREAS
    # ========================================================

    media_areas = (
        source_story.media_areas or []
    )

    print(
        f"✓ Media areas найдено: "
        f"{len(media_areas)}"
    )

    for area in media_areas:
        print(
            f"  • {type(area).__name__}"
        )

        if isinstance(
            area,
            types.MediaAreaUrl,
        ):
            print(
                f"    URL: {area.url}"
            )

    # ========================================================
    # CAPTION + MULTIPLE MENTIONS
    # ========================================================

    (
        caption,
        entities,
        usernames,
    ) = build_caption_and_entities(
        targets
    )

    print(
        f"✓ Caption: {caption!r}"
    )

    print(
        "✓ Mentions: "
        + ", ".join(
            f"@{username}"
            for username in usernames
        )
    )

    # ========================================================
    # SEND
    # ========================================================

    me = await client.get_input_entity(
        "me"
    )

    print(
        f"→ Публикуем одну Story "
        f"с {len(usernames)} отметками..."
    )

    send_result = await client(
        functions.stories.SendStoryRequest(
            peer=me,

            media=input_media,

            privacy_rules=[
                types.InputPrivacyValueAllowAll()
            ],

            random_id=random.randint(
                -(2**63),
                2**63 - 1,
            ),

            # Сохраняем link sticker и остальные
            # media areas исходной Story.
            media_areas=media_areas,

            caption=caption,
            entities=entities,

            # Native repost исходной Story.
            fwd_from_id=source_peer,
            fwd_from_story=source_story_id,

            # Мы изменили Story,
            # добавив caption + mentions.
            fwd_modified=True,
        )
    )

    print(
        "✓ Story опубликована"
    )

    for username in usernames:
        print(
            f"  ✓ @{username}"
        )

    return send_result