// ============================================
// CLOUDFLARE WORKER - Dissertation Tracker AI Reflection
// ============================================
// This worker handles AI-powered reflection prompts
// using the Anthropic Claude API.
//
// SETUP:
//   1. Create a new Cloudflare Worker (or add to your existing project)
//   2. Set your Anthropic API key as a secret:
//      wrangler secret put ANTHROPIC_API_KEY
//   3. Deploy: wrangler deploy
//   4. Copy the worker URL and paste it into tracker.js as REFLECTION_API_ENDPOINT
//
// WRANGLER CONFIG (wrangler.toml):
//   name = "dissertation-reflection"
//   main = "reflection-worker.js"
//   compatibility_date = "2024-01-01"
// ============================================

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        if (request.method !== 'POST') {
            return jsonResponse({ error: 'POST required' }, 405);
        }

        try {
            const body = await request.json();

            if (body.action === 'reflect') {
                return await handleReflection(body, env);
            }

            return jsonResponse({ error: 'Unknown action' }, 400);
        } catch (err) {
            console.error('Worker error:', err);
            return jsonResponse({ error: 'Internal error' }, 500);
        }
    }
};

async function handleReflection(body, env) {
    const { entry, recentEntries } = body;

    if (!entry) {
        return jsonResponse({ error: 'Missing entry data' }, 400);
    }

    // Build context about recent entries for richer reflection
    let recentContext = '';
    if (recentEntries && recentEntries.length > 0) {
        recentContext = '\n\nRecent entries in the tracker (for cross-referencing):\n';
        recentEntries.forEach((e, i) => {
            recentContext += `${i + 1}. [${e.type}] "${e.title}" (${e.timeframe || 'recent'}) - tags: ${(e.tags || []).join(', ')}\n`;
        });
    }

    // Build the prompt
    const entryDescription = entry.type === 'memory'
        ? `Memory titled "${entry.title}" from ${entry.timeframe || 'an unspecified time'}, in the context of being a ${entry.context || 'person'}:\n"${entry.description}"${entry.emotion ? '\nEmotional response: ' + entry.emotion : ''}`
        : `Build log: "${entry.what}"\nReason: "${entry.why}"${entry.challenges ? '\nChallenges: ' + entry.challenges : ''}${entry.questions ? '\nQuestions: ' + entry.questions : ''}`;

    const systemPrompt = `You are a thoughtful research advisor helping a doctoral student with their autoethnographic dissertation about student agency in math education. They are building an AI-powered "Student Agency Math Problem Generator" for students retaking Algebra 1, and they are documenting their formative memories and build process as dissertation data.

Your job is to generate ONE focused reflection question that helps them see connections between:
- Their past experiences as a student/teacher and their current design choices
- Patterns across their documented memories
- How their pedagogical values show up in their technical decisions
- The equity and access implications of their work

Rules:
- Ask exactly ONE question (not multiple)
- Be specific to what they wrote (reference details from their entry)
- Be warm but intellectually challenging
- Keep it under 3 sentences
- Don't be generic - the question should only make sense for THIS entry
- If you can connect their entry to one of their recent entries, do so`;

    const userMessage = `The researcher just logged the following entry:

${entryDescription}

Tags: ${(entry.tags || []).join(', ')}${recentContext}

Generate one specific, thoughtful reflection question.`;

    // Call Claude API
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 300,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        })
    });

    if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        console.error('Anthropic API error:', errText);
        return jsonResponse({ error: 'AI service error' }, 502);
    }

    const data = await apiResponse.json();
    const reflection = data.content[0].text;

    return jsonResponse({ reflection });
}

// ============================================
// HELPERS
// ============================================

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
