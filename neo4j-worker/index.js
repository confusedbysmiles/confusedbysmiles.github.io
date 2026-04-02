/**
 * Neo4j + Claude Chat Cloudflare Worker
 * Routes:
 *   GET  /health         → Neo4j connectivity check
 *   POST /entry          → Save TrackerEntry node
 *   GET  /entries        → Fetch all entries
 *   POST /query          → Raw Cypher
 *   POST /chat           → Claude API conversation turn
 *   POST /conversation   → Save completed conversation to Neo4j
 *
 * Secrets:
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
 *   ANTHROPIC_API_KEY
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
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0].message);
  return data.data || { fields: [], values: [] };
}

function buildSystemPrompt(entry, recentEntries = []) {
  const entryDesc = entry.type === "memory"
    ? `A memory titled "${entry.title}" from ${entry.timeframe || "an unspecified time"}, context: ${entry.context || "unspecified"}.\n"${entry.content || entry.description || ""}"\nEmotional response: ${entry.emotion || entry.emotionalResponse || "not noted"}`
    : `A build log: "${entry.title || entry.what}"\nWhy: "${entry.why || ""}"\nChallenges: "${entry.challenges || "none noted"}"\nQuestions: "${entry.questions || "none noted"}"`;

  let recentCtx = "";
  if (recentEntries.length > 0) {
    recentCtx = "\n\nOther recent entries in their tracker for cross-referencing:\n";
    recentEntries.slice(0, 5).forEach((e, i) => {
      recentCtx += `${i + 1}. [${e.type}] "${e.title || e.what}" — tags: ${(e.tags || []).join(", ")}\n`;
    });
  }

  return `You are a thoughtful dissertation research partner for Sam Servellon, a doctoral student at the University of Nebraska-Lincoln. Their dissertation is titled "Through the Rearview Mirror: Excavating the Biographical Roots of Equity-Focused Mathematics Teaching." It is an autoethnographic concurrent convergent mixed methods study focused on their life experiences from childhood to now as student, teacher, learner, and researcher. This tracker is designed with the intent to collect data in the form of refletions, dialogue, and memories that will serve as data, method, and analysis through the integration a neo4j backend.

The entry Sam just saved:
${entryDesc}
Tags: ${(entry.tags || []).join(", ")}
${recentCtx}

Your role in this conversation:
- Be a genuine research thought partner, not a cheerleader
- Ask probing questions that surface connections between their biography and their pedagogy
- Help them see patterns across entries when relevant
- Push back if something seems underexamined
- Be warm but intellectually rigorous
- Keep responses concise (2-4 sentences max) — this is a conversation, not an essay
- Reference specific details from their entry, don't be generic
- When they seem done, suggest saving the conversation as dissertation data

Start by asking ONE specific, probing question about this entry.`;
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
           context:           entry.context || "",
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

    // POST /chat
    if (request.method === "POST" && url.pathname === "/chat") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { entry, messages = [], recentEntries = [] } = body;
      if (!entry) return json({ error: "Missing entry" }, 400);

      try {
        const systemPrompt = buildSystemPrompt(entry, recentEntries);

        const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type":      "application/json",
            "x-api-key":         env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model:      "claude-sonnet-4-5-20250929",
            max_tokens: 512,
            system:     systemPrompt,
            messages:   messages.length > 0 ? messages : [
              { role: "user", content: "Please start our conversation." }
            ],
          }),
        });

        if (!apiResp.ok) {
          const err = await apiResp.text();
          return json({ error: `Claude API error: ${err}` }, 502);
        }

        const data  = await apiResp.json();
        const reply = data.content?.[0]?.text || "";
        return json({ reply });

      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /conversation
    if (request.method === "POST" && url.pathname === "/conversation") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { entryId, messages = [], summary = "" } = body;
      if (!entryId) return json({ error: "Missing entryId" }, 400);

      const id  = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        await runCypher(env, `
          CREATE (c:Conversation {
            id:        $id,
            entryId:   $entryId,
            messages:  $messages,
            summary:   $summary,
            turnCount: $turnCount,
            createdAt: $createdAt
          })
        `, {
          id,
          entryId,
          messages:  JSON.stringify(messages),
          summary,
          turnCount: messages.length,
          createdAt: now,
        });

        await runCypher(env, `
          MATCH (c:Conversation {id: $id})
          MATCH (e:TrackerEntry  {id: $entryId})
          MERGE (c)-[:REFLECTS_ON]->(e)
        `, { id, entryId });

        return json({ id, saved: true }, 201);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }
      return json({ error: "Not found" }, 404);
    },
  };