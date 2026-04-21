#!/usr/bin/env node
// Diagnostic: hits the batchexecute endpoint directly with DELETE_SOURCE payload
// and dumps the raw Google response so we can see what's actually happening.
//
// Usage: node scripts/debug-delete.mjs <notebookId> <sourceId> [rpcId]
// Default rpcId = "tGMBJ" (the current value in src/constants.ts)

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTH_FILE = join(homedir(), ".notebooklm-mcp", "auth.json");
const BASE_URL = "https://notebooklm.google.com";
const BATCHEXECUTE_PATH = "/_/LabsTailwindUi/data/batchexecute";
const DEFAULT_BL =
  process.env.NOTEBOOKLM_BL || "boq_labs-tailwind-frontend_20260419.02_p0";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const [, , notebookId, sourceId, shapeArg, rpcIdArg] = process.argv;
if (!notebookId || !sourceId) {
  console.error("usage: debug-delete.mjs <notebookId> <sourceId> [shape] [rpcId]");
  console.error("  shape: flat | nested | double (default: flat)");
  process.exit(2);
}
const shape = shapeArg || "flat";
const rpcId = rpcIdArg || "tGMBJ";

const auth = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
const cookieHeader = Object.entries(auth.cookies)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");

async function getCsrfAndSid() {
  const res = await fetch(BASE_URL, {
    headers: { Cookie: cookieHeader, "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  const html = await res.text();
  const csrf = html.match(/"SNlM0e":"([^"]+)"/)?.[1] ?? "";
  const sid = html.match(/"FdrFJe":"([^"]+)"/)?.[1] ?? "";
  return { csrf, sid };
}

const { csrf, sid } = await getCsrfAndSid();
console.log("csrf present:", Boolean(csrf), "sid present:", Boolean(sid));

const params =
  shape === "nested"
    ? [[sourceId], notebookId]
    : shape === "double"
      ? [[[sourceId]], notebookId]
      : shape === "swap"
        ? [notebookId, sourceId]
        : shape === "swap-nested"
          ? [notebookId, [sourceId]]
          : shape === "notebook-only"
            ? [notebookId]
            : shape === "source-only"
              ? [sourceId]
              : [sourceId, notebookId];
const fReq = JSON.stringify([[[rpcId, JSON.stringify(params), null, "generic"]]]);
const body = [
  `at=${encodeURIComponent(csrf)}`,
  `f.sid=${encodeURIComponent(sid)}`,
  `f.req=${encodeURIComponent(fReq)}`,
].join("&");

const url = new URL(BASE_URL + BATCHEXECUTE_PATH);
url.searchParams.set("rpcids", rpcId);
url.searchParams.set("bl", DEFAULT_BL);
url.searchParams.set("hl", "en-US");
url.searchParams.set("_reqid", String(Math.floor(Math.random() * 1e6)));
url.searchParams.set("rt", "c");
url.searchParams.set("f.sid", sid);

console.log("\n>>> POST", url.toString());
console.log(">>> rpcId:", rpcId);
console.log(">>> params:", params);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    Origin: BASE_URL,
    Referer: `${BASE_URL}/notebook/${notebookId}`,
    Cookie: cookieHeader,
    "X-Same-Domain": "1",
    "User-Agent": USER_AGENT,
  },
  body,
});

console.log("\n<<< status:", res.status, res.statusText);
const text = await res.text();
console.log("<<< body length:", text.length);
console.log("<<< raw body:");
console.log(text);
