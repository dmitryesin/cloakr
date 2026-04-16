// Service worker for proxy configuration and authentication.

let proxyCredentials = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setProxy") {
    applyProxy(message.config)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
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

  if (message.action === "getProxyLatency") {
    measureProxyLatency()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Apply proxy settings.
async function applyProxy(config) {
  const { protocol, host, port, username, password, rememberPassword } = config;

  const normalizedHost = typeof host === "string" ? host.trim() : "";
  const normalizedPort = Number.parseInt(port, 10);
  const normalizedProtocol = typeof protocol === "string" ? protocol.toLowerCase().trim() : "socks5";
  const normalizedRememberPassword = Boolean(rememberPassword);
  const supportedProtocols = ["socks5", "http", "https"];
  const hasPassword = Object.prototype.hasOwnProperty.call(config, "password");

  if (
    !normalizedHost ||
    !Number.isInteger(normalizedPort) ||
    normalizedPort < 1 ||
    normalizedPort > 65535 ||
    !supportedProtocols.includes(normalizedProtocol)
  ) {
    throw new Error("Host and port are required");
  }

  // Cache credentials for proxy auth challenges.
  if (username && hasPassword) {
    proxyCredentials = { username, password: password || "" };
  } else {
    proxyCredentials = null;
  }

  const proxyConfig = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: normalizedProtocol,
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

  const persistedConfig = {
    protocol: normalizedProtocol,
    host: normalizedHost,
    port: normalizedPort,
    username,
    rememberPassword: normalizedRememberPassword,
  };

  if (normalizedRememberPassword && hasPassword) {
    persistedConfig.password = password || "";
  }

  // Persist the active configuration.
  await chrome.storage.local.set({
    proxyConfig: persistedConfig,
    proxyEnabled: true,
  });
}

// Reset browser proxy settings.
async function clearProxy() {
  proxyCredentials = null;

  await chrome.proxy.settings.clear({ scope: "regular" });
  await chrome.storage.local.set({ proxyEnabled: false });
}

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

// Respond to proxy auth challenges.
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

// Restore the saved proxy on startup.
chrome.storage.local.get(["proxyConfig", "proxyEnabled"], async (data) => {
  if (data.proxyEnabled && data.proxyConfig) {
    try {
      await applyProxy(data.proxyConfig);
      console.log("[Proxy Manager] Restored proxy settings on startup");
    } catch (e) {
      console.error("[Proxy Manager] Failed to restore settings:", e);
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

async function measureProxyLatency() {
  const status = await getProxyStatus();
  if (!status.enabled) {
    return { success: false, error: "Proxy is not enabled" };
  }

  const testUrl = "https://www.gstatic.com/generate_204";
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(testUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 204) {
      return { success: false, reason: "n/a" };
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    return { success: true, latencyMs };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { success: false, reason: "timeout" };
    }

    return { success: false, reason: "n/a" };
  } finally {
    clearTimeout(timeoutId);
  }
}
