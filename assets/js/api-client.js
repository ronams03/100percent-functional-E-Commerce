const API_BASE = globalThis.APP_API_BASE || 'api/index.php';

function buildUrl(action, query = {}) {
    const params = new URLSearchParams({ action });
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, value);
        }
    });
    return `${API_BASE}?${params.toString()}`;
}

async function handleResponse(response) {
    const payload = await response.json().catch(() => ({
        success: false,
        message: 'Invalid server response.',
    }));

    if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Request failed.');
    }

    return payload.data;
}

export async function apiGet(action, query = {}) {
    const response = await fetch(buildUrl(action, query), {
        credentials: 'same-origin',
    });
    return handleResponse(response);
}

export async function apiPost(action, data = {}, options = {}) {
    const fetchOptions = {
        method: 'POST',
        credentials: 'same-origin',
        headers: {},
    };

    if (options.formData instanceof FormData) {
        fetchOptions.body = options.formData;
    } else {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(buildUrl(action), fetchOptions);
    return handleResponse(response);
}

export async function apiDelete(action, data = {}) {
    return apiPost(action, data);
}
