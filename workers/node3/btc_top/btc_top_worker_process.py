import os
import sys
import time

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.node3.btc_top.btc_top_worker import btc_top_worker_loop

if __name__ == "__main__":
    print("[BTC_TOP WORKER PROCESS] started")
    try:
        btc_top_worker_loop()
    except KeyboardInterrupt:
        print("[BTC_TOP WORKER PROCESS] stopped by Ctrl+C")
