// ================================================
// EXPLORER_WALLET.js – Wallet Explorer (lazy-init)
// ================================================
(function () {

    function loadExplorerWallet() {

        const input   = document.getElementById("explorer-wallet-input");
        const button  = document.getElementById("explorer-wallet-analyze");
        const status  = document.getElementById("explorer-wallet-status");
        const summary = document.getElementById("explorer-wallet-summary");
        const table   = document.getElementById("explorer-wallet-breakdown");

        if (!input || !button || !status || !summary || !table) {
            console.warn("[EXPLORER_WALLET] DOM not ready");
            return;
        }

        // Prevent double initialization
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        // ----------------------------
        // Status handling
        // ----------------------------
        const setStatus = (text, type = "info") => {
            status.textContent = text;
            status.classList.remove("status-ok", "status-error");
            if (type === "ok") status.classList.add("status-ok");
            if (type === "error") status.classList.add("status-error");
        };

        const hideResults = () => {
            summary.style.display = "none";
            table.style.display = "none";
        };

        // ----------------------------
        // Helpers
        // ----------------------------
        const MAX_ADDRESSES = 25;

        const isValidAddress = addr =>
            /^bc1[0-9a-z]{20,}$/i.test(addr);

        const parseAddresses = () =>
            input.value
                .split("\n")
                .map(a => a.trim())
                .filter(a => a.length > 0);

        // ----------------------------
        // Summary (aggregated)
        // ----------------------------
        const renderSummary = data => {
            summary.innerHTML = `
                <div class="address-summary-grid">
                    <div>Addresses</div>
                    <div>${data.address_count}</div>

                    <div>Confirmed</div>
                    <div>${(data.balance.confirmed / 1e8).toFixed(8)} BTC</div>

                    <div>Unconfirmed</div>
                    <div>${(data.balance.unconfirmed / 1e8).toFixed(8)} BTC</div>

                    <div>UTXOs</div>
                    <div>${data.utxo_count}</div>
                </div>
            `;
            summary.style.display = "block";
        };

        // ----------------------------
        // Address breakdown
        // ----------------------------
        const renderTable = addresses => {
            table.innerHTML = `
                <table class="explorer-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Address</th>
                            <th>Confirmed (BTC)</th>
                            <th>UTXOs</th>
                            <th>TXs</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${addresses.map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${a.address}</td>
                                <td>${(a.balance.confirmed / 1e8).toFixed(8)}</td>
                                <td>${a.utxos.length}</td>
                                <td>${a.history.length}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;
            table.style.display = "block";
        };

        // ----------------------------
        // API fetch
        // ----------------------------
        async function fetchWallet(addresses) {
            setStatus("Analyzing wallet …");
            hideResults();

            try {
                const res = await fetch("/api/explorer_wallet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ addresses })
                });

                const json = await res.json();

                if (!res.ok || json.status !== "ok") {
                    throw new Error(json.error || "Request failed");
                }

                setStatus("Wallet successfully analyzed", "ok");
                renderSummary(json.data);
                renderTable(json.data.addresses);

            } catch (err) {
                setStatus(`Error: ${err.message}`, "error");
            }
        }

        // ----------------------------
        // Events
        // ----------------------------
        button.onclick = () => {
            const addresses = parseAddresses();

            if (addresses.length === 0) {
                setStatus("Please enter at least one address", "error");
                hideResults();
                return;
            }

            // 🔒 Frontend soft limit
            if (addresses.length > MAX_ADDRESSES) {
                setStatus(
                    `Too many addresses. Maximum allowed: ${MAX_ADDRESSES}.`,
                    "error"
                );
                hideResults();
                return;
            }

            const invalid = addresses.find(a => !isValidAddress(a));
            if (invalid) {
                setStatus(`Invalid address: ${invalid}`, "error");
                hideResults();
                return;
            }

            fetchWallet(addresses);
        };

        console.log("[EXPLORER_WALLET] initialized");
    }

    // 👉 single, controlled export
    window.loadExplorerWallet = loadExplorerWallet;

})();
