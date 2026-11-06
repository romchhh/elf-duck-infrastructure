"""Publish a Story with mentions + clickable URL button (text + color).

Telegram mediaAreaUrl only accepts url+coordinates (no label/color in API).
We draw a styled button onto the photo and place MediaAreaUrl over it, plus a
MessageEntityTextUrl in the caption with the same label.
"""

from __future__ import annotations

import random
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from telethon import functions, types
from telethon.utils import add_surrogate

# Story frame percentages for the tappable URL area / drawn button.
BUTTON_X = 50.0
BUTTON_Y = 84.0
BUTTON_W = 72.0
BUTTON_H = 9.0


def _utf16_len(text: str) -> int:
    return len(add_surrogate(text))


def parse_button_color(raw: str) -> tuple[int, int, int]:
    value = str(raw or "").strip()
    if not value:
        return (42, 171, 238)  # Telegram blue
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
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def compose_story_button(
    photo_path: str | Path,
    *,
    label: str,
    color_hex: str,
    output_path: str | Path,
) -> Path:
    """Draw a rounded CTA button near the bottom; returns written JPEG path."""
    src = Path(photo_path)
    dest = Path(output_path)
    text = str(label or "").strip() or "Открыть"
    if len(text) > 40:
        text = text[:40]
    rgb = parse_button_color(color_hex)
    text_rgb = (255, 255, 255) if _luminance(rgb) < 0.62 else (20, 20, 20)

    with Image.open(src) as image:
        frame = image.convert("RGBA")
        width, height = frame.size
        overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        bw = width * (BUTTON_W / 100.0)
        bh = height * (BUTTON_H / 100.0)
        cx = width * (BUTTON_X / 100.0)
        cy = height * (BUTTON_Y / 100.0)
        left = cx - bw / 2
        top = cy - bh / 2
        right = cx + bw / 2
        bottom = cy + bh / 2
        radius = max(8, int(bh * 0.45))

        # Soft shadow
        shadow = (
            left + width * 0.004,
            top + height * 0.004,
            right + width * 0.004,
            bottom + height * 0.004,
        )
        draw.rounded_rectangle(shadow, radius=radius, fill=(0, 0, 0, 90))
        draw.rounded_rectangle(
            (left, top, right, bottom),
            radius=radius,
            fill=(*rgb, 245),
        )

        font_size = max(18, int(bh * 0.42))
        font = _load_font(font_size)
        while font_size > 14:
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            if tw <= bw * 0.86:
                break
            font_size -= 2
            font = _load_font(font_size)

        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = cx - tw / 2
        ty = cy - th / 2 - bbox[1] * 0.15
        draw.text((tx, ty), text, font=font, fill=(*text_rgb, 255))

        composed = Image.alpha_composite(frame, overlay).convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        composed.save(dest, format="JPEG", quality=92, optimize=True)
    return dest


def build_caption_entities(
    caption: str,
    usernames: list[str],
    *,
    button_url: str = "",
    button_text: str = "",
):
    """Caption + optional TextUrl CTA + MessageEntityMention for each @username."""
    parts: list[str] = []
    entities: list[types.TypeMessageEntity] = []

    clean_caption = str(caption or "").strip()
    if clean_caption:
        parts.append(clean_caption)

    link = str(button_url or "").strip()
    label = str(button_text or "").strip() or "Открыть"
    if link:
        if parts:
            prefix = "\n".join(parts) + "\n"
            offset = _utf16_len(prefix)
        else:
            offset = 0
        parts.append(label)
        entities.append(
            types.MessageEntityTextUrl(
                offset=offset,
                length=_utf16_len(label),
                url=link,
            )
        )

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
    """Tappable URL sticker area aligned with the drawn button."""
    clean = str(url or "").strip()
    if not clean:
        return None
    if not clean.startswith(("http://", "https://")):
        raise ValueError("Ссылка кнопки должна начинаться с http:// или https://")
    return types.MediaAreaUrl(
        coordinates=types.MediaAreaCoordinates(
            x=BUTTON_X,
            y=BUTTON_Y,
            w=BUTTON_W,
            h=BUTTON_H,
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
    button_text: str = "",
    button_color: str = "#2AABEE",
):
    path = Path(photo_path)
    if not path.is_file():
        raise FileNotFoundError(f"Фото не найдено: {path}")

    link = str(button_url or "").strip()
    label = str(button_text or "").strip()
    color = str(button_color or "").strip() or "#2AABEE"

    publish_path = path
    temp_composed = None
    if link:
        temp_composed = path.with_name(f"{path.stem}_btn.jpg")
        publish_path = compose_story_button(
            path,
            label=label or "Открыть",
            color_hex=color,
            output_path=temp_composed,
        )

    text, entities, mentions = build_caption_entities(
        caption,
        usernames,
        button_url=link,
        button_text=label,
    )

    try:
        uploaded = await client.upload_file(str(publish_path))
        media = types.InputMediaUploadedPhoto(file=uploaded)

        media_areas = []
        area = link_media_area(link)
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
                pinned=False,
            )
        )
    finally:
        if temp_composed is not None:
            temp_composed.unlink(missing_ok=True)

    return {
        "mentions": mentions,
        "caption": text,
        "buttonUrl": link,
        "buttonText": label,
        "buttonColor": color if link else "",
        "resultType": type(result).__name__,
    }
