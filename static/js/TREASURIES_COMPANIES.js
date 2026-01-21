// ==================================================
// TREASURIES_COMPANIES.js – Companies Treasury Table
// ==================================================
(function () {

    // --------------------------------------------------
    // State: nur einmal Loading anzeigen (Option B)
    // --------------------------------------------------
    let TREASURIES_COMPANIES_HAS_LOADED_ONCE = false;

    function loadTreasuriesCompanies() {

        const tbody  = document.getElementById("treasuries-companies-table-body");
        const status = document.getElementById("treasuries-companies-status");

        if (!tbody || !status) {
            console.warn("[TREASURIES_COMPANIES] DOM nicht bereit");
            return;
        }

        const setStatus = (text, type = "info") => {
            status.textContent = text;
            status.classList.remove("status-ok", "status-error");
            if (type === "ok") status.classList.add("status-ok");
            if (type === "error") status.classList.add("status-error");
        };

        const formatBTC = n =>
            Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 });

        const renderTable = rows => {
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.rank}</td>
                    <td>${r.company}</td>
                    <td>${r.country}</td>
                    <td>${r.ticker}</td>
                    <td>${formatBTC(r.btc)}</td>
                </tr>
            `).join("");
        };

        async function fetchCompanies() {

            // ----------------------------------------------
            // Status nur beim ersten Laden anzeigen
            // ----------------------------------------------
            if (!TREASURIES_COMPANIES_HAS_LOADED_ONCE) {
                setStatus("Lade Treasury-Daten …");
            }

            try {
                const res = await fetch("/api/treasuries_companies");
                if (!res.ok) throw new Error("API nicht erreichbar");

                const json = await res.json();
                if (json.status !== "ok" || !Array.isArray(json.data)) {
                    throw new Error("Ungültige API-Antwort");
                }

                renderTable(json.data);

                // ✅ Erfolg: Statusfeld nur beim ersten Mal leeren
                if (!TREASURIES_COMPANIES_HAS_LOADED_ONCE) {
                    setStatus("");
                }

                TREASURIES_COMPANIES_HAS_LOADED_ONCE = true;

                if (json.meta?.file) {
                    console.info(
                        "[TREASURIES_COMPANIES] geladen",
                        `FILE=${json.meta.file}`,
                        `COUNT=${json.data.length}`
                    );
                }

            } catch (err) {
                console.error("[TREASURIES_COMPANIES]", err);
                setStatus(`Fehler: ${err.message}`, "error");
            }
        }

        fetchCompanies();
    }

    window.loadTreasuriesCompanies = loadTreasuriesCompanies;

})();
