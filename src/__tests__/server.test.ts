import { describe, it, expect, vi, beforeEach } from "vitest";

const { registerToolSpy, McpServerCtor } = vi.hoisted(() => {
  const registerToolSpy = vi.fn();
  class McpServerCtor {
    registerTool = registerToolSpy;
  }
  return { registerToolSpy, McpServerCtor };
});

const { clientInstances, NotebookLMClientCtor } = vi.hoisted(() => {
  const clientInstances: any[] = [];
  class NotebookLMClientCtor {
    constructor(public tokens: any, public queryTimeout?: number) {
      clientInstances.push(this);
    }
  }
  return { clientInstances, NotebookLMClientCtor };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: McpServerCtor,
}));

vi.mock("../client.js", () => ({
  NotebookLMClient: NotebookLMClientCtor,
}));

vi.mock("../auth.js", () => ({
  loadTokens: vi.fn(() => ({
    cookies: { SID: "x", HSID: "x", SSID: "x", APISID: "x", SAPISID: "x" },
    csrf_token: "",
    session_id: "",
    extracted_at: 0,
  })),
  saveTokens: vi.fn(),
}));

import { notebookTools } from "../tools/notebook.js";
import { sourceTools } from "../tools/source.js";
import { studioTools } from "../tools/studio.js";
import { authTools } from "../tools/auth.js";
import { queryTools } from "../tools/query.js";
import { researchTools } from "../tools/research.js";

async function freshServerModule() {
  vi.resetModules();
  // Re-declare the module mocks because resetModules drops them.
  vi.doMock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: McpServerCtor,
  }));
  vi.doMock("../client.js", () => ({
    NotebookLMClient: NotebookLMClientCtor,
  }));
  vi.doMock("../auth.js", () => ({
    loadTokens: () => ({
      cookies: { SID: "x", HSID: "x", SSID: "x", APISID: "x", SAPISID: "x" },
      csrf_token: "",
      session_id: "",
      extracted_at: 0,
    }),
    saveTokens: vi.fn(),
  }));
  return import("../server.js");
}

beforeEach(() => {
  registerToolSpy.mockClear();
  clientInstances.length = 0;
});

describe("createServer", () => {
  it("constructs an McpServer and registers every tool exactly once", async () => {
    const { createServer } = await freshServerModule();
    const server = createServer();
    expect(server).toBeDefined();

    const allTools = [
      ...notebookTools,
      ...sourceTools,
      ...studioTools,
      ...authTools,
      ...queryTools,
      ...researchTools,
    ];
    const expectedNames = allTools.map((t) => t.name).sort();
    const registeredNames = registerToolSpy.mock.calls.map((c) => c[0]).sort();

    expect(registerToolSpy).toHaveBeenCalledTimes(allTools.length);
    expect(registeredNames).toEqual(expectedNames);
  });

  it("accepts optional queryTimeout", async () => {
    const { createServer } = await freshServerModule();
    expect(() => createServer(60000)).not.toThrow();
    expect(registerToolSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("lazy-inits the client on first tool invocation and reuses it", async () => {
    const { createServer } = await freshServerModule();
    createServer(5000);

    // Invoke the first registered tool handler to exercise getClient.
    const firstHandler = registerToolSpy.mock.calls[0][2];
    await firstHandler({});
    const secondHandler = registerToolSpy.mock.calls[1][2];
    await secondHandler({});

    // Only one NotebookLMClient should have been instantiated despite two tool calls.
    expect(clientInstances).toHaveLength(1);
    expect(clientInstances[0].queryTimeout).toBe(5000);
  });

  it("resets client when a tool returns _client_action=reset", async () => {
    const { createServer } = await freshServerModule();
    createServer();

    // save_auth_tokens is the reset-triggering tool; find its handler.
    const saveCall = registerToolSpy.mock.calls.find(
      (c) => c[0] === "save_auth_tokens",
    )!;
    const saveHandler = saveCall[2];

    // First invocation instantiates client #1, then resets.
    await saveHandler({});
    expect(clientInstances).toHaveLength(1);

    // Next tool call should build a fresh client because reset nulled the cached one.
    const otherHandler = registerToolSpy.mock.calls.find(
      (c) => c[0] === "notebook_list",
    )![2];
    await otherHandler({});
    expect(clientInstances).toHaveLength(2);
  });
});
