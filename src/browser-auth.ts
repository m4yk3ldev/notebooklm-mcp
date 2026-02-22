import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import WebSocket from "ws";
import type { AuthTokens } from "./types.js";
import {
  BASE_URL,
  REQUIRED_COOKIES,
} from "./constants.js";
import {
  validateCookies,
  saveTokens,
} from "./auth.js";

const CDP_PORT = 9229;

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
      const cmd = process.platform === "win32" ? `"${candidate}" --version` : `"${candidate}" --version`;
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
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) {
        const data = await response.json() as any;
        return data.webSocketDebuggerUrl;
      }
    } catch {
      // wait and retry
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Could not connect to Chrome remote debugging port.");
}

export async function runBrowserAuthFlow(): Promise<AuthTokens> {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Could not find Google Chrome or Chromium. Please use manual auth.");
  }

  const userDataDir = join(homedir(), ".notebooklm-mcp", "chrome-profile");
  mkdirSync(userDataDir, { recursive: true });

  console.log("🚀 Launching Chrome for Smart Authentication...");
  console.log("   (A dedicated profile will be used at ~/.notebooklm-mcp/chrome-profile)");
  
  const chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    BASE_URL,
  ], { detached: true, stdio: "ignore" });

  chromeProcess.unref();

  try {
    const wsUrl = await getDebuggerUrl(CDP_PORT);
    const ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      let messageId = 0;
      const send = (method: string, params: any = {}) => {
        ws.send(JSON.stringify({ id: ++messageId, method, params }));
      };

      ws.on("open", () => {
        send("Network.enable");
        // Poll every 2 seconds
        const timer = setInterval(() => {
          send("Network.getCookies", { urls: [BASE_URL, "https://google.com"] });
        }, 2000);

        ws.on("close", () => {
          clearInterval(timer);
          reject(new Error("Browser connection closed before authentication was complete."));
        });
      });

      ws.on("message", (data) => {
        const response = JSON.parse(data.toString());
        if (response.result && response.result.cookies) {
          const cookies: Record<string, string> = {};
          for (const c of response.result.cookies) {
            cookies[c.name] = c.value;
          }

          if (validateCookies(cookies)) {
            const tokens: AuthTokens = {
              cookies,
              csrf_token: "",
              session_id: "",
              extracted_at: Date.now() / 1000,
            };
            saveTokens(tokens);
            console.log("\n✅ Smart Authentication successful!");
            console.log("   Cookies extracted automatically.");
            ws.close();
            resolve(tokens);
          } else {
            process.stdout.write("."); // Progress indicator
          }
        }
      });

      console.log("\nWaiting for you to log in to NotebookLM...");
      console.log("If you are already logged in, extraction will happen automatically.");
      console.log("If not, please complete the login process in the browser window.\n");
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Smart Auth failed: ${error.message}\nTry manual auth instead.`);
    }
    throw error;
  }
}
