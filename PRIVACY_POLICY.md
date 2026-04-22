# Privacy Policy for Cloakr Browser Extension

**Last Updated:** April 22, 2026

## Overview

Cloakr is a Chrome extension for configuring and switching proxy settings. Cloakr processes proxy settings and credentials locally in your browser profile and does not send this data to our servers.

## 1. Data We Process

When you use Cloakr, the extension may store the following data locally on your device:
- Proxy server address (host/IP)
- Proxy server port
- Proxy protocol
- Optional proxy username
- Optional proxy password
- Saved proxy presets
- Proxy enabled/disabled state

## 2. How Data Is Used

This data is used only to:
- Apply proxy settings in Chrome
- Handle proxy authentication challenges
- Restore your saved proxy configuration
- Show current status in the extension UI

## 3. Where Data Is Stored

Cloakr uses Chrome storage APIs:
- `chrome.storage.local` for saved settings and optional saved password
- `chrome.storage.session` for active session credentials

All storage is local to your browser profile. Cloakr does not run a backend service and does not transmit your proxy configuration data to us.

## 4. Password Notice

If you choose to save a proxy password, it is stored locally in browser extension storage.

## 5. Data Sharing and Tracking

Cloakr does not:
- Sell your data
- Share your data with advertisers or analytics providers
- Track browsing activity for analytics
- Send telemetry to external servers operated by us

## 6. Permissions Used

### Extension Permissions

| Permission | Why It Is Needed |
|-----------|-------------------|
| `proxy` | Apply proxy settings in Chrome |
| `storage` | Save and restore proxy configuration |
| `tabs` | Reload the active tab after proxy changes |
| `webRequest` | Listen for proxy authentication challenges |
| `webRequestAuthProvider` | Provide credentials for proxy authentication |

### Host Permissions

| Host Permission | Why It Is Needed |
|----------------|-------------------|
| `http://*/*` | Handle proxy auth on HTTP traffic |
| `https://*/*` | Handle proxy auth on HTTPS traffic |
| `ws://*/*` | Handle proxy auth on WebSocket traffic |
| `wss://*/*` | Handle proxy auth on secure WebSocket traffic |

## 7. Data Retention and Deletion

You can remove Cloakr data by:
1. Deleting saved presets in the extension UI
2. Uninstalling the extension (Chrome removes extension storage)

Session credentials stored in `chrome.storage.session` are temporary and are cleared by Chrome when the session ends.

## 8. Changes to This Policy

We may update this policy from time to time. Any update will be reflected by changing the "Last Updated" date.

## 9. Contact

If you have any questions, comments, or suggestions about this Privacy Policy, please feel free to contact us.
