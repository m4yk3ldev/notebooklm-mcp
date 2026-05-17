import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Readable } from "node:stream";
import WebSocket from "ws";
import type { AuthTokens } from "./types.js";
import { BASE_URL, REQUIRED_COOKIES } from "./constants.js";
import { validateCookies, saveTokens } from "./auth.js";

// Bind exclusively to loopback. Without --remote-debugging-address Chrome
// may listen on 0.0.0.0 on some platforms (notably WSL2), exposing the
// DevTools Protocol — and the live Google session — to anyone on the LAN.
const CDP_HOST = "127.0.0.1";

// Default DevTools-port discovery timeout. Chrome usually prints
// "DevTools listening on ..." within ~1s on a warm profile, ~3s cold.
const PORT_DISCOVERY_TIMEOUT_MS = 10_000;

export function findChrome(): string | null {
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    );
  } else if (process.platform === "linux") {
    candidates.push(
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  } else if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
    );
  }

  for (const candidate of candidates) {
    try {
      const cmd =
        process.platform === "win32"
          ? `"${candidate}" --version`
          : `"${candidate}" --version`;
      execSync(cmd, { stdio: "ignore" });
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}

async function getDebuggerUrl(port: number): Promise<string> {
  const maxRetries = 20;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://${CDP_HOST}:${port}/json/list`);
      if (response.ok) {
        const data = (await response.json()) as any[];
        if (Array.isArray(data)) {
          const notebookTab = data.find(
            (target) =>
              target?.type === "page" &&
              typeof target?.url === "string" &&
              target.url.startsWith(BASE_URL) &&
              typeof target?.webSocketDebuggerUrl === "string",
          );
          if (notebookTab) return notebookTab.webSocketDebuggerUrl;

          const firstPage = data.find(
            (target) =>
              target?.type === "page" &&
              typeof target?.webSocketDebuggerUrl === "string",
          );
          if (firstPage) return firstPage.webSocketDebuggerUrl;
        }
      }
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Could not connect to Chrome remote debugging port.");
}

// Read Chrome's stderr until we see the "DevTools listening on ws://..."
// line, then return the port. Lets us launch with --remote-debugging-port=0
// (OS-assigned) instead of a hardcoded port, removing the fixed-port
// race / squat risk where another process on the host could pre-bind 9229
// and impersonate Chrome.
export async function discoverDevtoolsPort(
  stderr: Readable,
  timeoutMs: number = PORT_DISCOVERY_TIMEOUT_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const re = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//;
    let buf = "";
    const timer = setTimeout(() => {
      stderr.off("data", onData);
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for Chrome to print its DevTools URL.`,
        ),
      );
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const m = re.exec(buf);
      if (m) {
        clearTimeout(timer);
        stderr.off("data", onData);
        resolve(Number(m[1]));
      }
    };
    stderr.on("data", onData);
  });
}

export interface LaunchedChrome {
  proc: ChildProcess;
  port: number;
}

export async function launchChrome(headless: boolean): Promise<LaunchedChrome> {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      "Could not find Google Chrome or Chromium. Please use manual auth.",
    );
  }

  const userDataDir = join(homedir(), ".notebooklm-mcp", "chrome-profile");
  mkdirSync(userDataDir, { recursive: true, mode: 0o700 });

  const args = [
    // Port 0 → OS assigns an ephemeral port; address pinned to loopback.
    "--remote-debugging-port=0",
    `--remote-debugging-address=${CDP_HOST}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    BASE_URL,
  ];

  if (headless) {
    args.push("--headless=new");
  }

  const proc = spawn(chromePath, args, {
    detached: true,
    // Capture stderr so we can read the DevTools port line; stdout/stdin ignored.
    stdio: ["ignore", "ignore", "pipe"],
  });
  proc.unref();

  if (!proc.stderr) {
    proc.kill();
    throw new Error(
      "Chrome process did not expose stderr; cannot discover DevTools port.",
    );
  }

  try {
    const port = await discoverDevtoolsPort(proc.stderr);
    return { proc, port };
  } catch (err) {
    proc.kill();
    throw err;
  }
}

async function extractCookiesViaCDP(
  timeoutMs: number,
  showProgress: boolean,
  port: number,
): Promise<AuthTokens> {
  const wsUrl = await getDebuggerUrl(port);
  const ws = new WebSocket(wsUrl);

  return new Promise((resolve, reject) => {
    let messageId = 0;
    let timer: NodeJS.Timeout;
    let globalTimeout: NodeJS.Timeout;
    let lastCdpError: string | null = null;
    let lastExtractedTokens: AuthTokens | null = null;

    const cleanup = () => {
      clearInterval(timer);
      clearTimeout(globalTimeout);
      ws.close();
    };

    const send = (method: string, params: any = {}) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: ++messageId, method, params }));
      }
    };

    globalTimeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          lastCdpError
            ? `Authentication timed out after ${timeoutMs / 1000}s (CDP error: ${lastCdpError}).`
            : `Authentication timed out after ${timeoutMs / 1000}s.`,
        ),
      );
    }, timeoutMs);

    ws.on("open", () => {
      // Enable runtime to allow JS evaluation
      send("Runtime.enable", {});
      
      // Wait a bit for initial page load
      setTimeout(() => {
        timer = setInterval(() => {
          send("Storage.getCookies", {});
        }, 2000);
      }, 5000);
    });

    ws.on("close", () => {
      cleanup();
      reject(
        new Error(
          "Browser connection closed before authentication was complete.",
        ),
      );
    });

    ws.on("error", (err) => {
      cleanup();
      reject(err);
    });

    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.error) {
          lastCdpError = response.error.message || JSON.stringify(response.error);
          return;
        }
        if (response.result && response.result.cookies) {
          const cookies: Record<string, string> = {};
          for (const c of response.result.cookies) {
            cookies[c.name] = c.value;
          }

          if (validateCookies(cookies)) {
            // Cookies look complete — but verify we're actually ON NotebookLM
            // (not on accounts.google.com login/chooser page)
            send("Runtime.evaluate", {
              expression: `JSON.stringify({
                href: window.location.href,
                csrf: (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) || null,
                sid: (window.WIZ_global_data && window.WIZ_global_data.FdrFJe) || null,
                bl: (window.WIZ_global_data && window.WIZ_global_data.cfb2h) || null
              })`
            });

            const tokens: AuthTokens = {
              cookies,
              csrf_token: "",
              session_id: "",
              extracted_at: Date.now() / 1000,
            };

            lastExtractedTokens = tokens;
          } else if (showProgress) {
            process.stderr.write(".");
          }
        }

        if (response.result?.result?.value && lastExtractedTokens) {
          try {
            const data = JSON.parse(response.result.result.value);
            // Only resolve if we're actually on NotebookLM — not the login page
            if (!data.href || !data.href.startsWith("https://notebooklm.google.com")) {
              // Still on Google login/chooser — reset and keep polling
              lastExtractedTokens = null;
              if (showProgress) process.stderr.write("🔑");
              return;
            }
            lastExtractedTokens.csrf_token = data.csrf || "";
            lastExtractedTokens.session_id = data.sid || "";
            lastExtractedTokens.bl = data.bl || "";
            saveTokens(lastExtractedTokens);
            cleanup();
            resolve(lastExtractedTokens);
          } catch (e) {
            // ignore parse errors
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    });
  });
}

export async function refreshCookiesHeadless(): Promise<AuthTokens> {
  console.error("🔄 Attempting background session refresh...");
  // Use non-headless to avoid Google's detection of automated environments
  const { proc, port } = await launchChrome(false);

  try {
    const tokens = await extractCookiesViaCDP(30000, true, port);
    console.error("✅ Background refresh successful.");
    return tokens;
  } finally {
    proc.kill();
  }
}

export async function runBrowserAuthFlow(): Promise<AuthTokens> {
  console.error("✨ Initializing Smart Authentication... (Setting up a secure session)");
  console.error(
    "   (A dedicated profile will be used at ~/.notebooklm-mcp/chrome-profile)",
  );

  const { proc, port } = await launchChrome(false);

  try {
    console.error("\n🔓 Ready for login! If you're already signed into Google, we'll handle the rest automatically.\n");

    const tokens = await extractCookiesViaCDP(120000, true, port);
    console.error("\n✅ Connection secured! Your NotebookLM session is now synchronized.");
    return tokens;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Smart Auth failed: ${error.message}\nTry manual auth instead.`,
      );
    }
    throw error;
  } finally {
    proc.kill();
  }
}
