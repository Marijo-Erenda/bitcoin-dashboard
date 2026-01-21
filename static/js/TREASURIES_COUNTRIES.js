// ==================================================
// TREASURIES_COUNTRIES.js – Countries Treasury
// ==================================================
(function () {

    // --------------------------------------------------
    // State: nur einmal Loading anzeigen (Option B)
    // --------------------------------------------------
    let TREASURIES_COUNTRIES_HAS_LOADED_ONCE = false;

    const PIE_COLORS = [
        "#ffd000",
        "#ffb700",
        "#ffaa00",
        "#ff9900",
        "#ff8800",
        "#ff7700",
        "#ff6600",
        "#ff5500",
        "#ff4400",
        "#7a1f1f"
    ];

    const formatBTC = n =>
        Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 });

    // ---------------------------------------
    // Tabelle rendern
    // ---------------------------------------
    function renderTable(rows) {

        const tbody = document.getElementById("treasuries-countries-table-body");
        if (!tbody) return;

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.rank}</td>
                <td>${r.country}</td>
                <td>${formatBTC(r.btc)}</td>
            </tr>
        `).join("");
    }

    // ---------------------------------------
    // Pie Chart + Legende (IDENTISCH zu Institutions)
    // ---------------------------------------
    function renderPieChart(data) {

        const pie    = document.querySelector("#COUNTRIES .pie-chart");
        const legend = document.querySelector("#COUNTRIES .pie-legend");

        if (!pie || !legend) return;

        const totalBTC = data.reduce((sum, r) => sum + r.btc, 0);

        let current = 0;
        const slices = [];
        legend.innerHTML = "";

        data.forEach((item, index) => {

            const percent = totalBTC > 0
                ? (item.btc / totalBTC) * 100
                : 0;

            const start = current;
            const end = current + percent;
            current = end;

            const color = PIE_COLORS[index % PIE_COLORS.length];
            slices.push(`${color} ${start}% ${end}%`);

            // Legende (ohne BTC-Werte)
            const li = document.createElement("li");
            const dot = document.createElement("span");

            dot.className = "legend-color";
            dot.style.background = color;

            li.appendChild(dot);
            li.appendChild(document.createTextNode(item.country));

            legend.appendChild(li);
        });

        // Rundungs-Fallback
        if (current < 100) {
            slices.push(`#333 ${current}% 100%`);
        }

        pie.style.background = `conic-gradient(${slices.join(", ")})`;
    }

    // ---------------------------------------
    // API Loader
    // ---------------------------------------
    async function fetchCountries() {

        const tbody = document.getElementById("treasuries-countries-table-body");
        if (!tbody) return;

        // ----------------------------------------------
        // Loading-State nur beim ersten Laden
        // ----------------------------------------------
        if (!TREASURIES_COUNTRIES_HAS_LOADED_ONCE) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center">
                        Daten werden geladen…
                    </td>
                </tr>
            `;
        }

        try {
            const res = await fetch("/api/treasuries_countries");
            if (!res.ok) throw new Error("API nicht erreichbar");

            const json = await res.json();
            if (json.status !== "ok" || !Array.isArray(json.data)) {
                throw new Error("Ungültige API-Antwort");
            }

            renderTable(json.data);
            renderPieChart(json.data);

            TREASURIES_COUNTRIES_HAS_LOADED_ONCE = true;

            if (json.meta?.file) {
                console.info(
                    "[TREASURIES_COUNTRIES] geladen",
                    `FILE=${json.meta.file}`,
                    `COUNT=${json.data.length}`
                );
            }

        } catch (err) {
            console.error("[TREASURIES_COUNTRIES]", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-danger">
                        Fehler beim Laden der Daten
                    </td>
                </tr>
            `;
        }
    }

    // ---------------------------------------
    // Public Loader (Lazy Load)
    // ---------------------------------------
    window.loadTreasuriesCountries = function () {
        fetchCountries();
    };

})();
