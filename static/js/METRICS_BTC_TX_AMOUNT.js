(() => {

// =================================================
// ⚡ METRICS_BTC_TX_AMOUNT – Top Bitcoin Transactions
// =================================================


// ==================================
// 🧠 Frontend Data Cache (TX_AMOUNT)
// ==================================
window.__MetricsTxAmountDataCache = window.__MetricsTxAmountDataCache || {};
const METRICS_TX_AMOUNT_CACHE_TTL = 10_000; // 10s


// ==========================
// API FETCH + Cache (internal)
// ==========================
async function fetchMetricsTxAmountData() {
    const url = "/api/txamount/history";
    const now = Date.now();
    const cached = window.__MetricsTxAmountDataCache[url];

    if (cached && (now - cached.ts) < METRICS_TX_AMOUNT_CACHE_TTL) {
        return cached.data;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();

        window.__MetricsTxAmountDataCache[url] = { data: json, ts: now };
        return json;

    } catch (err) {
        console.warn("[METRICS_TX_AMOUNT] Failed to load data:", err);
        return {
            now: [],
            "24h": [],
            "1w": [],
            "1m": [],
            "1y": [],
            halving: [],
            ever: []
        };
    }
}


// =======================
// Date Formatter (internal)
// =======================
function formatMetricsTxAmountDate(ts) {
    if (!ts) return "—";
    try {
        const d = new Date(ts);
        return `Recorded on ${d.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        })} at ${d.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        })}`;
    } catch {
        return "—";
    }
}


// =======================
// Table Renderer (internal)
// =======================
function renderMetricsTxAmountTable(tableId, rows, limit = 1000) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const sliced = rows.slice(0, limit);
    let html = `
        <thead>
            <tr>
                <th>Position</th>
                <th>TXID</th>
                <th>BTC Amount</th>
                <th>Time</th>
            </tr>
        </thead>
        <tbody>
    `;

    if (!sliced.length) {
        html += `
            <tr>
                <td colspan="4" style="text-align:center;">
                    No data available
                </td>
            </tr>
        `;
    } else {
        sliced.forEach((row, idx) => {
            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td style="font-family:monospace;">${row.txid || "—"}</td>
                    <td>${Number(row.btc_value || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 8,
                        maximumFractionDigits: 8
                    })}</td>
                    <td>${formatMetricsTxAmountDate(row.timestamp_ms)}</td>
                </tr>
            `;
        });
    }

    table.innerHTML = html + "</tbody>";
}


// =======================
// 🌍 Core Loader (internal)
// =======================
async function loadMetricsTxAmountCore(rangeKey, tableId, limit) {
    const data = await fetchMetricsTxAmountData();
    renderMetricsTxAmountTable(tableId, data[rangeKey] || [], limit);
}


// =======================
// 🌍 Public API (View)
// =======================
window.loadMetricsTxAmountNow     = () => loadMetricsTxAmountCore("now",     "METRICS_BTC_TX_AMOUNT_NOW_TABLE", 50);
window.loadMetricsTxAmount24H     = () => loadMetricsTxAmountCore("24h",     "METRICS_BTC_TX_AMOUNT_24H_TABLE");
window.loadMetricsTxAmount1W      = () => loadMetricsTxAmountCore("1w",      "METRICS_BTC_TX_AMOUNT_1W_TABLE");
window.loadMetricsTxAmount1M      = () => loadMetricsTxAmountCore("1m",      "METRICS_BTC_TX_AMOUNT_1M_TABLE");
window.loadMetricsTxAmount1Y      = () => loadMetricsTxAmountCore("1y",      "METRICS_BTC_TX_AMOUNT_1Y_TABLE");
window.loadMetricsTxAmountHalving = () => loadMetricsTxAmountCore("halving", "METRICS_BTC_TX_AMOUNT_HALVING_TABLE");
window.loadMetricsTxAmountEver    = () => loadMetricsTxAmountCore("ever",    "METRICS_BTC_TX_AMOUNT_EVER_TABLE");

})();
