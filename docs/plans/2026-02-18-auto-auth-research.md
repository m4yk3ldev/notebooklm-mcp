# Auto-Auth Research: Browser Cookie Extraction

> **Status:** Pending investigation
> **Goal:** Eliminate manual cookie copy/paste from the auth flow

## Problem

Current auth requires the user to open DevTools, find the cookie header, copy it, and paste it in the terminal. This is friction that most users won't tolerate.

## Options Investigated

### Option 1: Read cookies from Chrome's SQLite DB (Recommended)

- Chrome stores cookies in SQLite at:
  - Linux: `~/.config/google-chrome/Default/Cookies`
  - macOS: `~/Library/Application Support/Google/Chrome/Default/Cookies`
  - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies`
- Since Chrome 80+, cookie values are encrypted:
  - Linux: DPAPI via GNOME Keyring / KWallet (AES-128-CBC, key from `Chrome Safe Storage`)
  - macOS: Keychain (`Chrome Safe Storage` entry, AES-128-CBC)
  - Windows: DPAPI (`CryptUnprotectData`)
- npm packages to investigate:
  - `chrome-cookies-secure` — reads and decrypts Chrome cookies per OS
  - `tough-cookie` + custom decryption
  - Direct SQLite + OS keyring integration
- **Pros:** Zero user interaction if already logged in
- **Cons:** OS-specific decryption, needs native dependencies (SQLite, keyring access), may break with Chrome updates

### Option 2: Puppeteer/Playwright with user's Chrome profile

- Launch browser using user's existing profile (already logged into Google)
- Navigate to NotebookLM, extract cookies via CDP
- **Pros:** Reliable cookie extraction, handles all cookie types
- **Cons:** Profile lock if Chrome is already running, copying profile is heavy (GBs), adds large dependency (Puppeteer ~400MB)

### Option 3: Connect to running Chrome via CDP

- User launches Chrome with `--remote-debugging-port=9222`
- Connect via `chrome-remote-interface`, extract cookies from running session
- **Pros:** No profile copy needed, lightweight
- **Cons:** Requires user to restart Chrome with special flag — still friction

## Next Steps

1. Test `chrome-cookies-secure` package:
   - Does it work on Linux with current Chrome?
   - What native dependencies does it require?
   - Can it read `.google.com` domain cookies?
2. If `chrome-cookies-secure` doesn't work, investigate direct SQLite + keyring approach:
   - `better-sqlite3` for reading the DB
   - `secret-service` or `keytar` for keyring access on Linux
   - Decryption with Node.js `crypto` module
3. Prototype Option 1 and test with real NotebookLM cookies
4. Consider fallback chain: auto-extract → manual paste (current flow)

## Required Cookies

- `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`
- Domain: `.google.com`

## References

- Chromium cookie encryption source: `components/os_crypt/`
- Chrome cookie DB schema: `cookies` table with `host_key`, `name`, `encrypted_value` columns
- DPAPI key derivation: PBKDF2 with `Chrome Safe Storage` password from keyring, 1 iteration, 16-byte key
