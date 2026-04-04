// ============================================
// AUTH - Dissertation Tracker
// ============================================
// Manages session state in localStorage.
// Keys:
//   AUTH_TOKEN  — the session token (UUID)
//   AUTH_USER   — JSON: { username, role }
//
// The backend validates tokens on protected routes.
// If a token is expired/invalid the worker returns 401;
// callers should call Auth.handleUnauthorized() in that case.
// ============================================

const Auth = (() => {
    const TOKEN_KEY = 'AUTH_TOKEN';
    const USER_KEY  = 'AUTH_USER';

    function isLoggedIn() {
        return !!localStorage.getItem(TOKEN_KEY);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function login(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    // Call when a 401 is received — clears state and shows login modal
    function handleUnauthorized() {
        logout();
        showLoginModal();
    }

    // ── Modal helpers ────────────────────────────────────────────────────────

    function showLoginModal() {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.style.display = 'flex';
            const usernameInput = document.getElementById('login-username');
            if (usernameInput) usernameInput.focus();
        }
    }

    function hideLoginModal() {
        const modal = document.getElementById('login-modal');
        if (modal) modal.style.display = 'none';
    }

    function showRequestModal() {
        hideLoginModal();
        const modal = document.getElementById('request-modal');
        if (modal) {
            modal.style.display = 'flex';
            const nameInput = document.getElementById('request-name');
            if (nameInput) nameInput.focus();
        }
    }

    function hideRequestModal() {
        const modal = document.getElementById('request-modal');
        if (modal) modal.style.display = 'none';
    }

    function showAdminModal() {
        const modal = document.getElementById('admin-modal');
        if (modal) {
            modal.style.display = 'flex';
            loadPendingRequests();
        }
    }

    function hideAdminModal() {
        const modal = document.getElementById('admin-modal');
        if (modal) modal.style.display = 'none';
    }

    // ── Update the auth button in the title bar ──────────────────────────────

    function updateAuthButton() {
        const btn = document.getElementById('auth-btn');
        const adminBtn = document.getElementById('admin-btn');
        if (!btn) return;

        const user = getUser();
        if (isLoggedIn() && user) {
            btn.textContent = 'Log out (' + user.username + ')';
            btn.onclick = () => {
                logout();
                updateAuthButton();
                showToastIfAvailable('Logged out.', 'success');
            };
            if (adminBtn) {
                adminBtn.style.display = user.role === 'admin' ? 'inline-block' : 'none';
            }
        } else {
            btn.textContent = 'Log in';
            btn.onclick = () => showLoginModal();
            if (adminBtn) adminBtn.style.display = 'none';
        }
    }

    // ── Login form submission ────────────────────────────────────────────────

    async function submitLogin() {
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        const errorEl    = document.getElementById('login-error');
        const submitBtn  = document.getElementById('login-submit');

        const username = usernameEl ? usernameEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value : '';

        if (!username || !password) {
            if (errorEl) errorEl.textContent = 'Please enter both username and password.';
            return;
        }

        if (submitBtn) { submitBtn.textContent = 'Logging in…'; submitBtn.disabled = true; }
        if (errorEl) errorEl.textContent = '';

        try {
            const resp = await fetch(WORKER_URL + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                if (errorEl) errorEl.textContent = data.error || 'Login failed. Check your credentials.';
                return;
            }

            login(data.token, { username: data.username, role: data.role });
            hideLoginModal();
            updateAuthButton();
            showToastIfAvailable('Welcome, ' + data.username + '!', 'success');

            // Clear form
            if (usernameEl) usernameEl.value = '';
            if (passwordEl) passwordEl.value = '';

        } catch (err) {
            console.error('[Auth] login error:', err);
            if (errorEl) errorEl.textContent = 'Network error. Please try again.';
        } finally {
            if (submitBtn) { submitBtn.textContent = 'Log in'; submitBtn.disabled = false; }
        }
    }

    // ── Account request form submission ─────────────────────────────────────

    async function submitRequest() {
        const nameEl     = document.getElementById('request-name');
        const usernameEl = document.getElementById('request-username');
        const emailEl    = document.getElementById('request-email');
        const reasonEl   = document.getElementById('request-reason');
        const errorEl    = document.getElementById('request-error');
        const submitBtn  = document.getElementById('request-submit');

        const name     = nameEl     ? nameEl.value.trim()     : '';
        const username = usernameEl ? usernameEl.value.trim() : '';
        const email    = emailEl    ? emailEl.value.trim()    : '';
        const reason   = reasonEl   ? reasonEl.value.trim()   : '';

        if (!name || !username || !email || !reason) {
            if (errorEl) errorEl.textContent = 'All fields are required.';
            return;
        }

        if (submitBtn) { submitBtn.textContent = 'Sending…'; submitBtn.disabled = true; }
        if (errorEl) errorEl.textContent = '';

        try {
            const resp = await fetch(WORKER_URL + '/auth/register-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, email, reason }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                if (errorEl) errorEl.textContent = data.error || 'Request failed. Please try again.';
                return;
            }

            hideRequestModal();
            showToastIfAvailable('Request sent! Sam will review it soon.', 'success');

            // Clear form
            if (nameEl)     nameEl.value     = '';
            if (usernameEl) usernameEl.value = '';
            if (emailEl)    emailEl.value    = '';
            if (reasonEl)   reasonEl.value   = '';

        } catch (err) {
            console.error('[Auth] request error:', err);
            if (errorEl) errorEl.textContent = 'Network error. Please try again.';
        } finally {
            if (submitBtn) { submitBtn.textContent = 'Send Request'; submitBtn.disabled = false; }
        }
    }

    // ── Admin: load and render pending requests ──────────────────────────────

    async function loadPendingRequests() {
        const listEl  = document.getElementById('admin-requests-list');
        const errorEl = document.getElementById('admin-error');
        if (!listEl) return;

        listEl.innerHTML = '<p class="admin-loading">Loading requests…</p>';
        if (errorEl) errorEl.textContent = '';

        const token = getToken();
        if (!token) {
            listEl.innerHTML = '<p class="admin-loading">Not logged in.</p>';
            return;
        }

        try {
            const resp = await fetch(WORKER_URL + '/auth/admin/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });

            const data = await resp.json();

            if (resp.status === 401) {
                handleUnauthorized();
                hideAdminModal();
                return;
            }

            if (!resp.ok) {
                listEl.innerHTML = '<p class="admin-loading">Error: ' + (data.error || 'Unknown error') + '</p>';
                return;
            }

            const requests = data.requests || [];
            if (requests.length === 0) {
                listEl.innerHTML = '<p class="admin-loading">No pending requests.</p>';
                return;
            }

            listEl.innerHTML = requests.map(r => renderRequestCard(r)).join('');
            attachRequestListeners(listEl);

        } catch (err) {
            console.error('[Auth] admin requests error:', err);
            listEl.innerHTML = '<p class="admin-loading">Network error. Please try again.</p>';
        }
    }

    function renderRequestCard(req) {
        const date = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '';
        return `
            <div class="admin-request-card" data-id="${escapeAttr(req.id)}">
                <div class="admin-request-info">
                    <div class="admin-request-name">${escapeHtmlLocal(req.name)} <span class="admin-request-username">(@${escapeHtmlLocal(req.username)})</span></div>
                    <div class="admin-request-email">${escapeHtmlLocal(req.email)}</div>
                    <div class="admin-request-reason">${escapeHtmlLocal(req.reason)}</div>
                    <div class="admin-request-meta">${date} &middot; <span class="admin-request-status status-${escapeAttr(req.status)}">${escapeHtmlLocal(req.status)}</span></div>
                </div>
                ${req.status === 'pending' ? `
                <div class="admin-request-actions">
                    <div class="admin-password-group">
                        <input type="password" class="admin-approve-password" placeholder="Set password for new account" autocomplete="new-password">
                        <span class="admin-password-hint">Required to approve</span>
                    </div>
                    <div class="admin-action-btns">
                        <button class="btn-primary admin-approve-btn" data-id="${escapeAttr(req.id)}">Approve</button>
                        <button class="btn-secondary admin-reject-btn" data-id="${escapeAttr(req.id)}">Reject</button>
                    </div>
                </div>` : ''}
            </div>
        `;
    }

    function attachRequestListeners(container) {
        container.querySelectorAll('.admin-approve-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.admin-request-card');
                const passwordInput = card ? card.querySelector('.admin-approve-password') : null;
                const password = passwordInput ? passwordInput.value : '';
                if (!password) {
                    showToastIfAvailable('Set a password for the new account before approving.', 'error');
                    if (passwordInput) passwordInput.focus();
                    return;
                }
                await handleAdminAction(btn.dataset.id, 'approve', password);
            });
        });

        container.querySelectorAll('.admin-reject-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await handleAdminAction(btn.dataset.id, 'reject', '');
            });
        });
    }

    async function handleAdminAction(requestId, action, password) {
        const token = getToken();
        if (!token) return;

        try {
            const resp = await fetch(WORKER_URL + '/auth/admin/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, requestId, action, password }),
            });

            const data = await resp.json();

            if (resp.status === 401) { handleUnauthorized(); hideAdminModal(); return; }

            if (!resp.ok) {
                showToastIfAvailable(data.error || 'Action failed.', 'error');
                return;
            }

            showToastIfAvailable(
                action === 'approve' ? 'Account created!' : 'Request rejected.',
                'success'
            );
            loadPendingRequests(); // refresh the list
        } catch (err) {
            console.error('[Auth] admin action error:', err);
            showToastIfAvailable('Network error.', 'error');
        }
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    function escapeHtmlLocal(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Gracefully call showToast if it is defined (it lives in tracker.js)
    function showToastIfAvailable(msg, type) {
        if (typeof showToast === 'function') {
            showToast(msg, type);
        }
    }

    // ── Wire up modals on DOMContentLoaded ───────────────────────────────────

    function init() {
        // Login modal
        const loginSubmit  = document.getElementById('login-submit');
        const loginCancel  = document.getElementById('login-cancel');
        const loginOverlay = document.getElementById('login-modal');
        const toRequestLink = document.getElementById('to-request-link');

        if (loginSubmit)  loginSubmit.addEventListener('click', submitLogin);
        if (loginCancel)  loginCancel.addEventListener('click', hideLoginModal);
        if (toRequestLink) toRequestLink.addEventListener('click', e => { e.preventDefault(); showRequestModal(); });

        // Login on Enter key in password field
        const passwordEl = document.getElementById('login-password');
        if (passwordEl) {
            passwordEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') submitLogin();
            });
        }
        const usernameEl = document.getElementById('login-username');
        if (usernameEl) {
            usernameEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') submitLogin();
            });
        }

        // Close login modal when clicking overlay backdrop
        if (loginOverlay) {
            loginOverlay.addEventListener('click', e => {
                if (e.target === loginOverlay) hideLoginModal();
            });
        }

        // Request modal
        const requestSubmit  = document.getElementById('request-submit');
        const requestCancel  = document.getElementById('request-cancel');
        const requestOverlay = document.getElementById('request-modal');
        const backToLogin    = document.getElementById('back-to-login');

        if (requestSubmit) requestSubmit.addEventListener('click', submitRequest);
        if (requestCancel) requestCancel.addEventListener('click', hideRequestModal);
        if (backToLogin)   backToLogin.addEventListener('click', e => { e.preventDefault(); hideRequestModal(); showLoginModal(); });

        if (requestOverlay) {
            requestOverlay.addEventListener('click', e => {
                if (e.target === requestOverlay) hideRequestModal();
            });
        }

        // Admin modal
        const adminCloseBtn = document.getElementById('admin-close-btn');
        const adminOverlay  = document.getElementById('admin-modal');
        const adminBtn      = document.getElementById('admin-btn');

        if (adminCloseBtn) adminCloseBtn.addEventListener('click', hideAdminModal);
        if (adminBtn)      adminBtn.addEventListener('click', showAdminModal);

        if (adminOverlay) {
            adminOverlay.addEventListener('click', e => {
                if (e.target === adminOverlay) hideAdminModal();
            });
        }

        // Refresh button inside admin panel
        const adminRefreshBtn = document.getElementById('admin-refresh-btn');
        if (adminRefreshBtn) adminRefreshBtn.addEventListener('click', loadPendingRequests);

        updateAuthButton();
    }

    return {
        isLoggedIn,
        getToken,
        getUser,
        login,
        logout,
        handleUnauthorized,
        showLoginModal,
        hideLoginModal,
        updateAuthButton,
        init,
    };
})();

// Expose helpers to global scope so tracker.js can use them without a prefix
function isLoggedIn() { return Auth.isLoggedIn(); }
function getToken()   { return Auth.getToken(); }
function getUser()    { return Auth.getUser(); }

document.addEventListener('DOMContentLoaded', () => Auth.init());
