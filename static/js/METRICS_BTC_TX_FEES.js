(() => {

/*
==========================================================
⚡ METRICS_BTC_TX_FEES – FINAL (RAW, CACHED, LOCAL DISPLAY)
==========================================================
*/

const METRICS_TX_FEES_SMA_RATIO = 0.08;

// ================================
// 🧠 Frontend Data Cache (TX_FEES)
// ================================
window.__MetricsTxFeesDataCache = window.__MetricsTxFeesDataCache || {};
const METRICS_TX_FEES_CACHE_TTL = 30_000;


// ==================
// 🔢 SMA
// ==================
function calculateSMA(data, windowSize) {
    if (!Array.isArray(data) || data.length < windowSize) return [];

    const out = [];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        const v = Number(data[i].y);
        if (Number.isNaN(v)) continue;

        sum += v;

        if (i >= windowSize) {
            const old = Number(data[i - windowSize].y);
            if (!Number.isNaN(old)) sum -= old;
        }

        if (i >= windowSize - 1) {
            out.push({ x: data[i].x, y: sum / windowSize });
        }
    }
    return out;
}


// ====================================
// 🧭 X-Axis (UTC basis, LOCAL display)
// ====================================
function buildUtcLinearAxis(timeframeMs, mode) {
    const now = Date.now();

    return {
        type: 'linear',
        min: now - timeframeMs,
        max: now,
        ticks: {
            autoSkip: true,
            maxRotation: 0,
            callback: v => {
                const d = new Date(v); // UTC timestamp → lokale Anzeige

                if (mode === 'time') {
                    return d.toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }

                if (mode === 'date') {
                    return d.toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit'
                    });
                }

                if (mode === 'month') {
                    return d.toLocaleDateString('de-DE', {
                        month: 'short',
                        year: 'numeric'
                    });
                }

                return '';
            }
        }
    };
}


// ========================================
// 🧾 Tooltip (LOCAL display, unified format)
// ========================================
function buildMetricsTxFeesTooltip() {
    return {
        mode: 'nearest',
        intersect: false,
        callbacks: {
            title: items => {
                if (!items.length) return '';
                const d = new Date(items[0].parsed.x);
                return d.toLocaleString(undefined, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            },
            label: ctx => {
                const y = Number(ctx.raw?.y ?? 0);
                const isSMA = ctx.dataset?.isSMA === true;
                const label = isSMA ? 'SMA' : 'TX Fees';

                return `${label}: ${y.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })} sat/vB`;
            }
        }
    };
}


// ===============================
// 🚀 Core Loader (Implementation)
// ===============================
async function loadMetricsTxFeesCore(canvasId) {

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const timeframes = {
        METRICS_BTC_TX_FEES_24H_CANVAS: 24  * 60 * 60 * 1000,
        METRICS_BTC_TX_FEES_1W_CANVAS:  7   * 24 * 60 * 60 * 1000,
        METRICS_BTC_TX_FEES_1M_CANVAS:  30  * 24 * 60 * 60 * 1000,
        METRICS_BTC_TX_FEES_1J_CANVAS:  365 * 24 * 60 * 60 * 1000
    };

    const axisMode = {
        METRICS_BTC_TX_FEES_24H_CANVAS: 'time',
        METRICS_BTC_TX_FEES_1W_CANVAS:  'date',
        METRICS_BTC_TX_FEES_1M_CANVAS:  'date',
        METRICS_BTC_TX_FEES_1J_CANVAS:  'month'
    };

    const smaLabels = {
        METRICS_BTC_TX_FEES_24H_CANVAS: '≈ 25 min',
        METRICS_BTC_TX_FEES_1W_CANVAS:  '≈ 14 h',
        METRICS_BTC_TX_FEES_1M_CANVAS:  '≈ 2.5 days',
        METRICS_BTC_TX_FEES_1J_CANVAS:  '≈ 1 month'
    };

    const apiRoutes = {
        METRICS_BTC_TX_FEES_24H_CANVAS: '/api/btc_tx_fees/24h',
        METRICS_BTC_TX_FEES_1W_CANVAS:  '/api/btc_tx_fees/1w',
        METRICS_BTC_TX_FEES_1M_CANVAS:  '/api/btc_tx_fees/1m',
        METRICS_BTC_TX_FEES_1J_CANVAS:  '/api/btc_tx_fees/1y'
    };

    const timeframe = timeframes[canvasId];
    const mode      = axisMode[canvasId];
    const url       = apiRoutes[canvasId];
    if (!timeframe || !mode || !url) return;

    async function fetchSnapshot() {
        const now = Date.now();
        const cached = window.__MetricsTxFeesDataCache[url];
        if (cached && (now - cached.ts) < METRICS_TX_FEES_CACHE_TTL) {
            return cached.data;
        }

        const res = await fetch(url);
        if (!res.ok) return [];

        const json = await res.json();
        const data = json.history || [];

        window.__MetricsTxFeesDataCache[url] = { data, ts: now };
        return data;
    }

    const data = await fetchSnapshot();
    const smaWindow = Math.max(2, Math.round(data.length * METRICS_TX_FEES_SMA_RATIO));
    const smaData = calculateSMA(data, smaWindow);

    console.info(
        '[METRICS_TX_FEES][SMA]',
        canvasId,
        data.length,
        'SMA needs',
        smaWindow,
        data.length < smaWindow
            ? `→ missing ${smaWindow - data.length}`
            : '→ SMA active'
    );

    const datasets = [{
        label: 'Transaction fees (x̄)',
        data,
        borderColor: 'rgba(220,20,60,0.95)',
        backgroundColor: 'rgba(220,20,60,0.15)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.2
    }];

    if (smaData.length) {
        datasets.push({
            label: `SMA 8 % (${smaLabels[canvasId]})`,
            data: smaData,
            isSMA: true,
            borderColor: 'rgba(30,144,255,0.9)',
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3
        });
    }

    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
        existingChart.destroy();
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: { position: 'top' },
                tooltip: buildMetricsTxFeesTooltip(),

                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'shift'
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x'
                    }
                }
            },

            scales: {
                x: buildUtcLinearAxis(timeframe, mode),
                y: { min: 0, title: { display: true, text: 'sat/vB' } }
            }
        }
    });

    // 🧼 Reset-Zoom per Doppelklick
    canvas.addEventListener('dblclick', () => {
        if (chart) chart.resetZoom();
    });
}


// --------------------------------------------------
// 🌍 Public API
// --------------------------------------------------
window.loadMetricsTxFees24H = () => loadMetricsTxFeesCore('METRICS_BTC_TX_FEES_24H_CANVAS');
window.loadMetricsTxFees1W  = () => loadMetricsTxFeesCore('METRICS_BTC_TX_FEES_1W_CANVAS');
window.loadMetricsTxFees1M  = () => loadMetricsTxFeesCore('METRICS_BTC_TX_FEES_1M_CANVAS');
window.loadMetricsTxFees1J  = () => loadMetricsTxFeesCore('METRICS_BTC_TX_FEES_1J_CANVAS');

})();
