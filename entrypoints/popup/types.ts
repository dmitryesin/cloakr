import type { ProxyProtocol } from "../shared/messages";

export type { ProxyProtocol };

export const MAX_SAVED_PROXIES = 30;

export const PROTOCOL_LABELS: Record<ProxyProtocol, string> = {
  http: "HTTP",
  https: "HTTPS",
  quic: "QUIC",
  socks4: "SOCKS4",
  socks5: "SOCKS5",
};

export const DISCONNECT_MODE_OFF = "off";
export const DISCONNECT_MODE_RELOAD = "reload";

export type SavedProxyConfig = {
  protocol?: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
  id?: number;
};

export type ActiveProxyFormConfig = {
  protocol: ProxyProtocol;
  host: string;
  port: number | null;
  username: string;
  password: string;
  rememberPassword: boolean;
};
