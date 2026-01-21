# ============================================
# 🔗 MEMPOOL WORKER (NODE2) – FINAL (PROCESS)
# ============================================

import json
import time
import redis

from nodes.config import NODE_CONFIG
from nodes.rpc import BitcoinRPC

from core.redis_keys import (
    # Core
    MEMPOOL_GETMEMPOOLINFO,
    MEMPOOL_STATIC_KEY,
    MEMPOOL_DYNAMIC_CACHE,
    MEMPOOL_STATS_KEY,

    # Dynamic subkeys
    MEMPOOL_DYNAMIC_SIZEFEE_KEY,
    MEMPOOL_DYNAMIC_AVGTX_KEY,
    MEMPOOL_DYNAMIC_WAITTIME_KEY,

    # External dependency
    BTC_TOP_SEEN_VALUE_KEY,

    # Intervals
    MEMPOOL_DYNAMIC_UPDATE_INTERVAL,
    MEMPOOL_STATIC_UPDATE_INTERVAL,
)

# ============================================
# 🔗 RPC (NODE2)
# ============================================
RPC = BitcoinRPC(NODE_CONFIG["node2"])
print(f"[MEMPOOL] RPC={RPC.info()}")

# ============================================
# 🔧 REDIS
# ============================================
r = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=False
)

# ============================================
# 🧰 Helpers
# ============================================
def _json_load(raw, default=None):
    if not raw:
        return default or {}
    if isinstance(raw, bytes):
        raw = raw.decode()
    try:
        return json.loads(raw)
    except Exception:
        return default or {}

# ============================================
# 🔸 INPUT (RPC → Redis)
# ============================================
def update_mempool_input():
    t_start = time.time()

    info = RPC.call("getmempoolinfo") or {}
    r.set(MEMPOOL_GETMEMPOOLINFO, json.dumps(info))

    elapsed_ms = int((time.time() - t_start) * 1000)

    return {
        "scan_time_ms": elapsed_ms,
        "mempool_size": info.get("size", 0),
    }

# ============================================
# 🔸 STATIC
# ============================================
def update_mempool_static():
    info = _json_load(r.get(MEMPOOL_GETMEMPOOLINFO))

    # mempoolminfee kommt als BTC / kvB → umrechnen auf sat / vByte
    min_fee_sat = info.get("mempoolminfee", 0) * 100_000_000 / 1000

    r.setex(
        MEMPOOL_STATIC_KEY,
        MEMPOOL_STATIC_UPDATE_INTERVAL,
        json.dumps({
            "min_fee_sat": min_fee_sat  # jetzt sat/vB
        })
    )

# ============================================
# 🔸 SIZE + FEE
# ============================================
def update_mempool_size_fee():
    info = _json_load(r.get(MEMPOOL_GETMEMPOOLINFO))

    size = info.get("size", 0)
    total_fee_btc = info.get("total_fee", 0)
    total_bytes = max(info.get("bytes", 1), 1)

    # Ø Fee Rate im Mempool: sat / vByte (≈ sat / Byte auf Aggregatebene)
    avg_fee_sat = (total_fee_btc * 100_000_000) / total_bytes

    r.set(
        MEMPOOL_DYNAMIC_SIZEFEE_KEY,
        json.dumps({
            "timestamp_ms": int(time.time() * 1000),
            "mempool_size": size,
            "avg_fee_sat": avg_fee_sat,   # jetzt sat/vB
            "total_fee": total_fee_btc,
        })
    )


# ============================================
# 🔸 AVG TX VALUE
# ============================================
def update_mempool_avg_tx():
    seen_values = r.hvals(BTC_TOP_SEEN_VALUE_KEY)
    total_volume = 0.0

    for v in seen_values:
        if isinstance(v, bytes):
            v = v.decode()
        total_volume += float(json.loads(v).get("btc_value", 0.0))

    info = _json_load(r.get(MEMPOOL_GETMEMPOOLINFO))
    size = info.get("size", 0)

    avg_tx = total_volume / size if size > 0 else 0.0

    r.set(
        MEMPOOL_DYNAMIC_AVGTX_KEY,
        json.dumps({"mempool_avg_tx": avg_tx})
    )

# ============================================
# 🔸 WAIT TIME
# ============================================
def update_mempool_waittime():
    info = _json_load(r.get(MEMPOOL_GETMEMPOOLINFO))
    size = info.get("size", 0)

    estimated_blocks = size / 3000
    total_seconds = int(estimated_blocks * 600)
    minutes, seconds = divmod(total_seconds, 60)

    r.set(
        MEMPOOL_DYNAMIC_WAITTIME_KEY,
        json.dumps({
            "average_wait_time": f"{minutes} minutes and {seconds} seconds",
            "mempool_size": size,
        })
    )

# ============================================
# 🔸 AGGREGATOR
# ============================================
def aggregate_mempool_dynamic():
    combined = {}

    for key in (
        MEMPOOL_DYNAMIC_SIZEFEE_KEY,
        MEMPOOL_DYNAMIC_AVGTX_KEY,
        MEMPOOL_DYNAMIC_WAITTIME_KEY,
    ):
        combined.update(_json_load(r.get(key)))

    if combined:
        r.set(MEMPOOL_DYNAMIC_CACHE, json.dumps(combined))

# ============================================
# 🔁 MAIN LOOP (PROCESS)
# ============================================
def mempool_worker_loop():
    print("[MEMPOOL WORKER] gestartet")
    time.sleep(1.5)

    next_static_ts = 0.0

    while True:
        loop_start = time.time()

        try:
            input_stats = update_mempool_input()

            update_mempool_size_fee()
            update_mempool_avg_tx()
            update_mempool_waittime()
            aggregate_mempool_dynamic()

            now = time.time()
            if now >= next_static_ts:
                update_mempool_static()
                next_static_ts = now + MEMPOOL_STATIC_UPDATE_INTERVAL

        except Exception as e:
            print(f"[MEMPOOL WORKER ERROR] {e}")
            input_stats = {}

        loop_elapsed = time.time() - loop_start
        sleep_time = max(0.0, MEMPOOL_DYNAMIC_UPDATE_INTERVAL - loop_elapsed)

        # -------------------------
        # 📊 MONITORING
        # -------------------------
        scan_ms = input_stats.get("scan_time_ms", "?")
        mempool_size = input_stats.get("mempool_size", "?")

        r.hset(MEMPOOL_STATS_KEY, mapping={
            "last_run_ts": str(int(time.time())),
            "scan_time_ms": str(scan_ms),
            "sleep_time_s": f"{sleep_time:.3f}",
            "mempool_size": str(mempool_size),
        })

        print(
            f"[MEMPOOL WORKER] "
            f"rpc={RPC.info()} | "
            f"mempool={mempool_size} | "
            f"scan={scan_ms}ms | "
            f"sleep={sleep_time:.3f}s"
        )

        time.sleep(sleep_time)

# ============================================
# ▶️ PROCESS ENTRYPOINT
# ============================================
if __name__ == "__main__":
    mempool_worker_loop()
