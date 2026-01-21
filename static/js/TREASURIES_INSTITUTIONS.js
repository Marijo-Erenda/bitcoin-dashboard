// ==================================================
// TREASURIES_INSTITUTIONS.js – Institutions Treasury
// ==================================================
(function () {

    // --------------------------------------------------
    // State: nur einmal Loading anzeigen (Option B)
    // --------------------------------------------------
    let TREASURIES_INSTITUTIONS_HAS_LOADED_ONCE = false;

    // --------------------------------------------------
    // Konfiguration
    // --------------------------------------------------
    const PIE_COLORS = [
        "#ffd000",
        "#ffb700",
        "#ffaa00",
        "#ff9900",
        "#ff8800",
        "#ff7700",
        "#ff6600",
        "#ff5500"
    ];

    // --------------------------------------------------
    // Helper
    // --------------------------------------------------
    const formatBTC = n =>
        Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 });

    // --------------------------------------------------
    // Tabelle rendern
    // --------------------------------------------------
    function renderTable(rows) {

        const tbody = document.getElementById("treasuries-institutions-table-body");
        if (!tbody) return;

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.rank}</td>
                <td>${r.institution}</td>
                <td>${r.type}</td>
                <td>${r.country}</td>
                <td>${formatBTC(r.btc)}</td>
            </tr>
        `).join("");
    }

    // --------------------------------------------------
    // Pie Chart + Legende
    // --------------------------------------------------
    function renderPieChart(data) {

        const pie    = document.querySelector("#INSTITUTIONS .pie-chart");
        const legend = document.querySelector("#INSTITUTIONS .pie-legend");

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

            // Slice
            slices.push(`${color} ${start}% ${end}%`);

            // Legende
            const li = document.createElement("li");
            const dot = document.createElement("span");

            dot.className = "legend-color";
            dot.style.background = color;

            li.appendChild(dot);
            li.appendChild(document.createTextNode(item.institution));

            legend.appendChild(li);
        });

        // Rundungs-Fallback
        if (current < 100) {
            slices.push(`#333 ${current}% 100%`);
        }

        pie.style.background = `conic-gradient(${slices.join(", ")})`;
    }

    // --------------------------------------------------
    // API Loader
    // --------------------------------------------------
    async function fetchInstitutions() {

        const tbody = document.getElementById("treasuries-institutions-table-body");
        if (!tbody) return;

        // ----------------------------------------------
        // Loading-State nur beim ersten Laden
        // ----------------------------------------------
        if (!TREASURIES_INSTITUTIONS_HAS_LOADED_ONCE) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        Daten werden geladen…
                    </td>
                </tr>
            `;
        }

        try {
            const res = await fetch("/api/treasuries_institutions");
            if (!res.ok) throw new Error("API nicht erreichbar");

            const json = await res.json();
            if (json.status !== "ok" || !Array.isArray(json.data)) {
                throw new Error("Ungültige API-Antwort");
            }

            renderTable(json.data);
            renderPieChart(json.data);

            TREASURIES_INSTITUTIONS_HAS_LOADED_ONCE = true;

            if (json.meta?.file) {
                console.info(
                    "[TREASURIES_INSTITUTIONS] geladen",
                    `FILE=${json.meta.file}`,
                    `COUNT=${json.data.length}`
                );
            }

        } catch (err) {
            console.error("[TREASURIES_INSTITUTIONS]", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        Fehler beim Laden der Daten
                    </td>
                </tr>
            `;
        }
    }

    // --------------------------------------------------
    // Public Loader (Lazy Load)
    // --------------------------------------------------
    window.loadTreasuriesInstitutions = function () {
        fetchInstitutions();
    };

})();
