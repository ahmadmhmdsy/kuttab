export interface Chunk {
  id: string;
  sourceId: string;
  text: string;
  /** Page number (PDF) or section heading, for citations. */
  locator?: string;
}

export interface Section {
  text: string;
  locator?: string;
}

/** Splits sections into chunks of about `size` characters on paragraph and sentence boundaries. */
export function chunkSections(sourceId: string, sections: Section[], size = 900, overlap = 120): Chunk[] {
  const chunks: Chunk[] = [];
  for (const sec of sections) {
    const paras = sec.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let buf = "";
    const flush = () => {
      const t = buf.trim();
      if (t) chunks.push({ id: `${sourceId}#${chunks.length}`, sourceId, text: t, locator: sec.locator });
      buf = t.length > overlap ? t.slice(-overlap) : "";
    };
    for (const p of paras) {
      if (p.length > size) {
        for (const sentence of p.split(/(?<=[.!?؟。])\s+/)) {
          if (buf.length + sentence.length > size) flush();
          buf += (buf ? " " : "") + sentence;
        }
        continue;
      }
      if (buf.length + p.length > size) flush();
      buf += (buf ? "\n\n" : "") + p;
    }
    if (buf.trim() && (chunks.length === 0 || !chunks[chunks.length - 1].text.endsWith(buf.trim()))) flush();
  }
  return chunks;
}
