# @m4yk3ldev/notebooklm-mcp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server for NotebookLM with 32 tools, cookie-based auth, and npx support.

**Architecture:** Monolito modular — 6 archivos en src/ (cli, server, client, auth, constants, types). Usa @modelcontextprotocol/sdk para el server MCP, fetch nativo para HTTP, y Chrome DevTools Protocol para auth.

**Tech Stack:** TypeScript 5.x, Node.js ≥ 18, @modelcontextprotocol/sdk, commander, chrome-launcher, chrome-remote-interface, zod, tsup

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "@m4yk3ldev/notebooklm-mcp",
  "version": "0.1.0",
  "description": "MCP server for Google NotebookLM — 32 tools for notebooks, sources, research, and studio content generation",
  "type": "module",
  "bin": {
    "notebooklm-mcp": "./dist/cli.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": ["mcp", "notebooklm", "google", "ai", "model-context-protocol"],
  "author": "m4yk3ldev",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/m4yk3ldev/notebooklm-mcp"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^12.0.0",
    "chrome-launcher": "^1.1.0",
    "chrome-remote-interface": "^0.33.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.tgz
.env
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: node_modules created, package-lock.json generated

**Step 6: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts .gitignore package-lock.json
git commit -m "chore: scaffold project with TypeScript, tsup, and MCP SDK"
```

---

## Task 2: Types module

**Files:**
- Create: `src/types.ts`

**Step 1: Write types**

```typescript
export interface AuthTokens {
  cookies: Record<string, string>;
  csrf_token: string;
  session_id: string;
  extracted_at: number;
}

export interface Notebook {
  id: string;
  title: string;
  emoji: string | null;
  sources: SourceSummary[];
  is_shared: boolean;
  ownership: "mine" | "shared";
  created_at: string | null;
  modified_at: string | null;
}

export interface SourceSummary {
  id: string;
  title: string;
  type: string;
}

export interface SourceDetail extends SourceSummary {
  content: string | null;
  summary: string | null;
  keywords: string[];
}

export interface ResearchResult {
  task_id: string;
  status: "in_progress" | "completed" | "imported";
  query: string;
  sources: ResearchSource[];
  summary: string | null;
}

export interface ResearchSource {
  url: string | null;
  title: string;
  description: string | null;
  type: string;
}

export interface StudioArtifact {
  id: string;
  type: string;
  status: "pending" | "generating" | "completed" | "failed";
  download_url: string | null;
}

export interface QueryResponse {
  answer: string;
  conversation_id: string | null;
  sources_used: string[];
}

export interface ToolResult {
  status: "success" | "error" | "pending_confirmation";
  [key: string]: unknown;
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 3: Constants module

**Files:**
- Create: `src/constants.ts`

**Step 1: Write CodeMapper class and all constants**

```typescript
export class CodeMapper {
  private nameToCode: Map<string, number>;
  private codeToName: Map<number, string>;
  private unknownLabel: string;
  private displayNames: string[];

  constructor(mapping: Record<string, number>, unknownLabel = "unknown") {
    this.nameToCode = new Map(
      Object.entries(mapping).map(([k, v]) => [k.toLowerCase(), v])
    );
    this.codeToName = new Map(
      Object.entries(mapping).map(([k, v]) => [v, k])
    );
    this.unknownLabel = unknownLabel;
    this.displayNames = Object.keys(mapping).sort();
  }

  getCode(name: string): number {
    const code = this.nameToCode.get(name.toLowerCase());
    if (code === undefined) {
      throw new Error(
        `Invalid value "${name}". Valid options: ${this.optionsStr()}`
      );
    }
    return code;
  }

  getName(code: number | null): string {
    if (code === null) return this.unknownLabel;
    return this.codeToName.get(code) ?? this.unknownLabel;
  }

  optionsStr(): string {
    return this.displayNames.join(", ");
  }

  names(): string[] {
    return [...this.displayNames];
  }
}

// RPC IDs
export const RPC_IDS = {
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
  GET_CONVERSATIONS: "hPTbtc",
  PREFERENCES: "hT54vc",
  SUBSCRIPTION: "ozz5Z",
  SETTINGS: "ZwVcOc",
  GET_SUMMARY: "VfAZjd",
  GET_SOURCE_GUIDE: "tr032e",
  START_FAST_RESEARCH: "Ljjv0c",
  START_DEEP_RESEARCH: "QA9ei",
  POLL_RESEARCH: "e3bVqc",
  IMPORT_RESEARCH: "LBwxtb",
  CREATE_STUDIO: "R7cb6c",
  POLL_STUDIO: "gArtLc",
  DELETE_STUDIO: "V5N4be",
  GENERATE_MIND_MAP: "yyryJe",
  SAVE_MIND_MAP: "CYK0Xb",
  LIST_MIND_MAPS: "cFji9",
  DELETE_MIND_MAP: "AH0mwd",
} as const;

// Ownership
export const OWNERSHIP_MINE = 1;
export const OWNERSHIP_SHARED = 2;

// Chat
export const CHAT_GOALS = new CodeMapper({
  default: 1,
  custom: 2,
  learning_guide: 3,
});

export const CHAT_RESPONSE_LENGTHS = new CodeMapper({
  default: 1,
  longer: 4,
  shorter: 5,
});

// Research
export const RESEARCH_SOURCES = new CodeMapper({ web: 1, drive: 2 });
export const RESEARCH_MODES = new CodeMapper({ fast: 1, deep: 5 });
export const RESULT_TYPES = new CodeMapper({
  web: 1,
  google_doc: 2,
  google_slides: 3,
  deep_report: 5,
  google_sheets: 8,
});

// Source Types
export const SOURCE_TYPES = new CodeMapper({
  google_docs: 1,
  google_slides_sheets: 2,
  pdf: 3,
  pasted_text: 4,
  web_page: 5,
  generated_text: 8,
  youtube: 9,
  uploaded_file: 11,
  image: 13,
  word_doc: 14,
});

// Studio Types
export const STUDIO_TYPES = new CodeMapper({
  audio: 1,
  report: 2,
  video: 3,
  flashcards: 4,
  infographic: 7,
  slide_deck: 8,
  data_table: 9,
});

// Audio
export const AUDIO_FORMATS = new CodeMapper({
  deep_dive: 1,
  brief: 2,
  critique: 3,
  debate: 4,
});

export const AUDIO_LENGTHS = new CodeMapper({
  short: 1,
  default: 2,
  long: 3,
});

// Video
export const VIDEO_FORMATS = new CodeMapper({ explainer: 1, brief: 2 });

export const VIDEO_STYLES = new CodeMapper({
  auto_select: 1,
  custom: 2,
  classic: 3,
  whiteboard: 4,
  kawaii: 5,
  anime: 6,
  watercolor: 7,
  retro_print: 8,
  heritage: 9,
  paper_craft: 10,
});

// Infographic
export const INFOGRAPHIC_ORIENTATIONS = new CodeMapper({
  landscape: 1,
  portrait: 2,
  square: 3,
});

export const INFOGRAPHIC_DETAILS = new CodeMapper({
  concise: 1,
  standard: 2,
  detailed: 3,
});

// Slide Deck
export const SLIDE_DECK_FORMATS = new CodeMapper({
  detailed_deck: 1,
  presenter_slides: 2,
});

export const SLIDE_DECK_LENGTHS = new CodeMapper({
  short: 1,
  default: 3,
});

// Flashcards/Quiz
export const FLASHCARD_DIFFICULTIES = new CodeMapper({
  easy: 1,
  medium: 2,
  hard: 3,
});

export const FLASHCARD_COUNT_DEFAULT = 2;

// Report Formats
export const REPORT_FORMATS: Record<
  string,
  { title: string; description: string; prompt: string }
> = {
  "Briefing Doc": {
    title: "Briefing Doc",
    description: "A comprehensive briefing document",
    prompt: "Create a briefing document",
  },
  "Study Guide": {
    title: "Study Guide",
    description: "A study guide for the material",
    prompt: "Create a study guide",
  },
  "Blog Post": {
    title: "Blog Post",
    description: "A blog post about the material",
    prompt: "Create a blog post",
  },
  "Create Your Own": {
    title: "Create Your Own",
    description: "Custom report format",
    prompt: "",
  },
};

// Base URL
export const BASE_URL = "https://notebooklm.google.com";
export const BATCHEXECUTE_PATH =
  "/_/LabsTailwindUi/data/batchexecute";
export const QUERY_PATH =
  "/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed";

export const DEFAULT_BL =
  "boq_labs-tailwind-frontend_20260108.06_p0";

export const REQUIRED_COOKIES = [
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
];

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT = 30_000;
export const EXTENDED_TIMEOUT = 120_000;
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add constants, RPC IDs, and CodeMapper"
```

---

## Task 4: Auth module

**Files:**
- Create: `src/auth.ts`

**Step 1: Write auth module**

Implement:
- `loadTokens()` — load from env vars or cache file
- `saveTokens(tokens)` — save to `~/.notebooklm-mcp/auth.json`
- `validateCookies(cookies)` — check 5 required cookies
- `extractCsrfFromPage(html)` — regex patterns SNlM0e, at=, FdrFJe
- `extractSessionIdFromPage(html)` — regex patterns FdrFJe, f.sid
- `buildCookieHeader(cookies)` — "key1=val1; key2=val2"
- `runAuthFlow(port)` — Chrome DevTools automation via chrome-remote-interface
- `runFileImport(filePath)` — parse cookie string from file

Reference the Python `auth.py` and `auth_cli.py` for exact behavior:
- Cache path: `~/.notebooklm-mcp/auth.json`
- Chrome profile: `~/.notebooklm-mcp/chrome-profile`
- Chrome args: `--remote-debugging-port`, `--no-first-run`, `--no-default-browser-check`, `--disable-extensions`, `--user-data-dir`, `--remote-allow-origins=*`
- CDP commands: `Network.getCookies`, `Runtime.enable`, `Runtime.evaluate` (document.documentElement.outerHTML)
- Login check: URL contains `accounts.google.com` = not logged in
- Poll interval: 5 seconds, max wait: 5 minutes

Key patterns for CSRF extraction (in order):
1. `/"SNlM0e":"([^"]+)"/`
2. `/at=([^&"]+)/`
3. `/"FdrFJe":"([^"]+)"/`

Session ID patterns:
1. `/"FdrFJe":"([^"]+)"/`
2. `/f\.sid=(\d+)/`

Env var fallbacks:
- `NOTEBOOKLM_COOKIES` — cookie header string
- `NOTEBOOKLM_CSRF_TOKEN`
- `NOTEBOOKLM_SESSION_ID`

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/auth.ts
git commit -m "feat: add auth module with Chrome DevTools and env var support"
```

---

## Task 5: API Client — core HTTP and RPC

**Files:**
- Create: `src/client.ts`

**Step 1: Write NotebookLMClient class — core methods**

Implement the class with:

```typescript
export class NotebookLMClient {
  private tokens: AuthTokens;
  private csrfToken: string;
  private sessionId: string;
  private conversationHistory: Map<string, unknown[]>;
  private queryTimeout: number;
  private reqId: number;

  constructor(tokens: AuthTokens, queryTimeout?: number);

  // Core private methods:
  private buildRequestBody(rpcId: string, params: unknown): string;
  private buildUrl(rpcId: string, sourcePath?: string): string;
  private buildQueryUrl(sourcePath?: string): string;
  private parseResponse(responseText: string): unknown[];
  private extractRpcResult(parsed: unknown[], rpcId: string): unknown;
  private async execute(rpcId: string, params: unknown, sourcePath?: string, timeout?: number): Promise<unknown>;
  private async refreshAuthTokens(): Promise<void>;
}
```

Build URL logic:
```
{BASE_URL}{BATCHEXECUTE_PATH}?rpcids={rpcId}&source-path={sourcePath}&bl={DEFAULT_BL}&hl=en&rt=c&f.sid={sessionId}
```

Build request body:
```
f.req={urlEncode(JSON.stringify([[[rpcId, JSON.stringify(params), null, "generic"]]]))}&at={urlEncode(csrfToken)}&
```
IMPORTANT: Trailing `&`, compact JSON (no spaces).

Parse response:
1. Strip `)]}'` prefix
2. Split by newlines
3. Alternate: byte_count line, then JSON line
4. Parse each JSON line

Extract RPC result:
- Look for `["wrb.fr", rpcId, resultJsonString, ...]` in parsed chunks
- Error 16 in position [5] = auth expired
- Parse resultJsonString as JSON

Headers for batchexecute:
```
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
Origin: https://notebooklm.google.com
Referer: https://notebooklm.google.com/
Cookie: {cookieHeader}
X-Same-Domain: 1
User-Agent: {USER_AGENT}
```

Auto-refresh: If auth error (code 16), fetch the page HTML, re-extract CSRF and session ID, retry once.

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/client.ts
git commit -m "feat: add NotebookLMClient core — HTTP, RPC, response parsing"
```

---

## Task 6: API Client — notebook methods

**Files:**
- Modify: `src/client.ts`

**Step 1: Add notebook methods to NotebookLMClient**

```typescript
async listNotebooks(maxResults?: number): Promise<Notebook[]>;
async getNotebook(notebookId: string): Promise<Notebook>;
async createNotebook(title: string): Promise<Notebook>;
async renameNotebook(notebookId: string, newTitle: string): Promise<void>;
async deleteNotebook(notebookId: string): Promise<void>;
async describeNotebook(notebookId: string): Promise<string>;
```

RPC params (exact structures from Python):
- `listNotebooks`: `[null, 1, null, [2]]`, RPC `wXbhsf`
- `getNotebook`: `[notebookId, null, [2], null, 0]`, RPC `rLM1Ne`, path `/notebook/{id}`
- `createNotebook`: `[title, null, null, [2], [1,null,null,null,null,null,null,null,null,null,[1]]]`, RPC `CCqFvf`
- `renameNotebook`: `[notebookId, [[null,null,null,[null,newTitle]]]]`, RPC `s0tc2d`, path `/notebook/{id}`
- `deleteNotebook`: `[notebookId]`, RPC `WWINqb`, path `/notebook/{id}`
- `describeNotebook`: `[notebookId, null, [2]]`, RPC `VfAZjd`, path `/notebook/{id}`

Response parsing for notebooks:
- Title at [0], sources at [1], ID at [2], emoji at [3]
- Metadata at [5]: ownership=[5][0], is_shared=[5][1], modified_at=[5][5], created_at=[5][8]
- Timestamp arrays: [seconds, nanos] → ISO string

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/client.ts
git commit -m "feat: add notebook CRUD methods to client"
```

---

## Task 7: API Client — source methods

**Files:**
- Modify: `src/client.ts`

**Step 1: Add source methods**

```typescript
async addUrlSource(notebookId: string, url: string): Promise<SourceSummary>;
async addTextSource(notebookId: string, text: string, title: string): Promise<SourceSummary>;
async addDriveSource(notebookId: string, documentId: string, title: string, mimeType: string): Promise<SourceSummary>;
async getSource(sourceId: string, notebookId: string): Promise<SourceDetail>;
async getSourceGuide(sourceId: string, notebookId: string): Promise<{ summary: string; keywords: string[] }>;
async checkFreshness(sourceId: string, notebookId: string): Promise<boolean | null>;
async syncDrive(sourceIds: string[], notebookId: string): Promise<void>;
async deleteSource(sourceId: string, notebookId: string): Promise<void>;
```

URL source params (detect YouTube vs website):
- YouTube: `[null,null,null,null,null,null,null,[url],null,null,1]`
- Website: `[null,null,[url],null,null,null,null,null,null,null,1]`
- Wrap in: `[[sourceData], notebookId, [2], [1,null,null,null,null,null,null,null,null,null,[1]]]`

Text source: `[null,[title,text],null,2,null,null,null,null,null,null,1]`
Drive source: `[[documentId,mimeType,1,title],null,null,null,null,null,null,null,null,null,1]`

All add_source use RPC `izAoDd` with 120s timeout.

**Step 2: Verify build & commit**

```bash
git add src/client.ts
git commit -m "feat: add source CRUD methods to client"
```

---

## Task 8: API Client — query method

**Files:**
- Modify: `src/client.ts`

**Step 1: Add query method**

```typescript
async query(notebookId: string, queryText: string, sourceIds?: string[], conversationId?: string): Promise<QueryResponse>;
```

IMPORTANT: Query uses a DIFFERENT endpoint and format than batchexecute:
- URL: `{BASE_URL}{QUERY_PATH}?bl={BL}&hl=en&_reqid={reqId}&rt=c&f.sid={sessionId}`
- Body: `f.req={urlEncode(JSON.stringify([null, paramsJson]))}&`
- Sources nested: `[[[sid]] for sid in sourceIds]`
- Conversation history tracking in `this.conversationHistory` map
- Response parsing: find longest Type 1 chunk (answer vs thinking)

**Step 2: Verify build & commit**

```bash
git add src/client.ts
git commit -m "feat: add query method with conversation history"
```

---

## Task 9: API Client — research methods

**Files:**
- Modify: `src/client.ts`

**Step 1: Add research methods**

```typescript
async startResearch(notebookId: string, query: string, source: string, mode: string): Promise<{ taskId: string }>;
async pollResearch(notebookId: string, taskId?: string): Promise<ResearchResult[]>;
async importResearch(notebookId: string, taskId: string, sourceIndices?: number[]): Promise<void>;
```

Fast research RPC `Ljjv0c`: `[[query, sourceCode], null, 1, notebookId]`
Deep research RPC `QA9ei`: `[null, [1], [query, sourceCode], 5, notebookId]`
Poll RPC `e3bVqc`: `[null, null, notebookId]`, path `/notebook/{id}`
Import RPC `LBwxtb`: `[notebookId, taskId, indices]`, timeout 120s

**Step 2: Verify build & commit**

```bash
git add src/client.ts
git commit -m "feat: add research methods to client"
```

---

## Task 10: API Client — studio methods

**Files:**
- Modify: `src/client.ts`

**Step 1: Add studio creation methods**

```typescript
async createAudioOverview(notebookId: string, sourceIds: string[], options: AudioOptions): Promise<string>;
async createVideoOverview(notebookId: string, sourceIds: string[], options: VideoOptions): Promise<string>;
async createInfographic(notebookId: string, sourceIds: string[], options: InfographicOptions): Promise<string>;
async createSlideDeck(notebookId: string, sourceIds: string[], options: SlideDeckOptions): Promise<string>;
async createReport(notebookId: string, sourceIds: string[], options: ReportOptions): Promise<string>;
async createFlashcards(notebookId: string, sourceIds: string[], difficulty: string): Promise<string>;
async createQuiz(notebookId: string, sourceIds: string[], questionCount: number, difficulty: string): Promise<string>;
async createDataTable(notebookId: string, sourceIds: string[], description: string, language?: string): Promise<string>;
async createMindMap(notebookId: string, sourceIds: string[], title?: string): Promise<string>;
async pollStudio(notebookId: string): Promise<StudioArtifact[]>;
async deleteStudio(notebookId: string, artifactId: string): Promise<void>;
```

All studio creation uses RPC `R7cb6c`. Sources format:
- Nested: `[[[sid]] for sid in sourceIds]`
- Simple: `[[sid] for sid in sourceIds]`

Each studio type has different option positions in the content array — follow the exact Python structures documented in the exploration. Key positions:
- Audio: options at position [6] in content
- Video: options at position [8]
- Infographic: options at position [14]
- Slide deck: options at position [16]
- Report: options at position [7]
- Flashcards/Quiz: options at position [9]

Mind map uses separate RPCs: `yyryJe` (generate) → `CYK0Xb` (save)

**Step 2: Add chat_configure method**

```typescript
async chatConfigure(notebookId: string, goal: string, customPrompt?: string, responseLength?: string): Promise<void>;
```

**Step 3: Verify build & commit**

```bash
git add src/client.ts
git commit -m "feat: add studio and chat methods to client"
```

---

## Task 11: MCP Server — notebook and source tools

**Files:**
- Create: `src/server.ts`

**Step 1: Create MCP server and register notebook/source tools**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

let client: NotebookLMClient | null = null;

function getClient(): NotebookLMClient {
  if (!client) {
    const tokens = loadTokens();
    client = new NotebookLMClient(tokens);
  }
  return client;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "notebooklm",
    version: "0.1.0",
  });

  // Register all 32 tools...
  return server;
}
```

Register these tools with Zod schemas:
- `notebook_list` — `{ max_results?: z.number() }`
- `notebook_create` — `{ title: z.string() }`
- `notebook_get` — `{ notebook_id: z.string() }`
- `notebook_describe` — `{ notebook_id: z.string() }`
- `notebook_rename` — `{ notebook_id: z.string(), new_title: z.string() }`
- `notebook_delete` — `{ notebook_id: z.string(), confirm: z.boolean() }`
- `source_describe` — `{ notebook_id: z.string(), source_id: z.string() }`
- `source_get_content` — `{ notebook_id: z.string(), source_id: z.string() }`
- `notebook_add_url` — `{ notebook_id: z.string(), url: z.string() }`
- `notebook_add_text` — `{ notebook_id: z.string(), text: z.string(), title: z.string() }`
- `notebook_add_drive` — `{ notebook_id: z.string(), document_id: z.string(), title: z.string(), doc_type: z.string() }`
- `source_list_drive` — `{ notebook_id: z.string() }`
- `source_sync_drive` — `{ notebook_id: z.string(), source_ids: z.array(z.string()), confirm: z.boolean() }`
- `source_delete` — `{ notebook_id: z.string(), source_id: z.string(), confirm: z.boolean() }`

Each handler: try/catch → `{ status: "success"|"error", ... }`
Tools with `confirm`: if `confirm !== true`, return `{ status: "pending_confirmation", message: "..." }`

**Step 2: Verify build & commit**

```bash
git add src/server.ts
git commit -m "feat: add MCP server with notebook and source tools"
```

---

## Task 12: MCP Server — query, research, studio, and auth tools

**Files:**
- Modify: `src/server.ts`

**Step 1: Register remaining 18 tools**

Query tools:
- `notebook_query` — `{ notebook_id, query, source_ids?, conversation_id? }`
- `chat_configure` — `{ notebook_id, goal?, custom_prompt?, response_length? }`

Research tools:
- `research_start` — `{ notebook_id?, query, source?, mode?, title? }`
- `research_status` — `{ notebook_id, task_id?, poll_interval?, max_wait?, compact? }`
- `research_import` — `{ notebook_id, task_id, source_indices? }`

Studio creation tools (all require confirm):
- `audio_overview_create` — `{ notebook_id, source_ids?, format?, length?, language?, focus_prompt?, confirm }`
- `video_overview_create` — `{ notebook_id, source_ids?, format?, visual_style?, language?, focus_prompt?, confirm }`
- `infographic_create` — `{ notebook_id, source_ids?, orientation?, detail_level?, language?, focus_prompt?, confirm }`
- `slide_deck_create` — `{ notebook_id, source_ids?, format?, length?, language?, focus_prompt?, confirm }`
- `report_create` — `{ notebook_id, source_ids?, report_format?, custom_prompt?, language?, confirm }`
- `flashcards_create` — `{ notebook_id, source_ids?, difficulty?, confirm }`
- `quiz_create` — `{ notebook_id, source_ids?, question_count?, difficulty?, confirm }`
- `data_table_create` — `{ notebook_id, description, source_ids?, language?, confirm }`
- `mind_map_create` — `{ notebook_id, source_ids?, title?, confirm }`
- `studio_status` — `{ notebook_id }`
- `studio_delete` — `{ notebook_id, artifact_id, confirm }`

Auth tools:
- `refresh_auth` — `{}` (no params)
- `save_auth_tokens` — `{ cookies?, csrf_token?, session_id? }`

**Step 2: Verify build & commit**

```bash
git add src/server.ts
git commit -m "feat: register all 32 MCP tools"
```

---

## Task 13: CLI module

**Files:**
- Create: `src/cli.ts`

**Step 1: Write CLI with commander**

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { runAuthFlow, loadTokens } from "./auth.js";

const program = new Command();

program
  .name("notebooklm-mcp")
  .description("MCP server for Google NotebookLM")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the MCP server (stdio transport)")
  .option("--debug", "Enable debug logging")
  .option("--query-timeout <ms>", "Query timeout in ms", "120000")
  .action(async (opts) => {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

program
  .command("auth")
  .description("Authenticate with NotebookLM via Chrome")
  .option("--port <port>", "Chrome DevTools port", "9222")
  .option("--file [path]", "Import cookies from file")
  .option("--show-tokens", "Show cached tokens")
  .option("--no-auto-launch", "Don't launch Chrome automatically")
  .action(async (opts) => {
    if (opts.showTokens) {
      const tokens = loadTokens();
      // Display token info (not secrets)
      return;
    }
    if (opts.file !== undefined) {
      // File import mode
      return;
    }
    // Auto mode
    await runAuthFlow(parseInt(opts.port));
  });

program.parse();
```

**Step 2: Build and test CLI**

Run: `npm run build`
Expected: `dist/cli.js` created with shebang

Run: `node dist/cli.js --help`
Expected: Shows help with serve and auth commands

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI with serve and auth subcommands"
```

---

## Task 14: Build, verify, and prepare for publish

**Files:**
- Modify: `package.json` (if needed)

**Step 1: Full build**

Run: `npm run build`
Expected: `dist/cli.js` created, no errors

**Step 2: Test CLI locally**

Run: `node dist/cli.js --help`
Expected: Shows help

Run: `node dist/cli.js serve --help`
Expected: Shows serve options

Run: `node dist/cli.js auth --help`
Expected: Shows auth options

**Step 3: Test as npx-like binary**

Run: `npm link`
Run: `notebooklm-mcp --help`
Expected: Works as global command

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: complete build pipeline, ready for npm publish"
```

---

## Task 15: Create GitHub repo and push

**Step 1: Create GitHub repo**

Run: `gh repo create m4yk3ldev/notebooklm-mcp --public --source=. --push`

**Step 2: Verify on GitHub**

Run: `gh repo view m4yk3ldev/notebooklm-mcp --web`

---

## Task 16: Authenticate and test with NotebookLM

**Step 1: Run auth**

Run: `node dist/cli.js auth`
Follow Chrome login flow.

**Step 2: Verify auth tokens saved**

Run: `node dist/cli.js auth --show-tokens`
Expected: Shows token info (not secrets)

**Step 3: Test MCP server manually**

Start server and send a test list_notebooks call to verify the 32 tools work.

---

## Task 17: Publish to npm

**Step 1: Login to npm**

Run: `npm login`

**Step 2: Publish**

Run: `npm publish --access public`

**Step 3: Verify**

Run: `npx -y @m4yk3ldev/notebooklm-mcp --help`
Expected: Works from npm registry

**Step 4: Commit tag**

```bash
git tag v0.1.0
git push --tags
```
