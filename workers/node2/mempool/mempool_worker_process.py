import os
import sys
import time
import threading
import redis

# ============================================
# 🔧 Projekt-Root
# ============================================
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.node2.mempool.mempool_worker import mempool_worker_loop

# ============================================
# 🔒 Redis Singleton Lock
# ============================================
LOCK_KEY = "LOCK_MEMPOOL_WORKER_NODE2"
LOCK_TTL_SEC = 60

r = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=False
)

PID = str(os.getpid())


def acquire_lock_or_exit():
    ok = r.set(LOCK_KEY, PID, nx=True, ex=LOCK_TTL_SEC)
    if not ok:
        owner = r.get(LOCK_KEY)
        owner = owner.decode() if isinstance(owner, bytes) else owner
        print(f"[MEMPOOL WORKER] lock exists (owner={owner}) → exit")
        sys.exit(0)


def refresh_lock_forever():
    while True:
        time.sleep(LOCK_TTL_SEC // 2)
        owner = r.get(LOCK_KEY)
        owner = owner.decode() if isinstance(owner, bytes) else owner

        if owner != PID:
            print("[MEMPOOL WORKER] lost lock → exit")
            os._exit(1)

        r.expire(LOCK_KEY, LOCK_TTL_SEC)


def release_lock():
    try:
        owner = r.get(LOCK_KEY)
        owner = owner.decode() if isinstance(owner, bytes) else owner
        if owner == PID:
            r.delete(LOCK_KEY)
    except Exception:
        pass


# ============================================
# ▶️ START
# ============================================
if __name__ == "__main__":
    print("[MEMPOOL WORKER PROCESS] started")

    acquire_lock_or_exit()

    # Lock-Refresher (Daemon!)
    threading.Thread(
        target=refresh_lock_forever,
        name="mempool-lock-refresher",
        daemon=True
    ).start()

    try:
        # 🔥 BLOCKIERENDE ENDLOSSCHLEIFE
        mempool_worker_loop()

    except KeyboardInterrupt:
        print("[MEMPOOL WORKER PROCESS] stopped by Ctrl+C")

    finally:
        release_lock()
        print("[MEMPOOL WORKER PROCESS] exited cleanly")
