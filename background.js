const FEED_URLS_KEY = "feedUrls";
const FEEDS_CACHE_KEY = "feedsCache";
const FETCH_ALARM_NAME = "fetch-feeds-alarm";

// Import the Readability script
try {
  importScripts("./lib/Readability.js");
} catch (e) {
  console.error(e);
}

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async () => {
  console.log("RSS Reader extension installed.");

  // 1. Set up default feeds
  const result = await chrome.storage.sync.get(FEED_URLS_KEY);
  if (!result[FEED_URLS_KEY]) {
    const defaultFeeds = [
      "https://www.theverge.com/rss/index.xml",
      "https://feeds.arstechnica.com/arstechnica/index/",
    ];
    await chrome.storage.sync.set({ [FEED_URLS_KEY]: defaultFeeds });
    console.log("Default feeds set.");
  }

  // 2. Create the alarm for periodic fetching
  await chrome.alarms.create(FETCH_ALARM_NAME, {
    periodInMinutes: 15,
  });
  console.log("Fetch alarm created.");

  // 3. Trigger an initial fetch
  triggerFetch();
});

// --- Alarm Listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FETCH_ALARM_NAME) {
    console.log("Alarm triggered: Fetching feeds...");
    await triggerFetch();
  }
});

// --- Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "triggerFetch") {
    console.log("Fetch triggered by message.");
    triggerFetch();
  } else if (request.action === "fetchArticle") {
    fetchArticleContent(request.url)
      .then((article) => sendResponse({ success: true, article }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Indicates that the response is sent asynchronously
  }
});

// --- Core Fetching Logic ---
async function triggerFetch() {
  const { [FEED_URLS_KEY]: feedUrls } =
    await chrome.storage.sync.get(FEED_URLS_KEY);
  if (!feedUrls || feedUrls.length === 0) {
    console.log("No feed URLs to fetch.");
    await updateBadge();
    return;
  }

  const { [FEEDS_CACHE_KEY]: oldCache } =
    await chrome.storage.local.get(FEEDS_CACHE_KEY);
  const newCache = oldCache || {};

  for (const url of feedUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      const items = parseRSS(text, url);

      // Merge new items with existing ones, avoiding duplicates
      const existingItems = newCache[url]?.items || [];
      const existingItemIds = new Set(existingItems.map((item) => item.id));
      const newItems = items.filter((item) => !existingItemIds.has(item.id));

      newCache[url] = {
        fetchedAt: Date.now(),
        items: [...newItems, ...existingItems].sort(
          (a, b) => b.publishedAt - a.publishedAt,
        ),
        lastError: null,
      };
    } catch (error) {
      console.error(`Failed to fetch or parse feed: ${url}`, error);
      if (newCache[url]) {
        newCache[url].lastError = error.message;
      } else {
        newCache[url] = {
          fetchedAt: Date.now(),
          items: [],
          lastError: error.message,
        };
      }
    }
  }

  await chrome.storage.local.set({ [FEEDS_CACHE_KEY]: newCache });
  console.log("Feeds updated in local storage.");
  await updateBadge();
}

function parseRSS(xmlString, feedUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const items = [];

  const CLICKBAIT_PATTERNS = [
    /충격/g,
    /경악/g,
    /이럴수가/g,
    /결국/g,
    /단독/g,
    /\.\.\.보니/g,
    /\?\!/g,
  ];

  const entries = doc.querySelectorAll("item, entry");

  entries.forEach((entry) => {
    const title = entry.querySelector("title")?.textContent || "";
    const link =
      entry.querySelector("link")?.getAttribute("href") ||
      entry.querySelector("link")?.textContent ||
      "";
    const guid = entry.querySelector("guid")?.textContent || link;
    const pubDate = entry.querySelector("pubDate, published")?.textContent;

    let score = 0;
    for (const pattern of CLICKBAIT_PATTERNS) {
      if (pattern.test(title)) {
        score -= 10;
      }
    }

    items.push({
      id: guid,
      title,
      link,
      publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
      feedUrl,
      read: false,
      score: score, // Add score property
    });
  });

  return items;
}

async function fetchArticleContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const reader = new Readability(doc);
    const article = reader.parse();
    if (!article || !article.content) {
      throw new Error("Failed to parse article content.");
    }
    return { title: article.title, content: article.content };
  } catch (error) {
    console.error("Failed to fetch or parse article:", url, error);
    throw error;
  }
}

// --- Badge Update ---
async function updateBadge() {
  const { [FEEDS_CACHE_KEY]: cache } =
    await chrome.storage.local.get(FEEDS_CACHE_KEY);
  let unreadCount = 0;
  if (cache) {
    for (const url in cache) {
      unreadCount += cache[url].items.filter((item) => !item.read).length;
    }
  }

  await chrome.action.setBadgeText({
    text: unreadCount > 0 ? String(unreadCount) : "",
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
}

// Listen for changes in storage to update the badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes[FEEDS_CACHE_KEY]) {
    updateBadge();
  }
});
