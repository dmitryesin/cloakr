export const hostInput = document.getElementById("host") as HTMLInputElement;
export const portInput = document.getElementById("port") as HTMLInputElement;
export const protocolInput = document.getElementById("protocol") as HTMLInputElement;
export const protocolSelect = document.getElementById("protocolSelect") as HTMLDivElement;
export const protocolTrigger = document.getElementById("protocolTrigger") as HTMLButtonElement;
export const protocolMenu = document.getElementById("protocolMenu") as HTMLDivElement;
export const protocolLabel = document.getElementById("protocolLabel") as HTMLSpanElement;
export const protocolOptions = Array.from(
  document.querySelectorAll(".protocol-option")
) as HTMLButtonElement[];
export const usernameInput = document.getElementById("username") as HTMLInputElement;
export const passwordInput = document.getElementById("password") as HTMLInputElement;
export const rememberPasswordInput = document.getElementById("rememberPassword") as HTMLInputElement;
export const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
export const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;
export const retryStatusBtn = document.getElementById("retryStatusBtn") as HTMLButtonElement;
export const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
export const errorMsg = document.getElementById("errorMsg") as HTMLDivElement;
export const authSection = document.getElementById("authSection") as HTMLDivElement;
export const togglePassword = document.getElementById("togglePassword") as HTMLButtonElement;
export const savedSection = document.getElementById("savedSection") as HTMLDivElement;
export const savedList = document.getElementById("savedList") as HTMLDivElement;
