import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/index.ts", "src/cli/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  dts: true,
});
