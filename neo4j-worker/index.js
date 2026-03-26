/**
 * Neo4j Aura Cloudflare Worker
 * Uses the Neo4j 5 HTTP Query API: /db/{database}/query/v2
 * One statement per request — v2 API does not accept batches.
 *
 * Secrets (set via: npx wrangler secret put <NAME>):
 *   NEO4J_URI      – neo4j+s://22fda3fb.databases.neo4j.io
 *   NEO4J_USERNAME – 22fda3fb
 *   NEO4J_PASSWORD – your Aura password
 *   NEO4J_DATABASE – 22fda3fb
 */

const ALLOWED_ORIGINS = [
  "https://www.servellon.net",
  "https://servellon.net",
  "https://confusedbysmiles.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Rate limiting: 120 req/min per IP
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 120;
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > limit;
}

// Neo4j query/v2 helper — one statement at a time
async function runCypher(env, statement, parameters = {}) {
  const host = env.NEO4J_URI.replace(/^neo4j\+s:\/\//, "https://");
  const url  = `${host}/db/${env.NEO4J_DATABASE}/query/v2`;
  const auth = btoa(`${env.NEO4J_USERNAME}:${env.NEO4J_PASSWORD}`);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify({ statement, parameters }),
  });

  const data = await resp.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message);
  }

  // v2 returns { data: { fields: [...], values: [[...], ...] } }
  return data.data || { fields: [], values: [] };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors   = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status, headers: { ...cors, "Content-Type": "application/json" },
      });

    // GET /health
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        await runCypher(env, "RETURN 1 AS ok");
        return json({ status: "ok", neo4j: "connected" });
      } catch (err) {
        return json({ status: "error", neo4j: err.message }, 500);
      }
    }

    // POST /entry — save a TrackerEntry + wire Era + Theme nodes
    if (request.method === "POST" && url.pathname === "/entry") {
      let entry;
      try { entry = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const id  = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        // 1. Create the TrackerEntry node
        await runCypher(env, `
          CREATE (e:TrackerEntry {
            id:                $id,
            type:              $type,
            title:             $title,
            content:           $content,
            context:           $context,
            tags:              $tags,
            emotionalResponse: $emotionalResponse,
            date:              $date,
            createdAt:         $createdAt
          })
        `, {
          id,
          type:              entry.type              || "memory",
          title:             entry.title             || "",
          content:           entry.content || entry.description || entry.what || "",
          context:           entry.context           || "",
          tags:              entry.tags              || [],
          emotionalResponse: entry.emotionalResponse || "",
          date:              entry.date              || now,
          createdAt:         now,
        });

        // 2. Wire Era relationship
        if (entry.context) {
          await runCypher(env, `
            MATCH (e:TrackerEntry {id: $id})
            MERGE (era:Era {name: $era})
            MERGE (e)-[:SITUATED_IN]->(era)
          `, { id, era: entry.context });
        }

        // 3. Wire Theme relationships for each tag
        for (const tag of (entry.tags || [])) {
          await runCypher(env, `
            MATCH (e:TrackerEntry {id: $id})
            MERGE (t:Theme {name: $tag})
            MERGE (e)-[:SURFACES]->(t)
          `, { id, tag });
        }

        return json({ id, saved: true }, 201);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // GET /entries — fetch all TrackerEntry nodes
    if (request.method === "GET" && url.pathname === "/entries") {
      try {
        const result = await runCypher(env, `
          MATCH (e:TrackerEntry)
          OPTIONAL MATCH (e)-[:SITUATED_IN]->(era:Era)
          OPTIONAL MATCH (e)-[:SURFACES]->(t:Theme)
          RETURN e, era.name AS era, collect(t.name) AS themes
          ORDER BY e.createdAt DESC
        `);

        const fields = result.fields;
        const entries = result.values.map(row => {
          const node   = row[fields.indexOf("e")];
          const props  = node.properties || node;
          return {
            ...props,
            era:    row[fields.indexOf("era")],
            themes: row[fields.indexOf("themes")] || [],
          };
        });

        return json({ entries });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /query — run raw Cypher (one statement)
    if (request.method === "POST" && url.pathname === "/query") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      if (!body.statement) return json({ error: "Missing statement" }, 400);

      try {
        const result = await runCypher(env, body.statement, body.parameters || {});
        return json({ result });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
