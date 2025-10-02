# Project Context: Personalized RSS Reader Chrome Extension

## 1. Core Objective

- A minimalist, ad-free, and personalized RSS reader built as a Chrome extension.
- Key values: Mitigating filter bubbles, minimizing ads/clickbait, and enabling a clean "inbox zero" style of feed management.

## 2. Architecture & Tech Stack

- **Platform**: Chrome Extension **Manifest V3**
- **Language**: **JavaScript (ES6+)**. (Future migration to TypeScript is planned).
- **UI**: Plain HTML, CSS, and JavaScript. No frameworks are used currently.
    - `popup.html` / `popup.js`: Main view for listing articles.
    - `options.html` / `options.js`: Page for managing feed subscriptions.
- **Background**: Service Worker (`background.js`).
    - It handles periodic fetching (every 15 mins using `chrome.alarms`), parsing, and caching of feeds.
- **Storage**:
    - `chrome.storage.sync`: Stores the user's list of feed URLs (`feedUrls`). This data is synced across devices.
    - `chrome.storage.local`: Stores the cached feed items (`feedsCache`) to avoid excessive network requests.
- **RSS Parsing**: Use the native `fetch` API and `DOMParser` for parsing XML feeds.

## 3. Data Models

```javascript
// List of subscribed feed URLs (stored in chrome.storage.sync)
type FeedUrls = string[];

// Cache of fetched feeds (stored in chrome.storage.local)
type FeedsCache = {
  [feedUrl: string]: {
    fetchedAt: number;      // Timestamp of the last fetch
    lastError?: string;     // Records the last fetch error, if any
    items: FeedItem[];      // Array of parsed feed items
  };
};

// Standardized format for a single feed item
type FeedItem = {
  id: string;           // Unique identifier (guid || link || hash)
  title: string;
  link: string;
  publishedAt?: number; // Publication date (epoch time)
  feedUrl: string;      // The source feed URL
  read?: boolean;       // Read status, defaults to false
  tags?: string[];      // Optional user-defined tags
};
```

## 4. Key Conventions & Rules

- **Commit Frequently**: After each significant change or feature implementation, create a `git commit`. Commits should be atomic, feature-oriented, and represent a single logical change.
- **Stick to Manifest V3**: All changes must be compliant with MV3 requirements (e.g., using Service Workers instead of persistent background pages).
- **Plain JS First**: Do not introduce libraries or frameworks (like React, dayjs, etc.) without explicit instruction. The current stack is plain JS.
- **Follow Data Models**: When fetching or manipulating feed data, adhere to the `FeedsCache` and `FeedItem` structures defined above.
- **Separation of Concerns**:
    - `background.js` is for data fetching and storage management.
    - `popup.js` is for rendering data from storage.
    - `options.js` is for managing the `feedUrls` in `chrome.storage.sync`.
- **Permissions**: The extension uses `storage`, `alarms`, and broad host permissions (`<all_urls>`) for fetching feeds.

## 5. Git Repository

- **URL**: `https://github.com/neisii/chrome-extension-rss-gemini.git`
