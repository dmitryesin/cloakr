export {};

import type {
  ProxyConfig,
  ProxyStatus,
  RuntimeErrorResponse,
  RuntimeMessage,
  RuntimeMessageAction,
  RuntimeMessageByAction,
  RuntimeResponseByAction,
} from "../shared/messages";

const hostInput = document.getElementById("host") as HTMLInputElement;
const portInput = document.getElementById("port") as HTMLInputElement;
const protocolInput = document.getElementById("protocol") as HTMLInputElement;
const protocolSelect = document.getElementById("protocolSelect") as HTMLDivElement;
const protocolTrigger = document.getElementById("protocolTrigger") as HTMLButtonElement;
const protocolMenu = document.getElementById("protocolMenu") as HTMLDivElement;
const protocolLabel = document.getElementById("protocolLabel") as HTMLSpanElement;
const protocolOptions = Array.from(
  document.querySelectorAll(".protocol-option")
) as HTMLButtonElement[];
const usernameInput = document.getElementById("username") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const rememberPasswordInput = document.getElementById("rememberPassword") as HTMLInputElement;
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;
const retryStatusBtn = document.getElementById("retryStatusBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const statusBadge = document.getElementById("statusBadge") as HTMLDivElement;
const errorMsg = document.getElementById("errorMsg") as HTMLDivElement;
const authSection = document.getElementById("authSection") as HTMLDivElement;
const togglePassword = document.getElementById("togglePassword") as HTMLButtonElement;
const savedSection = document.getElementById("savedSection") as HTMLDivElement;
const savedList = document.getElementById("savedList") as HTMLDivElement;

const MAX_SAVED_PROXIES = 30;
const PROTOCOL_LABELS: Record<ProxyProtocol, string> = {
  http: "HTTP",
  https: "HTTPS",
  quic: "QUIC",
  socks4: "SOCKS4",
  socks5: "SOCKS5",
};

const DISCONNECT_MODE_OFF = "off";
const DISCONNECT_MODE_RELOAD = "reload";

type ProxyProtocol = "http" | "https" | "quic" | "socks4" | "socks5";

type SavedProxyConfig = {
  protocol?: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
  id?: number;
};

type ActiveProxyFormConfig = {
  protocol: ProxyProtocol;
  host: string;
  port: number | null;
  username: string;
  password: string;
  rememberPassword: boolean;
};

let isProxyConnected = false;
let activeProxySnapshot: ActiveProxyFormConfig | null = null;

// Initialization.
document.addEventListener("DOMContentLoaded", async () => {
  initProtocolSelect();
  initConfigChangeTracking();
  void loadSavedProxies();
  await loadLastConfig();
  await refreshStatus();
  updateAuthInputsState();
});

// Status.
async function refreshStatus(): Promise<void> {
  const statusResponse = await sendMessage({ action: "getStatus" });
  if (isRuntimeError(statusResponse)) {
    setStatusUnavailableUI(statusResponse.error);
    return;
  }

  const { enabled, config } = statusResponse as ProxyStatus;

  if (enabled && config) {
    setConnectedUI();
  } else {
    setDisconnectedUI();
  }
}

function setConnectedUI(): void {
  isProxyConnected = true;
  hideError();
  statusBadge.textContent = "ON";
  statusBadge.className = "status-badge status-on";
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "";
  retryStatusBtn.style.display = "none";

  if (!activeProxySnapshot) {
    activeProxySnapshot = getCurrentFormConfig();
  }

  updateDisconnectButtonMode();
}

function setDisconnectedUI(): void {
  isProxyConnected = false;
  activeProxySnapshot = null;
  hideError();
  statusBadge.textContent = "OFF";
  statusBadge.className = "status-badge status-off";
  connectBtn.style.display = "";
  disconnectBtn.style.display = "none";
  retryStatusBtn.style.display = "none";
  setDisconnectButtonMode(DISCONNECT_MODE_OFF);
}

function setStatusUnavailableUI(reason?: string): void {
  statusBadge.textContent = "ERR";
  statusBadge.className = "status-badge status-error";
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "none";
  retryStatusBtn.style.display = "";

  if (reason) {
    showError(`Could not read proxy status: ${reason}`);
  }
}

retryStatusBtn.addEventListener("click", async () => {
  hideError();
  retryStatusBtn.textContent = "Retrying...";
  retryStatusBtn.disabled = true;
  try {
    await refreshStatus();
  } finally {
    retryStatusBtn.textContent = "Retry";
    retryStatusBtn.disabled = false;
  }
});

// Connection controls.
connectBtn.addEventListener("click", async () => {
  hideError();

  const config = getValidatedFormConfig();
  if (!config) return;

  const { protocol, host, port, username, password, rememberPassword } = config;

  connectBtn.textContent = "Turning on...";
  connectBtn.disabled = true;

  const result = await sendMessage({
    action: "setProxy",
    config: { protocol, host, port, username, password, rememberPassword },
  });

  connectBtn.textContent = "Turn on";
  connectBtn.disabled = false;

  if (!isRuntimeError(result)) {
    activeProxySnapshot = getCurrentFormConfig();
    setConnectedUI();
    const lastConfig: SavedProxyConfig = { protocol, host, port, username, rememberPassword };
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
  const currentMode = disconnectBtn.dataset.mode || DISCONNECT_MODE_OFF;

  if (currentMode === DISCONNECT_MODE_RELOAD) {
    hideError();

    const config = getValidatedFormConfig();
    if (!config) {
      return;
    }

    const { protocol, host, port, username, password, rememberPassword } = config;

    disconnectBtn.textContent = "Applying...";
    disconnectBtn.disabled = true;

    const result = await sendMessage({
      action: "setProxy",
      config: { protocol, host, port, username, password, rememberPassword },
    });

    disconnectBtn.disabled = false;

    if (isRuntimeError(result)) {
      updateDisconnectButtonMode();
      showError(result.error || "Could not reload proxy settings.");
      return;
    }

    activeProxySnapshot = getCurrentFormConfig();
    setConnectedUI();

    const lastConfig: SavedProxyConfig = { protocol, host, port, username, rememberPassword };
    if (rememberPassword) {
      lastConfig.password = password;
    }
    chrome.storage.local.set({ lastConfig });

    await sendMessage({ action: "reloadCurrentTab" });
    return;
  }

  disconnectBtn.textContent = "Turning off...";
  disconnectBtn.disabled = true;

  const result = await sendMessage({ action: "clearProxy" });

  if (isRuntimeError(result)) {
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
  const isSocksProtocol = protocol === "socks4" || protocol === "socks5";
  const username = isSocksProtocol ? "" : usernameInput.value.trim();
  const password = isSocksProtocol ? "" : passwordInput.value;
  const rememberPassword = isSocksProtocol ? false : rememberPasswordInput.checked;

  if (!host) return showError("Enter server address before saving.");
  if (normalizedPort == null) return showError("Enter a valid port (1-65535) before saving.");
  hideError();

  const data = await storageGet("savedProxies");
  const list = (data.savedProxies as SavedProxyConfig[] | undefined) || [];

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

  const savedProxy: SavedProxyConfig = {
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

  await loadSavedProxies();
});

// Saved proxies list.
async function loadSavedProxies(): Promise<void> {
  const data = await storageGet("savedProxies");
  const list = (data.savedProxies as SavedProxyConfig[] | undefined) || [];

  if (list.length === 0) {
    savedSection.style.display = "none";
    return;
  }

  savedSection.style.display = "";
  savedList.replaceChildren();

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
    delBtn.appendChild(createDeleteIcon());

    item.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".saved-item-delete")) return;
      syncProtocolSelect(proxy.protocol || "http");
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
  const lastConfig = data.lastConfig as SavedProxyConfig | undefined;
  if (lastConfig) {
    const { protocol, host, port, username, rememberPassword, password } = lastConfig;
    syncProtocolSelect(protocol || "http");
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

  setPasswordToggleIcon(icon, isPassword);
});

// Helpers.
function initProtocolSelect(): void {
  const initialProtocol = isProxyProtocol(protocolInput.value) ? protocolInput.value : "http";
  syncProtocolSelect(initialProtocol);

  protocolTrigger.addEventListener("click", () => {
    toggleProtocolMenu();
  });

  protocolOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const protocol = option.dataset.protocol;
      if (!isProxyProtocol(protocol)) {
        return;
      }

      syncProtocolSelect(protocol);
      closeProtocolMenu();
      updateAuthInputsState();
      updateDisconnectButtonMode();
    });
  });

  document.addEventListener("click", (event) => {
    if (!protocolSelect.contains(event.target as Node)) {
      closeProtocolMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeProtocolMenu();
    }
  });

  protocolTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProtocolMenu();
    }
  });
}

function syncProtocolSelect(protocol: ProxyProtocol): void {
  protocolInput.value = protocol;
  protocolLabel.textContent = PROTOCOL_LABELS[protocol];

  protocolOptions.forEach((option) => {
    const isSelected = option.dataset.protocol === protocol;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  });

  updateDisconnectButtonMode();
}

function openProtocolMenu(): void {
  protocolSelect.classList.add("is-open");
  protocolMenu.hidden = false;
  protocolTrigger.setAttribute("aria-expanded", "true");
}

function closeProtocolMenu(): void {
  protocolSelect.classList.remove("is-open");
  protocolMenu.hidden = true;
  protocolTrigger.setAttribute("aria-expanded", "false");
}

function toggleProtocolMenu(): void {
  if (protocolMenu.hidden) {
    openProtocolMenu();
    return;
  }

  closeProtocolMenu();
}

function isProxyProtocol(value: string | undefined): value is ProxyProtocol {
  return value === "http" || value === "https" || value === "quic" || value === "socks4" || value === "socks5";
}

function createDeleteIcon(): SVGSVGElement {
  const svg = createSvgElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
  }) as SVGSVGElement;

  svg.appendChild(createSvgElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }));
  svg.appendChild(createSvgElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }));
  return svg;
}

function setPasswordToggleIcon(icon: SVGElement, showMaskedIcon: boolean): void {
  const nextNodes = showMaskedIcon
    ? [
        createSvgElement("path", {
          d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94",
        }),
        createSvgElement("path", {
          d: "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19",
        }),
        createSvgElement("line", { x1: "1", y1: "1", x2: "23", y2: "23" }),
      ]
    : [
        createSvgElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
        createSvgElement("circle", { cx: "12", cy: "12", r: "3" }),
      ];

  icon.replaceChildren(...nextNodes);
}

function createSvgElement(name: string, attrs: Record<string, string>): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function showError(msg: string): void {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError(): void {
  errorMsg.style.display = "none";
}

function sendMessage<A extends RuntimeMessageAction>(
  message: RuntimeMessageByAction<A>
): Promise<RuntimeResponseByAction<A>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message as RuntimeMessage, (response: RuntimeResponseByAction<A> | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message || "Message channel failed",
        } as RuntimeResponseByAction<A>);
        return;
      }

      if (response) {
        resolve(response);
        return;
      }

      resolve({
        success: false,
        error: "No response from background",
      } as RuntimeResponseByAction<A>);
    });
  });
}

function isRuntimeError(response: RuntimeErrorResponse | ProxyStatus | { success: true }): response is RuntimeErrorResponse {
  return "success" in response && response.success === false;
}

function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => {
      resolve(items as Record<string, unknown>);
    });
  });
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
  const isSocksProtocol = protocolInput.value === "socks4" || protocolInput.value === "socks5";

  authSection.style.display = isSocksProtocol ? "none" : "";

  usernameInput.disabled = isSocksProtocol;
  passwordInput.disabled = isSocksProtocol;
  togglePassword.disabled = isSocksProtocol;
  rememberPasswordInput.disabled = isSocksProtocol;

  if (isSocksProtocol) {
    rememberPasswordInput.checked = false;
  }

  updateDisconnectButtonMode();
}

function initConfigChangeTracking(): void {
  const fieldInputs: Array<HTMLInputElement> = [
    hostInput,
    portInput,
    usernameInput,
    passwordInput,
  ];

  fieldInputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateDisconnectButtonMode();
    });
  });

  rememberPasswordInput.addEventListener("change", () => {
    updateDisconnectButtonMode();
  });
}

function getValidatedFormConfig(): {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
  rememberPassword: boolean;
} | null {
  const host = hostInput.value.trim();
  const portValue = portInput.value.trim();
  const port = normalizePort(portValue);
  const protocol = protocolInput.value as ProxyProtocol;
  const isSocksProtocol = protocol === "socks4" || protocol === "socks5";
  const username = isSocksProtocol ? "" : usernameInput.value.trim();
  const password = isSocksProtocol ? "" : passwordInput.value;
  const rememberPassword = isSocksProtocol ? false : rememberPasswordInput.checked;

  if (!host) {
    showError("Enter server address.");
    return null;
  }

  if (port == null) {
    showError("Enter a valid port (1-65535).");
    return null;
  }

  return {
    protocol,
    host,
    port,
    username,
    password,
    rememberPassword,
  };
}

function getCurrentFormConfig(): ActiveProxyFormConfig {
  const protocol = (isProxyProtocol(protocolInput.value) ? protocolInput.value : "http") as ProxyProtocol;
  const isSocksProtocol = protocol === "socks4" || protocol === "socks5";

  return {
    protocol,
    host: hostInput.value.trim(),
    port: normalizePort(portInput.value.trim()),
    username: isSocksProtocol ? "" : usernameInput.value.trim(),
    password: isSocksProtocol ? "" : passwordInput.value,
    rememberPassword: isSocksProtocol ? false : rememberPasswordInput.checked,
  };
}

function hasConfigChangesFromActiveSnapshot(): boolean {
  if (!activeProxySnapshot) {
    return false;
  }

  const current = getCurrentFormConfig();

  return (
    current.protocol !== activeProxySnapshot.protocol ||
    current.host !== activeProxySnapshot.host ||
    current.port !== activeProxySnapshot.port ||
    current.username !== activeProxySnapshot.username ||
    current.password !== activeProxySnapshot.password ||
    current.rememberPassword !== activeProxySnapshot.rememberPassword
  );
}

function setDisconnectButtonMode(mode: typeof DISCONNECT_MODE_OFF | typeof DISCONNECT_MODE_RELOAD): void {
  disconnectBtn.dataset.mode = mode;
  disconnectBtn.textContent = mode === DISCONNECT_MODE_RELOAD ? "Reload" : "Turn off";
}

function updateDisconnectButtonMode(): void {
  if (!isProxyConnected) {
    setDisconnectButtonMode(DISCONNECT_MODE_OFF);
    return;
  }

  setDisconnectButtonMode(hasConfigChangesFromActiveSnapshot() ? DISCONNECT_MODE_RELOAD : DISCONNECT_MODE_OFF);
}

