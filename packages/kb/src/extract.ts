// Turns files and pages into sections of plain text. The heavy parsers (pdf.js,
// mammoth) are imported lazily so the app starts fast and Node tests that only
// touch text never load them.
import type { Section } from "./chunk.ts";

/** Markdown: split on headings, keep the heading as the citation locator. */
export function extractMarkdown(md: string): Section[] {
  const sections: Section[] = [];
  let heading: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ text: stripMd(text), locator: heading });
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[1].trim();
    } else buf.push(line);
  }
  flush();
  return sections;
}

function stripMd(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^>\s?/gm, "");
}

export function extractPlain(text: string): Section[] {
  return [{ text }];
}

/** PDF: one section per page, located as "p. N". */
export async function extractPdf(data: ArrayBuffer): Promise<Section[]> {
  const pdfjs = await import("pdfjs-dist");
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const sections: Section[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    }
    if (text.trim()) sections.push({ text: text.replace(/[ \t]+/g, " "), locator: `p. ${p}` });
  }
  await task.destroy();
  return sections;
}

/** DOCX via mammoth, converted to Markdown so headings become locators. */
export async function extractDocx(data: ArrayBuffer): Promise<Section[]> {
  const mammoth = (await import("mammoth")).default as unknown as {
    convertToMarkdown?: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  if (mammoth.convertToMarkdown) return extractMarkdown((await mammoth.convertToMarkdown({ arrayBuffer: data })).value);
  return extractPlain((await mammoth.extractRawText({ arrayBuffer: data })).value);
}

/** HTML: drop chrome (nav, scripts, footers), keep the main article text by heading. */
export function extractHtml(html: string, parse: (html: string) => Document = (h) => new DOMParser().parseFromString(h, "text/html")): { title: string; sections: Section[] } {
  const doc = parse(html);
  doc.querySelectorAll("script,style,noscript,nav,footer,header,aside,form,iframe,svg").forEach((n) => n.remove());
  const root = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const sections: Section[] = [];
  let heading: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n\n").trim();
    if (text) sections.push({ text, locator: heading });
    buf = [];
  };
  root?.querySelectorAll("h1,h2,h3,h4,p,li,pre,blockquote,td").forEach((el) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!t) return;
    if (/^H[1-4]$/.test(el.tagName)) {
      flush();
      heading = t;
    } else buf.push(t);
  });
  flush();
  return { title: doc.title?.trim() || "Untitled page", sections };
}
