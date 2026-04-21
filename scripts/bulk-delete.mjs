#!/usr/bin/env node
// Delete many sources from a notebook using the corrected RPC shape.
// Usage: node scripts/bulk-delete.mjs <notebookId> <sourceId1> <sourceId2> ...

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
const RPC_ID = "tGMBJ";

const [, , notebookId, ...sourceIds] = process.argv;
if (!notebookId || sourceIds.length === 0) {
  console.error("usage: bulk-delete.mjs <notebookId> <sourceId> [<sourceId>...]");
  process.exit(2);
}

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

async function deleteOne(sourceId) {
  const params = [[[sourceId]], [2]];
  const fReq = JSON.stringify([[[RPC_ID, JSON.stringify(params), null, "generic"]]]);
  const body = [
    `at=${encodeURIComponent(csrf)}`,
    `f.sid=${encodeURIComponent(sid)}`,
    `f.req=${encodeURIComponent(fReq)}`,
  ].join("&");

  const url = new URL(BASE_URL + BATCHEXECUTE_PATH);
  url.searchParams.set("rpcids", RPC_ID);
  url.searchParams.set("bl", DEFAULT_BL);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("_reqid", String(Math.floor(Math.random() * 1e6)));
  url.searchParams.set("rt", "c");
  url.searchParams.set("f.sid", sid);

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
  const text = await res.text();
  const ok = text.includes(`"wrb.fr","${RPC_ID}","[]"`);
  const errMatch = text.match(/"wrb.fr","tGMBJ",null,null,null,(\[[^\]]+\])/);
  return { ok, err: errMatch?.[1] ?? null };
}

let success = 0;
let failed = 0;
for (const id of sourceIds) {
  const { ok, err } = await deleteOne(id);
  if (ok) {
    success++;
    console.log(`✓ ${id}`);
  } else {
    failed++;
    console.log(`✗ ${id} — ${err ?? "unknown"}`);
  }
}
console.log(`\n${success} deleted, ${failed} failed`);
