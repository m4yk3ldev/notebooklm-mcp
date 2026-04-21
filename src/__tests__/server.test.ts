import { describe, it, expect, vi } from "vitest";

const { registerToolSpy, McpServerCtor } = vi.hoisted(() => {
  const registerToolSpy = vi.fn();
  class McpServerCtor {
    registerTool = registerToolSpy;
  }
  return { registerToolSpy, McpServerCtor };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: McpServerCtor,
}));

// Avoid loading real tokens or hitting disk when the server lazily inits a client.
vi.mock("../auth.js", () => ({
  loadTokens: vi.fn(() => ({
    cookies: { SID: "x", HSID: "x", SSID: "x", APISID: "x", SAPISID: "x" },
    csrf_token: "",
    session_id: "",
    extracted_at: 0,
  })),
  saveTokens: vi.fn(),
}));

import { createServer } from "../server.js";
import { notebookTools } from "../tools/notebook.js";
import { sourceTools } from "../tools/source.js";
import { studioTools } from "../tools/studio.js";
import { authTools } from "../tools/auth.js";
import { queryTools } from "../tools/query.js";
import { researchTools } from "../tools/research.js";

describe("createServer", () => {
  it("constructs an McpServer and registers every tool exactly once", () => {
    registerToolSpy.mockClear();

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

  it("accepts optional queryTimeout", () => {
    registerToolSpy.mockClear();
    expect(() => createServer(60000)).not.toThrow();
    expect(registerToolSpy.mock.calls.length).toBeGreaterThan(0);
  });
});
