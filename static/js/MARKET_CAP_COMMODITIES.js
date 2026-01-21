// ===============================================
// MARKET_CAP_COMMODITIES.js (Horizontal + Toggle)
// ===============================================
(function () {

    const COLORS = [
        "#ffd000",
        "#ffb700",
        "#ffaa00",
        "#ff9900",
        "#c4761d" // BTC
    ];

    let currentMode = "absolute";
    let cachedData = [];

    // --------------------------------------------------
    // Format Helpers
    // --------------------------------------------------
    const formatNumber = n =>
        Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

    const toBillion = usd =>
        (Number(usd) || 0) / 1_000_000_000;

    // --------------------------------------------------
    // Tabelle (VOLLE ZAHLEN, KEINE EINHEIT)
    // --------------------------------------------------
    function renderTable(data) {
        const tbody = document.getElementById(
            "market-cap-commodities-table-body"
        );
        if (!tbody) return;

        tbody.innerHTML = data.map((row, i) => `
            <tr class="${row.__is_btc ? "MARKET_CAP_COMMODITIES-row-btc" : ""}">
                <td>${i + 1}</td>
                <td>${row.name}</td>
                <td>${formatNumber(row.market_cap_usd)}</td>
            </tr>
        `).join("");
    }

    // --------------------------------------------------
    // Horizontaler Balken-Chart
    // --------------------------------------------------
    function renderChart() {
        const container = document.getElementById(
            "market-cap-commodities-bar-chart"
        );
        if (!container) return;

        container.innerHTML = "";

        const btc = cachedData.find(d => d.__is_btc);
        const btcValue = btc ? btc.market_cap_usd : 1;

        const values = cachedData.map(d =>
            currentMode === "absolute"
                ? d.market_cap_usd
                : d.market_cap_usd / btcValue
        );

        const max = Math.max(...values, 1);

        cachedData.forEach((row, i) => {
            const rawValue =
                currentMode === "absolute"
                    ? row.market_cap_usd
                    : row.market_cap_usd / btcValue;

            const width = (rawValue / max) * 100;

            const displayValue =
                currentMode === "absolute"
                    ? formatNumber(toBillion(row.market_cap_usd))
                    : rawValue.toFixed(2);

            const barRow = document.createElement("div");
            barRow.className = "bar-row";

            barRow.innerHTML = `
                <div class="bar-label">${row.name}</div>

                <div class="bar-track">
                    <div
                        class="bar-fill ${row.__is_btc ? "bar-btc" : ""}"
                        style="
                            width:${width}%;
                            background:${COLORS[i % COLORS.length]};
                        "
                    ></div>
                </div>

                <div class="bar-value">
                    ${displayValue}
                </div>
            `;

            container.appendChild(barRow);
        });
    }

    // --------------------------------------------------
    // Toggle
    // --------------------------------------------------
    function initToggle() {
        document.querySelectorAll(".chart-toggle button").forEach(btn => {
            btn.addEventListener("click", () => {
                document
                    .querySelectorAll(".chart-toggle button")
                    .forEach(b => b.classList.remove("active"));

                btn.classList.add("active");
                currentMode = btn.dataset.mode;
                renderChart();
            });
        });
    }

    // --------------------------------------------------
    // API Loader
    // --------------------------------------------------
    async function load() {
        try {
            const res = await fetch("/api/market_cap_commodities");
            const json = await res.json();

            if (json.status !== "ok" || !Array.isArray(json.data)) return;

            cachedData = json.data.map(row => {

                // 🔶 BTC
                if (row.__is_btc === true || row.symbol === "BTC") {
                    return {
                        name: "Bitcoin",
                        symbol: "BTC",
                        market_cap_usd: Number(row.market_cap || 0),
                        __is_btc: true
                    };
                }

                // 🟦 Commodities
                return {
                    name: row.commodity ?? "—",
                    symbol: row.commodity ?? "—",
                    market_cap_usd:
                        Number(row.market_cap_billion_usd || 0) * 1_000_000_000,
                    __is_btc: false
                };
            });

            // Einheitliche Sortierung (absteigend)
            cachedData.sort(
                (a, b) => b.market_cap_usd - a.market_cap_usd
            );

            renderTable(cachedData);
            renderChart();
            initToggle();

        } catch (e) {
            console.error("[MARKET_CAP_COMMODITIES]", e);
        }
    }

    window.loadMarketCapCommodities = load;

})();
