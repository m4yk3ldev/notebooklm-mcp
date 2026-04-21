import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const serverInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
  };
  return {
    createServerMock: vi.fn(() => serverInstance),
    stdioCtor: vi.fn(function (this: any) {
      this._tag = "stdio";
    }),
    runAuthFlowMock: vi.fn(async () => ({})),
    runFileImportMock: vi.fn(async () => ({})),
    showTokensMock: vi.fn(() => {}),
    runBrowserAuthFlowMock: vi.fn(async () => ({})),
    serverInstance,
  };
});

vi.mock("../server.js", () => ({ createServer: hoisted.createServerMock }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: hoisted.stdioCtor,
}));
vi.mock("../auth.js", () => ({
  runAuthFlow: hoisted.runAuthFlowMock,
  runFileImport: hoisted.runFileImportMock,
  showTokens: hoisted.showTokensMock,
  saveTokens: vi.fn(),
}));
vi.mock("../browser-auth.js", () => ({
  runBrowserAuthFlow: hoisted.runBrowserAuthFlowMock,
}));

import { main, buildProgram } from "../cli.js";

beforeEach(() => {
  Object.values(hoisted).forEach((v: any) => {
    if (typeof v === "function" && v.mockClear) v.mockClear();
  });
  hoisted.serverInstance.connect.mockClear();
});

describe("buildProgram", () => {
  it("exposes serve and auth commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(["auth", "serve"]);
  });
});

describe("cli serve", () => {
  it("boots the MCP server over stdio with default timeout", async () => {
    await main(["node", "cli.js", "serve"]);
    expect(hoisted.createServerMock).toHaveBeenCalledWith(120000);
    expect(hoisted.serverInstance.connect).toHaveBeenCalledOnce();
  });

  it("honours --query-timeout", async () => {
    await main(["node", "cli.js", "serve", "--query-timeout", "5000"]);
    expect(hoisted.createServerMock).toHaveBeenCalledWith(5000);
  });

  it("defaults to serve when no args provided (argv <= 2)", async () => {
    await main(["node", "cli.js"]);
    expect(hoisted.createServerMock).toHaveBeenCalled();
  });
});

describe("cli auth", () => {
  it("--show-tokens prints cached tokens and exits", async () => {
    await main(["node", "cli.js", "auth", "--show-tokens"]);
    expect(hoisted.showTokensMock).toHaveBeenCalledOnce();
    expect(hoisted.runAuthFlowMock).not.toHaveBeenCalled();
    expect(hoisted.runBrowserAuthFlowMock).not.toHaveBeenCalled();
  });

  it("--file triggers runFileImport", async () => {
    await main(["node", "cli.js", "auth", "--file", "/tmp/cookies.txt"]);
    expect(hoisted.runFileImportMock).toHaveBeenCalledWith("/tmp/cookies.txt");
  });

  it("--manual triggers interactive runAuthFlow", async () => {
    await main(["node", "cli.js", "auth", "--manual"]);
    expect(hoisted.runAuthFlowMock).toHaveBeenCalledOnce();
    expect(hoisted.runBrowserAuthFlowMock).not.toHaveBeenCalled();
  });

  it("default auth path uses headless browser flow", async () => {
    hoisted.runBrowserAuthFlowMock.mockResolvedValueOnce({} as any);
    await main(["node", "cli.js", "auth"]);
    expect(hoisted.runBrowserAuthFlowMock).toHaveBeenCalledOnce();
    expect(hoisted.runAuthFlowMock).not.toHaveBeenCalled();
  });

  it("falls back to manual flow when headless browser flow throws", async () => {
    hoisted.runBrowserAuthFlowMock.mockRejectedValueOnce(new Error("no chrome"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await main(["node", "cli.js", "auth"]);
    expect(hoisted.runBrowserAuthFlowMock).toHaveBeenCalledOnce();
    expect(hoisted.runAuthFlowMock).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
