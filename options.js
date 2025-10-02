const FEED_URLS_KEY = 'feedUrls';
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

document.addEventListener('DOMContentLoaded', () => {
    const addFeedButton = document.getElementById('add-feed-button');
    const feedUrlInput = document.getElementById('feed-url-input');
    const feedList = document.getElementById('feed-list');
    const opmlImportInput = document.getElementById('opml-import-input');
    const exportOpmlButton = document.getElementById('export-opml-button');
    const notificationsToggle = document.getElementById('notifications-enabled-toggle');

    // Load initial data
    loadFeeds();
    loadSettings();

    // --- Event Listeners ---
    addFeedButton.addEventListener('click', addFeed);
    feedUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addFeed();
    });
    opmlImportInput.addEventListener('change', importOpml);
    exportOpmlButton.addEventListener('click', exportOpml);
    notificationsToggle.addEventListener('change', saveSettings);

    // --- Feed Management ---
    async function loadFeeds() {
        const { [FEED_URLS_KEY]: urls } = await chrome.storage.sync.get(FEED_URLS_KEY);
        feedList.innerHTML = '';
        if (urls && urls.length > 0) {
            urls.forEach(url => {
                const li = document.createElement('li');
                li.textContent = url;
                const removeButton = document.createElement('button');
                removeButton.textContent = 'Remove';
                removeButton.className = 'remove-feed-button';
                removeButton.addEventListener('click', () => removeFeed(url));
                li.appendChild(removeButton);
                feedList.appendChild(li);
            });
        }
    }

    async function addFeed() {
        const url = feedUrlInput.value.trim();
        if (!url) return;

        try {
            new URL(url); // Basic validation
        } catch (e) {
            alert('Invalid URL format.');
            return;
        }

        const { [FEED_URLS_KEY]: urls = [] } = await chrome.storage.sync.get(FEED_URLS_KEY);
        if (urls.includes(url)) {
            alert('This feed has already been added.');
            return;
        }

        const newUrls = [...urls, url];
        await chrome.storage.sync.set({ [FEED_URLS_KEY]: newUrls });
        feedUrlInput.value = '';
        loadFeeds();
        // Trigger a fetch in the background
        chrome.runtime.sendMessage({ action: 'triggerFetch' });
    }

    async function removeFeed(urlToRemove) {
        const { [FEED_URLS_KEY]: urls } = await chrome.storage.sync.get(FEED_URLS_KEY);
        const newUrls = urls.filter(url => url !== urlToRemove);
        await chrome.storage.sync.set({ [FEED_URLS_KEY]: newUrls });
        loadFeeds();
    }

    // --- OPML ---
    function importOpml(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, 'application/xml');
            const outlines = doc.querySelectorAll('outline[type="rss"]');
            const newUrls = Array.from(outlines).map(o => o.getAttribute('xmlUrl')).filter(Boolean);

            if (newUrls.length > 0) {
                const { [FEED_URLS_KEY]: existingUrls = [] } = await chrome.storage.sync.get(FEED_URLS_KEY);
                const mergedUrls = [...new Set([...existingUrls, ...newUrls])];
                await chrome.storage.sync.set({ [FEED_URLS_KEY]: mergedUrls });
                loadFeeds();
                chrome.runtime.sendMessage({ action: 'triggerFetch' });
                alert(`${newUrls.length} feeds imported.`);
            }
        };
        reader.readAsText(file);
    }

    async function exportOpml() {
        const { [FEED_URLS_KEY]: urls } = await chrome.storage.sync.get(FEED_URLS_KEY);
        if (!urls || urls.length === 0) {
            alert('No feeds to export.');
            return;
        }

        let opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <body>\n`;
        urls.forEach(url => {
            opml += `    <outline type="rss" xmlUrl="${escapeXml(url)}" />\n`;
        });
        opml += `  </body>\n</opml>`;

        const blob = new Blob([opml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rss_feeds.opml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    // --- Settings ---
    async function loadSettings() {
        const { [NOTIFICATIONS_ENABLED_KEY]: enabled } = await chrome.storage.sync.get(NOTIFICATIONS_ENABLED_KEY);
        notificationsToggle.checked = !!enabled;
    }

    async function saveSettings() {
        await chrome.storage.sync.set({ [NOTIFICATIONS_ENABLED_KEY]: notificationsToggle.checked });
        alert('Settings saved.');
    }
});
