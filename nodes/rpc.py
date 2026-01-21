# nodes/rpc.py
# RPC-Client pro Node – explizit, thread-sicher, ohne ENV-Magie

import requests
from requests.auth import HTTPBasicAuth


class BitcoinRPC:
    """
    Fester RPC-Client für genau eine Bitcoin-Node.
    Einmal erstellt → niemals Node-Wechsel möglich.
    """

    def __init__(self, cfg: dict):
        self.name = cfg["name"]
        self.host = cfg["rpc_host"]
        self.port = cfg["rpc_port"]
        self.user = cfg["rpc_user"]
        self.password = cfg["rpc_password"]
        self.pruned = cfg.get("pruned", False)

        if not self.user or not self.password:
            raise RuntimeError(
                f"[RPC:{self.name}] Missing RPC credentials"
            )

        self.url = f"http://{self.host}:{self.port}/"
        self.auth = HTTPBasicAuth(self.user, self.password)
        self.headers = {"Content-Type": "application/json"}

    def call(self, method: str, params=None):
        if params is None:
            params = []

        payload = {
            "jsonrpc": "1.0",
            "id": self.name,
            "method": method,
            "params": params,
        }

        try:
            resp = requests.post(
                self.url,
                json=payload,
                headers=self.headers,
                auth=self.auth,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("error"):
                raise RuntimeError(
                    f"[RPC:{self.name}] {method} error: {data['error']}"
                )

            return data["result"]

        except Exception as e:
            raise RuntimeError(
                f"[RPC:{self.name}] RPC call failed ({method}): {e}"
            )

    # -------------------------
    # Guards
    # -------------------------
    def require_full_node(self):
        if self.pruned:
            raise RuntimeError(
                f"[RPC:{self.name}] Full node required, but node is pruned"
            )

    def require_pruned_node(self):
        if not self.pruned:
            raise RuntimeError(
                f"[RPC:{self.name}] Pruned node required, but node is full"
            )

    def info(self) -> str:
        return f"{self.name}@{self.host}:{self.port}"
