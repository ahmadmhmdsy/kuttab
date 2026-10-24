// Tokenization for local search in English and Arabic. Arabic is normalized so
// that spelling variants match: diacritics and tatweel are dropped, alef/yaa/taa
// marbuta forms are unified, and the definite article is stripped.

const AR_DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "by", "with", "as", "at", "it", "this", "that", "from", "what", "how", "why", "which", "do", "does",
  "في", "من", "على", "الى", "عن", "او", "ان", "هذا", "هذه", "ذلك", "التي", "الذي", "ما", "ماذا", "كيف", "لماذا", "هو", "هي", "مع", "كان", "لا", "و",
]);

export function normalizeArabic(s: string): string {
  return s
    .replace(AR_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

function stem(tok: string): string {
  if (/^[؀-ۿ]+$/.test(tok)) {
    let t = tok;
    if (t.length > 4 && /^(وال|فال|بال|كال|لل)/.test(t)) t = t.slice(3);
    else if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
    if (t.length > 4 && /(ات|ون|ين|ها)$/.test(t)) t = t.slice(0, -2);
    return t;
  }
  if (tok.length > 4 && tok.endsWith("ies")) return tok.slice(0, -3) + "y";
  if (tok.length > 3 && tok.endsWith("s") && !tok.endsWith("ss")) return tok.slice(0, -1);
  return tok;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalizeArabic(text.toLowerCase()).split(/[^\p{L}\p{N}_]+/u)) {
    if (!raw || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}
