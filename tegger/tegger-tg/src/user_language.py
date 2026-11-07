"""Мови мініапу з MongoDB (як CRM push): pl | ru, н/д → ru."""

from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any

DEFAULT_LANGUAGE = "ru"


def normalize_app_language(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    if raw == "pl" or raw.startswith("pl"):
        return "pl"
    if raw.startswith("en"):
        return "pl"
    if raw == "ru" or raw.startswith("ru") or raw.startswith("uk") or raw.startswith("be"):
        return "ru"
    return ""


def resolve_language(value: Any, *, default: str = DEFAULT_LANGUAGE) -> str:
    lang = normalize_app_language(value)
    if lang in ("pl", "ru"):
        return lang
    return default if default in ("pl", "ru") else DEFAULT_LANGUAGE


@lru_cache(maxsize=1)
def _mongo_db():
    uri = str(os.getenv("MONGODB_URI", "")).strip()
    if not uri:
        return None
    try:
        from pymongo import MongoClient
    except ImportError:
        return None
    client = MongoClient(uri, serverSelectionTimeoutMS=4000)
    try:
        return client.get_default_database()
    except Exception:
        name = str(os.getenv("MONGODB_DB", "elfduck")).strip() or "elfduck"
        return client[name]


def _users_collection():
    db = _mongo_db()
    if db is None:
        return None
    return db.get_collection("users")


def language_stats_by_usernames(usernames: list[str]) -> dict[str, int]:
    stats = {"pl": 0, "ru": 0, "unknown": 0}
    names = [
        str(u or "").strip().lower().lstrip("@")
        for u in usernames
        if str(u or "").strip()
    ]
    if not names:
        return stats
    coll = _users_collection()
    if coll is None:
        stats["unknown"] = len(names)
        return stats
    found = set()
    try:
        rows = coll.find(
            {"username": {"$in": names}},
            {"username": 1, "language": 1},
        )
        for row in rows:
            uname = str(row.get("username") or "").strip().lower()
            if not uname:
                continue
            found.add(uname)
            lang = normalize_app_language(row.get("language"))
            if lang == "pl":
                stats["pl"] += 1
            elif lang == "ru":
                stats["ru"] += 1
            else:
                stats["unknown"] += 1
    except Exception:
        stats["unknown"] = len(names)
        return stats
    missing = len(names) - len(found)
    stats["unknown"] += max(0, missing)
    return stats


def languages_for_entities(entities: list, *, default: str = DEFAULT_LANGUAGE) -> dict[int, str]:
    """Telethon User.id -> pl|ru."""
    if not entities:
        return {}
    default = resolve_language(default, default=DEFAULT_LANGUAGE)
    ids = [str(getattr(e, "id", "")) for e in entities if getattr(e, "id", None)]
    names = [
        str(getattr(e, "username", "") or "").strip().lower()
        for e in entities
        if getattr(e, "username", None)
    ]
    by_tid: dict[str, str] = {}
    by_name: dict[str, str] = {}
    coll = _users_collection()
    if coll is not None and (ids or names):
        clauses = []
        if ids:
            clauses.append({"telegramId": {"$in": ids}})
        if names:
            clauses.append({"username": {"$in": names}})
        try:
            for row in coll.find({"$or": clauses}, {"telegramId": 1, "username": 1, "language": 1}):
                lang = resolve_language(row.get("language"), default=default)
                tid = str(row.get("telegramId") or "").strip()
                uname = str(row.get("username") or "").strip().lower().lstrip("@")
                if tid:
                    by_tid[tid] = lang
                if uname:
                    by_name[uname] = lang
        except Exception:
            pass
    out: dict[int, str] = {}
    for entity in entities:
        uid = getattr(entity, "id", None)
        if uid is None:
            continue
        tid = str(uid)
        uname = str(getattr(entity, "username", "") or "").strip().lower()
        lang = by_tid.get(tid) or (by_name.get(uname) if uname else "") or default
        out[int(uid)] = resolve_language(lang, default=default)
    return out
