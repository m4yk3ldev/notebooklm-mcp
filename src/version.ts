import { readFileSync } from "node:fs";

// Resolves to the repo's package.json from src/ (tests) and from the
// bundled dist/cli.js alike, since both sit one level below it.
export function readPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version: string };
  return pkg.version;
}
