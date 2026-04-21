#!/usr/bin/env node
// Probe the NotebookLM page HTML for the current bl version and any embedded hints
// about the DELETE_SOURCE RPC ID.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTH_FILE = join(homedir(), ".notebooklm-mcp", "auth.json");
const auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
const cookieHeader = Object.entries(auth.cookies)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const res = await fetch("https://notebooklm.google.com/", {
  headers: { Cookie: cookieHeader, "User-Agent": USER_AGENT, Accept: "text/html" },
});

const html = await res.text();
console.log("page length:", html.length);

// Look for bl version
const blMatch = html.match(/"cfb2h":"(boq[^"]+)"/);
console.log("bl (cfb2h):", blMatch?.[1] ?? "not found");

// Look for any tGMBJ hits
console.log("tGMBJ occurrences:", (html.match(/tGMBJ/g) || []).length);

// Extract all JS bundle URLs
const jsMatches = [...html.matchAll(/https?:\/\/[^\s"'<>]*labs-tailwind[^\s"'<>]+\.js/g)].map(m => m[0]);
console.log("JS bundles found:", jsMatches.length);
for (const u of jsMatches.slice(0, 10)) console.log("  ", u);
