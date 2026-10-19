#!/usr/bin/env python3
"""Offline-only campaign queue CLI. No Telegram calls."""
import argparse
import json
from pathlib import Path
from config import DATA_DIR
from src.campaign_executor import dry_run


def main():
    p = argparse.ArgumentParser(description='Offline campaign queue simulation (never publishes Stories)')
    p.add_argument('--campaign-id', required=True)
    args = p.parse_args()
    path = Path(DATA_DIR) / 'ui_campaigns.json'
    campaigns = json.loads(path.read_text(encoding='utf-8'))
    campaign = next((c for c in campaigns if c.get('id') == args.campaign_id), None)
    if campaign is None:
        raise SystemExit('Campaign not found; Migration is never accepted')
    print(json.dumps(dry_run(campaign), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
