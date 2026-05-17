// src/rpc/transport.ts
// HTTP transport for NotebookLM's batchexecute and query endpoints.
// Composes AuthState (cookies / csrf / sid) + wire.parseResponse.
// Pure infrastructure — no domain knowledge, no extractRpcResult, no
// auth-error retry. Callers (currently src/client.ts) are responsible
// for interpreting parsed envelopes and triggering refresh on auth failure.

import type { AuthState } from "./auth-state.js";
import { parseResponse } from "./wire.js";
import {
  BASE_URL,
  BATCHEXECUTE_PATH,
  QUERY_PATH,
  USER_AGENT,
  DEFAULT_TIMEOUT,
  DEFAULT_BL,
} from "../constants.js";
import { buildCookieHeader } from "../auth.js";

export class RpcTransport {
  private reqId = 0;

  constructor(
    private auth: AuthState,
    private defaultQueryTimeout: number,
  ) {}

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
      Cookie: buildCookieHeader(this.auth.cookies),
      "X-Same-Domain": "1",
      "User-Agent": USER_AGENT,
      "sec-ch-ua":
        '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "X-Goog-Encode-Response-If-Executable": "base64",
      "X-Google-SIDRT": "1",
    };
  }

  private buildRequestBody(rpcId: string, params: unknown): string {
    const fReq = JSON.stringify([
      [[rpcId, JSON.stringify(params), null, "generic"]],
    ]);
    const parts: string[] = [];
    if (this.auth.csrfToken) {
      parts.push(`at=${encodeURIComponent(this.auth.csrfToken)}`);
    }
    if (this.auth.sessionId) {
      parts.push(`f.sid=${encodeURIComponent(this.auth.sessionId)}`);
    }
    parts.push(`f.req=${encodeURIComponent(fReq)}`);
    return parts.join("&");
  }

  private buildUrl(rpcId: string): string {
    this.reqId++;
    const params: Record<string, string> = {
      rpcids: rpcId,
      bl: this.auth.tokens.bl || process.env.NOTEBOOKLM_BL || DEFAULT_BL,
      hl: "en-US",
      _reqid: String(this.reqId),
      rt: "c",
    };
    if (this.auth.sessionId) {
      params["f.sid"] = this.auth.sessionId;
    }
    const query = new URLSearchParams(params).toString();
    return `${BASE_URL}${BATCHEXECUTE_PATH}?${query}`;
  }

  private buildQueryUrl(): string {
    this.reqId++;
    const params: Record<string, string> = {
      bl: this.auth.tokens.bl || process.env.NOTEBOOKLM_BL || DEFAULT_BL,
      hl: "en",
      _reqid: String(this.reqId),
      rt: "c",
    };
    if (this.auth.sessionId) {
      params["f.sid"] = this.auth.sessionId;
    }
    const query = new URLSearchParams(params).toString();
    return `${BASE_URL}${QUERY_PATH}?${query}`;
  }

  /**
   * POST to /batchexecute. Returns the parsed envelope array (output of
   * parseResponse). Caller is responsible for extractRpcResult.
   */
  async callBatchexecute(
    rpcId: string,
    params: unknown,
    _sourcePath = "/",
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.buildUrl(rpcId);
      const body = this.buildRequestBody(rpcId, params);

      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `NotebookLM RPC ${rpcId} returned HTTP ${response.status} ${response.statusText}`,
        );
      }

      // getSetCookie is the spec'd way to read multi-valued Set-Cookie since
      // Node 18.14 / undici 5.20. The `?.()` short-circuit + `|| []` fallback
      // is defensive for older fetch polyfills that never ship in our
      // supported runtimes; both branches are unreachable from tests.
      /* v8 ignore start */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setCookies = (response.headers as any).getSetCookie?.() || [];
      /* v8 ignore stop */
      if (setCookies.length > 0) {
        this.auth.recordSetCookies(setCookies);
      }

      const text = await RpcTransport.readBodyWithAbort(
        response,
        controller.signal,
      );
      return parseResponse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST to the QUERY_PATH endpoint with a raw form body. Same header /
   * abort / status / cookie semantics as callBatchexecute. Adds the
   * X-Goog-BatchExecute-Path header that the streaming endpoint requires.
   */
  async callQuery(
    _notebookId: string,
    body: string,
    timeout: number = this.defaultQueryTimeout,
  ): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.buildQueryUrl();
      const headers = {
        ...this.buildHeaders(),
        "X-Goog-BatchExecute-Path": QUERY_PATH,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `NotebookLM query returned HTTP ${response.status} ${response.statusText}`,
        );
      }

      // See callBatchexecute: ?.() + `|| []` is the defensive fallback for
      // runtimes without getSetCookie. Not reachable on Node 18.14+.
      /* v8 ignore start */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setCookies = (response.headers as any).getSetCookie?.() || [];
      /* v8 ignore stop */
      if (setCookies.length > 0) {
        this.auth.recordSetCookies(setCookies);
      }

      const text = await RpcTransport.readBodyWithAbort(
        response,
        controller.signal,
      );
      return parseResponse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET the NotebookLM landing page. Used by client.ts during CSRF
   * refresh to scrape the embedded CSRF / session-id values.
   */
  async fetchLandingHtml(timeout: number = DEFAULT_TIMEOUT): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(BASE_URL, {
        headers: {
          Cookie: buildCookieHeader(this.auth.cookies),
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        signal: controller.signal,
      });

      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read response.text() but abort if the AbortSignal fires. fetch()'s
   * built-in abort cancels the HTTP request setup but body streaming can
   * still hang after headers arrive, leaving the caller stuck past the
   * configured timeout.
   */
  static readBodyWithAbort(
    response: Response,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) {
      return Promise.reject(new Error("Aborted before body read"));
    }
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        // Defensive: text() resolution path already removed this listener,
        // so re-entrancy here is unreachable in practice. Keep the guard
        // to match the symmetric text() handlers below.
        /* v8 ignore next */
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Body read aborted due to timeout"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      response.text().then(
        (text) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          resolve(text);
        },
        (err) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  }
}
