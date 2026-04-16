const hostInput = document.getElementById("host");
const portInput = document.getElementById("port");
const protocolInput = document.getElementById("protocol");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberPasswordInput = document.getElementById("rememberPassword");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const saveBtn = document.getElementById("saveBtn");
const statusBadge = document.getElementById("statusBadge");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");
const errorMsg = document.getElementById("errorMsg");
const togglePassword = document.getElementById("togglePassword");
const savedSection = document.getElementById("savedSection");
const savedList = document.getElementById("savedList");
const latencyCheckEnabledInput = document.getElementById("latencyCheckEnabled");

const MAX_SAVED_PROXIES = 30;
let latencyRequestId = 0;
let isConnectedState = false;
let isLatencyCheckEnabled = false;

// Initialization.

document.addEventListener("DOMContentLoaded", async () => {
  await loadLatencyPreference();
  void loadSavedProxies();
  void refreshStatus();
  void loadLastConfig();
});

// Status.

async function refreshStatus() {
  const { enabled, config } = await sendMessage({ action: "getStatus" });

  if (enabled && config) {
    setConnectedUI(config.scheme, config.host, config.port);
    if (isLatencyCheckEnabled) {
      void refreshLatency(config.scheme, config.host, config.port);
    }
  } else {
    setDisconnectedUI();
  }
}

function setConnectedUI(protocol, host, port, latencyDisplay = null) {
  const protocolLabel = (protocol || "socks5").toUpperCase();
  const latencyLabel = Number.isInteger(latencyDisplay)
    ? ` | ${latencyDisplay} ms`
    : typeof latencyDisplay === "string" && latencyDisplay
      ? ` | ${latencyDisplay}`
      : "";
  statusBadge.textContent = "ON";
  statusBadge.className = "status-badge status-on";
  statusBar.className = "status-bar status-bar--active";
  statusText.textContent = `Using ${protocolLabel} ${host}:${port}${latencyLabel}`;
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "";
  isConnectedState = true;
}

function setDisconnectedUI() {
  statusBadge.textContent = "OFF";
  statusBadge.className = "status-badge status-off";
  statusBar.className = "status-bar status-bar--inactive";
  statusText.textContent = "Proxy is off";
  connectBtn.style.display = "";
  disconnectBtn.style.display = "none";
  isConnectedState = false;
  latencyRequestId += 1;
}

// Connection controls.

connectBtn.addEventListener("click", async () => {
  hideError();

  const host = hostInput.value.trim();
  const port = portInput.value.trim();
  const normalizedPort = normalizePort(port);
  const protocol = protocolInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const rememberPassword = rememberPasswordInput.checked;

  if (!host) return showError("Enter server address.");
  if (normalizedPort == null) return showError("Enter a valid port (1-65535).");

  connectBtn.textContent = "Turning on...";
  connectBtn.disabled = true;

  const result = await sendMessage({
    action: "setProxy",
    config: { protocol, host, port: normalizedPort, username, password, rememberPassword },
  });

  connectBtn.textContent = "Turn on";
  connectBtn.disabled = false;

  if (result.success) {
    setConnectedUI(protocol, host, normalizedPort);
    void refreshLatency(protocol, host, normalizedPort);
    const lastConfig = { protocol, host, port: normalizedPort, username, rememberPassword };
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

  const result = await sendMessage({ action: "clearProxy" });

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
  const protocol = protocolInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const rememberPassword = rememberPasswordInput.checked;

  if (!host) return showError("Enter server address before saving.");
  if (normalizedPort == null) return showError("Enter a valid port (1-65535) before saving.");
  hideError();

  const data = await storageGet("savedProxies");
  const list = data.savedProxies || [];

  if (list.length >= MAX_SAVED_PROXIES) {
    return showError(`Maximum ${MAX_SAVED_PROXIES} saved proxies reached. Remove old entries to add a new one.`);
  }

  // Avoid duplicates by protocol + host:port
  const exists = list.find(
    (p) => (p.protocol || "socks5") === protocol && p.host === host && p.port === normalizedPort
  );
  if (exists) return showError("This configuration is already saved.");

  const savedProxy = {
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

async function loadSavedProxies() {
  const data = await storageGet("savedProxies");
  const list = data.savedProxies || [];

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
    const proxyProtocol = (proxy.protocol || "socks5").toUpperCase();
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
      if (e.target.closest(".saved-item-delete")) return;
      protocolInput.value = proxy.protocol || "socks5";
      hostInput.value = proxy.host;
      portInput.value = proxy.port;
      usernameInput.value = proxy.username || "";
      const isRemembered = Boolean(proxy.rememberPassword && proxy.password);
      rememberPasswordInput.checked = isRemembered;
      passwordInput.value = isRemembered ? proxy.password : "";
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

async function loadLastConfig() {
  const data = await storageGet("lastConfig");
  if (data.lastConfig) {
    const { protocol, host, port, username, rememberPassword, password } = data.lastConfig;
    protocolInput.value = protocol || "socks5";
    if (!hostInput.value) hostInput.value = host || "";
    if (!portInput.value) portInput.value = port || "";
    if (!usernameInput.value) usernameInput.value = username || "";
    rememberPasswordInput.checked = Boolean(rememberPassword && password);
    passwordInput.value = rememberPassword ? password || "" : "";
  }
}

// Password visibility toggle.

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.querySelector("svg").innerHTML = isPassword
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
});

latencyCheckEnabledInput.addEventListener("change", async () => {
  isLatencyCheckEnabled = latencyCheckEnabledInput.checked;
  if (!isLatencyCheckEnabled) {
    latencyRequestId += 1;
  }

  await storageSet({ latencyCheckEnabled: isLatencyCheckEnabled });
  await refreshStatus();
});

// Helpers.

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError() {
  errorMsg.style.display = "none";
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || {});
    });
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

async function loadLatencyPreference() {
  const data = await storageGet("latencyCheckEnabled");
  if (typeof data.latencyCheckEnabled === "boolean") {
    isLatencyCheckEnabled = data.latencyCheckEnabled;
  } else {
    isLatencyCheckEnabled = false;
  }

  latencyCheckEnabledInput.checked = isLatencyCheckEnabled;
}

function normalizePort(value) {
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

async function refreshLatency(protocol, host, port) {
  const requestId = ++latencyRequestId;
  const latencyResult = await sendMessage({ action: "getProxyLatency" });

  if (!isConnectedState || !isLatencyCheckEnabled || requestId !== latencyRequestId) {
    return;
  }

  if (latencyResult.success && Number.isInteger(latencyResult.latencyMs)) {
    setConnectedUI(protocol, host, port, latencyResult.latencyMs);
    return;
  }

  setConnectedUI(protocol, host, port, latencyResult.reason || "n/a");
}
