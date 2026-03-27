import { apiGet } from './api-client.js';
import { qsa, setMoneyDisplaySettings } from './shared.js';

const DEFAULT_SITE_NAME = 'TikTok Admin Inventory';
const DEFAULT_ADMIN_PANEL_TITLE = 'Inventory';
const DEFAULT_CURRENCY = {
    code: 'USD',
    symbol: '$',
    country: 'United States',
    name: 'United States dollar',
};

export async function loadBranding() {
    try {
        const branding = normalizeBranding(await apiGet('settings.public_branding'));
        applyBranding(branding);
        return branding;
    } catch (error) {
        const fallback = normalizeBranding({ logo_path: '' });
        applyBranding(fallback);
        return fallback;
    }
}

export function applyBranding(rawBranding = {}) {
    const branding = normalizeBranding(rawBranding);
    setMoneyDisplaySettings(branding.currency);

    qsa('[data-brand-mark]').forEach((mark) => {
        const fallback = mark.dataset.brandFallback || 'TA';
        mark.classList.remove('has-logo');
        mark.replaceChildren();

        if (!branding.logo_path) {
            mark.textContent = fallback;
            return;
        }

        const image = document.createElement('img');
        image.src = resolveBrandingPath(branding.logo_path);
        image.alt = branding.site_name || 'Shop logo';
        image.addEventListener('error', () => {
            mark.classList.remove('has-logo');
            mark.replaceChildren(document.createTextNode(fallback));
        }, { once: true });

        mark.classList.add('has-logo');
        mark.appendChild(image);
    });

    qsa('[data-brand-text]').forEach((node) => {
        const kind = node.dataset.brandText || 'site_name';
        if (kind === 'admin_panel_title') {
            node.textContent = branding.admin_panel_title || DEFAULT_ADMIN_PANEL_TITLE;
            return;
        }

        node.textContent = branding.site_name || DEFAULT_SITE_NAME;
    });

    const context = document.body?.dataset?.brandContext || '';
    if (context === 'shop') {
        document.title = branding.site_name || DEFAULT_SITE_NAME;
    } else if (context === 'admin') {
        document.title = `${branding.admin_panel_title || DEFAULT_ADMIN_PANEL_TITLE} | ${branding.site_name || DEFAULT_SITE_NAME}`;
    } else if (context === 'admin-login') {
        document.title = `Admin Login | ${branding.site_name || DEFAULT_SITE_NAME}`;
    }

    return branding;
}

export function resolveBrandingPath(path) {
    const trimmedPath = String(path || '').trim();
    if (!trimmedPath) {
        return '';
    }

    if (/^(https?:|data:|blob:)/i.test(trimmedPath) || trimmedPath.startsWith('/')) {
        return trimmedPath;
    }

    const basePrefix = globalThis.APP_BASE_PREFIX || './';
    const rootUrl = new URL(basePrefix, window.location.href);
    return new URL(trimmedPath, rootUrl).toString();
}

function normalizeBranding(rawBranding = {}) {
    return {
        site_name: String(rawBranding.site_name || '').trim() || DEFAULT_SITE_NAME,
        admin_panel_title: String(rawBranding.admin_panel_title || '').trim() || DEFAULT_ADMIN_PANEL_TITLE,
        logo_path: String(rawBranding.logo_path || '').trim(),
        currency: {
            code: String(rawBranding?.currency?.code || rawBranding.currency_code || DEFAULT_CURRENCY.code).trim().toUpperCase() || DEFAULT_CURRENCY.code,
            symbol: String(rawBranding?.currency?.symbol || rawBranding.currency_symbol || DEFAULT_CURRENCY.symbol).trim() || DEFAULT_CURRENCY.symbol,
            country: String(rawBranding?.currency?.country || rawBranding.currency_country || DEFAULT_CURRENCY.country).trim() || DEFAULT_CURRENCY.country,
            name: String(rawBranding?.currency?.name || rawBranding.currency_name || DEFAULT_CURRENCY.name).trim() || DEFAULT_CURRENCY.name,
            search_label: String(rawBranding?.currency?.search_label || rawBranding.currency_search_label || '').trim(),
        },
    };
}
