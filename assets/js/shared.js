export function qs(selector, root = document) {
    return root.querySelector(selector);
}

export function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const DEFAULT_MONEY_SETTINGS = {
    code: 'USD',
    symbol: '$',
};

let activeMoneySettings = { ...DEFAULT_MONEY_SETTINGS };
const numberFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function setMoneyDisplaySettings(settings = {}) {
    const code = String(settings.code || settings.currency_code || DEFAULT_MONEY_SETTINGS.code).trim().toUpperCase();
    const symbol = String(settings.symbol || settings.currency_symbol || DEFAULT_MONEY_SETTINGS.symbol).trim() || DEFAULT_MONEY_SETTINGS.symbol;
    activeMoneySettings = {
        code: /^[A-Z]{3}$/.test(code) ? code : DEFAULT_MONEY_SETTINGS.code,
        symbol,
    };
}

export function formatMoney(value) {
    const number = Number(value || 0);
    const symbol = String(activeMoneySettings.symbol || DEFAULT_MONEY_SETTINGS.symbol).trim() || DEFAULT_MONEY_SETTINGS.symbol;
    const separator = symbol.endsWith(' ') ? '' : (/[\p{L}\p{N}.]$/u.test(symbol) ? ' ' : '');
    const formattedNumber = numberFormatter.format(Math.abs(number));
    const prefix = number < 0 ? '-' : '';
    return `${prefix}${symbol}${separator}${formattedNumber}`;
}

export function showToast(message, timeout = 3000) {
    let region = qs('.toast-region');
    if (!region) {
        region = document.createElement('div');
        region.className = 'toast-region';
        document.body.appendChild(region);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    region.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, timeout);
}

export function setButtonLoading(button, isLoading, label = 'Working...') {
    if (!button) {
        return;
    }

    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.textContent = label;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
        }
    }
}

export function pageParam() {
    const params = new URLSearchParams(window.location.search);
    return params.get('page');
}

export function setPageParam(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.replaceState({}, '', url);
}

export function modalShell(title, bodyHtml, modalClass = '') {
    const className = ['modal', modalClass].filter(Boolean).join(' ');
    return `
        <div class="modal-backdrop" data-modal-backdrop>
            <div class="${escapeHtml(className)}">
                <div class="panel-head">
                    <h2 class="panel-title">${escapeHtml(title)}</h2>
                    <button class="ghost-button" type="button" data-close-modal>Close</button>
                </div>
                ${bodyHtml}
            </div>
        </div>
    `;
}

function passwordToggleIcon(isVisible) {
    if (isVisible) {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c5.2 0 8.8 4.4 9.8 6-0.4.7-1.4 2-2.9 3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.2 6.2C3.9 7.7 2.5 9.7 2 11c0.9 1.5 4.5 6 10 6 1.1 0 2.1-.2 3-.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }

    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>';
}

export function enhancePasswordFields(root = document) {
    qsa('input[type="password"]', root).forEach((input) => {
        if (!(input instanceof HTMLInputElement) || input.dataset.passwordEnhanced === '1') {
            return;
        }

        input.dataset.passwordEnhanced = '1';
        const wrapper = document.createElement('div');
        wrapper.className = 'password-input-shell';
        input.parentNode?.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'password-toggle';
        button.setAttribute('aria-label', 'Show password');
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = passwordToggleIcon(false);

        button.addEventListener('click', () => {
            const isVisible = input.type === 'text';
            input.type = isVisible ? 'password' : 'text';
            button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
            button.setAttribute('aria-pressed', isVisible ? 'false' : 'true');
            button.innerHTML = passwordToggleIcon(!isVisible);
        });

        wrapper.appendChild(button);
    });
}

export function mountModal(html) {
    closeModal();
    document.body.insertAdjacentHTML('beforeend', html);
    const backdrop = qs('[data-modal-backdrop]');
    if (!backdrop) {
        return null;
    }

    enhancePasswordFields(backdrop);

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop || event.target.closest('[data-close-modal]')) {
            closeModal();
        }
    });

    return backdrop;
}

export function closeModal() {
    qs('[data-modal-backdrop]')?.remove();
}

export function statusClass(status) {
    return `status-${String(status || '').replace(/\s+/g, '_')}`;
}

export function icon(name) {
    const icons = {
        shop: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8h16l-1.2 11H5.2L4 8Z" stroke="currentColor" stroke-width="1.7"/><path d="M9 8a3 3 0 1 1 6 0" stroke="currentColor" stroke-width="1.7"/></svg>',
        dashboard: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h7v7H4zM13 4h7v11h-7zM4 13h7v7H4zM13 17h7v3h-7z" fill="currentColor"/></svg>',
        products: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4 7l8 4 8-4-8-4ZM4 7v10l8 4 8-4V7" stroke="currentColor" stroke-width="1.7"/></svg>',
        orders: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 4h10v16H7z" stroke="currentColor" stroke-width="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.7"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.7"/></svg>',
        inventory: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 7V4h10v3M6 7v13h12V7" stroke="currentColor" stroke-width="1.7"/><path d="M12 10v7M9 14h6" stroke="currentColor" stroke-width="1.7"/></svg>',
        reports: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" stroke-width="1.7"/></svg>',
        notifications: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 16V11a5 5 0 1 1 10 0v5l2 2H5l2-2Z" stroke="currentColor" stroke-width="1.7"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" stroke-width="1.7"/><path d="M19 12a7 7 0 0 0-.08-1l2.02-1.57-2-3.46-2.42.82a7.32 7.32 0 0 0-1.72-1L14.5 3h-4.99l-.3 2.79a7.32 7.32 0 0 0-1.72 1l-2.42-.82-2 3.46L5.09 11a7 7 0 0 0 0 2l-2.02 1.57 2 3.46 2.42-.82a7.32 7.32 0 0 0 1.72 1l.3 2.79h4.99l.3-2.79a7.32 7.32 0 0 0 1.72-1l2.42.82 2-3.46L18.92 13c.05-.33.08-.66.08-1Z" stroke="currentColor" stroke-width="1.7"/></svg>',
    };

    return icons[name] || icons.dashboard;
}
