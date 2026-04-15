// background.js — Service Worker
// Handles proxy configuration and authentication

let proxyCredentials = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setProxy") {
    applyProxy(message.config)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.action === "clearProxy") {
    clearProxy()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "getStatus") {
    getProxyStatus().then((status) => sendResponse(status));
    return true;
  }

  if (message.action === "reloadCurrentTab") {
    reloadCurrentTab()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Apply SOCKS5 proxy settings
async function applyProxy(config) {
  const { host, port, username, password } = config;

  const normalizedHost = typeof host === "string" ? host.trim() : "";
  const normalizedPort = Number.parseInt(port, 10);

  if (!normalizedHost || !Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new Error("Host and port are required");
  }

  // Save credentials for auth handler
  if (username) {
    proxyCredentials = { username, password: password || "" };
  } else {
    proxyCredentials = null;
  }

  const proxyConfig = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "socks5",
        host: normalizedHost,
        port: normalizedPort,
      },
      bypassList: ["localhost", "127.0.0.1", "::1"],
    },
  };

  await chrome.proxy.settings.set({
    value: proxyConfig,
    scope: "regular",
  });

  // Save to storage so we can restore on browser restart
  await chrome.storage.local.set({
    proxyConfig: config,
    proxyEnabled: true,
  });
}

// Clear proxy and revert to system settings
async function clearProxy() {
  proxyCredentials = null;

  await chrome.proxy.settings.clear({ scope: "regular" });
  await chrome.storage.local.set({ proxyEnabled: false });
}

// Get current proxy status
async function getProxyStatus() {
  return new Promise((resolve) => {
    chrome.proxy.settings.get({ incognito: false }, (details) => {
      const enabled = details?.value?.mode === "fixed_servers";
      resolve({
        enabled,
        config: details?.value?.rules?.singleProxy || null,
      });
    });
  });
}

// Handle proxy authentication
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (
      details.isProxy &&
      proxyCredentials &&
      proxyCredentials.username
    ) {
      callback({
        authCredentials: {
          username: proxyCredentials.username,
          password: proxyCredentials.password,
        },
      });
    } else {
      callback({});
    }
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Restore proxy settings on service worker startup
chrome.storage.local.get(["proxyConfig", "proxyEnabled"], async (data) => {
  if (data.proxyEnabled && data.proxyConfig) {
    try {
      await applyProxy(data.proxyConfig);
      console.log("[SOCKS5 Proxy] Restored proxy settings on startup");
    } catch (e) {
      console.error("[SOCKS5 Proxy] Failed to restore settings:", e);
    }
  }
});

async function reloadCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab || activeTab.id == null || !activeTab.url || !/^https?:\/\//i.test(activeTab.url)) {
    return;
  }

  await new Promise((resolve) => {
    chrome.tabs.reload(activeTab.id, {}, () => resolve());
  });
}
