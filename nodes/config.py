# nodes/config.py
import os
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_DIR = os.path.join(BASE_DIR, "env")

def load_node_env(node_name: str):
    env_path = os.path.join(ENV_DIR, f".env.{node_name}")
    if not os.path.isfile(env_path):
        raise RuntimeError(f"[NODE_CONFIG] Missing {env_path}")
    load_dotenv(env_path, override=True)

def make_node_config(name: str, pruned: bool):
    load_node_env(name)
    return {
        "name": name,
        "rpc_host": os.getenv("RPC_HOST"),
        "rpc_port": int(os.getenv("RPC_PORT")),
        "rpc_user": os.getenv("RPC_USER"),
        "rpc_password": os.getenv("RPC_PASSWORD"),
        "pruned": pruned,
    }

NODE_CONFIG = {
    "main":  make_node_config("main",  pruned=False),
    "node2": make_node_config("node2", pruned=True),
    "node3": make_node_config("node3", pruned=True),
}
