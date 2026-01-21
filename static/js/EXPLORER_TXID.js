// ===================================================
// EXPLORER_TXID.js – Transaction Explorer (lazy-init)
// ===================================================
(function () {

    function loadExplorerTxid() {

        const input   = document.getElementById("explorer-txid-input");
        const button  = document.getElementById("explorer-txid-search");
        const status  = document.getElementById("explorer-txid-status");
        const summary = document.getElementById("explorer-txid-summary");
        const result  = document.getElementById("explorer-txid-history");

        if (!input || !button || !status || !summary || !result) {
            console.warn("[EXPLORER_TXID] DOM not ready");
            return;
        }

        // Prevent double initialization
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        // --------------------------------------------------
        // Status handling
        // --------------------------------------------------
        const setStatus = (text, type = "info") => {
            status.textContent = text;
            status.classList.remove("status-ok", "status-error");

            if (type === "ok") status.classList.add("status-ok");
            if (type === "error") status.classList.add("status-error");
        };

        const hideResults = () => {
            summary.style.display = "none";
            result.style.display = "none";
        };

        const isValidTxid = txid =>
            /^[0-9a-f]{64}$/i.test(txid);

        // --------------------------------------------------
        // Summary
        // --------------------------------------------------
        const renderSummary = data => {

            const confirmedText = data.confirmed
                ? `Confirmed (${data.confirmations})`
                : "Unconfirmed (Mempool)";

            const dateText = data.timestamp
                ? new Date(data.timestamp * 1000).toLocaleString()
                : "—";

            summary.innerHTML = `
                <div class="address-summary-grid">
                    <div>Status</div>
                    <div>${confirmedText}</div>

                    <div>Block</div>
                    <div>${data.block_height ?? "—"}</div>

                    <div>Timestamp</div>
                    <div>${dateText}</div>

                    <div>Total Input</div>
                    <div>${data.total_in.toFixed(8)} BTC</div>

                    <div>Total Output</div>
                    <div>${data.total_out.toFixed(8)} BTC</div>

                    <div>Fee</div>
                    <div>${data.fee.toFixed(8)} BTC</div>
                </div>
            `;

            summary.style.display = "block";
        };

        // --------------------------------------------------
        // API fetch
        // --------------------------------------------------
        async function fetchExplorerTxid(txid) {
            setStatus("Loading transaction data …");
            hideResults();

            try {
                const res  = await fetch(`/api/explorer_txid/${txid}`);
                const json = await res.json();

                if (!res.ok || json.status !== "ok") {
                    throw new Error(json.error || "Request failed");
                }

                setStatus("Transaction found", "ok");
                renderSummary(json.data);

            } catch (err) {
                setStatus(`Error: ${err.message}`, "error");
            }
        }

        // --------------------------------------------------
        // Events
        // --------------------------------------------------
        button.onclick = () => {
            const txid = input.value.trim();

            if (!isValidTxid(txid)) {
                setStatus("Invalid transaction ID (TXID)", "error");
                hideResults();
                return;
            }

            fetchExplorerTxid(txid);
        };

        input.onkeydown = e => {
            if (e.key === "Enter") button.click();
        };

        console.log("[EXPLORER_TXID] initialized");
    }

    // 👉 Single export point
    window.loadExplorerTxid = loadExplorerTxid;

})();
