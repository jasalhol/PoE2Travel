# Auto Travel (PoE Trade)

Auto-clicks **"Travel to Hideout"** on the top live-search result on the [Path of Exile trade site](https://www.pathofexile.com/trade2), and, if prompted, auto-clicks the follow-up confirmation (**"Teleport anyway?"** / **"In demand"**). Includes a settings UI, optional auto-refresh, and safety guards against double-clicking or runaway loops.

Two versions are included:

| Version | File(s) | Use case |
|---|---|---|
| Userscript | `auto-travel.user.js` | Any browser, via Tampermonkey / Violentmonkey / Greasemonkey |

Both versions share the same click logic and behave identically.

## Features

- Watches the trade results table and auto-clicks **"Travel to Hideout"** on the first result row.
- Auto-clicks the follow-up confirmation button if PoE shows one (e.g. "Teleport anyway?", "In demand").
- Per-row click tracking (stored in `sessionStorage`) so the same row is never clicked twice.
- A click lock ensures the script won't jump to a different row mid-cycle if the first result changes state.
- The lock automatically resets when a genuinely new top result appears.
- A cooldown between clicks avoids spamming the button during fast-updating live search.
- Optional auto-refresh after a click, with a configurable delay and a max-refresh cap to prevent infinite reload loops.

## Installation

### Chrome Extension

1. Open `chrome://extensions` (or the equivalent in your Chromium-based browser).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin the extension and open its popup to configure settings.

### Userscript

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/), or Greasemonkey.
2. Open `auto-travel.user.js` in your browser (or drag it into the extensions page) and confirm the install prompt.
3. On a PoE trade page, click the floating **"Auto Travel"** button (bottom-right corner) to open the settings panel.

## Settings

| Setting | Description |
|---|---|
| **Enable Auto Click** | Master on/off switch. |
| **Delay before click (ms)** | Wait time before clicking after a DOM change is detected. Lower = faster, but too low can click before the button finishes rendering. |
| **Refresh after click** | Reload the page automatically after a successful click. |
| **Refresh delay (ms)** | Time to let the click(s) go through before reloading. |
| **Max refreshes** | Caps how many times the page will auto-refresh in a session (`0` = no limit). Prevents infinite refresh loops. |

Settings are persisted per-browser:
- Extension version uses `chrome.storage.sync`.
- Userscript version uses `GM_getValue` / `GM_setValue`.

## How it works

1. A `MutationObserver` watches the `.resultset` container on the trade page for added rows.
2. On change, it locates the **first** result row and inspects its direct-action button.
3. If the button label is exactly `"Travel to Hideout"`, it's clicked.
4. The script then polls (up to 2.5s) for a confirmation button (`"Teleport anyway?"` / `"In demand"`) on the same row and clicks it if it appears.
5. Each row is identified by a stable key (its `data-id`, or a fallback of profile link + character name + price) so already-clicked rows are skipped and the script won't act on the wrong row.

## Disclaimer

This is a browser automation tool for personal convenience on the official PoE trade website. Use at your own discretion and in accordance with the game's terms of service.
