// The only module that touches tauri-plugin-http. It produces a plain
// `typeof fetch` that the platform-neutral gateway consumes.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { FetchFn } from "../gateway";

/**
 * tauri-plugin-http always adds an Origin header (the WebView origin) unless the
 * `unsafe-headers` feature is on and the caller sends `Origin: ""`, which the
 * plugin then strips. With `stripOrigin` the request looks like a server-side
 * call; without it, it looks like a browser call from the app origin.
 */
export function makeTauriFetch({ stripOrigin }: { stripOrigin: boolean }): FetchFn {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!stripOrigin) return tauriFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("Origin", "");
    return tauriFetch(input, { ...init, headers });
  }) as FetchFn;
}
