import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
      reporter: ["text", "text-summary"],
      // Set just below current numbers; raise them as coverage grows, never lower them.
      thresholds: { statements: 89, branches: 81, functions: 88, lines: 91 },
    },
  },
});
