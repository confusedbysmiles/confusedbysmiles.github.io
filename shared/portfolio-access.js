// ============================================
// PORTFOLIO ACCESS
// ============================================
// Gated course artifacts live in R2 under portfolio/ and are served by the
// worker's authenticated GET /portfolio/* route. Nothing gated is in this
// repo, so there is no content on the page to hide — the card is a stub and
// the bytes only ever arrive over an authorised fetch.
//
// Self-contained on purpose: the tracker's auth.js depends on WORKER_URL from
// neo4j-client.js and on modal CSS in tracker.css. This shares the worker and
// the session token with the tracker but none of its code.
// ============================================

const PortfolioAccess = (() => {
    const WORKER_URL = "https://dissertation-neo4j.math-generator.workers.dev";
    const TOKEN_KEY = "AUTH_TOKEN";   // same key the tracker uses; one login covers both
    const USER_KEY = "AUTH_USER";

    let pendingKey = null;            // artifact requested before logging in

    const $ = (id) => document.getElementById(id);
    const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };

    function show(id) {
        const el = $(id);
        if (el) { el.hidden = false; document.body.style.overflow = "hidden"; }
    }
    function hideAll() {
        ["pa-login", "pa-request"].forEach((id) => { const el = $(id); if (el) el.hidden = true; });
        document.body.style.overflow = "";
    }

    // Fetch a gated artifact and hand it to the browser.
    async function open(key, label) {
        if (!token()) { pendingKey = { key, label }; show("pa-login"); return; }
        try {
            const resp = await fetch(`${WORKER_URL}/portfolio/${key}`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (resp.status === 401) {
                try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
                pendingKey = { key, label };
                show("pa-login");
                return;
            }
            if (!resp.ok) { alert(`That artifact could not be opened (${resp.status}).`); return; }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = label || key.split("/").pop();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (e) {
            alert("Could not reach the archive. Please try again.");
        }
    }

    async function submitLogin() {
        const err = $("pa-login-error");
        err.textContent = "";
        const username = ($("pa-username").value || "").trim();
        const password = $("pa-password").value || "";
        if (!username || !password) { err.textContent = "Both fields are required."; return; }
        try {
            const resp = await fetch(`${WORKER_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.token) { err.textContent = data.error || "Incorrect username or password."; return; }
            try {
                localStorage.setItem(TOKEN_KEY, data.token);
                localStorage.setItem(USER_KEY, JSON.stringify(data.user || { username }));
            } catch (e) {}
            hideAll();
            if (pendingKey) { const p = pendingKey; pendingKey = null; open(p.key, p.label); }
        } catch (e) {
            err.textContent = "Could not reach the server.";
        }
    }

    async function submitRequest() {
        const err = $("pa-request-error");
        err.textContent = "";
        const payload = {
            name: ($("pa-name").value || "").trim(),
            username: ($("pa-req-username").value || "").trim(),
            email: ($("pa-email").value || "").trim(),
            reason: ($("pa-reason").value || "").trim()
        };
        if (!payload.name || !payload.username || !payload.email) {
            err.textContent = "Name, username and email are required."; return;
        }
        try {
            const resp = await fetch(`${WORKER_URL}/auth/register-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) { err.textContent = data.error || "That request could not be sent."; return; }
            const box = $("pa-request").querySelector(".pa-box");
            box.innerHTML = '<div class="pa-head"><h2>Request sent</h2></div>' +
                '<p class="pa-lede">Thank you. I review these by hand, so it may be a few days.</p>' +
                '<div class="pa-actions"><button type="button" class="pa-btn" data-pa-close>Close</button></div>';
            box.querySelector("[data-pa-close]").addEventListener("click", hideAll);
        } catch (e) {
            err.textContent = "Could not reach the server.";
        }
    }

    function wire() {
        document.querySelectorAll("[data-pa-close]").forEach((b) => b.addEventListener("click", hideAll));
        document.querySelectorAll(".pa-overlay").forEach((o) =>
            o.addEventListener("click", (e) => { if (e.target === o) hideAll(); }));
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideAll(); });

        const to = (from, toId) => { const el = $(from); if (el) el.addEventListener("click", (e) => {
            e.preventDefault(); hideAll(); show(toId); }); };
        to("pa-to-request", "pa-request");
        to("pa-to-login", "pa-login");

        if ($("pa-login-submit")) $("pa-login-submit").addEventListener("click", submitLogin);
        if ($("pa-request-submit")) $("pa-request-submit").addEventListener("click", submitRequest);
        ["pa-username", "pa-password"].forEach((id) => {
            const el = $(id);
            if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(); });
        });

        document.querySelectorAll("[data-gated-key]").forEach((btn) => {
            btn.addEventListener("click", () =>
                open(btn.getAttribute("data-gated-key"), btn.getAttribute("data-gated-label")));
        });
    }

    return { wire, open, showLogin: () => show("pa-login"), showRequest: () => show("pa-request") };
})();
