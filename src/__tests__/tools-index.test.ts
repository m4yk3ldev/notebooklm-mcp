import { describe, it, expect, vi } from "vitest";
import { registerTools, pendingConfirmation, type McpTool } from "../tools/index.js";

function makeServerStub() {
  const registered: Record<
    string,
    (args: any) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>
  > = {};
  const server = {
    registerTool: vi.fn((name: string, _config: any, handler: any) => {
      registered[name] = handler;
    }),
  };
  return { server, registered };
}

function parseResult(result: {
  content: Array<{ text: string }>;
  isError?: boolean;
}) {
  return { body: JSON.parse(result.content[0].text), isError: result.isError };
}

describe("pendingConfirmation", () => {
  it("produces the expected shape", () => {
    expect(pendingConfirmation("are you sure?")).toEqual({
      status: "pending_confirmation",
      message: "are you sure?",
    });
  });
});

describe("registerTools", () => {
  it("registers every tool on the server", () => {
    const { server, registered } = makeServerStub();
    const tools: McpTool<any>[] = [
      { name: "a", description: "A", execute: async () => ({}) },
      { name: "b", description: "B", execute: async () => ({}) },
    ];

    registerTools(server as any, tools, () => ({}) as any);

    expect(server.registerTool).toHaveBeenCalledTimes(2);
    expect(Object.keys(registered)).toEqual(["a", "b"]);
  });

  it("passes inputSchema only when tool declares schema", () => {
    const { server } = makeServerStub();
    const tools: McpTool<any>[] = [
      { name: "bare", description: "no schema", execute: async () => ({}) },
      {
        name: "typed",
        description: "with schema",
        schema: { foo: { _def: {} } as any },
        execute: async () => ({}),
      },
    ];

    registerTools(server as any, tools, () => ({}) as any);

    const bareConfig = server.registerTool.mock.calls[0][1];
    const typedConfig = server.registerTool.mock.calls[1][1];
    expect(bareConfig.inputSchema).toBeUndefined();
    expect(typedConfig.inputSchema).toBeDefined();
  });

  it("wraps tool results as JSON with status=success", async () => {
    const { server, registered } = makeServerStub();
    const tools: McpTool<any>[] = [
      {
        name: "echo",
        description: "echo",
        execute: async (_c, args) => ({ echoed: args }),
      },
    ];
    registerTools(server as any, tools, () => ({ tag: "client" }) as any);

    const { body, isError } = parseResult(await registered.echo({ hello: "world" }));
    expect(isError).toBeUndefined();
    expect(body).toEqual({ status: "success", echoed: { hello: "world" } });
  });

  it("wraps thrown errors as JSON with isError=true", async () => {
    const { server, registered } = makeServerStub();
    const tools: McpTool<any>[] = [
      {
        name: "boom",
        description: "boom",
        execute: async () => {
          throw new Error("kaboom");
        },
      },
    ];
    registerTools(server as any, tools, () => ({}) as any);

    const { body, isError } = parseResult(await registered.boom({}));
    expect(isError).toBe(true);
    expect(body.status).toBe("error");
    expect(body.error).toContain("kaboom");
  });

  it("triggers onClientReset and strips the marker when tool returns _client_action=reset", async () => {
    const { server, registered } = makeServerStub();
    const onClientReset = vi.fn();
    const tools: McpTool<any>[] = [
      {
        name: "reauth",
        description: "reset",
        execute: async () => ({ message: "done", _client_action: "reset" }),
      },
    ];

    registerTools(server as any, tools, () => ({}) as any, { onClientReset });

    const { body } = parseResult(await registered.reauth({}));
    expect(onClientReset).toHaveBeenCalledOnce();
    expect(body).toEqual({ status: "success", message: "done" });
    expect(body._client_action).toBeUndefined();
  });

  it("passes queryTimeout through to getClient and execute opts", async () => {
    const { server, registered } = makeServerStub();
    const getClient = vi.fn(() => ({ _tag: "c" }) as any);
    const execute = vi.fn(async () => ({}));
    const tools: McpTool<any>[] = [{ name: "t", description: "t", execute }];

    registerTools(server as any, tools, getClient, { queryTimeout: 5000 });

    await registered.t({});
    expect(getClient).toHaveBeenCalledWith(5000);
    expect(execute).toHaveBeenCalledWith(
      { _tag: "c" },
      {},
      { queryTimeout: 5000 },
    );
  });
});
