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
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 96,
        lines: 95,
      },
    },
  },
});
