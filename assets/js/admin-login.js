import { apiGet, apiPost } from './api-client.js';
import { loadBranding } from './branding.js';
import { enhancePasswordFields, escapeHtml, qs, setButtonLoading, showToast } from './shared.js';

const DEFAULT_REDIRECT = './?page=dashboard';

async function init() {
    await loadBranding();
    enhancePasswordFields(document);
    bindEvents();
    await refreshSession();
}

function bindEvents() {
    qs('#adminLoginForm')?.addEventListener('submit', handleLogin);
}

async function refreshSession() {
    const session = await apiGet('auth.me');
    const user = session.user;

    if (user?.role === 'admin') {
        window.location.href = redirectTarget();
        return;
    }

    qs('#adminLoginSessionPill').textContent = user ? String(user.role).toUpperCase() : 'Guest';

    const lines = [];
    if (!user) {
        lines.push('<div class="list-item">No one is currently signed in.</div>');
    } else {
        lines.push(`<div class="list-item"><strong>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong><br><span class="muted">${escapeHtml(user.email)}</span></div>`);
        lines.push('<div class="list-item">This current session is not an admin session. Logging in here will switch to an admin account if the credentials are valid.</div>');
    }

    qs('#adminLoginSessionSummary').innerHTML = lines.join('');
}

async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    try {
        setButtonLoading(button, true, 'Logging in...');
        const response = await apiPost('auth.login', Object.fromEntries(new FormData(form).entries()));

        if (response.user?.role !== 'admin') {
            await apiPost('auth.logout');
            throw new Error('This account is not an admin account.');
        }

        window.location.href = redirectTarget();
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(button, false, 'Login to Admin');
    }
}

function redirectTarget() {
    const params = new URLSearchParams(window.location.search);
    return params.get('redirect') || DEFAULT_REDIRECT;
}

init().catch((error) => {
    showToast(error.message);
});
