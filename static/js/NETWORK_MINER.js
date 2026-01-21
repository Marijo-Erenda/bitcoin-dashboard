(() => {

    // ============================================================
    // NETWORK_MINER.js – Mining Pools (Backend-getrieben)
    // ============================================================

    let autoRefreshInterval = null;

    // ===============================
    // Interner Loader
    // ===============================
    async function loadMinerDataInternal() {

        // 1️⃣ Bekannte Top 5 Pools (aus Backend)
        const knownContainer = document.getElementById('NETWORK_MINER_known_list');
        if (knownContainer) {
            knownContainer.innerHTML = '';

            try {
                const response = await fetch('/api/network/miner');
                const data = await response.json();

                if (!Array.isArray(data) || data.length === 0) {
                    knownContainer.innerHTML =
                        '<li>Keine Miner-Daten verfügbar</li>';
                } else {
                    data.forEach(pool => {
                        if (!pool.pool || pool.share === undefined) return;

                        const li = document.createElement('li');
                        li.innerHTML = `
                            <strong>${pool.pool}</strong>
                            – <em>${pool.share.toFixed(2)} %</em>
                        `;
                        knownContainer.appendChild(li);
                    });
                }
            } catch (err) {
                knownContainer.innerHTML =
                    '<li>Fehler beim Abrufen der Miner-Daten</li>';
                console.error('[NETWORK_MINER] Fehler (Top 5):', err);
            }
        }

        // 2️⃣ Live-Hashrate (bewusst identisch – gleiche Quelle)
        const liveContainer = document.getElementById('NETWORK_MINER_live_list');
        if (liveContainer) {
            liveContainer.innerHTML = '';

            try {
                const response = await fetch('/api/network/miner');
                const data = await response.json();

                if (!Array.isArray(data) || data.length === 0) {
                    liveContainer.innerHTML =
                        '<li>Keine Live-Daten verfügbar</li>';
                } else {
                    data.forEach(pool => {
                        if (!pool.pool || pool.share === undefined) return;

                        const li = document.createElement('li');
                        li.innerHTML = `
                            <strong>${pool.pool}</strong>
                            – <em>${pool.share.toFixed(2)} %</em>
                        `;
                        liveContainer.appendChild(li);
                    });
                }
            } catch (err) {
                liveContainer.innerHTML =
                    '<li>Fehler beim Abrufen der Live-Hashrate</li>';
                console.error('[NETWORK_MINER] Fehler (Live):', err);
            }
        }
    }

    // ===============================
    // Auto-Refresh (einmalig)
    // ===============================
    function startMinerAutoRefresh() {
        if (autoRefreshInterval) return;

        autoRefreshInterval = setInterval(() => {
            const container = document.getElementById('NETWORK_MINER');
            if (container && container.style.display !== 'none') {
                loadMinerDataInternal();
            }
        }, 5 * 60 * 1000);
    }

    // ===============================
    // Public API
    // ===============================
    window.loadMinerData = function () {
        loadMinerDataInternal();
        startMinerAutoRefresh();
    };

})();
