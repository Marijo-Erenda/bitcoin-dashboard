# =================================
# 🔥 BTC VOLUME WORKER (AGGREGATED)
# =================================

import os
import json
import time
import redis

from core.redis_keys import (
    BTC_VOL_DYNAMIC_CACHE,
    BTC_VOL_LOCK_KEY,
    BTC_TOP_SEEN_VALUE_KEY,
    BTC_VOL_STATS_KEY,
    BTC_VOL_UPDATE_INTERVAL,
    BTC_VOL_LOCK_TTL,
    BTC_TX_VOLUME_1H,
    BTC_TX_VOLUME_24H,
)

# ========
# 🔧 Redis
# ========
r = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=False
)

# ==============================
# 📦 Snapshot source (warmstart)
# ==============================
SNAPSHOT_DIR = "/raid/data/bitcoin_dashboard/metrics_history/btc_volume_history"

# ============
# 🔁 Warmstart
# ============
def warmstart_from_snapshot():
    if not os.path.isdir(SNAPSHOT_DIR):
        print("[BTC_VOL][WARMSTART] no snapshot directory")
        return

    files = sorted(
        f for f in os.listdir(SNAPSHOT_DIR)
        if f.startswith("btc_volume_") and f.endswith(".json")
    )

    if not files:
        print("[BTC_VOL][WARMSTART] no snapshot found → cold start")
        return

    path = os.path.join(SNAPSHOT_DIR, files[-1])

    try:
        with open(path, "r") as f:
            payload = json.load(f)
    except Exception as e:
        print(f"[BTC_VOL][WARMSTART] failed to load snapshot: {e}")
        return

    # minimale Plausibilität
    if "mempool_tx_count" not in payload:
        print("[BTC_VOL][WARMSTART] invalid snapshot → ignored")
        return

    r.set(
        BTC_VOL_DYNAMIC_CACHE,
        json.dumps(payload, separators=(",", ":"))
    )

    print(f"[BTC_VOL][WARMSTART] restored {os.path.basename(path)}")

# ==========
# 🔹 Helpers
# ==========
def _sum_volume_from_metrics(key: bytes) -> float:
    raw = r.get(key)
    if not raw:
        return 0.0

    if isinstance(raw, bytes):
        raw = raw.decode()

    try:
        data = json.loads(raw)
    except Exception:
        return 0.0

    history = data.get("history", [])
    return sum(float(p.get("y", 0.0)) for p in history)

# =============
# 🔹 Core Logic
# =============
def update_btc_volume():
    pid = str(os.getpid())

    # 🔒 Distributed lock
    if not r.set(BTC_VOL_LOCK_KEY, pid, nx=True, ex=BTC_VOL_LOCK_TTL):
        return None

    t_start = time.time()

    try:
        # ===================
        # Live mempool volume
        # ===================
        raw = r.hgetall(BTC_TOP_SEEN_VALUE_KEY)
        mempool_volume = 0.0
        mempool_tx_count = 0

        if raw:
            for v in raw.values():
                if isinstance(v, bytes):
                    v = v.decode()
                entry = json.loads(v)
                mempool_volume += float(entry.get("btc_value", 0.0))
            mempool_tx_count = len(raw)

        # =========================
        # Rolling volumes (metrics)
        # =========================
        volume_1h = _sum_volume_from_metrics(BTC_TX_VOLUME_1H)
        volume_24h = _sum_volume_from_metrics(BTC_TX_VOLUME_24H)

        payload = {
            "mempool_volume": mempool_volume,
            "mempool_tx_count": mempool_tx_count,
            "volume_1h": volume_1h,
            "volume_24h": volume_24h,
            "ts": int(time.time()),
        }

        r.set(
            BTC_VOL_DYNAMIC_CACHE,
            json.dumps(payload, separators=(",", ":"))
        )

        scan_ms = int((time.time() - t_start) * 1000)

        r.hset(
            BTC_VOL_STATS_KEY,
            mapping={
                "last_run_ts": str(int(time.time())),
                "scan_time_ms": str(scan_ms),
            },
        )

        return {
            "mempool_volume": mempool_volume,
            "volume_1h": volume_1h,
            "volume_24h": volume_24h,
            "scan_ms": scan_ms,
        }

    finally:
        cur = r.get(BTC_VOL_LOCK_KEY)
        if cur and cur.decode() == pid:
            r.delete(BTC_VOL_LOCK_KEY)

# ==============
# 🔁 Worker Loop
# ==============
def btc_vol_worker_loop():
    print("[BTC_VOL WORKER] started (aggregated metrics)")
    time.sleep(1.0)

    # 🔥 Warmstart
    warmstart_from_snapshot()

    while True:
        loop_start = time.time()

        try:
            stats = update_btc_volume()
        except Exception as e:
            print(f"[BTC_VOL ERROR] {e}")
            stats = None

        loop_elapsed = time.time() - loop_start
        sleep_time = max(0.0, BTC_VOL_UPDATE_INTERVAL - loop_elapsed)

        if stats:
            print(
                "[BTC_VOL WORKER] "
                f"mempool={stats['mempool_volume']:.2f} BTC | "
                f"1h={stats['volume_1h']:.2f} BTC | "
                f"24h={stats['volume_24h']:.2f} BTC | "
                f"scan={stats['scan_ms']}ms | "
                f"sleep={sleep_time:.2f}s"
            )

        time.sleep(sleep_time)
