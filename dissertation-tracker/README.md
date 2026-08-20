# Dissertation Tracker - Autoethnography Tool

A web-based autoethnography tracker for documenting formative memories, build decisions, and reflective connections during dissertation research.

Built for TEAC 882B: Advanced Web Design and Databases.

## What It Does

- **Converse** — Talk with Claude about a memory or build decision; the conversation is the capture mechanism. When a thought feels complete, the backend extracts it into a structured draft entry.
- **Timeline** — Visual timeline of all entries, filterable by type and tag, with search.
- **Review** — Draft entries land unapproved. Edit and approve them here before they count as data.
- **All Entries** — Embedded graph view (`graph-viewer.html`) of entries and their relationships in Neo4j.
- **Build History** — Recent commits touching `dissertation-tracker/`, pulled live from the GitHub API.
- **File attachments** — Attach a file to a conversation turn; it's stored in R2 and Claude reads it in context.
- **Accounts** — Login is required to write. New accounts are requested and then admin-approved.

## Quick Start

1. The tracker is deployed at `www.drseim.com/dissertation-tracker/`
2. Log in (writes require a session token), open **Converse**, and start talking.
3. Visit **Review** to approve extracted drafts — unapproved entries are not yet real data.

## File Structure

```
dissertation-tracker/
├── index.html          # Main interface (single-page app with tabs)
├── about.html          # Project write-up / architecture documentation
├── graph-viewer.html   # Neo4j graph visualization (embedded in All Entries)
├── tracker.js          # Frontend logic — tabs, converse, timeline, review
├── tracker.css         # Styles (extends sam-seim-styles.css)
├── neo4j-client.js     # window.Neo4j — wraps the worker's data endpoints
├── auth.js             # window.Auth — session tokens, login, admin approval
├── component-loader.js # Shared header/footer injection
└── README.md           # This file
```

The backend is **not in this repo** — see [Backend](#backend).

## Storage

Two layers:

- **Neo4j Aura** — the source of truth, reached through the Cloudflare Worker so database credentials never touch the browser.
- **localStorage** under `dissertation-tracker-entries` — a local mirror and offline fallback.

**Reads** come from Neo4j; `renderTimeline()` falls back to localStorage only if the worker is unreachable (look for `[Timeline] Neo4j unavailable` in the console). This is why the timeline populates correctly on a device that has never been used before.

**Writes** go to localStorage first, then fire-and-forget to Neo4j. If the worker or database is down the UI still looks like it saved, but **that write may not have been persisted** — check `/health` after any session where saves looked slow or errored.

> There is currently **no Export/Import or CSV download** in the app. Earlier versions had one; it was removed. Backups mean a Neo4j Aura snapshot, not a button in the UI. If you're on Aura Free, note that instances auto-pause after 3 days idle and are **deleted 30 days after pausing** — a paused instance shows up as `error code: 1016` from `/health`.

## Backend

All server-side code and every credential live in a separate repository:

```
confusedbysmiles.github.io/cloudflare-workers/neo4j-worker/
```

That deploys the **`dissertation-neo4j`** worker at `https://dissertation-neo4j.math-generator.workers.dev`, which handles Neo4j proxying, Claude conversation turns and entry extraction, KV-backed session auth, and R2 file storage. Endpoints the frontend calls: `/chat`, `/chat/extract`, `/chat/with-file`, `/conversation`, `/entry`, `/entries`, `/upload`, `/auth/*`, `/health`.

Secrets are wrangler secrets on that worker — never in this repo, never in client code:

```
NEO4J_URI  NEO4J_USERNAME  NEO4J_PASSWORD  NEO4J_DATABASE  ANTHROPIC_API_KEY
```

To rotate one:

```bash
cd ../cloudflare-workers/neo4j-worker && wrangler secret put ANTHROPIC_API_KEY
```

Wrangler rolls out a new worker version automatically — no `wrangler deploy` needed for a secret change.

Quick triage: `/chat` uses `ANTHROPIC_API_KEY` and never touches the database, so it isolates an API-key problem from a Neo4j problem.

```bash
curl -s https://dissertation-neo4j.math-generator.workers.dev/health
```

## Data Format

Fields the current code reads or writes:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Generated client-side |
| `type` | `"memory"` / `"buildlog"` / `"reflection"` / `"coding"` | Editable in Review |
| `title` | string | |
| `content` | string | Main body text |
| `createdAt` | ISO date string | When the entry was captured |
| `sortDate` | ISO date string | Parsed from `timeframe`; orders the timeline |
| `timeframe` | string | Free-text period ("summer after 4th grade") |
| `context` | string | e.g. `"As a Learner"` |
| `emotion` | string | Emotional response |
| `tags` | string[] | |
| `approved` | boolean | `false` until approved in Review |
| `prompt` | string | Reflection entries |

Older entries may carry `description` (→ `content`), `emotionalResponse` (→ `emotion`), `what`, and `date`. The code falls back to these on read but no longer writes them.

## Cost

- Static frontend on GitHub Pages: free
- Neo4j Aura Free tier: free
- Claude API: roughly a cent or two per conversation, billed per turn (Sonnet, 512 max tokens per reply)

## Tips for Consistent Use

1. Bookmark `www.drseim.com/dissertation-tracker/` and keep the tab open
2. Use **Converse** for capture — talking is lower friction than filling in a form
3. Clear the **Review** queue regularly; unapproved drafts aren't data yet
4. Flag anything that needs more thought — it resurfaces via `/entries/unresolved`
5. Keep the Aura instance awake, or expect the 3-day auto-pause
