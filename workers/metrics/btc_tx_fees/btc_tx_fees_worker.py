# =============================
# 🔥 BTC_TX_FEES_WORKER (FINAL)
# =============================

import os
import json
import time
from collections import deque
from glob import glob
import redis

from core.redis_keys import (
    BTC_TX_FEES_24H,
    BTC_TX_FEES_1W,
    BTC_TX_FEES_1M,
    BTC_TX_FEES_1Y,
    BTC_TX_FEES_STATS,
    POLL_SECONDS,
    BTC_TX_FEES_OPEN_BUCKETS,
)


# =======================================
# 🔴 Live TX Source (NUR für neue Events)
# =======================================
TXID_HISTORY_DIR = "/raid/data/ramdisk_bitcoin_dashboard/txid_history"

# ==============================
# 🟢 Snapshot Source (Warmstart)
# ==============================
FEE_SNAPSHOT_DIR = ("/raid/data/bitcoin_dashboard/metrics_history/btc_tx_fees_history")


r = redis.Redis(host="localhost", port=6379, db=0)

# =========================
# Buckets
# =========================
BUCKETS = {
    "24h": {
        "bucket_ms": 1000 * 60 * 5,
        "window_ms": 1000 * 60 * 60 * 24,
        "key": BTC_TX_FEES_24H,
    },
    "1w": {
        "bucket_ms": 1000 * 60 * 30,
        "window_ms": 1000 * 60 * 60 * 24 * 7,
        "key": BTC_TX_FEES_1W,
    },
    "1m": {
        "bucket_ms": 1000 * 60 * 60 * 2,
        "window_ms": 1000 * 60 * 60 * 24 * 30,
        "key": BTC_TX_FEES_1M,
    },
    "1y": {
        "bucket_ms": 1000 * 60 * 60 * 12,
        "window_ms": 1000 * 60 * 60 * 24 * 365,
        "key": BTC_TX_FEES_1Y,
    },
}

# =========================
# State
# =========================
state = {
    name: {
        "cur_bucket": None,
        "sum_fee": 0,
        "sum_vbytes": 0,
        "history": deque(),
    }
    for name in BUCKETS
}

last_ts_ms = 0

# =========================
# Helpers
# =========================
def bucket_start(ts, size):
    return (ts // size) * size


def flush_bucket(name, now_ms):
    s = state[name]
    if s["sum_vbytes"] <= 0:
        return

    avg = s["sum_fee"] / s["sum_vbytes"]
    s["history"].append((s["cur_bucket"], avg))

    cutoff = now_ms - BUCKETS[name]["window_ms"]
    while s["history"] and s["history"][0][0] < cutoff:
        s["history"].popleft()

    payload = {
        "history": [{"x": t, "y": round(v, 2)} for t, v in s["history"]]
    }

    r.set(BUCKETS[name]["key"], json.dumps(payload, separators=(",", ":")))


def process_tx(ts_ms, fee_sat, weight):
    if fee_sat <= 0 or weight <= 0:
        return

    vbytes = weight / 4

    for name, cfg in BUCKETS.items():
        s = state[name]
        b = bucket_start(ts_ms, cfg["bucket_ms"])

        if s["cur_bucket"] is None:
            s["cur_bucket"] = b

        if b != s["cur_bucket"]:
            flush_bucket(name, ts_ms)
            s["cur_bucket"] = b
            s["sum_fee"] = 0
            s["sum_vbytes"] = 0

        s["sum_fee"] += fee_sat
        s["sum_vbytes"] += vbytes


def republish_history():
    for name in BUCKETS:
        s = state[name]
        r.set(
            BUCKETS[name]["key"],
            json.dumps(
                {"history": [{"x": t, "y": round(v, 2)} for t, v in s["history"]]},
                separators=(",", ":"),
            ),
        )

# =====================================================
# 🧊 Snapshot Loader (WARMSTART)
# =====================================================
def load_latest_fee_snapshot():
    if not os.path.isdir(FEE_SNAPSHOT_DIR):
        return None

    files = sorted(
        f for f in os.listdir(FEE_SNAPSHOT_DIR)
        if f.startswith("btc_tx_fees_") and f.endswith(".json")
    )

    if not files:
        return None

    latest = files[-1]
    path = os.path.join(FEE_SNAPSHOT_DIR, latest)

    try:
        with open(path) as f:
            snapshot = json.load(f)
    except Exception as e:
        print(f"[BTC_TX_FEES] snapshot load failed: {e}")
        return None

    # minimale Validierung
    if "last_ts_ms" not in snapshot or "buckets" not in snapshot:
        print("[BTC_TX_FEES] invalid snapshot structure")
        return None

    return snapshot


# =========================
# Warmstart
# =========================
def warmstart():
    global last_ts_ms

    snapshot = load_latest_fee_snapshot()
    if not snapshot:
        print("[BTC_TX_FEES][WARMSTART] no snapshot → cold start")
        return

    last_ts_ms = int(snapshot.get("last_ts_ms", 0))

    # -------------------------
    # Restore finished buckets
    # -------------------------
    for name in BUCKETS:
        s = state[name]
        s["history"].clear()
        s["cur_bucket"] = None
        s["sum_fee"] = 0
        s["sum_vbytes"] = 0

        bucket = snapshot.get("buckets", {}).get(name)
        if not bucket:
            continue

        for p in bucket.get("history", []):
            if "x" in p and "y" in p:
                s["history"].append((int(p["x"]), float(p["y"])))

        r.set(
            BUCKETS[name]["key"],
            json.dumps({"history": bucket["history"]}, separators=(",", ":"))
        )

    # -------------------------
    # Restore open buckets
    # -------------------------
    open_buckets = snapshot.get("open_buckets", {})

    for name, ob in open_buckets.items():
        if name not in state:
            continue

        try:
            state[name]["cur_bucket"] = int(ob.get("cur_bucket"))
            state[name]["sum_fee"] = float(ob.get("sum_fee", 0))
            state[name]["sum_vbytes"] = float(ob.get("sum_vbytes", 0))
        except Exception:
            # Safety fallback
            state[name]["cur_bucket"] = None
            state[name]["sum_fee"] = 0
            state[name]["sum_vbytes"] = 0

    print(f"[BTC_TX_FEES][WARMSTART] snapshot restored (last_ts_ms={last_ts_ms})")



# =========================
# Main Loop
# =========================
def btc_tx_fees_worker_loop():
    global last_ts_ms

    warmstart()
    republish_history()   # 🔥 SOFORT sichtbar nach Restart

    print("[BTC_TX_FEES] Worker started")

    while True:
        loop_t0 = time.time()
        processed = 0

        files = sorted(
            glob(os.path.join(TXID_HISTORY_DIR, "all_mempool_seen_*.jsonl"))
        )

        if files:
            with open(files[-1]) as f:
                for line in f:
                    e = json.loads(line)

                    ts = int(e.get("timestamp_ms", 0))
                    if ts <= last_ts_ms:
                        continue

                    process_tx(
                        ts,
                        int(e.get("fee_sat", 0)),
                        int(e.get("weight", 0)),
                    )

                    last_ts_ms = ts
                    processed += 1

        elapsed_ms = int((time.time() - loop_t0) * 1000)
        sleep_ms = max(0, POLL_SECONDS * 1000 - elapsed_ms)

        # -------------------------
        # Worker stats
        # -------------------------
        r.hset(
            BTC_TX_FEES_STATS,
            mapping={
                "status": "ok",
                "processed": str(processed),
                "elapsed_ms": str(elapsed_ms),
                "sleep_ms": str(sleep_ms),
                "last_ts_ms": str(last_ts_ms),
            },
        )

        print(
            "[BTC_TX_FEES WORKER] "
            f"processed={processed} | "
            f"scan={elapsed_ms}ms | "
            f"sleep={sleep_ms}ms | "
            f"last_ts={last_ts_ms}"
        )

        # -------------------------
        # Persist open buckets
        # -------------------------
        r.set(
            BTC_TX_FEES_OPEN_BUCKETS,
            json.dumps(
                {
                    name: {
                        "cur_bucket": s["cur_bucket"],
                        "sum_fee": s["sum_fee"],
                        "sum_vbytes": s["sum_vbytes"],
                    }
                    for name, s in state.items()
                    if s["cur_bucket"] is not None
                },
                separators=(",", ":"),
            ),
        )

        # 🔥 History immer spiegeln
        republish_history()

        time.sleep(POLL_SECONDS)

