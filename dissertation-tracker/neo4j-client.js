// ============================================
// NEO4J CLIENT - Dissertation Tracker
// ============================================
// Exposes window.Neo4j with:
//   authFetch(path, init) → fetch a worker route with the session token
//   saveEntry(entry)  → write a node to Neo4j
//   getEntries()      → read all entry nodes
//   deleteEntry(id)   → delete an entry node
//   health()          → check worker/Neo4j connectivity
//
// The Cloudflare Worker proxies all requests to
// Neo4j Aura so credentials never touch the browser.
// Every worker route except /health, /auth/login,
// /auth/register-request and /file/* requires the
// session token, so every call goes through authFetch.
// localStorage remains the source of truth for the UI;
// all Neo4j writes are fire-and-forget.
// ============================================

const WORKER_URL = "https://dissertation-neo4j.math-generator.workers.dev";

const Neo4j = (() => {

    /**
     * fetch() a worker route with `Authorization: Bearer <token>`.
     * With no token it doesn't send the request at all; if the worker rejects
     * a token it has expired, so the session is cleared and login shown.
     * @param {string} path - Route path, e.g. '/chat'.
     * @param {RequestInit} [init]
     * @returns {Promise<Response>}
     */
    async function authFetch(path, init = {}) {
        const token = localStorage.getItem('AUTH_TOKEN');
        if (!token) throw new Error('Not logged in (401)');
        const headers = new Headers(init.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        const res = await fetch(WORKER_URL + path, { ...init, headers });
        if (res.status === 401 && typeof Auth !== 'undefined') Auth.handleUnauthorized();
        return res;
    }

    async function _post(path, body) {
        const res = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Neo4j worker error ${res.status}: ${text}`);
        }
        return res.json();
    }

    async function _get(path) {
        const res = await authFetch(path);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Neo4j worker error ${res.status}: ${text}`);
        }
        return res.json();
    }

    /**
     * Persist a single entry to Neo4j.
     * @param {Object} entry - The entry object (must have an `id` and `type`).
     * @returns {Promise<Object>}
     */
    function saveEntry(entry) {
        return _post('/entry', entry);
    }

    /**
     * Retrieve all entries from Neo4j.
     * @returns {Promise<Array>}
     */
    function getEntries() {
        return _get('/entries');
    }

    /**
     * Delete an entry node and its relationships.
     * @param {string} id
     * @returns {Promise<Object>}
     */
    function deleteEntry(id) {
        return _post(`/entry/${encodeURIComponent(id)}/delete`, {});
    }

    /**
     * Retrieve only unapproved entries (approved = false) from Neo4j.
     * @returns {Promise<{entries: Array}>}
     */
    function getUnapproved() {
        return _get('/entries/unapproved');
    }

    /**
     * Approve an entry, persisting any edits made in the Review tab.
     * @param {string} id - The entry id.
     * @param {Object} entry - The full (possibly edited) entry object.
     * @returns {Promise<Object>}
     */
    function approveEntry(id, entry) {
        return _post(`/entry/${encodeURIComponent(id)}/approve`, entry);
    }

    /**
     * Check worker and Neo4j connectivity (public route, no token).
     * @returns {Promise<{status: string, neo4j: string}>}
     */
    async function health() {
        const res = await fetch(WORKER_URL + '/health');
        if (!res.ok) throw new Error(`Neo4j worker error ${res.status}: ${await res.text()}`);
        return res.json();
    }

    return { authFetch, saveEntry, getEntries, deleteEntry, getUnapproved, approveEntry, health };
})();

window.Neo4j = Neo4j;
