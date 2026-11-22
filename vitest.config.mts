import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "seed/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/test-*.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      // Floors at what we have, so coverage can only go up. The UI and the routes are barely tested.
      thresholds: {
        statements: 33,
        branches: 29,
        functions: 28,
        lines: 33,
        "src/lib/**": { statements: 88, branches: 83, functions: 87, lines: 89 },
      },
    },
  },
});
