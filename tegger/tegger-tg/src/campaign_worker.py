"""Persistent single-campaign opt-in Story worker. One mention per Story.

A leased target is never automatically retried after an uncertain result.
"""
import asyncio
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from config import DATA_DIR, DRY_RUN, SENDERS, SESSIONS_DIR
from src.campaign_executor import reconcile, recover_interrupted_leases, claim_for_future_worker, confirm_after_telegram_and_journal, snapshot
from src.campaign_progress import record_story_success
from src.story import repost_template_story
from src.telegram_client import create_client

CONTROL = Path(DATA_DIR) / 'campaign_worker_control.json'

def _utc():
    return datetime.now(timezone.utc).isoformat()

def read():
    if not CONTROL.exists():
        return {'status': 'idle', 'campaignId': None, 'telegramRequests': 0, 'storiesPublished': 0}
    return json.loads(CONTROL.read_text(encoding='utf-8'))

def write(state):
    CONTROL.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, name = tempfile.mkstemp(dir=CONTROL.parent, prefix='.campaign-worker-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(state, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, CONTROL)
    finally:
        Path(name).unlink(missing_ok=True)

def campaign_by_id(campaign_id):
    if campaign_id == 'migration':
        snapshot_dir = Path(DATA_DIR) / 'railway_snapshot'
        assignments_path = snapshot_dir / 'migration_assignments.json'
        processed_path = snapshot_dir / 'processed.json'
        if not assignments_path.is_file() or not processed_path.is_file():
            raise ValueError('Migration snapshots missing in Railway DATA_DIR/railway_snapshot')
        assignments_doc = json.loads(assignments_path.read_text(encoding='utf-8'))
        processed_doc = json.loads(processed_path.read_text(encoding='utf-8'))
        assignments = assignments_doc.get('assignments') if isinstance(assignments_doc, dict) else None
        if not isinstance(assignments, dict) or not isinstance(processed_doc, list):
            raise ValueError('Invalid Migration snapshot format')
        sender_ids = list(assignments.keys())
        if not sender_ids or any(sender not in SENDERS for sender in sender_ids):
            raise ValueError('Migration sender missing from config.SENDERS')
        def normalize(value):
            if isinstance(value, dict):
                value = value.get('username')
            return str(value or '').strip().lstrip('@').lower()
        targets = []
        seen = set()
        for sender, usernames in assignments.items():
            if not isinstance(usernames, list):
                raise ValueError('Invalid Migration sender assignments: ' + sender)
            for item in usernames:
                import re

                username = normalize(item)

                if not re.fullmatch(r"[a-zA-Z0-9_]{5,32}", username):

                    print(f"[MIGRATION] Invalid target skipped: sender={sender}, username={username!r}")

                    continue

                if username in seen:

                    continue
                seen.add(username)
                targets.append({'username': username, 'sender': sender})
        if not targets:
            raise ValueError('Migration assignments empty')
        processed = {normalize(item) for item in processed_doc}
        return {
            'id': 'migration',
            'name': 'Migration campaign',
            'senderIds': sender_ids,
            'targets': targets,
            '_legacyProcessed': sorted(processed & seen),
            'consentConfirmed': True,
        }
    path = Path(DATA_DIR) / 'ui_campaigns.json'
    campaigns = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    return next((c for c in campaigns if c.get('id') == campaign_id), None)

def check(campaign):
    from src.campaign_executor import validate_campaign
    if not campaign:
        raise ValueError('Кампания не найдена')
    validate_campaign(campaign)
    if DRY_RUN:
        raise ValueError('DRY_RUN=true: LIVE отключён')
    if not campaign.get('consentConfirmed'):
        raise ValueError('Не подтверждено предварительное согласие всех получателей')
    if campaign['id'] != 'migration' and any(s in SENDERS for s in campaign['senderIds']):
        raise ValueError('Migration sender запрещён для других кампаний')
    if campaign['id'] == 'migration' and any(s not in SENDERS for s in campaign['senderIds']):
        raise ValueError('Неизвестный sender в Migration')
    if not campaign['targets']:
        raise ValueError('Пустая кампания')
    for sender in campaign['senderIds']:
        if not (Path(SESSIONS_DIR) / (sender + '.session')).is_file():
            raise ValueError('Отсутствует сессия: ' + sender)
    return True

async def run_one(sender, username):
    client = create_client(sender)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            raise RuntimeError('Telegram session unauthorized')
        entity = await client.get_entity(username)
        if not getattr(entity, 'username', None):
            raise RuntimeError('Target has no username')
        # Publication is the point of no return. The lease is durable before this call.
        return await repost_template_story(client, [entity], sender)
    finally:
        await client.disconnect()

async def run(stop_event):
    state = read()
    if state.get('status') not in ('running', 'stopping'):
        return
    campaign_id = state['campaignId']
    try:
        campaign = campaign_by_id(campaign_id)
        check(campaign)
        # A single process owns the worker lock. On restart any stale lease is uncertain.
        reconcile(campaign)
        if campaign_id == 'migration':
            # Import legacy confirmations into the durable queue, without touching
            # leased/uncertain/confirmed items or deleting any progress.
            from src.campaign_executor import transaction
            with transaction(campaign_id) as db:
                for username in campaign['_legacyProcessed']:
                    db.execute(
                        "UPDATE queue SET status='confirmed', confirmed_at=COALESCE(confirmed_at, ?) WHERE username=? AND status='pending'",
                        (_utc(), username),
                    )
        recover_interrupted_leases(campaign_id)
        while not stop_event.is_set():
            state = read()
            if state.get('campaignId') != campaign_id or state.get('status') != 'running':
                break
            claimed = None
            for sender in campaign['senderIds']:
                claimed = claim_for_future_worker(campaign_id, sender)
                if claimed:
                    break
            if not claimed:
                state['status'] = 'finished'
                write(state)
                return
            # This target is leased before any Telegram action; ambiguous outcomes stay uncertain.
            state['current'] = {'sender': sender, 'username': '@' + claimed, 'startedAt': _utc()}
            write(state)
            try:
                await run_one(sender, claimed)

            except ValueError as exc:
                message = str(exc)

                if message.startswith("No user has "):
                    from src.campaign_executor import record_skipped_failure

                    record_skipped_failure(
                        campaign_id,
                        sender,
                        claimed,
                        "resolve",
                        type(exc).__name__,
                        message,
                    )

                    state = read()
                    state["lastSkipped"] = {
                        "sender": sender,
                        "username": "@" + claimed,
                        "reason": message[:200],
                    }
                    state["skipped"] = int(state.get("skipped", 0)) + 1
                    state["current"] = None
                    write(state)

                    continue

                state = read()
                state["lastError"] = type(exc).__name__ + ": " + message[:200]
                state["status"] = "error"
                state["current"] = None
                write(state)
                return

            except Exception as exc:
                state = read()
                state["lastError"] = type(exc).__name__ + ": " + str(exc)[:200]
                state["status"] = "error"
                state["current"] = None
                write(state)
                return
            record_story_success(campaign_id, sender, [claimed])
            confirm_after_telegram_and_journal(campaign_id, sender, claimed)
            state = read()
            state['storiesPublished'] = int(state.get('storiesPublished', 0)) + 1
            state['telegramRequests'] = int(state.get('telegramRequests', 0)) + 1
            state['lastSuccessAt'] = _utc()
            state['current'] = None
            write(state)
            # Stop is observed between operations, including the waiting interval.
            for _ in range(900):
                if stop_event.is_set() or read().get('status') != 'running':
                    break
                await asyncio.sleep(1)
        state = read()
        if state.get('campaignId') == campaign_id and state.get('status') in ('stopping', 'running'):
            state['status'] = 'stopped'
            state['current'] = None
            write(state)
    except Exception as exc:
        state = read()
        state['status'] = 'error'
        state['lastError'] = type(exc).__name__ + ': ' + str(exc)[:200]
        write(state)
