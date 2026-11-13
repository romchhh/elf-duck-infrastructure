"""Publish a Story: real user mentions + a drawn URL button.

Telegram only notifies people linked with InputMessageEntityMentionName.
Plain @username text tags just the first person. The URL area has no label,
so the button is drawn on a fixed 9:16 frame and the hit-box matches it.
"""

from __future__ import annotations

import asyncio
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from telethon import functions, types

from config import (
    INTERACTION_STORY_DELAY,
    STORY_INTERVAL_MAX_SECONDS,
    STORY_INTERVAL_MIN_SECONDS,
    TARGETS_PER_STORY_MAX,
    TARGETS_PER_STORY_MIN,
)
from src.contact import create_test_interaction
from src.story import build_caption_and_entities
from src.user_language import DEFAULT_LANGUAGE, languages_for_entities

STORY_W = 1080
STORY_H = 1920


def parse_button_color(raw: str) -> tuple[int, int, int]:
    value = str(raw or "").strip()
    if not value:
        return (42, 171, 238)
    if not value.startswith("#"):
        value = f"#{value}"
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
        raise ValueError("Цвет кнопки: #RRGGBB")
    return (
        int(value[1:3], 16),
        int(value[3:5], 16),
        int(value[5:7], 16),
    )


def _luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = [c / 255.0 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _cover_9x16(image: Image.Image) -> Image.Image:
    frame = image.convert("RGBA")
    sw, sh = frame.size
    scale = max(STORY_W / sw, STORY_H / sh)
    resized = frame.resize(
        (max(1, int(sw * scale)), max(1, int(sh * scale))),
        Image.Resampling.LANCZOS,
    )
    left = max(0, (resized.width - STORY_W) // 2)
    top = max(0, (resized.height - STORY_H) // 2)
    return resized.crop((left, top, left + STORY_W, top + STORY_H))


def compose_story_frame(
    photo_path: str | Path,
    *,
    label: str = "",
    color_hex: str = "#2AABEE",
    output_path: str | Path,
) -> tuple[Path, dict | None]:
    """Fit photo to 1080×1920 and, if label is set, draw a pill button."""
    dest = Path(output_path)
    with Image.open(photo_path) as image:
        frame = _cover_9x16(image)

    area = None
    text = str(label or "").strip()
    if text:
        if len(text) > 40:
            text = text[:40]
        rgb = parse_button_color(color_hex)
        ink = (255, 255, 255) if _luminance(rgb) < 0.62 else (17, 24, 39)
        overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        font = _load_font(34)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x = 36
        height = 84
        width = min(STORY_W - 160, max(280, tw + pad_x * 2))
        # Shrink the label if it still overflows the pill.
        while tw > width - pad_x * 2 and font.size > 22:
            font = _load_font(font.size - 2)
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]

        left = (STORY_W - width) / 2
        top = STORY_H - 210
        right = left + width
        bottom = top + height
        radius = height // 2

        draw.rounded_rectangle(
            (left, top + 8, right, bottom + 8),
            radius=radius,
            fill=(0, 0, 0, 55),
        )
        draw.rounded_rectangle(
            (left, top, right, bottom),
            radius=radius,
            fill=(*rgb, 255),
        )
        tx = left + (width - tw) / 2
        ty = top + (height - th) / 2 - bbox[1]
        draw.text((tx, ty), text, font=font, fill=(*ink, 255))
        frame = Image.alpha_composite(frame, overlay)

        area = {
            "x": 50.0,
            "y": ((top + height / 2) / STORY_H) * 100,
            "w": (width / STORY_W) * 100,
            "h": (height / STORY_H) * 100,
        }

    dest.parent.mkdir(parents=True, exist_ok=True)
    frame.convert("RGB").save(dest, format="JPEG", quality=92, optimize=True)
    return dest, area


def _mention_caption(caption: str, entities_users: list):
    """Один рядок @user @user і окрема entity на кожен, у UTF-16.

    Переноси рядка і Python len() зсували другу відмітку, Telegram її відкидав.
    Кнопка лишається на фото і в mediaAreaUrl, без окремої entity в тексті.
    """
    tokens = []
    users = []
    for entity in entities_users:
        username = str(entity.username or "").strip().lstrip("@")
        if not username:
            continue
        tokens.append(f"@{username}")
        users.append(entity)
    if not tokens:
        raise ValueError("Нет username для отметки")

    mention_line = " ".join(tokens)
    text_caption = str(caption or "").strip()
    text = f"{text_caption}\n{mention_line}" if text_caption else mention_line

    raw = text.encode("utf-16-le")
    mention_entities = []
    search_from = 0
    for token, entity in zip(tokens, users):
        needle = token.encode("utf-16-le")
        index = raw.find(needle, search_from)
        if index < 0 or index % 2:
            raise RuntimeError(f"Не найдена отметка {token} в тексте истории")
        offset = index // 2
        length = len(needle) // 2
        mention_entities.append(
            types.MessageEntityMention(
                offset=offset,
                length=length,
            )
        )
        search_from = index + len(needle)

    return text, mention_entities, [entity.username for entity in users]


def link_media_area(url: str, area: dict | None):
    clean = str(url or "").strip()
    if not clean or not area:
        return None
    if not clean.startswith(("http://", "https://")):
        raise ValueError("Ссылка кнопки должна начинаться с http:// или https://")
    return types.MediaAreaUrl(
        coordinates=types.MediaAreaCoordinates(
            x=float(area["x"]),
            y=float(area["y"]),
            w=float(area["w"]),
            h=float(area["h"]),
            rotation=0.0,
        ),
        url=clean,
    )


def _resolve_mention_error(username: str, exc: BaseException) -> str:
    message = str(exc).strip()
    if "No user has" in message:
        return "Нет пользователя с таким @username в Telegram"
    if len(message) > 160:
        message = message[:160]
    return message or type(exc).__name__


async def _resolve_mentions(
    client, usernames: list[str]
) -> tuple[list, list[dict]]:
    resolved = []
    skipped: list[dict] = []
    seen = set()
    for raw in usernames:
        username = str(raw or "").strip().lstrip("@")
        if not username or username.lower() in seen:
            continue
        seen.add(username.lower())
        try:
            entity = await client.get_entity(username)
        except Exception as exc:
            skipped.append(
                {
                    "username": username,
                    "error": _resolve_mention_error(username, exc),
                }
            )
            continue
        if not isinstance(entity, types.User):
            skipped.append(
                {
                    "username": username,
                    "error": "Не пользователь Telegram",
                }
            )
            continue
        if not getattr(entity, "username", None):
            skipped.append(
                {
                    "username": username,
                    "error": "Нет публичного username",
                }
            )
            continue
        resolved.append(entity)
    # Невалідні @username просто пропускаємо — не валимо всю публікацію.
    return resolved, skipped


def _take_group(pending: list, story_min: int, story_max: int) -> list:
    """Як в оригінальному тегері: 2–3 людей на одну історію, хвіст публікується як є."""
    size = min(random.randint(story_min, story_max), len(pending))
    group = pending[:size]
    del pending[:size]
    return group


class TeggerStopped(Exception):
    """Користувач зупинив тегер до наступної історії."""


async def _wait(seconds: float, cancel_event: asyncio.Event | None) -> None:
    if cancel_event is not None and cancel_event.is_set():
        raise TeggerStopped()
    delay = max(0.0, float(seconds))
    if delay == 0:
        return
    if cancel_event is None:
        await asyncio.sleep(delay)
        return
    try:
        await asyncio.wait_for(cancel_event.wait(), timeout=delay)
    except asyncio.TimeoutError:
        return
    raise TeggerStopped()


def _names(entities: list) -> list[str]:
    return [str(entity.username) for entity in entities if getattr(entity, "username", None)]


def _split_by_language(entities: list, lang_by_id: dict[int, str]) -> dict[str, list]:
    buckets: dict[str, list] = {"pl": [], "ru": []}
    for entity in entities:
        uid = int(getattr(entity, "id", 0) or 0)
        lang = lang_by_id.get(uid, DEFAULT_LANGUAGE)
        if lang not in buckets:
            lang = DEFAULT_LANGUAGE
        buckets[lang].append(entity)
    return buckets


async def _publish_pending_queue(
    client,
    me,
    pending: list,
    *,
    photo_path: Path,
    caption: str,
    button_url: str,
    button_text: str,
    button_color: str,
    story_min: int,
    story_max: int,
    interval_min: int,
    interval_max: int,
    interaction_delay: int,
    cancel_event: asyncio.Event | None,
    emit,
    language: str,
    published: list[str],
    failed: list[dict],
    stories: list[dict],
) -> str:
    link = str(button_url or "").strip()
    label = str(button_text or "").strip()
    color = str(button_color or "").strip() or "#2AABEE"
    if not photo_path.is_file():
        raise FileNotFoundError(f"Фото не найдено: {photo_path}")

    composed = photo_path.with_name(f"{photo_path.stem}_{language}_story.jpg")
    last_type = ""
    try:
        _, area = compose_story_frame(
            photo_path,
            label=(label or "Открыть") if link else "",
            color_hex=color,
            output_path=composed,
        )
        media_areas = []
        url_area = link_media_area(link, area)
        if url_area is not None:
            media_areas.append(url_area)

        while pending:
            await _wait(0, cancel_event)
            group = _take_group(pending, story_min, story_max)
            await emit(
                phase="interaction",
                currentGroup=_names(group),
                waitUntil=None,
                language=language,
            )
            ready = []
            for entity in group:
                await _wait(0, cancel_event)
                try:
                    await create_test_interaction(client, entity)
                except Exception as exc:
                    failed.append(
                        {
                            "username": entity.username,
                            "error": f"{type(exc).__name__}: {exc}"[:160],
                        }
                    )
                    await emit(failed=list(failed), currentGroup=_names(group), language=language)
                    continue
                ready.append(entity)
            if not ready:
                await emit(
                    phase="resolve",
                    currentGroup=[],
                    failed=list(failed),
                    language=language,
                )
                continue

            pause = max(0, int(interaction_delay))
            ready_names = _names(ready)
            wait_until = (
                (datetime.now(timezone.utc) + timedelta(seconds=pause)).isoformat()
                if pause
                else None
            )
            await emit(
                phase="pause",
                currentGroup=ready_names,
                waitUntil=wait_until,
                language=language,
            )
            await _wait(pause, cancel_event)

            await emit(phase="publish", currentGroup=ready_names, waitUntil=None, language=language)
            text, entities, names = _mention_caption(caption, ready)
            uploaded = await client.upload_file(str(composed))
            await _wait(0, cancel_event)
            result = await client(
                functions.stories.SendStoryRequest(
                    peer=me,
                    media=types.InputMediaUploadedPhoto(file=uploaded),
                    privacy_rules=[types.InputPrivacyValueAllowAll()],
                    random_id=random.randint(-(2**63), 2**63 - 1),
                    media_areas=media_areas or None,
                    caption=text,
                    entities=entities,
                    period=86400,
                    pinned=False,
                )
            )
            published.extend(names)
            stories.append({"usernames": list(names), "language": language})
            last_type = type(result).__name__
            if pending:
                delay = random.randint(int(interval_min), int(interval_max))
                next_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
                await emit(
                    phase="wait",
                    currentGroup=[],
                    mentioned=list(published),
                    stories=list(stories),
                    failed=list(failed),
                    pending=len(pending),
                    waitUntil=next_at,
                    language=language,
                )
                await _wait(delay, cancel_event)
    finally:
        composed.unlink(missing_ok=True)
    return last_type


async def publish_custom_story(
    client,
    *,
    photo_path: str | Path,
    caption: str,
    usernames: list[str],
    button_url: str = "",
    button_text: str = "",
    button_color: str = "#2AABEE",
    photo_path_pl: str | Path | None = None,
    caption_pl: str = "",
    button_text_pl: str = "",
    default_language: str = DEFAULT_LANGUAGE,
    story_min: int = TARGETS_PER_STORY_MIN,
    story_max: int = TARGETS_PER_STORY_MAX,
    interval_min: int = STORY_INTERVAL_MIN_SECONDS,
    interval_max: int = STORY_INTERVAL_MAX_SECONDS,
    interaction_delay: int = INTERACTION_STORY_DELAY,
    on_progress=None,
    cancel_event: asyncio.Event | None = None,
):
    path_ru = Path(photo_path)
    if not path_ru.is_file():
        raise FileNotFoundError(f"Фото (RU) не найдено: {path_ru}")
    path_pl = Path(photo_path_pl) if photo_path_pl else path_ru
    if not path_pl.is_file():
        path_pl = path_ru

    link = str(button_url or "").strip()
    label_ru = str(button_text or "").strip()
    label_pl = str(button_text_pl or "").strip() or label_ru
    color = str(button_color or "").strip() or "#2AABEE"
    cap_ru = str(caption or "").strip()
    cap_pl = str(caption_pl or "").strip() or cap_ru
    story_min = max(1, int(story_min))
    story_max = max(story_min, int(story_max))
    state = {
        "phase": "resolve",
        "total": len([name for name in usernames if str(name or "").strip()]),
        "mentioned": [],
        "failed": [],
        "stories": [],
        "currentGroup": [],
        "pending": 0,
        "waitUntil": None,
        "languages": {"pl": 0, "ru": 0},
    }

    async def emit(**patch) -> None:
        state.update(patch)
        if on_progress is not None:
            await on_progress(dict(state))

    await _wait(0, cancel_event)
    await emit()
    published: list[str] = []
    failed: list[dict] = []
    stories: list[dict] = []
    resolved, skipped_resolve = await _resolve_mentions(client, usernames)
    failed.extend(skipped_resolve)
    await emit(failed=list(failed))

    # Усі @username невалідні / не користувачі — просто done зі списком skipped.
    if not resolved:
        await emit(
            phase="done",
            currentGroup=[],
            mentioned=[],
            stories=[],
            failed=list(failed),
            pending=0,
            waitUntil=None,
            total=0,
        )
        return {
            "mentions": [],
            "failed": [f"@{item['username']}: {item['error']}" for item in failed],
            "caption": cap_ru,
            "captionPl": cap_pl,
            "buttonUrl": link,
            "buttonText": label_ru,
            "buttonTextPl": label_pl,
            "buttonColor": color if link else "",
            "resultType": "",
            "stories": 0,
            "languages": {"pl": 0, "ru": 0},
        }

    lang_by_id = await asyncio.to_thread(
        languages_for_entities,
        resolved,
        default=default_language or DEFAULT_LANGUAGE,
    )
    buckets = _split_by_language(resolved, lang_by_id)
    pending_total = len(buckets["pl"]) + len(buckets["ru"])
    await emit(
        total=pending_total,
        pending=pending_total,
        languages={"pl": len(buckets["pl"]), "ru": len(buckets["ru"])},
    )

    last_type = ""
    me = await client.get_input_entity("me")

    locale_queue = [
        (
            "pl",
            buckets["pl"],
            path_pl,
            cap_pl,
            label_pl,
        ),
        (
            "ru",
            buckets["ru"],
            path_ru,
            cap_ru,
            label_ru,
        ),
    ]

    try:
        first_lang = True
        for language, pending, photo, cap, btn_label in locale_queue:
            if not pending:
                continue
            if not first_lang:
                gap = random.randint(int(interval_min), int(interval_max))
                next_at = (datetime.now(timezone.utc) + timedelta(seconds=gap)).isoformat()
                await emit(
                    phase="wait",
                    currentGroup=[],
                    mentioned=list(published),
                    stories=list(stories),
                    failed=list(failed),
                    pending=sum(len(buckets[k]) for k in buckets),
                    waitUntil=next_at,
                    language=language,
                )
                await _wait(gap, cancel_event)
            first_lang = False

            def pending_left() -> int:
                return len(buckets["pl"]) + len(buckets["ru"])

            async def emit_wrapped(**patch) -> None:
                patch.setdefault("pending", pending_left())
                await emit(**patch)

            last_type = await _publish_pending_queue(
                client,
                me,
                pending,
                photo_path=photo,
                caption=cap,
                button_url=link,
                button_text=btn_label,
                button_color=color,
                story_min=story_min,
                story_max=story_max,
                interval_min=interval_min,
                interval_max=interval_max,
                interaction_delay=interaction_delay,
                cancel_event=cancel_event,
                emit=emit_wrapped,
                language=language,
                published=published,
                failed=failed,
                stories=stories,
            )

        # Навіть якщо нічого не опублікували (усі впали на interaction) —
        # не валимо джобу: skipped лишаються в failed.
        await emit(
            phase="done",
            currentGroup=[],
            mentioned=list(published),
            stories=list(stories),
            failed=list(failed),
            pending=0,
            waitUntil=None,
        )
    except TeggerStopped:
        await emit(
            phase="stopped",
            mentioned=list(published),
            stories=list(stories),
            failed=list(failed),
            pending=len(buckets["pl"]) + len(buckets["ru"]),
            waitUntil=None,
        )
        raise

    return {
        "mentions": published,
        "failed": [f"@{item['username']}: {item['error']}" for item in failed],
        "caption": cap_ru,
        "captionPl": cap_pl,
        "buttonUrl": link,
        "buttonText": label_ru,
        "buttonTextPl": label_pl,
        "buttonColor": color if link else "",
        "resultType": last_type,
        "stories": len(stories),
        "languages": {"pl": len(buckets["pl"]), "ru": len(buckets["ru"])},
    }
