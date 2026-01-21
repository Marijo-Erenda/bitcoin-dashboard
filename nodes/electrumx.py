import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

###############
# Base58Check #
###############

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_MAP = {c: i for i, c in enumerate(_B58_ALPHABET)}


def _b58decode(s: str) -> bytes:
    num = 0
    for ch in s:
        if ch not in _B58_MAP:
            raise ValueError("Invalid base58 character")
        num = num * 58 + _B58_MAP[ch]
    # leading zeros
    pad = 0
    for ch in s:
        if ch == "1":
            pad += 1
        else:
            break
    b = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    return b"\x00" * pad + b


def _sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def _hash256(b: bytes) -> bytes:
    return _sha256(_sha256(b))


def base58check_decode(addr: str) -> Tuple[int, bytes]:
    raw = _b58decode(addr)
    if len(raw) < 4:
        raise ValueError("Base58Check too short")
    payload, checksum = raw[:-4], raw[-4:]
    if _hash256(payload)[:4] != checksum:
        raise ValueError("Base58Check checksum mismatch")
    if len(payload) < 1:
        raise ValueError("Base58Check missing version byte")
    version = payload[0]
    data = payload[1:]
    return version, data


#########
# Bech32 #
#########

_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_BECH32_MAP = {c: i for i, c in enumerate(_BECH32_CHARSET)}


def _bech32_polymod(values: Sequence[int]) -> int:
    generator = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    chk = 1
    for v in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ v
        for i in range(5):
            chk ^= generator[i] if ((top >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp: str) -> List[int]:
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _bech32_verify_checksum(hrp: str, data: Sequence[int], spec: str) -> bool:
    const = 1 if spec == "bech32" else 0x2BC830A3  # bech32m
    return _bech32_polymod(_bech32_hrp_expand(hrp) + list(data)) == const


def _bech32_decode(addr: str) -> Tuple[str, List[int]]:
    if not (addr.lower() == addr or addr.upper() == addr):
        raise ValueError("Mixed-case bech32")
    addr = addr.lower()
    if "1" not in addr:
        raise ValueError("Invalid bech32 separator")
    pos = addr.rfind("1")
    hrp = addr[:pos]
    data_part = addr[pos + 1 :]
    if not hrp or len(data_part) < 6:
        raise ValueError("Invalid bech32 length")
    data = []
    for c in data_part:
        if c not in _BECH32_MAP:
            raise ValueError("Invalid bech32 character")
        data.append(_BECH32_MAP[c])
    return hrp, data


def _convertbits(data: Sequence[int], frombits: int, tobits: int, pad: bool) -> List[int]:
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            raise ValueError("Invalid value for convertbits")
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    else:
        if bits >= frombits:
            raise ValueError("Excess padding")
        if (acc << (tobits - bits)) & maxv:
            raise ValueError("Non-zero padding")
    return ret


def segwit_decode(addr: str) -> Tuple[str, int, bytes]:
    """
    Returns (hrp, witness_version, witness_program_bytes)
    Supports bech32 (v0) and bech32m (v1+).
    """
    hrp, data = _bech32_decode(addr)
    if len(data) < 1:
        raise ValueError("Bech32 data too short")
    witver = data[0]
    if witver > 16:
        raise ValueError("Invalid witness version")

    # Determine checksum spec:
    # v0 -> bech32, v1+ -> bech32m
    spec = "bech32" if witver == 0 else "bech32m"
    if not _bech32_verify_checksum(hrp, data, spec):
        raise ValueError("Bech32 checksum mismatch (wrong spec or corrupted address)")

    prog5 = data[1:-6]  # drop checksum (6)
    prog = bytes(_convertbits(prog5, 5, 8, pad=False))

    if len(prog) < 2 or len(prog) > 40:
        raise ValueError("Invalid witness program length")
    if witver == 0 and len(prog) not in (20, 32):
        raise ValueError("Invalid v0 witness program length")
    if witver == 1 and len(prog) != 32:
        raise ValueError("Invalid v1 (taproot) witness program length")
    return hrp, witver, prog


########################
# scriptPubKey builders#
########################

def _push_data(data: bytes) -> bytes:
    l = len(data)
    if l < 0x4C:
        return bytes([l]) + data
    raise ValueError("Data push too large for this minimal builder")


def scriptpubkey_from_address(address: str) -> bytes:
    """
    Mainnet only.
    Supports: P2PKH(1...), P2SH(3...), P2WPKH/P2WSH(bc1q...), P2TR(bc1p...)
    """
    address = address.strip()

    # Bech32 / Bech32m (SegWit)
    if address.lower().startswith("bc1"):
        hrp, witver, prog = segwit_decode(address)
        if hrp != "bc":
            raise ValueError("Not mainnet bech32 address (hrp != bc)")
        if witver == 0:
            # OP_0 (0x00) <push prog>
            return b"\x00" + _push_data(prog)
        else:
            # OP_1..OP_16 are 0x51..0x60
            op = bytes([0x50 + witver])
            return op + _push_data(prog)

    # Base58 (legacy)
    ver, h = base58check_decode(address)
    if ver == 0x00 and len(h) == 20:
        # P2PKH: OP_DUP OP_HASH160 <20> h OP_EQUALVERIFY OP_CHECKSIG
        return b"\x76\xa9\x14" + h + b"\x88\xac"
    if ver == 0x05 and len(h) == 20:
        # P2SH: OP_HASH160 <20> h OP_EQUAL
        return b"\xa9\x14" + h + b"\x87"

    raise ValueError("Unsupported or non-mainnet address format")


def address_to_scripthash(address: str) -> str:
    """
    ElectrumX expects: SHA256(scriptPubKey) as little-endian hex string.
    """
    spk = scriptpubkey_from_address(address)
    return hashlib.sha256(spk).digest()[::-1].hex()


#####################
# ElectrumX JSON-RPC #
#####################

@dataclass
class ElectrumXClient:
    host: str = "127.0.0.1"
    port: int = 50001
    timeout: float = 5.0

    async def call(self, method: str, params: Optional[List[Any]] = None, _id: int = 1) -> Any:
        if params is None:
            params = []
        req = {"jsonrpc": "2.0", "id": _id, "method": method, "params": params}
        payload = (json.dumps(req) + "\n").encode()

        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=self.timeout,
        )
        try:
            writer.write(payload)
            await writer.drain()

            line = await asyncio.wait_for(reader.readline(), timeout=self.timeout)
            if not line:
                raise ConnectionError("No response (connection closed).")

            resp = json.loads(line.decode())
            if resp.get("error"):
                raise RuntimeError(f"ElectrumX error: {resp['error']}")
            return resp.get("result")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def call_batch(self, calls: List[Tuple[str, List[Any]]]) -> List[Any]:
        """
        Sends multiple JSON-RPC requests in one TCP connection (saves latency).
        """
        reqs = [{"jsonrpc": "2.0", "id": i + 1, "method": m, "params": p} for i, (m, p) in enumerate(calls)]
        payload = ("\n".join(json.dumps(r) for r in reqs) + "\n").encode()

        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=self.timeout,
        )
        try:
            writer.write(payload)
            await writer.drain()

            results: Dict[int, Any] = {}
            for _ in range(len(reqs)):
                line = await asyncio.wait_for(reader.readline(), timeout=self.timeout)
                if not line:
                    raise ConnectionError("Batch response ended early.")
                resp = json.loads(line.decode())
                if resp.get("error"):
                    raise RuntimeError(f"ElectrumX error: {resp['error']}")
                results[int(resp["id"])] = resp.get("result")
            return [results[i + 1] for i in range(len(reqs))]
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    # Convenience wrappers
    async def server_version(self) -> Any:
        return await self.call("server.version", ["node_dashboard", "1.4"])

    async def scripthash_get_history(self, scripthash: str) -> List[Dict[str, Any]]:
        return await self.call("blockchain.scripthash.get_history", [scripthash])

    async def scripthash_get_balance(self, scripthash: str) -> Dict[str, int]:
        return await self.call("blockchain.scripthash.get_balance", [scripthash])

    async def scripthash_listunspent(self, scripthash: str) -> List[Dict[str, Any]]:
        return await self.call("blockchain.scripthash.listunspent", [scripthash])

    async def scripthash_get(self, scripthash: str) -> Dict[str, Any]:
        """
        One-shot: balance + utxos + history in one TCP roundtrip (batch).
        """
        bal, utxos, hist = await self.call_batch([
            ("blockchain.scripthash.get_balance", [scripthash]),
            ("blockchain.scripthash.listunspent", [scripthash]),
            ("blockchain.scripthash.get_history", [scripthash]),
        ])
        return {"balance": bal, "utxos": utxos, "history": hist}
