# ==================================
# 🧵 CHART_BTC_VOLUME_WORKER_PROCESS
# ==================================

import os
import sys

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.metrics.btc_tx_volume.btc_tx_volume_worker import btc_tx_volume_worker_loop

if __name__ == "__main__":
    print("[BTC_TX_VOLUME WORKER PROCESS] started")
    try:
        btc_tx_volume_worker_loop()
    except KeyboardInterrupt:
        print("[BTC_TX_VOLUME WORKER PROCESS] stopped")
