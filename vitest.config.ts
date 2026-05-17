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
      // Coverage must remain at 100% across the board. Any regression
      // (a new uncovered line / branch / function) should fail CI loud.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
