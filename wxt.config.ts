import { defineConfig } from "wxt";

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Cloakr",
    version: "0.1.0",
    version_name: "0.1.0-beta.1",
    description: "Easily manage proxy settings in Chrome, including SOCKS5 support",
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