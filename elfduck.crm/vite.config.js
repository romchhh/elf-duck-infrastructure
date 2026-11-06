import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, "..");

async function createPlugins() {
  const plugins = [react()];

  // Docker/prod builds skip Base44 HMR tooling — not needed for static UI.
  if (process.env.CRM_SKIP_BASE44 === "1") {
    return plugins;
  }

  const { default: base44 } = await import("@base44/vite-plugin");
  plugins.unshift(
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === "true",
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true,
    })
  );
  return plugins;
}

export default defineConfig(async () => ({
  envDir: workspaceRoot,
  plugins: await createPlugins(),
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
    },
  },
  build: {
    sourcemap: false,
    reportCompressedSize: false,
    minify: "esbuild",
    cssMinify: "esbuild",
    rollupOptions: {
      maxParallelFileOps: 2,
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 3002,
    strictPort: true,
    host: true,
  },
}));
