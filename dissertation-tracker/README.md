# Dissertation Tracker - Autoethnography Tool

A web-based autoethnography tracker for documenting formative memories, build decisions, and reflective connections during dissertation research.

Built for TEAC 882B: Advanced Web Design and Databases.

## What It Does

- **Memory Capture** — Log formative experiences with tech, math, and education (flexible dates, tags, emotional responses)
- **Build Log** — Quick-capture development decisions, challenges, and questions for the Math Generator project
- **Timeline View** — Visual timeline of all entries, filterable by type, tag, and search
- **AI Reflection** — Optional Claude-powered reflection prompts that help surface connections between memories and design choices
- **Export/Import** — Download your data as JSON or CSV anytime; import JSON to restore or merge

## Quick Start

1. The tracker is already deployed at `servellon.net/dissertation-tracker/`
2. Open the page and start logging. All data is saved in your browser's localStorage.
3. Use **Export JSON** regularly to back up your data.

## File Structure

```
dissertation-tracker/
├── index.html              # Main interface (single-page app with tabs)
├── tracker.css             # Styles (extends sam-servellon-styles.css)
├── tracker.js              # All frontend logic
├── worker/
│   └── reflection-worker.js  # Cloudflare Worker for AI reflection prompts
└── README.md               # This file
```

## Storage

Data is stored in **localStorage** under the key `dissertation-tracker-entries`. This means:

- Data stays on your browser/device
- Works offline
- No accounts or API keys needed for basic use
- **Back up regularly** using the Export JSON button

### Moving Data Between Devices

1. On the source device: click **Export JSON** in the All Entries tab
2. On the target device: click **Import JSON** and select the file
3. Duplicates (matching IDs) are automatically skipped

## Setting Up AI Reflection Prompts (Optional)

The tracker works fully without AI. To enable Claude-powered reflection prompts:

### 1. Deploy the Cloudflare Worker

```bash
# If you already have a Cloudflare Workers project for the Math Generator,
# you can add this as a new worker in the same account.

# Create a new directory for the worker
mkdir dissertation-reflection && cd dissertation-reflection

# Copy the worker file
cp path/to/dissertation-tracker/worker/reflection-worker.js .

# Create wrangler.toml
cat > wrangler.toml << 'EOF'
name = "dissertation-reflection"
main = "reflection-worker.js"
compatibility_date = "2024-01-01"
EOF

# Set your API key
wrangler secret put ANTHROPIC_API_KEY
# (paste your key when prompted)

# Deploy
wrangler deploy
```

### 2. Update the Tracker

Open `tracker.js` and set the `REFLECTION_API_ENDPOINT` on line 11:

```javascript
const REFLECTION_API_ENDPOINT = 'https://dissertation-reflection.YOUR-SUBDOMAIN.workers.dev';
```

### 3. Use It

After saving any entry, a "Get Reflection Prompt" button appears. Click it to receive a tailored reflection question from Claude. You can write your response and save it as a linked reflection entry.

**Without the API configured**, the tracker falls back to locally-generated reflection prompts that still work well.

## Data Format

Each entry is a JSON object with these fields:

| Field | Type | Present In |
|-------|------|-----------|
| `id` | string | All |
| `type` | `"memory"` / `"buildlog"` / `"reflection"` | All |
| `title` | string | All |
| `createdAt` | ISO date string | All |
| `sortDate` | ISO date string | All |
| `tags` | string[] | All |
| `timeframe` | string | Memory |
| `context` | `"student"` / `"teacher"` / `"personal"` / `"researcher"` | Memory |
| `description` | string | Memory, Reflection |
| `emotion` | string | Memory |
| `what` | string | Build Log |
| `why` | string | Build Log |
| `challenges` | string | Build Log |
| `questions` | string | Build Log |
| `link` | URL string | Build Log |
| `prompt` | string | Reflection |
| `parentId` | string | Reflection |
| `parentType` | string | Reflection |

## Cost

- **Without AI**: Free (static HTML/CSS/JS on GitHub Pages)
- **With AI reflection**: ~$0.005-$0.01 per reflection prompt (Claude Sonnet)

## Tips for Consistent Use

1. Keep the tab open — bookmark `servellon.net/dissertation-tracker/`
2. Use Build Log for quick entries during coding sessions (low friction)
3. Use Memory Capture for longer, reflective entries when you have time
4. Export JSON weekly as a backup
5. The CSV export works well for importing into qualitative analysis tools
