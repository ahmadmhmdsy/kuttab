import { describe, expect, it } from "vitest";
import { detectLocalServers, hfGgufFiles, hfToOllama, isLocalModel, isLocalURL, pullOllama, recommendLocal, type FetchFn } from "../src/index.ts";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("hardware recommendations", () => {
  it("picks model sizes by memory", () => {
    expect(recommendLocal({ ramGb: 4 }).teacher).toBeUndefined();
    expect(recommendLocal({ ramGb: 4 }).lowCompute).toBe(true);
    expect(recommendLocal({ ramGb: 8 }).teacher?.model).toBe("gemma3:4b");
    expect(recommendLocal({ ramGb: 6 }).teacher?.model).toBe("llama3.2");
    const mid = recommendLocal({ ramGb: 16, diskFreeGb: 40 });
    expect(mid.teacher?.model).toBe("qwen3:8b");
    expect(mid.lowCompute).toBe(false);
    expect(mid.whisper).toBe("small");
    expect(mid.fitsDisk).toBe(true);
    expect(recommendLocal({ ramGb: 32 }).teacher?.model).toBe("qwen3:14b");
  });

  it("warns when the download does not fit on the disk", () => {
    const p = recommendLocal({ ramGb: 16, diskFreeGb: 5 });
    expect(p.downloadGb).toBeGreaterThan(5);
    expect(p.fitsDisk).toBe(false);
  });
});

describe("local servers", () => {
  it("finds the servers that answer and skips the rest", async () => {
    const fetch: FetchFn = async (url) => {
      if (String(url).startsWith("http://localhost:11434")) return json({ data: [{ id: "gemma3:4b" }] });
      throw new TypeError("connection refused");
    };
    expect(await detectLocalServers(fetch)).toEqual([{ provider: "ollama", baseURL: "http://localhost:11434/v1", models: ["gemma3:4b"] }]);
  });

  it("treats loopback servers as local", () => {
    expect(isLocalURL("http://127.0.0.1:5000/v1")).toBe(true);
    expect(isLocalURL("http://[::1]:8080")).toBe(true);
    expect(isLocalURL("https://api.openai.com/v1")).toBe(false);
    expect(isLocalModel({ provider: "custom", baseURL: "http://localhost:5001/v1" })).toBe(true);
    expect(isLocalModel({ provider: "ollama" })).toBe(true);
    expect(isLocalModel({ provider: "openai" })).toBe(false);
  });
});

describe("Hugging Face linking", () => {
  it("turns links into Ollama names", () => {
    expect(hfToOllama("https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF")).toBe("hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF");
    expect(hfToOllama("hf.co/unsloth/gemma-3-4b-it-GGUF:Q4_K_M")).toBe("hf.co/unsloth/gemma-3-4b-it-GGUF:Q4_K_M");
    expect(hfToOllama("Qwen/Qwen3-8B-GGUF")).toBe("hf.co/Qwen/Qwen3-8B-GGUF");
    expect(hfToOllama("https://huggingface.co/Qwen/Qwen3-8B-GGUF/tree/main")).toBe("hf.co/Qwen/Qwen3-8B-GGUF");
    expect(hfToOllama("not a model")).toBeUndefined();
  });

  it("lists GGUF files with sizes, smallest first", async () => {
    let asked = "";
    const fetch: FetchFn = async (url) => {
      asked = String(url);
      return json({ siblings: [{ rfilename: "README.md", size: 10 }, { rfilename: "m-Q8_0.gguf", size: 8.5e9 }, { rfilename: "m-Q4_K_M.gguf", size: 4.9e9 }, { rfilename: "mmproj-F16.gguf", size: 6e8 }] });
    };
    const files = await hfGgufFiles("hf.co/user/m-GGUF:Q4_K_M", fetch);
    expect(asked).toBe("https://huggingface.co/api/models/user/m-GGUF?blobs=true");
    expect(files).toEqual([{ file: "m-Q4_K_M.gguf", quant: "Q4_K_M", gb: 4.9 }, { file: "m-Q8_0.gguf", quant: "Q8_0", gb: 8.5 }]);
  });
});

describe("Ollama pull", () => {
  it("streams progress until done", async () => {
    let body = "";
    const fetch: FetchFn = async (url, init) => {
      expect(String(url)).toBe("http://localhost:11434/api/pull");
      body = String(init?.body);
      const enc = new TextEncoder();
      const parts = ['{"status":"pulling manifest"}\n{"status":"downloading","total":100,', '"completed":50}\n{"status":"success"}\n'];
      return new Response(new ReadableStream({ start: (c) => (parts.forEach((p) => c.enqueue(enc.encode(p))), c.close()) }));
    };
    const seen: (number | undefined)[] = [];
    await pullOllama("http://localhost:11434/v1", "gemma3:4b", fetch, (p) => seen.push(p.fraction));
    expect(JSON.parse(body).model).toBe("gemma3:4b");
    expect(seen).toEqual([undefined, 0.5, undefined]);
  });

  it("reports Ollama's error", async () => {
    const fetch: FetchFn = async () => new Response('{"error":"pull model manifest: file does not exist"}\n');
    await expect(pullOllama("http://localhost:11434/v1", "nope", fetch, () => {})).rejects.toThrow("does not exist");
  });
});
