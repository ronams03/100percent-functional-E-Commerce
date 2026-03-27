import { apiGet, apiPost } from './api-client.js';
import { loadBranding } from './branding.js';
import {
    attachSearchAssist,
    buildHistorySuggestions,
    rankSearchCandidates,
    rememberSearchHistory,
} from './search-assist.js';
import {
    closeModal,
    enhancePasswordFields,
    escapeHtml,
    formatMoney,
    modalShell,
    mountModal,
    qs,
    qsa,
    setButtonLoading,
    showToast,
    statusClass,
} from './shared.js';

const state = {
    view: 'shop',
    cartOpen: false,
    checkoutStep: 1,
    categories: [],
    session: {
        user: null,
        bootstrap: {},
    },
    products: [],
    searchCatalog: [],
    cart: {
        items: [],
        subtotal: 0,
        total: 0,
        total_items: 0,
    },
    orders: [],
};

const APP_ROOT_PREFIX = (() => {
    const fallback = String(globalThis.APP_BASE_PREFIX || '').replace(/\/$/, '');
    const apiBase = String(globalThis.APP_API_BASE || 'api/index.php');
    try {
        const apiUrl = new URL(apiBase, window.location.href);
        const root = apiUrl.pathname.replace(/\/api\/index\.php$/i, '').replace(/\/$/, '');
        return root || fallback;
    } catch (error) {
        return fallback;
    }
})();

const PRODUCT_IMAGE_FALLBACK = APP_ROOT_PREFIX
    ? `${APP_ROOT_PREFIX}/assets/images/product-placeholder.svg`
    : 'assets/images/product-placeholder.svg';

const ADMIN_PANEL_URL = APP_ROOT_PREFIX
    ? `${APP_ROOT_PREFIX}/admin/?page=dashboard`
    : 'admin/?page=dashboard';
const ADMIN_PREVIEW_PARAM = 'admin_preview';
const ADMIN_PREVIEW_STORAGE_KEY = 'admin_customer_preview';

async function init() {
    await loadBranding();
    enhancePasswordFields(document);
    bindStaticEvents();
    await refreshAll();
}

function bindStaticEvents() {
    qsa('[data-view-trigger]').forEach((button) => {
        button.addEventListener('click', () => switchView(button.dataset.viewTrigger));
    });

    qs('#shopAuthButton')?.addEventListener('click', () => openAuthModal('login'));
    qs('#shopLogoutButton')?.addEventListener('click', logout);
    qs('#shopRefreshProducts')?.addEventListener('click', loadProducts);
    qs('#shopRefreshOrders')?.addEventListener('click', loadOrders);
    qs('#shopCategoryFilter')?.addEventListener('change', loadProducts);
    setupShopSearchAssist();

    qs('#shopProductsGrid')?.addEventListener('click', handleProductGridClick);
    qs('#shopCartItems')?.addEventListener('click', handleCartClick);
    qs('#shopCheckoutForm')?.addEventListener('submit', handleCheckout);
    qs('#shopCheckoutNext')?.addEventListener('click', handleCheckoutNext);
    qs('#shopCheckoutBack')?.addEventListener('click', () => setCheckoutStep(1));
    qs('#shopProfileForm')?.addEventListener('submit', handleProfileUpdate);
    qs('#shopPasswordForm')?.addEventListener('submit', handlePasswordChange);
    qs('#shopCartToggle')?.addEventListener('click', () => setCartOpen(!state.cartOpen));
    qs('#shopCartClose')?.addEventListener('click', () => setCartOpen(false));
    qs('#shopCartBackdrop')?.addEventListener('click', () => setCartOpen(false));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.cartOpen) {
            setCartOpen(false);
        }
    });
}

async function refreshAll() {
    if (!(await refreshSession())) {
        return;
    }
    await loadCategories();
    await loadProducts();

    if (state.session.user) {
        await Promise.all([loadCart(), loadOrders()]);
    } else {
        state.cart = { items: [], subtotal: 0, total: 0, total_items: 0 };
        state.orders = [];
    }

    render();
    maybePromptPasswordChange();
}

async function refreshSession() {
    const session = await apiGet('auth.me');
    const previewRequested = isAdminPreviewRequested();
    if (session.user?.role === 'admin') {
        if (previewRequested) {
            setAdminPreviewStorage(true);
        }
        state.session = {
            ...session,
            admin_viewer: session.user,
            user: null,
        };
        renderSession();
        return true;
    }
    setAdminPreviewStorage(false);
    state.session = {
        ...session,
        admin_viewer: null,
    };
    renderSession();
    return true;
}

async function loadProducts() {
    const searchValue = qs('#shopSearchInput')?.value || '';
    const categoryValue = qs('#shopCategoryFilter')?.value || '';
    rememberSearchHistory('shop-products', searchValue);
    state.products = (await apiGet('products.list', {
        search: searchValue,
        category: categoryValue,
    })).items;
    if (searchValue.trim() === '' && categoryValue.trim() === '') {
        state.searchCatalog = state.products.slice();
    }
    renderCategoryFilter();
    renderProducts();
    renderOrderStats();
}

function setupShopSearchAssist() {
    const input = qs('#shopSearchInput');
    if (!input) {
        return;
    }

    attachSearchAssist({
        input,
        contextKey: 'shop-products',
        buildSuggestions: ({ query }) => {
            const historySuggestions = buildHistorySuggestions('shop-products', query, 4);
            const historyValues = new Set(historySuggestions.map((item) => String(item.value || '').trim().toLowerCase()));
            const catalog = state.searchCatalog.length ? state.searchCatalog : state.products;
            const smartSuggestions = rankSearchCandidates(query, catalog.map((item, index) => ({
                value: item.product_name,
                label: item.product_name,
                hint: String(item.category || '').trim() || formatMoney(item.base_price),
                keywords: [item.short_description, item.description],
                priority: 14 - index,
            })), query ? 6 : 5)
                .filter((item) => !historyValues.has(String(item.value || '').trim().toLowerCase()))
                .map((item) => ({
                    ...item,
                    group: query ? 'Suggestions' : 'Suggested',
                    kind: 'suggestion',
                }));

            return [...historySuggestions, ...smartSuggestions];
        },
        onSearch: async (value) => {
            const searchInput = qs('#shopSearchInput');
            if (searchInput) {
                searchInput.value = value;
            }
            await loadProducts();
        },
    });
}

async function loadCategories() {
    try {
        const payload = await apiGet('settings.public_categories');
        state.categories = Array.isArray(payload.categories) ? payload.categories : [];
    } catch (error) {
        state.categories = [];
    }
    renderCategoryFilter();
}

async function loadCart() {
    if (!state.session.user) {
        return;
    }
    state.cart = (await apiGet('cart.get')).cart;
    renderCart();
    renderOrderStats();
}

async function loadOrders() {
    if (!state.session.user) {
        return;
    }
    state.orders = (await apiGet('orders.my_list')).items;
    renderOrderStats();
    renderOrders();
}

function render() {
    renderOrderStats();
    renderSession();
    renderCategoryFilter();
    renderProducts();
    renderCart();
    renderOrders();
    renderProfile();
    renderCartPopup();
    renderCheckoutFlow();
    switchView(state.view);
}

function renderOrderStats() {
    const target = qs('#shopOrderStats');
    if (!target) {
        return;
    }

    const stats = [
        {
            label: 'Products',
            value: state.products.length,
        },
        {
            label: 'Cart Items',
            value: state.cart.total_items || 0,
        },
        {
            label: 'Orders',
            value: state.orders.length || 0,
        },
    ];

    target.innerHTML = stats.map((stat) => `
        <div class="shop-stat">
            <span class="muted">${escapeHtml(stat.label)}</span>
            <strong>${escapeHtml(stat.value)}</strong>
        </div>
    `).join('');
}

function renderSession() {
    const user = state.session.user;
    const adminViewer = state.session.admin_viewer;
    const readOnlyPreview = !!adminViewer;

    qs('#shopAdminLink')?.classList.toggle('hidden', !adminViewer && (!user || user.role !== 'admin'));
    qs('#shopLogoutButton')?.classList.toggle('hidden', !user && !adminViewer);
    qs('#shopAuthButton')?.classList.toggle('hidden', !!user || !!adminViewer);
    qs('#shopCartToggle')?.classList.toggle('hidden', readOnlyPreview);
    qsa('[data-view-trigger="orders"], [data-view-trigger="profile"]').forEach((button) => {
        button.classList.toggle('hidden', readOnlyPreview);
    });
    renderProfile();
}

function renderCategoryFilter() {
    const select = qs('#shopCategoryFilter');
    if (!select) {
        return;
    }

    const selected = select.value || '';
    const categories = Array.from(new Set([
        ...state.categories,
        selected,
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));

    select.innerHTML = `
        <option value="">All categories</option>
        ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
    `;

    if (selected && categories.includes(selected)) {
        select.value = selected;
    }
}

function renderProducts() {
    const grid = qs('#shopProductsGrid');
    if (!state.products.length) {
        grid.innerHTML = '<div class="empty-state">No products match the current filter.</div>';
        return;
    }

    grid.innerHTML = state.products.map((product) => {
        const item = productPrimaryItem(product);
        const stockLeft = Number(product?.total_stock_quantity || item?.stock_quantity || 0);
        const colorOptions = Array.from(new Set(activeProductVariants(product)
            .map((variant) => String(variant?.color_label || '').trim())
            .filter(Boolean)));
        const requiresColorChoice = colorOptions.length > 1;
        return `
            <article class="card product-card">
                <button class="product-card-button" type="button" data-open-product="${product.id}">
                    <div class="product-image">
                        <img src="${escapeHtml(resolveProductImagePath(product.main_image_path))}" alt="${escapeHtml(product.product_name)}" onerror="this.onerror=null;this.src='${escapeHtml(PRODUCT_IMAGE_FALLBACK)}';">
                    </div>
                    <div class="product-meta">
                        <div class="meta-line">
                            <h3>${escapeHtml(product.product_name)}</h3>
                            <span class="status-tag ${statusClass(product.stock_status)}">${escapeHtml(product.stock_status.replaceAll('_', ' '))}</span>
                        </div>
                        <div class="price">${formatMoney(product.base_price)}</div>
                        <div class="product-card-details">
                            <span class="pill">${escapeHtml(productDetailLabel(product))}</span>
                            <span class="pill">${stockLeft} left</span>
                        </div>
                        <p class="muted product-card-copy">${escapeHtml(product.short_description || product.description || 'Tap to view product details.')}</p>
                    </div>
                </button>
                <div class="product-card-actions">
                    <button class="button product-card-add" type="button" ${requiresColorChoice ? `data-open-product="${product.id}"` : `data-add-to-cart="${item?.id || 0}"`} ${!item || stockLeft <= 0 ? 'disabled' : ''}>
                        ${requiresColorChoice ? 'Choose Color' : 'Add to Cart'}
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

function renderCart() {
    const list = qs('#shopCartItems');
    const badge = qs('#shopCartBadge');
    if (badge) {
        badge.textContent = String(state.cart.total_items || 0);
    }

    if (!state.session.user || !state.cart.items.length) {
        state.checkoutStep = 1;
    }

    if (!state.session.user) {
        list.innerHTML = '<div class="empty-state">Log in to use the cart and checkout.</div>';
        renderCheckoutFlow();
        return;
    }

    if (!state.cart.items.length) {
        list.innerHTML = '<div class="empty-state">Your cart is empty.</div>';
    } else {
        list.innerHTML = state.cart.items.map((item) => `
            <div class="list-item cart-item">
                <div class="cart-item-row">
                    <button class="cart-item-open" type="button" data-open-cart-product="${item.product_id}">
                        <strong class="cart-item-name">${escapeHtml(item.product_name)}</strong>
                        <span class="muted cart-item-detail">${escapeHtml(item.variant_name || 'Default')}</span>
                        <span class="cart-item-price">@ ${formatMoney(item.unit_price)} each</span>
                    </button>
                    <div class="cart-item-quantity" aria-label="Quantity">
                        <button class="ghost-button cart-qty-button" type="button" data-cart-decrease="${item.id}" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                        <span class="cart-qty-value">${item.quantity}</span>
                        <button class="ghost-button cart-qty-button" type="button" data-cart-increase="${item.id}" ${item.quantity >= item.stock_quantity ? 'disabled' : ''}>+</button>
                    </div>
                    <strong class="cart-item-total">${formatMoney(item.line_total)}</strong>
                    <button class="ghost-button cart-remove-button" type="button" data-remove-cart-item="${item.id}" aria-label="Remove ${escapeHtml(item.product_name)}">x</button>
                </div>
            </div>
        `).join('') + `
            <div class="list-item">
                <div class="meta-line"><span>Subtotal</span><strong>${formatMoney(state.cart.subtotal)}</strong></div>
                <div class="meta-line"><span>Total</span><strong>${formatMoney(state.cart.total)}</strong></div>
            </div>
        `;
    }

    renderCheckoutFlow();
}

function renderCartPopup() {
    const overlay = qs('#shopCartOverlay');
    const toggle = qs('#shopCartToggle');
    const popup = qs('#shopCartPopup');
    if (!overlay || !toggle || !popup) {
        return;
    }

    overlay.classList.toggle('hidden', !state.cartOpen);
    toggle.setAttribute('aria-expanded', String(state.cartOpen));
    popup.setAttribute('aria-hidden', String(!state.cartOpen));
}

function renderCheckoutFlow() {
    qsa('[data-checkout-step]').forEach((section) => {
        section.classList.toggle('hidden', Number(section.dataset.checkoutStep) !== state.checkoutStep);
    });

    qsa('[data-checkout-step-label]').forEach((label) => {
        label.classList.toggle('checkout-step-active', Number(label.dataset.checkoutStepLabel) === state.checkoutStep);
    });

    const checkoutEnabled = !!state.session.user && (state.cart.items?.length || 0) > 0;
    const nextButton = qs('#shopCheckoutNext');
    const submitButton = qs('#shopCheckoutSubmit');

    if (nextButton) {
        nextButton.disabled = !checkoutEnabled;
    }

    if (submitButton) {
        submitButton.disabled = !checkoutEnabled;
    }
}

function setCheckoutStep(step) {
    state.checkoutStep = step === 2 ? 2 : 1;
    renderCheckoutFlow();

    if (state.checkoutStep === 2) {
        qs('#checkoutRecipient')?.focus();
    }
}

function renderOrders() {
    const list = qs('#shopOrdersList');
    if (!state.session.user) {
        list.innerHTML = '<div class="empty-state">Log in to view your orders.</div>';
        return;
    }

    if (!state.orders.length) {
        list.innerHTML = '<div class="empty-state">No orders yet.</div>';
        return;
    }

    list.innerHTML = state.orders.map((order) => `
        <div class="list-item">
            <div class="meta-line">
                <strong>${escapeHtml(order.order_number)}</strong>
                <span class="pill">${escapeHtml(order.order_status)}</span>
            </div>
            <div class="meta-line">
                <span class="muted">Payment: ${escapeHtml(order.payment_status)}</span>
                <span class="muted">Shipment: ${escapeHtml(order.shipment_status)}</span>
            </div>
            <div class="muted">${escapeHtml(order.shipping_recipient_name)}, ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_country)}</div>
            <div class="list" style="margin-top:10px;">
                ${order.items.map((item) => `
                    <div class="list-item">
                        <div class="meta-line">
                            <span>${escapeHtml(item.product_name_snapshot)}${itemDetailSuffix(item.variant_name_snapshot)}</span>
                            <strong>${formatMoney(item.line_total)}</strong>
                        </div>
                        <div class="muted">${item.quantity} x ${formatMoney(item.unit_price)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderProfile() {
    const profileForm = qs('#shopProfileForm');
    const meta = qs('#shopProfileMeta');
    const user = state.session.user;
    if (!profileForm || !meta) {
        return;
    }

    if (!user) {
        profileForm.classList.add('hidden');
        meta.innerHTML = '<div class="empty-state">Log in to manage your profile.</div>';
        return;
    }

    profileForm.classList.remove('hidden');

    const fields = {
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        shipping_recipient_name: user.shipping_recipient_name || '',
        shipping_phone: user.shipping_phone || '',
        shipping_address_line_1: user.shipping_address_line_1 || '',
        shipping_address_line_2: user.shipping_address_line_2 || '',
        shipping_city: user.shipping_city || '',
        shipping_state_region: user.shipping_state_region || '',
        shipping_postal_code: user.shipping_postal_code || '',
        shipping_country: user.shipping_country || '',
    };

    Object.entries(fields).forEach(([name, value]) => {
        const input = qs(`[name="${name}"]`, profileForm);
        if (input) {
            input.value = String(value);
        }
    });

    meta.innerHTML = `
        <div class="list-item"><strong>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong></div>
        <div class="list-item">Email: ${escapeHtml(user.email)}</div>
        <div class="list-item">Phone: ${escapeHtml(user.phone || 'Not set')}</div>
        <div class="list-item">Role: ${escapeHtml(user.role)}</div>
        <div class="list-item">Must change password: ${user.must_change_password ? 'Yes' : 'No'}</div>
    `;

    prefillCheckoutFromProfile();
}

function switchView(view) {
    if (isAdminPreviewMode() && view !== 'shop') {
        showToast('Customer view is browse-only while signed in as admin.');
        view = 'shop';
    }

    if ((view === 'orders' || view === 'profile') && !state.session.user) {
        openAuthModal('login');
        return;
    }

    state.view = view;
    qsa('[data-view]').forEach((section) => {
        section.classList.toggle('hidden', section.dataset.view !== view);
    });
}

async function handleProductGridClick(event) {
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
        await addProductToCart(Number(addButton.dataset.addToCart || 0), addButton);
        return;
    }

    const openButton = event.target.closest('[data-open-product]');
    if (!openButton) {
        return;
    }

    openProductModal(Number(openButton.dataset.openProduct));
}

async function addProductToCart(variantId, button, quantity = 1) {
    if (isAdminPreviewMode()) {
        showToast('Customer view is browse-only while signed in as admin.');
        return;
    }

    if (!state.session.user) {
        openAuthModal('login');
        return;
    }

    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    const idleLabel = button?.textContent || 'Add to Cart';

    try {
        setButtonLoading(button, true, 'Adding...');
        await apiPost('cart.add', {
            product_variant_id: variantId,
            quantity: normalizedQuantity,
        });
        await Promise.all([loadCart(), loadProducts()]);
        closeModal();
        showToast('Added to cart.');
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(button, false, idleLabel);
    }
}

async function handleCartClick(event) {
    const productButton = event.target.closest('[data-open-cart-product]');
    if (productButton) {
        await openProductModal(Number(productButton.dataset.openCartProduct || 0));
        return;
    }

    const decreaseButton = event.target.closest('[data-cart-decrease]');
    if (decreaseButton) {
        const cartItemId = Number(decreaseButton.dataset.cartDecrease || 0);
        const item = state.cart.items.find((cartItem) => cartItem.id === cartItemId);
        if (!item || item.quantity <= 1) {
            return;
        }

        await updateCartItemQuantity(cartItemId, item.quantity - 1);
        return;
    }

    const increaseButton = event.target.closest('[data-cart-increase]');
    if (increaseButton) {
        const cartItemId = Number(increaseButton.dataset.cartIncrease || 0);
        const item = state.cart.items.find((cartItem) => cartItem.id === cartItemId);
        if (!item || item.quantity >= item.stock_quantity) {
            return;
        }

        await updateCartItemQuantity(cartItemId, item.quantity + 1);
        return;
    }

    const removeButton = event.target.closest('[data-remove-cart-item]');
    if (!removeButton) {
        return;
    }

    try {
        await apiPost('cart.remove', {
            cart_item_id: Number(removeButton.dataset.removeCartItem),
        });
        await loadCart();
        showToast('Cart item removed.');
    } catch (error) {
        showToast(error.message);
    }
}

async function updateCartItemQuantity(cartItemId, quantity) {
    try {
        await apiPost('cart.update', {
            cart_item_id: cartItemId,
            quantity,
        });
        await loadCart();
    } catch (error) {
        showToast(error.message);
    }
}

async function handleCheckout(event) {
    event.preventDefault();
    if (isAdminPreviewMode()) {
        showToast('Customer view is browse-only while signed in as admin.');
        return;
    }

    if (!state.session.user) {
        openAuthModal('login');
        return;
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
        setButtonLoading(button, true, 'Placing...');
        await apiPost('orders.checkout', payload);
        form.reset();
        state.checkoutStep = 1;
        await Promise.all([loadCart(), loadOrders(), loadProducts()]);
        setCartOpen(false);
        switchView('orders');
        showToast('Order placed and stock updated.');
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

function handleCheckoutNext() {
    if (isAdminPreviewMode()) {
        showToast('Customer view is browse-only while signed in as admin.');
        return;
    }

    if (!state.session.user) {
        openAuthModal('login');
        return;
    }

    if (!state.cart.items.length) {
        showToast('Your cart is empty.');
        return;
    }

    setCheckoutStep(2);
}

async function handlePasswordChange(event) {
    event.preventDefault();
    if (isAdminPreviewMode()) {
        showToast('Customer view is browse-only while signed in as admin.');
        return;
    }

    if (!state.session.user) {
        openAuthModal('login');
        return;
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
        setButtonLoading(button, true);
        await apiPost('auth.change_password', payload);
        form.reset();
        await refreshSession();
        closeModal();
        showToast('Password changed successfully.');
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(button, false, 'Change Password');
    }
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    if (isAdminPreviewMode()) {
        showToast('Customer view is browse-only while signed in as admin.');
        return;
    }

    if (!state.session.user) {
        openAuthModal('login');
        return;
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
        setButtonLoading(button, true, 'Saving...');
        await apiPost('auth.update_profile', payload);
        await refreshSession();
        prefillCheckoutFromProfile(true);
        showToast('Profile updated successfully.');
    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(button, false, 'Save Profile');
    }
}

function prefillCheckoutFromProfile(force = false) {
    const user = state.session.user;
    if (!user) {
        return;
    }

    const defaultRecipient = String(user.shipping_recipient_name || '').trim() || `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim();
    const values = {
        checkoutRecipient: defaultRecipient,
        checkoutPhone: user.shipping_phone || user.phone || '',
        checkoutLine1: user.shipping_address_line_1 || '',
        checkoutLine2: user.shipping_address_line_2 || '',
        checkoutCity: user.shipping_city || '',
        checkoutRegion: user.shipping_state_region || '',
        checkoutPostal: user.shipping_postal_code || '',
        checkoutCountry: user.shipping_country || '',
    };

    Object.entries(values).forEach(([id, value]) => {
        const input = qs(`#${id}`);
        if (!input) {
            return;
        }

        if (force || String(input.value || '').trim() === '') {
            input.value = String(value || '');
        }
    });
}

function authModalTemplate(mode) {
    return modalShell('Account Access', `
        <div class="auth-switcher" id="authSwitcher">${authSwitcher(mode)}</div>
        <div id="authModalBody" class="auth-modal-body" data-auth-current="${mode}">${authFormBody(mode)}</div>
    `, 'modal-compact auth-modal');
}

function authSwitcher(mode) {
    return `
        <button class="${mode === 'login' ? 'button' : 'ghost-button'}" type="button" data-auth-mode="login" aria-pressed="${mode === 'login'}">Login</button>
        <button class="${mode === 'register' ? 'button' : 'ghost-button'}" type="button" data-auth-mode="register" aria-pressed="${mode === 'register'}">Customer Register</button>
    `;
}

function authFormBody(mode) {
    if (mode === 'register') {
        return `
            <form id="customerRegisterForm" class="form-grid single auth-form">
                <div class="field"><label>First Name</label><input name="first_name" required></div>
                <div class="field"><label>Last Name</label><input name="last_name" required></div>
                <div class="field"><label>Email</label><input name="email" type="email" required></div>
                <div class="field"><label>Phone</label><input name="phone"></div>
                <div class="field"><label>Password</label><input name="password" type="password" required></div>
                <button class="button" type="submit">Create Customer Account</button>
            </form>
        `;
    }

    return `
        <form id="loginForm" class="form-grid single auth-form">
            <div class="field"><label>Email</label><input name="email" type="email" required></div>
            <div class="field"><label>Password</label><input name="password" type="password" required></div>
            <button class="button" type="submit">Login</button>
        </form>
    `;
}

function bindAuthFormHandlers(modal) {
    qs('#loginForm', modal)?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        try {
            setButtonLoading(button, true);
            const response = await apiPost('auth.login', Object.fromEntries(new FormData(form).entries()));
            if (response.user?.role === 'admin') {
                window.location.href = ADMIN_PANEL_URL;
                return;
            }
            closeModal();
            await refreshAll();
            showToast('Logged in successfully.');
        } catch (error) {
            showToast(error.message);
        } finally {
            setButtonLoading(button, false, 'Login');
        }
    });

    qs('#customerRegisterForm', modal)?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        try {
            setButtonLoading(button, true);
            await apiPost('auth.register_customer', Object.fromEntries(new FormData(form).entries()));
            closeModal();
            await refreshAll();
            showToast('Customer account created.');
        } catch (error) {
            showToast(error.message);
        } finally {
            setButtonLoading(button, false, 'Create Customer Account');
        }
    });
}

async function switchAuthMode(modal, nextMode) {
    const switcher = qs('#authSwitcher', modal);
    const body = qs('#authModalBody', modal);
    if (!switcher || !body || body.dataset.authCurrent === nextMode || body.dataset.animating === 'true') {
        return;
    }

    body.dataset.animating = 'true';
    switcher.innerHTML = authSwitcher(nextMode);
    body.classList.remove('auth-flip-in');
    body.classList.add('auth-flip-out');

    await new Promise((resolve) => window.setTimeout(resolve, 180));
    if (!body.isConnected) {
        return;
    }

    body.innerHTML = authFormBody(nextMode);
    body.dataset.authCurrent = nextMode;
    enhancePasswordFields(body);
    bindAuthFormHandlers(modal);
    body.classList.remove('auth-flip-out');
    body.classList.add('auth-flip-in');
    qs('input', body)?.focus();

    await new Promise((resolve) => window.setTimeout(resolve, 220));
    if (!body.isConnected) {
        return;
    }

    body.classList.remove('auth-flip-in');
    delete body.dataset.animating;
}

function openAuthModal(mode) {
    const modal = mountModal(authModalTemplate(mode));
    if (!modal) {
        return;
    }

    modal.addEventListener('click', (event) => {
        const button = event.target.closest('[data-auth-mode]');
        if (!button) {
            return;
        }
        switchAuthMode(modal, button.dataset.authMode);
    });

    bindAuthFormHandlers(modal);
}

function activeProductVariants(product) {
    return (product?.variants || []).filter((item) => item?.is_active !== false);
}

function productPrimaryItem(product) {
    const items = activeProductVariants(product);
    return items.find((item) => Number(item?.stock_quantity || 0) > 0) || items[0] || null;
}

function productDetailLabel(product) {
    const variants = activeProductVariants(product);
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

function variantDetailLabel(variant) {
    const parts = [variant?.size_label, variant?.color_label].filter((value) => String(value || '').trim() !== '');
    return parts.length ? parts.join(' / ') : 'Standard';
}

function itemDetailSuffix(value) {
    const text = String(value || '').trim();
    if (!text || text.toLowerCase() === 'default') {
        return '';
    }
    return ` (${escapeHtml(text)})`;
}

function productModalTemplate(product) {
    const item = productPrimaryItem(product);
    const variants = activeProductVariants(product);
    const stockLeft = Number(item?.stock_quantity || 0);
    const initialQuantity = stockLeft > 0 ? 1 : 0;
    return modalShell(product.product_name, `
        <div class="product-quick-view">
            <div class="product-image product-quick-image">
                <img src="${escapeHtml(resolveProductImagePath(product.main_image_path))}" alt="${escapeHtml(product.product_name)}" onerror="this.onerror=null;this.src='${escapeHtml(PRODUCT_IMAGE_FALLBACK)}';">
            </div>
            <div class="product-quick-meta">
                <div class="meta-line">
                    <span class="status-tag ${statusClass(product.stock_status)}">${escapeHtml(product.stock_status.replaceAll('_', ' '))}</span>
                    <span class="price" data-quick-price>${formatMoney(item?.price ?? product.base_price)}</span>
                </div>
                <div class="product-card-details">
                    <span class="pill" data-quick-detail>${escapeHtml(variantDetailLabel(item))}</span>
                    <span class="pill" data-quick-stock>${stockLeft} left</span>
                </div>
                ${variants.length > 1 ? `
                    <div class="product-quick-variant-row">
                        <span class="muted">Color</span>
                        <div class="product-quick-variant-options">
                            ${variants.map((variant) => `
                                <button class="ghost-button product-quick-variant-button ${Number(variant.id) === Number(item?.id || 0) ? 'is-active' : ''}" type="button" data-quick-variant="${Number(variant.id || 0)}" ${Number(variant.stock_quantity || 0) <= 0 ? 'disabled' : ''}>
                                    ${escapeHtml(variant.color_label || variantDetailLabel(variant))}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <p class="muted product-quick-copy">${escapeHtml(product.description || product.short_description || 'No description available.')}</p>
                <div class="product-quick-purchase">
                    <div class="product-quick-quantity-row">
                        <span class="muted">Quantity</span>
                        <div class="cart-item-quantity product-quick-quantity-control">
                            <button class="ghost-button cart-qty-button" type="button" data-quick-qty-decrease ${initialQuantity <= 1 ? 'disabled' : ''}>-</button>
                            <span class="cart-qty-value" data-quick-qty-value>${initialQuantity}</span>
                            <button class="ghost-button cart-qty-button" type="button" data-quick-qty-increase ${initialQuantity >= stockLeft ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                    <button class="button product-quick-add" type="button" data-modal-add-product="${item?.id || 0}" ${!item || stockLeft <= 0 ? 'disabled' : ''}>
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    `, 'modal-compact product-quick-modal');
}

function resolveProductImagePath(path) {
    const fallback = PRODUCT_IMAGE_FALLBACK;
    const raw = String(path || '').trim();
    if (!raw) {
        return fallback;
    }

    if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:')) {
        return raw;
    }

    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (APP_ROOT_PREFIX) {
        return `${APP_ROOT_PREFIX}/${normalized}`;
    }

    try {
        return new URL(normalized, window.location.href).toString();
    } catch (error) {
        return normalized;
    }
}

async function openProductModal(productId) {
    let product = state.products.find((item) => Number(item.id) === Number(productId));
    if (!product && productId > 0) {
        product = (await apiGet('products.get', { id: productId })).product;
    }

    if (!product) {
        showToast('Product not found.');
        return;
    }

    const modal = mountModal(productModalTemplate(product));
    if (!modal) {
        return;
    }

    const variants = activeProductVariants(product);
    let selectedVariant = productPrimaryItem(product);
    let quantity = Number(selectedVariant?.stock_quantity || 0) > 0 ? 1 : 0;
    const quantityValue = qs('[data-quick-qty-value]', modal);
    const decreaseButton = qs('[data-quick-qty-decrease]', modal);
    const increaseButton = qs('[data-quick-qty-increase]', modal);
    const addButton = qs('[data-modal-add-product]', modal);
    const detailPill = qs('[data-quick-detail]', modal);
    const stockPill = qs('[data-quick-stock]', modal);
    const priceLabel = qs('[data-quick-price]', modal);
    const variantButtons = qsa('[data-quick-variant]', modal);

    const syncQuickQuantity = () => {
        const stockLeft = Number(selectedVariant?.stock_quantity || 0);

        if (quantityValue) {
            quantityValue.textContent = String(quantity);
        }

        if (decreaseButton) {
            decreaseButton.disabled = quantity <= 1;
        }

        if (increaseButton) {
            increaseButton.disabled = quantity >= stockLeft || stockLeft <= 0;
        }

        if (addButton) {
            addButton.dataset.modalAddProduct = String(selectedVariant?.id || 0);
            addButton.disabled = !selectedVariant || stockLeft <= 0 || quantity <= 0;
            addButton.textContent = quantity > 1 ? `Add ${quantity} to Cart` : 'Add to Cart';
        }
    };

    const syncQuickVariant = () => {
        const stockLeft = Number(selectedVariant?.stock_quantity || 0);

        if (detailPill) {
            detailPill.textContent = variantDetailLabel(selectedVariant);
        }

        if (stockPill) {
            stockPill.textContent = `${stockLeft} left`;
        }

        if (priceLabel) {
            priceLabel.textContent = formatMoney(selectedVariant?.price ?? product.base_price);
        }

        variantButtons.forEach((button) => {
            button.classList.toggle('is-active', Number(button.dataset.quickVariant || 0) === Number(selectedVariant?.id || 0));
        });

        if (quantity > stockLeft) {
            quantity = stockLeft > 0 ? stockLeft : 0;
        }

        if (quantity <= 0 && stockLeft > 0) {
            quantity = 1;
        }

        syncQuickQuantity();
    };

    decreaseButton?.addEventListener('click', () => {
        if (quantity <= 1) {
            return;
        }
        quantity -= 1;
        syncQuickQuantity();
    });

    increaseButton?.addEventListener('click', () => {
        const stockLeft = Number(selectedVariant?.stock_quantity || 0);
        if (quantity >= stockLeft) {
            return;
        }
        quantity += 1;
        syncQuickQuantity();
    });

    variantButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const nextVariant = variants.find((variant) => Number(variant.id) === Number(button.dataset.quickVariant || 0));
            if (!nextVariant) {
                return;
            }

            selectedVariant = nextVariant;
            syncQuickVariant();
        });
    });

    addButton?.addEventListener('click', async (event) => {
        await addProductToCart(Number(event.currentTarget.dataset.modalAddProduct || 0), event.currentTarget, quantity);
    });

    syncQuickVariant();
}

function setCartOpen(isOpen) {
    state.cartOpen = isOpen;
    if (isOpen) {
        state.checkoutStep = 1;
    }
    renderCartPopup();
    renderCheckoutFlow();
}

function maybePromptPasswordChange() {
    if (!state.session.user?.must_change_password || state.session.user?.role === 'admin') {
        return;
    }

    if (qs('[data-force-password-modal]')) {
        return;
    }

    const modal = mountModal(`
        <div class="modal-backdrop" data-modal-backdrop data-force-password-modal>
            <div class="modal">
                <div class="panel-head">
                    <h2 class="panel-title">Password Change Required</h2>
                </div>
                <p class="muted">This account must change password before continuing.</p>
                <form id="forcedPasswordForm" class="form-grid single">
                    <div class="field"><label>Current Password</label><input name="current_password" type="password" required></div>
                    <div class="field"><label>New Password</label><input name="new_password" type="password" required></div>
                    <div class="field"><label>Confirm New Password</label><input name="confirm_password" type="password" required></div>
                    <button class="button" type="submit">Update Password</button>
                </form>
            </div>
        </div>
    `);

    qs('#forcedPasswordForm', modal)?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        try {
            setButtonLoading(button, true);
            await apiPost('auth.change_password', Object.fromEntries(new FormData(form).entries()));
            closeModal();
            await refreshSession();
            renderProfile();
            showToast('Password updated.');
        } catch (error) {
            showToast(error.message);
        } finally {
            setButtonLoading(button, false, 'Update Password');
        }
    });
}

async function logout() {
    try {
        await apiPost('auth.logout');
        setAdminPreviewStorage(false);
        state.view = 'shop';
        setCartOpen(false);
        closeModal();
        await refreshAll();
        showToast('Logged out.');
    } catch (error) {
        showToast(error.message);
    }
}

function isAdminPreviewRequested() {
    const rawValue = String(new URLSearchParams(window.location.search).get(ADMIN_PREVIEW_PARAM) || '').trim().toLowerCase();
    if (rawValue && rawValue !== '0' && rawValue !== 'false' && rawValue !== 'no') {
        return true;
    }

    if (hasAdminPreviewStorage()) {
        return true;
    }

    return isSameOriginAdminReferrer();
}

function hasAdminPreviewStorage() {
    try {
        return sessionStorage.getItem(ADMIN_PREVIEW_STORAGE_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setAdminPreviewStorage(isEnabled) {
    try {
        if (isEnabled) {
            sessionStorage.setItem(ADMIN_PREVIEW_STORAGE_KEY, '1');
            return;
        }
        sessionStorage.removeItem(ADMIN_PREVIEW_STORAGE_KEY);
    } catch (error) {
        // Ignore storage failures and fall back to URL or referrer checks.
    }
}

function isSameOriginAdminReferrer() {
    const referrer = String(document.referrer || '').trim();
    if (!referrer) {
        return false;
    }

    try {
        const referrerUrl = new URL(referrer);
        if (referrerUrl.origin !== window.location.origin) {
            return false;
        }
        return /\/admin(?:\/|$)/i.test(referrerUrl.pathname);
    } catch (error) {
        return false;
    }
}

function isAdminPreviewMode() {
    return !!state.session.admin_viewer;
}

init().catch((error) => {
    showToast(error.message);
});
