// ==UserScript==
// @name         Auto Travel (PoE Trade)
// @namespace    jasalhol
// @version      1.7
// @description  Auto-clicks 'Travel to Hideout' and, if prompted, clicks the follow-up confirmation ('Teleport anyway?'). Includes controls, optional refresh, and safety guards.
// @match        *://*.pathofexile.com/*trade*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_addStyle
// ==/UserScript==

(function() {
  'use strict';

  const SETTINGS_KEY = "auto_travel_settings_v1";

  let settings = {
    enabled: false,
    delay: 500,
    refreshEnabled: false,
    refreshDelay: 1000,
    maxRefreshes: 5,
    cooldownMs: 350 // keep low; live search can be fast
  };

  function loadSettings() {
    const stored = GM_getValue(SETTINGS_KEY, null);
    if (stored && typeof stored === "object") {
      settings = { ...settings, ...stored };
    }
  }

  function saveSettings() {
    GM_setValue(SETTINGS_KEY, settings);
  }

  loadSettings();

  GM_addValueChangeListener(SETTINGS_KEY, (name, oldValue, newValue, remote) => {
    if (!remote) return;
    if (newValue && typeof newValue === "object") {
      settings = { ...settings, ...newValue };
      syncPanelFromSettings();
    }
  });

  let clickTimeout = null;
  let lastClickAt = 0;

  // Locks one click cycle to one first-row result.
  // This prevents clicking row 2 after row 1 changes state.
  let activeTravelRowKey = null;

  // Tracks the current first row. When the first row changes,
  // the lock resets so the same tab can work again for new results.
  let activeResultsetSignature = null;

  const REFRESH_COUNT_KEY = "auto_travel_refresh_count";
  const STATE_MAP_KEY = "auto_travel_row_state_v1";

  function getRefreshCount() {
    const v = sessionStorage.getItem(REFRESH_COUNT_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  }

  function setRefreshCount(v) {
    sessionStorage.setItem(REFRESH_COUNT_KEY, String(v));
  }

  function loadStateMap() {
    try {
      const raw = sessionStorage.getItem(STATE_MAP_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function saveStateMap(map) {
    try {
      sessionStorage.setItem(STATE_MAP_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  let stateMap = loadStateMap();

  function normText(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getRowKeyFromAny(el) {
    const row = el.closest?.(".row");

    if (row) {
      const id = row.getAttribute("data-id");
      if (id) return `row:${id}`;
    }

    const details = el.closest?.(".details") || el.closest?.(".row") || document;
    const profile = details.querySelector?.(".profile-link a")?.getAttribute("href") || "";
    const ign = details.querySelector?.(".character-name a")?.textContent?.trim() || "";
    const price = details.querySelector?.('[data-field="price"]')?.textContent?.replace(/\s+/g, " ").trim() || "";
    const key = `${profile}|${ign}|${price}`;

    if (key !== "||") return `fallback:${key}`;

    return "unknown";
  }

  function getResultset() {
    return (
      document.querySelector("body.modern.trade #app .content #trade .results .resultset") ||
      document.querySelector(".content #trade .results .resultset") ||
      document.querySelector(".resultset")
    );
  }

  function getFirstResultRow(resultset) {
    if (!resultset) return null;

    return (
      resultset.querySelector(":scope > .row[data-id]:not(.exchange)") ||
      resultset.querySelector(".row[data-id]:not(.exchange)")
    );
  }

  function getFirstRowSignature(resultset) {
    const firstRow = getFirstResultRow(resultset);
    return firstRow?.getAttribute("data-id") || null;
  }

  function resetLockIfFirstRowChanged(resultset) {
    const currentSignature = getFirstRowSignature(resultset);

    if (!currentSignature) return;

    if (currentSignature !== activeResultsetSignature) {
      activeResultsetSignature = currentSignature;
      activeTravelRowKey = null;

      console.log("[Auto Travel] New first result detected. Reset click lock:", currentSignature);
    }
  }

  function findFirstDirectButton(resultset) {
    if (!resultset) return null;

    const firstRow = getFirstResultRow(resultset);
    if (!firstRow) return null;

    const btn = firstRow.querySelector(
      ".btn-group > button.btn.btn-xs.btn-default.direct-btn:not([disabled])"
    );

    if (!btn) return null;

    const label = normText(btn);

    const isAllowedHideoutButton =
      label === "travel to hideout" ||
      label.includes("teleport anyway") ||
      label.includes("in demand");

    if (!isAllowedHideoutButton) return null;

    return {
      btn,
      rowKey: getRowKeyFromAny(btn),
      label
    };
  }

  function scheduleRefreshIfEnabled() {
    if (!settings.refreshEnabled) return;

    const currentCount = getRefreshCount();
    const max = Number(settings.maxRefreshes) || 0; // 0 = unlimited

    if (max !== 0 && currentCount >= max) {
      console.log("[Auto Travel] Max refreshes reached, not reloading.");
      return;
    }

    const rDelay = Number(settings.refreshDelay) || 0;

    setTimeout(() => {
      setRefreshCount(currentCount + 1);

      console.log("[Auto Travel] Refreshing page...", {
        count: currentCount + 1,
        max
      });

      location.reload();
    }, rDelay);
  }

  function maybeClickConfirm(rowKey, maxWaitMs = 2500, intervalMs = 120) {
    const start = Date.now();

    const tick = () => {
      if (!settings.enabled) return;

      const st = stateMap[rowKey];
      if (st?.confirm) return;

      const resultset = getResultset();
      if (!resultset) return;

      const found = findFirstDirectButton(resultset);

      if (found) {
        const { btn, rowKey: foundRowKey, label } = found;

        if (
          foundRowKey === rowKey &&
          (label.includes("teleport anyway") || label.includes("in demand"))
        ) {
          try {
            btn.click();

            stateMap[rowKey] = {
              ...(stateMap[rowKey] || {}),
              confirm: true,
              ts: Date.now()
            };

            saveStateMap(stateMap);

            console.log("[Auto Travel] Clicked confirm:", label);

            scheduleRefreshIfEnabled();
            return;
          } catch (e) {
            console.warn("[Auto Travel] Confirm click failed:", e);
          }
        }
      }

      if (Date.now() - start < maxWaitMs) {
        setTimeout(tick, intervalMs);
      } else {
        scheduleRefreshIfEnabled();
      }
    };

    setTimeout(tick, intervalMs);
  }

  function clickTravelThenMaybeConfirmOnce() {
    if (!settings.enabled) return;

    const now = Date.now();
    const cooldown = Number(settings.cooldownMs) || 0;

    if (cooldown > 0 && now - lastClickAt < cooldown) return;

    const resultset = getResultset();
    if (!resultset) return;

    resetLockIfFirstRowChanged(resultset);

    const found = findFirstDirectButton(resultset);
    if (!found) return;

    const { btn, rowKey, label } = found;
    if (rowKey === "unknown") return;

    const st = stateMap[rowKey] || {};
    const isConfirm =
      label.includes("teleport anyway") || label.includes("in demand");

    // Once a Travel click has started, do not move to another row
    // while this same first-result cycle is active.
    if (activeTravelRowKey && rowKey !== activeTravelRowKey) return;

    // Initial click must be exactly "Travel to Hideout".
    // This avoids clicking Direct Whisper or any unrelated direct button.
    if (!isConfirm && label !== "travel to hideout") return;

    if (!isConfirm && st.travel) return;
    if (isConfirm && st.confirm) return;

    try {
      if (!isConfirm) {
        activeTravelRowKey = rowKey;
      }

      stateMap[rowKey] = {
        ...st,
        travel: !isConfirm ? true : st.travel,
        confirm: isConfirm ? true : st.confirm,
        ts: Date.now()
      };

      saveStateMap(stateMap);

      btn.click();
      lastClickAt = now;

      console.log("[Auto Travel] Clicked direct button:", label);

      if (isConfirm) {
        scheduleRefreshIfEnabled();
      } else {
        maybeClickConfirm(rowKey);
      }
    } catch (e) {
      console.warn("[Auto Travel] Click failed:", e);

      const cur = stateMap[rowKey] || {};
      delete cur.travel;
      delete cur.confirm;
      stateMap[rowKey] = cur;
      saveStateMap(stateMap);
    }
  }

  function scheduleClick() {
    clearTimeout(clickTimeout);

    clickTimeout = setTimeout(() => {
      requestAnimationFrame(clickTravelThenMaybeConfirmOnce);
    }, Number(settings.delay) || 0);
  }

  function initObserver() {
    scheduleClick();

    const target = getResultset() || document.body;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          scheduleClick();
          break;
        }
      }
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  // ---------------------------------------------------------------------
  // Settings UI: floating button + panel (replaces the extension popup)
  // ---------------------------------------------------------------------

  let panelEl = null;
  let fieldRefs = null;

  function syncPanelFromSettings() {
    if (!fieldRefs) return;
    fieldRefs.enableSwitch.checked = !!settings.enabled;
    fieldRefs.delayInput.value = settings.delay ?? 500;
    fieldRefs.refreshSwitch.checked = !!settings.refreshEnabled;
    fieldRefs.refreshDelayInput.value = settings.refreshDelay ?? 1000;
    fieldRefs.maxRefreshesInput.value = settings.maxRefreshes ?? 5;
  }

  function buildUI() {
    GM_addStyle(`
      #auto-travel-toggle-btn {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 999999;
        background: #2d2d2d;
        color: #fff;
        border: 1px solid #555;
        border-radius: 6px;
        padding: 8px 12px;
        font-family: sans-serif;
        font-size: 12px;
        cursor: pointer;
        opacity: 0.85;
      }
      #auto-travel-toggle-btn:hover { opacity: 1; }
      #auto-travel-panel {
        position: fixed;
        bottom: 56px;
        right: 16px;
        z-index: 999999;
        width: 260px;
        background: #1e1e1e;
        color: #eee;
        border: 1px solid #555;
        border-radius: 8px;
        padding: 10px;
        font-family: sans-serif;
        font-size: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none;
      }
      #auto-travel-panel.open { display: block; }
      #auto-travel-panel h3 { margin: 0 0 6px 0; font-size: 13px; }
      #auto-travel-panel label { display: block; margin-top: 10px; }
      #auto-travel-panel input[type="number"] { width: 100px; }
      #auto-travel-panel small { color: #aaa; display: block; margin-top: 2px; line-height: 1.2; }
      #auto-travel-panel button { margin-top: 12px; }
    `);

    const btn = document.createElement("button");
    btn.id = "auto-travel-toggle-btn";
    btn.textContent = "Auto Travel";
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "auto-travel-panel";
    panel.innerHTML = `
      <h3>Auto Travel Settings</h3>
      <label>
        <input type="checkbox" id="at-enableSwitch" />
        Enable Auto Click
      </label>
      <label>
        Delay before click (ms):
        <input type="number" id="at-delayInput" min="0" step="50" />
        <small>Lower = faster; too low can click before the button finishes rendering.</small>
      </label>
      <label>
        <input type="checkbox" id="at-refreshSwitch" />
        Refresh after click
      </label>
      <label>
        Refresh delay (ms):
        <input type="number" id="at-refreshDelayInput" min="0" step="100" />
        <small>Time to let the click(s) go through before reloading.</small>
      </label>
      <label>
        Max refreshes:
        <input type="number" id="at-maxRefreshesInput" min="0" step="1" />
        <small>0 = no limit. Helps prevent infinite refresh loops.</small>
      </label>
      <button id="at-saveBtn">Save</button>
    `;
    document.body.appendChild(panel);
    panelEl = panel;

    fieldRefs = {
      enableSwitch: panel.querySelector("#at-enableSwitch"),
      delayInput: panel.querySelector("#at-delayInput"),
      refreshSwitch: panel.querySelector("#at-refreshSwitch"),
      refreshDelayInput: panel.querySelector("#at-refreshDelayInput"),
      maxRefreshesInput: panel.querySelector("#at-maxRefreshesInput")
    };

    syncPanelFromSettings();

    btn.addEventListener("click", () => {
      panel.classList.toggle("open");
    });

    panel.querySelector("#at-saveBtn").addEventListener("click", () => {
      settings.enabled = fieldRefs.enableSwitch.checked;
      settings.delay = parseInt(fieldRefs.delayInput.value, 10) || 0;
      settings.refreshEnabled = fieldRefs.refreshSwitch.checked;
      settings.refreshDelay = parseInt(fieldRefs.refreshDelayInput.value, 10) || 0;

      const maxRaw = parseInt(fieldRefs.maxRefreshesInput.value, 10);
      settings.maxRefreshes = Number.isFinite(maxRaw) ? maxRaw : 0;

      saveSettings();

      const saveBtn = panel.querySelector("#at-saveBtn");
      saveBtn.textContent = "Saved!";
      setTimeout(() => (saveBtn.textContent = "Save"), 1000);
    });
  }

  buildUI();

  console.log("[Auto Travel] Loaded settings:", {
    enabled: settings.enabled,
    delay: settings.delay,
    refreshEnabled: settings.refreshEnabled,
    refreshDelay: settings.refreshDelay,
    maxRefreshes: settings.maxRefreshes
  });

  initObserver();
})();
