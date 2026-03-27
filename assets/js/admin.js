import { apiGet, apiPost } from './api-client.js';
import { applyBranding, loadBranding, resolveBrandingPath } from './branding.js';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY_OPTION, currencyOptionLabel, findCurrencyOption } from './currency-data.js';
import {
    attachSearchAssist,
    buildHistorySuggestions,
    rankSearchCandidates,
    rememberSearchHistory,
} from './search-assist.js';
import {
    closeModal,
    escapeHtml,
    formatMoney,
    icon,
    modalShell,
    mountModal,
    pageParam,
    qs,
    qsa,
    setButtonLoading,
    setPageParam,
    showToast,
    statusClass,
} from './shared.js';

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', subtitle: 'Overview and alerts', iconKey: 'dashboard' },
    { key: 'products', label: 'Products', subtitle: 'Catalog and stock details', iconKey: 'products' },
    { key: 'categories', label: 'Categories', subtitle: 'Product category labels', iconKey: 'products' },
    { key: 'orders', label: 'Orders', subtitle: 'Transactions and shipments', iconKey: 'orders' },
    { key: 'users', label: 'Customers', subtitle: 'Customer accounts only', iconKey: 'users' },
    { key: 'inventory', label: 'Inventory', subtitle: 'Incoming stock and movements', iconKey: 'inventory' },
    { key: 'reports', label: 'Reports', subtitle: 'Live operational reports', iconKey: 'reports' },
    { key: 'settings', label: 'Settings', subtitle: 'Brand logo and system prefs', iconKey: 'settings' },
];

const REPORT_VIEWS = [
    { key: 'inventory', label: 'Inventory Status', subtitle: 'Current stock levels across active products and item details.' },
    { key: 'outgoing', label: 'Outgoing Orders', subtitle: 'Customer order flow and outbound activity.' },
    { key: 'incoming', label: 'Incoming Orders', subtitle: 'Supplier restock flow and received quantities.' },
];

const PRODUCT_COLOR_OPTIONS = [
    'Black',
    'White',
    'Gray',
    'Silver',
    'Gold',
    'Beige',
    'Brown',
    'Red',
    'Maroon',
    'Pink',
    'Orange',
    'Yellow',
    'Green',
    'Olive',
    'Mint',
    'Teal',
    'Blue',
    'Navy',
    'Purple',
    'Lavender',
];

const BASE_PREFIX = String(globalThis.APP_BASE_PREFIX || '').replace(/\/$/, '');
const STOREFRONT_URL = BASE_PREFIX ? `${BASE_PREFIX}/` : '../';
const ARCHIVE_ENABLED_PAGES = ['products', 'orders', 'users', 'inventory'];
const INITIAL_PAGE = normalizePage(pageParam() || 'dashboard');
const INITIAL_VISIBILITY = normalizeArchiveVisibility(archiveViewParam() || 'active');
let disposePageSearchAssist = () => {};

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        // Ignore storage failures so the admin UI still works.
    }
}

const state = {
    session: null,
    currentPage: INITIAL_PAGE,
    reportView: normalizeReportView(reportViewParam() || 'inventory'),
    settingsCategoryView: 'active',
    sidebarCollapsed: readStorage('admin_sidebar_collapsed') === '1',
    productCache: [],
    productCategories: [],
    notifications: { items: [], unread_count: 0 },
    filters: {
        products: { search: '', stock_status: '', visibility: 'active' },
        orders: { search: '', order_status: '', visibility: 'active' },
        users: { search: '', role: 'customer', visibility: 'active' },
        inventory: { search: '', incoming_status: '', visibility: 'active' },
        reports: { search: '', order_status: '' },
    },
    data: {},
};

if (ARCHIVE_ENABLED_PAGES.includes(INITIAL_PAGE)) {
    state.filters[INITIAL_PAGE].visibility = INITIAL_VISIBILITY;
}

async function init() {
    await loadBranding();
    bindBaseEvents();
    applySidebarState();
    renderNav();
    if (!(await refreshSession())) {
        return;
    }
    await refreshNotifications();
    await Promise.all([ensureProductCache(), loadProductCategories()]);
    await openPage(state.currentPage);
}

function bindBaseEvents() {
    qs('#adminSidebarToggle')?.addEventListener('click', toggleSidebar);
    qs('#adminLogoutButton')?.addEventListener('click', logout);
    qs('#adminNotificationsButton')?.addEventListener('click', () => openNotificationsModal());
    qs('#adminNavList')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-page]');
        if (button) {
            if (button.dataset.adminPage === 'users') {
                state.filters.users.role = 'customer';
            }
            openPage(button.dataset.adminPage);
        }
    });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
}

async function refreshSession() {
    const session = await apiGet('auth.me');
    if (!session.user || session.user.role !== 'admin') {
        window.location.href = STOREFRONT_URL;
        return false;
    }
    state.session = session;
    const badge = qs('#adminSessionBadge');
    if (!badge) {
        return true;
    }
    badge.innerHTML = `
        <div class="admin-account-meta">
            <strong>${escapeHtml(session.user.first_name)} ${escapeHtml(session.user.last_name)}</strong>
            <span class="muted">${escapeHtml(session.user.email)}</span>
        </div>
        <div class="pill">${escapeHtml(session.user.role)}</div>
    `;
    return true;
}

async function refreshNotifications() {
    if (!state.session?.user) {
        return;
    }
    state.notifications = await apiGet('notifications.list', { limit: 30 });
    const notificationCount = qs('#adminNotificationCount');
    if (notificationCount) {
        notificationCount.textContent = state.notifications.unread_count || 0;
    }
}

async function ensureProductCache() {
    state.productCache = (await apiGet('products.list', { visibility: 'active' })).items || [];
}

async function loadProductCategories() {
    const payload = await apiGet('settings.public_categories');
    state.productCategories = Array.isArray(payload.categories) ? payload.categories : [];
}

function applySidebarState() {
    qs('#adminSidebar')?.classList.toggle('collapsed', state.sidebarCollapsed);
    qs('#adminShell')?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
}

function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    writeStorage('admin_sidebar_collapsed', state.sidebarCollapsed ? '1' : '0');
    applySidebarState();
}

function renderNav() {
    const navList = qs('#adminNavList');
    if (!navList) {
        return;
    }
    navList.innerHTML = NAV_ITEMS.map((item) => `
        <button class="nav-item ${state.currentPage === item.key ? 'active' : ''}" type="button" data-admin-page="${item.key}">
            <span>${icon(item.iconKey)}</span>
            <span class="nav-label">${escapeHtml(item.label)}</span>
        </button>
    `).join('');

    const active = NAV_ITEMS.find((item) => item.key === state.currentPage) || NAV_ITEMS[0];
    const isCategoryArchiveView = active.key === 'categories' && state.settingsCategoryView === 'archived';
    const isArchiveView = isCategoryArchiveView || pageVisibility(active.key) === 'archived';
    const archiveTitle = active.key === 'inventory'
        ? 'Incoming Orders Archive'
        : (active.key === 'categories' ? 'Product Categories Archive' : `${active.label} Archive`);
    const archiveSubtitle = active.key === 'inventory'
        ? 'Archive view for incoming orders.'
        : (active.key === 'categories' ? 'Archive view for product category labels.' : `Archive view for ${active.label.toLowerCase()}.`);
    const pageTitle = qs('#adminPageTitle');
    const pageSubtitle = qs('#adminPageSubtitle');
    if (pageTitle) {
        pageTitle.textContent = isArchiveView ? archiveTitle : active.label;
    }
    if (pageSubtitle) {
        pageSubtitle.textContent = isArchiveView ? archiveSubtitle : active.subtitle;
    }
}

async function openPage(page) {
    state.currentPage = normalizePage(page);
    syncRouteState();
    renderNav();
    await loadPage(state.currentPage);
}

function normalizePage(page) {
    return NAV_ITEMS.some((item) => item.key === page) ? page : 'dashboard';
}

function normalizeReportView(view) {
    return REPORT_VIEWS.some((item) => item.key === view) ? view : 'inventory';
}

function reportViewParam() {
    return new URLSearchParams(window.location.search).get('report_view');
}

function archiveViewParam() {
    return new URLSearchParams(window.location.search).get('visibility');
}

function normalizeArchiveVisibility(value) {
    return value === 'archived' ? 'archived' : 'active';
}

function pageVisibility(page = state.currentPage) {
    if (!ARCHIVE_ENABLED_PAGES.includes(page)) {
        return 'active';
    }
    return normalizeArchiveVisibility(state.filters[page]?.visibility || 'active');
}

function syncRouteState() {
    const url = new URL(window.location.href);
    url.searchParams.set('page', state.currentPage);
    if (state.currentPage === 'reports') {
        url.searchParams.set('report_view', state.reportView);
    } else {
        url.searchParams.delete('report_view');
    }
    if (ARCHIVE_ENABLED_PAGES.includes(state.currentPage) && pageVisibility() === 'archived') {
        url.searchParams.set('visibility', 'archived');
    } else {
        url.searchParams.delete('visibility');
    }
    window.history.replaceState({}, '', url);
}

function openReportView(view) {
    state.reportView = normalizeReportView(view);
    syncRouteState();
    renderReportsPage();
}

async function loadPage(page) {
    const content = qs('#adminPageContent');
    disposePageSearchAssist();
    disposePageSearchAssist = () => {};
    content.innerHTML = '<div class="panel">Loading...</div>';

    try {
        if (page === 'dashboard') {
            state.data.dashboard = await apiGet('reports.dashboard');
            renderDashboard();
            return;
        }

        if (page === 'products') {
            state.data.products = (await apiGet('products.list', state.filters.products)).items;
            renderProductsPage();
            return;
        }

        if (page === 'orders') {
            state.data.orders = (await apiGet('orders.list', state.filters.orders)).items;
            renderOrdersPage();
            return;
        }

        if (page === 'users') {
            state.data.users = (await apiGet('users.list', state.filters.users)).items;
            renderUsersPage();
            return;
        }

        if (page === 'inventory') {
            const [incoming, movements, report] = await Promise.all([
                apiGet('inventory.incoming_list', state.filters.inventory),
                apiGet('inventory.movements', { search: state.filters.inventory.search }),
                apiGet('reports.inventory', { stock_status: 'low_stock' }),
            ]);
            state.data.inventory = {
                incoming: incoming.items,
                movements: movements.items,
                lowStock: report.inventory,
            };
            renderInventoryPage();
            return;
        }

        if (page === 'reports') {
            const [inventory, orders] = await Promise.all([
                apiGet('reports.inventory', state.filters.reports),
                apiGet('reports.orders', state.filters.reports),
            ]);
            state.data.reports = { inventory, orders };
            renderReportsPage();
            return;
        }

        if (page === 'settings') {
            const branding = await apiGet('settings.public_branding');
            state.data.branding = branding;
            renderSettingsPage();
            return;
        }

        if (page === 'categories') {
            const categoryConfig = await apiGet('settings.public_categories');
            state.data.settingsCategories = normalizeSettingsCategories(categoryConfig);
            state.productCategories = state.data.settingsCategories.categories;
            renderCategoriesPage();
            return;
        }

        await refreshNotifications();
        renderNotificationsPage();
    } catch (error) {
        content.innerHTML = `<div class="panel"><div class="empty-state">${escapeHtml(error.message)}</div></div>`;
    }
}

function renderDashboard() {
    const dashboard = state.data.dashboard;
    const metrics = dashboard.metrics || {};
    const analytics = dashboard.analytics || {};
    const stockBreakdown = Array.isArray(analytics.stock_status_breakdown) ? analytics.stock_status_breakdown : [];
    const orderBreakdown = Array.isArray(analytics.order_status_breakdown) ? analytics.order_status_breakdown : [];
    const salesSeries = Array.isArray(analytics.sales_last_7_days) ? analytics.sales_last_7_days : [];
    const metricCards = [
        {
            label: 'Customers',
            value: metrics.total_customers || 0,
            target: 'customers',
            hint: 'Open customer accounts',
        },
        {
            label: 'Admin Accounts',
            value: metrics.total_admins || 0,
            target: 'admins',
            hint: 'Open admin account list',
        },
        {
            label: 'Open Orders',
            value: metrics.open_orders || 0,
            target: 'open_orders',
            hint: 'Open pending and processing orders',
        },
        {
            label: 'Incoming Orders',
            value: metrics.open_incoming_orders || 0,
            target: 'incoming_orders',
            hint: 'Open active incoming orders',
        },
        {
            label: 'Unread Notifications',
            value: metrics.unread_admin_notifications || 0,
            target: 'notifications',
            hint: 'Open unread notifications',
        },
        {
            label: 'Low / Out of Stock',
            value: `${metrics.low_stock_variants || 0} / ${metrics.out_of_stock_variants || 0}`,
            target: 'stock_attention',
            hint: 'Open low and out-of-stock products',
        },
    ];
    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="metrics-grid">
                ${metricCards.map((item) => `
                    <button class="metric-card metric-card-button" type="button" data-action="open-dashboard-metric" data-target="${escapeHtml(item.target)}">
                        <span class="muted">${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                        <span class="metric-card-hint">${escapeHtml(item.hint)}</span>
                    </button>
                `).join('')}
            </div>
            <div class="split-panel dashboard-analytics-grid">
                <div class="panel">
                    <div class="panel-head">
                        <div class="report-panel-copy">
                            <h2 class="panel-title">Order Status</h2>
                            <p class="muted">Current distribution of outgoing order statuses.</p>
                        </div>
                    </div>
                    ${pieChartHtml(orderBreakdown, {
                        totalLabel: 'Orders',
                        emptyMessage: 'No order analytics available yet.',
                    })}
                </div>
                <div class="panel">
                    <div class="panel-head">
                        <div class="report-panel-copy">
                            <h2 class="panel-title">Revenue </h2>
                            <p class="muted">Revenue trend across the last seven days.</p>
                        </div>
                    </div>
                    ${barChartHtml(salesSeries, {
                        valueKey: 'revenue',
                        valueFormatter: (value) => formatMoney(value),
                        totalLabel: '7-day revenue',
                        emptyMessage: 'No sales data available yet.',
                    })}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head">
                    <div class="report-panel-copy">
                        <h2 class="panel-title">Stock Analytics</h2>
                        <p class="muted">Live product stock distribution across active variants.</p>
                    </div>
                </div>
                <div class="analytics-summary-grid">
                    ${stockBreakdown.map((item) => `
                        <button class="analytics-summary-card analytics-summary-button" type="button" data-action="open-dashboard-stock-breakdown" data-stock-status="${escapeHtml(item.label)}">
                            <span class="analytics-dot" style="background:${escapeHtml(analyticsColor(item.label))}"></span>
                            <div class="analytics-summary-copy">
                                <span class="muted">${escapeHtml(analyticsLabel(item.label))}</span>
                                <strong>${escapeHtml(item.value || 0)}</strong>
                            </div>
                        </button>
                    `).join('') || '<div class="empty-state">No stock analytics available yet.</div>'}
                </div>
            </div>
            <div class="split-panel">
                <div class="panel">
                    <div class="panel-head"><h2 class="panel-title">Recent Orders</h2></div>
                    ${tableHtml(['Order', 'Customer', 'Units', 'Total', 'Status'], (dashboard.recent_orders || []).map((order) => ({
                        attrs: {
                            'data-action': 'open-dashboard-order',
                            'data-id': Number(order.order_id || order.id || 0),
                            class: 'dashboard-row-link',
                            role: 'button',
                            tabindex: '0',
                            'data-highlight-target': `orders:${Number(order.order_id || order.id || 0)}`,
                        },
                        cells: [
                            order.order_number,
                            order.customer_name,
                            order.total_units,
                            formatMoney(order.total_amount),
                            `<span class="status-tag ${statusClass(order.order_status)}">${escapeHtml(order.order_status)}</span>`,
                        ],
                    })))}
                </div>
                <div class="panel">
                    <div class="panel-head"><h2 class="panel-title">Low Stock</h2></div>
                    <div class="list">
                        ${(dashboard.low_stock_items || []).map((item) => `
                            <button class="list-item dashboard-list-link" type="button" data-action="open-dashboard-low-stock" data-product-id="${Number(item.product_id || 0)}" data-variant-id="${Number(item.product_variant_id || 0)}">
                                <strong>${escapeHtml(item.product_name)}</strong><br>
                                <span class="muted">${escapeHtml(item.variant_display_name)} - ${item.stock_quantity} left</span>
                            </button>
                        `).join('') || '<div class="empty-state">No low-stock products right now.</div>'}
                    </div>
                </div>
            </div>
        </section>
    `;
    applyPendingHighlight();
}

function analyticsLabel(label) {
    return String(label || '')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function analyticsColor(label) {
    const palette = {
        in_stock: '#111111',
        low_stock: '#767676',
        out_of_stock: '#d7d7d7',
        pending: '#d8d8d8',
        processing: '#9e9e9e',
        shipped: '#6e6e6e',
        completed: '#111111',
        cancelled: '#efefef',
    };

    return palette[String(label || '').toLowerCase()] || '#bbbbbb';
}

function pieChartHtml(items, options = {}) {
    const series = (Array.isArray(items) ? items : [])
        .map((item) => ({
            label: String(item?.label || '').trim(),
            value: Number(item?.value || 0),
        }))
        .filter((item) => item.label !== '');
    const total = series.reduce((sum, item) => sum + item.value, 0);

    if (total <= 0) {
        return `<div class="empty-state">${escapeHtml(options.emptyMessage || 'No chart data available.')}</div>`;
    }

    let progress = 0;
    const gradient = series.map((item) => {
        const start = progress;
        progress += (item.value / total) * 100;
        return `${analyticsColor(item.label)} ${start}% ${progress}%`;
    }).join(', ');

    return `
        <div class="analytics-chart-shell">
            <div class="analytics-pie-wrap">
                <div class="analytics-pie-chart" style="background: conic-gradient(${escapeHtml(gradient)});">
                    <div class="analytics-pie-center">
                        <strong>${escapeHtml(total)}</strong>
                        <span class="muted">${escapeHtml(options.totalLabel || 'Total')}</span>
                    </div>
                </div>
            </div>
            <div class="analytics-legend">
                ${series.map((item) => `
                    <div class="analytics-legend-item">
                        <span class="analytics-dot" style="background:${escapeHtml(analyticsColor(item.label))}"></span>
                        <span>${escapeHtml(analyticsLabel(item.label))}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function barChartHtml(items, options = {}) {
    const valueKey = options.valueKey || 'value';
    const series = (Array.isArray(items) ? items : []).map((item) => ({
        label: String(item?.label || '').trim() || String(item?.date || '').trim(),
        value: Number(item?.[valueKey] || 0),
    }));
    const maxValue = series.reduce((max, item) => Math.max(max, item.value), 0);
    const total = series.reduce((sum, item) => sum + item.value, 0);

    if (!series.length || maxValue <= 0) {
        return `<div class="empty-state">${escapeHtml(options.emptyMessage || 'No chart data available.')}</div>`;
    }

    const formatValue = typeof options.valueFormatter === 'function'
        ? options.valueFormatter
        : (value) => String(value);

    return `
        <div class="analytics-bar-chart">
            <div class="analytics-bar-grid">
                ${series.map((item) => {
                    const barHeight = Math.max(8, Math.round((item.value / maxValue) * 100));
                    return `
                        <div class="analytics-bar-column">
                            <span class="analytics-bar-value">${escapeHtml(formatValue(item.value))}</span>
                            <div class="analytics-bar-track">
                                <span class="analytics-bar-fill" style="height:${barHeight}%"></span>
                            </div>
                            <span class="analytics-bar-label">${escapeHtml(item.label)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="muted analytics-chart-footnote">${escapeHtml(options.totalLabel || 'Total')}: ${escapeHtml(formatValue(total))}</div>
        </div>
    `;
}

function renderProductsPage() {
    const items = state.data.products || [];
    const isArchiveView = pageVisibility('products') === 'archived';
    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div><h2 class="panel-title">${isArchiveView ? 'Products Archive' : 'Products'}</h2><p class="muted">${isArchiveView ? 'Restore archived products or delete them permanently.' : 'Manage catalog entries and product stock details.'}</p></div>
                    <div class="toolbar">
                        <input id="productSearch" type="search" placeholder="Search products" value="${escapeHtml(state.filters.products.search)}">
                        <select id="productStockFilter">
                            <option value="">All stock</option>
                            <option value="attention" ${state.filters.products.stock_status === 'attention' ? 'selected' : ''}>Low + Out</option>
                            <option value="in_stock" ${state.filters.products.stock_status === 'in_stock' ? 'selected' : ''}>In Stock</option>
                            <option value="low_stock" ${state.filters.products.stock_status === 'low_stock' ? 'selected' : ''}>Low Stock</option>
                            <option value="out_of_stock" ${state.filters.products.stock_status === 'out_of_stock' ? 'selected' : ''}>Out of Stock</option>
                        </select>
                        <button class="ghost-button" type="button" data-action="refresh-products">Refresh</button>
                        ${isArchiveView
                            ? `<button class="ghost-button" type="button" data-action="open-products-active">Back to Products</button>${archiveBulkButtons('products', 'archived')}`
                            : '<button class="ghost-button" type="button" data-action="open-products-archive">Archive</button><button class="button" type="button" data-action="open-product-modal">Add Product</button>'}
                    </div>
                </div>
                ${tableHtml(['Product', 'Category', 'Price', 'Stock', 'Details', 'Status', 'Actions'], items.map((item) => ({
                    attrs: {
                        'data-highlight-target': `products:${item.id}`,
                    },
                    cells: [
                        `<strong>${escapeHtml(item.product_name)}</strong>`,
                        escapeHtml(item.category || 'Uncategorized'),
                        formatMoney(item.base_price),
                        item.total_stock_quantity,
                        escapeHtml(productDetailsLabel(item)),
                        `<span class="status-tag ${statusClass(item.stock_status)}">${escapeHtml(item.stock_status)}</span>`,
                        productActionButtons(item),
                    ],
                })))}
            </div>
        </section>
    `;
    applyPendingHighlight();
    setupPageSearchAssist();
}

function renderOrdersPage() {
    const items = state.data.orders || [];
    const isArchiveView = pageVisibility('orders') === 'archived';
    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div><h2 class="panel-title">${isArchiveView ? 'Orders Archive' : 'Orders'}</h2><p class="muted">${isArchiveView ? 'Restore archived customer orders or delete them permanently.' : 'Process transactions and shipments.'}</p></div>
                    <div class="toolbar">
                        <input id="orderSearch" type="search" placeholder="Search orders" value="${escapeHtml(state.filters.orders.search)}">
                        <select id="orderStatusFilter">
                            <option value="">All statuses</option>
                            <option value="open" ${state.filters.orders.order_status === 'open' ? 'selected' : ''}>Open</option>
                            <option value="pending" ${state.filters.orders.order_status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="processing" ${state.filters.orders.order_status === 'processing' ? 'selected' : ''}>Processing</option>
                            <option value="shipped" ${state.filters.orders.order_status === 'shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="completed" ${state.filters.orders.order_status === 'completed' ? 'selected' : ''}>Completed</option>
                            <option value="cancelled" ${state.filters.orders.order_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                        <button class="ghost-button" type="button" data-action="refresh-orders">Refresh</button>
                        ${isArchiveView
                            ? `<button class="ghost-button" type="button" data-action="open-orders-active">Back to Orders</button>${archiveBulkButtons('orders', 'archived')}`
                            : '<button class="ghost-button" type="button" data-action="open-orders-archive">Archive</button>'}
                    </div>
                </div>
                ${tableHtml(['Order', 'Customer', 'Product Count', 'Product Name', 'Total Purchase', 'Payment', 'Shipment', 'Actions'], items.map((item) => ({
                    attrs: {
                        'data-highlight-target': `orders:${item.id}`,
                    },
                    cells: [
                        `<strong>${escapeHtml(item.order_number)}</strong><br><span class="muted">${escapeHtml(item.placed_at)}</span>`,
                        `${escapeHtml(item.customer_name)}<br><span class="muted">${escapeHtml(item.email)}</span>`,
                        orderProductCount(item),
                        orderProductNameSummary(item),
                        formatMoney(item.total_amount),
                        item.payment_status,
                        item.shipment_status,
                        orderActionButtons(item),
                    ],
                })))}
            </div>
        </section>
    `;
    applyPendingHighlight();
    setupPageSearchAssist();
}

function orderProductCount(order) {
    return (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
}

function orderProductNameSummary(order) {
    const productNames = Array.from(new Set((order.items || [])
        .map((item) => String(item.product_name_snapshot || '').trim())
        .filter(Boolean)));

    if (!productNames.length) {
        return '<span class="muted">No items</span>';
    }

    const primary = escapeHtml(productNames[0]);
    if (productNames.length === 1) {
        return `<span>${primary}</span>`;
    }

    return `<span>${primary}</span><br><span class="muted">+${productNames.length - 1} more</span>`;
}

function renderUsersPage() {
    const items = state.data.users || [];
    const isArchiveView = pageVisibility('users') === 'archived';
    const isAdminView = state.filters.users.role === 'admin';
    const title = isAdminView ? 'Admin Accounts' : 'Customers';
    const subtitle = isAdminView
        ? 'View seeded and active admin accounts.'
        : 'Create, update, and remove customer accounts.';
    const archiveTitle = isAdminView ? 'Admin Accounts Archive' : 'Customers Archive';
    const archiveSubtitle = isAdminView
        ? 'Restore archived admin accounts.'
        : 'Restore archived customer accounts or delete them permanently.';
    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div><h2 class="panel-title">${isArchiveView ? archiveTitle : title}</h2><p class="muted">${isArchiveView ? archiveSubtitle : subtitle}</p></div>
                    <div class="toolbar">
                        <input id="userSearch" type="search" placeholder="${isAdminView ? 'Search admin accounts' : 'Search users'}" value="${escapeHtml(state.filters.users.search)}">
                        <button class="ghost-button" type="button" data-action="refresh-users">Refresh</button>
                        ${isArchiveView
                            ? `<button class="ghost-button" type="button" data-action="open-users-active">Back to ${escapeHtml(title)}</button>${archiveBulkButtons('users', 'archived')}`
                            : `${isAdminView
                                ? '<button class="ghost-button" type="button" data-action="open-users-active-customers">Customers</button>'
                                : '<button class="ghost-button" type="button" data-action="open-users-admins">Admin Accounts</button>'}<button class="ghost-button" type="button" data-action="open-users-archive">Archive</button>${isAdminView ? '' : '<button class="button" type="button" data-action="open-user-modal">Add Customer</button>'}`}
                    </div>
                </div>
                ${tableHtml(['Name', 'Email', 'Role', 'Status', 'Password Change', 'Actions'], items.map((item) => [
                    `${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}`,
                    escapeHtml(item.email),
                    item.role,
                    item.account_status,
                    item.must_change_password ? 'Yes' : 'No',
                    userActionButtons(item),
                ]))}
            </div>
        </section>
    `;
    applyPendingHighlight();
    setupPageSearchAssist();
}

function renderInventoryPage() {
    const data = state.data.inventory || { incoming: [], movements: [], lowStock: [] };
    const isArchiveView = pageVisibility('inventory') === 'archived';
    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div><h2 class="panel-title">${isArchiveView ? 'Incoming Orders Archive' : 'Incoming Orders'}</h2><p class="muted">${isArchiveView ? 'Restore archived incoming orders or delete them permanently.' : 'Receive stock and update levels automatically.'}</p></div>
                    <div class="toolbar">
                        <input id="incomingSearch" type="search" placeholder="Search incoming orders" value="${escapeHtml(state.filters.inventory.search)}">
                        <select id="incomingStatusFilter">
                            <option value="">All statuses</option>
                            <option value="open" ${state.filters.inventory.incoming_status === 'open' ? 'selected' : ''}>Open</option>
                            <option value="draft" ${state.filters.inventory.incoming_status === 'draft' ? 'selected' : ''}>Draft</option>
                            <option value="ordered" ${state.filters.inventory.incoming_status === 'ordered' ? 'selected' : ''}>Ordered</option>
                            <option value="partially_received" ${state.filters.inventory.incoming_status === 'partially_received' ? 'selected' : ''}>Partially Received</option>
                            <option value="received" ${state.filters.inventory.incoming_status === 'received' ? 'selected' : ''}>Received</option>
                            <option value="cancelled" ${state.filters.inventory.incoming_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                        <button class="ghost-button" type="button" data-action="refresh-inventory">Refresh</button>
                        ${isArchiveView
                            ? `<button class="ghost-button" type="button" data-action="open-inventory-active">Back to Incoming Orders</button>${archiveBulkButtons('incoming', 'archived')}`
                            : '<button class="ghost-button" type="button" data-action="open-inventory-archive">Archive</button><button class="ghost-button" type="button" data-action="open-stock-adjust-modal">Manual Stock Adjustment</button><button class="button" type="button" data-action="open-incoming-modal">New Incoming Order</button>'}
                    </div>
                </div>
                ${tableHtml(['Reference', 'Supplier', 'Status', 'Expected', 'Actions'], data.incoming.map((item) => ({
                    attrs: {
                        'data-highlight-target': `incoming_orders:${item.id}`,
                    },
                    cells: [
                        item.reference_number,
                        item.supplier_name || 'No supplier',
                        item.incoming_status,
                        item.expected_date || '-',
                        incomingOrderActionButtons(item),
                    ],
                })))}
            </div>
            <div class="split-panel ${isArchiveView ? 'hidden' : ''}">
                <div class="panel">
                    <div class="panel-head"><h2 class="panel-title">Low Stock Products</h2></div>
                    <div class="list">
                        ${data.lowStock.map((item) => `<div class="list-item" data-highlight-target="product_variants:${item.product_variant_id}"><strong>${escapeHtml(item.product_name)}</strong><br><span class="muted">${escapeHtml(item.variant_display_name)} - ${item.stock_quantity} left</span></div>`).join('') || '<div class="empty-state">No low-stock products right now.</div>'}
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-head"><h2 class="panel-title">Recent Stock Movements</h2></div>
                    ${tableHtml(['Time', 'Product', 'Item', 'Delta', 'Type'], data.movements.slice(0, 20).map((item) => [
                        item.created_at,
                        item.product_name,
                        item.variant_sku,
                        item.quantity_delta,
                        item.movement_type,
                    ]))}
                </div>
            </div>
        </section>
    `;
    applyPendingHighlight();
    setupPageSearchAssist();
}

function setupPageSearchAssist() {
    disposePageSearchAssist();
    disposePageSearchAssist = () => {};

    const config = pageSearchAssistConfig(state.currentPage);
    if (!config) {
        return;
    }

    const input = qs(config.selector);
    if (!input) {
        return;
    }

    disposePageSearchAssist = attachSearchAssist({
        input,
        contextKey: config.contextKey,
        buildSuggestions: ({ query }) => composeSearchSuggestions(config.contextKey, query, config.candidates()),
        onSearch: async (value) => {
            state.filters[config.page].search = value;
            await loadPage(config.page);
        },
    });
}

function pageSearchAssistConfig(page) {
    if (page === 'products') {
        return {
            page,
            selector: '#productSearch',
            contextKey: 'admin-products',
            candidates: productSearchCandidates,
        };
    }

    if (page === 'orders') {
        return {
            page,
            selector: '#orderSearch',
            contextKey: 'admin-orders',
            candidates: orderSearchCandidates,
        };
    }

    if (page === 'users') {
        return {
            page,
            selector: '#userSearch',
            contextKey: 'admin-users',
            candidates: userSearchCandidates,
        };
    }

    if (page === 'inventory') {
        return {
            page,
            selector: '#incomingSearch',
            contextKey: 'admin-incoming',
            candidates: incomingSearchCandidates,
        };
    }

    return null;
}

function composeSearchSuggestions(contextKey, query, candidates) {
    const historySuggestions = buildHistorySuggestions(contextKey, query, 4);
    const historyValues = new Set(historySuggestions.map((item) => String(item.value || '').trim().toLowerCase()));
    const smartSuggestions = rankSearchCandidates(query, candidates, query ? 6 : 5)
        .filter((item) => !historyValues.has(String(item.value || '').trim().toLowerCase()))
        .map((item) => ({
            ...item,
            group: query ? 'Suggestions' : 'Suggested',
            kind: 'suggestion',
        }));

    return [...historySuggestions, ...smartSuggestions];
}

function productSearchCandidates() {
    const currentItems = Array.isArray(state.data.products) ? state.data.products : [];
    const cachedItems = Array.isArray(state.productCache) ? state.productCache : [];
    const seen = new Set();
    const candidates = [];

    [...currentItems, ...cachedItems].forEach((item, index) => {
        const key = `product:${Number(item?.id || 0)}`;
        const productName = String(item?.product_name || '').trim();
        if (!productName || seen.has(key)) {
            return;
        }

        seen.add(key);
        candidates.push({
            value: productName,
            label: productName,
            hint: String(item?.category || '').trim() || 'Product',
            keywords: [item?.short_description, item?.description],
            priority: index < currentItems.length ? 12 : 4,
        });
    });

    return candidates;
}

function orderSearchCandidates() {
    return (Array.isArray(state.data.orders) ? state.data.orders : []).flatMap((item, index) => {
        const customerName = String(item?.customer_name || '').trim();
        const customerEmail = String(item?.email || '').trim();
        const orderNumber = String(item?.order_number || '').trim();
        const orderTotal = Number(item?.total_amount || 0);
        const results = [];

        if (orderNumber) {
            results.push({
                value: orderNumber,
                label: orderNumber,
                hint: customerName || customerEmail || formatMoney(orderTotal),
                keywords: [customerName, customerEmail],
                priority: 14 - index,
            });
        }
        if (customerName) {
            results.push({
                value: customerName,
                label: customerName,
                hint: customerEmail || orderNumber,
                keywords: [orderNumber, customerEmail],
                priority: 10 - index,
            });
        }
        if (customerEmail) {
            results.push({
                value: customerEmail,
                label: customerEmail,
                hint: customerName || orderNumber,
                keywords: [orderNumber, customerName],
                priority: 8 - index,
            });
        }

        return results;
    });
}

function userSearchCandidates() {
    return (Array.isArray(state.data.users) ? state.data.users : []).flatMap((item, index) => {
        const fullName = `${String(item?.first_name || '').trim()} ${String(item?.last_name || '').trim()}`.trim();
        const email = String(item?.email || '').trim();
        const phone = String(item?.phone || '').trim();
        const results = [];

        if (fullName) {
            results.push({
                value: fullName,
                label: fullName,
                hint: email || phone || 'Customer',
                keywords: [email, phone, item?.first_name, item?.last_name],
                priority: 14 - index,
            });
        }
        if (email) {
            results.push({
                value: email,
                label: email,
                hint: fullName || phone || 'Customer email',
                keywords: [fullName, phone],
                priority: 10 - index,
            });
        }

        return results;
    });
}

function incomingSearchCandidates() {
    return ((state.data.inventory?.incoming) || []).flatMap((item, index) => {
        const referenceNumber = String(item?.reference_number || '').trim();
        const supplierName = String(item?.supplier_name || '').trim();
        const results = [];

        if (referenceNumber) {
            results.push({
                value: referenceNumber,
                label: referenceNumber,
                hint: supplierName || 'Incoming order',
                keywords: [supplierName, item?.incoming_status],
                priority: 14 - index,
            });
        }
        if (supplierName) {
            results.push({
                value: supplierName,
                label: supplierName,
                hint: referenceNumber || 'Supplier',
                keywords: [referenceNumber, item?.incoming_status],
                priority: 10 - index,
            });
        }

        return results;
    });
}

function archiveBulkButtons(entityKey, visibility) {
    if (visibility !== 'archived') {
        return '';
    }

    return `
        <button class="ghost-button" type="button" data-action="restore-all-${entityKey}">Restore All</button>
        <button class="danger-button" type="button" data-action="purge-all-${entityKey}">Delete All</button>
    `;
}

function productActionButtons(item) {
    if (state.filters.products.visibility === 'archived') {
        return `
            <div class="inline-actions">
                <button class="ghost-button" type="button" data-action="restore-product" data-id="${item.id}">Restore</button>
                <button class="danger-button" type="button" data-action="purge-product" data-id="${item.id}">Delete</button>
            </div>
        `;
    }

    const primaryVariant = primaryProductItem(item);
    const canRestock = ['low_stock', 'out_of_stock'].includes(String(item?.stock_status || '')) && Number(primaryVariant?.id || 0) > 0;

    return `
        <div class="inline-actions">
            ${canRestock ? `<button class="button" type="button" data-action="open-product-restock" data-product-id="${item.id}" data-variant-id="${Number(primaryVariant.id)}">Restock</button>` : ''}
            <button class="ghost-button" type="button" data-action="edit-product" data-id="${item.id}">Edit</button>
            <button class="danger-button" type="button" data-action="archive-product" data-id="${item.id}">Archive</button>
        </div>
    `;
}

function orderActionButtons(item) {
    if (state.filters.orders.visibility === 'archived') {
        return `
            <div class="inline-actions">
                <button class="ghost-button" type="button" data-action="restore-order" data-id="${item.id}">Restore</button>
                <button class="danger-button" type="button" data-action="purge-order" data-id="${item.id}">Delete</button>
            </div>
        `;
    }

    return `
        <div class="inline-actions">
            <button class="ghost-button" type="button" data-action="open-order-modal" data-id="${item.id}">Manage</button>
            <button class="danger-button" type="button" data-action="archive-order" data-id="${item.id}">Archive</button>
        </div>
    `;
}

function userActionButtons(item) {
    if (item.role === 'admin') {
        return '<span class="muted">Managed by system</span>';
    }

    if (state.filters.users.visibility === 'archived') {
        return `
            <div class="inline-actions">
                <button class="ghost-button" type="button" data-action="restore-user" data-id="${item.id}">Restore</button>
                <button class="danger-button" type="button" data-action="purge-user" data-id="${item.id}">Delete</button>
            </div>
        `;
    }

    return `
        <div class="inline-actions">
            <button class="ghost-button" type="button" data-action="edit-user" data-id="${item.id}">Edit</button>
            <button class="danger-button" type="button" data-action="archive-user" data-id="${item.id}">Archive</button>
        </div>
    `;
}

function incomingOrderActionButtons(item) {
    if (state.filters.inventory.visibility === 'archived') {
        return `
            <div class="inline-actions">
                <button class="ghost-button" type="button" data-action="restore-incoming" data-id="${item.id}">Restore</button>
                <button class="danger-button" type="button" data-action="purge-incoming" data-id="${item.id}">Delete</button>
            </div>
        `;
    }

    return `
        <div class="inline-actions">
            <button class="ghost-button" type="button" data-action="edit-incoming" data-id="${item.id}">Edit</button>
            <button class="button" type="button" data-action="receive-incoming" data-id="${item.id}">Receive</button>
            <button class="danger-button" type="button" data-action="archive-incoming" data-id="${item.id}">Archive</button>
        </div>
    `;
}

function reportSections(reports) {
    const inventoryRows = Array.isArray(reports?.inventory?.inventory) ? reports.inventory.inventory : [];
    const outgoingRows = Array.isArray(reports?.orders?.outgoing_orders) ? reports.orders.outgoing_orders : [];
    const incomingRows = Array.isArray(reports?.orders?.incoming_orders) ? reports.orders.incoming_orders : [];

    return {
        inventory: {
            label: 'Inventory Status',
            subtitle: 'Current stock levels across active products and item details.',
            headers: ['Product', 'Details', 'SKU', 'Stock', 'Status'],
            rows: inventoryRows.map((item) => [
                item.product_name,
                item.variant_display_name,
                item.variant_sku,
                Number(item.stock_quantity || 0),
                item.stock_status,
            ]),
            records: inventoryRows.map((item) => ({
                product_name: item.product_name,
                variant_display_name: item.variant_display_name,
                variant_sku: item.variant_sku,
                stock_quantity: Number(item.stock_quantity || 0),
                stock_status: item.stock_status,
            })),
            filenameBase: 'inventory-status',
        },
        outgoing: {
            label: 'Outgoing Orders',
            subtitle: 'Customer order flow and outbound activity.',
            headers: ['Order', 'Customer', 'Units', 'Total', 'Status'],
            rows: outgoingRows.map((item) => [
                item.order_number,
                item.customer_name,
                Number(item.total_units || 0),
                Number(item.total_amount || 0),
                item.order_status,
            ]),
            records: outgoingRows.map((item) => ({
                order_number: item.order_number,
                customer_name: item.customer_name,
                total_units: Number(item.total_units || 0),
                total_amount: Number(item.total_amount || 0),
                order_status: item.order_status,
                placed_at: item.placed_at,
            })),
            filenameBase: 'outgoing-orders',
        },
        incoming: {
            label: 'Incoming Orders',
            subtitle: 'Supplier restock flow and received quantities.',
            headers: ['Reference', 'Supplier', 'Ordered', 'Received', 'Status'],
            rows: incomingRows.map((item) => [
                item.reference_number,
                item.supplier_name || 'No supplier',
                Number(item.total_units_ordered || 0),
                Number(item.total_units_received || 0),
                item.incoming_status,
            ]),
            records: incomingRows.map((item) => ({
                reference_number: item.reference_number,
                supplier_name: item.supplier_name || 'No supplier',
                total_units_ordered: Number(item.total_units_ordered || 0),
                total_units_received: Number(item.total_units_received || 0),
                incoming_status: item.incoming_status,
                expected_date: item.expected_date,
            })),
            filenameBase: 'incoming-orders',
        },
    };
}

function activeReportSectionConfig() {
    const sections = reportSections(state.data.reports || {});
    return sections[state.reportView] || sections.inventory;
}

function renderReportsPage() {
    const activeSection = activeReportSectionConfig();
    const displayRows = activeSection.rows.slice(0, 50).map((row) => {
        if (state.reportView === 'outgoing') {
            return [
                escapeHtml(row[0]),
                escapeHtml(row[1]),
                row[2],
                formatMoney(row[3]),
                escapeHtml(row[4]),
            ];
        }

        if (state.reportView === 'incoming') {
            return [
                escapeHtml(row[0]),
                escapeHtml(row[1]),
                row[2],
                row[3],
                escapeHtml(row[4]),
            ];
        }

        return [
            escapeHtml(row[0]),
            escapeHtml(row[1]),
            escapeHtml(row[2]),
            row[3],
            escapeHtml(row[4]),
        ];
    });

    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div class="report-panel-copy">
                        <h2 class="panel-title">Reports</h2>
                        <p class="muted">Open one report view at a time to keep the layout compact.</p>
                    </div>
                    <div class="toolbar report-export-toolbar">
                        <button class="ghost-button" type="button" data-action="export-report" data-format="csv">Export CSV</button>
                        <button class="ghost-button" type="button" data-action="export-report" data-format="json">Export JSON</button>
                        <button class="button" type="button" data-action="export-report" data-format="xls">Export XLS</button>
                    </div>
                </div>
                <div class="report-switch" role="tablist" aria-label="Report sections">
                    ${REPORT_VIEWS.map((item) => `
                        <button class="${state.reportView === item.key ? 'button' : 'ghost-button'} report-switch-button" type="button" data-action="open-report-view" data-view="${item.key}">
                            ${escapeHtml(item.label)}
                        </button>
                    `).join('')}
                </div>
                <div class="report-active-panel">
                    <div class="panel-head">
                        <div class="report-panel-copy">
                            <h3 class="panel-title">${escapeHtml(activeSection.label)}</h3>
                            <p class="muted">${escapeHtml(activeSection.subtitle)}</p>
                        </div>
                    </div>
                    ${tableHtml(activeSection.headers, displayRows)}
                    ${activeSection.rows.length > 50 ? `<div class="muted">Showing first 50 of ${escapeHtml(activeSection.rows.length)} rows. Export downloads the full report.</div>` : ''}
                </div>
            </div>
        </section>
    `;
    applyPendingHighlight();
}

function csvCell(value) {
    const stringValue = String(value ?? '');
    if (!/[",\n\r]/.test(stringValue)) {
        return stringValue;
    }

    return `"${stringValue.replaceAll('"', '""')}"`;
}

function tableExportHtml(headers, rows, title) {
    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
</head>
<body>
    <table border="1">
        <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
    </table>
</body>
</html>`;
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReport(format) {
    const section = activeReportSectionConfig();
    const stamp = new Date().toISOString().slice(0, 10);
    const filenameBase = `${section.filenameBase}-${stamp}`;

    if (format === 'json') {
        downloadFile(
            `${filenameBase}.json`,
            JSON.stringify({
                report: section.label,
                generated_at: new Date().toISOString(),
                row_count: section.records.length,
                items: section.records,
            }, null, 2),
            'application/json;charset=utf-8'
        );
        showToast('Report exported as JSON.');
        return;
    }

    if (format === 'xls') {
        downloadFile(
            `${filenameBase}.xls`,
            tableExportHtml(section.headers, section.rows, section.label),
            'application/vnd.ms-excel;charset=utf-8'
        );
        showToast('Report exported as XLS.');
        return;
    }

    const csvLines = [
        section.headers.map(csvCell).join(','),
        ...section.rows.map((row) => row.map(csvCell).join(',')),
    ];
    downloadFile(
        `${filenameBase}.csv`,
        csvLines.join('\r\n'),
        'text/csv;charset=utf-8'
    );
    showToast('Report exported as CSV.');
}

function renderNotificationsPage() {
    qs('#adminPageContent').innerHTML = notificationsMarkup();
    applyPendingHighlight();
}

function normalizeSettingsCategories(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const archivedItems = Array.isArray(payload.archived_items) ? payload.archived_items : [];
    const categories = Array.isArray(payload.categories) ? payload.categories : [];

    return {
        categories,
        items,
        archived_items: archivedItems,
        counts: {
            active: Number(payload?.counts?.active || items.length || 0),
            archived: Number(payload?.counts?.archived || archivedItems.length || 0),
        },
    };
}

function currentSettingsCategories() {
    return normalizeSettingsCategories(state.data.settingsCategories || {});
}

function brandingCurrency(branding = {}) {
    return branding?.currency || DEFAULT_CURRENCY_OPTION;
}

function currencySummaryLabel(branding = {}) {
    return currencyOptionLabel(brandingCurrency(branding));
}

function brandingMarkHtml(branding, extraClass = '') {
    const previewPath = branding?.logo_path ? resolveBrandingPath(branding.logo_path) : '';
    const className = ['brand-mark', extraClass].filter(Boolean).join(' ');

    if (!previewPath) {
        return `<span class="${escapeHtml(className)}">TA</span>`;
    }

    return `
        <span class="${escapeHtml(`${className} has-logo`)}">
            <img src="${escapeHtml(previewPath)}" alt="${escapeHtml(branding?.site_name || 'Shop logo')}">
        </span>
    `;
}

function renderSettingsPage() {
    const branding = state.data.branding || {
        site_name: 'TikTok Admin Inventory',
        admin_panel_title: 'Inventory',
        logo_path: '',
        currency: DEFAULT_CURRENCY_OPTION,
    };
    const adminUser = state.session?.user || {};

    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div>
                        <h2 class="panel-title">Store and Admin Settings</h2>
                        <p class="muted">Manage the storefront title, admin panel title, logo, currency, and the active admin login from one place.</p>
                    </div>
                    <button class="button" type="button" data-action="open-settings-editor">Edit Everything</button>
                </div>
                <div class="settings-overview-grid">
                    <div class="branding-preview settings-brand-card">
                        <div class="branding-preview-mark">${brandingMarkHtml(branding, 'settings-preview-mark')}</div>
                        <div class="settings-brand-copy">
                            <strong>${escapeHtml(branding.site_name || 'TikTok Admin Inventory')}</strong>
                            <div class="muted">${branding.logo_path ? escapeHtml(branding.logo_path) : 'The default TA mark is active right now.'}</div>
                        </div>
                    </div>
                    <div class="settings-account-card">
                        <div class="list-item">
                            <strong>Admin Email</strong><br>
                            <span class="muted">${escapeHtml(adminUser.email || 'No admin email available.')}</span>
                        </div>
                        <div class="list-item">
                            <strong>Password</strong><br>
                            <span class="muted">Hidden. Update it from Edit Everything when needed.</span>
                        </div>
                        <div class="list-item">
                            <strong>Store Title</strong><br>
                            <span class="muted">${escapeHtml(branding.site_name || 'TikTok Admin Inventory')}</span>
                        </div>
                        <div class="list-item">
                            <strong>Admin Panel Title</strong><br>
                            <span class="muted">${escapeHtml(branding.admin_panel_title || 'Inventory')}</span>
                        </div>
                        <div class="list-item">
                            <strong>Currency</strong><br>
                            <span class="muted">${escapeHtml(currencySummaryLabel(branding))}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
    applyPendingHighlight();
}

function renderCategoriesPage() {
    const categoryConfig = currentSettingsCategories();
    const isArchiveView = state.settingsCategoryView === 'archived';
    const categoryItems = isArchiveView ? categoryConfig.archived_items : categoryConfig.items;

    qs('#adminPageContent').innerHTML = `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div>
                        <h2 class="panel-title">${isArchiveView ? 'Product Categories Archive' : 'Product Categories'}</h2>
                        <p class="muted">${isArchiveView ? 'Restore archived category labels.' : 'Manage the category labels used in product forms and storefront filters.'}</p>
                    </div>
                    <div class="toolbar">
                        <span class="pill">Active ${categoryConfig.counts.active}</span>
                        <span class="pill">Archived ${categoryConfig.counts.archived}</span>
                        ${isArchiveView
                            ? '<button class="ghost-button" type="button" data-action="open-categories-active">Back to Categories</button>'
                            : '<button class="ghost-button" type="button" data-action="open-categories-archive">Archive</button><button class="button" type="button" data-action="open-category-modal">Add Category</button>'}
                    </div>
                </div>
                ${tableHtml(['Label', 'Details', 'Status', 'Actions'], categoryItems.map((item) => [
                    `<strong>${escapeHtml(item.label)}</strong>`,
                    item.details ? escapeHtml(item.details) : '<span class="muted">No details yet.</span>',
                    `<span class="status-tag ${statusClass(item.status)}">${escapeHtml(item.status)}</span>`,
                    isArchiveView
                        ? `<div class="inline-actions"><button class="ghost-button" type="button" data-action="restore-category" data-id="${escapeHtml(item.id)}">Restore</button></div>`
                        : `<div class="inline-actions"><button class="ghost-button" type="button" data-action="edit-category" data-id="${escapeHtml(item.id)}">Edit</button><button class="danger-button" type="button" data-action="archive-category" data-id="${escapeHtml(item.id)}">Archive</button></div>`,
                ]))}
            </div>
        </section>
    `;
    applyPendingHighlight();
}

function settingsEditorModal(
    branding = state.data.branding || {
        site_name: 'TikTok Admin Inventory',
        admin_panel_title: 'Inventory',
        logo_path: '',
        currency: DEFAULT_CURRENCY_OPTION,
    },
    adminUser = state.session?.user || {}
) {
    const currency = brandingCurrency(branding);
    return modalShell('Edit Everything', `
        <div class="settings-editor-layout">
            <div class="branding-preview settings-preview-card settings-editor-preview-card">
                <div id="settingsEditorPreview" class="branding-preview-mark">${brandingMarkHtml(branding, 'settings-preview-mark')}</div>
                <div class="settings-editor-preview-copy">
                    <strong id="settingsEditorPreviewTitle">${escapeHtml(branding.site_name || 'TikTok Admin Inventory')}</strong>
                    <div id="settingsEditorPreviewLabel" class="muted">${branding.logo_path ? escapeHtml(branding.logo_path) : 'The default TA mark is active right now.'}</div>
                    <div id="settingsEditorPreviewAdminTitle" class="muted">${escapeHtml(branding.admin_panel_title || 'Inventory')}</div>
                    <div id="settingsEditorPreviewCurrency" class="muted">${escapeHtml(currencySummaryLabel(branding))}</div>
                    <div id="settingsEditorPreviewEmail" class="muted">${escapeHtml(adminUser.email || 'No admin email available.')}</div>
                </div>
            </div>
            <form id="settingsEditorForm" class="form-grid single settings-editor-form">
                <div class="settings-editor-section">
                    <h3 class="panel-title">Store</h3>
                    <div class="form-grid">
                        <div class="field">
                            <label>Store Title</label>
                            <input id="settingsSiteNameInput" name="site_name" maxlength="150" value="${escapeHtml(branding.site_name || 'TikTok Admin Inventory')}" required>
                        </div>
                        <div class="field">
                            <label>Admin Panel Title</label>
                            <input id="settingsAdminPanelTitleInput" name="admin_panel_title" maxlength="120" value="${escapeHtml(branding.admin_panel_title || 'Inventory')}" required>
                        </div>
                    </div>
                </div>
                <div class="settings-editor-section">
                    <h3 class="panel-title">Currency</h3>
                    <div class="form-grid">
                        <div class="field field-full">
                            <label>Search Country or Currency</label>
                            <input id="settingsCurrencySearchInput" name="currency_search_input" list="settingsCurrencyList" value="${escapeHtml(currencyOptionLabel(currency))}" placeholder="Search any country, code, currency name, or symbol" autocomplete="off" required>
                            <datalist id="settingsCurrencyList">
                                ${CURRENCY_OPTIONS.map((option) => `<option value="${escapeHtml(currencyOptionLabel(option))}"></option>`).join('')}
                            </datalist>
                            <input type="hidden" name="currency_code" value="${escapeHtml(currency.code || DEFAULT_CURRENCY_OPTION.code)}">
                            <input type="hidden" name="currency_symbol" value="${escapeHtml(currency.symbol || DEFAULT_CURRENCY_OPTION.symbol)}">
                            <input type="hidden" name="currency_country" value="${escapeHtml(currency.country || DEFAULT_CURRENCY_OPTION.country)}">
                            <input type="hidden" name="currency_name" value="${escapeHtml(currency.name || DEFAULT_CURRENCY_OPTION.name)}">
                            <input type="hidden" name="currency_search_label" value="${escapeHtml(currencyOptionLabel(currency))}">
                        </div>
                    </div>
                    <div class="list-item">Custom worldwide symbol list. Search by country, currency code, currency name, or symbol. Money values across the app will update to the selected symbol and currency.</div>
                </div>
                <div class="settings-editor-section">
                    <h3 class="panel-title">Security</h3>
                    <div class="form-grid">
                        <div class="field">
                            <label>Admin Email</label>
                            <input id="settingsAdminEmailInput" name="admin_email" type="email" value="${escapeHtml(adminUser.email || '')}" required>
                        </div>
                        <div class="field">
                            <label>Current Password</label>
                            <input name="current_password" type="password" autocomplete="current-password" placeholder="Required for email or password changes">
                        </div>
                        <div class="field">
                            <label>New Password</label>
                            <input name="admin_password" type="password" autocomplete="new-password" placeholder="Leave blank to keep the current password">
                        </div>
                        <div class="field">
                            <label>Confirm Password</label>
                            <input name="admin_password_confirm" type="password" autocomplete="new-password" placeholder="Repeat the new password">
                        </div>
                    </div>
                    <div class="list-item">Current password is required before changing the admin email or password. Leave the new password fields blank if you only want to update branding, titles, or currency.</div>
                </div>
                <div class="settings-editor-section">
                    <h3 class="panel-title">Logo</h3>
                    <div class="field">
                        <label>Upload Logo</label>
                        <div class="settings-file-row">
                            <label class="button settings-file-button" for="settingsLogoInput">Choose Logo</label>
                            <input id="settingsLogoInput" class="settings-file-input" name="logo_image" type="file" accept="image/*">
                            <span id="settingsLogoFilename" class="muted">${branding.logo_path ? 'Replace the current logo.' : 'No file selected.'}</span>
                        </div>
                    </div>
                    <div class="list-item">Accepted files: JPG, PNG, WEBP, and GIF.</div>
                </div>
                <div class="inline-actions">
                    ${branding.logo_path ? '<button class="ghost-button" type="submit" data-remove-branding-logo="1">Use Default Mark</button>' : ''}
                    <button class="button" type="submit">Save Everything</button>
                </div>
            </form>
        </div>
    `, 'settings-editor-modal');
}

function bindSettingsEditorModal(
    modal,
    branding = state.data.branding || {
        site_name: 'TikTok Admin Inventory',
        admin_panel_title: 'Inventory',
        logo_path: '',
        currency: DEFAULT_CURRENCY_OPTION,
    },
    adminUser = state.session?.user || {}
) {
    const fileInput = qs('#settingsLogoInput', modal);
    const preview = qs('#settingsEditorPreview', modal);
    const previewLabel = qs('#settingsEditorPreviewLabel', modal);
    const previewTitle = qs('#settingsEditorPreviewTitle', modal);
    const previewAdminTitle = qs('#settingsEditorPreviewAdminTitle', modal);
    const previewCurrency = qs('#settingsEditorPreviewCurrency', modal);
    const previewEmail = qs('#settingsEditorPreviewEmail', modal);
    const fileName = qs('#settingsLogoFilename', modal);
    const siteNameInput = qs('#settingsSiteNameInput', modal);
    const adminPanelTitleInput = qs('#settingsAdminPanelTitleInput', modal);
    const currencySearchInput = qs('#settingsCurrencySearchInput', modal);
    const adminEmailInput = qs('#settingsAdminEmailInput', modal);
    const currencyCodeInput = qs('[name="currency_code"]', modal);
    const currencySymbolInput = qs('[name="currency_symbol"]', modal);
    const currencyCountryInput = qs('[name="currency_country"]', modal);
    const currencyNameInput = qs('[name="currency_name"]', modal);
    const currencySearchLabelInput = qs('[name="currency_search_label"]', modal);
    let objectUrl = '';

    if (!fileInput || !preview || !previewLabel || !fileName || !siteNameInput || !adminPanelTitleInput || !currencySearchInput || !adminEmailInput || !currencyCodeInput || !currencySymbolInput || !currencyCountryInput || !currencyNameInput || !currencySearchLabelInput) {
        return;
    }

    siteNameInput.addEventListener('input', () => {
        previewTitle.textContent = siteNameInput.value.trim() || 'TikTok Admin Inventory';
    });

    adminPanelTitleInput.addEventListener('input', () => {
        if (previewAdminTitle) {
            previewAdminTitle.textContent = adminPanelTitleInput.value.trim() || 'Inventory';
        }
    });

    adminEmailInput.addEventListener('input', () => {
        previewEmail.textContent = adminEmailInput.value.trim() || adminUser.email || 'No admin email available.';
    });

    const applyCurrencyOption = (option, updateInput = false) => {
        const selected = option || DEFAULT_CURRENCY_OPTION;
        currencyCodeInput.value = String(selected.code || DEFAULT_CURRENCY_OPTION.code);
        currencySymbolInput.value = String(selected.symbol || DEFAULT_CURRENCY_OPTION.symbol);
        currencyCountryInput.value = String(selected.country || DEFAULT_CURRENCY_OPTION.country);
        currencyNameInput.value = String(selected.name || DEFAULT_CURRENCY_OPTION.name);
        currencySearchLabelInput.value = currencyOptionLabel(selected);
        if (updateInput) {
            currencySearchInput.value = currencyOptionLabel(selected);
        }
        if (previewCurrency) {
            previewCurrency.textContent = `${selected.country || DEFAULT_CURRENCY_OPTION.country} | ${selected.code || DEFAULT_CURRENCY_OPTION.code} | ${selected.symbol || DEFAULT_CURRENCY_OPTION.symbol}`;
        }
    };

    currencySearchInput.addEventListener('input', () => {
        const option = findCurrencyOption(currencySearchInput.value);
        if (option) {
            applyCurrencyOption(option, false);
        }
    });

    currencySearchInput.addEventListener('change', () => {
        const option = findCurrencyOption(currencySearchInput.value) || brandingCurrency(branding);
        applyCurrencyOption(option, true);
    });

    applyCurrencyOption(brandingCurrency(branding), false);

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = '';
        }

        if (!file) {
            preview.innerHTML = brandingMarkHtml(branding, 'settings-preview-mark');
            previewLabel.textContent = branding.logo_path || 'The default TA mark is active right now.';
            fileName.textContent = branding.logo_path ? 'Replace the current logo.' : 'No file selected.';
            return;
        }

        objectUrl = URL.createObjectURL(file);
        preview.innerHTML = brandingMarkHtml({
            site_name: siteNameInput.value.trim() || branding.site_name,
            logo_path: objectUrl,
        }, 'settings-preview-mark');
        previewLabel.textContent = file.name;
        fileName.textContent = file.name;
    });
}

function categoryRecord(id) {
    const categoryConfig = currentSettingsCategories();
    return [...categoryConfig.items, ...categoryConfig.archived_items].find((item) => String(item.id) === String(id)) || null;
}

function categoryModal(category = null) {
    return modalShell(category ? 'Edit Category' : 'Add Category', `
        <form id="categoryForm" class="form-grid single">
            <input type="hidden" name="id" value="${escapeHtml(category?.id || '')}">
            <div class="field"><label>Label</label><input name="label" maxlength="100" value="${escapeHtml(category?.label || '')}" required></div>
            <div class="field"><label>Details</label><textarea name="details" maxlength="255" placeholder="Short description for this category.">${escapeHtml(category?.details || '')}</textarea></div>
            <button class="button" type="submit">${category ? 'Save Category' : 'Create Category'}</button>
        </form>
    `, 'modal-compact');
}

function notificationsMarkup() {
    return `
        <section class="page-section">
            <div class="panel">
                <div class="panel-head">
                    <div><h2 class="panel-title">Notifications</h2><p class="muted">In-site alerts for new orders and stock thresholds.</p></div>
                    <button class="button" type="button" data-action="mark-all-notifications">Mark all read</button>
                </div>
                <div class="list">
                    ${state.notifications.items.map((item) => `
                        <button class="list-item notification-link ${item.is_read ? 'is-read' : 'is-unread'}" type="button" data-action="open-notification" data-id="${item.id}">
                            <div class="meta-line"><strong>${escapeHtml(item.title)}</strong><span class="pill">${item.is_read ? 'Read' : 'Unread'}</span></div>
                            <div class="muted">${escapeHtml(item.message)}</div>
                        </button>
                    `).join('') || '<div class="empty-state">No notifications yet.</div>'}
                </div>
            </div>
        </section>
    `;
}

function tableHtml(headers, rows) {
    if (!rows.length) return '<div class="empty-state">No records found.</div>';
    return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => {
        const cells = Array.isArray(row) ? row : row.cells || [];
        const attrs = Array.isArray(row) ? '' : Object.entries(row.attrs || {}).map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(value)}"`).join('');
        return `<tr${attrs}>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
}

function productDetailsLabel(product) {
    const variants = Array.isArray(product?.variants)
        ? product.variants.filter((item) => item?.is_active !== false)
        : [];
    const sizeLabels = Array.from(new Set(variants
        .map((item) => String(item?.size_label || '').trim())
        .filter(Boolean)));
    const colorLabels = Array.from(new Set(variants
        .map((item) => String(item?.color_label || '').trim())
        .filter(Boolean)));
    const parts = [];

    if (sizeLabels.length === 1) {
        parts.push(sizeLabels[0]);
    } else if (sizeLabels.length > 1) {
        parts.push(`${sizeLabels.length} sizes`);
    }

    if (colorLabels.length === 1) {
        parts.push(colorLabels[0]);
    } else if (colorLabels.length > 1) {
        parts.push(`${colorLabels.length} colors`);
    }

    return parts.length ? parts.join(' / ') : 'Standard';
}

function primaryProductItem(product) {
    const items = Array.isArray(product?.variants) ? product.variants : [];
    return items.find((item) => item?.is_active !== false) || items[0] || null;
}

function variantOptions(selected = '') {
    const options = state.productCache.flatMap((product) => (product.variants || []).map((variant) => ({
        value: variant.id,
        label: `${product.product_name} / ${productDetailsLabel({ variants: [variant] })}`,
    })));
    return options.map((option) => `<option value="${option.value}" ${String(selected) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
}

function statusOptions(selected, options) {
    return options.map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function categoryOptions(selected = '') {
    const categories = Array.from(new Set([
        ...state.productCategories,
        String(selected || '').trim(),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

    return `
        <option value="" ${selected ? '' : 'selected'}>Uncategorized</option>
        ${categories.map((category) => `
            <option value="${escapeHtml(category)}" ${selected === category ? 'selected' : ''}>${escapeHtml(category)}</option>
        `).join('')}
    `;
}

function normalizeProductColors(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return Array.from(new Set(source
        .map((item) => String(item || '').trim())
        .filter(Boolean)));
}

function productColorOptions(selectedColors = []) {
    return Array.from(new Set([
        ...PRODUCT_COLOR_OPTIONS,
        ...normalizeProductColors(selectedColors),
    ])).sort((left, right) => left.localeCompare(right));
}

function productColorStackHtml(selectedColors = []) {
    const items = normalizeProductColors(selectedColors);
    if (!items.length) {
        return '<span class="product-color-empty">No colors selected.</span>';
    }

    return items.map((color) => `<span class="product-color-chip">${escapeHtml(color)}</span>`).join('');
}

function productColorVariantState(product = null) {
    return Object.fromEntries((Array.isArray(product?.variants) ? product.variants : [])
        .filter((variant) => variant?.is_active !== false)
        .map((variant) => [
            String(variant?.color_label || '').trim().toLowerCase(),
            {
                id: Number(variant?.id || 0),
                color: String(variant?.color_label || '').trim(),
                stock_quantity: Number(variant?.stock_quantity || 0),
            },
        ])
        .filter(([key]) => key !== ''));
}

function productColorStockRowsHtml(selectedColors = [], variantState = {}, fallbackStock = 0) {
    const colors = normalizeProductColors(selectedColors);
    const fallbackValue = Math.max(0, Number(fallbackStock || 0));

    return colors.map((color, index) => {
        const stateKey = String(color || '').trim().toLowerCase();
        const existing = variantState[stateKey] || null;
        const stockValue = existing
            ? Math.max(0, Number(existing.stock_quantity || 0))
            : (colors.length === 1 && index === 0 ? fallbackValue : 0);

        return `
            <div class="product-color-stock-row" data-color-stock-row data-color="${escapeHtml(color)}">
                <div class="product-color-stock-label">${escapeHtml(color)}</div>
                <input type="hidden" data-color-variant-id value="${escapeHtml(existing?.id || '')}">
                <div class="field">
                    <label>Stock</label>
                    <input type="number" min="0" data-color-stock-input value="${escapeHtml(stockValue)}">
                </div>
            </div>
        `;
    }).join('');
}

function productModal(product = null) {
    const primaryItem = primaryProductItem(product) || {};
    const selectedColors = normalizeProductColors(primaryItem.color_label || '');
    const existingVariantColors = Array.from(new Set((Array.isArray(product?.variants) ? product.variants : [])
        .map((variant) => String(variant?.color_label || '').trim())
        .filter(Boolean)));
    const initialColors = existingVariantColors.length > 1
        ? existingVariantColors
        : (selectedColors.length ? selectedColors : existingVariantColors);
    const colorOptions = productColorOptions(initialColors);
    const colorVariantState = productColorVariantState(product);
    const defaultStockQuantity = Number(
        initialColors.length
            ? (product?.total_stock_quantity ?? 0)
            : (primaryItem.stock_quantity ?? 0)
    );
    return modalShell(product ? 'Edit Product' : 'Add Product', `
        <form id="productForm" class="form-grid single">
            <input type="hidden" name="id" value="${product?.id || ''}">
            <input type="hidden" name="variant_id" value="${primaryItem.id || ''}">
            <input type="hidden" name="color_variant_state" value="${escapeHtml(JSON.stringify(colorVariantState))}">
            <div class="form-grid">
                <div class="field"><label>Product Name</label><input name="product_name" value="${escapeHtml(product?.product_name || '')}" required></div>
                <div class="field"><label>Category</label><select name="category">${categoryOptions(product?.category || '')}</select></div>
                <div class="field"><label>Base Price</label><input name="base_price" type="number" step="0.01" value="${product?.base_price || 0}" required></div>
                <div class="field"><label>Low Stock Threshold</label><input name="low_stock_threshold" type="number" value="${product?.low_stock_threshold ?? ''}"></div>
            </div>
            <div class="product-form-support-grid">
                <div class="field"><label>Image (optional)</label><input name="image" type="file" accept="image/*"></div>
                <div class="field"><label>Size (optional)</label><input name="size_label" value="${escapeHtml(primaryItem.size_label || '')}" placeholder="Small, Medium, Large"></div>
                <div class="field ${initialColors.length ? 'hidden' : ''}" data-single-stock-field><label>Stock Qty</label><input name="stock_quantity" type="number" value="${escapeHtml(defaultStockQuantity)}"></div>
                <div class="product-form-color-row ${initialColors.length ? 'has-color-stock' : ''}" data-product-color-row>
                    <div class="field product-form-colors">
                        <label>Colors</label>
                        <input type="hidden" name="color_label" value="${escapeHtml(initialColors.join(', '))}">
                        <div class="product-color-toolbar">
                            <details class="product-color-dropdown" data-product-color-dropdown>
                                <summary class="ghost-button product-color-trigger" data-product-color-summary>${initialColors.length ? `Colors (${initialColors.length})` : 'Enable Colors'}</summary>
                                <div class="product-color-float">
                                    <div class="product-color-float-head">
                                        <strong>Choose colors</strong>
                                        <button class="ghost-button product-color-clear ${initialColors.length ? '' : 'hidden'}" type="button" data-product-color-clear>Clear</button>
                                    </div>
                                    <div class="product-color-checklist">
                                ${colorOptions.map((color) => `
                                    <label class="product-color-option">
                                        <input type="checkbox" data-product-color-choice value="${escapeHtml(color)}" ${initialColors.includes(color) ? 'checked' : ''}>
                                        <span>${escapeHtml(color)}</span>
                                    </label>
                                `).join('')}
                                    </div>
                                </div>
                            </details>
                        </div>
                        <div class="product-color-stack" data-product-color-stack>${productColorStackHtml(initialColors)}</div>
                    </div>
                    <div class="field product-form-color-stock-field ${initialColors.length ? '' : 'hidden'}" data-color-stock-field>
                        <label>Stock Per Color</label>
                        <div class="product-color-stock-list" data-product-color-stock-list>${productColorStockRowsHtml(initialColors, colorVariantState, defaultStockQuantity)}</div>
                    </div>
                </div>
            </div>
            <div class="field">
                <label>Short Description</label>
                <input name="short_description" value="${escapeHtml(product?.short_description || '')}">
            </div>
            <div class="field field-full">
                <label>Description</label>
                <textarea name="description">${escapeHtml(product?.description || '')}</textarea>
            </div>
            <button class="button" type="submit">${product ? 'Save Changes' : 'Create Product'}</button>
        </form>
    `, 'product-form-modal');
}

function bindProductModal(modal) {
    const form = qs('#productForm', modal);
    if (!form) {
        return;
    }

    const hiddenInput = qs('[name="color_label"]', form);
    const variantStateInput = qs('[name="color_variant_state"]', form);
    const singleStockField = qs('[data-single-stock-field]', form);
    const singleStockInput = qs('[name="stock_quantity"]', form);
    const colorRow = qs('[data-product-color-row]', form);
    const colorStockField = qs('[data-color-stock-field]', form);
    const colorStockList = qs('[data-product-color-stock-list]', form);
    const dropdown = qs('[data-product-color-dropdown]', form);
    const summary = qs('[data-product-color-summary]', form);
    const stack = qs('[data-product-color-stack]', form);
    const clearButton = qs('[data-product-color-clear]', form);
    const getChoices = () => qsa('[data-product-color-choice]', form);
    const initialVariantState = (() => {
        try {
            return JSON.parse(String(variantStateInput?.value || '{}'));
        } catch (error) {
            return {};
        }
    })();
    let lastSingleStockValue = Math.max(0, Number(singleStockInput?.value || 0));

    const currentColorVariantState = () => {
        const state = {};
        qsa('[data-color-stock-row]', form).forEach((row) => {
            const color = String(row.dataset.color || '').trim();
            if (!color) {
                return;
            }

            state[color.toLowerCase()] = {
                id: Number(qs('[data-color-variant-id]', row)?.value || 0),
                color,
                stock_quantity: Math.max(0, Number(qs('[data-color-stock-input]', row)?.value || 0)),
            };
        });
        return state;
    };

    const syncProductColors = () => {
        const choices = getChoices();
        const selectedColors = normalizeProductColors(choices.filter((choice) => choice.checked).map((choice) => choice.value));
        const currentRowState = currentColorVariantState();
        const variantState = {
            ...initialVariantState,
            ...currentRowState,
        };

        if (hiddenInput) {
            hiddenInput.value = selectedColors.join(', ');
        }

        if (singleStockInput) {
            lastSingleStockValue = Math.max(0, Number(singleStockInput.value || lastSingleStockValue || 0));
        }

        if (summary) {
            summary.textContent = selectedColors.length ? `Colors (${selectedColors.length})` : 'Enable Colors';
        }

        if (stack) {
            stack.innerHTML = productColorStackHtml(selectedColors);
        }

        clearButton?.classList.toggle('hidden', !selectedColors.length);

        if (singleStockField) {
            singleStockField.classList.toggle('hidden', selectedColors.length > 0);
        }

        if (colorRow) {
            colorRow.classList.toggle('has-color-stock', selectedColors.length > 0);
        }

        if (colorStockField) {
            colorStockField.classList.toggle('hidden', selectedColors.length === 0);
        }

        if (selectedColors.length > 0 && colorStockList) {
            colorStockList.innerHTML = productColorStockRowsHtml(selectedColors, variantState, lastSingleStockValue);
        }

        if (!selectedColors.length && singleStockInput) {
            const totalFromColors = Object.values(currentRowState)
                .reduce((sum, item) => sum + Math.max(0, Number(item?.stock_quantity || 0)), 0);
            if (totalFromColors > 0) {
                singleStockInput.value = String(totalFromColors);
                lastSingleStockValue = totalFromColors;
            }
        }
    };

    getChoices().forEach((choice) => {
        choice.addEventListener('change', syncProductColors);
    });

    clearButton?.addEventListener('click', (event) => {
        event.preventDefault();
        getChoices().forEach((choice) => {
            choice.checked = false;
        });
        syncProductColors();
    });

    modal.addEventListener('click', (event) => {
        if (!dropdown?.open) {
            return;
        }

        if (event.target instanceof Element && dropdown.contains(event.target)) {
            return;
        }

        dropdown.open = false;
    });

    syncProductColors();
}

function userModal(user = null) {
    return modalShell(user ? 'Edit Customer' : 'Add Customer', `
        <form id="userForm" class="form-grid single">
            <input type="hidden" name="id" value="${user?.id || ''}">
            <input type="hidden" name="role" value="customer">
            <div class="form-grid">
                <div class="field"><label>First Name</label><input name="first_name" value="${escapeHtml(user?.first_name || '')}" required></div>
                <div class="field"><label>Last Name</label><input name="last_name" value="${escapeHtml(user?.last_name || '')}" required></div>
                <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(user?.email || '')}" required></div>
                <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(user?.phone || '')}"></div>
                <div class="field"><label>Status</label><select name="account_status"><option value="active" ${user?.account_status !== 'inactive' && user?.account_status !== 'suspended' ? 'selected' : ''}>Active</option><option value="inactive" ${user?.account_status === 'inactive' ? 'selected' : ''}>Inactive</option><option value="suspended" ${user?.account_status === 'suspended' ? 'selected' : ''}>Suspended</option></select></div>
            </div>
            <div class="field"><label>${user ? 'New Password (optional)' : 'Password'}</label><input name="password" type="password" ${user ? '' : 'required'}></div>
            <button class="button" type="submit">${user ? 'Save Customer' : 'Create Customer'}</button>
        </form>
    `);
}

function orderModal(order) {
    return modalShell(`Manage ${order.order_number}`, `
        <form id="orderForm" class="form-grid single">
            <input type="hidden" name="id" value="${order.id}">
            <div class="list">
                <div class="list-item">Customer: <strong>${escapeHtml(order.customer_name)}</strong></div>
                <div class="list-item">Transaction: <strong>${escapeHtml(order.transactions[0]?.transaction_status || order.payment_status)}</strong></div>
            </div>
            <div class="form-grid">
                <div class="field"><label>Order Status</label><select name="order_status">${statusOptions(order.order_status, ['pending', 'processing', 'shipped', 'completed', 'cancelled'])}</select></div>
                <div class="field"><label>Payment Status</label><select name="payment_status">${statusOptions(order.payment_status, ['pending', 'paid', 'failed', 'refunded'])}</select></div>
                <div class="field"><label>Shipment Status</label><select name="shipment_status">${statusOptions(order.shipment_status, ['pending', 'preparing', 'shipped', 'delivered', 'cancelled'])}</select></div>
                <div class="field"><label>Payment Method</label><input name="payment_method" value="${escapeHtml(order.transactions[0]?.payment_method || 'simulated')}"></div>
                <div class="field"><label>Courier Name</label><input name="courier_name" value="${escapeHtml(order.shipments[0]?.courier_name || '')}"></div>
                <div class="field"><label>Tracking Number</label><input name="tracking_number" value="${escapeHtml(order.shipments[0]?.tracking_number || '')}"></div>
            </div>
            <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(order.notes || '')}</textarea></div>
            <div class="field"><label>Shipment Notes</label><textarea name="shipment_notes">${escapeHtml(order.shipments[0]?.notes || '')}</textarea></div>
            <button class="button" type="submit">Save Order</button>
        </form>
    `);
}

function incomingModal(order = null) {
    const items = order?.items?.length ? order.items : [{}];
    return modalShell(order ? 'Edit Incoming Order' : 'Create Incoming Order', `
        <form id="incomingForm" class="form-grid single">
            <input type="hidden" name="id" value="${order?.id || ''}">
            <div class="form-grid">
                <div class="field"><label>Supplier Name</label><input name="supplier_name" value="${escapeHtml(order?.supplier_name || '')}" required></div>
                <div class="field"><label>Reference Number</label><input name="reference_number" value="${escapeHtml(order?.reference_number || '')}"></div>
                <div class="field"><label>Expected Date</label><input name="expected_date" type="date" value="${escapeHtml(order?.expected_date || '')}"></div>
                <div class="field"><label>Status</label><select name="incoming_status">${statusOptions(order?.incoming_status || 'ordered', ['draft', 'ordered', 'partially_received', 'received', 'cancelled'])}</select></div>
            </div>
            <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(order?.notes || '')}</textarea></div>
            <div class="panel">
                <div class="panel-head">
                    <h3 class="panel-title">Items</h3>
                    <button class="ghost-button" type="button" data-action="add-incoming-row">Add Item</button>
                </div>
                <div id="incomingRows">${items.map((item) => incomingRowHtml(item)).join('')}</div>
            </div>
            <button class="button" type="submit">${order ? 'Save Incoming Order' : 'Create Incoming Order'}</button>
        </form>
    `);
}

function stockAdjustmentModal(options = {}) {
    const selectedVariantId = String(options?.productVariantId || '');
    const mode = String(options?.mode || 'delta');
    const title = options?.title || 'Manual Stock Adjustment';
    const submitLabel = options?.submitLabel || 'Apply Adjustment';
    const notes = options?.notes || '';

    return modalShell(title, `
        <p class="muted">Update product stock from a floating popup instead of the main inventory layout.</p>
        <form id="stockAdjustForm" class="form-grid single">
            <div class="field"><label>Product</label><select name="product_variant_id" required>${variantOptions(selectedVariantId)}</select></div>
            <div class="field"><label>Mode</label><select name="adjustment_mode"><option value="delta" ${mode === 'delta' ? 'selected' : ''}>Adjust by delta</option><option value="set" ${mode === 'set' ? 'selected' : ''}>Set exact quantity</option></select></div>
            <div class="field"><label>Value</label><input name="value" type="number" required></div>
            <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(notes)}</textarea></div>
            <button class="button" type="submit">${escapeHtml(submitLabel)}</button>
        </form>
    `, 'modal-compact');
}

function incomingRowHtml(item = {}) {
    return `
        <div class="variant-row incoming-row">
            <input type="hidden" name="incoming_item_id" value="${item.id || ''}">
            <div class="field"><label>Product</label><select name="incoming_variant_id">${variantOptions(item.product_variant_id || '')}</select></div>
            <div class="field"><label>Ordered Qty</label><input name="incoming_quantity" type="number" value="${item.quantity_ordered || 1}"></div>
            <div class="field"><label>Unit Cost</label><input name="incoming_cost" type="number" step="0.01" value="${item.unit_cost || 0}"></div>
            <button class="danger-button" type="button" data-action="remove-incoming-row">Remove</button>
        </div>
    `;
}

function bulkDeleteToast(result, label) {
    const deletedCount = Number(result?.deleted_count || 0);
    const skippedCount = Number(result?.skipped_count || 0);
    const suffix = deletedCount === 1 ? '' : 's';

    if (skippedCount > 0) {
        return `${deletedCount} archived ${label}${suffix} deleted, ${skippedCount} skipped.`;
    }

    return `${deletedCount} archived ${label}${suffix} deleted.`;
}

async function handleClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const id = Number(trigger.dataset.id || 0);
    const recordId = String(trigger.dataset.id || '').trim();

    try {
        if (trigger.dataset.action === 'refresh-products') {
            state.filters.products.search = qs('#productSearch')?.value || '';
            state.filters.products.stock_status = qs('#productStockFilter')?.value || '';
            rememberSearchHistory('admin-products', state.filters.products.search);
            await loadPage('products');
        }
        if (trigger.dataset.action === 'refresh-orders') {
            state.filters.orders.search = qs('#orderSearch')?.value || '';
            state.filters.orders.order_status = qs('#orderStatusFilter')?.value || '';
            rememberSearchHistory('admin-orders', state.filters.orders.search);
            await loadPage('orders');
        }
        if (trigger.dataset.action === 'refresh-users') {
            state.filters.users.search = qs('#userSearch')?.value || '';
            rememberSearchHistory('admin-users', state.filters.users.search);
            await loadPage('users');
        }
        if (trigger.dataset.action === 'refresh-inventory') {
            state.filters.inventory.search = qs('#incomingSearch')?.value || '';
            state.filters.inventory.incoming_status = qs('#incomingStatusFilter')?.value || '';
            rememberSearchHistory('admin-incoming', state.filters.inventory.search);
            await loadPage('inventory');
        }
        if (trigger.dataset.action === 'open-products-archive') {
            state.filters.products.visibility = 'archived';
            await openPage('products');
        }
        if (trigger.dataset.action === 'open-products-active') {
            state.filters.products.visibility = 'active';
            await openPage('products');
        }
        if (trigger.dataset.action === 'open-orders-archive') {
            state.filters.orders.visibility = 'archived';
            await openPage('orders');
        }
        if (trigger.dataset.action === 'open-orders-active') {
            state.filters.orders.visibility = 'active';
            await openPage('orders');
        }
        if (trigger.dataset.action === 'open-users-archive') {
            state.filters.users.visibility = 'archived';
            await openPage('users');
        }
        if (trigger.dataset.action === 'open-users-active') {
            state.filters.users.visibility = 'active';
            await openPage('users');
        }
        if (trigger.dataset.action === 'open-users-admins') {
            state.filters.users.search = '';
            state.filters.users.role = 'admin';
            state.filters.users.visibility = 'active';
            await openPage('users');
        }
        if (trigger.dataset.action === 'open-users-active-customers') {
            state.filters.users.search = '';
            state.filters.users.role = 'customer';
            state.filters.users.visibility = 'active';
            await openPage('users');
        }
        if (trigger.dataset.action === 'open-inventory-archive') {
            state.filters.inventory.visibility = 'archived';
            await openPage('inventory');
        }
        if (trigger.dataset.action === 'open-inventory-active') {
            state.filters.inventory.visibility = 'active';
            await openPage('inventory');
        }
        if (trigger.dataset.action === 'open-report-view') {
            openReportView(trigger.dataset.view || 'inventory');
        }
        if (trigger.dataset.action === 'open-dashboard-metric') {
            const target = String(trigger.dataset.target || '').trim();

            if (target === 'customers') {
                resetTargetFilters('users');
                state.filters.users.role = 'customer';
                await openPage('users');
            }

            if (target === 'admins') {
                state.filters.users.search = '';
                state.filters.users.role = 'admin';
                state.filters.users.visibility = 'active';
                await openPage('users');
            }

            if (target === 'open_orders') {
                state.filters.orders.search = '';
                state.filters.orders.order_status = 'open';
                state.filters.orders.visibility = 'active';
                await openPage('orders');
            }

            if (target === 'incoming_orders') {
                state.filters.inventory.search = '';
                state.filters.inventory.incoming_status = 'open';
                state.filters.inventory.visibility = 'active';
                await openPage('inventory');
            }

            if (target === 'notifications') {
                await refreshNotifications();
                openNotificationsModal();
            }

            if (target === 'stock_attention') {
                state.filters.products.search = '';
                state.filters.products.stock_status = 'attention';
                state.filters.products.visibility = 'active';
                await openPage('products');
            }
        }
        if (trigger.dataset.action === 'open-dashboard-stock-breakdown') {
            const stockStatus = String(trigger.dataset.stockStatus || '').trim();

            if (['in_stock', 'low_stock', 'out_of_stock'].includes(stockStatus)) {
                resetTargetFilters('products');
                state.filters.products.stock_status = stockStatus;
                await openPage('products');
            }
        }
        if (trigger.dataset.action === 'export-report') {
            exportReport(trigger.dataset.format || 'csv');
        }
        if (trigger.dataset.action === 'open-settings-editor' || trigger.dataset.action === 'open-branding-modal') {
            const modal = mountModal(settingsEditorModal());
            if (modal) {
                bindSettingsEditorModal(modal);
            }
        }
        if (trigger.dataset.action === 'open-categories-archive') {
            state.settingsCategoryView = 'archived';
            renderNav();
            renderCategoriesPage();
        }
        if (trigger.dataset.action === 'open-categories-active') {
            state.settingsCategoryView = 'active';
            renderNav();
            renderCategoriesPage();
        }
        if (trigger.dataset.action === 'open-category-modal') {
            mountModal(categoryModal());
        }
        if (trigger.dataset.action === 'edit-category') {
            const category = categoryRecord(recordId);
            if (!category) {
                showToast('Category not found.');
                return;
            }
            mountModal(categoryModal(category));
        }
        if (trigger.dataset.action === 'archive-category' && recordId !== '' && confirm('Archive this category?')) {
            await apiPost('settings.archive_category', { id: recordId });
            await loadPage('categories');
            showToast('Category archived.');
        }
        if (trigger.dataset.action === 'restore-category' && recordId !== '' && confirm('Restore this category?')) {
            await apiPost('settings.restore_category', { id: recordId });
            await loadPage('categories');
            showToast('Category restored.');
        }
        if (trigger.dataset.action === 'open-dashboard-order') {
            if (id > 0) {
                setHighlightTarget({ table: 'orders', id });
                resetTargetFilters('orders');
                await openPage('orders');
            }
        }
        if (trigger.dataset.action === 'open-dashboard-low-stock') {
            const productId = Number(trigger.dataset.productId || 0);
            const variantId = Number(trigger.dataset.variantId || 0);
            const targetProductId = productId > 0 ? productId : productIdForVariant(variantId);
            if (targetProductId > 0) {
                setHighlightTarget({ table: 'products', id: targetProductId });
                resetTargetFilters('products');
                await openPage('products');
            }
        }
        if (trigger.dataset.action === 'open-product-modal') {
            const modal = mountModal(productModal());
            if (modal) {
                bindProductModal(modal);
            }
        }
        if (trigger.dataset.action === 'edit-product') {
            const modal = mountModal(productModal((state.data.products || []).find((item) => item.id === id)));
            if (modal) {
                bindProductModal(modal);
            }
        }
        if ((trigger.dataset.action === 'delete-product' || trigger.dataset.action === 'archive-product') && confirm('Archive this product?')) {
            await apiPost('products.archive', { id });
            await ensureProductCache();
            await loadPage('products');
            showToast('Product archived.');
        }
        if (trigger.dataset.action === 'restore-product' && confirm('Restore this product from archive?')) {
            await apiPost('products.restore', { id });
            await ensureProductCache();
            await loadPage('products');
            showToast('Product restored.');
        }
        if (trigger.dataset.action === 'purge-product' && confirm('Permanently delete this archived product?')) {
            await apiPost('products.purge', { id });
            await ensureProductCache();
            await loadPage('products');
            showToast('Archived product deleted.');
        }
        if (trigger.dataset.action === 'restore-all-products' && confirm('Restore all archived products in this filtered list?')) {
            const response = await apiPost('products.restore_all', { ...state.filters.products });
            await ensureProductCache();
            await loadPage('products');
            showToast(`${Number(response.restored_count || 0)} archived products restored.`);
        }
        if (trigger.dataset.action === 'purge-all-products' && confirm('Permanently delete all archived products in this filtered list?')) {
            const response = await apiPost('products.purge_all', { ...state.filters.products });
            await ensureProductCache();
            await loadPage('products');
            showToast(bulkDeleteToast(response, 'product'));
        }
        if (trigger.dataset.action === 'open-user-modal') mountModal(userModal());
        if (trigger.dataset.action === 'edit-user') mountModal(userModal((state.data.users || []).find((item) => item.id === id)));
        if ((trigger.dataset.action === 'delete-user' || trigger.dataset.action === 'archive-user') && confirm('Archive this customer?')) {
            await apiPost('users.archive', { id });
            await loadPage('users');
            showToast('Customer archived.');
        }
        if (trigger.dataset.action === 'restore-user' && confirm('Restore this customer from archive?')) {
            await apiPost('users.restore', { id });
            await loadPage('users');
            showToast('Customer restored.');
        }
        if (trigger.dataset.action === 'purge-user' && confirm('Permanently delete this archived customer?')) {
            await apiPost('users.purge', { id });
            await loadPage('users');
            showToast('Archived customer deleted.');
        }
        if (trigger.dataset.action === 'restore-all-users' && confirm('Restore all archived customers in this filtered list?')) {
            const response = await apiPost('users.restore_all', { ...state.filters.users });
            await loadPage('users');
            showToast(`${Number(response.restored_count || 0)} archived customers restored.`);
        }
        if (trigger.dataset.action === 'purge-all-users' && confirm('Permanently delete all archived customers in this filtered list?')) {
            const response = await apiPost('users.purge_all', { ...state.filters.users });
            await loadPage('users');
            showToast(bulkDeleteToast(response, 'customer'));
        }
        if (trigger.dataset.action === 'open-order-modal') mountModal(orderModal((state.data.orders || []).find((item) => item.id === id)));
        if (trigger.dataset.action === 'archive-order' && confirm('Archive this order?')) {
            await apiPost('orders.archive', { id });
            await loadPage('orders');
            showToast('Order archived.');
        }
        if (trigger.dataset.action === 'restore-order' && confirm('Restore this order from archive?')) {
            await apiPost('orders.restore', { id });
            await loadPage('orders');
            showToast('Order restored.');
        }
        if (trigger.dataset.action === 'purge-order' && confirm('Permanently delete this archived order?')) {
            await apiPost('orders.purge', { id });
            await loadPage('orders');
            showToast('Archived order deleted.');
        }
        if (trigger.dataset.action === 'restore-all-orders' && confirm('Restore all archived orders in this filtered list?')) {
            const response = await apiPost('orders.restore_all', { ...state.filters.orders });
            await loadPage('orders');
            showToast(`${Number(response.restored_count || 0)} archived orders restored.`);
        }
        if (trigger.dataset.action === 'purge-all-orders' && confirm('Permanently delete all archived orders in this filtered list?')) {
            const response = await apiPost('orders.purge_all', { ...state.filters.orders });
            await loadPage('orders');
            showToast(bulkDeleteToast(response, 'order'));
        }
        if (trigger.dataset.action === 'open-incoming-modal') mountModal(incomingModal());
        if (trigger.dataset.action === 'open-stock-adjust-modal') mountModal(stockAdjustmentModal());
        if (trigger.dataset.action === 'open-product-restock') {
            mountModal(stockAdjustmentModal({
                productVariantId: Number(trigger.dataset.variantId || 0),
                mode: 'delta',
                title: 'Restock Product',
                submitLabel: 'Restock',
                notes: 'Restock from product list',
            }));
        }
        if (trigger.dataset.action === 'edit-incoming') mountModal(incomingModal((state.data.inventory?.incoming || []).find((item) => item.id === id)));
        if (trigger.dataset.action === 'receive-incoming') {
            await apiPost('inventory.receive_incoming', { id });
            await ensureProductCache();
            await Promise.all([loadPage('inventory'), refreshNotifications()]);
            showToast('Incoming stock received and inventory updated.');
        }
        if (trigger.dataset.action === 'archive-incoming' && confirm('Archive this incoming order?')) {
            await apiPost('inventory.archive_incoming', { id });
            await loadPage('inventory');
            showToast('Incoming order archived.');
        }
        if (trigger.dataset.action === 'restore-incoming' && confirm('Restore this incoming order from archive?')) {
            await apiPost('inventory.restore_incoming', { id });
            await loadPage('inventory');
            showToast('Incoming order restored.');
        }
        if (trigger.dataset.action === 'purge-incoming' && confirm('Permanently delete this archived incoming order?')) {
            await apiPost('inventory.purge_incoming', { id });
            await loadPage('inventory');
            showToast('Archived incoming order deleted.');
        }
        if (trigger.dataset.action === 'restore-all-incoming' && confirm('Restore all archived incoming orders in this filtered list?')) {
            const response = await apiPost('inventory.restore_all_incoming', { ...state.filters.inventory });
            await loadPage('inventory');
            showToast(`${Number(response.restored_count || 0)} archived incoming orders restored.`);
        }
        if (trigger.dataset.action === 'purge-all-incoming' && confirm('Permanently delete all archived incoming orders in this filtered list?')) {
            const response = await apiPost('inventory.purge_all_incoming', { ...state.filters.inventory });
            await loadPage('inventory');
            showToast(bulkDeleteToast(response, 'incoming order'));
        }
        if (trigger.dataset.action === 'add-incoming-row') qs('#incomingRows')?.insertAdjacentHTML('beforeend', incomingRowHtml());
        if (trigger.dataset.action === 'remove-incoming-row') trigger.closest('.incoming-row')?.remove();
        if (trigger.dataset.action === 'open-notification') {
            await openNotification(id);
        }
        if (trigger.dataset.action === 'mark-all-notifications') {
            await apiPost('notifications.mark_read', {});
            await refreshNotifications();
            if (state.currentPage === 'notifications') renderNotificationsPage();
            closeModal();
            showToast('Notifications marked as read.');
        }
    } catch (error) {
        showToast(error.message);
    }
}

function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    const row = event.target.closest('tr[data-action="open-dashboard-order"]');
    if (!row) {
        return;
    }

    event.preventDefault();
    row.click();
}

async function handleSubmit(event) {
    const form = event.target;
    const submitButton = event.submitter || form.querySelector('button[type="submit"]');

    try {
        if (form.matches('#productForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            const formData = new FormData(form);
            formData.set('variants_json', JSON.stringify(collectVariantRows(form)));
            await apiPost('products.save', {}, { formData });
            closeModal();
            await Promise.all([ensureProductCache(), loadPage('products'), refreshNotifications()]);
            showToast('Product saved.');
        }
        if (form.matches('#userForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            await apiPost('users.save', Object.fromEntries(new FormData(form).entries()));
            closeModal();
            await loadPage('users');
            showToast('Customer saved.');
        }
        if (form.matches('#orderForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            await apiPost('orders.update', Object.fromEntries(new FormData(form).entries()));
            closeModal();
            await Promise.all([loadPage('orders'), refreshNotifications()]);
            showToast('Order updated.');
        }
        if (form.matches('#incomingForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            const payload = Object.fromEntries(new FormData(form).entries());
            payload.items = collectIncomingRows(form);
            await apiPost('inventory.save_incoming', payload);
            closeModal();
            await loadPage('inventory');
            showToast('Incoming order saved.');
        }
        if (form.matches('#stockAdjustForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            await apiPost('inventory.adjust_stock', Object.fromEntries(new FormData(form).entries()));
            form.reset();
            closeModal();
            await ensureProductCache();
            await Promise.all([loadPage('inventory'), refreshNotifications()]);
            showToast('Stock adjusted.');
        }
        if (form.matches('#settingsEditorForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            const formData = new FormData(form);
            if (event.submitter?.dataset.removeBrandingLogo === '1') {
                formData.set('remove_logo', '1');
            }
            const response = await apiPost('settings.save_everything', {}, { formData });
            state.data.branding = response.branding || state.data.branding;
            applyBranding(state.data.branding);
            closeModal();
            await refreshSession();
            await loadPage('settings');
            showToast('Settings updated.');
        }
        if (form.matches('#categoryForm')) {
            event.preventDefault();
            setButtonLoading(submitButton, true);
            const payload = Object.fromEntries(new FormData(form).entries());
            const action = payload.id ? 'settings.update_category' : 'settings.create_category';
            const response = await apiPost(action, payload);
            state.data.settingsCategories = normalizeSettingsCategories(response);
            state.productCategories = state.data.settingsCategories.categories;
            closeModal();
            await loadPage('categories');
            showToast(payload.id ? 'Category updated.' : 'Category created.');
        }
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(submitButton, false, submitButton?.textContent || 'Save');
    }
}

function collectVariantRows(form) {
    const sizeLabel = qs('[name="size_label"]', form)?.value || '';
    const selectedColors = normalizeProductColors(qs('[name="color_label"]', form)?.value || '');

    if (selectedColors.length) {
        return qsa('[data-color-stock-row]', form).map((row) => ({
            id: qs('[data-color-variant-id]', row)?.value || '',
            variant_name: 'Default',
            size_label: sizeLabel,
            color_label: row.dataset.color || '',
            price_override: null,
            stock_quantity: qs('[data-color-stock-input]', row)?.value || 0,
        })).filter((variant) => String(variant.color_label || '').trim() !== '');
    }

    return [{
        id: qs('[name="variant_id"]', form)?.value || '',
        variant_name: 'Default',
        size_label: sizeLabel,
        color_label: '',
        price_override: null,
        stock_quantity: qs('[name="stock_quantity"]', form)?.value || 0,
    }];
}

function collectIncomingRows(form) {
    return qsa('.incoming-row', form).map((row) => ({
        id: qs('[name="incoming_item_id"]', row)?.value || '',
        product_variant_id: qs('[name="incoming_variant_id"]', row)?.value || '',
        quantity_ordered: qs('[name="incoming_quantity"]', row)?.value || 1,
        unit_cost: qs('[name="incoming_cost"]', row)?.value || 0,
    })).filter((item) => item.product_variant_id);
}

function openNotificationsModal() {
    mountModal(modalShell('Notifications', notificationsMarkup().replace('<section class="page-section">', '').replace('</section>', '')));
}

async function logout() {
    await apiPost('auth.logout');
    window.location.href = STOREFRONT_URL;
}

async function openNotification(notificationId) {
    const notification = (state.notifications.items || []).find((item) => item.id === notificationId);
    if (!notification) {
        showToast('Notification not found.');
        return;
    }

    if (!notification.is_read) {
        await apiPost('notifications.mark_read', { id: notification.id });
    }

    const target = notificationTarget(notification);
    setHighlightTarget(target.highlight);
    resetTargetFilters(target.highlight?.table || '');

    await refreshNotifications();
    closeModal();
    await openPage(target.page);
}

function notificationTarget(notification) {
    const table = String(notification.related_table || '').trim();
    const relatedId = Number(notification.related_id || 0);
    const derivedHighlight = highlightTargetForNotification(table, relatedId);
    const page = derivedHighlight?.page || pageForRelatedTable(table) || pageFromNotificationLink(notification.link_url);

    return {
        page,
        highlight: derivedHighlight?.highlight || (table && relatedId > 0 ? { table, id: relatedId } : null),
    };
}

function pageFromNotificationLink(linkUrl) {
    if (!linkUrl) {
        return '';
    }

    try {
        const normalized = linkUrl.startsWith('http')
            ? new URL(linkUrl)
            : new URL(linkUrl, window.location.href);
        return normalizePage(normalized.searchParams.get('page') || '');
    } catch (error) {
        return '';
    }
}

function pageForRelatedTable(table) {
    if (table === 'orders') {
        return 'orders';
    }
    if (table === 'incoming_orders') {
        return 'inventory';
    }
    if (table === 'products') {
        return 'products';
    }
    if (table === 'product_variants') {
        return 'products';
    }
    return 'dashboard';
}

function setHighlightTarget(target) {
    const url = new URL(window.location.href);
    if (target?.table && target?.id) {
        url.searchParams.set('highlight_table', target.table);
        url.searchParams.set('highlight_id', String(target.id));
    } else {
        url.searchParams.delete('highlight_table');
        url.searchParams.delete('highlight_id');
    }
    window.history.replaceState({}, '', url);
}

function getHighlightTarget() {
    const url = new URL(window.location.href);
    const table = url.searchParams.get('highlight_table') || '';
    const id = Number(url.searchParams.get('highlight_id') || 0);
    return table && id > 0 ? { table, id } : null;
}

function clearHighlightTarget() {
    setHighlightTarget(null);
}

function resetTargetFilters(table) {
    if (table === 'products') {
        state.filters.products.search = '';
        state.filters.products.stock_status = '';
        state.filters.products.visibility = 'active';
    }

    if (table === 'orders') {
        state.filters.orders.search = '';
        state.filters.orders.order_status = '';
        state.filters.orders.visibility = 'active';
    }

    if (table === 'users') {
        state.filters.users.search = '';
        state.filters.users.role = 'customer';
        state.filters.users.visibility = 'active';
    }

    if (table === 'incoming_orders') {
        state.filters.inventory.search = '';
        state.filters.inventory.incoming_status = '';
        state.filters.inventory.visibility = 'active';
    }
}

function highlightTargetForNotification(table, relatedId) {
    if (!table || relatedId <= 0) {
        return null;
    }

    if (table === 'product_variants') {
        const productId = productIdForVariant(relatedId);
        if (productId > 0) {
            return {
                page: 'products',
                highlight: { table: 'products', id: productId },
            };
        }
    }

    return {
        page: pageForRelatedTable(table),
        highlight: { table, id: relatedId },
    };
}

function productIdForVariant(variantId) {
    const sources = [];

    if (Array.isArray(state.productCache)) {
        sources.push(...state.productCache);
    }

    if (Array.isArray(state.data.products)) {
        sources.push(...state.data.products);
    }

    for (const product of sources) {
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        if (variants.some((variant) => Number(variant.id) === Number(variantId))) {
            return Number(product.id || 0);
        }
    }

    return 0;
}

function applyPendingHighlight() {
    const target = getHighlightTarget();
    if (!target) {
        return;
    }

    const element = qs(`[data-highlight-target="${target.table}:${target.id}"]`);
    if (!element) {
        return;
    }

    qsa('.record-highlight').forEach((node) => node.classList.remove('record-highlight'));
    element.classList.add('record-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
        element.classList.remove('record-highlight');
        if (getHighlightTarget()?.table === target.table && getHighlightTarget()?.id === target.id) {
            clearHighlightTarget();
        }
    }, 4200);
}

init().catch((error) => {
    showToast(error.message);
});
