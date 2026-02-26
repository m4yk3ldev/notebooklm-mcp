import type {
  AuthTokens,
  Notebook,
  SourceSummary,
  SourceDetail,
  ResearchResult,
  ResearchSource,
  StudioArtifact,
  QueryResponse,
} from "./types.js";
import {
  RPC_IDS,
  BASE_URL,
  BATCHEXECUTE_PATH,
  QUERY_PATH,
  DEFAULT_BL,
  USER_AGENT,
  DEFAULT_TIMEOUT,
  EXTENDED_TIMEOUT,
  OWNERSHIP_MINE,
  SOURCE_TYPES,
  RESULT_TYPES,
  RESEARCH_SOURCES,
  RESEARCH_MODES,
  STUDIO_TYPES,
  AUDIO_FORMATS,
  AUDIO_LENGTHS,
  VIDEO_FORMATS,
  VIDEO_STYLES,
  INFOGRAPHIC_ORIENTATIONS,
  INFOGRAPHIC_DETAILS,
  SLIDE_DECK_FORMATS,
  SLIDE_DECK_LENGTHS,
  FLASHCARD_DIFFICULTIES,
  FLASHCARD_COUNT_DEFAULT,
  REPORT_FORMATS,
  CHAT_GOALS,
  CHAT_RESPONSE_LENGTHS,
} from "./constants.js";
import {
  buildCookieHeader,
  extractCsrfFromPage,
  extractSessionIdFromPage,
  saveTokens,
} from "./auth.js";
import { refreshCookiesHeadless, runBrowserAuthFlow } from "./browser-auth.js";

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class NotebookLMClient {
  private tokens: AuthTokens;
  private csrfToken: string;
  private sessionId: string;
  private conversationHistory: Map<string, unknown[]> = new Map();
  private queryTimeout: number;
  private reqId = 0;

  constructor(tokens: AuthTokens, queryTimeout?: number) {
    this.tokens = tokens;
    this.csrfToken = tokens.csrf_token;
    this.sessionId = tokens.session_id;
    this.queryTimeout = queryTimeout ?? EXTENDED_TIMEOUT;
  }

  // ─── Core HTTP/RPC ───────────────────────────────────

  private buildRequestBody(rpcId: string, params: unknown): string {
    const fReq = JSON.stringify([[[rpcId, JSON.stringify(params), null, "generic"]]]);
    const parts = [];
    if (this.csrfToken) {
      parts.push(`at=${encodeURIComponent(this.csrfToken)}`);
    }
    if (this.sessionId) {
      parts.push(`f.sid=${encodeURIComponent(this.sessionId)}`);
    }
    parts.push(`f.req=${encodeURIComponent(fReq)}`);
    return parts.join("&");
  }

  private buildUrl(rpcId: string, sourcePath = "/"): string {
    this.reqId++;
    const params: Record<string, string> = {
      rpcids: rpcId,
      bl: this.tokens.bl || process.env.NOTEBOOKLM_BL || DEFAULT_BL,
      hl: "en-US",
      _reqid: String(this.reqId),
      rt: "c",
    };
    if (this.sessionId) {
      params["f.sid"] = this.sessionId;
    }
    const query = new URLSearchParams(params).toString();
    return `${BASE_URL}${BATCHEXECUTE_PATH}?${query}`;
  }

  private buildQueryUrl(sourcePath = "/"): string {
    this.reqId++;
    const params: Record<string, string> = {
      bl: this.tokens.bl || process.env.NOTEBOOKLM_BL || DEFAULT_BL,
      hl: "en",
      _reqid: String(this.reqId),
      rt: "c",
    };
    if (this.sessionId) {
      params["f.sid"] = this.sessionId;
    }
    const query = new URLSearchParams(params).toString();
    return `${BASE_URL}${QUERY_PATH}?${query}`;
  }

  private parseResponse(responseText: string): unknown[] {
    let text = responseText;
    if (text.startsWith(")]}'")) {
      text = text.slice(4);
    }

    const lines = text.trim().split("\n");
    const results: unknown[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      const maybeByteCount = parseInt(line, 10);
      if (!isNaN(maybeByteCount) && String(maybeByteCount) === line) {
        i++;
        if (i < lines.length) {
          try {
            results.push(JSON.parse(lines[i]));
          } catch {
            // skip unparseable
          }
          i++;
        }
      } else {
        try {
          results.push(JSON.parse(line));
        } catch {
          // skip
        }
        i++;
      }
    }

    return results;
  }

  private extractRpcResult(parsed: unknown[], rpcId: string, isRetry = false): unknown {
    for (const chunk of parsed) {
      if (!Array.isArray(chunk)) continue;
      for (const item of chunk) {
        if (!Array.isArray(item)) continue;

        // Extract Session ID if provided by Google
        if (item[0] === "af.httprm" && item.length >= 3 && typeof item[2] === "string") {
          this.sessionId = item[2];
          this.tokens.session_id = this.sessionId;
          saveTokens(this.tokens);
        }

        if (item.length < 3) continue;
        if (item[0] === "wrb.fr" && item[1] === rpcId) {
          // Check for auth error (code 16)
          if (
            item.length > 6 &&
            item[6] === "generic" &&
            Array.isArray(item[5]) &&
            item[5].includes(16)
          ) {
            throw new AuthenticationError(
              "Authentication expired. Run `npx @m4ykeldev/notebooklm-mcp auth` to re-authenticate.",
            );
          }

          const resultStr = item[2];
          if (typeof resultStr === "string") {
            try {
              return JSON.parse(resultStr);
            } catch {
              return resultStr;
            }
          }
          return resultStr;
        }
      }
    }
    return null;
  }

  private async execute(
    rpcId: string,
    params: unknown,
    sourcePath = "/",
    timeout = DEFAULT_TIMEOUT,
    isRetry = false,
  ): Promise<unknown> {
    // If CSRF or SID are missing, try to extract them first
    if (!this.csrfToken || !this.sessionId) {
      await this.refreshAuthTokens();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.buildUrl(rpcId, sourcePath);
      const body = this.buildRequestBody(rpcId, params);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Origin: BASE_URL,
          Referer: `${BASE_URL}/`,
          Cookie: buildCookieHeader(this.tokens.cookies),
          "X-Same-Domain": "1",
          "User-Agent": USER_AGENT,
          "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Linux"',
          "X-Goog-Encode-Response-If-Executable": "base64",
          "X-Google-SIDRT": "1",
        },
        body,
        signal: controller.signal,
      });

      // Update cookies from Set-Cookie headers
      const setCookies = (response.headers as any).getSetCookie?.() || [];
      if (setCookies.length > 0) {
        for (const cookieStr of setCookies) {
          const parts = cookieStr.split(";")[0].split("=");
          if (parts.length >= 2) {
            this.tokens.cookies[parts[0].trim()] = parts[1].trim();
          }
        }
        saveTokens(this.tokens);
      }

      const text = await response.text();
      const parsed = this.parseResponse(text);

      try {
        return this.extractRpcResult(parsed, rpcId, isRetry);
      } catch (e) {
        if (e instanceof AuthenticationError && !isRetry) {
          console.error("🔄 Session expired. Checking for updated tokens on disk...");
          
          // Try to reload tokens from disk first
          try {
            const { loadTokensFromCache } = await import("./auth.js");
            const freshTokens = loadTokensFromCache();
            if (freshTokens && freshTokens.extracted_at > this.tokens.extracted_at) {
              console.error("✅ Found fresher tokens on disk. Retrying with new tokens...");
              this.tokens = freshTokens;
              this.csrfToken = freshTokens.csrf_token;
              this.sessionId = freshTokens.session_id;
              return this.execute(rpcId, params, sourcePath, timeout, true);
            }
          } catch (reloadError) {
            // ignore
          }

          console.error("🔄 Effortlessly restoring your connection in the background...");
          try {
            let newTokens: AuthTokens;
            try {
              newTokens = await refreshCookiesHeadless();
            } catch (refreshError) {
              console.error("⚠️ Automatic refresh encountered a hiccup. Launching a manual login window to get you back on track.");
              newTokens = await runBrowserAuthFlow();
            }

            this.tokens = newTokens;
            this.csrfToken = newTokens.csrf_token;
            this.sessionId = newTokens.session_id;

            // Warm up session with a real RPC call (Settings)
            try {
              await this.execute(RPC_IDS.SETTINGS, [null, 1], "/", 5000, true);
            } catch {
              // ignore warmup error
            }
            
            await new Promise(r => setTimeout(r, 1000));

            // Retry original request
            return this.execute(rpcId, params, sourcePath, timeout, true);
          } catch (finalError) {
            console.error("❌ Authentication failed:", (finalError as Error).message);
            throw e;
          }
        }
        throw e;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async refreshAuthTokens(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(BASE_URL, {
        headers: {
          Cookie: buildCookieHeader(this.tokens.cookies),
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        signal: controller.signal,
      });

      const html = await response.text();
      const csrf = extractCsrfFromPage(html);
      const sid = extractSessionIdFromPage(html);

      if (csrf) {
        this.csrfToken = csrf;
        console.error("✅ New CSRF token extracted.");
      } else {
        console.error("⚠️ Failed to extract CSRF token from page.");
      }
      
      if (sid) {
        this.sessionId = sid;
        console.error("✅ New Session ID extracted.");
      } else {
        console.error("⚠️ Failed to extract Session ID from page.");
      }

      this.tokens.csrf_token = this.csrfToken;
      this.tokens.session_id = this.sessionId;
      saveTokens(this.tokens);
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Notebook Methods ────────────────────────────────

  private parseTimestamp(ts: unknown): string | null {
    if (Array.isArray(ts) && ts.length >= 1 && typeof ts[0] === "number") {
      return new Date(ts[0] * 1000).toISOString();
    }
    return null;
  }

  private parseNotebook(data: unknown): Notebook {
    if (!Array.isArray(data)) {
      throw new Error(
        "Invalid notebook data received from Google. This usually happens if the notebook ID is incorrect, it was deleted, or you don't have permission to access it.",
      );
    }

    // Unwrap if Google returns [[notebookData]]
    let d = data as any[];
    if (d.length > 0 && Array.isArray(d[0]) && typeof d[0][2] === "string" && d[0][2].includes("-")) {
      d = d[0];
    }

    const sources: SourceSummary[] = [];
    if (Array.isArray(d[1])) {
      for (const s of d[1]) {
        if (Array.isArray(s) && s[0]) {
          sources.push({
            id: Array.isArray(s[0]) ? s[0][0] : String(s[0]),
            title: s[1] || "Untitled",
            type: SOURCE_TYPES.getName(s[3] ?? null),
          });
        }
      }
    }

    const meta = d[5] as any[] | undefined;
    return {
      id: d[2] || "",
      title: d[0] || "Untitled",
      emoji: d[3] || null,
      sources,
      is_shared: meta?.[1] === true,
      ownership: meta?.[0] === OWNERSHIP_MINE ? "mine" : "shared",
      created_at: meta ? this.parseTimestamp(meta[8]) : null,
      modified_at: meta ? this.parseTimestamp(meta[5]) : null,
    };
  }

  async listNotebooks(maxResults = 100): Promise<Notebook[]> {
    const result = await this.execute(
      RPC_IDS.LIST_NOTEBOOKS,
      [null, maxResults],
    );
    if (!Array.isArray(result) || !Array.isArray(result[0])) return [];

    const notebooks: Notebook[] = [];
    for (const item of result[0]) {
      if (Array.isArray(item)) {
        notebooks.push(this.parseNotebook(item));
      }
    }
    return notebooks.slice(0, maxResults);
  }

  async getNotebook(notebookId: string): Promise<Notebook> {
    const result = await this.execute(
      RPC_IDS.GET_NOTEBOOK,
      [notebookId],
      `/notebook/${notebookId}`,
    );
    return this.parseNotebook(result);
  }

  async createNotebook(title: string): Promise<Notebook> {
    const result = await this.execute(RPC_IDS.CREATE_NOTEBOOK, [
      title,
    ]);
    return this.parseNotebook(result);
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<void> {
    await this.execute(
      RPC_IDS.RENAME_NOTEBOOK,
      [notebookId, [[null, null, null, [null, newTitle]]]],
      `/notebook/${notebookId}`,
    );
  }

  async deleteNotebook(notebookId: string): Promise<void> {
    await this.execute(
      RPC_IDS.DELETE_NOTEBOOK,
      [notebookId],
      `/notebook/${notebookId}`,
    );
  }

  async describeNotebook(notebookId: string): Promise<string> {
    const result = await this.execute(
      RPC_IDS.GET_SUMMARY,
      [notebookId, null, [2]],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  // ─── Source Methods ──────────────────────────────────

  async addUrlSource(
    notebookId: string,
    url: string,
  ): Promise<SourceSummary> {
    const isYouTube =
      url.toLowerCase().includes("youtube.com") ||
      url.toLowerCase().includes("youtu.be");

    const sourceData = isYouTube
      ? [null, null, null, null, null, null, null, [url], null, null, 1]
      : [null, null, [url], null, null, null, null, null, null, null, 1];

    const result = await this.execute(
      RPC_IDS.ADD_SOURCE,
      [
        [sourceData],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]],
      ],
      `/notebook/${notebookId}`,
      EXTENDED_TIMEOUT,
    );

    const data = result as any[];
    const source = data?.[0]?.[0];
    return {
      id: Array.isArray(source?.[0]) ? source[0][0] : String(source?.[0] || ""),
      title: source?.[1] || url,
      type: isYouTube ? "youtube" : "web_page",
    };
  }

  async addTextSource(
    notebookId: string,
    text: string,
    title: string,
  ): Promise<SourceSummary> {
    const sourceData = [
      null,
      [title, text],
      null,
      2,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
    ];

    const result = await this.execute(
      RPC_IDS.ADD_SOURCE,
      [
        [sourceData],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]],
      ],
      `/notebook/${notebookId}`,
      EXTENDED_TIMEOUT,
    );

    const data = result as any[];
    const source = data?.[0]?.[0];
    return {
      id: Array.isArray(source?.[0]) ? source[0][0] : String(source?.[0] || ""),
      title: source?.[1] || title,
      type: "pasted_text",
    };
  }

  async addDriveSource(
    notebookId: string,
    documentId: string,
    title: string,
    mimeType: string,
  ): Promise<SourceSummary> {
    const sourceData = [
      [documentId, mimeType, 1, title],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
    ];

    const result = await this.execute(
      RPC_IDS.ADD_SOURCE,
      [
        [sourceData],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]],
      ],
      `/notebook/${notebookId}`,
      EXTENDED_TIMEOUT,
    );

    const data = result as any[];
    const source = data?.[0]?.[0];
    return {
      id: Array.isArray(source?.[0]) ? source[0][0] : String(source?.[0] || ""),
      title: source?.[1] || title,
      type: "google_docs",
    };
  }

  private extractTextFromBlocks(data: any): string {
    if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
    let text = "";
    for (const block of data[0]) {
      try {
        // Path discovered via deep inspection: block[2][2][0][0][2][0]
        const content = block?.[2]?.[2]?.[0]?.[0]?.[2]?.[0];
        if (typeof content === "string") {
          text += content;
        }
      } catch {
        // skip malformed blocks
      }
    }
    return text;
  }

  async getSource(
    sourceId: string,
    notebookId: string,
  ): Promise<SourceDetail> {
    const result = await this.execute(
      RPC_IDS.GET_SOURCE,
      [[sourceId]],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    const meta = data?.[0];
    return {
      id: sourceId,
      title: meta?.[1] || "Untitled",
      type: SOURCE_TYPES.getName(Array.isArray(meta?.[3]) ? meta[3][1] : meta?.[3]),
      content: this.extractTextFromBlocks(data?.[3]),
      summary: null,
      keywords: [],
    };
  }

  async getSourceGuide(
    sourceId: string,
    notebookId: string,
  ): Promise<{ summary: string; keywords: string[] }> {
    const result = await this.execute(
      RPC_IDS.GET_SOURCE_GUIDE,
      [sourceId, notebookId, [2]],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return {
      summary: data?.[0] || "",
      keywords: Array.isArray(data?.[1]) ? data[1] : [],
    };
  }

  async checkFreshness(
    sourceId: string,
    notebookId: string,
  ): Promise<boolean | null> {
    try {
      const result = await this.execute(
        RPC_IDS.CHECK_FRESHNESS,
        [sourceId, notebookId],
        `/notebook/${notebookId}`,
      );
      const data = result as any[];
      return data?.[0] === true;
    } catch {
      return null;
    }
  }

  async syncDrive(sourceIds: string[], notebookId: string): Promise<void> {
    for (const sourceId of sourceIds) {
      await this.execute(
        RPC_IDS.SYNC_DRIVE,
        [sourceId, notebookId],
        `/notebook/${notebookId}`,
        EXTENDED_TIMEOUT,
      );
    }
  }

  async deleteSource(sourceId: string, notebookId: string): Promise<void> {
    await this.execute(
      RPC_IDS.DELETE_SOURCE,
      [sourceId, notebookId],
      `/notebook/${notebookId}`,
    );
  }

  // ─── Query Method ────────────────────────────────────

  async query(
    notebookId: string,
    queryText: string,
    sourceIds?: string[],
    conversationId?: string,
    isRetry = false,
  ): Promise<QueryResponse> {
    // If CSRF or SID are missing, try to extract them first
    if (!this.csrfToken || !this.sessionId) {
      await this.refreshAuthTokens();
    }

    const history = conversationId
      ? this.conversationHistory.get(conversationId) || []
      : [];

    const sourcesNested = sourceIds
      ? sourceIds.map((sid) => [[[sid]]])
      : [];

    // Discovered format: [sources, query, history, config, convId, null, null, notebookId, 1]
    const params = [
      sourcesNested,
      queryText,
      history,
      [2, null, [1], [1]],
      conversationId || null,
      null,
      null,
      notebookId,
      1,
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.queryTimeout);

    try {
      const fReq = JSON.stringify([null, JSON.stringify(params)]);
      let bodyParts = [`f.req=${encodeURIComponent(fReq)}`];
      if (this.csrfToken) {
        bodyParts.push(`at=${encodeURIComponent(this.csrfToken)}`);
      }
      if (this.sessionId) {
        bodyParts.push(`f.sid=${encodeURIComponent(this.sessionId)}`);
      }
      const body = bodyParts.join("&");
      const url = this.buildQueryUrl(`/notebook/${notebookId}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Origin: BASE_URL,
          Referer: `${BASE_URL}/`,
          Cookie: buildCookieHeader(this.tokens.cookies),
          "X-Same-Domain": "1",
          "User-Agent": USER_AGENT,
          "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Linux"',
          "X-Goog-Encode-Response-If-Executable": "base64",
          "X-Google-SIDRT": "1",
          "X-Goog-BatchExecute-Path": "/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed",
        },
        body,
        signal: controller.signal,
      });

      // Update cookies from Set-Cookie headers
      const setCookies = (response.headers as any).getSetCookie?.() || [];
      if (setCookies.length > 0) {
        for (const cookieStr of setCookies) {
          const parts = cookieStr.split(";")[0].split("=");
          if (parts.length >= 2) {
            this.tokens.cookies[parts[0].trim()] = parts[1].trim();
          }
        }
        saveTokens(this.tokens);
      }

      const text = await response.text();
      const parsed = this.parseResponse(text);

      let bestAnswer = "";
      let convId: string | null = conversationId || null;

      for (const chunk of parsed) {
        if (!Array.isArray(chunk)) continue;
        for (const item of chunk) {
          if (!Array.isArray(item) || item.length < 3) continue;
          if (item[0] === "wrb.fr") {
            // Check for auth error (code 16)
            if (
              item.length > 6 &&
              item[6] === "generic" &&
              Array.isArray(item[5]) &&
              item[5].includes(16)
            ) {
              throw new AuthenticationError(
                "Authentication expired. Run `npx @m4ykeldev/notebooklm-mcp auth` to re-authenticate.",
              );
            }

            const resultStr = item[2];
            if (typeof resultStr === "string") {
              try {
                const data = JSON.parse(resultStr);
                if (Array.isArray(data) && Array.isArray(data[0])) {
                  // Format: [[answer, null, [sources], null, [formatting]], ...]
                  const inner = data[0];
                  const answer = inner[0];
                  if (typeof answer === "string" && answer.length > bestAnswer.length) {
                    bestAnswer = answer;
                  }
                  // Conversation ID is usually in the meta block of the first element
                  if (inner[10]) convId = String(inner[10]);
                }
              } catch {
                // skip
              }
            }
          }
        }
      }

      // Store history for next turn
      if (convId && bestAnswer) {
        const history = this.conversationHistory.get(convId) || [];
        history.push([queryText, null, 1]);
        history.push([bestAnswer, null, 2]);
        this.conversationHistory.set(convId, history.slice(-10)); // Keep last 10 turns
      }

      return {
        answer: bestAnswer,
        conversation_id: convId,
      };
    } catch (e) {
      if (e instanceof AuthenticationError && !isRetry) {
        console.error("🔄 Session expired. Checking for updated tokens on disk...");
        
        // Try to reload tokens from disk first
        try {
          const { loadTokensFromCache } = await import("./auth.js");
          const freshTokens = loadTokensFromCache();
          if (freshTokens && freshTokens.extracted_at > this.tokens.extracted_at) {
            console.error("✅ Found fresher tokens on disk. Retrying with new tokens...");
            this.tokens = freshTokens;
            this.csrfToken = freshTokens.csrf_token;
            this.sessionId = freshTokens.session_id;
            return this.query(notebookId, queryText, sourceIds, conversationId, true);
          }
        } catch (reloadError) {
          // ignore
        }

        console.error("🔄 Effortlessly restoring your connection in the background...");
        try {
          let newTokens: AuthTokens;
          try {
            newTokens = await refreshCookiesHeadless();
          } catch (refreshError) {
            console.error("⚠️ Automatic refresh encountered a hiccup. Launching a manual login window to get you back on track.");
            newTokens = await runBrowserAuthFlow();
          }

          this.tokens = newTokens;
          this.csrfToken = newTokens.csrf_token;
          this.sessionId = newTokens.session_id;

          // Warm up session with a real RPC call (Settings)
          try {
            await this.execute(RPC_IDS.SETTINGS, [null, 1], "/", 5000, true);
          } catch {
            // ignore warmup error
          }
          
          await new Promise(r => setTimeout(r, 1000));

          // Retry original request
          return this.query(notebookId, queryText, sourceIds, conversationId, true);
        } catch (finalError) {
          console.error("❌ Authentication failed:", (finalError as Error).message);
          throw e;
        }
      }
      if ((e as Error).name === "AbortError") {
        throw new Error("Query timed out. Try increasing the timeout with --query-timeout.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Research Methods ────────────────────────────────

  async startResearch(
    notebookId: string,
    queryText: string,
    source = "web",
    mode = "fast",
  ): Promise<{ taskId: string }> {
    const sourceCode = RESEARCH_SOURCES.getCode(source);
    const modeCode = RESEARCH_MODES.getCode(mode);

    let result: unknown;
    if (modeCode === 5) {
      // Deep research
      result = await this.execute(
        RPC_IDS.START_DEEP_RESEARCH,
        [null, [1], [queryText, sourceCode], 5, notebookId],
        `/notebook/${notebookId}`,
      );
    } else {
      // Fast research
      result = await this.execute(
        RPC_IDS.START_FAST_RESEARCH,
        [[queryText, sourceCode], null, 1, notebookId],
        `/notebook/${notebookId}`,
      );
    }

    const data = result as any[];
    return { taskId: data?.[0] || "" };
  }

  async pollResearch(
    notebookId: string,
    taskId?: string,
  ): Promise<ResearchResult[]> {
    const result = await this.execute(
      RPC_IDS.POLL_RESEARCH,
      [null, null, notebookId],
      `/notebook/${notebookId}`,
    );

    const data = result as any[];
    if (!Array.isArray(data?.[0])) return [];

    const results: ResearchResult[] = [];
    for (const task of data[0]) {
      if (!Array.isArray(task)) continue;
      const tid = task[0];
      if (taskId && tid !== taskId) continue;

      const taskInfo = task[1] as any[];
      const statusCode = taskInfo?.[4];
      const statusMap: Record<number, ResearchResult["status"]> = {
        1: "in_progress",
        2: "completed",
        6: "imported",
      };

      const sources: ResearchSource[] = [];
      const sourcesArray = taskInfo?.[3]?.[0];
      if (Array.isArray(sourcesArray)) {
        for (const s of sourcesArray) {
          if (Array.isArray(s)) {
            sources.push({
              url: s[0] || null,
              title: s[1] || "",
              description: s[2] || null,
              type: RESULT_TYPES.getName(s[3] ?? null),
            });
          }
        }
      }

      results.push({
        task_id: tid,
        status: statusMap[statusCode] || "in_progress",
        query: taskInfo?.[1]?.[0] || "",
        sources,
        summary: taskInfo?.[3]?.[1] || null,
      });
    }

    return results;
  }

  async importResearch(
    notebookId: string,
    taskId: string,
    sourceIndices?: number[],
  ): Promise<void> {
    const indices = sourceIndices || null;
    await this.execute(
      RPC_IDS.IMPORT_RESEARCH,
      [notebookId, taskId, indices],
      `/notebook/${notebookId}`,
      EXTENDED_TIMEOUT,
    );
  }

  // ─── Studio Methods ──────────────────────────────────

  private formatSourcesNested(sourceIds: string[]): unknown[] {
    return sourceIds.map((sid) => [[sid]]);
  }

  private formatSourcesSimple(sourceIds: string[]): unknown[] {
    return sourceIds.map((sid) => [sid]);
  }

  async createAudioOverview(
    notebookId: string,
    sourceIds: string[],
    options: {
      format?: string;
      length?: string;
      language?: string;
      focus_prompt?: string;
    } = {},
  ): Promise<string> {
    const formatCode = AUDIO_FORMATS.getCode(options.format || "deep_dive");
    const lengthCode = AUDIO_LENGTHS.getCode(options.length || "default");
    const sourcesNested = this.formatSourcesNested(sourceIds);
    const sourcesSimple = this.formatSourcesSimple(sourceIds);

    const audioOptions = [
      null,
      [
        options.focus_prompt || null,
        lengthCode,
        null,
        sourcesSimple,
        options.language || null,
        null,
        formatCode,
      ],
    ];

    const content = [
      null,
      null,
      STUDIO_TYPES.getCode("audio"),
      sourcesNested,
      null,
      null,
      audioOptions,
    ];

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createVideoOverview(
    notebookId: string,
    sourceIds: string[],
    options: {
      format?: string;
      visual_style?: string;
      language?: string;
      focus_prompt?: string;
    } = {},
  ): Promise<string> {
    const formatCode = VIDEO_FORMATS.getCode(options.format || "explainer");
    const styleCode = VIDEO_STYLES.getCode(
      options.visual_style || "auto_select",
    );
    const sourcesNested = this.formatSourcesNested(sourceIds);
    const sourcesSimple = this.formatSourcesSimple(sourceIds);

    const videoOptions = [
      null,
      null,
      [
        sourcesSimple,
        options.language || null,
        options.focus_prompt || null,
        null,
        formatCode,
        styleCode,
      ],
    ];

    const content = [
      null,
      null,
      STUDIO_TYPES.getCode("video"),
      sourcesNested,
      null,
      null,
      null,
      null,
      videoOptions,
    ];

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createInfographic(
    notebookId: string,
    sourceIds: string[],
    options: {
      orientation?: string;
      detail_level?: string;
      language?: string;
      focus_prompt?: string;
    } = {},
  ): Promise<string> {
    const orientationCode = INFOGRAPHIC_ORIENTATIONS.getCode(
      options.orientation || "landscape",
    );
    const detailCode = INFOGRAPHIC_DETAILS.getCode(
      options.detail_level || "standard",
    );
    const sourcesNested = this.formatSourcesNested(sourceIds);

    const infographicOptions = [
      [
        options.focus_prompt || null,
        options.language || null,
        null,
        orientationCode,
        detailCode,
      ],
    ];

    // positions 4-13 are null
    const content: unknown[] = [
      null,
      null,
      STUDIO_TYPES.getCode("infographic"),
      sourcesNested,
    ];
    for (let i = 0; i < 10; i++) content.push(null);
    content.push(infographicOptions);

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createSlideDeck(
    notebookId: string,
    sourceIds: string[],
    options: {
      format?: string;
      length?: string;
      language?: string;
      focus_prompt?: string;
    } = {},
  ): Promise<string> {
    const formatCode = SLIDE_DECK_FORMATS.getCode(
      options.format || "detailed_deck",
    );
    const lengthCode = SLIDE_DECK_LENGTHS.getCode(options.length || "default");
    const sourcesNested = this.formatSourcesNested(sourceIds);

    const slideDeckOptions = [
      [
        options.focus_prompt || null,
        options.language || null,
        formatCode,
        lengthCode,
      ],
    ];

    // positions 4-15 are null
    const content: unknown[] = [
      null,
      null,
      STUDIO_TYPES.getCode("slide_deck"),
      sourcesNested,
    ];
    for (let i = 0; i < 12; i++) content.push(null);
    content.push(slideDeckOptions);

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createReport(
    notebookId: string,
    sourceIds: string[],
    options: {
      report_format?: string;
      custom_prompt?: string;
      language?: string;
    } = {},
  ): Promise<string> {
    const formatName = options.report_format || "Briefing Doc";
    const fmt = REPORT_FORMATS[formatName] || REPORT_FORMATS["Briefing Doc"];
    const prompt =
      formatName === "Create Your Own"
        ? options.custom_prompt || ""
        : fmt.prompt;

    const sourcesNested = this.formatSourcesNested(sourceIds);
    const sourcesSimple = this.formatSourcesSimple(sourceIds);

    const reportOptions = [
      null,
      [
        fmt.title,
        fmt.description,
        null,
        sourcesSimple,
        options.language || null,
        prompt,
        null,
        true,
      ],
    ];

    const content = [
      null,
      null,
      STUDIO_TYPES.getCode("report"),
      sourcesNested,
      null,
      null,
      null,
      reportOptions,
    ];

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createFlashcards(
    notebookId: string,
    sourceIds: string[],
    difficulty = "medium",
  ): Promise<string> {
    const difficultyCode = FLASHCARD_DIFFICULTIES.getCode(difficulty);
    const sourcesNested = this.formatSourcesNested(sourceIds);

    const flashcardOptions = [
      null,
      [1, null, null, null, null, null, [difficultyCode, FLASHCARD_COUNT_DEFAULT]],
    ];

    const content = [
      null,
      null,
      STUDIO_TYPES.getCode("flashcards"),
      sourcesNested,
      null,
      null,
      null,
      null,
      null,
      flashcardOptions,
    ];

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createQuiz(
    notebookId: string,
    sourceIds: string[],
    questionCount = 5,
    difficulty = "medium",
  ): Promise<string> {
    const difficultyCode = FLASHCARD_DIFFICULTIES.getCode(difficulty);
    const sourcesNested = this.formatSourcesNested(sourceIds);

    const quizOptions = [
      null,
      [2, null, null, null, null, null, null, [questionCount, difficultyCode]],
    ];

    const content = [
      null,
      null,
      STUDIO_TYPES.getCode("flashcards"), // shared type with flashcards
      sourcesNested,
      null,
      null,
      null,
      null,
      null,
      quizOptions,
    ];

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createDataTable(
    notebookId: string,
    sourceIds: string[],
    description: string,
    language?: string,
  ): Promise<string> {
    const sourcesNested = this.formatSourcesNested(sourceIds);

    const content: unknown[] = [
      null,
      null,
      STUDIO_TYPES.getCode("data_table"),
      sourcesNested,
    ];
    // Fill nulls up to position where data_table options go
    for (let i = 0; i < 14; i++) content.push(null);
    content.push([[description, language || null]]);

    const result = await this.execute(
      RPC_IDS.CREATE_STUDIO,
      [[2], notebookId, content],
      `/notebook/${notebookId}`,
    );
    const data = result as any[];
    return data?.[0] || "";
  }

  async createMindMap(
    notebookId: string,
    sourceIds: string[],
    title?: string,
  ): Promise<string> {
    const sourcesNested = this.formatSourcesNested(sourceIds);

    // Step 1: Generate mind map
    const genResult = await this.execute(
      RPC_IDS.GENERATE_MIND_MAP,
      [notebookId, sourcesNested, title || null],
      `/notebook/${notebookId}`,
    );

    const genData = genResult as any[];
    const mindMapData = genData?.[0];

    // Step 2: Save mind map
    const saveResult = await this.execute(
      RPC_IDS.SAVE_MIND_MAP,
      [notebookId, mindMapData, title || null],
      `/notebook/${notebookId}`,
    );

    const saveData = saveResult as any[];
    return saveData?.[0] || "";
  }

  async pollStudio(notebookId: string): Promise<StudioArtifact[]> {
    const result = await this.execute(
      RPC_IDS.POLL_STUDIO,
      [[2], notebookId],
      `/notebook/${notebookId}`,
    );

    const data = result as any[];
    if (!Array.isArray(data)) return [];

    const artifacts: StudioArtifact[] = [];
    const items = Array.isArray(data[0]) ? data[0] : data;

    for (const item of items) {
      if (!Array.isArray(item)) continue;
      const statusMap: Record<number, StudioArtifact["status"]> = {
        1: "pending",
        2: "generating",
        3: "completed",
        4: "failed",
      };

      // Google format: [id, title, type, sources, status, ...]
      artifacts.push({
        id: item[0] || "",
        type: STUDIO_TYPES.getName(item[2] ?? null),
        status: statusMap[item[4]] || "pending",
        download_url: item[5] || null,
      });
    }

    return artifacts;
  }

  async deleteStudio(
    notebookId: string,
    artifactId: string,
  ): Promise<void> {
    await this.execute(
      RPC_IDS.DELETE_STUDIO,
      [notebookId, artifactId],
      `/notebook/${notebookId}`,
    );
  }

  // ─── Chat Configure ─────────────────────────────────

  async chatConfigure(
    notebookId: string,
    goal?: string,
    customPrompt?: string,
    responseLength?: string,
  ): Promise<void> {
    const goalCode = goal ? CHAT_GOALS.getCode(goal) : 1;
    const lengthCode = responseLength
      ? CHAT_RESPONSE_LENGTHS.getCode(responseLength)
      : 1;

    await this.execute(
      RPC_IDS.PREFERENCES,
      [notebookId, goalCode, customPrompt || null, lengthCode],
      `/notebook/${notebookId}`,
    );
  }

  // ─── Auth Refresh (tool) ─────────────────────────────

  async refreshAuth(): Promise<void> {
    await this.refreshAuthTokens();
  }
}
