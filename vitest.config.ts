import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/vendor.d.ts",
        "src/types.ts",
      ],
      // Floor current baseline so regressions fail CI loud.
      // Raise as coverage grows (cli.ts, browser-auth.ts, client.ts remainders).
      thresholds: {
        statements: 49,
        branches: 43,
        functions: 57,
        lines: 49,
      },
    },
  },
});
