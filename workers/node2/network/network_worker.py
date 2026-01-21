# ============================================
# 🔗 NETWORK WORKER (NODE2) – FINAL
# ============================================

import json
import time
import threading
import redis

from nodes.config import NODE_CONFIG
from nodes.rpc import BitcoinRPC

from core.redis_keys import (
    NETWORK_GETNETWORKINFO,
    NETWORK_DYNAMIC_CACHE,
    NETWORK_STATIC_KEY,

    NETWORK_DYNAMIC_UPDATE_INTERVAL,
    NETWORK_STATIC_UPDATE_INTERVAL,
)

# ============================================
# 🔗 RPC (NODE2)
# ============================================
RPC = BitcoinRPC(NODE_CONFIG["node2"])
print(f"[NETWORK] RPC={RPC.info()}")

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
# 🔸 UPDATE: INPUT (RPC → Redis)
# ============================================
def update_network_input():
    info = RPC.call("getnetworkinfo")
    r.set(NETWORK_GETNETWORKINFO, json.dumps(info))

# ============================================
# 🔸 UPDATE: STATIC (optional, future-proof)
# ============================================
def update_network_static():
    info = _json_load(r.get(NETWORK_GETNETWORKINFO))
    static_data = {
        "subversion": info.get("subversion", "—"),
        "protocol_version": info.get("protocolversion", "—"),
    }

    r.setex(
        NETWORK_STATIC_KEY,
        NETWORK_STATIC_UPDATE_INTERVAL,
        json.dumps(static_data)
    )

# ============================================
# 🔸 UPDATE: DYNAMIC
# ============================================
def update_network_dynamic():
    info = _json_load(r.get(NETWORK_GETNETWORKINFO))

    peers = info.get("connections", "—")

    version_int = info.get("version", 0)
    if version_int:
        version = f"{version_int//10000}.{(version_int%10000)//100}.{version_int%100}"
    else:
        version = "—"

    dynamic = {
        "peers": peers,
        "version": version,
        "subversion": info.get("subversion", "—"),
        "protocol_version": info.get("protocolversion", "—"),
    }

    r.set(NETWORK_DYNAMIC_CACHE, json.dumps(dynamic))

# ============================================
# 🔁 MAIN LOOP (SINGLE THREAD)
# ============================================
def network_worker_loop():
    print("[NETWORK WORKER] gestartet")
    time.sleep(1.5)

    next_static_ts = 0.0

    while True:
        loop_start = time.time()

        try:
            update_network_input()
            update_network_dynamic()

            if time.time() >= next_static_ts:
                update_network_static()
                next_static_ts = time.time() + NETWORK_STATIC_UPDATE_INTERVAL

        except Exception as e:
            print(f"[NETWORK WORKER ERROR] {e}")

        sleep_time = max(
            0.0,
            NETWORK_DYNAMIC_UPDATE_INTERVAL - (time.time() - loop_start)
        )
        time.sleep(sleep_time)


# ============================================
# ▶️ START
# ============================================
def start_network_worker():
    t = threading.Thread(
        target=network_worker_loop,
        name="network-worker-node2",
        daemon=True
    )
    t.start()
    return t


# ============================================
# 🔥 STANDALONE
# ============================================
if __name__ == "__main__":
    network_worker_loop()

