# =========================================
# ⚙️ DIFFICULTY WORKER PROCESS -- NODE I--
# =========================================

import os
import sys

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.main.difficulty.difficulty_worker import difficulty_worker_loop


if __name__ == "__main__":
    print("[DIFFICULTY WORKER PROCESS] started")
    try:
        difficulty_worker_loop()
    except KeyboardInterrupt:
        print("[DIFFICULTY WORKER PROCESS] stopped")
