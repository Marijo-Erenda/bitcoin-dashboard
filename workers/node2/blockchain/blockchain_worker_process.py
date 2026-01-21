import os
import sys
import time
import threading
import redis

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../")
)
sys.path.insert(0, PROJECT_ROOT)

from workers.node2.blockchain.blockchain_worker import blockchain_worker_loop

if __name__ == "__main__":
    print("[BLOCKCHAIN WORKER PROCESS] started")
    try:
        blockchain_worker_loop()
    except KeyboardInterrupt:
        print("[BLOCKCHAIN WORKER PROCESS] stopped by Ctrl+C")
