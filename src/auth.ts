import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
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
    "No authentication tokens found. Run `npx @m4ykeldev/notebooklm-mcp auth` to authenticate, " +
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

function readLineFromStdin(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "linux") {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    } else if (platform === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else if (platform === "win32") {
      execSync(`start "" "${url}"`, { stdio: "ignore" });
    }
  } catch {
    console.log(`Could not open browser automatically. Open this URL manually:\n${url}`);
  }
}

export async function runAuthFlow(): Promise<AuthTokens> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         NotebookLM MCP — Authentication Setup          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("Opening NotebookLM in your browser...\n");
  openInBrowser(BASE_URL);

  console.log("Follow these steps:\n");
  console.log("  1. NotebookLM should open in your browser (you're already logged in)");
  console.log("  2. Press F12 to open DevTools");
  console.log("  3. Go to the Network tab");
  console.log("  4. Type 'batchexecute' in the filter box");
  console.log("  5. Click on any request that appears in the list");
  console.log("  6. In the Headers panel, find 'cookie:' under Request Headers");
  console.log("  7. Right-click the cookie value → Copy value\n");
  console.log("  Tip: If no requests appear, refresh the page (F5) with DevTools open.\n");

  const cookieStr = await readLineFromStdin("Paste the cookie value here: ");

  if (!cookieStr) {
    throw new Error("No cookie string provided.");
  }

  const cookies = parseCookieString(cookieStr);

  if (!validateCookies(cookies)) {
    console.log("\n❌ Missing required cookies.");
    console.log(`   Need: ${REQUIRED_COOKIES.join(", ")}`);
    console.log(`   Got:  ${Object.keys(cookies).join(", ")}`);
    throw new Error("Invalid cookie string. Make sure you copied the full cookie value.");
  }

  const tokens: AuthTokens = {
    cookies,
    csrf_token: "",
    session_id: "",
    extracted_at: Date.now() / 1000,
  };

  saveTokens(tokens);

  console.log(`\n✅ Authentication saved successfully!`);
  console.log(`   ${Object.keys(cookies).length} cookies extracted`);
  console.log(`   Stored in: ~/.notebooklm-mcp/auth.json`);
  console.log(`\n   CSRF token and session ID will be auto-extracted on first use.`);

  return tokens;
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
