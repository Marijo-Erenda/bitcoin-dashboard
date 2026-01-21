# ==========================================
# 📊 DASHBOARD_TRAFFIC_WORKER (FINAL)
# 10s + 1m + 1h + 1d
# Architektur: identisch zu BTC_TX_VOLUME & BTC_TX_FEES
# ==========================================

import os
import json
import time
from collections import deque
from glob import glob
import redis

from core.redis_keys import (
    INFO_DASHBOARD_TRAFFIC_1H,
    INFO_DASHBOARD_TRAFFIC_24H,
    INFO_DASHBOARD_TRAFFIC_1W,
    INFO_DASHBOARD_TRAFFIC_1M,
    INFO_DASHBOARD_TRAFFIC_1Y,
    DASHBOARD_TRAFFIC_TOTAL,
    DASHBOARD_TRAFFIC_TODAY,
    DASHBOARD_TRAFFIC_DAY,
    DASHBOARD_TRAFFIC_LAUNCH_TS,
    DASHBOARD_TRAFFIC_LIVE_10S,
    DASHBOARD_TRAFFIC_LAST_TS,
    DASHBOARD_TRAFFIC_STATS,
    DASHBOARD_TRAFFIC_RAW_PREFIX,
)

# =========================
# Snapshot Source
# =========================
SNAPSHOT_DIR = "/raid/data/bitcoin_dashboard/info/dashboard_traffic_history"

# =========================
# Timing
# =========================
POLL_SECONDS = 10  # smallest bucket = 10s

# =========================
# Redis
# =========================
r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=False)

# =========================
# Buckets
# =========================
BUCKETS = {
    "1h": {
        "bucket_ms": 1000 * 10,
        "window_ms": 1000 * 60 * 60,
        "redis_key": INFO_DASHBOARD_TRAFFIC_1H,
    },
    "24h": {
        "bucket_ms": 1000 * 60,
        "window_ms": 1000 * 60 * 60 * 24,
        "redis_key": INFO_DASHBOARD_TRAFFIC_24H,
    },
    "1w": {
        "bucket_ms": 1000 * 60 * 60,
        "window_ms": 1000 * 60 * 60 * 24 * 7,
        "redis_key": INFO_DASHBOARD_TRAFFIC_1W,
    },
    "1m": {
        "bucket_ms": 1000 * 60 * 60,
        "window_ms": 1000 * 60 * 60 * 24 * 30,
        "redis_key": INFO_DASHBOARD_TRAFFIC_1M,
    },
    "1y": {
        "bucket_ms": 1000 * 60 * 60 * 24,
        "window_ms": 1000 * 60 * 60 * 24 * 365,
        "redis_key": INFO_DASHBOARD_TRAFFIC_1Y,
    },
}

# =========================
# State
# =========================
state = {
    name: {
        "cur_bucket": None,
        "bucket_sum": 0,
        "history": deque(),
    }
    for name in BUCKETS
}

last_ts_ms = 0

# =========================
# Helpers
# =========================
def _bucket_start(ts_ms: int, bucket_ms: int) -> int:
    return (ts_ms // bucket_ms) * bucket_ms


def _prune_history(deq: deque, cutoff_ms: int) -> None:
    while deq and deq[0][0] < cutoff_ms:
        deq.popleft()


def _set_json(key: str, obj: dict) -> None:
    r.set(key, json.dumps(obj, separators=(",", ":")))


def _set_int(key: str, v: int) -> None:
    r.set(key, str(int(v)))


def _get_int(key: str, default: int = 0) -> int:
    raw = r.get(key)
    if not raw:
        return default
    try:
        return int(raw.decode() if isinstance(raw, bytes) else raw)
    except Exception:
        return default


def _utc_day_str_from_ms(ts_ms: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts_ms / 1000))


def _publish(name: str, flush_ts_ms: int) -> None:
    cfg = BUCKETS[name]
    s = state[name]

    cutoff = flush_ts_ms - cfg["window_ms"]
    _prune_history(s["history"], cutoff)

    payload = {"history": [{"x": t, "y": v} for t, v in s["history"]]}
    _set_json(cfg["redis_key"], payload)


def _flush_current_bucket(name: str, flush_ts_ms: int) -> None:
    s = state[name]
    if s["cur_bucket"] is None or s["bucket_sum"] <= 0:
        return

    # 🔒 kein doppelter Bucket
    if s["history"] and s["history"][-1][0] == s["cur_bucket"]:
        s["history"][-1] = (s["cur_bucket"], s["bucket_sum"])
    else:
        s["history"].append((s["cur_bucket"], s["bucket_sum"]))

    _publish(name, flush_ts_ms)


def republish_history(now_ms: int) -> None:
    """
    Spiegel den kompletten RAM-State nach Redis (flush-resistent).
    """
    for name, cfg in BUCKETS.items():
        s = state[name]

        cutoff = now_ms - cfg["window_ms"]
        _prune_history(s["history"], cutoff)

        payload = {"history": [{"x": t, "y": v} for t, v in s["history"]]}
        _set_json(cfg["redis_key"], payload)


# =========================
# Event Processing
# =========================
def _process_request_event(ts_ms: int, count: int) -> None:
    if count <= 0:
        return

    # Launch TS (einmalig)
    if not r.get(DASHBOARD_TRAFFIC_LAUNCH_TS):
        _set_int(DASHBOARD_TRAFFIC_LAUNCH_TS, ts_ms)

    # Total
    _set_int(
        DASHBOARD_TRAFFIC_TOTAL,
        _get_int(DASHBOARD_TRAFFIC_TOTAL, 0) + count,
    )

    # Today
    day = _utc_day_str_from_ms(ts_ms)
    cur_day = r.get(DASHBOARD_TRAFFIC_DAY)
    cur_day = cur_day.decode() if isinstance(cur_day, bytes) else cur_day

    if cur_day != day:
        r.set(DASHBOARD_TRAFFIC_DAY, day)
        _set_int(DASHBOARD_TRAFFIC_TODAY, count)
    else:
        _set_int(
            DASHBOARD_TRAFFIC_TODAY,
            _get_int(DASHBOARD_TRAFFIC_TODAY, 0) + count,
        )

    # Buckets
    for name, cfg in BUCKETS.items():
        s = state[name]
        b = _bucket_start(ts_ms, cfg["bucket_ms"])

        if s["cur_bucket"] is None:
            s["cur_bucket"] = b

        if b == s["cur_bucket"]:
            s["bucket_sum"] += count
        else:
            _flush_current_bucket(name, ts_ms)
            s["cur_bucket"] = b
            s["bucket_sum"] = count

    # Live 10s = aktueller 1h Bucket
    _set_int(DASHBOARD_TRAFFIC_LIVE_10S, state["1h"]["bucket_sum"])


# =========================
# Warmstart from Snapshot
# =========================
def _load_latest_snapshot():
    files = sorted(
        glob(os.path.join(SNAPSHOT_DIR, "dashboard_traffic_*.json")),
        reverse=True,
    )
    if not files:
        return None
    try:
        with open(files[0], "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"[DASHBOARD_TRAFFIC][WARMSTART] snapshot load failed: {e}")
        return None


def warmstart_from_snapshot():
    global last_ts_ms

    snap = _load_latest_snapshot()
    if not snap:
        print("[DASHBOARD_TRAFFIC][WARMSTART] no snapshot → cold start")
        republish_history(int(time.time() * 1000))
        return

    last_ts_ms = int(snap.get("last_ts_ms", 0))
    _set_int(DASHBOARD_TRAFFIC_LAST_TS, last_ts_ms)

    # Meta
    if "launch_ts" in snap:
        _set_int(DASHBOARD_TRAFFIC_LAUNCH_TS, snap["launch_ts"])
    if "total_requests" in snap:
        _set_int(DASHBOARD_TRAFFIC_TOTAL, snap["total_requests"])
    if "today_requests" in snap:
        _set_int(DASHBOARD_TRAFFIC_TODAY, snap["today_requests"])
    if "day_utc" in snap:
        r.set(DASHBOARD_TRAFFIC_DAY, snap["day_utc"])

    # Finished buckets
    for name, cfg in BUCKETS.items():
        s = state[name]
        s["history"].clear()
        s["cur_bucket"] = None
        s["bucket_sum"] = 0

        bucket = snap.get("buckets", {}).get(name)
        if not bucket:
            _set_json(cfg["redis_key"], {"history": []})
            continue

        for p in bucket.get("history", []):
            s["history"].append((int(p["x"]), int(p["y"])))

        _set_json(cfg["redis_key"], {"history": bucket["history"]})

    # Open buckets
    open_buckets = snap.get("open_buckets", {})
    for name, ob in open_buckets.items():
        if name not in state:
            continue
        try:
            state[name]["cur_bucket"] = int(ob.get("cur_bucket"))
            state[name]["bucket_sum"] = int(ob.get("bucket_sum", 0))
        except Exception:
            state[name]["cur_bucket"] = None
            state[name]["bucket_sum"] = 0


    republish_history(int(time.time() * 1000))  # 🔥 sofort sichtbar nach Restart
    print(f"[DASHBOARD_TRAFFIC][WARMSTART] snapshot restored (last_ts_ms={last_ts_ms})")


# =========================
# Main Loop
# =========================
def dashboard_traffic_worker_loop():
    global last_ts_ms

    print("[DASHBOARD_TRAFFIC] Worker started")
    warmstart_from_snapshot()

    while True:
        loop_t0 = time.time()
        processed = 0

        pattern = f"{DASHBOARD_TRAFFIC_RAW_PREFIX}*"
        keys = sorted(r.scan_iter(match=pattern, count=2000))

        for k in keys:
            if isinstance(k, bytes):
                k = k.decode()

            try:
                ts_ms = int(k.rsplit("_", 1)[-1])
            except Exception:
                continue

            # defensive: ignore already processed timestamps
            if ts_ms <= last_ts_ms:
                r.delete(k)              # 🔥 consume stale RAW event
                continue

            count = int(r.get(k) or 0)

            # no-op events
            if count <= 0:
                last_ts_ms = ts_ms
                r.delete(k)              # 🔥 consume RAW event
                continue

            # process valid request event
            _process_request_event(ts_ms, count)

            last_ts_ms = ts_ms
            _set_int(DASHBOARD_TRAFFIC_LAST_TS, last_ts_ms)

            r.delete(k)                  # 🔥 consume RAW event
            processed += count

        elapsed_ms = int((time.time() - loop_t0) * 1000)
        sleep_ms = max(0, POLL_SECONDS * 1000 - elapsed_ms)

        # Persist open buckets (for snapshot safety)
        r.set(
            "DASHBOARD_TRAFFIC_OPEN_BUCKETS",
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

        # Stats / Health
        r.hset(
            DASHBOARD_TRAFFIC_STATS,
            mapping={
                "status": "ok",
                "processed": str(processed),
                "elapsed_ms": str(elapsed_ms),
                "sleep_ms": str(sleep_ms),
                "last_ts_ms": str(last_ts_ms),
            },
        )

        print(
            "[DASHBOARD_TRAFFIC WORKER] "
            f"processed={processed} | scan={elapsed_ms}ms | "
            f"sleep={sleep_ms}ms | last_ts={last_ts_ms}"
        )

        # 🔥 History immer spiegeln (flush-resistent)
        republish_history(int(time.time() * 1000))

        time.sleep(POLL_SECONDS)


