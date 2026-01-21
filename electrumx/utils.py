import hashlib
from bech32 import bech32_decode, convertbits

def address_to_scripthash(address: str) -> str:
    hrp, data = bech32_decode(address)
    if hrp != "bc":
        raise ValueError("unsupported address format")

    decoded = convertbits(data[1:], 5, 8, False)
    if decoded is None:
        raise ValueError("invalid bech32 payload")

    script = bytes([data[0]]) + bytes([len(decoded)]) + bytes(decoded)
    return hashlib.sha256(script).digest()[::-1].hex()
