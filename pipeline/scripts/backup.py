"""voice_raw_posts, voice_hourly_stats, voice_daily_stats를 CSV로 백업.

출력: pipeline/backups/{YYYYMMDD_HHMMSS}/
실행: cd pipeline && uv run python scripts/backup.py
"""

import csv
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.db import get_supabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TABLES = [
    "voice_raw_posts",
    "voice_hourly_stats",
    "voice_daily_stats",
]


def backup_table(db, table: str, out_dir: Path) -> int:
    rows = db.table(table).select("*").execute().data or []
    if not rows:
        logger.info("%s: 0건 (스킵)", table)
        return 0
    out_file = out_dir / f"{table}.csv"
    with out_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    logger.info("%s: %d건 → %s", table, len(rows), out_file)
    return len(rows)


def main() -> None:
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(__file__).parent.parent / "backups" / ts
    out_dir.mkdir(parents=True, exist_ok=True)

    db = get_supabase(use_service_role=True)
    totals = {}
    for table in TABLES:
        totals[table] = backup_table(db, table, out_dir)

    logger.info("=== 백업 완료: %s ===", out_dir)
    for table, count in totals.items():
        logger.info("  %-30s %d건", table, count)


if __name__ == "__main__":
    main()
