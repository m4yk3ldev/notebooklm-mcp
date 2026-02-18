import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { AuthTokens } from "./types.js";
import { REQUIRED_COOKIES, BASE_URL } from "./constants.js";

const CONFIG_DIR = join(homedir(), ".notebooklm-mcp");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");
const CHROME_PROFILE = join(CONFIG_DIR, "chrome-profile");

export function validateCookies(cookies: Record<string, string>): boolean {
  return REQUIRED_COOKIES.every((name) => name in cookies);
}

export function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export function extractCsrfFromPage(html: string): string | null {
  const patterns = [
    /"SNlM0e":"([^"]+)"/,
    /at=([^&"]+)/,
    /"FdrFJe":"([^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function extractSessionIdFromPage(html: string): string | null {
  const patterns = [/"FdrFJe":"([^"]+)"/, /f\.sid=(\d+)/];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function saveTokens(tokens: AuthTokens): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

export function loadTokensFromCache(): AuthTokens | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    if (data.cookies && validateCookies(data.cookies)) {
      return {
        cookies: data.cookies,
        csrf_token: data.csrf_token || "",
        session_id: data.session_id || "",
        extracted_at: data.extracted_at || 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadTokensFromEnv(): AuthTokens | null {
  const cookieStr = process.env.NOTEBOOKLM_COOKIES;
  if (!cookieStr) return null;

  const cookies: Record<string, string> = {};
  for (const part of cookieStr.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }

  if (!validateCookies(cookies)) return null;

  return {
    cookies,
    csrf_token: process.env.NOTEBOOKLM_CSRF_TOKEN || "",
    session_id: process.env.NOTEBOOKLM_SESSION_ID || "",
    extracted_at: Date.now() / 1000,
  };
}

export function loadTokens(): AuthTokens {
  const fromEnv = loadTokensFromEnv();
  if (fromEnv) return fromEnv;

  const fromCache = loadTokensFromCache();
  if (fromCache) return fromCache;

  throw new Error(
    "No authentication tokens found. Run `notebooklm-mcp auth` to authenticate, " +
      "or set NOTEBOOKLM_COOKIES environment variable.",
  );
}

function parseCookieString(raw: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const part of trimmed.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) {
        cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      }
    }
  }
  return cookies;
}

export async function runFileImport(filePath?: string): Promise<AuthTokens> {
  if (!filePath) {
    console.log(`
To authenticate via file:
1. Open Chrome and navigate to https://notebooklm.google.com
2. Open DevTools (F12) > Network tab
3. Type "batchexecute" in the filter
4. Click on any batchexecute request
5. Find "cookie:" in Request Headers
6. Copy the full cookie VALUE (not the header name)
7. Save to a file and provide the path
`);
    throw new Error("Provide a cookie file path with --file <path>");
  }

  const raw = readFileSync(filePath, "utf-8");
  const cookies = parseCookieString(raw);

  if (!validateCookies(cookies)) {
    throw new Error(
      `Missing required cookies. Need: ${REQUIRED_COOKIES.join(", ")}`,
    );
  }

  const tokens: AuthTokens = {
    cookies,
    csrf_token: "",
    session_id: "",
    extracted_at: Date.now() / 1000,
  };

  saveTokens(tokens);
  console.log("Authentication tokens saved successfully.");
  return tokens;
}

export async function runAuthFlow(port = 9222): Promise<AuthTokens> {
  let chromeLauncher: any;
  let CDP: any;

  try {
    chromeLauncher = await import("chrome-launcher");
    CDP = await import("chrome-remote-interface");
  } catch {
    throw new Error(
      "chrome-launcher or chrome-remote-interface not available. " +
        "Install them or use --file mode instead.",
    );
  }

  console.log("Launching Chrome for authentication...");
  console.log("Please close any existing Chrome windows first.\n");

  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${CHROME_PROFILE}`,
      "--remote-allow-origins=*",
    ],
    startingUrl: BASE_URL,
  });

  try {
    // Wait for Chrome to start
    await new Promise((r) => setTimeout(r, 3000));

    const client = await (CDP as any)({ port });
    const { Network, Page, Runtime } = client;

    await Network.enable();
    await Page.enable();
    await Runtime.enable();

    // Navigate to NotebookLM
    await Page.navigate({ url: BASE_URL });
    await Page.loadEventFired();

    // Check if logged in
    const { result: urlResult } = await Runtime.evaluate({
      expression: "window.location.href",
    });
    const currentUrl = urlResult.value as string;

    if (
      currentUrl.includes("accounts.google.com") ||
      !currentUrl.includes("notebooklm.google.com")
    ) {
      console.log(
        "\nPlease sign in to your Google account in the Chrome window.",
      );
      console.log("Waiting for login (up to 5 minutes)...\n");

      // Poll for login
      const maxWait = 300_000;
      const pollInterval = 5_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const { result: checkResult } = await Runtime.evaluate({
          expression: "window.location.href",
        });
        const url = checkResult.value as string;
        if (
          url.includes("notebooklm.google.com") &&
          !url.includes("accounts.google.com")
        ) {
          console.log("Login detected!");
          // Wait for page to fully load
          await new Promise((r) => setTimeout(r, 3000));
          break;
        }
      }
    }

    // Extract cookies
    const { cookies: chromeCookies } = await Network.getCookies({
      urls: [BASE_URL],
    });

    const cookies: Record<string, string> = {};
    for (const cookie of chromeCookies) {
      cookies[cookie.name] = cookie.value;
    }

    if (!validateCookies(cookies)) {
      throw new Error(
        "Could not extract required cookies. Make sure you're logged in.",
      );
    }

    // Extract CSRF token and session ID from page
    const { result: htmlResult } = await Runtime.evaluate({
      expression: "document.documentElement.outerHTML",
    });
    const html = htmlResult.value as string;

    const csrfToken = extractCsrfFromPage(html) || "";
    const sessionId = extractSessionIdFromPage(html) || "";

    await client.close();

    const tokens: AuthTokens = {
      cookies,
      csrf_token: csrfToken,
      session_id: sessionId,
      extracted_at: Date.now() / 1000,
    };

    saveTokens(tokens);
    console.log("\nAuthentication tokens saved successfully.");
    console.log(
      `Extracted ${Object.keys(cookies).length} cookies, CSRF: ${csrfToken ? "yes" : "no"}, Session: ${sessionId ? "yes" : "no"}`,
    );

    return tokens;
  } finally {
    await chrome.kill();
  }
}

export function showTokens(): void {
  const tokens = loadTokensFromCache();
  if (!tokens) {
    console.log("No cached tokens found.");
    return;
  }

  const cookieNames = Object.keys(tokens.cookies);
  const hasRequired = REQUIRED_COOKIES.every((c) => cookieNames.includes(c));
  const age = tokens.extracted_at
    ? Math.round((Date.now() / 1000 - tokens.extracted_at) / 3600)
    : "unknown";

  console.log(`Cached tokens:`);
  console.log(`  Cookies: ${cookieNames.length} (${cookieNames.join(", ")})`);
  console.log(`  Required cookies present: ${hasRequired ? "yes" : "NO"}`);
  console.log(`  CSRF token: ${tokens.csrf_token ? "present" : "missing"}`);
  console.log(`  Session ID: ${tokens.session_id ? "present" : "missing"}`);
  console.log(`  Age: ${age} hours`);
  console.log(`  File: ${AUTH_FILE}`);
}
