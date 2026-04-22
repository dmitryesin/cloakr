import {
  hostInput,
  passwordInput,
  portInput,
  protocolInput,
  rememberPasswordInput,
  usernameInput,
} from "./dom";
import type { ActiveProxyFormConfig, ProxyProtocol } from "./types";

export function isProxyProtocol(value: string | undefined): value is ProxyProtocol {
  return value === "http" || value === "https" || value === "quic" || value === "socks4" || value === "socks5";
}

export function normalizePort(value: string | number): number | null {
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

export function getValidatedFormConfig(showError: (msg: string) => void): {
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

export function getCurrentFormConfig(): ActiveProxyFormConfig {
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
