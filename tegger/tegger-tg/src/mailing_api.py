"""HTTP API для ЛС-розсилок (регистрация в api.py)."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, File, Form, HTTPException, UploadFile
from fastapi import APIRouter

from config import DATA_DIR, DRY_RUN, SESSIONS_DIR, SENDERS
from src.mailing_publish import MailingStopped, publish_mailing
from src.mailing_targets import (
    language_stats_by_targets,
    parse_mailing_targets,
    target_keys,
    target_stats,
)

router = APIRouter(prefix="/api/mailings", tags=["mailings"])


_MAILINGS_FILE = Path(DATA_DIR) / "ui_mailings.json"
_MAILING_MEDIA_DIR = Path(DATA_DIR) / "mailing_media"
_mailing_lock = asyncio.Lock()
_MAILING_TASKS: dict[str, asyncio.Task] = {}
_MAILING_CANCEL: dict[str, asyncio.Event] = {}


def _mailing_read() -> list[dict]:
    if not _MAILINGS_FILE.is_file():
        return []
    try:
        value = json.loads(_MAILINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(500, "Не удалось прочитать историю розсилок") from exc
    if not isinstance(value, list):
        raise HTTPException(500, "Повреждён файл истории розсилок")
    return value


def _mailing_write(items: list[dict]) -> None:
    _MAILINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = _MAILINGS_FILE.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(items, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, _MAILINGS_FILE)


def _mailing_allowed_senders():
    from api import get_accounts_data, execution_values  # noqa: WPS433 — shared runtime

    rows = get_accounts_data()
    allowed = {
        a["id"]
        for a in rows
        if a["id"] not in SENDERS
        and (Path(SESSIONS_DIR) / (a["id"] + ".session")).is_file()
        and a.get("session", False)
    }
    meta = {}
    for a in rows:
        if a["id"] in allowed:
            tid = a.get("telegramId")
            if tid:
                meta[a["id"]] = int(tid)
    return allowed, meta


def _blank_progress(total: int = 0) -> dict:
    return {
        "phase": "",
        "total": total,
        "sent": [],
        "failed": [],
        "current": None,
        "pending": total,
        "waitUntil": None,
    }


def _mailing_view(item: dict) -> dict:
    targets = list(item.get("targets") or [])
    prog = item.get("progress") if isinstance(item.get("progress"), dict) else None
    caption_ru = str(item.get("captionRu") or "").strip()
    caption_pl = str(item.get("captionPl") or "").strip()
    return {
        "id": item["id"],
        "createdAt": item.get("createdAt"),
        "startedAt": item.get("startedAt"),
        "finishedAt": item.get("finishedAt"),
        "senderIds": list(item.get("senderIds") or []),
        "targets": targets,
        "targetStats": item.get("targetStats") or target_stats(targets),
        "recipientKeys": target_keys(targets),
        "captionRu": caption_ru,
        "captionPl": caption_pl,
        "buttonUrl": item.get("buttonUrl") or "",
        "buttonTextRu": item.get("buttonTextRu") or item.get("buttonText") or "",
        "buttonTextPl": item.get("buttonTextPl") or "",
        "hasPhoto": bool(item.get("photoPathRu") or item.get("photoPath")),
        "status": item.get("status") or "draft",
        "error": item.get("error") or "",
        "botUsername": item.get("botUsername") or "",
        "relayChatId": item.get("relayChatId") or (prog or {}).get("relayChatId") or "",
        "progress": prog,
    }


async def _mailing_update(job_id: str, **fields):
    async with _mailing_lock:
        items = _mailing_read()
        for item in items:
            if item.get("id") == job_id:
                item.update(fields)
                _mailing_write(items)
                return item
    return None


async def _mailing_mark_stopped(job_id: str):
    from datetime import datetime, timezone

    async with _mailing_lock:
        items = _mailing_read()
        item = next((x for x in items if x.get("id") == job_id), None)
        if not item or item.get("status") not in ("running", "stopping"):
            return item
        progress = dict(item.get("progress") or _blank_progress())
        progress["phase"] = "stopped"
        progress["waitUntil"] = None
        item.update(
            {
                "status": "stopped",
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "progress": progress,
            }
        )
        _mailing_write(items)
    return item


def _crm_payload(item: dict) -> dict:
    progress = item.get("progress") if isinstance(item.get("progress"), dict) else {}
    caption = str(item.get("captionRu") or "").strip()
    name = caption.splitlines()[0].strip() if caption else "Розсилка Tegger"
    sent = list(progress.get("sent") or [])
    failed = list(progress.get("failed") or [])
    return {
        "jobId": f"mailing-{item.get('id') or ''}",
        "name": name[:140],
        "sender": ",".join(item.get("senderIds") or [])[:80],
        "status": str(item.get("status") or "done"),
        "total": max(int(progress.get("total") or 0), len(item.get("targets") or [])),
        "mentioned": sent,
        "failed": failed,
        "startedAt": item.get("startedAt"),
        "finishedAt": item.get("finishedAt"),
    }


async def _report_crm(item: dict | None):
    if not isinstance(item, dict) or not item.get("id"):
        return
    url = str(os.environ.get("CRM_PUSH_INGEST_URL") or "").strip()
    token = str(os.environ.get("TEGGER_CRM_INGEST_TOKEN") or "").strip()
    if not url or not token:
        return
    payload = json.dumps(_crm_payload(item), ensure_ascii=False).encode()

    def post():
        import urllib.request

        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-tegger-ingest-token": token,
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read()

    try:
        await asyncio.to_thread(post)
    except Exception:
        pass


async def _mailing_execute(job_id: str, get_current_user=None):
    from api import _audit, execution_values, create_client  # noqa: F401
    from datetime import datetime, timezone

    cancel_event = _MAILING_CANCEL.setdefault(job_id, asyncio.Event())
    item = next((x for x in _mailing_read() if x.get("id") == job_id), None)
    if not item:
        return
    if cancel_event.is_set():
        await _mailing_mark_stopped(job_id)
        return

    await _mailing_update(
        job_id,
        status="running",
        startedAt=item.get("startedAt") or datetime.now(timezone.utc).isoformat(),
        error="",
        finishedAt=None,
        progress=_blank_progress(len(item.get("targets") or [])),
    )
    await _report_crm(next((x for x in _mailing_read() if x.get("id") == job_id), None))

    if DRY_RUN:
        await _mailing_update(
            job_id,
            status="done",
            dryRun=True,
            finishedAt=datetime.now(timezone.utc).isoformat(),
            error="DRY_RUN: отправка не выполнялась",
        )
        return

    allowed, _meta = _mailing_allowed_senders()
    sender_ids = [
        sid for sid in (item.get("senderIds") or []) if sid in allowed
    ]
    if not sender_ids:
        await _mailing_update(
            job_id,
            status="error",
            error="Нет активных сессий для выбранных сендеров",
            finishedAt=datetime.now(timezone.utc).isoformat(),
        )
        return

    async def on_progress(snapshot: dict):
        if cancel_event.is_set() and snapshot.get("phase") not in {"stopped", "done"}:
            snapshot = {**snapshot, "phase": "stopping"}
        await _mailing_update(job_id, progress=snapshot)

    try:
        limits = execution_values()
        result = await publish_mailing(
            targets=list(item.get("targets") or []),
            sender_ids=sender_ids,
            photo_path_ru=item.get("photoPathRu") or item.get("photoPath") or "",
            photo_path_pl=item.get("photoPathPl"),
            caption_ru=item.get("captionRu") or "",
            caption_pl=item.get("captionPl") or "",
            button_url=item.get("buttonUrl") or "",
            button_text_ru=item.get("buttonTextRu") or item.get("buttonText") or "",
            button_text_pl=item.get("buttonTextPl") or "",
            default_language=str(item.get("defaultLanguage") or "ru"),
            interval_min=max(2, int(limits.get("STORY_INTERVAL_MIN_SECONDS", 9)) // 3),
            interval_max=max(3, int(limits.get("STORY_INTERVAL_MAX_SECONDS", 15)) // 3),
            on_progress=on_progress,
            cancel_event=cancel_event,
        )
        if cancel_event.is_set():
            await _mailing_mark_stopped(job_id)
            return
        failed = result.get("failed") or []
        sent = result.get("sent") or []
        hint = ""
        if failed and not sent:
            hint = f"Никому не доставлено. Пропусков: {len(failed)}"
        elif failed:
            hint = f"Доставлено {len(sent)}, пропусков {len(failed)}"
        await _mailing_update(
            job_id,
            status="done",
            finishedAt=datetime.now(timezone.utc).isoformat(),
            botUsername=result.get("botUsername") or "",
            relayChatId=result.get("relayChatId") or "",
            error=hint,
        )
        await _report_crm(next((x for x in _mailing_read() if x.get("id") == job_id), None))
    except MailingStopped:
        await _mailing_mark_stopped(job_id)
    except Exception as exc:
        if cancel_event.is_set():
            await _mailing_mark_stopped(job_id)
            return
        await _mailing_update(
            job_id,
            status="error",
            finishedAt=datetime.now(timezone.utc).isoformat(),
            error=f"{type(exc).__name__}: {str(exc)[:240]}",
        )
        await _report_crm(next((x for x in _mailing_read() if x.get("id") == job_id), None))
    finally:
        _MAILING_TASKS.pop(job_id, None)
        _MAILING_CANCEL.pop(job_id, None)


def register_mailing_routes(app, *, get_current_user):
    """Монтирует розсилки; get_current_user — Depends из api.py."""

    from api import _audit, _tegger_read_upload, _tegger_photo_suffix  # noqa: WPS433
    from datetime import datetime, timezone

    @router.get("/accounts", dependencies=[Depends(get_current_user)])
    async def mailing_accounts():
        allowed, meta = _mailing_allowed_senders()
        from api import get_accounts_data

        rows = get_accounts_data()
        return [
            {
                "id": a["id"],
                "name": a.get("name", a["id"]),
                "telegram": a.get("telegram", ""),
                "telegramId": meta.get(a["id"]),
                "status": a.get("status", ""),
            }
            for a in rows
            if a["id"] in allowed
        ]

    @router.get("", dependencies=[Depends(get_current_user)])
    async def list_mailings(limit: int = 50):
        if not 1 <= limit <= 200:
            raise HTTPException(422, "Некорректный limit")
        items = sorted(
            _mailing_read(),
            key=lambda row: str(row.get("createdAt") or ""),
            reverse=True,
        )
        return [_mailing_view(item) for item in items[:limit]]

    @router.get("/{mailing_id}", dependencies=[Depends(get_current_user)])
    async def get_mailing(mailing_id: str):
        item = next((x for x in _mailing_read() if x.get("id") == mailing_id), None)
        if not item:
            raise HTTPException(404, "Розсилка не найдена")
        return _mailing_view(item)

    @router.post("/language-preview", dependencies=[Depends(get_current_user)])
    async def mailing_language_preview(
        usernames: str = Form(...),
        senderIds: str = Form(""),
    ):
        sender_list = [s.strip() for s in str(senderIds or "").split(",") if s.strip()]
        if not sender_list:
            sender_list = ["a"]
        targets = parse_mailing_targets(usernames, sender_list)
        stats = language_stats_by_targets(targets)
        return {
            "ok": True,
            "total": len(targets),
            "targetStats": target_stats(targets),
            "languages": stats,
        }

    @router.post("", dependencies=[Depends(get_current_user)])
    async def create_mailing(
        senderIds: str = Form(...),
        targets: str = Form(...),
        captionRu: str = Form(""),
        captionPl: str = Form(""),
        buttonUrl: str = Form(""),
        buttonTextRu: str = Form(""),
        buttonTextPl: str = Form(""),
        defaultLanguage: str = Form("ru"),
        file: UploadFile = File(...),
        filePl: UploadFile | None = File(None),
    ):
        senders = [s.strip() for s in str(senderIds or "").split(",") if s.strip()]
        allowed, _meta = _mailing_allowed_senders()
        if not senders or any(s not in allowed for s in senders):
            raise HTTPException(403, "Выбери аккаунты с рабочей сессией")
        parsed = parse_mailing_targets(targets, senders)
        text_ru = str(captionRu or "").strip()
        text_pl = str(captionPl or "").strip()
        if not text_ru:
            raise HTTPException(422, "Укажи текст (RU)")
        if len(text_ru) > 1024 or len(text_pl) > 1024:
            raise HTTPException(422, "Текст слишком длинный (макс. 1024)")
        link = str(buttonUrl or "").strip()
        if link and not link.startswith(("http://", "https://")):
            raise HTTPException(422, "Ссылка кнопки: http:// или https://")
        btn_ru = str(buttonTextRu or "").strip() or ("Открыть" if link else "")
        btn_pl = str(buttonTextPl or "").strip() or ("Otwórz" if link else "")

        raw_ru = await _tegger_read_upload(file)
        job_id = uuid4().hex
        _MAILING_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        suffix_ru = _tegger_photo_suffix(file.filename or "")
        photo_path_ru = _MAILING_MEDIA_DIR / f"{job_id}_ru{suffix_ru}"
        photo_path_ru.write_bytes(raw_ru)
        photo_path_pl = ""
        if filePl is not None:
            raw_pl = await _tegger_read_upload(filePl)
            suffix_pl = _tegger_photo_suffix(filePl.filename or "")
            photo_path_pl = _MAILING_MEDIA_DIR / f"{job_id}_pl{suffix_pl}"
            photo_path_pl.write_bytes(raw_pl)
            photo_path_pl = str(photo_path_pl)
        item = {
            "id": job_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "senderIds": senders,
            "targets": parsed,
            "captionRu": text_ru,
            "captionPl": text_pl,
            "buttonUrl": link,
            "buttonTextRu": btn_ru,
            "buttonTextPl": btn_pl,
            "defaultLanguage": defaultLanguage,
            "photoPathRu": str(photo_path_ru),
            "photoPathPl": photo_path_pl,
            "status": "draft",
        }
        async with _mailing_lock:
            items = _mailing_read()
            items.append(item)
            _mailing_write(items)
        _audit("INFO", "Создана розсилка", f"{len(parsed)} получателей · {job_id[:8]}", senders[0])
        return _mailing_view(item)

    @router.post("/{mailing_id}/start", dependencies=[Depends(get_current_user)])
    async def start_mailing(mailing_id: str):
        async with _mailing_lock:
            items = _mailing_read()
            item = next((x for x in items if x.get("id") == mailing_id), None)
            if not item:
                raise HTTPException(404, "Розсилка не найдена")
            if item.get("status") in ("running", "stopping"):
                raise HTTPException(409, "Розсилка уже выполняется")
            if item.get("status") == "done" and not item.get("dryRun"):
                raise HTTPException(409, "Розсилка завершена — создай новую")
            if any(x.get("status") in ("running", "stopping") for x in items):
                raise HTTPException(409, "Уже выполняется другая задача")
            item["status"] = "running"
            item["progress"] = _blank_progress(len(item.get("targets") or []))
            _mailing_write(items)
        if _MAILING_TASKS.get(mailing_id) and not _MAILING_TASKS[mailing_id].done():
            raise HTTPException(409, "Запуск уже в процессе")
        _MAILING_CANCEL[mailing_id] = asyncio.Event()
        _MAILING_TASKS[mailing_id] = asyncio.create_task(_mailing_execute(mailing_id))
        return {"ok": True, "id": mailing_id, "status": "running"}

    @router.post("/{mailing_id}/stop", dependencies=[Depends(get_current_user)])
    async def stop_mailing(mailing_id: str):
        item = next((x for x in _mailing_read() if x.get("id") == mailing_id), None)
        if not item:
            raise HTTPException(404, "Розсилка не найдена")
        if item.get("status") not in ("running", "stopping"):
            raise HTTPException(409, "Розсилка не выполняется")
        event = _MAILING_CANCEL.get(mailing_id)
        if event:
            event.set()
        async with _mailing_lock:
            items = _mailing_read()
            current = next((x for x in items if x.get("id") == mailing_id), None)
            if current and current.get("status") == "running":
                current["status"] = "stopping"
                _mailing_write(items)
        return {"ok": True, "id": mailing_id, "status": "stopping"}

    app.include_router(router)