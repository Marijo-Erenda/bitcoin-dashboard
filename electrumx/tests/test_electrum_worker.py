import asyncio
import os

from nodes.electrumx import ElectrumXClient


async def run():
    host = os.getenv("ELECTRUMX_HOST", "127.0.0.1")
    port = int(os.getenv("ELECTRUMX_PORT", "50001"))
    timeout = float(os.getenv("ELECTRUMX_TIMEOUT", "5"))

    client = ElectrumXClient(
        host=host,
        port=port,
        timeout=timeout,
    )

    backoff = 2
    while True:
        try:
            print("[ELECTRUMX TEST] connecting...")
            result = await client.server_version()
            print("[ELECTRUMX TEST] server.version →", result)
            break
        except Exception as e:
            print(f"[ELECTRUMX TEST] not ready: {e} (retry in {backoff}s)")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
