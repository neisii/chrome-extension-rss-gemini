const FEEDS_CACHE_KEY = "feedsCache";

document.addEventListener("DOMContentLoaded", () => {
  const feedContainer = document.getElementById("feed-container");
  const loadingState = document.getElementById("loading-state");
  const emptyState = document.getElementById("empty-state");
  const errorState = document.getElementById("error-state");

  const searchInput = document.getElementById("search-input");
  const sortSelect = document.getElementById("sort-select");
  const unreadOnlyToggle = document.getElementById("unread-only-toggle");

  // Reader View Modal elements
  const readerViewModal = document.getElementById("reader-view-modal");
  const readerTitle = document.getElementById("reader-title");
  const readerContent = document.getElementById("reader-content");
  const closeReaderButton = document.getElementById("close-reader-button");

  let allItems = [];

  // Initial load
  loadAndRenderFeeds();

  // Listen for changes in storage to auto-refresh the popup
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes[FEEDS_CACHE_KEY]) {
      loadAndRenderFeeds();
    }
  });

  // Add event listeners for controls
  searchInput.addEventListener("input", renderItems);
  sortSelect.addEventListener("change", renderItems);
  unreadOnlyToggle.addEventListener("change", renderItems);
  closeReaderButton.addEventListener("click", () => {
    readerViewModal.style.display = "none";
  });

  async function loadAndRenderFeeds() {
    const { [FEEDS_CACHE_KEY]: cache } =
      await chrome.storage.local.get(FEEDS_CACHE_KEY);

    loadingState.style.display = "none";

    if (!cache || Object.keys(cache).length === 0) {
      emptyState.style.display = "block";
      return;
    }

    allItems = Object.values(cache).flatMap((feed) => feed.items || []);

    if (allItems.length === 0) {
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
      renderItems();
    }
  }

  function renderItems() {
    let itemsToRender = [...allItems];

    // 1. Filter by "Unread only"
    if (unreadOnlyToggle.checked) {
      itemsToRender = itemsToRender.filter((item) => !item.read);
    }

    // 2. Filter by search term
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
      itemsToRender = itemsToRender.filter(
        (item) =>
          item.title.toLowerCase().includes(searchTerm) ||
          item.feedUrl.toLowerCase().includes(searchTerm),
      );
    }

    // 3. Sort
    const sortBy = sortSelect.value;
    itemsToRender.sort((a, b) => {
      return sortBy === "newest"
        ? b.publishedAt - a.publishedAt
        : a.publishedAt - b.publishedAt;
    });

    // 4. Render to DOM
    feedContainer.innerHTML = ""; // Clear previous items
    if (itemsToRender.length === 0) {
      feedContainer.innerHTML = "<p>No matching items.</p>";
    }

    itemsToRender.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "feed-item";
      if (item.read) {
        itemElement.classList.add("read");
      }

      const mainContent = document.createElement("div");
      mainContent.className = "main-content";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = item.title;
      title.addEventListener("click", () => {
        markAsRead(item.id);
        chrome.tabs.create({ url: item.link });
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      const feedName = new URL(item.feedUrl).hostname;
      meta.textContent = `${feedName} - ${new Date(item.publishedAt).toLocaleString()}`;

      mainContent.appendChild(title);
      mainContent.appendChild(meta);

      const readerButton = document.createElement("button");
      readerButton.className = "reader-view-button";
      readerButton.textContent = "Read";
      readerButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent title click event
        showReaderView(item.link);
      });

      itemElement.appendChild(mainContent);
      itemElement.appendChild(readerButton);

      feedContainer.appendChild(itemElement);
    });
  }

  function showReaderView(url) {
    readerTitle.textContent = "Loading...";
    readerContent.innerHTML = "";
    readerViewModal.style.display = "flex";

    chrome.runtime.sendMessage({ action: "fetchArticle", url }, (response) => {
      if (response && response.success) {
        const { article } = response;
        readerTitle.textContent = article.title;
        readerContent.innerHTML = article.content;
        // Mark as read after successfully opening reader view
        const item = allItems.find((i) => i.link === url);
        if (item) {
          markAsRead(item.id);
        }
      } else {
        readerTitle.textContent = "Error";
        readerContent.innerHTML = `<p>Failed to load article content. You can try opening the <a href="${url}" target="_blank">original page</a>.</p>`;
        console.error("Reader view error:", response.error);
      }
    });
  }

  async function markAsRead(itemId) {
    const { [FEEDS_CACHE_KEY]: cache } =
      await chrome.storage.local.get(FEEDS_CACHE_KEY);
    if (!cache) return;

    let itemFound = false;
    for (const feedUrl in cache) {
      const item = cache[feedUrl].items.find((i) => i.id === itemId);
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
