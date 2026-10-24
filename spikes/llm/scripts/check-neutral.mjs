// Fails if anything under src/gateway imports Tauri. Run: pnpm check:neutral
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dir = fileURLToPath(new URL("../src/gateway/", import.meta.url));
const bad = readdirSync(dir).filter((f) => /["']@tauri-apps\//.test(readFileSync(join(dir, f), "utf8")));
if (bad.length) {
  console.error(`check:neutral FAIL: @tauri-apps referenced in src/gateway/${bad.join(", ")}`);
  process.exit(1);
}
console.log("check:neutral PASS: src/gateway has no @tauri-apps references");
