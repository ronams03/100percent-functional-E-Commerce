const HISTORY_KEY_PREFIX = 'search_assist_history:';
const DEFAULT_HISTORY_LIMIT = 6;

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function historyKey(contextKey) {
    return `${HISTORY_KEY_PREFIX}${contextKey}`;
}

export function readSearchHistory(contextKey, limit = DEFAULT_HISTORY_LIMIT) {
    try {
        const parsed = JSON.parse(localStorage.getItem(historyKey(contextKey)) || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, limit);
    } catch (error) {
        return [];
    }
}

export function rememberSearchHistory(contextKey, value, limit = DEFAULT_HISTORY_LIMIT) {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue === '') {
        return [];
    }

    const next = [
        normalizedValue,
        ...readSearchHistory(contextKey, limit * 2).filter((item) => normalizeText(item) !== normalizeText(normalizedValue)),
    ].slice(0, limit);

    try {
        localStorage.setItem(historyKey(contextKey), JSON.stringify(next));
    } catch (error) {
        return next;
    }
    return next;
}

function scoreCandidate(query, candidate, index) {
    if (!query) {
        return Number(candidate.priority || 0) + (100 - index) / 1000;
    }

    const normalizedQuery = normalizeText(query);
    const haystacks = [
        candidate.value,
        candidate.label,
        candidate.hint,
        ...(Array.isArray(candidate.keywords) ? candidate.keywords : []),
    ]
        .map(normalizeText)
        .filter(Boolean);

    if (!haystacks.length) {
        return Number.NEGATIVE_INFINITY;
    }

    const combined = haystacks.join(' ');
    let best = Number.NEGATIVE_INFINITY;

    haystacks.forEach((haystack) => {
        if (haystack === normalizedQuery) {
            best = Math.max(best, 120);
            return;
        }
        if (haystack.startsWith(normalizedQuery)) {
            best = Math.max(best, 100);
            return;
        }
        if (haystack.includes(` ${normalizedQuery}`)) {
            best = Math.max(best, 84);
            return;
        }
        if (haystack.includes(normalizedQuery)) {
            best = Math.max(best, 70);
        }
    });

    const words = normalizedQuery.split(' ').filter(Boolean);
    if (words.length > 1 && words.every((word) => combined.includes(word))) {
        best = Math.max(best, 64);
    }

    if (!Number.isFinite(best)) {
        return best;
    }

    return best + Number(candidate.priority || 0) + (100 - index) / 1000;
}

export function rankSearchCandidates(query, candidates, limit = 6) {
    const seen = new Set();

    return (Array.isArray(candidates) ? candidates : [])
        .map((candidate, index) => ({
            ...candidate,
            value: String(candidate?.value || '').trim(),
            label: String(candidate?.label || candidate?.value || '').trim(),
            hint: String(candidate?.hint || '').trim(),
            score: scoreCandidate(query, candidate || {}, index),
        }))
        .filter((candidate) => candidate.value !== '' && candidate.label !== '' && Number.isFinite(candidate.score))
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return left.label.localeCompare(right.label);
        })
        .filter((candidate) => {
            const key = normalizeText(candidate.value);
            if (!key || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .slice(0, limit)
        .map(({ score, ...candidate }) => candidate);
}

export function buildHistorySuggestions(contextKey, query, limit = 4) {
    const normalizedQuery = normalizeText(query);

    return readSearchHistory(contextKey, limit * 2)
        .filter((item) => normalizedQuery === '' || normalizeText(item).includes(normalizedQuery))
        .slice(0, limit)
        .map((value) => ({
            value,
            label: value,
            hint: 'Recent search',
            kind: 'history',
            group: 'Recent Searches',
            priority: 500,
        }));
}

export function attachSearchAssist({
    input,
    contextKey,
    buildSuggestions,
    onSearch,
    historyLimit = DEFAULT_HISTORY_LIMIT,
}) {
    if (!(input instanceof HTMLInputElement) || typeof buildSuggestions !== 'function' || typeof onSearch !== 'function') {
        return () => {};
    }

    const popover = document.createElement('div');
    popover.className = 'search-assist-popover hidden';
    document.body.appendChild(popover);

    let suggestions = [];
    let activeIndex = -1;
    let isOpen = false;

    function closePopover() {
        isOpen = false;
        activeIndex = -1;
        popover.classList.add('hidden');
        popover.innerHTML = '';
    }

    function positionPopover() {
        if (!isOpen) {
            return;
        }

        const rect = input.getBoundingClientRect();
        popover.style.left = `${Math.round(rect.left)}px`;
        popover.style.top = `${Math.round(rect.bottom + 6)}px`;
        popover.style.width = `${Math.round(rect.width)}px`;
    }

    function renderPopover() {
        popover.innerHTML = '';

        if (!suggestions.length) {
            closePopover();
            return;
        }

        let currentGroup = '';
        suggestions.forEach((suggestion, index) => {
            const group = String(suggestion.group || '').trim();
            if (group && group !== currentGroup) {
                currentGroup = group;
                const heading = document.createElement('div');
                heading.className = 'search-assist-group';
                heading.textContent = group;
                popover.appendChild(heading);
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = `search-assist-option${index === activeIndex ? ' is-active' : ''}`;
            button.dataset.searchAssistIndex = String(index);

            const copy = document.createElement('span');
            copy.className = 'search-assist-copy';

            const label = document.createElement('span');
            label.className = 'search-assist-label';
            label.textContent = suggestion.label;
            copy.appendChild(label);

            if (suggestion.hint) {
                const hint = document.createElement('span');
                hint.className = 'search-assist-hint';
                hint.textContent = suggestion.hint;
                copy.appendChild(hint);
            }

            button.appendChild(copy);

            if (suggestion.kind === 'history') {
                const badge = document.createElement('span');
                badge.className = 'search-assist-badge';
                badge.textContent = 'Recent';
                button.appendChild(badge);
            }

            popover.appendChild(button);
        });

        isOpen = true;
        popover.classList.remove('hidden');
        positionPopover();
    }

    function refreshSuggestions() {
        suggestions = buildSuggestions({
            query: input.value.trim(),
            history: readSearchHistory(contextKey, historyLimit),
        }) || [];
        activeIndex = suggestions.length ? Math.min(activeIndex, suggestions.length - 1) : -1;
        renderPopover();
    }

    async function runSearch(value, selectedSuggestion = null) {
        const searchValue = String(value || '').trim();
        rememberSearchHistory(contextKey, searchValue, historyLimit);
        input.value = searchValue;
        closePopover();
        await onSearch(searchValue, selectedSuggestion);
    }

    async function handleSuggestionSelect(index) {
        const suggestion = suggestions[index];
        if (!suggestion) {
            return;
        }

        await runSearch(suggestion.value, suggestion);
    }

    function handleDocumentPointerDown(event) {
        const target = event.target;
        if (target instanceof Node && (popover.contains(target) || input.contains(target))) {
            return;
        }
        closePopover();
    }

    async function handleKeyDown(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!suggestions.length) {
                refreshSuggestions();
                return;
            }
            activeIndex = activeIndex < suggestions.length - 1 ? activeIndex + 1 : 0;
            renderPopover();
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!suggestions.length) {
                refreshSuggestions();
                return;
            }
            activeIndex = activeIndex > 0 ? activeIndex - 1 : suggestions.length - 1;
            renderPopover();
            return;
        }

        if (event.key === 'Escape') {
            closePopover();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (isOpen && activeIndex >= 0) {
                await handleSuggestionSelect(activeIndex);
                return;
            }

            await runSearch(input.value);
        }
    }

    function handleFocus() {
        refreshSuggestions();
    }

    function handleInput() {
        refreshSuggestions();
    }

    async function handlePopoverPointerDown(event) {
        const button = event.target.closest('[data-search-assist-index]');
        if (!(button instanceof HTMLElement)) {
            return;
        }

        event.preventDefault();
        await handleSuggestionSelect(Number(button.dataset.searchAssistIndex || -1));
    }

    input.addEventListener('focus', handleFocus);
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('scroll', positionPopover, true);
    window.addEventListener('resize', positionPopover);
    popover.addEventListener('pointerdown', handlePopoverPointerDown);

    return () => {
        input.removeEventListener('focus', handleFocus);
        input.removeEventListener('input', handleInput);
        input.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
        document.removeEventListener('scroll', positionPopover, true);
        window.removeEventListener('resize', positionPopover);
        popover.removeEventListener('pointerdown', handlePopoverPointerDown);
        popover.remove();
    };
}
