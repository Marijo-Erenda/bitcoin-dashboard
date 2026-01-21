#!/usr/bin/env python3
import os
import sys
import time

# ======================================================
# 🔧 Projekt-Root sauber setzen
# ======================================================
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

# ======================================================
# 🔥 Worker Import
# ======================================================
from workers.metrics.btc_tx_amount.btc_tx_amount_worker import (
    tx_amount_worker_loop
)

# ======================================================
# ▶️ MAIN
# ======================================================
if __name__ == "__main__":
    print("[BTC_TX_AMOUNT WORKER PROCESS] started")

    try:
        tx_amount_worker_loop()
    except KeyboardInterrupt:
        print("[BTC_TX_AMOUNT WORKER PROCESS] stopped by Ctrl+C")
