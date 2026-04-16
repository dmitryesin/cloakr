// popup.js

const hostInput = document.getElementById("host");
const portInput = document.getElementById("port");
const protocolInput = document.getElementById("protocol");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
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

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSavedProxies();
  await refreshStatus();
  await loadLastConfig();
});

// ── Status ────────────────────────────────────────────────────────────────────

async function refreshStatus() {
  const { enabled, config } = await sendMessage({ action: "getStatus" });

  if (enabled && config) {
    setConnectedUI(config.scheme, config.host, config.port);
  } else {
    setDisconnectedUI();
  }
}

function setConnectedUI(protocol, host, port) {
  const protocolLabel = (protocol || "socks5").toUpperCase();
  statusBadge.textContent = "ON";
  statusBadge.className = "status-badge status-on";
  statusBar.className = "status-bar status-bar--active";
  statusText.textContent = `Connected via ${protocolLabel} ${host}:${port}`;
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "";
}

function setDisconnectedUI() {
  statusBadge.textContent = "OFF";
  statusBadge.className = "status-badge status-off";
  statusBar.className = "status-bar status-bar--inactive";
  statusText.textContent = "Not connected";
  connectBtn.style.display = "";
  disconnectBtn.style.display = "none";
}

// ── Connect / Disconnect ──────────────────────────────────────────────────────

connectBtn.addEventListener("click", async () => {
  hideError();

  const host = hostInput.value.trim();
  const port = portInput.value.trim();
  const protocol = protocolInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!host) return showError("Please enter a host or IP address.");
  if (!port || isNaN(port) || port < 1 || port > 65535)
    return showError("Please enter a valid port (1–65535).");

  connectBtn.textContent = "Connecting…";
  connectBtn.disabled = true;

  const result = await sendMessage({
    action: "setProxy",
    config: { protocol, host, port: Number(port), username, password },
  });

  connectBtn.textContent = "Connect";
  connectBtn.disabled = false;

  if (result.success) {
    setConnectedUI(protocol, host, port);
    // Save last used config
    chrome.storage.local.set({ lastConfig: { protocol, host, port, username } });
    await sendMessage({ action: "reloadCurrentTab" });
  } else {
    showError(result.error || "Failed to set proxy.");
  }
});

disconnectBtn.addEventListener("click", async () => {
  disconnectBtn.textContent = "Disconnecting…";
  disconnectBtn.disabled = true;

  const result = await sendMessage({ action: "clearProxy" });

  if (!result.success) {
    disconnectBtn.textContent = "Disconnect";
    disconnectBtn.disabled = false;
    showError(result.error || "Failed to clear proxy.");
    return;
  }

  disconnectBtn.textContent = "Disconnect";
  disconnectBtn.disabled = false;

  setDisconnectedUI();
  await sendMessage({ action: "reloadCurrentTab" });
});

// ── Save proxy ────────────────────────────────────────────────────────────────

saveBtn.addEventListener("click", async () => {
  const host = hostInput.value.trim();
  const port = portInput.value.trim();
  const protocol = protocolInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!host || !port) return showError("Enter host and port to save.");
  hideError();

  const data = await storageGet("savedProxies");
  const list = data.savedProxies || [];

  // Avoid duplicates by protocol + host:port
  const exists = list.find(
    (p) => (p.protocol || "socks5") === protocol && p.host === host && p.port === Number(port)
  );
  if (exists) return showError("This proxy is already saved.");

  list.push({ protocol, host, port: Number(port), username, password, id: Date.now() });
  await storageSet({ savedProxies: list });

  saveBtn.textContent = "Saved!";
  setTimeout(() => {
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg> Save`;
  }, 1200);

  await loadSavedProxies();
});

// ── Saved proxies list ────────────────────────────────────────────────────────

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

    // Load proxy into form
    item.addEventListener("click", (e) => {
      if (e.target.closest(".saved-item-delete")) return;
      protocolInput.value = proxy.protocol || "socks5";
      hostInput.value = proxy.host;
      portInput.value = proxy.port;
      usernameInput.value = proxy.username || "";
      passwordInput.value = proxy.password || "";
    });

    // Delete saved proxy
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

// ── Restore last config ───────────────────────────────────────────────────────

async function loadLastConfig() {
  const data = await storageGet("lastConfig");
  if (data.lastConfig) {
    const { protocol, host, port, username } = data.lastConfig;
    protocolInput.value = protocol || "socks5";
    if (!hostInput.value) hostInput.value = host || "";
    if (!portInput.value) portInput.value = port || "";
    if (!usernameInput.value) usernameInput.value = username || "";
  }
}

// ── Password visibility toggle ────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
