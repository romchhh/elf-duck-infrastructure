"""Publish a Story: real user mentions + a drawn URL button.

Telegram only notifies people linked with InputMessageEntityMentionName.
Plain @username text tags just the first person. The URL area has no label,
so the button is drawn on a fixed 9:16 frame and the hit-box matches it.
"""

from __future__ import annotations

import random
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from telethon import functions, types
from telethon.utils import add_surrogate

STORY_W = 1080
STORY_H = 1920


def _utf16_len(text: str) -> int:
    return len(add_surrogate(text))


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


def _append_piece(parts: list[str], piece: str) -> int:
    if parts:
        offset = _utf16_len("\n".join(parts) + "\n")
    else:
        offset = 0
    parts.append(piece)
    return offset


def build_caption_entities(
    caption: str,
    mentions: list[dict],
    *,
    button_url: str = "",
    button_text: str = "",
):
    """Caption + TextUrl + one InputMessageEntityMentionName per user."""
    parts: list[str] = []
    entities: list = []

    clean_caption = str(caption or "").strip()
    if clean_caption:
        parts.append(clean_caption)

    link = str(button_url or "").strip()
    label = str(button_text or "").strip() or "Открыть"
    if link:
        offset = _append_piece(parts, label)
        entities.append(
            types.MessageEntityTextUrl(
                offset=offset,
                length=_utf16_len(label),
                url=link,
            )
        )

    if not mentions:
        raise ValueError("Нужен хотя бы один username для отметки")

    for item in mentions:
        username = str(item["username"]).lstrip("@")
        token = f"@{username}"
        offset = _append_piece(parts, token)
        entities.append(
            types.InputMessageEntityMentionName(
                offset=offset,
                length=_utf16_len(token),
                user_id=item["input_user"],
            )
        )

    return "\n".join(parts), entities, [item["username"] for item in mentions]


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


async def _resolve_mentions(client, usernames: list[str]) -> list[dict]:
    resolved = []
    seen = set()
    for raw in usernames:
        username = str(raw or "").strip().lstrip("@")
        if not username or username.lower() in seen:
            continue
        seen.add(username.lower())
        entity = await client.get_entity(username)
        if not isinstance(entity, types.User) or not getattr(entity, "username", None):
            raise RuntimeError(f"@{username} — не пользователь с публичным username")
        peer = await client.get_input_entity(entity)
        if not isinstance(peer, types.InputPeerUser):
            raise RuntimeError(f"Не удалось получить InputUser для @{username}")
        resolved.append(
            {
                "username": entity.username,
                "input_user": types.InputUser(peer.user_id, peer.access_hash),
            }
        )
    if not resolved:
        raise ValueError("Нужен хотя бы один username для отметки")
    return resolved


async def publish_custom_story(
    client,
    *,
    photo_path: str | Path,
    caption: str,
    usernames: list[str],
    button_url: str = "",
    button_text: str = "",
    button_color: str = "#2AABEE",
):
    path = Path(photo_path)
    if not path.is_file():
        raise FileNotFoundError(f"Фото не найдено: {path}")

    link = str(button_url or "").strip()
    label = str(button_text or "").strip()
    color = str(button_color or "").strip() or "#2AABEE"
    mentions = await _resolve_mentions(client, usernames)

    composed = path.with_name(f"{path.stem}_story.jpg")
    try:
        _, area = compose_story_frame(
            path,
            label=(label or "Открыть") if link else "",
            color_hex=color,
            output_path=composed,
        )
        text, entities, names = build_caption_entities(
            caption,
            mentions,
            button_url=link,
            button_text=label,
        )
        uploaded = await client.upload_file(str(composed))
        media = types.InputMediaUploadedPhoto(file=uploaded)
        media_areas = []
        url_area = link_media_area(link, area)
        if url_area is not None:
            media_areas.append(url_area)

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
                pinned=False,
            )
        )
    finally:
        composed.unlink(missing_ok=True)

    return {
        "mentions": names,
        "caption": text,
        "buttonUrl": link,
        "buttonText": label,
        "buttonColor": color if link else "",
        "resultType": type(result).__name__,
    }
