#!/usr/bin/env python3
import os
import sys
import time

# ===============================
# 🔧 Projekt-Root setzen
# ===============================
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

# ===============================
# 🔗 Storage Worker importieren
# ===============================
from workers.services.storage.storage_worker import main


if __name__ == "__main__":
    print("[STORAGE WORKER PROCESS] started")

    try:
        main()
    except KeyboardInterrupt:
        print("[STORAGE WORKER PROCESS] stopped by Ctrl+C")
