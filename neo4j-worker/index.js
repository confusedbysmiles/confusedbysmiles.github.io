// ============================================
// CLOUDFLARE WORKER - Dissertation Tracker Neo4j Proxy
// ============================================
// Routes:
//   GET  /health        → connectivity check
//   POST /entry         → save one entry as a Neo4j node
//   GET  /entries       → retrieve all entry nodes
//   POST /query         → run arbitrary Cypher (advanced)
//
// Required secrets (set via `wrangler secret put`):
//   NEO4J_URI       e.g. neo4j+s://22fda3fb.databases.neo4j.io
//   NEO4J_USERNAME  e.g. 22fda3fb
//   NEO4J_PASSWORD  e.g. KMC3uvH9D-40GG-18DSu0g_Tj9n2O971wIqTqIOKTcQ
//   NEO4J_DATABASE  e.g. 22fda3fb
//
// Neo4j Aura HTTP Transactional Cypher API is used because
// Cloudflare Workers cannot open raw TCP/Bolt connections.
// ============================================

export default {
    async fetch(request, env) {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === '/health' && request.method === 'GET') {
                return await handleHealth(env);
            }
            if (path === '/entry' && request.method === 'POST') {
                return await handleSaveEntry(request, env);
            }
            if (path === '/entries' && request.method === 'GET') {
                return await handleGetEntries(env);
            }
            if (path === '/query' && request.method === 'POST') {
                return await handleQuery(request, env);
            }
            return jsonResponse({ error: 'Not found' }, 404);
        } catch (err) {
            console.error('Worker error:', err);
            return jsonResponse({ error: 'Internal error', detail: err.message }, 500);
        }
    }
};

// ============================================
// ROUTE HANDLERS
// ============================================

async function handleHealth(env) {
    try {
        const result = await runCypher('RETURN 1 AS ping', {}, env);
        const ping = result.data[0]?.ping;
        return jsonResponse({ status: 'ok', neo4j: ping === 1 ? 'connected' : 'unexpected response' });
    } catch (err) {
        return jsonResponse({ status: 'error', neo4j: err.message }, 502);
    }
}

async function handleSaveEntry(request, env) {
    const body = await request.json();
    const entry = body.entry;

    if (!entry || !entry.id || !entry.type) {
        return jsonResponse({ error: 'entry must have id and type' }, 400);
    }

    // Sanitise: all values must be primitives for Cypher params
    const props = sanitiseEntry(entry);

    const cypher = `
        MERGE (e:Entry { id: $id })
        SET e += $props
        SET e:${labelFor(entry.type)}
        RETURN e.id AS id
    `;

    const result = await runCypher(cypher, { id: entry.id, props }, env);
    return jsonResponse({ saved: result.data[0]?.id ?? entry.id });
}

async function handleGetEntries(env) {
    const cypher = 'MATCH (e:Entry) RETURN properties(e) AS entry ORDER BY e.createdAt DESC';
    const result = await runCypher(cypher, {}, env);
    const entries = result.data.map(row => row.entry);
    return jsonResponse({ entries });
}

async function handleQuery(request, env) {
    const body = await request.json();
    const { cypher, params } = body;

    if (!cypher || typeof cypher !== 'string') {
        return jsonResponse({ error: 'cypher string required' }, 400);
    }

    const result = await runCypher(cypher, params || {}, env);
    return jsonResponse({ data: result.data, columns: result.columns });
}

// ============================================
// NEO4J HTTP TRANSACTIONAL CYPHER
// ============================================

async function runCypher(cypher, params, env) {
    // Derive HTTPS host from the neo4j+s:// URI
    const uri = env.NEO4J_URI || '';
    const host = uri.replace(/^neo4j\+s?:\/\//, '').replace(/\/$/, '');
    const database = env.NEO4J_DATABASE || 'neo4j';

    const endpoint = `https://${host}/db/${database}/tx/commit`;
    const credentials = btoa(`${env.NEO4J_USERNAME}:${env.NEO4J_PASSWORD}`);

    const payload = {
        statements: [
            { statement: cypher, parameters: params }
        ]
    };

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json;charset=UTF-8',
            'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify(payload)
    });

    const json = await res.json();

    if (!res.ok) {
        const msg = json.errors?.[0]?.message || `HTTP ${res.status}`;
        throw new Error(`Neo4j HTTP error: ${msg}`);
    }

    if (json.errors && json.errors.length > 0) {
        throw new Error(`Cypher error: ${json.errors[0].message}`);
    }

    // Flatten results into plain objects
    const result = json.results[0] || { columns: [], data: [] };
    const columns = result.columns;
    const data = result.data.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row.row[i]; });
        return obj;
    });

    return { columns, data };
}

// ============================================
// HELPERS
// ============================================

/**
 * Convert an entry to a flat object with only primitive values
 * so it can be used safely as Cypher parameters.
 */
function sanitiseEntry(entry) {
    const props = {};
    for (const [key, val] of Object.entries(entry)) {
        if (val === null || val === undefined) {
            props[key] = null;
        } else if (Array.isArray(val)) {
            // Neo4j supports string arrays natively
            props[key] = val.map(v => String(v));
        } else if (typeof val === 'object') {
            props[key] = JSON.stringify(val);
        } else {
            props[key] = val;
        }
    }
    return props;
}

/**
 * Map entry.type to a safe Neo4j label (capitalised, no spaces).
 */
function labelFor(type) {
    const labels = {
        memory: 'Memory',
        buildlog: 'BuildLog',
        reflection: 'Reflection'
    };
    return labels[type] || 'Entry';
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}
