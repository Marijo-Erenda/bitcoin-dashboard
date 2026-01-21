(() => {

/*
=======================================================
⚡ METRICS_BTC_DIFFICULTY – FINAL (ZOOM FIX)
- Cached Fetch
- Chart Reuse
- Zoom + Pan + Reset
=======================================================
*/

// --------------------------------------------------
// 🧠 Global State / Cache
// --------------------------------------------------
window.__MetricsDifficultyCharts    = window.__MetricsDifficultyCharts    || {};
window.__MetricsDifficultyDataCache = window.__MetricsDifficultyDataCache || {};
const METRICS_DIFFICULTY_CACHE_TTL  = 600_000; // 10 Minuten

// --------------------------------------------------
// 🔄 Cached Fetch
// --------------------------------------------------
async function fetchMetricsDifficultyCached(apiUrl) {
    const now    = Date.now();
    const cached = window.__MetricsDifficultyDataCache[apiUrl];

    if (cached && (now - cached.ts) < METRICS_DIFFICULTY_CACHE_TTL) {
        return cached.data;
    }

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    window.__MetricsDifficultyDataCache[apiUrl] = { data: json, ts: now };
    return json;
}

// --------------------------------------------------
// 📊 Core Loader
// --------------------------------------------------
async function loadMetricsDifficultyCore(apiUrl, canvasId) {

    if (window.__MetricsDifficultyCharts[canvasId]) {
        console.log("🟢 DIFFICULTY CHART REUSE", canvasId);
        return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    try {
        const api  = await fetchMetricsDifficultyCached(apiUrl);
        const hist = api.history || [];

        const labels = hist.map(p => new Date(p.time * 1000));
        const values = hist.map(p => p.difficulty);

        // -----------------------------
        // Formatting helpers
        // -----------------------------
        const supers = {
            "-":"⁻","0":"⁰","1":"¹","2":"²","3":"³","4":"⁴",
            "5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹"
        };

        const sci = v => {
            if (v < 1000) return v.toLocaleString("de-DE");
            const e = Math.floor(Math.log10(v));
            const b = (v / 10 ** e).toFixed(2);
            return `${b} × 10${String(e).split("").map(c => supers[c]).join("")}`;
        };

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
                    label: `Difficulty: ${sci(values.at(-1))}`,
                    data: values,
                    borderColor: "blue",
                    backgroundColor: "rgba(0,0,255,0.2)",
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
                        callbacks: {
                            title: items => {
                                if (!items.length) return '';

                                const d = new Date(items[0].label);

                                return d.toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                });
                            },

                            label: (item) => `Difficulty: ${sci(item.raw)}`
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
                        title: { display: true, text: "Difficulty" }
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

        window.__MetricsDifficultyCharts[canvasId] = chart;

    } catch (err) {
        console.error("❌ Difficulty-Chart Fehler:", err);
    }
}

// --------------------------------------------------
// 🌍 Public API
// --------------------------------------------------
window.loadMetricsDifficulty1Y   = () => loadMetricsDifficultyCore('/api/difficulty/1y',   'METRICS_BTC_DIFFICULTY_1Y_CANVAS');
window.loadMetricsDifficulty5Y   = () => loadMetricsDifficultyCore('/api/difficulty/5y',   'METRICS_BTC_DIFFICULTY_5Y_CANVAS');
window.loadMetricsDifficulty10Y  = () => loadMetricsDifficultyCore('/api/difficulty/10y',  'METRICS_BTC_DIFFICULTY_10Y_CANVAS');
window.loadMetricsDifficultyEver = () => loadMetricsDifficultyCore('/api/difficulty/ever', 'METRICS_BTC_DIFFICULTY_EVER_CANVAS');

})();
