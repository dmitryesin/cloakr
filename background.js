// Service worker for proxy configuration and authentication.

let proxyCredentials = null;
const SESSION_CREDENTIALS_KEY = "sessionProxyCredentials";

async function setSessionCredentials(credentials) {
  await chrome.storage.session.set({ [SESSION_CREDENTIALS_KEY]: credentials });
}

async function clearSessionCredentials() {
  await chrome.storage.session.remove(SESSION_CREDENTIALS_KEY);
}

async function getActiveProxyCredentials() {
  if (proxyCredentials?.username) {
    return proxyCredentials;
  }

  const sessionData = await chrome.storage.session.get(SESSION_CREDENTIALS_KEY);
  const sessionCredentials = sessionData?.[SESSION_CREDENTIALS_KEY] || null;
  if (sessionCredentials?.username) {
    proxyCredentials = {
      username: sessionCredentials.username,
      password: sessionCredentials.password || "",
    };
    return proxyCredentials;
  }

  const localData = await chrome.storage.local.get("proxyConfig");
  const localConfig = localData?.proxyConfig;
  const hasSavedPassword = localConfig && Object.prototype.hasOwnProperty.call(localConfig, "password");

  if (localConfig?.username && hasSavedPassword) {
    proxyCredentials = {
      username: localConfig.username,
      password: localConfig.password || "",
    };
    return proxyCredentials;
  }

  return null;
}

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
  const normalizedPort = normalizePort(port);
  const normalizedProtocol = typeof protocol === "string" ? protocol.toLowerCase().trim() : "socks5";
  const normalizedRememberPassword = Boolean(rememberPassword);
  const supportedProtocols = ["socks5", "http", "https"];
  const hasPassword = Object.prototype.hasOwnProperty.call(config, "password");

  if (
    !normalizedHost ||
    normalizedPort == null ||
    !supportedProtocols.includes(normalizedProtocol)
  ) {
    throw new Error("Host and port are required");
  }

  // Cache credentials and persist them in session storage so auth survives worker sleep.
  if (username && hasPassword) {
    proxyCredentials = { username, password: password || "" };
    await setSessionCredentials(proxyCredentials);
  } else {
    proxyCredentials = null;
    await clearSessionCredentials();
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

function normalizePort(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 65535) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const asString = value.trim();
  if (!/^\d+$/.test(asString)) {
    return null;
  }

  const port = Number(asString);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

// Reset browser proxy settings.
async function clearProxy() {
  proxyCredentials = null;
  await clearSessionCredentials();

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
    if (!details.isProxy) {
      callback({});
      return;
    }

    getActiveProxyCredentials()
      .then((credentials) => {
        if (credentials?.username) {
          callback({
            authCredentials: {
              username: credentials.username,
              password: credentials.password || "",
            },
          });
          return;
        }

        callback({});
      })
      .catch(() => callback({}));
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Restore the saved proxy on startup.
chrome.storage.local.get(["proxyConfig", "proxyEnabled"], async (data) => {
  if (data.proxyEnabled && data.proxyConfig) {
    const hasSavedPassword = Object.prototype.hasOwnProperty.call(data.proxyConfig, "password");
    if (data.proxyConfig.username && !hasSavedPassword) {
      await clearProxy();
      console.warn("[Proxy Manager] Skipped restoring auth proxy without saved password");
      return;
    }

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

const LATENCY_TEST_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://www.google.com/generate_204",
];

async function probeLatency(url, timeoutMs) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 204) {
      return {
        success: true,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    if (response.status === 407) {
      return { success: false, reason: "proxy_auth_required" };
    }

    return { success: false, reason: `http_${response.status}` };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { success: false, reason: "timeout" };
    }

    return { success: false, reason: "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function measureProxyLatency() {
  const status = await getProxyStatus();
  if (!status.enabled) {
    return { success: false, error: "Proxy is not enabled" };
  }

  let lastFailure = { success: false, reason: "network_error" };
  for (const url of LATENCY_TEST_URLS) {
    const result = await probeLatency(url, 3000);
    if (result.success) {
      return result;
    }

    // This is a definitive proxy-side failure and should not be masked by fallback endpoints.
    if (result.reason === "proxy_auth_required") {
      return result;
    }

    lastFailure = result;
  }

  return lastFailure;
}
