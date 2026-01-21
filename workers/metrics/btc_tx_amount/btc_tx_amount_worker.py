# ==================================================
# 🔥 TX AMOUNT WORKER (Metrics, RAM-only, UTC-clean)
# ==================================================

import os
import time
import json
import redis
from datetime import datetime, timezone

from core.redis_keys import (
    BTC_TOP_TXS_KEY,
    BTC_TX_AMOUNT_HISTORY_KEY,
    BTC_TX_AMOUNT_STATS_KEY,
    BTC_TX_AMOUNT_TOP_NOW,
    BTC_TX_AMOUNT_TOP_OTHER,
    BTC_TX_AMOUNT_AGG_INTERVAL,
)

# ============================
# ⏱️ Time helpers (STRICT UTC)
# ============================
def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def utc_ms() -> int:
    return int(utc_now().timestamp() * 1000)

# ==============================
# 📆 Time windows (milliseconds)
# ==============================
ONE_DAY_MS   = 86400 * 1000
ONE_WEEK_MS  = 7 * ONE_DAY_MS
ONE_MONTH_MS = 30 * ONE_DAY_MS
ONE_YEAR_MS  = 365 * ONE_DAY_MS

# =========================
# ⛏️ Bitcoin Halvings (UTC)
# =========================
HALVINGS_UTC = [
    datetime(2012, 11, 28, tzinfo=timezone.utc),
    datetime(2016, 7, 9,  tzinfo=timezone.utc),
    datetime(2020, 5, 11, tzinfo=timezone.utc),
    datetime(2024, 4, 19, 0, 9, tzinfo=timezone.utc),
]

def last_halving_ms(now_utc: datetime) -> int:
    """
    Liefert den Timestamp (ms) des LETZTEN Halvings
    relativ zu jetzt (UTC).
    """
    for h in reversed(HALVINGS_UTC):
        if h <= now_utc:
            return int(h.timestamp() * 1000)
    return 0

# =====
# Redis
# =====
r = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=False
)

# ===============
# In-Memory State
# ===============
top_event_store = {
    "events": [] 
}
seen_txids = set()

# =====================
# Restore from snapshot
# =====================
def restore_from_snapshot():
    """
    Warmstart aus letztem BTC_TX_AMOUNT Snapshot (daily JSON, overwrite)
    """

    BASE_DIR = "/raid/data/bitcoin_dashboard/metrics_history/btc_tx_amount_history"

    if not os.path.isdir(BASE_DIR):
        print("[TX_AMOUNT WARMSTART] no snapshot directory")
        return

    files = sorted(
        f for f in os.listdir(BASE_DIR)
        if f.startswith("btc_tx_amount_") and f.endswith(".json")
    )

    if not files:
        print("[TX_AMOUNT WARMSTART] no snapshots found → cold start")
        return

    path = os.path.join(BASE_DIR, files[-1])

    try:
        with open(path, "r") as f:
            payload = json.load(f)
    except Exception as e:
        print(f"[TX_AMOUNT WARMSTART] failed to load snapshot: {e}")
        return

    restored = 0

    for key, bucket in payload.items():
        if not isinstance(bucket, list):
            continue

        for e in bucket:
            txid = e.get("txid")
            if not txid or txid in seen_txids:
                continue

            seen_txids.add(txid)
            top_event_store["events"].append(e)
            restored += 1

    print(
        f"[TX_AMOUNT WARMSTART] restored {restored} events "
        f"from snapshot {files[-1]}"
    )

# ==============
# Window helpers
# ==============
def window_cutoff(window: str, now_ms: int, now_utc: datetime) -> int:
    if window == "24h":     return now_ms - ONE_DAY_MS
    if window == "1w":      return now_ms - ONE_WEEK_MS
    if window == "1m":      return now_ms - ONE_MONTH_MS
    if window == "1y":      return now_ms - ONE_YEAR_MS
    if window == "halving": return last_halving_ms(now_utc)
    if window == "ever":    return 0
    return 0

def build_top(window: str, limit: int, now_ms: int, now_utc: datetime):
    cutoff = window_cutoff(window, now_ms, now_utc)

    candidates = [
        e for e in top_event_store["events"]
        if e["timestamp_ms"] >= cutoff
    ]

    return sorted(
        candidates,
        key=lambda x: x["btc_value"],
        reverse=True
    )[:limit]

# ==================
# Ingest current top
# ==================
def ingest_now_top(now_top, now_ms: int):
    for tx in now_top:
        txid = tx.get("txid")
        if not txid or txid in seen_txids:
            continue

        event = {
            "txid": txid,
            "btc_value": float(tx["btc_value"]),
            "timestamp_ms": now_ms
        }

        seen_txids.add(txid)
        top_event_store["events"].append(event)

# ===========
# Aggregation
# ===========
def build_tx_amount():
    now_utc = utc_now()
    now_ms  = int(now_utc.timestamp() * 1000)

    raw = r.get(BTC_TOP_TXS_KEY)
    if not raw:
        return None

    try:
        data = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
        now_top = data.get("top10", [])
    except Exception:
        return None

    # 🔹 NOW = SNAPSHOT (separate Quelle!)
    now_sorted = sorted(
        now_top,
        key=lambda x: x.get("btc_value", 0),
        reverse=True
    )[:BTC_TX_AMOUNT_TOP_NOW]

    now_bucket = []
    for tx in now_sorted:
        txid = tx.get("txid")
        if not txid:
            continue

        event = {
            "txid": txid,
            "btc_value": float(tx["btc_value"]),
            "timestamp_ms": now_ms
        }

        now_bucket.append(event)

        # 👇 wichtig: nur hier ingestieren
        if txid not in seen_txids:
            seen_txids.add(txid)
            top_event_store["events"].append(event)

    return {
        "now":     now_bucket,  # ✅ korrekt
        "24h":     build_top("24h",     BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "1w":      build_top("1w",      BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "1m":      build_top("1m",      BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "1y":      build_top("1y",      BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "halving": build_top("halving", BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "ever":    build_top("ever",    BTC_TX_AMOUNT_TOP_OTHER, now_ms, now_utc),
        "generated_ts_ms": now_ms,
        "generated_ts_utc": now_utc.isoformat()
    }

# ===========
# Worker Loop
# ===========
def tx_amount_worker_loop():
    print("[TX_AMOUNT WORKER] started (UTC-only, RAM-only)")
    time.sleep(1.5)

    restore_from_snapshot()

    while True:
        loop_start = time.time()
        sleep_time = BTC_TX_AMOUNT_AGG_INTERVAL

        try:
            agg = build_tx_amount()
            if agg:
                r.set(BTC_TX_AMOUNT_HISTORY_KEY, json.dumps(agg))

                elapsed_ms = int((time.time() - loop_start) * 1000)
                now_utc = utc_now()

                r.hset(BTC_TX_AMOUNT_STATS_KEY, mapping={
                    "last_run_utc": now_utc.isoformat(),
                    "last_run_ms": str(int(now_utc.timestamp() * 1000)),
                    "scan_time_ms": str(elapsed_ms),
                    "events_total": str(len(top_event_store["events"])),
                    "mode": "ram_with_snapshot",
                })

                loop_elapsed = time.time() - loop_start
                sleep_time = max(0.0, BTC_TX_AMOUNT_AGG_INTERVAL - loop_elapsed)

                print(
                    f"[TX_AMOUNT WORKER] "
                    f"events={len(top_event_store['events'])} | "
                    f"scan={elapsed_ms}ms | "
                    f"sleep={sleep_time:.3f}s | "
                    f"utc={now_utc.isoformat()}"
                )

        except Exception as e:
            print(f"[TX_AMOUNT ERROR] {e}")

        time.sleep(sleep_time)
