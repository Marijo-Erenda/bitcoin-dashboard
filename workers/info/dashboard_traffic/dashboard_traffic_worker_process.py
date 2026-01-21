# ==================================
# 🧵 DASHBOARD_TRAFFIC_WORKER_PROCESS
# ==================================

import os
import sys

# --------------------------------------------------
# Project Root korrekt setzen (wie bei allen Workern)
# --------------------------------------------------
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

# --------------------------------------------------
# Worker Loop importieren
# --------------------------------------------------
from workers.info.dashboard_traffic.dashboard_traffic_worker import (
    dashboard_traffic_worker_loop
)

# --------------------------------------------------
# Startpunkt
# --------------------------------------------------
if __name__ == "__main__":
    print("[DASHBOARD_TRAFFIC WORKER PROCESS] started")
    try:
        dashboard_traffic_worker_loop()
    except KeyboardInterrupt:
        print("[DASHBOARD_TRAFFIC WORKER PROCESS] stopped")
