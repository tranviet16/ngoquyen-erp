import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["lib/**"],
      exclude: ["lib/**/__tests__/**", "lib/**/*.test.ts", "lib/**/*.d.ts"],
      thresholds: { lines: 60, functions: 60, statements: 60 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts", "test/unit/**/*.test.ts"],
          exclude: [
            "node_modules/**",
            "e2e/**",
            "test/integration/**",
            "test/security/**",
            "test/performance/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [
            "test/integration/**/*.test.ts",
            "test/security/**/*.test.ts",
            "test/performance/**/*.test.ts",
          ],
          pool: "forks",
          fileParallelism: false,
        },
      },
    ],
  },
});
