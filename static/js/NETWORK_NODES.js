(() => {

    // ===============================================================
    // NETWORK_NODES.js – Gekapselte Version mit Public API
    // ===============================================================

    const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 60 Minuten

    let autoRefreshHandle = null;

    // ---------------------------------------------------------------
    // Internal loader (privat)
    // ---------------------------------------------------------------
    async function loadNodeDataInternal() {
        const totalNodesSection = document.getElementById('NETWORK_NODES_total-nodes-section');
        const countrySection = document.getElementById('NETWORK_NODES_nodes-by-country-section');
        const mapSection = document.getElementById('NETWORK_NODES_world-map-section');

        try {
            const res = await fetch('/api/network/nodes');
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Gesamtanzahl Nodes
            if (totalNodesSection) {
                document.getElementById('NETWORK_NODES_total-nodes').textContent =
                    (data.total || 0).toLocaleString();

                document.getElementById('NETWORK_NODES_last-update').textContent =
                    `Letzte Aktualisierung: ${data.last_update || '—'}`;
            }

            // Länderstatistik
            if (countrySection) {
                const countriesContainer =
                    document.getElementById('NETWORK_NODES_countries-container');

                countriesContainer.innerHTML = '';

                const countries = (data.by_country && data.by_country.length)
                    ? data.by_country.map(c => ({
                        country: ({
                            "Vereinigte Staaten": "United States",
                            "Deutschland": "Germany",
                            "Frankreich": "France",
                            "Kanada": "Canada",
                            "Finnland": "Finland",
                            "Niederlande": "Netherlands",
                            "Vereinigtes Königreich": "United Kingdom",
                            "Schweiz": "Switzerland",
                            "Russische Föderation": "Russia"
                        }[c.country] || c.country),
                        nodes: c.nodes
                    }))
                    : [];

                countries.sort((a, b) => b.nodes - a.nodes);

                countries.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'flex justify-between p-1 border-b border-gray-700';
                    div.textContent =
                        `${item.country}: ${item.nodes.toLocaleString()}`;
                    countriesContainer.appendChild(div);
                });

                // Weltkarte
                if (mapSection && typeof Plotly !== 'undefined') {
                    const mapData = [{
                        type: 'choropleth',
                        locationmode: 'country names',
                        locations: countries.map(c => c.country),
                        z: countries.map(c => c.nodes),
                        colorscale: [
                            [0,  '#e6f4ea'],
                            [0.2, '#c0e6c8'],
                            [0.4, '#8ed3a5'],
                            [0.6, '#5fbe7b'],
                            [0.8, '#32a653'],
                            [1,  '#0d8435']
                        ],
                        marker: {
                            line: { color: 'rgb(180,180,180)', width: 0.5 }
                        },
                        colorbar: { title: 'Nodes' }
                    }];

                    const layout = {
                        title: 'Bitcoin Nodes weltweit',
                        geo: {
                            showframe: false,
                            showcoastlines: true,
                            projection: { type: 'equirectangular' }
                        }
                    };

                    Plotly.newPlot(
                        'NETWORK_NODES_world-map',
                        mapData,
                        layout,
                        { responsive: true }
                    );
                }
            }

        } catch (err) {
            console.error('Fehler beim Laden der Node-Daten:', err);

            if (totalNodesSection) {
                document.getElementById('NETWORK_NODES_total-nodes').textContent =
                    'Fehler beim Laden';
            }

            if (countrySection) {
                document.getElementById('NETWORK_NODES_countries-container').innerHTML =
                    '<p>Fehler beim Laden der Länderstatistik</p>';
            }

            if (mapSection) {
                document.getElementById('NETWORK_NODES_world-map').innerHTML =
                    '<p>Fehler beim Laden der Karte</p>';
            }
        }
    }

    // ---------------------------------------------------------------
    // Auto refresh (privat)
    // ---------------------------------------------------------------
    function startAutoRefresh() {
        if (autoRefreshHandle) return;

        autoRefreshHandle = setInterval(
            loadNodeDataInternal,
            AUTO_REFRESH_INTERVAL_MS
        );
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------
    window.loadNodeData = function () {
        loadNodeDataInternal();
        startAutoRefresh();
    };

})();
