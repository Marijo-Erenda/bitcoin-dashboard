import os
import sys
import time

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.metrics.btc_volume.btc_volume_worker import btc_vol_worker_loop


if __name__ == "__main__":
    print("[BTC_VOL WORKER PROCESS] started")
    try:
        btc_vol_worker_loop()
    except KeyboardInterrupt:
        print("[BTC_VOL WORKER PROCESS] stopped by Ctrl+C")
