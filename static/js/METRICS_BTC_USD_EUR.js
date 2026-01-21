(() => {

// =====================================================================
// METRICS_BTC_USD_EUR.js – BTC/USD & BTC/EUR Chart (Backend-only)
// =====================================================================

let btcChartInstance = null;
let btcMetricsCache  = null;
let btcMetricsCacheTs = 0;
const BTC_METRICS_CACHE_TTL = 600_000; // 10 Minuten

async function loadBTCMetrics() {

    const canvas = document.getElementById('METRICS_BTC_USD_EUR_CANVAS');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // --------------------------------------------------
    // 🔄 Cache (stale allowed)
    // --------------------------------------------------
    const now = Date.now();
    if (!btcMetricsCache || (now - btcMetricsCacheTs) > BTC_METRICS_CACHE_TTL) {
        const res = await fetch('/api/metrics/btc_usd_eur');
        if (!res.ok) {
            console.error("[BTC_METRICS] API Fehler", res.status);
            return;
        }
        btcMetricsCache = await res.json();
        btcMetricsCacheTs = now;
    }

    const api = btcMetricsCache;
    if (!api?.history?.usd || !api?.history?.eur) return;

    const histUSD = api.history.usd;
    const histEUR = api.history.eur;

    if (!histUSD.length || !histEUR.length) return;

    const labels    = histUSD.map(p => new Date(p[0]));
    const pricesUSD = histUSD.map(p => p[1]);
    const pricesEUR = histEUR.map(p => p[1]);

    const labelUSD = `BTC/USD: ${api.live?.usd
        ? api.live.usd.toLocaleString("de-DE") + " $"
        : "—"}`;

    const labelEUR = `BTC/EUR: ${api.live?.eur
        ? api.live.eur.toLocaleString("de-DE") + " €"
        : "—"}`;

    function getWeekNumber(d) {
        const date = new Date(d);
        date.setHours(0,0,0,0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(
            ((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
        );
    }

    // --------------------------------------------------
    // 🟢 Chart nur EINMAL erzeugen
    // --------------------------------------------------
    if (!btcChartInstance) {

        btcChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: labelUSD,
                        data: pricesUSD,
                        borderColor: "gold",
                        backgroundColor: "rgba(255,215,0,0.2)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: labelEUR,
                        data: pricesEUR,
                        borderColor: "dodgerblue",
                        backgroundColor: "rgba(30,144,255,0.2)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            
            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: { position: "top" },

                    tooltip: {
                        callbacks: {
                            title: items => {
                                if (!items.length) return '';
                                return new Date(items[0].label).toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                });
                            },
                            label: item => {
                                const name = item.dataset.label.split(":")[0];
                                return `${name}: ${item.formattedValue}`;
                            }
                        }
                    },

                    zoom: {
                        pan: { enabled: true, mode: "x" },
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
                        title: { display: true, text: "Price" }
                    }
                }
            }
        });

        canvas.addEventListener("dblclick", () => {
            btcChartInstance?.resetZoom();
        });

    } else {
        // 🔁 nur Daten & Labels aktualisieren
        btcChartInstance.data.labels = labels;
        btcChartInstance.data.datasets[0].data = pricesUSD;
        btcChartInstance.data.datasets[1].data = pricesEUR;
        btcChartInstance.data.datasets[0].label = labelUSD;
        btcChartInstance.data.datasets[1].label = labelEUR;
        btcChartInstance.update("none");
    }
}

// --------------------------------------------------
// 🌍 Public API
// --------------------------------------------------
window.loadBTCMetrics = loadBTCMetrics;

})();
