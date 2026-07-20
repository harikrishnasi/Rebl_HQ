import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "site",
  envDir: fileURLToPath(new URL(".", import.meta.url)), // .env.local lives at repo root
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
