#!/usr/bin/env node
// Dump NotebookLM page HTML to /tmp so we can inspect for RPC IDs

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTH_FILE = join(homedir(), ".notebooklm-mcp", "auth.json");
const auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
const cookieHeader = Object.entries(auth.cookies)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const url = process.argv[2] || "https://notebooklm.google.com/";
const res = await fetch(url, {
  headers: { Cookie: cookieHeader, "User-Agent": USER_AGENT, Accept: "text/html" },
});
const html = await res.text();
const outPath = "/tmp/notebooklm-page.html";
writeFileSync(outPath, html);
console.log(`saved ${html.length} bytes to ${outPath}`);

// Count occurrences of every known RPC ID
const KNOWN_RPCS = {
  LIST_NOTEBOOKS: "wXbhsf",
  GET_NOTEBOOK: "rLM1Ne",
  CREATE_NOTEBOOK: "CCqFvf",
  RENAME_NOTEBOOK: "s0tc2d",
  DELETE_NOTEBOOK: "WWINqb",
  ADD_SOURCE: "izAoDd",
  GET_SOURCE: "hizoJc",
  CHECK_FRESHNESS: "yR9Yof",
  SYNC_DRIVE: "FLmJqe",
  DELETE_SOURCE: "tGMBJ",
  QUERY: "ZAnZ8",
  SUBSCRIPTION: "ozz5Z",
  SETTINGS: "ZwVcOc",
  POLL_RESEARCH: "e3bVqc",
  DELETE_STUDIO: "V5N4be",
  DELETE_MIND_MAP: "AH0mwd",
};
console.log("\nRPC ID occurrences in HTML:");
for (const [name, id] of Object.entries(KNOWN_RPCS)) {
  const count = (html.match(new RegExp(id, "g")) || []).length;
  console.log(`  ${name.padEnd(20)} ${id.padEnd(8)} ${count}`);
}
