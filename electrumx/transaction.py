async def get_transaction(client, txid: str, verbose=True):
    return await client.call(
        "blockchain.transaction.get",
        [txid, verbose]
    )
