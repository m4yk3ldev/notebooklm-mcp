// src/rpc/auth-state.ts
// Self-contained auth state for NotebookLMClient. Owns the AuthTokens bundle,
// CSRF / session-id mirrors, the cookie jar, and the single-flight refresh
// mutex. All mutations persist to disk via saveTokens.

import type { AuthTokens } from "../types.js";
import { saveTokens, loadTokensFromCache } from "../auth.js";
import { refreshCookiesHeadless, runBrowserAuthFlow } from "../browser-auth.js";

export class AuthState {
  private _tokens: AuthTokens;
  private _csrfToken: string;
  private _sessionId: string;
  // Shared in-flight auth-refresh promise. When several concurrent RPCs
  // all hit AuthenticationError, only the first one spawns a headless
  // Chrome / manual browser flow; the rest await the same result. Without
  // this guard, every concurrent caller would launch its own browser and
  // race to overwrite tokens with potentially different cookie sets.
  private authRefreshPromise: Promise<AuthTokens> | null = null;

  constructor(initial: AuthTokens) {
    this._tokens = initial;
    this._csrfToken = initial.csrf_token;
    this._sessionId = initial.session_id;
  }

  get tokens(): AuthTokens {
    return this._tokens;
  }

  get csrfToken(): string {
    return this._csrfToken;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get cookies(): Record<string, string> {
    return this._tokens.cookies;
  }

  /** Update session ID returned by the server (af.httprm). Persists to disk. */
  recordSessionId(sid: string): void {
    this._sessionId = sid;
    this._tokens.session_id = sid;
    saveTokens(this._tokens);
  }

  /** Update CSRF token (used after refreshAuthTokens parses the page). Persists. */
  recordCsrfToken(csrf: string): void {
    this._csrfToken = csrf;
    this._tokens.csrf_token = csrf;
    saveTokens(this._tokens);
  }

  /** Merge Set-Cookie header lines into the cookie jar. Persists. */
  recordSetCookies(setCookieLines: readonly string[]): void {
    if (setCookieLines.length === 0) return;
    for (const cookieStr of setCookieLines) {
      const parts = cookieStr.split(";")[0].split("=");
      if (parts.length >= 2) {
        this._tokens.cookies[parts[0].trim()] = parts[1].trim();
      }
    }
    saveTokens(this._tokens);
  }

  /** Replace the whole token bundle (used after refresh). Persists. */
  replaceTokens(tokens: AuthTokens): void {
    this._tokens = tokens;
    this._csrfToken = tokens.csrf_token;
    this._sessionId = tokens.session_id;
    saveTokens(this._tokens);
  }

  /**
   * Reload tokens from disk if fresher than current.
   * Returns true if state was updated.
   */
  async reloadIfNewer(): Promise<boolean> {
    const fresh = loadTokensFromCache();
    if (fresh && fresh.extracted_at > this._tokens.extracted_at) {
      this._tokens = fresh;
      this._csrfToken = fresh.csrf_token;
      this._sessionId = fresh.session_id;
      return true;
    }
    return false;
  }

  /**
   * Single-flight refresh. First caller spawns refreshCookiesHeadless()
   * (with runBrowserAuthFlow() as fallback); concurrent callers await the
   * same promise. The slot is cleared on settle.
   */
  async refreshOnce(): Promise<AuthTokens> {
    if (this.authRefreshPromise) {
      return this.authRefreshPromise;
    }
    this.authRefreshPromise = (async () => {
      try {
        return await refreshCookiesHeadless();
      } catch {
        console.error(
          "⚠️ Automatic refresh encountered a hiccup. Launching a manual login window to get you back on track.",
        );
        return await runBrowserAuthFlow();
      }
    })();
    try {
      const newTokens = await this.authRefreshPromise;
      this.replaceTokens(newTokens);
      return newTokens;
    } finally {
      this.authRefreshPromise = null;
    }
  }
}
