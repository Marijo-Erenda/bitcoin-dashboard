
# ==================================
# 🔥 BTC_TX_VOLUME_WORKER (10s + 1m)
# ==================================

import os
import json
import time
from collections import deque
from glob import glob
import redis

from core.redis_keys import (
    BTC_TX_VOLUME_1H,
    BTC_TX_VOLUME_24H,
    BTC_TX_VOLUME_1W,
    BTC_TX_VOLUME_1M,
    BTC_TX_VOLUME_1Y,
    BTC_TX_VOLUME_STATS,
    BTC_TX_VOLUME_OPEN_BUCKETS,
)

# =========================
# Paths
# =========================
TXID_HISTORY_DIR = "/raid/data/ramdisk_bitcoin_dashboard/txid_history"              # 🔹 ARBEITSDATEI

SNAPSHOT_DIR = "/raid/data/bitcoin_dashboard/metrics_history/btc_tx_volume_history" # 🔹 NEU: Snapshot-Quelle für Warmstart
# =========================
# Timing
# =========================
POLL_SECONDS = 10  # aligned to smallest bucket (10s)

# =========================
# Redis
# =========================
r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=False)

# =========================
# Bucket model
# =========================
BUCKETS = {
    # 1h: 10s buckets → BTC / 10s
    "1h": {
        "bucket_ms": 1000 * 10,
        "window_ms": 1000 * 60 * 60,
        "redis_key": BTC_TX_VOLUME_1H,
    },

    # 24h: 1min buckets → BTC / min
    "24h": {
        "bucket_ms": 1000 * 60,
        "window_ms": 1000 * 60 * 60 * 24,
        "redis_key": BTC_TX_VOLUME_24H,
    },

    # 1w: 1h buckets → BTC / h
    "1w": {
        "bucket_ms": 1000 * 60 * 60,
        "window_ms": 1000 * 60 * 60 * 24 * 7,
        "redis_key": BTC_TX_VOLUME_1W,
    },

    # 1m: 1h buckets → BTC / h
    "1m": {
        "bucket_ms": 1000 * 60 * 60,
        "window_ms": 1000 * 60 * 60 * 24 * 30,
        "redis_key": BTC_TX_VOLUME_1M,
    },

    # 1y: 1d buckets → BTC / day
    "1y": {
        "bucket_ms": 1000 * 60 * 60 * 24,
        "window_ms": 1000 * 60 * 60 * 24 * 365,
        "redis_key": BTC_TX_VOLUME_1Y,
    },
}

# =========================
# In-memory state per stream
# =========================
state = {
    name: {
        "cur_bucket": None,   # current bucket start ts_ms
        "bucket_sum": 0.0,    # SUM(BTC) within current bucket
        "history": deque(),   # deque[(bucket_start_ts_ms, bucket_sum)]
    }
    for name in BUCKETS
}

last_ts_ms = 0

# =========================
# Helpers
# =========================
def _prune_history(deq: deque, cutoff_ms: int) -> None:
    while deq and deq[0][0] < cutoff_ms:
        deq.popleft()

def _set_json(key: str, obj: dict) -> None:
    # compact JSON for speed & bandwidth
    r.set(key, json.dumps(obj, separators=(",", ":")))

def _publish(name: str, flush_ts_ms: int) -> None:
    """Publish history payload for stream name to Redis (pruned to window)."""
    cfg = BUCKETS[name]
    s = state[name]

    cutoff = flush_ts_ms - cfg["window_ms"]
    _prune_history(s["history"], cutoff)

    payload = {"history": [{"x": t, "y": v} for t, v in s["history"]]}
    _set_json(cfg["redis_key"], payload)

def _flush_current_bucket(name: str, flush_ts_ms: int) -> bool:
    """
    Finalize current bucket by appending it to history if it has data,
    then publish. Returns True if a publish happened.
    """
    s = state[name]
    if s["cur_bucket"] is None:
        return False

    # Do not create empty buckets
    if s["bucket_sum"] <= 0:
        return False

    s["history"].append((s["cur_bucket"], s["bucket_sum"]))
    _publish(name, flush_ts_ms)
    return True

def _bucket_start(ts_ms: int, bucket_ms: int) -> int:
    return (ts_ms // bucket_ms) * bucket_ms

def _process_tx_event(ts_ms: int, val: float) -> None:
    """
    Process one tx-event (timestamp_ms, btc_value) into all streams.
    Semantics: bucket value = SUM(btc_value) within that bucket.
    """
    for name, cfg in BUCKETS.items():
        s = state[name]
        b = _bucket_start(ts_ms, cfg["bucket_ms"])

        if s["cur_bucket"] is None:
            s["cur_bucket"] = b

        if b == s["cur_bucket"]:
            s["bucket_sum"] += val
        else:
            # finalize previous bucket if it has data (publish only then)
            _flush_current_bucket(name, ts_ms)

            # start new bucket
            s["cur_bucket"] = b
            s["bucket_sum"] = val

def _maybe_flush_on_idle(now_ms: int) -> None:
    """
    If time advanced beyond current bucket boundary, finalize bucket (only if it has data),
    advance cur_bucket to current boundary. This avoids constant redis churn.
    """
    for name, cfg in BUCKETS.items():
        s = state[name]
        if s["cur_bucket"] is None:
            continue

        # if bucket has ended
        if now_ms >= s["cur_bucket"] + cfg["bucket_ms"]:
            _flush_current_bucket(name, now_ms)

            # advance bucket to current boundary, keep sum reset
            s["cur_bucket"] = _bucket_start(now_ms, cfg["bucket_ms"])
            s["bucket_sum"] = 0.0

def _initial_publish_if_empty(now_ms: int) -> None:
    """
    Optional: ensure keys exist even if there's no data yet (so API returns valid JSON).
    Runs once after warmstart.
    """
    for name, cfg in BUCKETS.items():
        if not state[name]["history"]:
            _set_json(cfg["redis_key"], {"history": []})


def republish_history(now_ms: int) -> None:
    """
    Spiegel den kompletten RAM-State nach Redis (flush-resistent).
    Optional: trimmen auf window_ms wie bei publish.
    """
    for name, cfg in BUCKETS.items():
        s = state[name]

        cutoff = now_ms - cfg["window_ms"]
        _prune_history(s["history"], cutoff)

        payload = {"history": [{"x": t, "y": v} for t, v in s["history"]]}
        _set_json(cfg["redis_key"], payload)


# =====================================================
# 🔁 NEU: Warmstart aus Snapshot (statt txid_history)
# =====================================================
def load_latest_tx_volume_snapshot():
    files = sorted(
        glob(os.path.join(SNAPSHOT_DIR, "btc_tx_volume_*.json")),
        reverse=True
    )
    if not files:
        return None

    try:
        with open(files[0], "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"[BTC_TX_VOLUME][WARMSTART] snapshot load failed: {e}")
        return None


def warmstart_from_snapshot():

    global last_ts_ms

    snap = load_latest_tx_volume_snapshot()
    if not snap:
        print("[BTC_TX_VOLUME][WARMSTART] no snapshot → cold start")
        _initial_publish_if_empty(int(time.time() * 1000))
        return

    last_ts_ms = int(snap.get("last_ts_ms", 0))

    # ----------------------------
    # Restore finished buckets
    # ----------------------------
    for name, cfg in BUCKETS.items():
        s = state[name]
        s["history"].clear()
        s["cur_bucket"] = None
        s["bucket_sum"] = 0.0

        bucket = snap.get("buckets", {}).get(name)
        if not bucket:
            continue

        for p in bucket.get("history", []):
            s["history"].append((int(p["x"]), float(p["y"])))

        _set_json(cfg["redis_key"], {"history": bucket["history"]})

    # ----------------------------
    # Restore open (unfinished) buckets
    # ----------------------------
    open_buckets = snap.get("open_buckets", {})

    for name, ob in open_buckets.items():
        if name not in state:
            continue

        try:
            state[name]["cur_bucket"] = int(ob.get("cur_bucket"))
            state[name]["bucket_sum"] = float(ob.get("bucket_sum", 0.0))
        except Exception:
            # Safety: ignore corrupted open bucket
            state[name]["cur_bucket"] = None
            state[name]["bucket_sum"] = 0.0

    republish_history(int(time.time() * 1000))  # 🔥 sofort sichtbar nach Restart

    print(
        f"[BTC_TX_VOLUME][WARMSTART] snapshot restored "
        f"(last_ts_ms={last_ts_ms})"
    )


# =========================
# Main loop
# =========================
def btc_tx_volume_worker_loop():
    global last_ts_ms

    print("[BTC_TX_VOLUME] Worker started")

    # 🔥 Snapshot-Warmstart
    warmstart_from_snapshot()

    while True:
        loop_t0 = time.time()
        processed = 0

        files = sorted(
            glob(os.path.join(TXID_HISTORY_DIR, "all_mempool_seen_*.jsonl"))
        )

        if files:
            with open(files[-1], "r") as f:
                for line in f:
                    entry = json.loads(line)

                    ts_ms = int(entry.get("timestamp_ms", 0))
                    if ts_ms <= last_ts_ms:
                        continue

                    val = float(entry.get("btc_value", 0.0))
                    if val <= 0:
                        last_ts_ms = ts_ms
                        continue

                    _process_tx_event(ts_ms, val)

                    last_ts_ms = ts_ms
                    processed += 1

        elapsed_ms = int((time.time() - loop_t0) * 1000)
        sleep_ms = max(0, POLL_SECONDS * 1000 - elapsed_ms)

        # -------------------------
        # Persist open buckets
        # -------------------------
        r.set(
            BTC_TX_VOLUME_OPEN_BUCKETS,
            json.dumps(
                {
                    name: {
                        "cur_bucket": s["cur_bucket"],
                        "bucket_sum": s["bucket_sum"],
                    }
                    for name, s in state.items()
                    if s["cur_bucket"] is not None
                },
                separators=(",", ":"),
            ),
        )

        # -------------------------
        # Worker stats
        # -------------------------
        r.hset(
            BTC_TX_VOLUME_STATS,
            mapping={
                "status": "ok",
                "processed": str(processed),
                "elapsed_ms": str(elapsed_ms),
                "sleep_ms": str(sleep_ms),
                "last_ts_ms": str(last_ts_ms),
            },
        )

        print(
            "[BTC_TX_VOLUME WORKER] "
            f"processed={processed} | "
            f"scan={elapsed_ms}ms | "
            f"sleep={sleep_ms}ms | "
            f"last_ts={last_ts_ms}"
        )

        # 🔥 History immer spiegeln (flush-resistent)
        republish_history(int(time.time() * 1000))

        time.sleep(POLL_SECONDS)
