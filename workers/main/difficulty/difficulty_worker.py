# ==================================
# ⚙️ DIFFICULTY_WORKER_PY -- NODE I --
# Daily @ 01:00 UTC (robust, deterministic)
# ==================================

import os
import json
import time
from datetime import datetime, timezone, timedelta
import redis

# Zeit / Config
from utils.time_helpers import utc_now
from core.redis_keys import (
    BLOCKCHAIN_GETBLOCKCHAININFO_KEY,
    RETRY_INTERVAL_SECONDS,
)

# RPC Hauptnode
from nodes.config import NODE_CONFIG
from nodes.rpc import BitcoinRPC

DAILY_RUN_HOUR_UTC = 1  # 🔒 FIXED: 01:00 UTC

RPC = BitcoinRPC(NODE_CONFIG["main"])
RPC.require_full_node()
print(f"[DIFFICULTY] Worker bound to RPC {RPC.info()}")

# JSONL Pfad
DIFF_FILE = "/raid/data/bitcoin_dashboard/metrics_history/difficulty/difficulty_history.jsonl"
os.makedirs(os.path.dirname(DIFF_FILE), exist_ok=True)

# Redis Client
r = redis.Redis(host="localhost", port=6379, db=0)

# -------------------------------------------------
# Helpers
# -------------------------------------------------

def tail_jsonl(path, lines):
    if not os.path.exists(path):
        return []

    out = []
    with open(path, "rb") as f:
        f.seek(0, 2)
        pos = f.tell() - 1
        buf = bytearray()

        while pos >= 0 and len(out) < lines:
            f.seek(pos)
            b = f.read(1)
            if b == b"\n":
                if buf:
                    out.append(json.loads(buf[::-1].decode()))
                    buf.clear()
            else:
                buf.append(b[0])
            pos -= 1

        if buf:
            out.append(json.loads(buf[::-1].decode()))

    return list(reversed(out))


def last_entry_date():
    data = tail_jsonl(DIFF_FILE, 1)
    if not data:
        return None

    return datetime.fromtimestamp(
        data[0]["time"],
        timezone.utc
    ).date()


def seconds_until_next_run(hour_utc: int) -> int:
    now = utc_now()

    target = datetime(
        now.year,
        now.month,
        now.day,
        hour_utc,
        0,
        0,
        tzinfo=timezone.utc
    )

    if now >= target:
        target += timedelta(days=1)

    return max(1, int((target - now).total_seconds()))


def debug_state(today, last):
    print(
        "[DIFFICULTY]",
        "now=", utc_now().isoformat(),
        "today=", today.isoformat(),
        "last=", last.isoformat() if last else None,
    )

# -------------------------------------------------
# Redis Charts
# -------------------------------------------------

def write_redis_from_jsonl():
    print("[DIFFICULTY] Updating Redis")

    r.set("CHART_BTC_DIFFICULTY_1y", json.dumps({
        "history": tail_jsonl(DIFF_FILE, 365)
    }))
    r.set("CHART_BTC_DIFFICULTY_5y", json.dumps({
        "history": tail_jsonl(DIFF_FILE, 365 * 5)
    }))
    r.set("CHART_BTC_DIFFICULTY_10y", json.dumps({
        "history": tail_jsonl(DIFF_FILE, 365 * 10)
    }))
    r.set("CHART_BTC_DIFFICULTY_ever", json.dumps({
        "history": tail_jsonl(DIFF_FILE, 365 * 50)
    }))

# -------------------------------------------------
# Write new daily entry
# -------------------------------------------------

def write_new_entry(today):
    raw = r.get(BLOCKCHAIN_GETBLOCKCHAININFO_KEY)
    if not raw:
        raise RuntimeError("No blockchain info in Redis")

    info = json.loads(raw)
    difficulty = info.get("difficulty")
    if difficulty is None:
        raise RuntimeError("Difficulty missing in blockchaininfo")

    day_start = datetime(
        today.year,
        today.month,
        today.day,
        tzinfo=timezone.utc
    )

    entry = {
        "day": today.isoformat(),
        "time": int(day_start.timestamp()),
        "difficulty": difficulty,
    }

    with open(DIFF_FILE, "a") as f:
        f.write(json.dumps(entry, separators=(",", ":")) + "\n")
        f.flush()
        os.fsync(f.fileno())

    print(f"[DIFFICULTY] Written {today}")
    write_redis_from_jsonl()

# -------------------------------------------------
# Main loop
# -------------------------------------------------

def difficulty_worker_loop():
    print("[DIFFICULTY] Worker started")

    # Cold start
    write_redis_from_jsonl()

    while True:
        try:
            now   = utc_now()
            today = now.date()
            last  = last_entry_date()

            debug_state(today, last)

            # Noch vor 01:00 UTC → warten
            if now.hour < DAILY_RUN_HOUR_UTC:
                sleep_s = seconds_until_next_run(DAILY_RUN_HOUR_UTC)
                print(f"[DIFFICULTY] Waiting for 01:00 UTC, sleeping {sleep_s}s")
                time.sleep(sleep_s)
                continue

            # Neuer Tag → schreiben
            if last is None or today > last:
                write_new_entry(today)
                time.sleep(5)
                continue

            # Nichts zu tun → bis nächstes 01:00 UTC schlafen
            sleep_s = seconds_until_next_run(DAILY_RUN_HOUR_UTC)
            print(f"[DIFFICULTY] No work, sleeping {sleep_s}s until next 01:00 UTC")
            time.sleep(sleep_s)

        except Exception as e:
            print("[DIFFICULTY] Error:", e)
            time.sleep(RETRY_INTERVAL_SECONDS)
