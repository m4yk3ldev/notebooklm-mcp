import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { runAuthFlow, runFileImport, showTokens } from "./auth.js";
import { runBrowserAuthFlow } from "./browser-auth.js";

const program = new Command();

program
  .name("notebooklm-mcp")
  .description("MCP server for Google NotebookLM")
  .version("0.1.23");

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
  .description("Authenticate with NotebookLM (automated Chrome integration)")
  .option("--manual", "Use manual cookie copy-paste instead")
  .option("--file <path>", "Import cookies from a file instead")
  .option("--show-tokens", "Show cached token info (no secrets)")
  .action(async (opts) => {
    if (opts.showTokens) {
      showTokens();
      return;
    }

    if (opts.file) {
      await runFileImport(opts.file);
      return;
    }

    if (opts.manual) {
      await runAuthFlow();
      return;
    }

    try {
      await runBrowserAuthFlow();
    } catch (error) {
      console.log(`\n⚠️ Smart Authentication failed: ${(error as Error).message}`);
      console.log("Falling back to manual authentication flow...\n");
      await runAuthFlow();
    }
  });

// Default command: serve (for npx compatibility)
if (process.argv.length <= 2) {
  process.argv.push("serve");
}

program.parse();
