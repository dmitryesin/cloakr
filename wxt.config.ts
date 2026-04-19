import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Cloakr",
    version: "1.0.0",
    description: "Easily manage SOCKS5, HTTP, and HTTPS proxy settings in Chrome",
    manifest_version: 3,
    permissions: ["proxy", "storage", "tabs", "webRequest", "webRequestAuthProvider"],
    host_permissions: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"],
    action: {
      default_popup: "popup.html",
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "96": "icons/icon96.png",
        "128": "icons/icon128.png"
      }
    },
    icons: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "96": "icons/icon96.png",
      "128": "icons/icon128.png"
    }
  }
});