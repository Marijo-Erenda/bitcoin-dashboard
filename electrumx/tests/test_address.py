import asyncio
import os
import sys
from pathlib import Path

# Projekt-Root ins PYTHONPATH
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from nodes.electrumx import ElectrumXClient
from electrumx.address import get_address_overview


async def run(address: str):
    host = os.getenv("ELECTRUMX_HOST", "127.0.0.1")
    port = int(os.getenv("ELECTRUMX_PORT", "50001"))
    timeout = float(os.getenv("ELECTRUMX_TIMEOUT", "5"))

    client = ElectrumXClient(
        host=host,
        port=port,
        timeout=timeout,
    )

    print("[TEST] Connecting to ElectrumX…")
    version = await client.server_version()
    print("[TEST] server.version →", version)

    print(f"\n[TEST] Fetching address overview for:\n{address}\n")

    data = await get_address_overview(client, address)

    balance = data["balance"]
    utxos = data["utxos"]
    history = data["history"]

    print("=== BALANCE ===")
    print(f"Confirmed   : {balance.get('confirmed', 0)} sat")
    print(f"Unconfirmed : {balance.get('unconfirmed', 0)} sat")

    print("\n=== UTXOS ===")
    print(f"Count: {len(utxos)}")
    for u in utxos[:5]:
        print(f"- {u['tx_hash']}:{u['tx_pos']} → {u['value']} sat")

    if len(utxos) > 5:
        print("…")

    print("\n=== HISTORY ===")
    print(f"TX count: {len(history)}")
    for h in history[:5]:
        height = h.get("height")
        print(f"- {h['tx_hash']} (height={height})")

    if len(history) > 5:
        print("…")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage:")
        print("  python electrumx/tests/test_address.py <bitcoin_address>")
        sys.exit(1)

    addr = sys.argv[1]
    asyncio.run(run(addr))
