# Cloakr - Proxy Manager for Chrome

A lightweight, open-source Chrome extension for managing proxy configurations with support for multiple protocols, including SOCKS5, and proxy authentication.

## Installation

<!-- ### From Chrome Web Store
1. Visit [Cloakr on Chrome Web Store]()
2. Click "Add to Chrome"
3. Confirm the installation -->

### Manual Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/dmitryesin/cloakr
   cd cloakr
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top-right corner)
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3-prod` directory

## Usage

### Basic Setup

1. **Open Cloakr** by clicking the extension icon
2. **Select Protocol**
3. **Enter Proxy Details**:
   - Server: Your proxy server IP or domain
   - Port: Proxy server port
4. **Add Credentials** (optional):
   - Username (optional, required if proxy needs authentication)
   - Password (optional)
   - Remember Password (stores password locally)
5. **Click "Turn on"** to activate the proxy

## Development

### Project Structure

```
cloakr/
├── entrypoints/
│   ├── background.ts          # Service worker
│   ├── popup/
│   │   ├── index.html         # Popup UI
│   │   ├── main.ts            # Popup logic
│   │   └── style.css          # Popup styling
│   └── shared/
│       └── messages.ts        # Type definitions
├── public/
│   └── icons/                 # Extension icons
├── wxt.config.ts              # Extension configuration
├── tsconfig.json              # TypeScript config
└── package.json               # Dependencies
```

### Tech Stack

- **Framework:** WXT
- **Language:** TypeScript
- **Styling:** Vanilla CSS
- **Chrome API:** Manifest V3

## Configuration

### Extension Permissions

Cloakr requests the following permissions:

| Permission | Purpose |
|-----------|---------|
| `proxy` | Apply proxy settings to Chrome |
| `storage` | Save proxy configurations locally |
| `tabs` | Reload current tab when proxy changes |
| `webRequest` | Handle proxy authentication challenges |
| `webRequestAuthProvider` | Provide credentials for proxy authentication requests |

All data stays local. We don't use these permissions to collect or transmit data.

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

<!-- ## Privacy Policy & Terms

- [Privacy Policy](./PRIVACY_POLICY.md)
- [Terms of Service](./TERMS_OF_SERVICE.md) -->
