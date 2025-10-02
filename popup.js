const FEEDS_CACHE_KEY = 'feedsCache';

document.addEventListener('DOMContentLoaded', () => {
    const feedContainer = document.getElementById('feed-container');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');

    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const unreadOnlyToggle = document.getElementById('unread-only-toggle');

    let allItems = [];

    // Initial load
    loadAndRenderFeeds();

    // Listen for changes in storage to auto-refresh the popup
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[FEEDS_CACHE_KEY]) {
            loadAndRenderFeeds();
        }
    });

    // Add event listeners for controls
    searchInput.addEventListener('input', renderItems);
    sortSelect.addEventListener('change', renderItems);
    unreadOnlyToggle.addEventListener('change', renderItems);

    async function loadAndRenderFeeds() {
        const { [FEEDS_CACHE_KEY]: cache } = await chrome.storage.local.get(FEEDS_CACHE_KEY);

        loadingState.style.display = 'none';

        if (!cache || Object.keys(cache).length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        allItems = Object.values(cache).flatMap(feed => feed.items || []);

        if (allItems.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            renderItems();
        }
    }

    function renderItems() {
        let itemsToRender = [...allItems];

        // 1. Filter by "Unread only"
        if (unreadOnlyToggle.checked) {
            itemsToRender = itemsToRender.filter(item => !item.read);
        }

        // 2. Filter by search term
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            itemsToRender = itemsToRender.filter(item =>
                item.title.toLowerCase().includes(searchTerm) ||
                item.feedUrl.toLowerCase().includes(searchTerm)
            );
        }

        // 3. Sort
        const sortBy = sortSelect.value;
        itemsToRender.sort((a, b) => {
            return sortBy === 'newest' ? b.publishedAt - a.publishedAt : a.publishedAt - b.publishedAt;
        });

        // 4. Render to DOM
        feedContainer.innerHTML = ''; // Clear previous items
        if (itemsToRender.length === 0) {
            feedContainer.innerHTML = '<p>No matching items.</p>';
        }

        itemsToRender.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'feed-item';
            if (item.read) {
                itemElement.classList.add('read');
            }

            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = item.title;

            const meta = document.createElement('div');
            meta.className = 'meta';
            const feedName = new URL(item.feedUrl).hostname;
            meta.textContent = `${feedName} - ${new Date(item.publishedAt).toLocaleString()}`;

            itemElement.appendChild(title);
            itemElement.appendChild(meta);

            itemElement.addEventListener('click', () => {
                markAsRead(item.id);
                chrome.tabs.create({ url: item.link });
            });

            feedContainer.appendChild(itemElement);
        });
    }

    async function markAsRead(itemId) {
        const { [FEEDS_CACHE_KEY]: cache } = await chrome.storage.local.get(FEEDS_CACHE_KEY);
        if (!cache) return;

        let itemFound = false;
        for (const feedUrl in cache) {
            const item = cache[feedUrl].items.find(i => i.id === itemId);
            if (item) {
                item.read = true;
                itemFound = true;
                break;
            }
        }

        if (itemFound) {
            await chrome.storage.local.set({ [FEEDS_CACHE_KEY]: cache });
            // The UI will update automatically via the storage change listener
        }
    }
});
