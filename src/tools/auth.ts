import { z } from "zod";
import { McpTool, clientResetSignal } from "./index.js";
import { saveTokens } from "../auth.js";
import { REQUIRED_COOKIES } from "../constants.js";
import type { AuthTokens } from "../types.js";

// We use a special return flag so server.ts knows to reset the client
export const authTools: McpTool<any>[] = [
  {
    name: "auth_refresh",
    title: "Refresh NotebookLM session",
    description:
      "Re-read the NotebookLM page with the saved cookies to refresh the CSRF token and session ID. Returns a " +
      "confirmation, or an authentication error if the Google session is signed out; then ask the user to run " +
      "`npx -y @m4ykeldev/notebooklm-mcp auth` in a terminal. Call it once after an auth error, then retry.",
    // Rewrites the local token cache; never touches notebooks.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    output: {},
    execute: async (client) => {
      await client.refreshAuth();
      return { message: "Authentication tokens refreshed" };
    },
  },
  {
    name: "auth_save_tokens",
    title: "Save NotebookLM cookies",
    description:
      "Manual fallback: save NotebookLM cookies the user pasted, plus an optional CSRF token and session ID, to " +
      "~/.notebooklm-mcp/auth.json, replacing what is stored there. Returns a confirmation; the next call uses the new " +
      "tokens. Prefer the CLI auth command. Use this only when the user hands you cookies, and never echo them back.",
    // Overwrites the stored credentials; local only.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    schema: {
      cookies: z
        .string()
        .optional()
        .describe(`Cookie header string as copied from the browser ("SID=...; HSID=...; ..."); must include ${REQUIRED_COOKIES.join(", ")}`),
      csrf_token: z.string().optional().describe("CSRF token (SNlM0e); optional, extracted from the page when omitted"),
      session_id: z.string().optional().describe("Session ID (FdrFJe); optional, extracted from the page when omitted"),
    },
    output: {},
    execute: async (client, { cookies: cookieStr, csrf_token, session_id }) => {
      const cookieMap: Record<string, string> = {};
      if (cookieStr) {
        for (const part of cookieStr.split(";")) {
          const eq = part.indexOf("=");
          if (eq > 0) {
            cookieMap[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
          }
        }
      }
      // Saving overwrites the stored session, so an incomplete set would sign the user out.
      const missing = REQUIRED_COOKIES.filter((name) => !cookieMap[name]);
      if (missing.length > 0) {
        throw new Error(
          `Not saved: the cookies must include ${REQUIRED_COOKIES.join(", ")} (missing ${missing.join(", ")}). ` +
            "The stored session was left unchanged.",
        );
      }
      const tokens: AuthTokens = {
        cookies: cookieMap,
        csrf_token: csrf_token || "",
        session_id: session_id || "",
        extracted_at: Date.now() / 1000,
      };
      saveTokens(tokens);

      return clientResetSignal({
        message: "Tokens saved. Client will use new tokens on next request.",
      });
    },
  },
];
