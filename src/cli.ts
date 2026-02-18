import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { runAuthFlow, runFileImport, showTokens } from "./auth.js";

const program = new Command();

program
  .name("notebooklm-mcp")
  .description("MCP server for Google NotebookLM")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the MCP server (stdio transport)")
  .option("--debug", "Enable debug logging")
  .option("--query-timeout <ms>", "Query timeout in milliseconds", "120000")
  .action(async (opts) => {
    const queryTimeout = parseInt(opts.queryTimeout, 10);
    const server = createServer(queryTimeout);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

program
  .command("auth")
  .description("Authenticate with NotebookLM via Chrome")
  .option("--port <port>", "Chrome DevTools port", "9222")
  .option("--file [path]", "Import cookies from file")
  .option("--show-tokens", "Show cached tokens (no secrets)")
  .option("--no-auto-launch", "Don't launch Chrome automatically")
  .action(async (opts) => {
    if (opts.showTokens) {
      showTokens();
      return;
    }

    if (opts.file !== undefined) {
      const filePath = typeof opts.file === "string" ? opts.file : undefined;
      await runFileImport(filePath);
      return;
    }

    await runAuthFlow(parseInt(opts.port, 10));
  });

// Default command: serve (for npx compatibility)
if (process.argv.length <= 2) {
  process.argv.push("serve");
}

program.parse();
