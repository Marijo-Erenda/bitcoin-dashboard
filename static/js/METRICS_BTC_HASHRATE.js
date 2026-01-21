(() => {

/*
=======================================================
⚡ METRICS_BTC_HASHRATE – FINAL (ZOOM FIX)
- Frontend Fetch Cache (TTL 10min)
- 1 Chart pro Canvas
- Zoom + Pan + Reset
=======================================================
*/

window.__MetricsHashrateCharts = window.__MetricsHashrateCharts || {};
window.__MetricsHashrateData   = window.__MetricsHashrateData   || {};
const METRICS_HASHRATE_CACHE_TTL = 600_000; // 10 min

// --------------------------------------------------
// 🔄 API Fetch (cached + TTL)
// --------------------------------------------------
async function fetchMetricsHashrateCached(apiUrl) {
    const now = Date.now();
    const cached = window.__MetricsHashrateData[apiUrl];

    if (cached && (now - cached.ts) < METRICS_HASHRATE_CACHE_TTL) {
        return cached.data;
    }

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    window.__MetricsHashrateData[apiUrl] = { data: json, ts: now };
    return json;
}

// --------------------------------------------------
// 🚀 Core Loader
// --------------------------------------------------
async function loadMetricsHashrateCore(apiUrl, canvasId) {

    if (window.__MetricsHashrateCharts[canvasId]) {
        console.log("🟢 HASHRATE CHART REUSE", canvasId);
        return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    try {
        const api  = await fetchMetricsHashrateCached(apiUrl);
        const hist = api.history || [];

        const labels = hist.map(p => new Date(p.time * 1000));
        const values = hist.map(p => p.hashrate);

        // -----------------------------
        // Formatting helpers
        // -----------------------------
        function formatHashrate(v) {
            const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
            let i = 0;
            while (v >= 1000 && i < units.length - 1) {
                v /= 1000;
                i++;
            }
            return v.toFixed(2) + " " + units[i];
        }

        function getWeekNumber(d) {
            const date = new Date(d);
            date.setHours(0,0,0,0);
            date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
            const week1 = new Date(date.getFullYear(), 0, 4);
            return 1 + Math.round(
                ((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
            );
        }

        // -----------------------------
        // Chart
        // -----------------------------
        const chart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: `Hashrate: ${formatHashrate(values.at(-1))}`,
                    data: values,
                    borderColor: "red",
                    backgroundColor: "rgba(255,0,0,0.2)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: { position: "top" },

                    tooltip: {
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            title: items => {
                                        if (!items.length) return '';

                                        const d = new Date(items[0].label);

                                        return d.toLocaleString(undefined, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short'
                                        });
                                    },
                            label: ctx => {
                                return `Hashrate: ${formatHashrate(ctx.raw)}`;
                            }
                        }
                    },

                    // 🔥 ZOOM + PAN
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: "x"
                        },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: "x"
                        }
                    }
                },

                scales: {
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            callback: function(value) {
                                const d = this.chart.data.labels[value];
                                return `${getWeekNumber(d)}/${String(d.getFullYear()).slice(-2)}`;
                            }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: v => formatHashrate(v)
                        }
                    }
                }
            }
        });

        // --------------------------------------------------
        // 🧼 Reset Zoom (Double Click)
        // --------------------------------------------------
        canvas.addEventListener("dblclick", () => {
            chart.resetZoom();
        });

        window.__MetricsHashrateCharts[canvasId] = chart;

    } catch (err) {
        console.error("❌ METRICS_HASHRATE Chart Fehler:", err);
    }
}

// --------------------------------------------------
// 🌍 Public API
// --------------------------------------------------
window.loadMetricsHashrate1Y   = () => loadMetricsHashrateCore('/api/hashrate/1y',   'METRICS_BTC_HASHRATE_1Y_CANVAS');
window.loadMetricsHashrate5Y   = () => loadMetricsHashrateCore('/api/hashrate/5y',   'METRICS_BTC_HASHRATE_5Y_CANVAS');
window.loadMetricsHashrate10Y  = () => loadMetricsHashrateCore('/api/hashrate/10y',  'METRICS_BTC_HASHRATE_10Y_CANVAS');
window.loadMetricsHashrateEver = () => loadMetricsHashrateCore('/api/hashrate/ever', 'METRICS_BTC_HASHRATE_EVER_CANVAS');

})();
