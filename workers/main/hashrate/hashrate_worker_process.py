# =========================================
# ⚙️ HASHRATE WORKER PROCESS -- NODE MAIN --
# =========================================

import os
import sys

# Projekt-Root sauber in den PYTHONPATH holen
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.main.hashrate.hashrate_worker import hashrate_worker_loop


if __name__ == "__main__":
    print("[HASHRATE WORKER PROCESS] started")
    try:
        hashrate_worker_loop()
    except KeyboardInterrupt:
        print("[HASHRATE WORKER PROCESS] stopped")
