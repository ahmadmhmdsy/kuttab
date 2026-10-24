// Local knowledge base: BM25 keyword search, optionally fused with embedding
// similarity (reciprocal rank fusion). Everything stays in memory and is
// serialized by the caller; nothing leaves the machine except text sent to a
// user-configured embedder.
import { chunkSections, type Chunk, type Section } from "./chunk.ts";
import { tokenize } from "./text.ts";

export type SourceKind = "text" | "markdown" | "pdf" | "docx" | "url" | "transcript" | "pack" | "image" | "audio" | "video";

export interface Source {
  id: string;
  title: string;
  kind: SourceKind;
  origin?: string;
  addedAt: string;
}

export interface Hit {
  chunk: Chunk;
  source: Source;
  score: number;
}

export type Embed = (texts: string[]) => Promise<number[][]>;

export interface KbSnapshot {
  sources: Source[];
  chunks: Chunk[];
  vectors: Record<string, number[]>;
}

const K1 = 1.4;
const B = 0.75;

export class KnowledgeBase {
  private sources = new Map<string, Source>();
  private chunks: Chunk[] = [];
  private toks = new Map<string, string[]>();
  private vectors = new Map<string, number[]>();

  static from(s: KbSnapshot): KnowledgeBase {
    const kb = new KnowledgeBase();
    for (const src of s.sources) kb.sources.set(src.id, src);
    for (const c of s.chunks) kb.indexChunk(c);
    for (const [id, v] of Object.entries(s.vectors)) kb.vectors.set(id, v);
    return kb;
  }

  snapshot(): KbSnapshot {
    return { sources: [...this.sources.values()], chunks: this.chunks, vectors: Object.fromEntries(this.vectors) };
  }

  listSources(): Source[] {
    return [...this.sources.values()];
  }

  get size(): number {
    return this.chunks.length;
  }

  private indexChunk(c: Chunk) {
    this.chunks.push(c);
    this.toks.set(c.id, tokenize(c.text));
  }

  async add(source: Source, sections: Section[], embed?: Embed): Promise<Chunk[]> {
    this.remove(source.id);
    this.sources.set(source.id, source);
    const chunks = chunkSections(source.id, sections);
    for (const c of chunks) this.indexChunk(c);
    if (embed && chunks.length) {
      for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32);
        const vecs = await embed(batch.map((c) => c.text));
        batch.forEach((c, j) => this.vectors.set(c.id, vecs[j]));
      }
    }
    return chunks;
  }

  remove(sourceId: string): void {
    if (!this.sources.delete(sourceId)) return;
    this.chunks = this.chunks.filter((c) => {
      if (c.sourceId !== sourceId) return true;
      this.toks.delete(c.id);
      this.vectors.delete(c.id);
      return false;
    });
  }

  /** BM25 scores, best first. */
  keywordSearch(query: string, k = 6): Hit[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length || !this.chunks.length) return [];
    const N = this.chunks.length;
    const avg = this.chunks.reduce((n, c) => n + (this.toks.get(c.id)?.length ?? 0), 0) / N;
    const df = new Map<string, number>();
    for (const c of this.chunks) {
      const set = new Set(this.toks.get(c.id));
      for (const t of q) if (set.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const hits: Hit[] = [];
    for (const c of this.chunks) {
      const toks = this.toks.get(c.id) ?? [];
      let score = 0;
      for (const t of q) {
        const n = df.get(t);
        if (!n) continue;
        const tf = toks.filter((x) => x === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * toks.length) / avg));
      }
      if (score > 0) hits.push({ chunk: c, source: this.sources.get(c.sourceId)!, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /** Fraction of distinct query terms found anywhere in the hits (used for refusal). */
  coverage(query: string, hits: Hit[]): number {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return 0;
    const seen = new Set(hits.flatMap((h) => this.toks.get(h.chunk.id) ?? []));
    return q.filter((t) => seen.has(t)).length / q.length;
  }

  /** Hybrid search: BM25 fused with cosine similarity when vectors exist. */
  async search(query: string, k = 6, embed?: Embed): Promise<Hit[]> {
    const kw = this.keywordSearch(query, k * 3);
    if (!embed || this.vectors.size === 0) return kw.slice(0, k);
    const [qv] = await embed([query]);
    const sem: Hit[] = [];
    for (const c of this.chunks) {
      const v = this.vectors.get(c.id);
      if (v) sem.push({ chunk: c, source: this.sources.get(c.sourceId)!, score: cosine(qv, v) });
    }
    sem.sort((a, b) => b.score - a.score);
    const fused = new Map<string, Hit>();
    const add = (list: Hit[]) =>
      list.slice(0, k * 3).forEach((h, rank) => {
        const prev = fused.get(h.chunk.id);
        const rrf = 1 / (60 + rank);
        fused.set(h.chunk.id, { ...h, score: (prev?.score ?? 0) + rrf });
      });
    add(kw);
    add(sem);
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
