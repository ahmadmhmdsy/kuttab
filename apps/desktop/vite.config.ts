import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);
const pkgDir = (name: string, from?: string) =>
  dirname(createRequire(from ?? import.meta.url).resolve(`${name}/package.json`));

/**
 * Serves a package's runtime files at `/<mount>/` in dev and copies them into the
 * build, so the app loads them from itself and needs no CDN (and the CSP can stay 'self').
 */
function localAssets(mount: string, dir: string, keep: RegExp): Plugin {
  let outDir = "dist";
  return {
    name: `kuttab-local-${mount}`,
    configResolved(c) {
      outDir = c.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use(`/${mount}/`, (req, res, next) => {
        const file = join(dir, (req.url ?? "").split("?")[0].replace(/^\/+/, ""));
        if (!file.startsWith(dir) || !existsSync(file)) return next();
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        else if (/\.m?js$/.test(file)) res.setHeader("Content-Type", "text/javascript");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const dest = join(outDir, mount);
      mkdirSync(dest, { recursive: true });
      for (const f of readdirSync(dir)) if (keep.test(f) && f !== "package.json") copyFileSync(join(dir, f), join(dest, f));
    },
  };
}

// Pyodide runs Python labs; onnxruntime-web runs local Whisper. transformers.js
// would otherwise pull the ONNX runtime from a CDN (see src/speech.ts).
const pyodideDir = pkgDir("pyodide");
// onnxruntime-web exports no package.json, so locate dist/ from its entry point.
const ortDir = dirname(createRequire(require.resolve("@huggingface/transformers")).resolve("onnxruntime-web"));
// Piper's phonemizer (T-25): its JS is bundled into piper-tts-web; the data and wasm load at run time.
const piperDir = join(pkgDir("@diffusionstudio/piper-wasm"), "build");

// The Tauri CSP is the single source of truth. KUTTAB_CSP=1 applies it to
// `vite dev` / `vite preview` too, so it can be checked in a plain browser.
const tauriConf = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const cspHeaders = (dev: boolean) =>
  process.env.KUTTAB_CSP ? { "Content-Security-Policy": dev ? tauriConf.app.security.devCsp : tauriConf.app.security.csp } : undefined;

export default defineConfig({
  plugins: [
    react(),
    localAssets("pyodide", pyodideDir, /\.(wasm|zip|json|mjs|js)$/),
    localAssets("ort", ortDir, /^ort-wasm-simd-threaded(\.asyncify)?\.(mjs|wasm)$/),
    localAssets("piper", piperDir, /^piper_phonemize\.(data|wasm)$/),
  ],
  clearScreen: false,
  optimizeDeps: { exclude: ["pyodide", "@huggingface/transformers", "@mlc-ai/web-llm", "@mintplex-labs/piper-tts-web"] },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    fs: { allow: ["../.."] },
    watch: { ignored: ["**/src-tauri/**"] },
    headers: cspHeaders(true),
  },
  preview: { port: 1430, strictPort: true, headers: cspHeaders(false) },
});
