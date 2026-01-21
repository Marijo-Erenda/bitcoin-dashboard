import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

# 🔑 Projekt-Root ins PYTHONPATH
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from workers.electrumx.test_electrum_worker import run


def main():
    load_dotenv("env/.env.main")
    asyncio.run(run())


if __name__ == "__main__":
    main()
