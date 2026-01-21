// =====================================================
// MARKET_CAP_COINS.js – Kryptowährungen nach Market Cap
// =====================================================

(() => {

    let MARKET_CAP_COINS_HAS_LOADED_ONCE = false;

    const safeNumber = (value) => {
        const n = Number(value);
        return isNaN(n) ? 0 : n;
    };

    async function loadMarketCapCoins() {

        const tbody = document.getElementById("MARKET_CAP_COINS-tbody");
        if (!tbody) return;

        if (!MARKET_CAP_COINS_HAS_LOADED_ONCE) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        Daten werden geladen…
                    </td>
                </tr>
            `;
        }

        try {
            // ✅ RELATIVE API – backend only
            const res = await fetch("/api/market_cap_coins");
            if (!res.ok) throw new Error("HTTP " + res.status);

            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Ungültige API-Antwort");

            tbody.innerHTML = "";

            data.forEach((coin, index) => {

                const rank      = index + 1;
                const name      = coin.name ?? "Unbekannt";
                const symbol    = coin.symbol ? coin.symbol.toUpperCase() : "N/A";
                const image     = coin.image ?? "";

                const marketCap = safeNumber(coin.market_cap);
                const price     = safeNumber(coin.current_price);
                const change24h = safeNumber(coin.price_change_percentage_24h);

                const changeClass = change24h >= 0 ? "text-success" : "text-danger";

                const row = document.createElement("tr");

                if (symbol === "BTC") {
                    row.classList.add("MARKET_CAP_COINS-row-btc");
                }

                row.innerHTML = `
                    <td>${rank}</td>
                    <td>
                        <img src="${image}" alt="${name}"
                             style="width:20px;height:20px;margin-right:6px;vertical-align:middle;">
                        ${name}
                    </td>
                    <td>${symbol}</td>
                    <td>$${marketCap.toLocaleString("en-US")}</td>
                    <td>$${price.toLocaleString("en-US")}</td>
                    <td class="${changeClass}">
                        ${change24h.toFixed(2)}%
                    </td>
                `;

                tbody.appendChild(row);
            });

            MARKET_CAP_COINS_HAS_LOADED_ONCE = true;

        } catch (err) {
            console.error("[MARKET_CAP_COINS]", err);

            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger">
                        Fehler beim Laden der Daten
                    </td>
                </tr>
            `;
        }
    }

    // ==================================================
    // 🔐 DOM READY – extrem wichtig für Firefox iOS
    // ==================================================
    document.addEventListener("DOMContentLoaded", () => {

        document.querySelectorAll(".subTabButton").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.subtab === "MARKET_CAP_COINS") {
                    loadMarketCapCoins();
                }
            });
        });

        // Initial Load (falls Tab bereits sichtbar)
        const container = document.getElementById("MARKET_CAP_COINS");
        if (container && container.style.display !== "none") {
            loadMarketCapCoins();
        }
    });

    // Public API (optional, sauber)
    window.loadMarketCapCoins = loadMarketCapCoins;

})();
