/**
 * Neo4j + Claude Chat Cloudflare Worker
 * Routes:
 *   GET  /health                  → Neo4j connectivity check
 *   POST /entry                   → Save TrackerEntry node (auth required)
 *   GET  /entries                 → Fetch all entries
 *   POST /query                   → Raw Cypher
 *   POST /chat                    → Claude API conversation turn
 *   POST /conversation            → Save completed conversation to Neo4j
 *   POST /auth/login              → Validate credentials, return session token
 *   POST /auth/register-request   → Submit an account request for admin review
 *   POST /auth/admin/requests     → Admin: list pending requests
 *   POST /auth/admin/approve      → Admin: approve or reject a request
 *
 * Secrets:
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
 *   ANTHROPIC_API_KEY
 *
 * DEPLOYMENT NOTE:
 *   Add the following KV namespace binding to wrangler.toml before deploying:
 *
 *   [[kv_namespaces]]
 *   binding = "AUTH_KV"
 *   id      = "<your-kv-namespace-id>"
 *
 *   Create the namespace with: wrangler kv:namespace create AUTH_KV
 *
 *   To create the initial admin account, run this one-time wrangler command
 *   (replace <passwordHash> with the SHA-256 hex of your chosen password,
 *   or use the seed script below):
 *
 *   wrangler kv:key put --namespace-id=<id> "user:sam" \
 *     '{"username":"sam","passwordHash":"<sha256hex>","email":"sam@example.com","role":"admin","approved":true,"createdAt":"<iso>"}'
 *
 *   Quick way to get the SHA-256 hash of a password (Node.js):
 *     node -e "const c=require('crypto');process.stdout.write(c.createHash('sha256').update('yourpassword').digest('hex')+'\n')"
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  const host = env.NEO4J_URI
    .replace(/^neo4j\+s:\/\//, "https://")
    .replace(/^neo4j:\/\//, "http://")
    .replace(/^bolt\+s:\/\//, "https://")
    .replace(/^bolt:\/\//, "http://");
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

  return `You are a thoughtful dissertation research partner for Sam Seim, a doctoral student at the University of Nebraska-Lincoln. Their dissertation is titled "Through the Rearview Mirror: Excavating the Biographical Roots of Equity-Focused Mathematics Teaching." It is an autoethnographic concurrent convergent mixed methods study focused on their life experiences from childhood to now as student, teacher, learner, and researcher. This tracker is designed with the intent to collect data in the form of refletions, dialogue, and memories that will serve as data, method, and analysis through the integration a neo4j backend.

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

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a password string using the Web Crypto API.
 * Returns lowercase hex string.
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(password);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a session token stored in AUTH_KV.
 * Returns { username, role } if valid and not expired, otherwise null.
 */
async function validateToken(env, token) {
  if (!token) return null;
  try {
    const raw = await env.AUTH_KV.get(`session:${token}`);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      // Clean up expired session lazily
      env.AUTH_KV.delete(`session:${token}`).catch(() => {});
      return null;
    }
    return { username: session.username, role: session.role };
  } catch {
    return null;
  }
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

    // POST /entry — save a TrackerEntry + wire Era + Theme nodes (auth required)
    if (request.method === "POST" && url.pathname === "/entry") {
      const authHeader = request.headers.get("Authorization") || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const sessionUser = await validateToken(env, bearerToken);
      if (!sessionUser) {
        return json({ error: "Unauthorized" }, 401);
      }

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
          const props  = node._properties || node.properties || node;
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
            model:      "claude-sonnet-4-6",
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
    // ── AUTH ROUTES ────────────────────────────────────────────────────────────

    // POST /auth/login — body: { username, password }
    // Returns { token, username, role } or 401
    if (request.method === "POST" && url.pathname === "/auth/login") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { username, password } = body;
      if (!username || !password) return json({ error: "username and password required" }, 400);

      try {
        const raw = await env.AUTH_KV.get(`user:${username}`);
        if (!raw) return json({ error: "Invalid credentials" }, 401);

        const user = JSON.parse(raw);
        if (!user.approved) return json({ error: "Account not yet approved" }, 403);

        const hash = await hashPassword(password);
        if (hash !== user.passwordHash) return json({ error: "Invalid credentials" }, 401);

        // Create a 24-hour session token
        const token     = crypto.randomUUID();
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        await env.AUTH_KV.put(`session:${token}`, JSON.stringify({
          username: user.username,
          role:     user.role,
          expiresAt,
        }), { expirationTtl: 86400 });

        return json({ token, username: user.username, role: user.role });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /auth/register-request — body: { name, username, email, reason }
    // Stores a pending account request for admin review. Returns 201.
    if (request.method === "POST" && url.pathname === "/auth/register-request") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { name, username, email, reason } = body;
      if (!name || !username || !email || !reason) {
        return json({ error: "name, username, email, and reason are required" }, 400);
      }

      // Reject if username is already taken
      try {
        const existing = await env.AUTH_KV.get(`user:${username}`);
        if (existing) return json({ error: "Username already taken" }, 409);

        const id = crypto.randomUUID();
        await env.AUTH_KV.put(`request:${id}`, JSON.stringify({
          id,
          name,
          username,
          email,
          reason,
          createdAt: new Date().toISOString(),
          status: "pending",
        }));

        return json({ id, submitted: true }, 201);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /auth/admin/requests — body: { token }
    // Admin only. Returns { requests: [...] } of pending requests.
    if (request.method === "POST" && url.pathname === "/auth/admin/requests") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const sessionUser = await validateToken(env, body.token);
      if (!sessionUser || sessionUser.role !== "admin") {
        return json({ error: "Forbidden" }, 403);
      }

      try {
        const list = await env.AUTH_KV.list({ prefix: "request:" });
        const requests = await Promise.all(
          list.keys.map(async k => {
            const raw = await env.AUTH_KV.get(k.name);
            return raw ? JSON.parse(raw) : null;
          })
        );
        const pending = requests
          .filter(r => r && r.status === "pending")
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return json({ requests: pending });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /auth/admin/approve — body: { token, requestId, action: "approve"|"reject", password }
    // Admin only. On approve, creates the user account and marks request approved.
    if (request.method === "POST" && url.pathname === "/auth/admin/approve") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { token, requestId, action, password } = body;

      const sessionUser = await validateToken(env, token);
      if (!sessionUser || sessionUser.role !== "admin") {
        return json({ error: "Forbidden" }, 403);
      }

      if (action !== "approve" && action !== "reject") {
        return json({ error: "action must be 'approve' or 'reject'" }, 400);
      }

      try {
        const raw = await env.AUTH_KV.get(`request:${requestId}`);
        if (!raw) return json({ error: "Request not found" }, 404);

        const req = JSON.parse(raw);
        if (req.status !== "pending") {
          return json({ error: "Request already processed" }, 409);
        }

        if (action === "approve") {
          if (!password) return json({ error: "password required to approve" }, 400);

          // Check username isn't already in use
          const existing = await env.AUTH_KV.get(`user:${req.username}`);
          if (existing) return json({ error: "Username already taken" }, 409);

          const passwordHash = await hashPassword(password);
          await env.AUTH_KV.put(`user:${req.username}`, JSON.stringify({
            username:     req.username,
            passwordHash,
            email:        req.email,
            role:         "user",
            approved:     true,
            createdAt:    new Date().toISOString(),
          }));
        }

        // Update the request status
        req.status = action === "approve" ? "approved" : "rejected";
        await env.AUTH_KV.put(`request:${requestId}`, JSON.stringify(req));

        return json({ success: true, action });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
    },
  };