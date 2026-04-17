import { defineBackground } from "wxt/utils/define-background";

// Service worker for proxy configuration and authentication.

declare const chrome: any;

export default defineBackground(() => {

type ProxyProtocol = "socks5" | "http" | "https";

type ProxyConfig = {
  protocol?: string;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
};

type ProxyCredentials = {
  username: string;
  password: string;
};

type ProxyStatus = {
  enabled: boolean;
  config: any;
};

type Message =
  | { action: "setProxy"; config: ProxyConfig }
  | { action: "clearProxy" }
  | { action: "getStatus" }
  | { action: "reloadCurrentTab" };

let proxyCredentials: ProxyCredentials | null = null;
const SESSION_CREDENTIALS_KEY = "sessionProxyCredentials";

async function setSessionCredentials(credentials: ProxyCredentials): Promise<void> {
  await chrome.storage.session.set({ [SESSION_CREDENTIALS_KEY]: credentials });
}

async function clearSessionCredentials(): Promise<void> {
  await chrome.storage.session.remove(SESSION_CREDENTIALS_KEY);
}

async function getActiveProxyCredentials(): Promise<ProxyCredentials | null> {
  if (proxyCredentials?.username) {
    return proxyCredentials;
  }

  const sessionData = await chrome.storage.session.get(SESSION_CREDENTIALS_KEY);
  const sessionCredentials = (sessionData?.[SESSION_CREDENTIALS_KEY] as ProxyCredentials | undefined) || null;
  if (sessionCredentials?.username) {
    proxyCredentials = {
      username: sessionCredentials.username,
      password: sessionCredentials.password || "",
    };
    return proxyCredentials;
  }

  const localData = await chrome.storage.local.get("proxyConfig");
  const localConfig = localData?.proxyConfig as ProxyConfig | undefined;
  const hasSavedPassword =
    localConfig && Object.prototype.hasOwnProperty.call(localConfig, "password");

  if (localConfig?.username && hasSavedPassword) {
    proxyCredentials = {
      username: localConfig.username,
      password: localConfig.password || "",
    };
    return proxyCredentials;
  }

  return null;
}

chrome.runtime.onMessage.addListener((message: Message, _sender: any, sendResponse: any) => {
  if (message.action === "setProxy") {
    applyProxy(message.config)
      .then(() => sendResponse({ success: true }))
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "clearProxy") {
    clearProxy()
      .then(() => sendResponse({ success: true }))
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "getStatus") {
    getProxyStatus().then((status) => sendResponse(status));
    return true;
  }

  if (message.action === "reloadCurrentTab") {
    reloadCurrentTab()
      .then(() => sendResponse({ success: true }))
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// Apply proxy settings.
async function applyProxy(config: ProxyConfig): Promise<void> {
  const { protocol, host, port, username, password, rememberPassword } = config;

  const normalizedHost = typeof host === "string" ? host.trim() : "";
  const normalizedPort = normalizePort(port);
  const normalizedProtocol =
    typeof protocol === "string" ? protocol.toLowerCase().trim() : "socks5";
  const normalizedRememberPassword = Boolean(rememberPassword);
  const supportedProtocols: ProxyProtocol[] = ["socks5", "http", "https"];
  const hasPassword = Object.prototype.hasOwnProperty.call(config, "password");

  if (
    !normalizedHost ||
    normalizedPort == null ||
    !supportedProtocols.includes(normalizedProtocol as ProxyProtocol)
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
        scheme: normalizedProtocol as ProxyProtocol,
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

  const persistedConfig: ProxyConfig = {
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

function normalizePort(value: number | string | undefined): number | null {
  if (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535) {
    return Number(value);
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
async function clearProxy(): Promise<void> {
  proxyCredentials = null;
  await clearSessionCredentials();

  await chrome.proxy.settings.clear({ scope: "regular" });
  await chrome.storage.local.set({ proxyEnabled: false });
}

async function getProxyStatus(): Promise<ProxyStatus> {
  return new Promise((resolve) => {
    chrome.proxy.settings.get({ incognito: false }, (details: any) => {
      const enabled = details?.value?.mode === "fixed_servers";
      resolve({
        enabled,
        config: details?.value?.rules?.singleProxy || null,
      });
    });
  });
}

// Respond to proxy auth challenges.
try {
  chrome.webRequest.onAuthRequired.addListener(
    (details: any, callback: any) => {
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
    {
      urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"],
    },
    ["asyncBlocking"]
  );
} catch {
  // WXT build-time fake browser does not implement this API.
}

// Restore the saved proxy on startup.
chrome.storage.local.get(["proxyConfig", "proxyEnabled"], async (data: any) => {
  const storedConfig = data.proxyConfig as ProxyConfig | undefined;
  if (data.proxyEnabled && storedConfig) {
    const hasSavedPassword = Object.prototype.hasOwnProperty.call(storedConfig, "password");
    if (storedConfig.username && !hasSavedPassword) {
      await clearProxy();
      console.warn("[Proxy Manager] Skipped restoring auth proxy without saved password");
      return;
    }

    try {
      await applyProxy(storedConfig);
      console.log("[Proxy Manager] Restored proxy settings on startup");
    } catch (e) {
      console.error("[Proxy Manager] Failed to restore settings:", e);
    }
  }
});

async function reloadCurrentTab(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab || activeTab.id == null || !activeTab.url || !/^https?:\/\//i.test(activeTab.url)) {
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.tabs.reload(activeTab.id, {}, () => resolve());
  });
}

});
