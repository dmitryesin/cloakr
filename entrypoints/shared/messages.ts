export type ProxyProtocol = "http" | "https" | "quic" | "socks4" | "socks5";

export type ProxyConfig = {
  protocol?: ProxyProtocol;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
};

export type ProxyStatus = {
  enabled: boolean;
  config: {
    scheme?: ProxyProtocol;
    host?: string;
    port?: number;
  } | null;
  lockReason?: "external_proxy_active";
};

export type RuntimeErrorResponse = {
  success: false;
  error: string;
};

export type RuntimeOkResponse = {
  success: true;
};

export type RuntimeMessage =
  | { action: "setProxy"; config: ProxyConfig }
  | { action: "clearProxy" }
  | { action: "getStatus" }
  | { action: "reloadCurrentTab" };

export type RuntimeMessageAction = RuntimeMessage["action"];

export type RuntimeMessageByAction<A extends RuntimeMessageAction> = Extract<
  RuntimeMessage,
  { action: A }
>;

export type RuntimeResponseMap = {
  setProxy: RuntimeOkResponse | RuntimeErrorResponse;
  clearProxy: RuntimeOkResponse | RuntimeErrorResponse;
  getStatus: ProxyStatus | RuntimeErrorResponse;
  reloadCurrentTab: RuntimeOkResponse | RuntimeErrorResponse;
};

export type RuntimeResponseByAction<A extends RuntimeMessageAction> = RuntimeResponseMap[A];

export type RuntimeResponse = RuntimeResponseMap[RuntimeMessageAction];
