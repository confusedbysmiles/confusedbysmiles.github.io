// ============================================
// DISSERTATION TRACKER - Main Application
// ============================================

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
    if (entry.approved === undefined) entry.approved = false;
    entries.push(entry);
    saveEntries(entries);
    Neo4j.saveEntry(entry, token)
        .catch(err => {
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

let converseInitialized = false;

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('tab-' + tabName).classList.add('active');

            if (tabName === 'timeline') renderTimeline();
            if (tabName === 'review') initReviewTab();
            if (tabName === 'converse' && !converseInitialized) {
                converseInitialized = true;
                initConverseTab();
            }
        });
    });
}

// ============================================
// TAG UTILITIES (used by review form)
// ============================================

function getSelectedTags(selectorId) {
    const selector = document.getElementById(selectorId);
    if (!selector) return [];
    return Array.from(selector.querySelectorAll('.tag-btn.selected'))
        .map(btn => btn.dataset.tag);
}

// ============================================
// DATE PARSING
// ============================================

function parseSortDate(timeframe) {
    if (!timeframe) return new Date().toISOString();

    const t = timeframe.trim().toLowerCase();

    const yearMatch = t.match(/^(\d{4})$/);
    if (yearMatch) return new Date(parseInt(yearMatch[1]), 6, 1).toISOString();

    const seasonMatch = t.match(/^(spring|summer|fall|autumn|winter)\s+(\d{4})$/i);
    if (seasonMatch) {
        const year = parseInt(seasonMatch[2]);
        const season = seasonMatch[1].toLowerCase();
        const monthMap = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 0 };
        return new Date(year, monthMap[season] || 0, 1).toISOString();
    }

    const monthYearMatch = t.match(/^([a-z]+)\s+(\d{4})$/i);
    if (monthYearMatch) {
        const parsed = new Date(t);
        if (!isNaN(parsed)) return parsed.toISOString();
    }

    const parsed = new Date(t);
    if (!isNaN(parsed)) return parsed.toISOString();

    return new Date().toISOString();
}

// ============================================
// CONVERSE TAB
// ============================================

const converseState = {
    messages:    [],
    allEntries:  [],
    isTyping:    false,
    recognition: null,
    isListening: false,
};

async function initConverseTab() {
    // Load all entries as context for Claude
    try {
        const data = await Neo4j.getEntries();
        converseState.allEntries = data.entries || [];
    } catch (err) {
        console.warn('[Converse] Could not fetch entries for context:', err);
        converseState.allEntries = loadEntries().filter(e => e.approved !== false);
    }

    // Wire input controls
    document.getElementById('converse-send-btn').addEventListener('click', sendConverseMessage);
    document.getElementById('converse-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendConverseMessage(); }
    });
    const speechBtn = document.getElementById('converse-speech-btn');
    if (speechBtn) speechBtn.addEventListener('click', toggleConverseSpeech);
    document.getElementById('converse-end-btn').addEventListener('click', endAndSaveDraft);

    // Kick off Claude's opening message
    await fetchConverseReply();
}

async function sendConverseMessage() {
    const input = document.getElementById('converse-input');
    const text  = input ? input.value.trim() : '';
    if (!text || converseState.isTyping) return;

    input.value = '';
    appendConverseMessage('user', text);
    converseState.messages.push({ role: 'user', content: text });
    await fetchConverseReply();
}

async function fetchConverseReply() {
    converseState.isTyping = true;
    showConverseTyping(true);

    try {
        const resp = await fetch(`${WORKER_URL}/chat`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                messages:   converseState.messages,
                allEntries: converseState.allEntries,
                // entry is intentionally omitted — signals fresh conversation mode
            }),
        });

        if (!resp.ok) throw new Error(`Worker error ${resp.status}`);
        const data = await resp.json();

        if (data.reply) {
            converseState.messages.push({ role: 'assistant', content: data.reply });
            appendConverseMessage('assistant', data.reply);
        }
    } catch (err) {
        console.error('[Converse] chat error:', err);
        appendConverseMessage('assistant', 'Something went wrong reaching the server. Check your connection and try again.');
    } finally {
        converseState.isTyping = false;
        showConverseTyping(false);
    }
}

function appendConverseMessage(role, content) {
    const container = document.getElementById('converse-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message chat-message-${role}`;
    div.textContent = content;

    const typing = document.getElementById('converse-typing');
    container.insertBefore(div, typing);
    container.scrollTop = container.scrollHeight;
}

function showConverseTyping(show) {
    const el = document.getElementById('converse-typing');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function toggleConverseSpeech() {
    const btn = document.getElementById('converse-speech-btn');
    if (!btn) return;

    if (converseState.isListening) {
        converseState.recognition?.stop();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Speech recognition not supported in this browser.', 'error');
        return;
    }

    converseState.recognition = new SpeechRecognition();
    converseState.recognition.continuous     = true;
    converseState.recognition.interimResults = true;
    converseState.recognition.lang           = 'en-US';

    converseState.recognition.onstart = () => {
        converseState.isListening = true;
        btn.textContent = '🔴';
        btn.title = 'Listening… click to stop';
    };

    converseState.recognition.onresult = (event) => {
        const input   = document.getElementById('converse-input');
        const interim = Array.from(event.results).map(r => r[0].transcript).join('');
        if (input) input.value = interim;
    };

    converseState.recognition.onend = () => {
        converseState.isListening = false;
        btn.textContent = '🎤';
        btn.title = 'Hold to speak';
        // Manual stop — do NOT auto-send; Sam decides when to submit
    };

    converseState.recognition.onerror = (e) => {
        console.warn('[Speech] error:', e.error);
        converseState.isListening = false;
        btn.textContent = '🎤';
        btn.title = 'Hold to speak';
    };

    converseState.recognition.start();
}

async function endAndSaveDraft() {
    if (converseState.messages.length === 0) {
        showToast('Nothing to save yet — start a conversation first!', 'error');
        return;
    }

    if (!isLoggedIn()) {
        Auth.showLoginModal();
        showToast('Log in to save your draft.', 'error');
        return;
    }

    const btn = document.getElementById('converse-end-btn');
    btn.textContent = 'Extracting…';
    btn.disabled = true;

    try {
        // Ask Claude to extract a structured entry from the conversation
        const extractResp = await fetch(`${WORKER_URL}/chat/extract`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ messages: converseState.messages }),
        });

        if (!extractResp.ok) throw new Error(`Worker error ${extractResp.status}`);
        const { entry: extracted } = await extractResp.json();

        const now = new Date().toISOString();
        const draft = {
            ...extracted,
            id:        generateId(),
            createdAt: now,
            sortDate:  parseSortDate(extracted.timeframe || ''),
            approved:  false,
        };

        // Save to localStorage
        const entries = loadEntries();
        entries.push(draft);
        saveEntries(entries);

        // Save to Neo4j (requires auth)
        const token = getToken();
        await Neo4j.saveEntry(draft, token);

        showToast('Draft saved — find it in the Review tab', 'success');

        // Update the review badge count
        setUnapprovedCount(unapprovedCount + 1);

        // Clear the conversation and start fresh
        converseState.messages = [];
        const container = document.getElementById('converse-messages');
        if (container) {
            const typing = document.getElementById('converse-typing');
            // Remove all message bubbles but leave the typing indicator
            Array.from(container.children).forEach(child => {
                if (child.id !== 'converse-typing') container.removeChild(child);
            });
            if (typing && !container.contains(typing)) container.appendChild(typing);
        }

        await fetchConverseReply();

    } catch (err) {
        console.error('[EndAndSave] error:', err);
        showToast('Could not save draft. Try again.', 'error');
    } finally {
        btn.textContent = 'End & Save Draft';
        btn.disabled = false;
    }
}

// ============================================
// REVIEW TAB
// ============================================

const APPROVED_TAGS = [
    'equity', 'access', 'technology', 'math', 'agency', 'curriculum',
    'identity', 'frustration', 'breakthrough', 'mentor', 'feature',
    'bug fix', 'design choice', 'pedagogy', 'student voice',
    'accessibility', 'AI integration', 'pivot',
];

const reviewState = {
    entries:      [],
    currentIndex: 0,
};

let unapprovedCount = 0;

function setUnapprovedCount(count) {
    unapprovedCount = Math.max(0, count);
    const dot = document.getElementById('review-dot');
    if (!dot) return;
    if (unapprovedCount > 0) {
        dot.textContent = unapprovedCount;
        dot.style.display = 'inline-flex';
    } else {
        dot.style.display = 'none';
    }
}

async function initReviewTab() {
    const panel = document.getElementById('tab-review');
    panel.innerHTML = '<div class="review-loading"><p>Loading unapproved entries&hellip;</p></div>';

    try {
        const data = await Neo4j.getUnapproved();
        reviewState.entries      = data.entries || [];
        reviewState.currentIndex = 0;
        setUnapprovedCount(reviewState.entries.length);
        renderReviewPanel();
    } catch (err) {
        console.warn('[Review] Could not fetch unapproved entries:', err);
        panel.innerHTML = '<div class="timeline-empty"><p>Could not load entries. Check your connection and try again.</p></div>';
    }
}

function renderReviewPanel() {
    const panel = document.getElementById('tab-review');
    const total = reviewState.entries.length;

    if (total === 0) {
        panel.innerHTML = `
        <div class="panel-header">
            <h2>Review</h2>
            <p>Entries drafted from conversations, waiting for your approval.</p>
        </div>
        <div class="timeline-empty">
            <p>No unapproved entries. Start a conversation and use <strong>End &amp; Save Draft</strong>!</p>
        </div>`;
        setUnapprovedCount(0);
        return;
    }

    const entry = reviewState.entries[reviewState.currentIndex];
    const idx   = reviewState.currentIndex;

    panel.innerHTML = `
    <div class="panel-header">
        <h2>Review</h2>
        <p>Review and edit AI-drafted entries before adding them to your record.</p>
    </div>
    <div class="review-nav">
        <button class="btn-secondary btn-sm" id="review-prev-btn"${idx === 0 ? ' disabled' : ''}>&#8592; Previous</button>
        <span class="review-count-label">${idx + 1} of ${total}</span>
        <button class="btn-secondary btn-sm" id="review-next-btn"${idx === total - 1 ? ' disabled' : ''}>Next &#8594;</button>
    </div>
    ${renderReviewCard(entry)}
    <div class="review-actions">
        <button class="btn-primary review-approve-btn" id="review-approve-btn">Approve</button>
        <button class="btn-primary btn-danger review-delete-btn" id="review-delete-btn">Delete</button>
    </div>`;

    // Wire tag toggles
    panel.querySelectorAll('#review-tag-selector .tag-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });

    // Navigation
    document.getElementById('review-prev-btn').addEventListener('click', () => {
        if (reviewState.currentIndex > 0) { reviewState.currentIndex--; renderReviewPanel(); }
    });
    document.getElementById('review-next-btn').addEventListener('click', () => {
        if (reviewState.currentIndex < reviewState.entries.length - 1) { reviewState.currentIndex++; renderReviewPanel(); }
    });

    // Approve
    document.getElementById('review-approve-btn').addEventListener('click', async () => {
        if (!isLoggedIn()) {
            Auth.showLoginModal();
            showToast('Log in to approve entries.', 'error');
            return;
        }

        const approveBtn = document.getElementById('review-approve-btn');
        approveBtn.textContent = 'Approving…';
        approveBtn.disabled = true;

        const updatedEntry = getReviewFormValues(reviewState.entries[reviewState.currentIndex]);

        try {
            const token = getToken();
            await Neo4j.approveEntry(updatedEntry.id, updatedEntry, token);

            // Update localStorage
            const all = loadEntries();
            const localIdx = all.findIndex(e => e.id === updatedEntry.id);
            if (localIdx !== -1) {
                all[localIdx] = { ...all[localIdx], ...updatedEntry, approved: true };
                saveEntries(all);
            }

            showToast('Entry approved!', 'success');
            reviewState.entries.splice(reviewState.currentIndex, 1);
            if (reviewState.currentIndex >= reviewState.entries.length && reviewState.currentIndex > 0) {
                reviewState.currentIndex--;
            }
            setUnapprovedCount(reviewState.entries.length);
            renderReviewPanel();
        } catch (err) {
            console.error('[Review] approve error:', err);
            showToast('Could not approve. Check your connection.', 'error');
            approveBtn.textContent = 'Approve';
            approveBtn.disabled = false;
        }
    });

    // Delete
    document.getElementById('review-delete-btn').addEventListener('click', () => {
        pendingDeleteId      = reviewState.entries[reviewState.currentIndex].id;
        pendingDeleteIsReview = true;
        document.getElementById('delete-modal').style.display = 'flex';
    });
}

function renderReviewCard(entry) {
    const selectedTags = new Set(entry.tags || []);
    const tagsHtml = APPROVED_TAGS.map(tag => {
        const sel = selectedTags.has(tag) ? ' selected' : '';
        return `<button type="button" class="tag-btn${sel}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
    }).join('');

    const contentVal = escapeHtml(entry.content || entry.description || '');
    const emotionVal  = escapeHtml(entry.emotion || entry.emotionalResponse || '');

    return `
    <div class="review-card entry-form">
        <div class="form-row">
            <div class="form-group">
                <label for="review-type">Type</label>
                <select id="review-type">
                    <option value="memory"${entry.type === 'memory' ? ' selected' : ''}>Memory</option>
                    <option value="buildlog"${entry.type === 'buildlog' ? ' selected' : ''}>Build Log</option>
                </select>
            </div>
            <div class="form-group">
                <label for="review-context">Context</label>
                <select id="review-context">
                    <option value="">Select…</option>
                    <option value="As a Student"${entry.context === 'As a Student' ? ' selected' : ''}>As a Student</option>
                    <option value="As a Teacher"${entry.context === 'As a Teacher' ? ' selected' : ''}>As a Teacher</option>
                    <option value="As a Researcher"${entry.context === 'As a Researcher' ? ' selected' : ''}>As a Researcher</option>
                    <option value="Personal"${entry.context === 'Personal' ? ' selected' : ''}>Personal</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label for="review-timeframe">Timeframe</label>
            <input type="text" id="review-timeframe" value="${escapeHtml(entry.timeframe || '')}" placeholder='e.g. "1995", "Fall 2015"'>
        </div>
        <div class="form-group">
            <label for="review-title">Title</label>
            <input type="text" id="review-title" value="${escapeHtml(entry.title || '')}" placeholder="Title">
        </div>
        <div class="form-group">
            <label for="review-content">Content</label>
            <textarea id="review-content" rows="7">${contentVal}</textarea>
        </div>
        <div class="form-group">
            <label>Tags</label>
            <div class="tag-selector" id="review-tag-selector">${tagsHtml}</div>
        </div>
        <div class="form-group">
            <label for="review-emotion">Emotion</label>
            <input type="text" id="review-emotion" value="${emotionVal}" placeholder="1–3 words describing the emotional tone">
        </div>
    </div>`;
}

function getReviewFormValues(originalEntry) {
    const tags = Array.from(
        document.querySelectorAll('#review-tag-selector .tag-btn.selected')
    ).map(btn => btn.dataset.tag);

    return {
        ...originalEntry,
        type:      document.getElementById('review-type').value,
        title:     document.getElementById('review-title').value.trim(),
        content:   document.getElementById('review-content').value.trim(),
        context:   document.getElementById('review-context').value,
        tags,
        emotion:   document.getElementById('review-emotion').value.trim(),
        timeframe: document.getElementById('review-timeframe').value.trim(),
        approved:  true,
    };
}

// ============================================
// TIMELINE RENDERING
// ============================================

function renderTimeline() {
    const container = document.getElementById('timeline-container');
    const entries   = getFilteredEntries('timeline');

    if (entries.length === 0) {
        container.innerHTML = '<div class="timeline-empty"><p>No entries match your filters.</p></div>';
        return;
    }

    entries.sort((a, b) => new Date(b.sortDate || b.createdAt) - new Date(a.sortDate || a.createdAt));

    const groups = {};
    entries.forEach(entry => {
        const year = new Date(entry.sortDate || entry.createdAt).getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(entry);
    });

    let html = '';
    Object.keys(groups).sort((a, b) => b - a).forEach(year => {
        html += '<div class="timeline-year-group">';
        html += '<div class="timeline-year-label">' + year + '</div>';
        groups[year].forEach(entry => { html += renderEntryCard(entry); });
        html += '</div>';
    });

    container.innerHTML = html;
    attachEntryListeners(container);
    updateTagFilterOptions();
}

// ============================================
// ENTRY CARD RENDERER
// ============================================

function renderEntryCard(entry) {
    const typeLabels = { memory: 'Memory', buildlog: 'Build Log', reflection: 'Reflection' };
    const badgeClass = { memory: 'badge-memory', buildlog: 'badge-buildlog', reflection: 'badge-reflection' };

    const date      = new Date(entry.sortDate || entry.createdAt);
    const dateStr   = formatDate(date);
    const contextStr = entry.context ? ' &middot; ' + capitalize(entry.context) : '';

    let excerpt = entry.content || entry.description || entry.what || '';
    const shortExcerpt = excerpt.length > 200 ? excerpt.slice(0, 200) + '...' : excerpt;

    let fullContent = '';
    if (entry.type === 'memory' || entry.type === 'buildlog') {
        const mainText = entry.content || entry.description || entry.what || '';
        fullContent = buildField('Content', mainText);
        if (entry.emotion || entry.emotionalResponse) {
            fullContent += buildField('Emotion', entry.emotion || entry.emotionalResponse);
        }
        if (entry.timeframe) fullContent += buildField('Timeframe', entry.timeframe);
    } else if (entry.type === 'reflection') {
        if (entry.prompt) fullContent += buildField('Prompt', entry.prompt);
        fullContent += buildField('Response', entry.description || '');
    }

    const tagsHtml = (entry.tags || []).map(t =>
        '<span class="entry-tag">' + escapeHtml(t) + '</span>'
    ).join('');

    return `
        <div class="timeline-entry type-${entry.type}" data-id="${entry.id}">
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
        </div>
    `;
}

function buildField(label, value) {
    if (!value) return '';
    return `<div class="entry-field">
        <div class="entry-field-label">${escapeHtml(label)}</div>
        <div class="entry-field-value">${escapeHtml(value)}</div>
    </div>`;
}

// ============================================
// FILTERING
// ============================================

function getFilteredEntries(view) {
    // Only show approved entries (or old entries without the approved field)
    let entries = loadEntries().filter(e => e.approved !== false);

    if (view === 'timeline') {
        const activeTypeFilter = document.querySelector('.timeline-filters .filter-btn.active');
        const typeFilter = activeTypeFilter ? activeTypeFilter.dataset.filterType : 'all';
        if (typeFilter !== 'all') {
            entries = entries.filter(e => e.type === typeFilter);
        }

        const tagFilter = document.getElementById('timeline-tag-filter').value;
        if (tagFilter) {
            entries = entries.filter(e => e.tags && e.tags.includes(tagFilter));
        }

        const search = document.getElementById('timeline-search').value.toLowerCase();
        if (search) {
            entries = entries.filter(e =>
                (e.title       && e.title.toLowerCase().includes(search)) ||
                (e.content     && e.content.toLowerCase().includes(search)) ||
                (e.description && e.description.toLowerCase().includes(search))
            );
        }
    }

    return entries;
}

function updateTagFilterOptions() {
    const select = document.getElementById('timeline-tag-filter');
    if (!select) return;
    const currentVal = select.value;
    const allTags = new Set();
    loadEntries()
        .filter(e => e.approved !== false)
        .forEach(e => (e.tags || []).forEach(t => allTags.add(t)));

    let options = '<option value="">All tags</option>';
    Array.from(allTags).sort().forEach(tag => {
        const selected = tag === currentVal ? ' selected' : '';
        options += `<option value="${escapeHtml(tag)}"${selected}>${escapeHtml(tag)}</option>`;
    });
    select.innerHTML = options;
}

function initTimelineFilters() {
    document.querySelectorAll('.timeline-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeline-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTimeline();
        });
    });

    document.getElementById('timeline-tag-filter').addEventListener('change', () => renderTimeline());

    let searchTimeout;
    document.getElementById('timeline-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderTimeline(), 300);
    });
}

// ============================================
// ENTRY INTERACTIONS
// ============================================

function attachEntryListeners(container) {
    container.querySelectorAll('.entry-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id     = btn.dataset.id;
            const fullEl = document.getElementById('full-' + id);
            const isExpanded = fullEl.classList.toggle('expanded');
            btn.textContent = isExpanded ? 'Show less' : 'Show more';
        });
    });
}

let pendingDeleteId      = null;
let pendingDeleteIsReview = false;

function initDeleteModal() {
    document.getElementById('confirm-delete').addEventListener('click', () => {
        if (!pendingDeleteId) return;

        // Best-effort Neo4j delete
        Neo4j.query(
            'MATCH (e:TrackerEntry {id: $id}) DETACH DELETE e',
            { id: pendingDeleteId }
        ).catch(err => console.warn('[Neo4j] delete failed:', err));

        deleteEntry(pendingDeleteId);
        showToast('Entry deleted.', 'success');

        if (pendingDeleteIsReview) {
            reviewState.entries = reviewState.entries.filter(e => e.id !== pendingDeleteId);
            if (reviewState.currentIndex >= reviewState.entries.length && reviewState.currentIndex > 0) {
                reviewState.currentIndex--;
            }
            setUnapprovedCount(reviewState.entries.length);
        }

        pendingDeleteId       = null;
        pendingDeleteIsReview = false;
        document.getElementById('delete-modal').style.display = 'none';

        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (activeTab === 'timeline') renderTimeline();
        if (activeTab === 'review')   renderReviewPanel();
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
        pendingDeleteId       = null;
        pendingDeleteIsReview = false;
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
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(date) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className   = 'toast ' + (type || '');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTimelineFilters();
    initDeleteModal();

    // Converse is the default active tab — initialize immediately
    converseInitialized = true;
    initConverseTab();

    // Fetch unapproved count for the Review badge without waiting
    Neo4j.getUnapproved()
        .then(data => setUnapprovedCount((data.entries || []).length))
        .catch(() => {});

    Neo4j.health()
        .then(r => console.log('[Neo4j] status:', r.neo4j))
        .catch(err => console.warn('[Neo4j] unreachable:', err));

    console.log('Dissertation Tracker initialized.');
});
