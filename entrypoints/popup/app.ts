import { isRuntimeError, sendMessage, storageGet, storageSet } from "./api";
import {
  authSection,
  connectBtn,
  disconnectBtn,
  errorMsg,
  hostInput,
  networkLockMessage,
  networkLockOverlay,
  passwordInput,
  popupApp,
  portInput,
  protocolInput,
  protocolLabel,
  protocolMenu,
  protocolOptions,
  protocolSelect,
  protocolTrigger,
  rememberPasswordInput,
  retryStatusBtn,
  saveBtn,
  savedList,
  savedSection,
  statusBadge,
  togglePassword,
  usernameInput,
} from "./dom";
import { getCurrentFormConfig, getValidatedFormConfig, isProxyProtocol, normalizePort } from "./form";
import { createDeleteIcon, setPasswordToggleIcon } from "./icons";
import {
  ActiveProxyFormConfig,
  DISCONNECT_MODE_OFF,
  DISCONNECT_MODE_RELOAD,
  MAX_SAVED_PROXIES,
  PROTOCOL_LABELS,
  ProxyProtocol,
  SavedProxyConfig,
} from "./types";

let isProxyConnected = false;
let activeProxySnapshot: ActiveProxyFormConfig | null = null;

export function initPopupApp(): void {
  document.addEventListener("DOMContentLoaded", async () => {
    initProtocolSelect();
    initConfigChangeTracking();
    initEventHandlers();
    initProxySettingsChangeTracking();

    void loadSavedProxies();
    await loadLastConfig();
    await refreshStatus();
    updateAuthInputsState();
  });
}

function initEventHandlers(): void {
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

  connectBtn.addEventListener("click", async () => {
    hideError();

    const config = getValidatedFormConfig(showError);
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

      const config = getValidatedFormConfig(showError);
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

  togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    const icon = togglePassword.querySelector("svg");
    if (!icon) return;

    setPasswordToggleIcon(icon, isPassword);
  });
}

async function refreshStatus(): Promise<void> {
  const statusResponse = await sendMessage({ action: "getStatus" });
  if (isRuntimeError(statusResponse)) {
    setStatusUnavailableUI(statusResponse.error);
    return;
  }

  const { enabled, config, lockReason } = statusResponse;

  if (lockReason === "external_proxy_active") {
    setNetworkLockedUI();
    return;
  }

  if (enabled && config) {
    setConnectedUI();
  } else {
    setDisconnectedUI();
  }
}

function setConnectedUI(): void {
  clearNetworkLockUI();
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
  clearNetworkLockUI();
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

function setNetworkLockedUI(): void {
  document.body.classList.add("is-network-locked");
  popupApp.inert = true;
  popupApp.setAttribute("aria-hidden", "true");
  networkLockOverlay.hidden = false;
  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur();
  networkLockOverlay.focus();
  networkLockMessage.textContent =
    "Another extension is currently controlling network settings. Turn off that extension's proxy to use Cloakr.";
  isProxyConnected = false;
  activeProxySnapshot = null;
  hideError();
  statusBadge.textContent = "LOCK";
  statusBadge.className = "status-badge status-error";
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "none";
  retryStatusBtn.style.display = "none";
}

function clearNetworkLockUI(): void {
  document.body.classList.remove("is-network-locked");
  popupApp.inert = false;
  popupApp.removeAttribute("aria-hidden");
  networkLockOverlay.hidden = true;
  networkLockMessage.textContent = "";
}

function setStatusUnavailableUI(reason?: string): void {
  clearNetworkLockUI();
  statusBadge.textContent = "ERR";
  statusBadge.className = "status-badge status-error";
  connectBtn.style.display = "none";
  disconnectBtn.style.display = "none";
  retryStatusBtn.style.display = "";

  if (reason) {
    showError(`Could not read proxy status: ${reason}`);
  }
}

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

    item.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest(".saved-item-delete")) return;
      syncProtocolSelect(proxy.protocol || "http");
      hostInput.value = proxy.host;
      portInput.value = String(proxy.port);
      usernameInput.value = proxy.username || "";
      const isRemembered = Boolean(proxy.rememberPassword && proxy.password);
      rememberPasswordInput.checked = isRemembered;
      passwordInput.value = isRemembered ? proxy.password || "" : "";
      updateAuthInputsState();
    });

    delBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
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
  const fieldInputs: Array<HTMLInputElement> = [hostInput, portInput, usernameInput, passwordInput];

  fieldInputs.forEach((input) => {
    input.addEventListener("input", () => {
      updateDisconnectButtonMode();
    });
  });

  rememberPasswordInput.addEventListener("change", () => {
    updateDisconnectButtonMode();
  });
}

function initProxySettingsChangeTracking(): void {
  try {
    chrome.proxy.settings.onChange.addListener(() => {
      void refreshStatus();
    });
  } catch {
    // Popup still works without live proxy change notifications.
  }
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

function showError(msg: string): void {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError(): void {
  errorMsg.style.display = "none";
}
