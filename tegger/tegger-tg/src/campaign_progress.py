"""Campaign-scoped durable progress journal. Does not read or write Migration state."""
import json
import os
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from config import DATA_DIR


def _normalize(value):
    return str(value or "").strip().lstrip("@").lower()


def _journal_path(campaign_id):
    import re
    if str(campaign_id) != "migration" and not re.fullmatch(r"[0-9a-f]{32}", str(campaign_id)):

        raise ValueError("Invalid campaign id")
    return Path(DATA_DIR) / "campaign_progress" / (campaign_id + ".json")


def read_progress(campaign_id):
    path = _journal_path(campaign_id)
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Invalid campaign progress journal")
    return data


def record_story_success(campaign_id, sender, usernames):
    """Persist only after Telegram confirmed Story publication and sender state commit."""
    path = _journal_path(campaign_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = read_progress(campaign_id)
    now = datetime.now(timezone.utc).isoformat()
    for raw in usernames:
        username = _normalize(raw)
        if username:
            old = data.get(username)
            if old and old.get("status") == "Отмечен":
                continue
            data[username] = {"sender": sender, "status": "Отмечен", "processedAt": now}
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=".progress-", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return data


def merged_targets(campaign):
    """Overlay journal without attributing unrelated sender activity to a campaign."""
    progress = read_progress(campaign["id"])
    result = []
    for target in campaign.get("targets", []):
        row = dict(target)
        entry = progress.get(_normalize(row.get("username")))
        if entry and entry.get("sender") == row.get("sender") and entry.get("status") == "Отмечен":
            row.update({"status": "Отмечен", "processedAt": entry.get("processedAt"), "error": None})
        result.append(row)
    return result
