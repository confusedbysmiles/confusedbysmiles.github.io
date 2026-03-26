// ============================================
// NEO4J CLIENT - Dissertation Tracker
// ============================================
// Exposes window.Neo4j with:
//   saveEntry(entry)  → write a node to Neo4j
//   getEntries()      → read all entry nodes
//   query(cypher, params) → run arbitrary Cypher
//   health()          → check worker/Neo4j connectivity
//
// The Cloudflare Worker proxies all requests to
// Neo4j Aura so credentials never touch the browser.
// localStorage remains the source of truth for the UI;
// all Neo4j writes are fire-and-forget.
// ============================================

const WORKER_URL = "https://dissertation-neo4j.math-generator.workers.dev";

const Neo4j = (() => {

    async function _post(path, body) {
        const res = await fetch(WORKER_URL + path, {
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
        const res = await fetch(WORKER_URL + path);
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
        return _post('/entry', { entry });
    }

    /**
     * Retrieve all entries from Neo4j.
     * @returns {Promise<Array>}
     */
    function getEntries() {
        return _get('/entries');
    }

    /**
     * Run an arbitrary Cypher query via the worker.
     * @param {string} cypher
     * @param {Object} params
     * @returns {Promise<Object>}
     */
    function query(cypher, params = {}) {
        return _post('/query', { cypher, params });
    }

    /**
     * Check worker and Neo4j connectivity.
     * @returns {Promise<{status: string, neo4j: string}>}
     */
    function health() {
        return _get('/health');
    }

    return { saveEntry, getEntries, query, health };
})();

window.Neo4j = Neo4j;
