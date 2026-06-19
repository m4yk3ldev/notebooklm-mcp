import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { runAuthFlow, runFileImport, showTokens } from "./auth.js";
import { runBrowserAuthFlow } from "./browser-auth.js";

function readPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version: string };
  return pkg.version;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("notebooklm-mcp")
    .description("MCP server for Google NotebookLM")
    .version(readPackageVersion());

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
        console.error(`\n⚠️ Smart Authentication failed: ${(error as Error).message}`);
        console.error("Falling back to manual authentication flow...\n");
        await runAuthFlow();
      }
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  // Default command: serve (for npx compatibility)
  const args = argv.length <= 2 ? [...argv, "serve"] : argv;
  await buildProgram().parseAsync(args);
}

// Only auto-run when invoked directly, not when imported as a library/tested.
// process.argv[1] may be a symlink (npm/npx installs the bin as a symlink in
// node_modules/.bin), so resolve it to its real path before comparing — else
// the guard is always false under npx and the CLI exits 0 doing nothing.
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === self;
  } catch {
    return entry === self;
  }
}

if (isInvokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
