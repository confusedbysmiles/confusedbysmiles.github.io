// ============================================
// DISSERTATION TRACKER - Main Application
// ============================================
// Storage: localStorage with JSON export/import
// All data stays in the browser until you export it.

// ============================================
// CONFIGURATION
// ============================================

// Replace with your Cloudflare Worker URL for AI reflection prompts.
// Leave empty to disable AI features (forms still work without it).
const REFLECTION_API_ENDPOINT = '';

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

function addEntry(entry) {
    const entries = loadEntries();
    entry.id = generateId();
    entry.createdAt = new Date().toISOString();
    entries.push(entry);
    saveEntries(entries);
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
            if (tabName === 'entries') renderEntries();
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

        const saved = addEntry(entry);
        showToast('Memory saved!', 'success');
        form.reset();
        clearSelectedTags('memory-tag-selector');

        // Show reflection option
        showReflectionOption('memory', saved);
    });
}

// ============================================
// BUILD LOG FORM
// ============================================

function initBuildLogForm() {
    const form = document.getElementById('buildlog-form');
    form.addEventListener('submit', e => {
        e.preventDefault();

        const entry = {
            type: 'buildlog',
            title: document.getElementById('buildlog-what').value.trim().slice(0, 80),
            what: document.getElementById('buildlog-what').value.trim(),
            why: document.getElementById('buildlog-why').value.trim(),
            challenges: document.getElementById('buildlog-challenges').value.trim(),
            questions: document.getElementById('buildlog-questions').value.trim(),
            link: document.getElementById('buildlog-link').value.trim(),
            tags: getSelectedTags('buildlog-tag-selector'),
            sortDate: new Date().toISOString()
        };

        const saved = addEntry(entry);
        showToast('Build log saved!', 'success');
        form.reset();
        clearSelectedTags('buildlog-tag-selector');

        // Show reflection option
        showReflectionOption('buildlog', saved);
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

function showReflectionOption(formType, savedEntry) {
    if (!REFLECTION_API_ENDPOINT) return;

    const reflectBtn = document.getElementById(formType + '-reflect-btn');
    reflectBtn.style.display = 'inline-block';
    reflectBtn.onclick = () => requestReflection(formType, savedEntry);
}

async function requestReflection(formType, entry) {
    const panel = document.getElementById(formType + '-reflection-panel');
    const content = document.getElementById(formType + '-reflection-content');
    const reflectBtn = document.getElementById(formType + '-reflect-btn');

    panel.style.display = 'block';
    content.innerHTML = '<p class="loading-dots">Generating reflection prompt</p>';
    reflectBtn.style.display = 'none';

    try {
        // Get recent entries for context
        const recentEntries = loadEntries()
            .filter(e => e.id !== entry.id)
            .slice(-5)
            .map(e => ({
                type: e.type,
                title: e.title,
                tags: e.tags,
                timeframe: e.timeframe
            }));

        const response = await fetch(REFLECTION_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reflect',
                entry: entry,
                recentEntries: recentEntries
            })
        });

        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        content.innerHTML = '<p>' + escapeHtml(data.reflection) + '</p>';
    } catch (err) {
        console.error('Reflection error:', err);
        // Fallback to local reflection prompts
        const prompt = generateLocalReflection(entry);
        content.innerHTML = '<p>' + escapeHtml(prompt) + '</p>';
    }

    // Wire up save/skip buttons
    document.getElementById('save-' + formType + '-reflection').onclick = () => {
        const response = document.getElementById(formType + '-reflection-response').value.trim();
        if (response) {
            addEntry({
                type: 'reflection',
                title: 'Reflection on: ' + entry.title,
                description: response,
                prompt: content.textContent,
                parentId: entry.id,
                parentType: entry.type,
                tags: entry.tags || [],
                sortDate: new Date().toISOString()
            });
            showToast('Reflection saved!', 'success');
        }
        panel.style.display = 'none';
        document.getElementById(formType + '-reflection-response').value = '';
    };

    document.getElementById('skip-' + formType + '-reflection').onclick = () => {
        panel.style.display = 'none';
        document.getElementById(formType + '-reflection-response').value = '';
    };
}

// Local fallback reflection prompts (no API needed)
function generateLocalReflection(entry) {
    const memoryPrompts = [
        'How does this experience connect to the tools you\'re building for students today?',
        'What would your younger self think about the Math Generator you\'re creating?',
        'Is there a design decision in your Math Generator that directly responds to this memory?',
        'If you could redesign the educational experience from this memory, what would you change?',
        'How does this memory inform what "student agency" means to you?',
        'What emotions come up when you think about students having similar experiences today?',
        'Does this memory reveal something about your teaching philosophy that you hadn\'t articulated before?'
    ];

    const buildPrompts = [
        'Does this build decision connect to any of your documented memories? Which ones and why?',
        'How does this choice center student agency? What alternatives did you reject?',
        'If a student struggling with Algebra 1 saw this feature, what would they think?',
        'What assumption about learning is embedded in this design choice?',
        'How does this decision reflect your experience as both a student and teacher?',
        'What would you tell a colleague about why this choice matters for equity?',
        'Is there a tension between technical constraints and pedagogical ideals here?'
    ];

    const prompts = entry.type === 'memory' ? memoryPrompts : buildPrompts;

    // Pick a prompt, biased by tags if possible
    if (entry.tags && entry.tags.includes('equity')) {
        return 'You tagged this with "equity." How does this connect to the structural barriers your students face in math?';
    }
    if (entry.tags && entry.tags.includes('frustration')) {
        return 'You noted frustration here. How is that frustration shaping what you build differently?';
    }
    if (entry.tags && entry.tags.includes('breakthrough')) {
        return 'This was a breakthrough moment. What conditions made it possible, and how are you recreating those conditions in your tool?';
    }
    if (entry.tags && entry.tags.includes('agency')) {
        return 'You flagged "agency" here. What specific moment made you feel like you had (or lacked) control over your own learning?';
    }

    return prompts[Math.floor(Math.random() * prompts.length)];
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
// ALL ENTRIES RENDERING
// ============================================

function renderEntries() {
    const list = document.getElementById('entries-list');
    const statsEl = document.getElementById('entries-stats');
    const allEntries = loadEntries();
    const searchTerm = document.getElementById('entries-search').value.toLowerCase();

    let entries = allEntries;
    if (searchTerm) {
        entries = entries.filter(e =>
            (e.title && e.title.toLowerCase().includes(searchTerm)) ||
            (e.description && e.description.toLowerCase().includes(searchTerm)) ||
            (e.what && e.what.toLowerCase().includes(searchTerm)) ||
            (e.why && e.why.toLowerCase().includes(searchTerm)) ||
            (e.tags && e.tags.some(t => t.includes(searchTerm)))
        );
    }

    // Sort: most recently created first
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Stats
    const memories = allEntries.filter(e => e.type === 'memory').length;
    const buildlogs = allEntries.filter(e => e.type === 'buildlog').length;
    const reflections = allEntries.filter(e => e.type === 'reflection').length;
    const allTags = new Set();
    allEntries.forEach(e => (e.tags || []).forEach(t => allTags.add(t)));

    statsEl.innerHTML = `
        <div class="stat-card"><span class="stat-number">${allEntries.length}</span><span class="stat-label">Total Entries</span></div>
        <div class="stat-card"><span class="stat-number">${memories}</span><span class="stat-label">Memories</span></div>
        <div class="stat-card"><span class="stat-number">${buildlogs}</span><span class="stat-label">Build Logs</span></div>
        <div class="stat-card"><span class="stat-number">${reflections}</span><span class="stat-label">Reflections</span></div>
        <div class="stat-card"><span class="stat-number">${allTags.size}</span><span class="stat-label">Unique Tags</span></div>
    `;

    if (entries.length === 0) {
        list.innerHTML = '<div class="timeline-empty"><p>No entries found.</p></div>';
        return;
    }

    list.innerHTML = entries.map(e => renderEntryCard(e, true)).join('');
    attachEntryListeners(list);
}

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

function initEntriesSearch() {
    let searchTimeout;
    document.getElementById('entries-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderEntries(), 300);
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
                setTimeout(() => requestReflection(tabName, entry), 100);
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
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'timeline') renderTimeline();
            if (activeTab === 'entries') renderEntries();
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
        pendingDeleteId = null;
        document.getElementById('delete-modal').style.display = 'none';
    });
}

// ============================================
// EXPORT / IMPORT
// ============================================

function initExportImport() {
    // Export JSON
    document.getElementById('export-json-btn').addEventListener('click', () => {
        const entries = loadEntries();
        const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'dissertation-tracker-' + dateStamp() + '.json');
        showToast('Exported ' + entries.length + ' entries as JSON.', 'success');
    });

    // Import JSON
    document.getElementById('import-json-input').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const imported = JSON.parse(evt.target.result);
                if (!Array.isArray(imported)) throw new Error('Expected an array');

                const existing = loadEntries();
                const existingIds = new Set(existing.map(e => e.id));
                let added = 0;

                imported.forEach(entry => {
                    if (!existingIds.has(entry.id)) {
                        existing.push(entry);
                        added++;
                    }
                });

                saveEntries(existing);
                showToast('Imported ' + added + ' new entries (' + (imported.length - added) + ' duplicates skipped).', 'success');
                renderEntries();
            } catch (err) {
                showToast('Invalid JSON file: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset so same file can be selected again
    });

    // Export CSV
    document.getElementById('export-csv-btn').addEventListener('click', () => {
        const entries = loadEntries();
        const csvRows = [];

        // Header
        csvRows.push([
            'id', 'type', 'title', 'createdAt', 'sortDate', 'timeframe',
            'context', 'description', 'what', 'why', 'challenges',
            'questions', 'link', 'tags', 'emotion', 'prompt'
        ].join(','));

        entries.forEach(e => {
            csvRows.push([
                csvField(e.id),
                csvField(e.type),
                csvField(e.title),
                csvField(e.createdAt),
                csvField(e.sortDate),
                csvField(e.timeframe),
                csvField(e.context),
                csvField(e.description),
                csvField(e.what),
                csvField(e.why),
                csvField(e.challenges),
                csvField(e.questions),
                csvField(e.link),
                csvField((e.tags || []).join('; ')),
                csvField(e.emotion),
                csvField(e.prompt)
            ].join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        downloadBlob(blob, 'dissertation-tracker-' + dateStamp() + '.csv');
        showToast('Exported ' + entries.length + ' entries as CSV.', 'success');
    });
}

function csvField(value) {
    if (value == null) return '""';
    const str = String(value).replace(/"/g, '""');
    return '"' + str + '"';
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function dateStamp() {
    return new Date().toISOString().slice(0, 10);
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
    initBuildLogForm();
    initTimelineFilters();
    initEntriesSearch();
    initDeleteModal();
    initExportImport();

    console.log('Dissertation Tracker initialized.');
});
