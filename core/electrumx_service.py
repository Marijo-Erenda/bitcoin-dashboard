"""
ElectrumX-Client-Service

Stellt eine verzögert initialisierte, prozessweite Instanz des
ElectrumXClient bereit.

Ziele dieses Moduls:
- genau eine ElectrumX-Verbindung pro Prozess
- zentrale Konfiguration über Umgebungsvariablen
- Wiederverwendung in API, Workern und Tests

Dieses Modul enthält ausschließlich Infrastruktur-Code und
keine fachliche Logik oder direkten ElectrumX-Zugriffe.
"""

import os
from nodes.electrumx import ElectrumXClient

# Singleton-Instanz (wird beim ersten Zugriff erstellt)
_electrumx_client: ElectrumXClient | None = None


def get_electrumx_client() -> ElectrumXClient:
    """
    Gibt eine gemeinsame ElectrumXClient-Instanz zurück.

    Die Instanz wird beim ersten Aufruf erzeugt und für die
    gesamte Laufzeit des Prozesses wiederverwendet.
    """
    global _electrumx_client

    if _electrumx_client is None:
        _electrumx_client = ElectrumXClient(
            host=os.getenv("ELECTRUMX_HOST", "127.0.0.1"),
            port=int(os.getenv("ELECTRUMX_PORT", "50001")),
            timeout=float(os.getenv("ELECTRUMX_TIMEOUT", "5")),
        )

    return _electrumx_client
