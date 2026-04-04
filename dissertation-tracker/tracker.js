// ============================================
// DISSERTATION TRACKER - Main Application
// ============================================
// Storage: localStorage with JSON export/import
// All data stays in the browser until you export it.

// ============================================
// CONFIGURATION
// ============================================

// localStorage key
const STORAGE_KEY = 'dissertation-tracker-entries';

// ============================================
// DATA LAYER
// ============================================

function loadEntries() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Failed to load entries:', e);
        return [];
    }
}

function saveEntries(entries) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
        console.error('Failed to save entries:', e);
        showToast('Failed to save. Storage may be full.', 'error');
    }
}

function addEntry(entry, token) {
    const entries = loadEntries();
    entry.id = generateId();
    entry.createdAt = new Date().toISOString();
    entries.push(entry);
    saveEntries(entries);
    Neo4j.saveEntry(entry, token)
        .catch(err => {
            // If the token was rejected, clear auth state and prompt re-login
            if (err.message && err.message.includes('401')) {
                Auth.handleUnauthorized();
            }
            console.warn('[Neo4j] write failed:', err);
        });
    return entry;
}

function deleteEntry(id) {
    const entries = loadEntries().filter(e => e.id !== id);
    saveEntries(entries);
}

function getEntry(id) {
    return loadEntries().find(e => e.id === id);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================
// TAB NAVIGATION
// ============================================

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update panels
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('tab-' + tabName).classList.add('active');
            // Refresh content for data-driven tabs
            if (tabName === 'timeline') renderTimeline();
            if (tabName === 'buildlog') renderCommitLog();
        });
    });
}

// ============================================
// TAG SELECTORS
// ============================================

function initTagSelectors() {
    document.querySelectorAll('.tag-selector').forEach(selector => {
        selector.querySelectorAll('.tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
            });
        });
    });

    // Custom tag inputs
    document.getElementById('memory-custom-tag').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCustomTag(e.target, 'memory-tag-selector');
        }
    });

    document.getElementById('buildlog-custom-tag').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCustomTag(e.target, 'buildlog-tag-selector');
        }
    });
}

function addCustomTag(input, selectorId) {
    const tag = input.value.trim().toLowerCase();
    if (!tag) return;

    const selector = document.getElementById(selectorId);
    // Check for duplicates
    const exists = selector.querySelector(`[data-tag="${tag}"]`);
    if (exists) {
        exists.classList.add('selected');
        input.value = '';
        return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn selected';
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
    selector.appendChild(btn);
    input.value = '';
}

function getSelectedTags(selectorId) {
    const selector = document.getElementById(selectorId);
    return Array.from(selector.querySelectorAll('.tag-btn.selected'))
        .map(btn => btn.dataset.tag);
}

function clearSelectedTags(selectorId) {
    const selector = document.getElementById(selectorId);
    selector.querySelectorAll('.tag-btn.selected').forEach(btn => {
        btn.classList.remove('selected');
    });
}

// ============================================
// MEMORY FORM
// ============================================

function initMemoryForm() {
    const form = document.getElementById('memory-form');
    form.addEventListener('submit', e => {
        e.preventDefault();

        // Gate: must be logged in to save to Neo4j
        if (!isLoggedIn()) {
            Auth.showLoginModal();
            showToast('Log in to save your memory.', 'error');
            return;
        }

        const entry = {
            type: 'memory',
            timeframe: document.getElementById('memory-timeframe').value.trim(),
            title: document.getElementById('memory-title').value.trim(),
            context: document.getElementById('memory-context').value,
            description: document.getElementById('memory-description').value.trim(),
            tags: getSelectedTags('memory-tag-selector'),
            emotion: document.getElementById('memory-emotion').value.trim(),
            // Parse a sortable date from the timeframe for timeline ordering
            sortDate: parseSortDate(document.getElementById('memory-timeframe').value.trim())
        };

        const token = getToken();
        const saved = addEntry(entry, token);
        showToast('Memory saved!', 'success');
        form.reset();
        clearSelectedTags('memory-tag-selector');

        // Show reflection option
        showReflectionOption('memory', saved);
    });
}

// ============================================
// BUILD LOG - COMMIT VIEWER
// ============================================

// Cache so we don't re-fetch GitHub on every tab revisit unless user asks
let _commitsCache = [];

function initBuildLog() {
    const btn = document.getElementById('refresh-commits-btn');
    if (btn) btn.addEventListener('click', () => renderCommitLog());
}

async function renderCommitLog() {
    const list = document.getElementById('commits-list');
    const statusEl = document.getElementById('commits-status');
    if (!list) return;

    list.innerHTML = '<div class="commits-loading"><p>Loading commit history&hellip;</p></div>';
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'source-badge'; }

    try {
        _commitsCache = await fetchGitCommits();
        if (_commitsCache.length === 0) {
            list.innerHTML = '<div class="timeline-empty"><p>No commits found.</p></div>';
            return;
        }
        list.innerHTML = _commitsCache.map(renderCommitCard).join('');
        attachCommitListeners(list);
        if (statusEl) {
            statusEl.textContent = _commitsCache.length + ' commits';
            statusEl.className = 'source-badge source-live';
        }
    } catch (err) {
        console.error('[Commits] fetch failed:', err);
        list.innerHTML = '<div class="timeline-empty"><p>Couldn\'t load commits. Check your connection and try again.</p></div>';
        if (statusEl) { statusEl.textContent = 'Unavailable'; statusEl.className = 'source-badge source-local'; }
    }
}

async function fetchGitCommits() {
    const url = 'https://api.github.com/repos/confusedbysmiles/confusedbysmiles.github.io/commits?path=dissertation-tracker&per_page=50';
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    if (!res.ok) throw new Error('GitHub API error ' + res.status);
    return res.json();
}

function renderCommitCard(commit) {
    const sha7 = escapeHtml(commit.sha.slice(0, 7));
    const lines = commit.commit.message.split('\n');
    const firstLine = escapeHtml(lines[0]);
    const bodyText = lines.slice(1).join('\n').trim();
    const date = new Date(commit.commit.author.date);
    const dateStr = formatDate(date);
    const author = escapeHtml(commit.commit.author.name);
    const url = escapeHtml(commit.html_url);
    const sha = escapeHtml(commit.sha);

    return `
        <div class="commit-card">
            <div class="commit-header">
                <div class="commit-main">
                    <span class="commit-hash">${sha7}</span>
                    <span class="commit-title">${firstLine}</span>
                </div>
                <div class="commit-actions">
                    <a class="commit-gh-link" href="${url}" target="_blank" rel="noopener" title="View on GitHub">↗</a>
                    <button class="commit-reflect-btn btn-sm" data-sha="${sha}">Reflect</button>
                </div>
            </div>
            <div class="commit-meta">${dateStr} · ${author}</div>
            ${bodyText ? '<div class="commit-body">' + escapeHtml(bodyText) + '</div>' : ''}
        </div>
    `;
}

function attachCommitListeners(container) {
    container.querySelectorAll('.commit-reflect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sha = btn.dataset.sha;
            const commit = _commitsCache.find(c => c.sha === sha);
            if (!commit) return;
            const commitEntry = {
                type: 'buildlog',
                title: commit.commit.message.split('\n')[0].slice(0, 80),
                what: commit.commit.message,
                why: 'Git commit ' + commit.sha.slice(0, 7) + ' on ' + new Date(commit.commit.author.date).toLocaleDateString(),
                challenges: '',
                questions: '',
                tags: ['commit'],
                sortDate: commit.commit.author.date,
                link: commit.html_url
            };
            const panel = document.getElementById('buildlog-reflection-panel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            openChat('buildlog', commitEntry);
        });
    });
}

// ============================================
// DATE PARSING (flexible timeframe -> sortable date)
// ============================================

function parseSortDate(timeframe) {
    if (!timeframe) return new Date().toISOString();

    const t = timeframe.trim().toLowerCase();

    // Exact year: "1995", "2023"
    const yearMatch = t.match(/^(\d{4})$/);
    if (yearMatch) return new Date(parseInt(yearMatch[1]), 6, 1).toISOString();

    // Season + year: "Fall 2015", "Spring 2023"
    const seasonMatch = t.match(/^(spring|summer|fall|autumn|winter)\s+(\d{4})$/i);
    if (seasonMatch) {
        const year = parseInt(seasonMatch[2]);
        const season = seasonMatch[1].toLowerCase();
        const monthMap = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 0 };
        return new Date(year, monthMap[season] || 0, 1).toISOString();
    }

    // Month + year: "March 2020", "Jan 2019"
    const monthYearMatch = t.match(/^([a-z]+)\s+(\d{4})$/i);
    if (monthYearMatch) {
        const parsed = new Date(t);
        if (!isNaN(parsed)) return parsed.toISOString();
    }

    // Full date: "2023-05-15" or "May 15, 2023"
    const parsed = new Date(t);
    if (!isNaN(parsed)) return parsed.toISOString();

    // Fallback: use current date
    return new Date().toISOString();
}

// ============================================
// AI REFLECTION
// ============================================

// ============================================
// TRACKER.JS PATCH — AI Chat Integration
// ============================================
// Replace the entire "AI REFLECTION" section in tracker.js
// (from "function showReflectionOption" to the end of
//  "function generateLocalReflection") with this block.
//
// Also add this line at the top of tracker.js with the other constants:
//   const WORKER_URL = "https://dissertation-neo4j.math-generator.workers.dev";
// And remove or leave empty the existing REFLECTION_API_ENDPOINT constant.
// ============================================

// ── Chat state ────────────────────────────────────────────────────────────────
const chatState = {
    entry:          null,   // the entry this conversation is about
    messages:       [],     // [{ role, content }, ...]
    isTyping:       false,
    recognition:    null,   // Web Speech API instance
    isListening:    false,
};

// ── Show the chat panel after saving an entry ─────────────────────────────────
function showReflectionOption(formType, savedEntry) {
    const reflectBtn = document.getElementById(formType + '-reflect-btn');
    if (reflectBtn) {
        reflectBtn.style.display = 'inline-block';
        reflectBtn.onclick = () => openChat(formType, savedEntry);
    }
}

// ── Open the chat panel and kick off the first Claude message ─────────────────
async function openChat(formType, entry) {
    chatState.entry    = entry;
    chatState.messages = [];

    const panel = document.getElementById(formType + '-reflection-panel');
    panel.style.display = 'block';
    panel.innerHTML = buildChatPanelHTML(formType);

    // Wire up send, speech, save, close
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    const speechBtn = document.getElementById('chat-speech-btn'); if (speechBtn) speechBtn.addEventListener('click', toggleSpeech);
    document.getElementById('chat-save-btn').addEventListener('click', showSaveDetails);
    document.getElementById('chat-confirm-save-btn').addEventListener('click', saveConversation);
    document.getElementById('chat-cancel-save-btn').addEventListener('click', () => {
        document.getElementById('chat-save-details').style.display = 'none';
    });
    document.getElementById('chat-reflection-custom-tag').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCustomTag(e.target, 'chat-reflection-tag-selector'); }
    });
    document.getElementById('chat-close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
        chatState.messages = [];
    });

    // Get Claude's opening question
    await fetchChatReply(formType);
}

// ── HTML for the chat panel ───────────────────────────────────────────────────
function buildChatPanelHTML(formType) {
    const speechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    return `
    <div class="chat-panel">
      <div class="chat-header">
        <span class="chat-title">Research Conversation</span>
        <div class="chat-header-actions">
          <button class="chat-action-btn" id="chat-save-btn" title="Save to Neo4j">Save to Graph</button>
          <button class="chat-action-btn chat-close" id="chat-close-btn" title="Close">✕</button>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-typing" id="chat-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="chat-save-details" id="chat-save-details" style="display:none;">
        <div class="chat-save-field">
          <label class="chat-save-label">Reflection title</label>
          <input type="text" id="chat-reflection-title" class="chat-input chat-reflection-title" placeholder="Name this reflection…">
        </div>
        <div class="chat-save-field">
          <label class="chat-save-label">Tags</label>
          <div class="tag-selector" id="chat-reflection-tag-selector"></div>
          <input type="text" id="chat-reflection-custom-tag" class="chat-input" placeholder="Add tag + Enter" style="margin-top:0.4rem;">
        </div>
        <div class="chat-save-actions">
          <button class="chat-confirm-btn" id="chat-confirm-save-btn">Save Reflection</button>
          <button class="chat-action-btn" id="chat-cancel-save-btn">Cancel</button>
        </div>
      </div>
      <div class="chat-input-row">
        ${speechSupported ? `<button class="chat-speech-btn" id="chat-speech-btn" title="Speak">🎤</button>` : ''}
        <textarea
          id="chat-input"
          class="chat-input"
          placeholder="Respond to Claude… (Enter to send)"
          rows="2"
        ></textarea>
        <button class="chat-send-btn" id="chat-send-btn">→</button>
      </div>
    </div>`;
}

// ── Show the save-details form before committing the reflection ───────────────
function showSaveDetails() {
    if (chatState.messages.length === 0) {
        showToast('No conversation to save yet.', 'error');
        return;
    }

    const titleInput = document.getElementById('chat-reflection-title');
    if (titleInput && !titleInput.value) {
        const firstUserMsg = chatState.messages.find(m => m.role === 'user');
        titleInput.value = firstUserMsg ? firstUserMsg.content.slice(0, 80) : 'Research Conversation';
    }

    const tagSelector = document.getElementById('chat-reflection-tag-selector');
    if (tagSelector && tagSelector.children.length === 0) {
        (chatState.entry?.tags || []).forEach(tag => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn selected';
            btn.dataset.tag = tag;
            btn.textContent = tag;
            btn.addEventListener('click', () => btn.classList.toggle('selected'));
            tagSelector.appendChild(btn);
        });
    }

    document.getElementById('chat-save-details').style.display = 'block';
}

// ── Send a user message and get Claude's reply ────────────────────────────────
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text || chatState.isTyping) return;

    input.value = '';
    appendChatMessage('user', text);
    chatState.messages.push({ role: 'user', content: text });

    // Determine which form panel we're in
    const formType = chatState.entry?.type === 'buildlog' ? 'buildlog' : 'memory';
    await fetchChatReply(formType);
}

// ── Call /chat on the Worker and render the reply ─────────────────────────────
async function fetchChatReply(formType) {
    chatState.isTyping = true;
    showTypingIndicator(true);

    const recentEntries = loadEntries()
        .filter(e => e.id !== chatState.entry?.id)
        .slice(0, 5)
        .map(e => ({ type: e.type, title: e.title || e.what, tags: e.tags, timeframe: e.timeframe }));

    try {
        const resp = await fetch(`${WORKER_URL}/chat`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                entry:         chatState.entry,
                messages:      chatState.messages,
                recentEntries,
            }),
        });

        if (!resp.ok) throw new Error(`Worker error ${resp.status}`);
        const data = await resp.json();

        if (data.reply) {
            chatState.messages.push({ role: 'assistant', content: data.reply });
            appendChatMessage('assistant', data.reply);
        }
    } catch (err) {
        console.error('[Chat] error:', err);
        appendChatMessage('assistant', 'Something went wrong reaching the server. Check your connection and try again.');
    } finally {
        chatState.isTyping = false;
        showTypingIndicator(false);
    }
}

// ── Render a message bubble ───────────────────────────────────────────────────
function appendChatMessage(role, content) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message chat-message-${role}`;
    div.textContent = content;

    // Insert before typing indicator
    const typing = document.getElementById('chat-typing');
    container.insertBefore(div, typing);
    container.scrollTop = container.scrollHeight;
}

function showTypingIndicator(show) {
    const el = document.getElementById('chat-typing');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Speech-to-text ────────────────────────────────────────────────────────────
function toggleSpeech() {
    const btn = document.getElementById('chat-speech-btn');
    if (!btn) return;

    if (chatState.isListening) {
        chatState.recognition?.stop();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    chatState.recognition = new SpeechRecognition();
    chatState.recognition.continuous     = true;
    chatState.recognition.interimResults = true;
    chatState.recognition.lang           = 'en-US';

    chatState.recognition.onstart = () => {
        chatState.isListening = true;
        btn.textContent = '🔴';
        btn.title = 'Listening… click to stop';
    };

    chatState.recognition.onresult = (event) => {
        const input   = document.getElementById('chat-input');
        const interim = Array.from(event.results)
            .map(r => r[0].transcript)
            .join('');
        if (input) input.value = interim;
    };

    chatState.recognition.onend = () => {
        chatState.isListening = false;
        if (btn) { btn.textContent = '🎤'; btn.title = 'Speak'; }
        // Auto-send if there's content
        const input = document.getElementById('chat-input');
        if (input && input.value.trim()) sendChatMessage();
    };

    chatState.recognition.onerror = (e) => {
        console.warn('[Speech] error:', e.error);
        chatState.isListening = false;
        if (btn) { btn.textContent = '🎤'; btn.title = 'Speak'; }
    };

    chatState.recognition.start();
}

// ── Save conversation to Neo4j ────────────────────────────────────────────────
async function saveConversation() {
    if (chatState.messages.length === 0) {
        showToast('No conversation to save yet.', 'error');
        return;
    }

    const saveBtn = document.getElementById('chat-confirm-save-btn');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    // Read title and tags from the save-details form
    const titleInput = document.getElementById('chat-reflection-title');
    const firstUserMsg = chatState.messages.find(m => m.role === 'user');
    const autoTitle = firstUserMsg ? firstUserMsg.content.slice(0, 120) : 'Research conversation';
    const title   = (titleInput && titleInput.value.trim()) || autoTitle;
    const tags    = getSelectedTags('chat-reflection-tag-selector');
    const summary = title;

    // Always save locally so the conversation appears in the Entries tab
    const transcript = chatState.messages
        .map(m => (m.role === 'user' ? 'You: ' : 'Claude: ') + m.content)
        .join('\n\n');
    addEntry({
        type: 'reflection',
        title,
        description: transcript,
        sortDate: new Date().toISOString(),
        tags: tags.length > 0 ? tags : (chatState.entry?.tags || []),
        relatedEntryId: chatState.entry?.id,
    });

    try {
        const resp = await fetch(`${WORKER_URL}/conversation`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                entryId:  chatState.entry?.id,
                messages: chatState.messages,
                summary,
            }),
        });

        if (!resp.ok) throw new Error(`Worker error ${resp.status}`);
        showToast('Conversation saved!', 'success');
        showToast('Conversation saved!', 'success');
        if (saveBtn) { saveBtn.textContent = 'Saved ✓'; saveBtn.disabled = true; }
    } catch (err) {
        console.error('[Save conversation] error:', err);
        showToast('Saved locally (graph sync failed).', 'error');
        if (saveBtn) { saveBtn.textContent = 'Saved ✓'; saveBtn.disabled = true; }
    }
}


// ============================================
// TIMELINE RENDERING
// ============================================

function renderTimeline() {
    const container = document.getElementById('timeline-container');
    const entries = getFilteredEntries('timeline');

    if (entries.length === 0) {
        container.innerHTML = '<div class="timeline-empty"><p>No entries match your filters.</p></div>';
        return;
    }

    // Sort by sortDate descending (most recent first)
    entries.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    // Group by year
    const groups = {};
    entries.forEach(entry => {
        const date = new Date(entry.sortDate);
        const year = date.getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(entry);
    });

    let html = '';
    const sortedYears = Object.keys(groups).sort((a, b) => b - a);

    sortedYears.forEach(year => {
        html += '<div class="timeline-year-group">';
        html += '<div class="timeline-year-label">' + year + '</div>';
        groups[year].forEach(entry => {
            html += renderEntryCard(entry);
        });
        html += '</div>';
    });

    container.innerHTML = html;
    attachEntryListeners(container);
    updateTagFilterOptions();
}

// ============================================
// ALL ENTRIES → GRAPH VIEWER (embedded iframe)
// ============================================
// The graph tab renders graph-viewer.html in an iframe.
// No JS needed here — the iframe handles its own data loading.

// ============================================
// ENTRY CARD RENDERER (shared by timeline and entries views)
// ============================================

function renderEntryCard(entry, showActions) {
    const typeLabels = { memory: 'Memory', buildlog: 'Build Log', reflection: 'Reflection' };
    const badgeClass = { memory: 'badge-memory', buildlog: 'badge-buildlog', reflection: 'badge-reflection' };
    const typeCss = 'type-' + entry.type;

    const date = new Date(entry.sortDate || entry.createdAt);
    const dateStr = formatDate(date);
    const contextStr = entry.context ? ' &middot; ' + capitalize(entry.context) : '';

    let excerpt = '';
    if (entry.type === 'memory') excerpt = entry.description || '';
    if (entry.type === 'buildlog') excerpt = entry.what || '';
    if (entry.type === 'reflection') excerpt = entry.description || '';
    const shortExcerpt = excerpt.length > 200 ? excerpt.slice(0, 200) + '...' : excerpt;

    let fullContent = '';
    if (entry.type === 'memory') {
        fullContent = buildField('Description', entry.description);
        if (entry.emotion) fullContent += buildField('Emotional Response', entry.emotion);
    } else if (entry.type === 'buildlog') {
        fullContent = buildField('What Changed', entry.what);
        fullContent += buildField('Why', entry.why);
        if (entry.challenges) fullContent += buildField('Challenges', entry.challenges);
        if (entry.questions) fullContent += buildField('Questions', entry.questions);
        if (entry.link) fullContent += buildField('Link', '<a href="' + escapeHtml(entry.link) + '" target="_blank" rel="noopener">' + escapeHtml(entry.link) + '</a>');
    } else if (entry.type === 'reflection') {
        if (entry.prompt) fullContent += buildField('Prompt', entry.prompt);
        fullContent += buildField('Response', entry.description);
    }

    const tagsHtml = (entry.tags || []).map(t =>
        '<span class="entry-tag">' + escapeHtml(t) + '</span>'
    ).join('');

    const actionsHtml = showActions ? `
        <div class="entry-actions">
            <button class="entry-action-btn reflect" data-id="${entry.id}" data-type="${entry.type}">Reflect</button>
            <button class="entry-action-btn delete" data-id="${entry.id}">Delete</button>
        </div>
    ` : '';

    return `
        <div class="timeline-entry ${typeCss}" data-id="${entry.id}">
            <div class="entry-header">
                <div>
                    <div class="entry-title">${escapeHtml(entry.title || 'Untitled')}</div>
                    <div class="entry-meta">${dateStr}${contextStr}</div>
                </div>
                <span class="entry-type-badge ${badgeClass[entry.type] || ''}">${typeLabels[entry.type] || entry.type}</span>
            </div>
            <div class="entry-excerpt">${escapeHtml(shortExcerpt)}</div>
            <div class="entry-tags">${tagsHtml}</div>
            ${excerpt.length > 200 ? '<button class="entry-expand-btn" data-id="' + entry.id + '">Show more</button>' : ''}
            <div class="entry-full-content" id="full-${entry.id}">${fullContent}</div>
            ${actionsHtml}
        </div>
    `;
}

function buildField(label, value) {
    if (!value) return '';
    return `<div class="entry-field">
        <div class="entry-field-label">${escapeHtml(label)}</div>
        <div class="entry-field-value">${value.startsWith('<a') ? value : escapeHtml(value)}</div>
    </div>`;
}

// ============================================
// FILTERING
// ============================================

function getFilteredEntries(view) {
    let entries = loadEntries();

    if (view === 'timeline') {
        // Type filter
        const activeTypeFilter = document.querySelector('.timeline-filters .filter-btn.active');
        const typeFilter = activeTypeFilter ? activeTypeFilter.dataset.filterType : 'all';
        if (typeFilter !== 'all') {
            entries = entries.filter(e => e.type === typeFilter);
        }

        // Tag filter
        const tagFilter = document.getElementById('timeline-tag-filter').value;
        if (tagFilter) {
            entries = entries.filter(e => e.tags && e.tags.includes(tagFilter));
        }

        // Search filter
        const search = document.getElementById('timeline-search').value.toLowerCase();
        if (search) {
            entries = entries.filter(e =>
                (e.title && e.title.toLowerCase().includes(search)) ||
                (e.description && e.description.toLowerCase().includes(search)) ||
                (e.what && e.what.toLowerCase().includes(search)) ||
                (e.why && e.why.toLowerCase().includes(search))
            );
        }
    }

    return entries;
}

function updateTagFilterOptions() {
    const select = document.getElementById('timeline-tag-filter');
    const currentVal = select.value;
    const allTags = new Set();
    loadEntries().forEach(e => (e.tags || []).forEach(t => allTags.add(t)));

    let options = '<option value="">All tags</option>';
    Array.from(allTags).sort().forEach(tag => {
        const selected = tag === currentVal ? ' selected' : '';
        options += '<option value="' + escapeHtml(tag) + '"' + selected + '>' + escapeHtml(tag) + '</option>';
    });
    select.innerHTML = options;
}

function initTimelineFilters() {
    // Type filter buttons
    document.querySelectorAll('.timeline-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeline-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTimeline();
        });
    });

    // Tag filter
    document.getElementById('timeline-tag-filter').addEventListener('change', () => renderTimeline());

    // Search
    let searchTimeout;
    document.getElementById('timeline-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderTimeline(), 300);
    });
}

// ============================================
// ENTRY INTERACTIONS (expand, delete, reflect)
// ============================================

function attachEntryListeners(container) {
    // Expand/collapse
    container.querySelectorAll('.entry-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const fullEl = document.getElementById('full-' + id);
            const isExpanded = fullEl.classList.toggle('expanded');
            btn.textContent = isExpanded ? 'Show less' : 'Show more';
        });
    });

    // Delete
    container.querySelectorAll('.entry-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingDeleteId = btn.dataset.id;
            document.getElementById('delete-modal').style.display = 'flex';
        });
    });

    // Reflect from entry card
    container.querySelectorAll('.entry-action-btn.reflect').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = getEntry(btn.dataset.id);
            if (entry) {
                // Navigate to the appropriate form tab and trigger reflection
                const tabName = entry.type === 'buildlog' ? 'buildlog' : 'memory';
                document.querySelector(`[data-tab="${tabName}"]`).click();
                // Small delay to let tab switch
                setTimeout(() => openChat(tabName, entry), 100);
            }
        });
    });
}

let pendingDeleteId = null;

function initDeleteModal() {
    document.getElementById('confirm-delete').addEventListener('click', () => {
        if (pendingDeleteId) {
            deleteEntry(pendingDeleteId);
            showToast('Entry deleted.', 'success');
            pendingDeleteId = null;
            document.getElementById('delete-modal').style.display = 'none';
            // Refresh whichever view is active
            if (document.querySelector('.tab-btn.active').dataset.tab === 'timeline') renderTimeline();
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
        pendingDeleteId = null;
        document.getElementById('delete-modal').style.display = 'none';
    });
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + (type || '');
    // Force reflow to restart animation
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTagSelectors();
    initMemoryForm();
    initBuildLog();
    initTimelineFilters();
    initDeleteModal();

    Neo4j.health()
        .then(r => console.log('[Neo4j] status:', r.neo4j))
        .catch(err => console.warn('[Neo4j] unreachable:', err));

    console.log('Dissertation Tracker initialized.');
});
