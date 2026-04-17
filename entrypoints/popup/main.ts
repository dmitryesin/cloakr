export {};

declare const chrome: any;

const hostInput = document.getElementById("host") as HTMLInputElement;
const portInput = document.getElementById("port") as HTMLInputElement;
const protocolInput = document.getElementById("protocol") as HTMLSelectElement;
const usernameInput = document.getElementById("username") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const rememberPasswordInput = document.getElementById("rememberPassword") as HTMLInputElement;
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const statusBadge = document.getElementById("statusBadge") as HTMLDivElement;
const statusBar = document.getElementById("statusBar") as HTMLDivElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const errorMsg = document.getElementById("errorMsg") as HTMLDivElement;
const authSection = document.getElementById("authSection") as HTMLDivElement;
const togglePassword = document.getElementById("togglePassword") as HTMLButtonElement;
const savedSection = document.getElementById("savedSection") as HTMLDivElement;
const savedList = document.getElementById("savedList") as HTMLDivElement;

const MAX_SAVED_PROXIES = 30;

type ProxyProtocol = "http" | "https" | "socks5";

type ProxyConfig = {
  protocol?: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
  id?: number;
};

type GetStatusResponse = {
  enabled: boolean;
  config: {
    scheme?: ProxyProtocol;
    host?: string;
    port?: number;
  } | null;
};

type MessageResponse = {
  success?: boolean;
  error?: string;
  reason?: string;
};

// Initialization.
document.addEventListener("DOMContentLoaded", async () => {
  void loadSavedProxies();
  void refreshStatus();
  void loadLastConfig();
  updateAuthInputsState();
});

protocolInput.addEventListener("change", () => {
  updateAuthInputsState();
});

// Status.
async function refreshStatus(): Promise<void> {
  const { enabled, config } = (await sendMessage({ action: "getStatus" })) as GetStatusResponse;

  if (enabled && config) {
    setConnectedUI(config.scheme, config.host, config.port);
  } else {
    setDisconnectedUI();
  }
}

function setConnectedUI(
  protocol: ProxyProtocol | undefined,
  host: string | undefined,
  port: number | undefined
): void {
  const protocolLabel = (protocol || "http").toUpperCase();
  statusBadge.textContent = "ON";
  statusBadge.className = "status-badge status-on";
  statusBar.className = "status-bar status-bar--active";
  statusText.textContent = `Using ${protocolLabel} ${host || ""}:${port || ""}`;
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "";
}

function setDisconnectedUI(): void {
  statusBadge.textContent = "OFF";
  statusBadge.className = "status-badge status-off";
  statusBar.className = "status-bar status-bar--inactive";
  statusText.textContent = "Proxy is off";
  connectBtn.style.display = "";
  disconnectBtn.style.display = "none";
}

// Connection controls.
connectBtn.addEventListener("click", async () => {
  hideError();

  const host = hostInput.value.trim();
  const port = portInput.value.trim();
  const normalizedPort = normalizePort(port);
  const protocol = protocolInput.value as ProxyProtocol;
  const isSocks5 = protocol === "socks5";
  const username = isSocks5 ? "" : usernameInput.value.trim();
  const password = isSocks5 ? "" : passwordInput.value;
  const rememberPassword = isSocks5 ? false : rememberPasswordInput.checked;

  if (!host) return showError("Enter server address.");
  if (normalizedPort == null) return showError("Enter a valid port (1-65535).");

  connectBtn.textContent = "Turning on...";
  connectBtn.disabled = true;

  const result = (await sendMessage({
    action: "setProxy",
    config: { protocol, host, port: normalizedPort, username, password, rememberPassword },
  })) as MessageResponse;

  connectBtn.textContent = "Turn on";
  connectBtn.disabled = false;

  if (result.success) {
    setConnectedUI(protocol, host, normalizedPort);
    const lastConfig: ProxyConfig = { protocol, host, port: normalizedPort, username, rememberPassword };
    if (rememberPassword) {
      lastConfig.password = password;
    }
    chrome.storage.local.set({ lastConfig });
    await sendMessage({ action: "reloadCurrentTab" });
  } else {
    showError(result.error || "Could not apply proxy settings.");
  }
});

disconnectBtn.addEventListener("click", async () => {
  disconnectBtn.textContent = "Turning off...";
  disconnectBtn.disabled = true;

  const result = (await sendMessage({ action: "clearProxy" })) as MessageResponse;

  if (!result.success) {
    disconnectBtn.textContent = "Turn off";
    disconnectBtn.disabled = false;
    showError(result.error || "Could not turn off proxy.");
    return;
  }

  disconnectBtn.textContent = "Turn off";
  disconnectBtn.disabled = false;

  setDisconnectedUI();
  await sendMessage({ action: "reloadCurrentTab" });
});

// Save proxy.
saveBtn.addEventListener("click", async () => {
  const host = hostInput.value.trim();
  const port = portInput.value.trim();
  const normalizedPort = normalizePort(port);
  const protocol = protocolInput.value as ProxyProtocol;
  const isSocks5 = protocol === "socks5";
  const username = isSocks5 ? "" : usernameInput.value.trim();
  const password = isSocks5 ? "" : passwordInput.value;
  const rememberPassword = isSocks5 ? false : rememberPasswordInput.checked;

  if (!host) return showError("Enter server address before saving.");
  if (normalizedPort == null) return showError("Enter a valid port (1-65535) before saving.");
  hideError();

  const data = await storageGet("savedProxies");
  const list = (data.savedProxies as ProxyConfig[] | undefined) || [];

  if (list.length >= MAX_SAVED_PROXIES) {
    return showError(
      `Maximum ${MAX_SAVED_PROXIES} saved proxies reached. Remove old entries to add a new one.`
    );
  }

  // Avoid duplicates by protocol + host:port
  const exists = list.find(
    (p) => (p.protocol || "http") === protocol && p.host === host && p.port === normalizedPort
  );
  if (exists) return showError("This configuration is already saved.");

  const savedProxy: ProxyConfig = {
    protocol,
    host,
    port: normalizedPort,
    username,
    rememberPassword,
    id: Date.now(),
  };

  if (rememberPassword) {
    savedProxy.password = password;
  }

  list.push(savedProxy);
  await storageSet({ savedProxies: list });

  saveBtn.textContent = "Saved";
  setTimeout(() => {
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg> Save preset`;
  }, 1200);

  await loadSavedProxies();
});

// Saved proxies list.
async function loadSavedProxies(): Promise<void> {
  const data = await storageGet("savedProxies");
  const list = (data.savedProxies as ProxyConfig[] | undefined) || [];

  if (list.length === 0) {
    savedSection.style.display = "none";
    return;
  }

  savedSection.style.display = "";
  savedList.innerHTML = "";

  list.forEach((proxy) => {
    const item = document.createElement("div");
    item.className = "saved-item";

    const nameEl = document.createElement("span");
    nameEl.className = "saved-item-name";
    const proxyProtocol = (proxy.protocol || "http").toUpperCase();
    const hostLabel = proxy.username ? `${proxy.username}@${proxy.host}` : proxy.host;
    nameEl.textContent = `${proxyProtocol} ${hostLabel}`;

    const addrEl = document.createElement("span");
    addrEl.className = "saved-item-addr";
    addrEl.textContent = `:${proxy.port}`;

    const delBtn = document.createElement("button");
    delBtn.className = "saved-item-delete";
    delBtn.title = "Remove";
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;

    item.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".saved-item-delete")) return;
      protocolInput.value = proxy.protocol || "http";
      hostInput.value = proxy.host;
      portInput.value = String(proxy.port);
      usernameInput.value = proxy.username || "";
      const isRemembered = Boolean(proxy.rememberPassword && proxy.password);
      rememberPasswordInput.checked = isRemembered;
      passwordInput.value = isRemembered ? proxy.password || "" : "";
      updateAuthInputsState();
    });

    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const newList = list.filter((p) => p.id !== proxy.id);
      await storageSet({ savedProxies: newList });
      await loadSavedProxies();
    });

    item.appendChild(nameEl);
    item.appendChild(addrEl);
    item.appendChild(delBtn);
    savedList.appendChild(item);
  });
}

// Restore last config.
async function loadLastConfig(): Promise<void> {
  const data = await storageGet("lastConfig");
  const lastConfig = data.lastConfig as ProxyConfig | undefined;
  if (lastConfig) {
    const { protocol, host, port, username, rememberPassword, password } = lastConfig;
    protocolInput.value = protocol || "http";
    if (!hostInput.value) hostInput.value = host || "";
    if (!portInput.value) portInput.value = String(port || "");
    if (!usernameInput.value) usernameInput.value = username || "";
    const isRemembered = Boolean(rememberPassword && password);
    rememberPasswordInput.checked = isRemembered;
    passwordInput.value = isRemembered ? password || "" : "";
  }

  updateAuthInputsState();
}

// Password visibility toggle.
togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  const icon = togglePassword.querySelector("svg");
  if (!icon) return;

  icon.innerHTML = isPassword
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
});

// Helpers.
function showError(msg: string): void {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError(): void {
  errorMsg.style.display = "none";
}

function sendMessage(msg: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response: any) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || {});
    });
  });
}

function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(data, () => resolve()));
}

function normalizePort(value: string | number): number | null {
  const asString = typeof value === "string" ? value.trim() : String(value || "").trim();
  if (!/^\d+$/.test(asString)) {
    return null;
  }

  const port = Number(asString);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

function updateAuthInputsState(): void {
  const isSocks5 = protocolInput.value === "socks5";

  authSection.style.display = isSocks5 ? "none" : "";

  usernameInput.disabled = isSocks5;
  passwordInput.disabled = isSocks5;
  togglePassword.disabled = isSocks5;
  rememberPasswordInput.disabled = isSocks5;

  if (isSocks5) {
    rememberPasswordInput.checked = false;
  }
}

