/**
 * Neo4j + Claude Chat Cloudflare Worker
 * Routes:
 *   GET  /health                    → Neo4j connectivity check
 *   POST /entry/:id/approve         → Approve (and update) a TrackerEntry
 *   POST /entry                     → Save TrackerEntry node (auth required)
 *   GET  /entries/unapproved        → Fetch entries where approved = false
 *   GET  /entries                   → Fetch all entries
 *   POST /query                     → Raw Cypher
 *   POST /chat                      → Claude API conversation turn
 *   POST /chat/extract              → Extract structured entry from conversation
 *   POST /conversation              → Save completed conversation to Neo4j
 *   POST /conversation/:id/pin      → Pin a conversation for later resumption
 *   GET  /conversations/pinned      → Fetch all pinned conversations
 *   POST /entry/:id/flag-unresolved → Flag an entry as needing more examination
 *   GET  /entries/unresolved        → Fetch entries flagged as unresolved
 *   POST /auth/login                → Validate credentials, return session token
 *   POST /auth/register-request     → Submit an account request for admin review
 *   POST /auth/admin/requests       → Admin: list pending requests
 *   POST /auth/admin/approve        → Admin: approve or reject a request
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
 */

const ALLOWED_ORIGINS = [
  "https://www.servellon.net",
  "https://servellon.net",
  "https://confusedbysmiles.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin) {
  if (!origin) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
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

// System prompt when Sam opens a fresh conversation (no entry context)
function buildFreshSystemPrompt(allEntries = []) {
  const allEntriesJson = JSON.stringify(allEntries);
  return `You are a thoughtful dissertation research partner for Sam Servellon, a doctoral student at the University of Nebraska-Lincoln. Their dissertation is titled "Through the Rearview Mirror: Excavating the Biographical Roots of Equity-Focused Mathematics Teaching." It is an autoethnographic concurrent convergent mixed methods study focused on their life experiences from childhood to now as student, teacher, learner, and researcher.
They document formative memories and build decisions — this tracker data IS their quantitative research strand.

You have access to all of Sam's existing entries:
${allEntriesJson}

Your job is to have a natural research conversation. You might:
- Ask about formative experiences with math, teaching, or technology
- Surface connections between what they're sharing and existing entries
- Help them articulate things they haven't named yet
- Ask follow-up questions that deepen the reflection

Keep responses concise (2-4 sentences). Be a thought partner, not a therapist.
When the conversation feels complete, say something like:
'This feels like a complete thought — want me to draft this as an entry for your review?'

MISSING CONNECTIONS:
You have access to all entries in the database. As you converse, actively look for
entries that share themes, tags, timeframes, or emotional resonance but are NOT
already linked in the graph. When you notice one, say something like:
'Something you just said reminds me of [entry title] — I don't think those two
are connected yet in your graph. Is there a relationship worth naming there?'
Do this at most once per conversation — don't turn every exchange into a pattern-matching exercise.`;
}

// System prompt for reflection on a specific saved entry
function buildSystemPrompt(entry, recentEntries = [], sessionContext = {}) {
  const { pinnedConversation = null, unresolvedEntries = [] } = sessionContext;

  const entryDesc = entry.type === "coding"
    ? `A git commit from ${entry.date}: "${entry.title}"
${entry.content ? `Commit notes: "${entry.content}"` : ""}
${entry.url ? `View on GitHub: ${entry.url}` : ""}

This is a moment in the build history of the dissertation tracker itself.`
    : entry.type === "memory"
    ? `A memory titled "${entry.title}" from ${entry.timeframe || "an unspecified time"}, context: ${entry.context || "unspecified"}.\n"${entry.content || entry.description || ""}"\nEmotional response: ${entry.emotion || entry.emotionalResponse || "not noted"}`
    : `A build log: "${entry.title || entry.what}"\nWhy: "${entry.why || ""}"\nChallenges: "${entry.challenges || "none noted"}"\nQuestions: "${entry.questions || "none noted"}"`;

  const openingInstruction = entry.type === "coding"
    ? `Start by asking ONE specific question about what this build decision or moment reveals about the researcher's relationship to the work — not what was built, but what it meant to build it.`
    : `Start by asking ONE specific, probing question about this entry.`;
  let recentCtx = "";
  if (recentEntries.length > 0) {
    recentCtx = "\n\nOther recent entries in their tracker for cross-referencing:\n";
    recentEntries.slice(0, 5).forEach((e, i) => {
      recentCtx += `${i + 1}. [${e.type}] "${e.title || e.what}" — tags: ${(e.tags || []).join(", ")}\n`;
    });
  }

  let pinnedSection = "";
  if (pinnedConversation) {
    pinnedSection = `RESUMING A PINNED CONVERSATION:
The last conversation was paused with this note: '${pinnedConversation.pinContext}'
Previous messages are included in the conversation history below.
Pick up naturally from where things left off.\n\n`;
  }

  let unresolvedSection = "";
  if (unresolvedEntries.length > 0) {
    unresolvedSection = `\nUNRESOLVED THREADS TO SURFACE WHEN RELEVANT:
The following entries were flagged as needing more examination:
${unresolvedEntries.map(e => `- ${e.title}: ${e.unresolvedNote}`).join("\n")}
When the conversation naturally touches on these themes, gently surface them.
Don't force it — wait for an opening.`;
  }

  return `${pinnedSection}You are a thoughtful dissertation research partner for Sam Servellon, a doctoral student at the University of Nebraska-Lincoln. Their dissertation is titled "Through the Rearview Mirror: Excavating the Biographical Roots of Equity-Focused Mathematics Teaching." It is an autoethnographic concurrent convergent mixed methods study focused on their life experiences from childhood to now as student, teacher, learner, and researcher.

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

${openingInstruction}${unresolvedSection}

MISSING CONNECTIONS:
You have access to all entries in the database. As you converse, actively look for
entries that share themes, tags, timeframes, or emotional resonance but are NOT
already linked in the graph. When you notice one, say something like:
'Something you just said reminds me of [entry title] — I don't think those two
are connected yet in your graph. Is there a relationship worth naming there?'
Do this at most once per conversation — don't turn every exchange into a pattern-matching exercise.`;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(password);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateToken(env, token) {
  if (!token) return null;
  try {
    const raw = await env.AUTH_KV.get(`session:${token}`);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      env.AUTH_KV.delete(`session:${token}`).catch(() => {});
      return null;
    }
    return { username: session.username, role: session.role };
  } catch {
    return null;
  }
}

// ── Entry row mapper (shared between /entries and /entries/unapproved) ────────
function mapEntryRows(result) {
  const fields = result.fields;
  return result.values.map(row => {
    const node  = row[fields.indexOf("e")];
    const props = node._properties || node.properties || node;
    return {
      ...props,
      era:    row[fields.indexOf("era")],
      themes: row[fields.indexOf("themes")] || [],
    };
  });
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

    // ── GET /health ────────────────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        await runCypher(env, "RETURN 1 AS ok");
        return json({ status: "ok", neo4j: "connected" });
      } catch (err) {
        return json({ status: "error", neo4j: err.message }, 500);
      }
    }

    // ── POST /entry/:id/approve ─────────────────────────────────────────────
    // Update all fields from body, then set approved = true
    const approveMatch = url.pathname.match(/^\/entry\/([^/]+)\/approve$/);
    if (request.method === "POST" && approveMatch) {
      const entryId = approveMatch[1];

      const authHeader = request.headers.get("Authorization") || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const sessionUser = await validateToken(env, bearerToken);
      if (!sessionUser) {
        return json({ error: "Unauthorized" }, 401);
      }

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      try {
        await runCypher(env, `
          MATCH (e:TrackerEntry {id: $id})
          SET e.approved        = true,
              e.type            = $type,
              e.title           = $title,
              e.content         = $content,
              e.context         = $context,
              e.tags            = $tags,
              e.emotionalResponse = $emotionalResponse,
              e.emotion         = $emotion,
              e.timeframe       = $timeframe
        `, {
          id:                entryId,
          type:              body.type              || "memory",
          title:             body.title             || "",
          content:           body.content           || body.description || "",
          context:           body.context           || "",
          tags:              body.tags              || [],
          emotionalResponse: body.emotion           || body.emotionalResponse || "",
          emotion:           body.emotion           || body.emotionalResponse || "",
          timeframe:         body.timeframe         || "",
        });

        // Re-wire Era relationship
        if (body.context) {
          await runCypher(env, `
            MATCH (e:TrackerEntry {id: $id})
            MERGE (era:Era {name: $era})
            MERGE (e)-[:SITUATED_IN]->(era)
          `, { id: entryId, era: body.context });
        }

        // Re-wire Theme relationships
        for (const tag of (body.tags || [])) {
          await runCypher(env, `
            MATCH (e:TrackerEntry {id: $id})
            MERGE (t:Theme {name: $tag})
            MERGE (e)-[:SURFACES]->(t)
          `, { id: entryId, tag });
        }

        return json({ approved: true });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── POST /entry/:id/flag-unresolved ───────────────────────────────────────
    const flagUnresolvedMatch = url.pathname.match(/^\/entry\/([^/]+)\/flag-unresolved$/);
    if (request.method === "POST" && flagUnresolvedMatch) {
      const entryId = flagUnresolvedMatch[1];

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const note = body.note || "";

      try {
        await runCypher(env, `
          MATCH (e:TrackerEntry {id: $id})
          SET e.unresolved = true, e.unresolvedNote = $note
        `, { id: entryId, note });
        return json({ flagged: true });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── POST /entry ────────────────────────────────────────────────────────────
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

      // Use the frontend-provided ID if present so Neo4j and localStorage stay in sync
      const id  = entry.id || crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        await runCypher(env, `
          CREATE (e:TrackerEntry {
            id:                $id,
            type:              $type,
            title:             $title,
            content:           $content,
            context:           $context,
            tags:              $tags,
            emotionalResponse: $emotionalResponse,
            emotion:           $emotion,
            date:              $date,
            timeframe:         $timeframe,
            createdAt:         $createdAt,
            approved:          $approved
          })
        `, {
          id,
          type:              entry.type              || "memory",
          title:             entry.title             || "",
          content:           entry.content || entry.description || entry.what || "",
          context:           entry.context           || "",
          tags:              entry.tags              || [],
          emotionalResponse: entry.emotion || entry.emotionalResponse || "",
          emotion:           entry.emotion || entry.emotionalResponse || "",
          date:              entry.date              || now,
          timeframe:         entry.timeframe         || "",
          createdAt:         entry.createdAt         || now,
          approved:          entry.approved !== undefined ? entry.approved : false,
        });

        // Wire Era relationship
        if (entry.context) {
          await runCypher(env, `
            MATCH (e:TrackerEntry {id: $id})
            MERGE (era:Era {name: $era})
            MERGE (e)-[:SITUATED_IN]->(era)
          `, { id, era: entry.context });
        }

        // Wire Theme relationships
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

    // ── GET /entries/unresolved ────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/entries/unresolved") {
      try {
        const result = await runCypher(env, `
          MATCH (e:TrackerEntry)
          WHERE e.unresolved = true
          RETURN e
          ORDER BY e.createdAt DESC
        `);
        const fields = result.fields;
        const entries = result.values.map(row => {
          const node  = row[fields.indexOf("e")];
          const props = node._properties || node.properties || node;
          return {
            id:             props.id,
            title:          props.title,
            type:           props.type,
            unresolvedNote: props.unresolvedNote || "",
            createdAt:      props.createdAt,
          };
        });
        return json({ entries });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── GET /entries/unapproved ────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/entries/unapproved") {
      try {
        const result = await runCypher(env, `
          MATCH (e:TrackerEntry)
          WHERE e.approved = false
          OPTIONAL MATCH (e)-[:SITUATED_IN]->(era:Era)
          OPTIONAL MATCH (e)-[:SURFACES]->(t:Theme)
          RETURN e, era.name AS era, collect(t.name) AS themes
          ORDER BY e.createdAt DESC
        `);
        return json({ entries: mapEntryRows(result) });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── GET /entries ───────────────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/entries") {
      try {
        const result = await runCypher(env, `
          MATCH (e:TrackerEntry)
          OPTIONAL MATCH (e)-[:SITUATED_IN]->(era:Era)
          OPTIONAL MATCH (e)-[:SURFACES]->(t:Theme)
          RETURN e, era.name AS era, collect(t.name) AS themes
          ORDER BY e.createdAt DESC
        `);
        return json({ entries: mapEntryRows(result) });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── POST /query ────────────────────────────────────────────────────────────
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

    // ── POST /chat ─────────────────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/chat") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { entry, messages = [], allEntries = [], sessionContext = {} } = body;

      // Fresh conversation (no entry context) uses the full dissertation prompt
      const systemPrompt = entry
        ? buildSystemPrompt(entry, allEntries, sessionContext)
        : buildFreshSystemPrompt(allEntries);

      try {
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

    // ── POST /chat/extract ─────────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/chat/extract") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { messages = [] } = body;
      if (messages.length === 0) return json({ error: "No messages to extract from" }, 400);

      const extractSystemPrompt = `You are extracting structured data from a research conversation.
Return ONLY valid JSON matching this exact shape, no markdown, no explanation:
{ "type": "...", "title": "...", "content": "...", "context": "...", "tags": [...], "emotion": "...", "timeframe": "..." }

Rules:
- type: "memory" if the conversation is about a past experience, "buildlog" if about building/coding
- title: concise, under 80 characters
- content: the full substance of what was discussed, written as a cohesive narrative (not bullet points)
- context: must be exactly one of: "As a Student", "As a Teacher", "As a Researcher", "Personal"
- tags: array of strings, only use tags from the approved list, pick all that apply
- emotion: 1-3 words describing the emotional tone
- timeframe: approximate time period if mentioned (e.g. "Fall 2015", "2023"), empty string if not mentioned

Approved tags: equity, access, technology, math, agency, curriculum, identity, frustration, breakthrough, mentor, feature, bug fix, design choice, pedagogy, student voice, accessibility, AI integration, pivot`;

      const transcript = messages
        .map(m => `${m.role === "user" ? "Sam" : "Claude"}: ${m.content}`)
        .join("\n\n");

      try {
        const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type":      "application/json",
            "x-api-key":         env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model:      "claude-sonnet-4-6",
            max_tokens: 1024,
            system:     extractSystemPrompt,
            messages:   [{
              role:    "user",
              content: "Extract structured data from this conversation:\n\n" + transcript,
            }],
          }),
        });

        if (!apiResp.ok) {
          const err = await apiResp.text();
          return json({ error: `Claude API error: ${err}` }, 502);
        }

        const data = await apiResp.json();
        const text = data.content?.[0]?.text || "{}";

        let entry;
        try {
          entry = JSON.parse(text);
        } catch {
          // Claude occasionally wraps JSON in markdown fences — strip and retry
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            entry = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Failed to parse JSON from Claude response");
          }
        }

        return json({ entry });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── POST /conversation ─────────────────────────────────────────────────────
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
            id:         $id,
            entryId:    $entryId,
            messages:   $messages,
            summary:    $summary,
            turnCount:  $turnCount,
            createdAt:  $createdAt,
            pinned:     false,
            pinContext: ""
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

    // ── POST /conversation/:id/pin ─────────────────────────────────────────────
    const pinConvMatch = url.pathname.match(/^\/conversation\/([^/]+)\/pin$/);
    if (request.method === "POST" && pinConvMatch) {
      const convId = pinConvMatch[1];

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const pinContext = body.pinContext || "";

      try {
        await runCypher(env, `
          MATCH (c:Conversation {id: $id})
          SET c.pinned = true, c.pinContext = $pinContext
        `, { id: convId, pinContext });
        return json({ pinned: true });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── GET /conversations/pinned ──────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/conversations/pinned") {
      try {
        const result = await runCypher(env, `
          MATCH (c:Conversation)
          WHERE c.pinned = true
          OPTIONAL MATCH (c)-[:REFLECTS_ON]->(e:TrackerEntry)
          RETURN c, e.title AS entryTitle
          ORDER BY c.createdAt DESC
        `);
        const fields = result.fields;
        const conversations = result.values.map(row => {
          const node  = row[fields.indexOf("c")];
          const props = node._properties || node.properties || node;
          let messages = [];
          try { messages = JSON.parse(props.messages || "[]"); } catch { /* leave empty */ }
          return {
            id:           props.id,
            pinContext:   props.pinContext || "",
            createdAt:    props.createdAt,
            entryTitle:   row[fields.indexOf("entryTitle")] || null,
            messages,
          };
        });
        return json({ conversations });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── AUTH ROUTES ────────────────────────────────────────────────────────────

    // POST /auth/login
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

    // POST /auth/register-request
    if (request.method === "POST" && url.pathname === "/auth/register-request") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { name, username, email, reason } = body;
      if (!name || !username || !email || !reason) {
        return json({ error: "name, username, email, and reason are required" }, 400);
      }

      try {
        const existing = await env.AUTH_KV.get(`user:${username}`);
        if (existing) return json({ error: "Username already taken" }, 409);

        const id = crypto.randomUUID();
        await env.AUTH_KV.put(`request:${id}`, JSON.stringify({
          id, name, username, email, reason,
          createdAt: new Date().toISOString(),
          status: "pending",
        }));

        return json({ id, submitted: true }, 201);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /auth/admin/requests
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

    // POST /auth/admin/approve
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

          const existing = await env.AUTH_KV.get(`user:${req.username}`);
          if (existing) return json({ error: "Username already taken" }, 409);

          const passwordHash = await hashPassword(password);
          await env.AUTH_KV.put(`user:${req.username}`, JSON.stringify({
            username:  req.username,
            passwordHash,
            email:     req.email,
            role:      "user",
            approved:  true,
            createdAt: new Date().toISOString(),
          }));
        }

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
