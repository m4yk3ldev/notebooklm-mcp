import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import WebSocket from "ws";
import type { AuthTokens } from "./types.js";
import {
  BASE_URL,
  REQUIRED_COOKIES,
} from "./constants.js";
import {
  validateCookies,
  saveTokens,
  extractCsrfFromPage,
  extractSessionIdFromPage,
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
      execSync(`"${candidate}" --version 2>/dev/null`, { stdio: "ignore" });
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}
