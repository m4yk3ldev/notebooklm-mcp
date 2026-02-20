import { z } from "zod";
import { McpTool } from "./index.js";
import { saveTokens } from "../auth.js";
import type { AuthTokens } from "../types.js";

// We use a special return flag so server.ts knows to reset the client
export const authTools: McpTool<any>[] = [
  {
    name: "refresh_auth",
    description: "Reload authentication tokens (re-extract CSRF and session from page)",
    execute: async (client) => {
      await client.refreshAuth();
      return { message: "Authentication tokens refreshed" };
    },
  },
  {
    name: "save_auth_tokens",
    description: "Manually save authentication cookies (fallback method — prefer using CLI auth)",
    schema: {
      cookies: z.string().optional().describe("Cookie header string (SID=xxx; HSID=yyy; ...)"),
      csrf_token: z.string().optional().describe("CSRF token"),
      session_id: z.string().optional().describe("Session ID"),
    },
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
      const tokens: AuthTokens = {
        cookies: cookieMap,
        csrf_token: csrf_token || "",
        session_id: session_id || "",
        extracted_at: Date.now() / 1000,
      };
      saveTokens(tokens);
      
      // We return this special flag so the registerTools wrapper or server.ts can catch it
      return { 
        message: "Tokens saved. Client will use new tokens on next request.",
        _client_action: "reset" 
      };
    },
  },
];
