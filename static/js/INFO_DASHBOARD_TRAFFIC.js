(() => {

/*
=======================================================
📊 INFO_DASHBOARD_TRAFFIC – FINAL
=======================================================
*/

// ==================
// 🕒 UTC Helpers
// ==================
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

// =======================================================
// 🧭 X-Axis configuration
// =======================================================
const INFO_DASHBOARD_TRAFFIC_RANGE_CFG = {
    '1h':  { tickStepMs: 5  * 60 * 1000,           tickFormat: 'time'  },
    '24h': { tickStepMs: 60 * 60 * 1000,           tickFormat: 'time'  },
    '1w':  { tickStepMs: 24 * 60 * 60 * 1000,      tickFormat: 'date'  },
    '1m':  { tickStepMs: 3  * 24 * 60 * 60 * 1000, tickFormat: 'date'  },
    '1y':  { tickStepMs: 30 * 24 * 60 * 60 * 1000, tickFormat: 'month' }
};

// =======================================================
// 🧭 Linear UTC X-Axis Builder
// =======================================================
function buildUtcTimeAxis(rangeKey, timeframeMs) {
    const cfg = INFO_DASHBOARD_TRAFFIC_RANGE_CFG[rangeKey];
    const now = Date.now();

    return {
        type: 'linear',
        min: now - timeframeMs,
        max: now,
        ticks: {
            stepSize: cfg.tickStepMs,
            maxRotation: 0,
            callback: v => formatUtcTick(v, cfg.tickFormat)
        }
    };
}

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
        if (i >= windowSize) sum -= Number(data[i - windowSize].y || 0);
        if (i >= windowSize - 1) out.push({ x: data[i].x, y: sum / windowSize });
    }
    return out;
}

// ==================
// 🧾 Tooltip
// ==================
function buildTrafficTooltip(yBucketLabel) {
    return {
        mode: 'nearest',
        intersect: false,
        callbacks: {
            title: items => items.length ? formatUTC(items[0].parsed.x) : '',
            label: ctx => {
                const y = Number(ctx.raw?.y ?? 0);
                const isSMA = ctx.dataset?.isSMA === true;
                return `${isSMA ? 'Ø Traffic' : 'Traffic'}: ${y.toLocaleString('de-DE')} ${yBucketLabel}`;
            }
        }
    };
}


// ==========================
// 🧠 Chart Controller
// ==========================
window.__infoDashboardTrafficCharts  = window.__infoDashboardTrafficCharts  || {};
window.__infoDashboardTrafficUpdater = window.__infoDashboardTrafficUpdater || null;

function stopInfoDashboardTrafficUpdater() {
    if (window.__infoDashboardTrafficUpdater) {
        clearInterval(window.__infoDashboardTrafficUpdater);
        window.__infoDashboardTrafficUpdater = null;
    }
}

// ==========================
// 🚀 Core Loader
// ==========================
async function loadInfoDashboardTrafficCore(canvasId) {
    stopInfoDashboardTrafficUpdater();

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (window.__infoDashboardTrafficCharts[canvasId]) {
        window.__infoDashboardTrafficCharts[canvasId].destroy();
        delete window.__infoDashboardTrafficCharts[canvasId];
    }

    // -------------------------
    // Timeframes
    // -------------------------
    const timeframes = {
        INFO_DASHBOARD_TRAFFIC_1H_CANVAS:  60  * 60 * 1000,
        INFO_DASHBOARD_TRAFFIC_24H_CANVAS: 24  * 60 * 60 * 1000,
        INFO_DASHBOARD_TRAFFIC_1W_CANVAS:  7   * 24 * 60 * 60 * 1000,
        INFO_DASHBOARD_TRAFFIC_1M_CANVAS:  30  * 24 * 60 * 60 * 1000,
        INFO_DASHBOARD_TRAFFIC_1Y_CANVAS:  365 * 24 * 60 * 60 * 1000
    };

    // -------------------------
    // API Routes (Dashboard Traffic)
    // -------------------------
    const apiRoutes = {
        INFO_DASHBOARD_TRAFFIC_1H_CANVAS:  '/api/dashboard_traffic/1h',
        INFO_DASHBOARD_TRAFFIC_24H_CANVAS: '/api/dashboard_traffic/24h',
        INFO_DASHBOARD_TRAFFIC_1W_CANVAS:  '/api/dashboard_traffic/1w',
        INFO_DASHBOARD_TRAFFIC_1M_CANVAS:  '/api/dashboard_traffic/1m',
        INFO_DASHBOARD_TRAFFIC_1Y_CANVAS:  '/api/dashboard_traffic/1y'
    };

    const rangeKey =
        canvasId.includes('_1H_')  ? '1h'  :
        canvasId.includes('_24H_') ? '24h' :
        canvasId.includes('_1W_')  ? '1w'  :
        canvasId.includes('_1M_')  ? '1m'  : '1y';

    const timeframe = timeframes[canvasId];
    const apiUrl    = apiRoutes[canvasId];
    if (!timeframe || !apiUrl) return;

    // -------------------------
    // Initial Fetch
    // -------------------------
    const res = await fetch(apiUrl);
    if (!res.ok) return;
    const data = (await res.json()).history || [];

    // -------------------------
    // SMA
    // -------------------------
    const SMA_RATIO = 0.08;
    const windowSize = Math.max(2, Math.round(data.length * SMA_RATIO));
    const sma = calculateSMA(data, windowSize);

    console.info(
        '[INFO_DASHBOARD_TRAFFIC][SMA]',
        canvasId,
        data.length,
        'SMA needs',
        windowSize,
        data.length < windowSize
            ? `→ missing ${windowSize - data.length}`
            : '→ SMA active'
    );

    // -------------------------
    // Y-Axis Label
    // -------------------------
    const yBucketLabel =
        rangeKey === '1h'  ? 'Requests / 10s' :
        rangeKey === '24h' ? 'Requests / min' :
        rangeKey === '1w'  ? 'Requests / h'   :
        rangeKey === '1m'  ? 'Requests / h'   :
                             'Requests / day';

    // -------------------------
    // Datasets
    // -------------------------
    const datasets = [{
        label: `Traffic (${yBucketLabel})`,
        data,
        borderColor: 'rgba(54,162,235,0.95)',
        backgroundColor: 'rgba(54,162,235,0.15)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.2
    }];

    if (sma.length) {
        datasets.push({
            label: 'SMA 8 %',
            data: sma,
            isSMA: true,
            borderColor: 'rgba(255,255,255,0.9)',
            pointRadius: 0,
            borderWidth: 2
        });
    }

    // -------------------------
    // Chart Init (Zoom & Pan)
    // -------------------------
    const chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                tooltip: buildTrafficTooltip(yBucketLabel),
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
                y: {
                    min: 0,
                    title: { display: true, text: yBucketLabel }
                }
            }
        }
    });

    window.__infoDashboardTrafficCharts[canvasId] = chart;

    // -------------------------
    // Live Update
    // -------------------------
    window.__infoDashboardTrafficUpdater = setInterval(async () => {
        const r = await fetch(apiUrl);
        if (!r.ok) return;

        const fresh = (await r.json()).history || [];
        chart.data.datasets[0].data = fresh;

        const nextWindowSize = Math.max(2, Math.round(fresh.length * SMA_RATIO));

        console.debug(
            '[INFO_DASHBOARD_TRAFFIC][SMA][LIVE]',
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

// ==========================
// 🌍 Public API
// ==========================
window.loadInfoDashboardTraffic1H  = () => loadInfoDashboardTrafficCore('INFO_DASHBOARD_TRAFFIC_1H_CANVAS');
window.loadInfoDashboardTraffic24H = () => loadInfoDashboardTrafficCore('INFO_DASHBOARD_TRAFFIC_24H_CANVAS');
window.loadInfoDashboardTraffic1W  = () => loadInfoDashboardTrafficCore('INFO_DASHBOARD_TRAFFIC_1W_CANVAS');
window.loadInfoDashboardTraffic1M  = () => loadInfoDashboardTrafficCore('INFO_DASHBOARD_TRAFFIC_1M_CANVAS');
window.loadInfoDashboardTraffic1Y  = () => loadInfoDashboardTrafficCore('INFO_DASHBOARD_TRAFFIC_1Y_CANVAS');

})();
