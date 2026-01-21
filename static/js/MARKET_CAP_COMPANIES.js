// ==================================================
// MARKET_CAP_COMPANIES.js – Unternehmen nach Market Cap
// ==================================================
// • Einheitlicher Market-Cap-Standard
// • Backend liefert fertige, sortierte Liste
// • Lazy-Load kompatibel
// • BTC wird ausschließlich per CSS hervorgehoben
// ==================================================

(() => {

    let MARKET_CAP_COMPANIES_HAS_LOADED_ONCE = false;

    const safeNumber = (value) => {
        const n = Number(value);
        return isNaN(n) ? 0 : n;
    };

    async function loadMarketCapCompanies() {

        const tbody = document.getElementById("MARKET_CAP_COMPANIES-tbody");
        if (!tbody) return;

        if (!MARKET_CAP_COMPANIES_HAS_LOADED_ONCE) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        Daten werden geladen…
                    </td>
                </tr>
            `;
        }

        try {
            const res  = await fetch("/api/companies");
            if (!res.ok) throw new Error("HTTP " + res.status);

            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Ungültige API-Antwort");

            tbody.innerHTML = "";

            if (data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center">
                            Keine Daten verfügbar
                        </td>
                    </tr>
                `;
                MARKET_CAP_COMPANIES_HAS_LOADED_ONCE = true;
                return;
            }

            data.forEach((item, index) => {

                const rank      = index + 1;
                const name      = item.name   ?? "Unbekannt";
                const symbol    = item.symbol ?? "—";
                const sector    = item.sector ?? "—";
                const marketCap = safeNumber(item.market_cap);

                const row = document.createElement("tr");

                if (symbol === "BTC" || item.__is_btc === true) {
                    row.classList.add("MARKET_CAP_COMPANIES-row-btc");
                }

                row.innerHTML = `
                    <td>${rank}</td>
                    <td>${name}</td>
                    <td>${symbol}</td>
                    <td>${sector}</td>
                    <td>$${marketCap.toLocaleString("en-US")}</td>
                `;

                tbody.appendChild(row);
            });

            MARKET_CAP_COMPANIES_HAS_LOADED_ONCE = true;

        } catch (err) {
            console.error("[MARKET_CAP_COMPANIES]", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        Fehler beim Laden der Daten
                    </td>
                </tr>
            `;
        }
    }

    // Lazy Loader Hook
    document.querySelectorAll(".subTabButton").forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.dataset.subtab === "MARKET_CAP_COMPANIES") {
                loadMarketCapCompanies();
            }
        });
    });

    // Initial Load (falls sichtbar)
    if (document.getElementById("MARKET_CAP_COMPANIES")?.style.display !== "none") {
        loadMarketCapCompanies();
    }

    window.loadMarketCapCompanies = loadMarketCapCompanies;

})();
