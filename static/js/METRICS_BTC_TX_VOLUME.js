(() => {

// ==================================
// ⚡ METRICS_BTC_TX_VOLUME – FINAL
// ==================================


// =======================================================
// 🧠 Frontend Data Cache (TX_VOLUME)
// =======================================================
window.__MetricsTxVolumeDataCache = window.__MetricsTxVolumeDataCache || {};
const METRICS_TX_VOLUME_CACHE_TTL = 30_000; // 30s (passt zu 10s Worker)


// ==============
// 🕒 UTC Helpers
// ==============
function formatUTC(tsMs) {
    return new Date(tsMs)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16) + ' UTC';
}

function formatUtcTick(ts, mode) {
    const d = new Date(ts);

    const M = String(d.getUTCMonth() + 1).padStart(2, '0');
    const D = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');

    if (mode === 'time')  return `${h}:${m}`;
    if (mode === 'date')  return `${D}.${M}`;
    if (mode === 'month') {
        return d.toLocaleString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        });
    }
}


// =================================
// 🧭 X-Axis configuration per range
// =================================
const METRICS_TX_VOLUME_RANGE_CFG = {
    '1h':  { tickStepMs: 5  * 60 * 1000,              tickFormat: 'time'  },
    '24h': { tickStepMs: 60 * 60 * 1000,              tickFormat: 'time'  },
    '1w':  { tickStepMs: 24 * 60 * 60 * 1000,         tickFormat: 'date'  },
    '1m':  { tickStepMs: 3  * 24 * 60 * 60 * 1000,    tickFormat: 'date'  },
    '1y':  { tickStepMs: 30 * 24 * 60 * 60 * 1000,    tickFormat: 'month' }
};


// ============================
// 🧭 Linear UTC X-Axis Builder
// ============================
function buildUtcTimeAxis(rangeKey, timeframeMs) {
    const cfg = METRICS_TX_VOLUME_RANGE_CFG[rangeKey];
    const now = Date.now();

    return {
        type: 'linear',
        min: now - timeframeMs,
        max: now,
        ticks: {
            stepSize: cfg.tickStepMs,
            maxRotation: 0,
            callback: value => {
                const d = new Date(value);

                if (cfg.tickFormat === 'time') {
                    return d.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }

                if (cfg.tickFormat === 'date') {
                    return d.toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: '2-digit'
                    });
                }

                if (cfg.tickFormat === 'month') {
                    return d.toLocaleDateString(undefined, {
                        month: 'short',
                        year: 'numeric'
                    });
                }
            }
        },
        grid: { drawTicks: true }
    };
}


// ======
// 🔢 SMA
// ======
function calculateSMA(data, windowSize) {
    if (!Array.isArray(data) || data.length < windowSize) return [];

    const result = [];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        const y = Number(data[i].y);
        if (Number.isNaN(y)) continue;

        sum += y;

        if (i >= windowSize) {
            const oldY = Number(data[i - windowSize].y);
            if (!Number.isNaN(oldY)) sum -= oldY;
        }

        if (i >= windowSize - 1) {
            result.push({ x: data[i].x, y: sum / windowSize });
        }
    }
    return result;
}


// ==================
// 🧾 Tooltip Builder
// ==================
function buildMetricsTxVolumeTooltip(yBucketLabel) {
    return {
        mode: 'nearest',
        intersect: false,
        callbacks: {

            title: items => {
                if (!items.length) return '';
                return new Date(items[0].parsed.x)
                    .toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
            },
            
            label: ctx => {
                const y = Number(ctx.raw?.y ?? 0);
                const isSMA = ctx.dataset?.isSMA === true;
                const label = isSMA ? 'SMA' : 'TX Volume';

                return `${label}: ${y.toLocaleString(undefined, {
                    maximumFractionDigits: 2
                })} ${yBucketLabel}`;
            }

        }
    };
}


// ==========================
// 🧠 Global Chart Controller
// ==========================
window.__MetricsTxVolumeCharts  = window.__MetricsTxVolumeCharts  || {};
window.__MetricsTxVolumeUpdater = window.__MetricsTxVolumeUpdater || null;

function stopMetricsTxVolumeUpdater() {
    if (window.__MetricsTxVolumeUpdater) {
        clearInterval(window.__MetricsTxVolumeUpdater);
        window.__MetricsTxVolumeUpdater = null;
    }
}


// =============================
// 🚀 Core Loader (Implementation)
// =============================
async function loadMetricsTxVolumeCore(canvasId) {
    stopMetricsTxVolumeUpdater();

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (window.__MetricsTxVolumeCharts[canvasId]) {
        window.__MetricsTxVolumeCharts[canvasId].destroy();
        delete window.__MetricsTxVolumeCharts[canvasId];
    }

    // -------------------------
    // Timeframes
    // -------------------------
    const timeframes = {
        METRICS_BTC_TX_VOLUME_1H_CANVAS:  60  * 60 * 1000,
        METRICS_BTC_TX_VOLUME_24H_CANVAS: 24  * 60 * 60 * 1000,
        METRICS_BTC_TX_VOLUME_1W_CANVAS:  7   * 24 * 60 * 60 * 1000,
        METRICS_BTC_TX_VOLUME_1M_CANVAS:  30  * 24 * 60 * 60 * 1000,
        METRICS_BTC_TX_VOLUME_1J_CANVAS:  365 * 24 * 60 * 60 * 1000
    };

    const apiRoutes = {
        METRICS_BTC_TX_VOLUME_1H_CANVAS:  '/api/btc_tx_volume/1h',
        METRICS_BTC_TX_VOLUME_24H_CANVAS: '/api/btc_tx_volume/24h',
        METRICS_BTC_TX_VOLUME_1W_CANVAS:  '/api/btc_tx_volume/1w',
        METRICS_BTC_TX_VOLUME_1M_CANVAS:  '/api/btc_tx_volume/1m',
        METRICS_BTC_TX_VOLUME_1J_CANVAS:  '/api/btc_tx_volume/1y'
    };

    const timeframe = timeframes[canvasId];
    const apiUrl    = apiRoutes[canvasId];
    if (!timeframe || !apiUrl) return;

    const rangeKey =
        canvasId.includes('_1H_')  ? '1h'  :
        canvasId.includes('_24H_') ? '24h' :
        canvasId.includes('_1W_')  ? '1w'  :
        canvasId.includes('_1M_')  ? '1m'  : '1y';

    const yBucketLabel =
        rangeKey === '1h'  ? 'BTC / 10s' :
        rangeKey === '24h' ? 'BTC / min' :
        rangeKey === '1w'  ? 'BTC / h'   :
        rangeKey === '1m'  ? 'BTC / h'   :
                             'BTC / day';

    async function fetchSnapshot() {
        const now = Date.now();
        const cached = window.__MetricsTxVolumeDataCache[apiUrl];

        if (cached && (now - cached.ts) < METRICS_TX_VOLUME_CACHE_TTL) {
            return cached.data;
        }

        const res = await fetch(apiUrl);
        if (!res.ok) return [];

        const json = await res.json();
        const data = json.history || [];

        window.__MetricsTxVolumeDataCache[apiUrl] = { data, ts: now };
        return data;
    }

    const data = await fetchSnapshot();

    // -------------------------
    // SMA
    // -------------------------
    const SMA_RATIO = 0.08;
    const windowSize = Math.max(2, Math.round(data.length * SMA_RATIO));
    const sma = calculateSMA(data, windowSize);

    // 🔍 SMA Initial Log (WIEDER DRIN)
    console.info(
        '[METRICS_TX_VOLUME][SMA]',
        canvasId,
        data.length,
        'SMA needs',
        windowSize,
        data.length < windowSize
            ? `→ missing ${windowSize - data.length}`
            : '→ SMA active'
    );

    // -------------------------
    // Datasets
    // -------------------------
    const datasets = [{
        label: `Bitcoin Transaction Volume`,
        data,
        borderColor: 'rgba(34,139,34,0.95)',
        backgroundColor: 'rgba(34,139,34,0.15)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.2
    }];

    if (sma.length) {
        datasets.push({
            label: 'SMA 8 %',
            data: sma,
            isSMA: true,
            borderColor: 'rgba(255,165,0,0.9)',
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3
        });
    }

    // -------------------------
    // Chart Init
    // -------------------------
    const chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: { position: 'top' },
                tooltip: buildMetricsTxVolumeTooltip(yBucketLabel),

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
                x: buildUtcTimeAxis(rangeKey, timeframe),
                y: { min: 0, title: { display: true, text: yBucketLabel } }
            }
        }
    });

    window.__MetricsTxVolumeCharts[canvasId] = chart;

    // 🧼 Reset-Zoom per Doppelklick
    canvas.addEventListener("dblclick", () => {
        if (chart) chart.resetZoom();
    });

    // -------------------------
    // Live Update
    // -------------------------
    window.__MetricsTxVolumeUpdater = setInterval(async () => {
        const res = await fetch(apiUrl);
        if (!res.ok) return;

        const json = await res.json();
        const fresh = json.history || [];

        window.__MetricsTxVolumeDataCache[apiUrl] = {
            data: fresh,
            ts: Date.now()
        };

        chart.data.datasets[0].data = fresh;

        const nextWindowSize = Math.max(2, Math.round(fresh.length * SMA_RATIO));

        // 🔍 SMA Live Log (WIEDER DRIN)
        console.debug(
            '[METRICS_TX_VOLUME][SMA][LIVE]',
            canvasId,
            fresh.length,
            'SMA needs',
            nextWindowSize
        );

        if (chart.data.datasets[1]) {
            chart.data.datasets[1].data = calculateSMA(fresh, nextWindowSize);
        }

        chart.update('none');
    }, 10_000);
}


// --------------------------------------------------
// 🌍 Public API
// --------------------------------------------------
window.loadMetricsTxVolume1H  = () => loadMetricsTxVolumeCore('METRICS_BTC_TX_VOLUME_1H_CANVAS');
window.loadMetricsTxVolume24H = () => loadMetricsTxVolumeCore('METRICS_BTC_TX_VOLUME_24H_CANVAS');
window.loadMetricsTxVolume1W  = () => loadMetricsTxVolumeCore('METRICS_BTC_TX_VOLUME_1W_CANVAS');
window.loadMetricsTxVolume1M  = () => loadMetricsTxVolumeCore('METRICS_BTC_TX_VOLUME_1M_CANVAS');
window.loadMetricsTxVolume1J  = () => loadMetricsTxVolumeCore('METRICS_BTC_TX_VOLUME_1J_CANVAS');

})();
