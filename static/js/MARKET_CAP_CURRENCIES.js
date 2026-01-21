(() => {

// =================================================================================
// MARKET_CAP_CURRENCIES.js – Währungen nach Marktkapitalisierung (USD-normalisiert)
// =================================================================================

// =============================
// State: nur einmal laden
let MARKET_CAP_CURRENCIES_HAS_LOADED_ONCE = false;

// =============================
// Hilfsfunktion: Sichere Nummer
function safeNumber(value) {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
}

// =============================
// Hauptfunktion
async function loadMarketCapCurrencies() {

    const tbody = document.getElementById("MARKET_CAP_CURRENCIES-tbody");

    // ⛔ Subtab noch nicht im DOM
    if (!tbody) return;

    // --------------------------
    // Loading-State (nur beim ersten Laden)
    // --------------------------
    if (!MARKET_CAP_CURRENCIES_HAS_LOADED_ONCE) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="MARKET_CAP_CURRENCIES-loading text-center">
                    Daten werden geladen…
                </td>
            </tr>
        `;
    }

    try {
        // ====================
        // 1️⃣ Fetch (RELATIV, KEINE DOMAIN)
        const res = await fetch("/api/market-cap-currencies");
        if (!res.ok) throw new Error("HTTP " + res.status);

        const json = await res.json();

        // ====================
        // 2️⃣ Validierung
        if (!json || json.status !== "ok" || !Array.isArray(json.data)) {
            throw new Error("Ungültige API-Daten");
        }

        const data = json.data;

        // ====================
        // 3️⃣ Render
        tbody.innerHTML = "";

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        Keine Daten verfügbar
                    </td>
                </tr>
            `;
            MARKET_CAP_CURRENCIES_HAS_LOADED_ONCE = true;
            return;
        }

        data.forEach((item, idx) => {

            const rank   = idx + 1;
            const name   = item.name   ?? "Unbekannt";
            const symbol = item.symbol ?? "—";
            const type   = item.type   ?? "—";

            const marketCapUSD    = safeNumber(item.market_cap_usd);
            const marketCapNative = safeNumber(item.market_cap_native);

            const isBTC =
                item.__is_btc === true ||
                symbol.toUpperCase() === "BTC";

            // Tooltip: native Werte nur für Fiat
            let titleAttr = "";
            if (!isBTC && marketCapNative > 0) {
                titleAttr = `title="${marketCapNative.toLocaleString("en-US")} ${symbol}"`;
            }

            const row = document.createElement("tr");

            // 🔶 BTC Highlight
            if (isBTC) {
                row.classList.add("MARKET_CAP_CURRENCIES-row-btc");
            }

            row.innerHTML = `
                <td>${rank}</td>
                <td>${name}</td>
                <td>${symbol}</td>
                <td>${type}</td>
                <td ${titleAttr}>
                    $${marketCapUSD.toLocaleString("en-US")}
                </td>
            `;

            tbody.appendChild(row);
        });

        // ====================
        // 4️⃣ State setzen
        MARKET_CAP_CURRENCIES_HAS_LOADED_ONCE = true;

        // Optional Debug
        if (json.meta) {
            console.info(
                "[MARKET_CAP_CURRENCIES] geladen",
                `COUNT=${json.meta.count}`
            );
        }

    } catch (err) {
        console.error("[MARKET_CAP_CURRENCIES]", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">
                    Fehler beim Laden der Daten
                </td>
            </tr>
        `;
    }
}

// ======================================================
// Lazy-Load Integration (identisch zu Coins / Companies)
document.querySelectorAll(".subTabButton").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.subtab === "MARKET_CAP_CURRENCIES") {
            loadMarketCapCurrencies();
        }
    });
});

// Initial Load (falls sichtbar)
if (document.getElementById("MARKET_CAP_CURRENCIES")?.style.display !== "none") {
    loadMarketCapCurrencies();
}

// Public API
window.loadMarketCapCurrencies = loadMarketCapCurrencies;

})();
