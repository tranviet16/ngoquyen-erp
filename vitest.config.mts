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
          // Load tests are on-demand/nightly only (slow, need a live server) —
          // run them via `npm run test:load`, never in the PR integration run.
          exclude: ["node_modules/**", "test/performance/load/**"],
          pool: "forks",
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          // On-demand load suite — selected only via `--project load`
          // (`npm run test:load`); never part of the default test runs.
          name: "load",
          include: ["test/performance/load/**/*.test.ts"],
          pool: "forks",
          fileParallelism: false,
        },
      },
    ],
  },
});
