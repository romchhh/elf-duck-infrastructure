"""Campaign-scoped durable queue. NO Telegram calls and NO Migration access.

In-flight items from a crashed executor become 'uncertain' (not automatically
retried) to avoid duplicate Stories when Telegram succeeded before local commit.
"""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from config import DATA_DIR
from src.campaign_progress import read_progress


def normalize(value):
    return str(value or '').strip().lstrip('@').lower()


def validate_campaign(campaign):
    campaign_id = str(campaign.get('id', ''))
    if str(campaign_id) != 'migration' and not re.fullmatch(r'[0-9a-f]{32}', str(campaign_id)):

        raise ValueError('Invalid campaign id')
    senders = campaign.get('senderIds', [])
    if not isinstance(senders, list) or not senders or len(senders) != len(set(senders)):
        raise ValueError('Invalid sender list')
    targets = campaign.get('targets', [])
    if not isinstance(targets, list):
        raise ValueError('Invalid target list')
    seen = set()
    for row in targets:
        username = normalize(row.get('username'))
        if not re.fullmatch(r'[a-zA-Z0-9_]{5,32}', username):
            raise ValueError('Invalid username')
        if username in seen:
            raise ValueError('Duplicate target in campaign')
        seen.add(username)
        if row.get('sender') not in senders:
            raise ValueError('Target assigned to unknown sender')
    return campaign_id


def database_path(campaign_id):
    if str(campaign_id) != 'migration' and not re.fullmatch(r'[0-9a-f]{32}', str(campaign_id)):

        raise ValueError('Invalid campaign id')
    return Path(DATA_DIR) / 'campaign_queues' / (campaign_id + '.sqlite3')


@contextmanager
def transaction(campaign_id):
    path = database_path(campaign_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=15) as db:
        db.execute('PRAGMA busy_timeout=15000')
        db.execute('BEGIN IMMEDIATE')
        db.execute("""CREATE TABLE IF NOT EXISTS queue (
            username TEXT PRIMARY KEY, sender TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending','leased','confirmed','uncertain')),
            claimed_at TEXT, confirmed_at TEXT, attempt INTEGER NOT NULL DEFAULT 0
        )""")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise


def reconcile(campaign):
    """Sync assignments and confirmed journal. Never reset uncertain or confirmed."""
    campaign_id = validate_campaign(campaign)
    journal = read_progress(campaign_id)
    rows = campaign['targets']
    with transaction(campaign_id) as db:
        existing = {r[0]: (r[1], r[2]) for r in db.execute('SELECT username,sender,status FROM queue')}
        expected = {normalize(t['username']): t['sender'] for t in rows}
        for username, (sender, status) in existing.items():
            if username not in expected:
                raise ValueError('Target removed from persisted queue; refusing to discard state')
            if sender != expected[username]:
                if status != 'pending':
                    raise ValueError('Sender changed for an already claimed target: ' + username)
                db.execute('UPDATE queue SET sender=? WHERE username=?', (expected[username], username))
        for username, sender in expected.items():
            db.execute('INSERT OR IGNORE INTO queue(username,sender,status) VALUES(?,?,?)', (username, sender, 'pending'))
            entry = journal.get(username)
            if entry and entry.get('status') == 'Отмечен':
                if entry.get('sender') != sender:
                    raise ValueError('Journal sender mismatch for ' + username)
                db.execute("""UPDATE queue SET status='confirmed', confirmed_at=COALESCE(confirmed_at,?)
                    WHERE username=?""", (entry.get('processedAt') or datetime.now(timezone.utc).isoformat(), username))
        # Routine reads and DRY_RUN must not invalidate active worker leases.
        # Recovery of interrupted leases is an explicit offline operation.
    return snapshot(campaign_id)


def recover_interrupted_leases(campaign_id):
    """OFFLINE ONLY: invoke only after stopping all workers for this campaign.

    A matching durable success journal confirms a lease. Otherwise it becomes
    uncertain and cannot be automatically claimed again.
    """
    journal = read_progress(campaign_id)
    with transaction(campaign_id) as db:
        rows = db.execute("SELECT username,sender FROM queue WHERE status='leased'").fetchall()
        for username, sender in rows:
            entry = journal.get(username)
            if entry and entry.get('sender') == sender and entry.get('status') == 'Отмечен':
                db.execute(
                    "UPDATE queue SET status='confirmed', confirmed_at=COALESCE(confirmed_at,?) WHERE username=? AND status='leased'",
                    (entry.get('processedAt') or datetime.now(timezone.utc).isoformat(), username),
                )
            else:
                db.execute("UPDATE queue SET status='uncertain' WHERE username=? AND status='leased'", (username,))
    return snapshot(campaign_id)


def snapshot(campaign_id, limit=20):
    path = database_path(campaign_id)
    if not path.exists():
        return {'total': 0, 'pending': 0, 'confirmed': 0, 'uncertain': 0, 'leased': 0, 'senders': [], 'preview': []}
    with sqlite3.connect(path) as db:
        _create_failure_table(db)
        counts = dict(db.execute('SELECT status, COUNT(*) FROM queue GROUP BY status').fetchall())
        per_sender = [dict(sender=r[0], status=r[1], count=r[2]) for r in db.execute(
            'SELECT sender,status,COUNT(*) FROM queue GROUP BY sender,status ORDER BY sender,status')]
        preview = [dict(username='@'+r[0], sender=r[1]) for r in db.execute(
            "SELECT username,sender FROM queue WHERE status='pending' AND username NOT IN "
            "(SELECT username FROM target_failures) ORDER BY rowid LIMIT ?", (limit,))]
    failures = failure_snapshot(campaign_id)
    return {'total': sum(counts.values()), 'skipped': failures['skipped'],
            'pending': counts.get('pending', 0) - failures['skipped'],
            'confirmed': counts.get('confirmed', 0), 'uncertain': counts.get('uncertain', 0),
            'leased': counts.get('leased', 0), 'senders': per_sender, 'preview': preview}


def claim_for_future_worker(campaign_id, sender):
    """Internal future integration point. NEVER called by API or dry-run."""
    with transaction(campaign_id) as db:
        _create_failure_table(db)
        row = db.execute("""SELECT username FROM queue WHERE sender=? AND status='pending'
            AND username NOT IN (SELECT username FROM target_failures) ORDER BY rowid LIMIT 1""", (sender,)).fetchone()
        if not row:
            return None
        username = row[0]
        db.execute("UPDATE queue SET status='leased', attempt=attempt+1, claimed_at=? WHERE username=?",
                   (datetime.now(timezone.utc).isoformat(), username))
        return username


def confirm_after_telegram_and_journal(campaign_id, sender, username):
    """Only future LIVE integration may call this after record_story_success."""
    username = normalize(username)
    entry = read_progress(campaign_id).get(username)
    if not entry or entry.get('sender') != sender or entry.get('status') != 'Отмечен':
        raise ValueError('Cannot confirm without matching durable success journal')
    with transaction(campaign_id) as db:
        row = db.execute('SELECT sender FROM queue WHERE username=?', (username,)).fetchone()
        if row is None or row[0] != sender:
            raise ValueError('Queue assignment mismatch')
        db.execute("UPDATE queue SET status='confirmed', confirmed_at=? WHERE username=?",
                   (entry.get('processedAt') or datetime.now(timezone.utc).isoformat(), username))


def dry_run(campaign):
    """Offline simulation: sync disk queue, show remaining, NEVER claim/send/complete."""
    state = reconcile(campaign)
    return {'ok': True, 'mode': 'DRY_RUN', 'workerExecuted': False,
            'telegramRequests': 0, 'storiesPublished': 0,
            'targetsMarkedCompleted': 0, 'campaignId': campaign['id'],
            'queue': state, 'note': 'No Telegram calls. Pending remains pending; uncertain requires manual reconciliation.'}


# OFFLINE CAMPAIGN FAILURE OUTCOMES V1
def _create_failure_table(db):
    db.execute("""CREATE TABLE IF NOT EXISTS target_failures (
        username TEXT PRIMARY KEY, sender TEXT NOT NULL,
        stage TEXT NOT NULL CHECK(stage IN ('resolve','interaction')),
        error_type TEXT NOT NULL, detail TEXT NOT NULL,
        failed_at TEXT NOT NULL
    )""")

def record_skipped_failure(campaign_id, sender, username, stage, error_type, detail):
    """Record a confirmed pre-publication failure; only a claimed target can be skipped.

    This is an integration hook, not called by LIVE worker or DRY_RUN.
    """
    username = normalize(username)
    if stage not in ('resolve', 'interaction'):
        raise ValueError('Only pre-publication failure can be skipped')
    if not username or not sender:
        raise ValueError('Username and sender required')
    with transaction(campaign_id) as db:
        _create_failure_table(db)
        row = db.execute('SELECT sender,status FROM queue WHERE username=?', (username,)).fetchone()
        if row != (sender, 'leased'):
            raise ValueError('Target must be leased to this sender before recording a failure')
        db.execute('INSERT INTO target_failures(username,sender,stage,error_type,detail,failed_at) VALUES(?,?,?,?,?,?)',
                   (username, sender, stage, str(error_type)[:120], str(detail)[:1000], datetime.now(timezone.utc).isoformat()))
        # A skipped target is excluded by failure table; its queue row stays pending
        # so the original queue schema remains compatible without migration.
        db.execute("UPDATE queue SET status='pending',claimed_at=NULL WHERE username=?", (username,))

def failure_snapshot(campaign_id):
    path = database_path(campaign_id)
    if not path.exists():
        return {'skipped': 0, 'failures': []}
    with sqlite3.connect(path) as db:
        present = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='target_failures'").fetchone()
        if not present:
            return {'skipped': 0, 'failures': []}
        rows = db.execute('SELECT username,sender,stage,error_type,detail,failed_at FROM target_failures ORDER BY failed_at').fetchall()
    return {'skipped': len(rows), 'failures': [dict(zip(('username','sender','stage','errorType','detail','failedAt'),
                                                       ('@'+r[0], *r[1:]))) for r in rows]}
