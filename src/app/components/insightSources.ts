import type { DocBlock } from "./documentText";

// ── Insight → source passage mapping ─────────────────────────────────────────
// The AI Insights carry no citations or text offsets, so a statement is linked
// to the document only where the document's own text supports it, in order:
//   1. the same distinctive value — an amount, a spinal level such as C5-C6, a
//      date — written in the document;
//   2. a phrase of at least four words from the insight, verbatim;
//   3. one sentence that carries most of the insight's own content words (at
//      least three, and at least half of them) — a close paraphrase, not a
//      shared topic.
// A passage that only touches the same subject is never enough. The highlight covers the sentence (or the
// field) holding the match, located by character offsets in the extracted
// text. Anything else is reported as not found — never highlighted on a guess.

export interface Passage { id: string; text: string; kind: "paragraph" | "item" | "field" }

/** Each paragraph, list item and field of a document, addressable by id. */
export function passagesOf(blocks: DocBlock[]): Passage[] {
  const out: Passage[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "paragraph") out.push({ id: `p${i}`, text: b.text, kind: "paragraph" });
    if (b.type === "list") b.items.forEach((t, j) => out.push({ id: `p${i}-${j}`, text: t, kind: "item" }));
    if (b.type === "fields") b.pairs.forEach(([k, v], j) => out.push({ id: `p${i}-${j}`, text: `${k}: ${v}`, kind: "field" }));
  });
  return out;
}

export interface InsightRef { id: string; text: string }

/** One verified source location for an insight. */
export interface SourceSpan {
  /** Unique per insight and location. */
  id: string;
  insightId: string;
  documentId: string;
  passageId: string;
  /** The page, when the source text carries page boundaries. The extracted
   *  text here has none, so it is left unset rather than guessed. */
  page?: number;
  /** Character offsets of the highlighted text within the passage. */
  start: number;
  end: number;
  /** The highlighted source text, exactly as it appears. */
  text: string;
  /** What was found in the document: the value or phrase, or the shared words. */
  matched: string;
  method: "exact-value" | "exact-phrase" | "related-wording";
}

export interface InsightMatch {
  spans: SourceSpan[];
  /** Why they match, shown to the attorney. */
  basis: string;
  /** Exact for a value or verbatim phrase; strong overlap for a close paraphrase. */
  confidence: "Exact match" | "Strong overlap";
}

interface Token { norm: string; raw: string; index: number }

/** Distinctive values, normalised, with where each was written. */
function valueTokens(t: string): Token[] {
  const out: Token[] = [];
  const push = (m: RegExpMatchArray, norm: string) => out.push({ norm, raw: m[0].trim(), index: m.index ?? 0 });
  for (const m of t.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)) push(m, `$${m[0].replace(/[^\d.]/g, "").replace(/\.0+$/, "")}`);
  for (const m of t.matchAll(/\b[A-Z]\d{1,2}\s?[-–]\s?[A-Z]?\d{1,2}\b/g)) push(m, m[0].replace(/\s/g, "").replace(/–/g, "-").toUpperCase());
  for (const m of t.matchAll(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/g)) push(m, m[0].toLowerCase());
  for (const m of t.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)) push(m, m[0]);
  return out;
}

/** The sentence of `text` around [start, end) — not split after abbreviations. */
function sentenceAround(text: string, start: number, end: number): [number, number] {
  const breaks = [...text.matchAll(/(?<!\b(?:Dr|Mr|Mrs|Ms|St|vs|[A-Z]))[.!?](?=\s+[A-Z0-9])/g)].map((m) => (m.index ?? 0) + 1);
  let s = 0;
  let e = text.length;
  for (const b of breaks) {
    if (b <= start) s = b;
    else if (b >= end) { e = b; break; }
  }
  while (s < e && /\s/.test(text[s])) s++;
  return [s, e];
}

const WORD = /[A-Za-z0-9$][A-Za-z0-9$,.'-]*[A-Za-z0-9]|[A-Za-z0-9]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The longest run of 4+ consecutive insight words found verbatim in the text. */
function verbatimPhrase(insight: string, text: string): { index: number; raw: string } | null {
  const words = insight.match(WORD) ?? [];
  for (let len = words.length; len >= 4; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const re = new RegExp(`\\b${words.slice(i, i + len).map(escape).join("\\W+")}\\b`, "i");
      const m = re.exec(text);
      if (m) return { index: m.index, raw: m[0] };
    }
  }
  return null;
}

// Content words, crudely stemmed, for the paraphrase tier.
const STOP = new Set([
  "about", "after", "again", "their", "there", "these", "those", "which", "while", "would", "could", "should", "other",
  "within", "without", "being", "based", "under", "where", "until", "since", "shows", "shown", "noted", "notes",
  "with", "from", "that", "this", "were", "have", "has", "into", "than", "then", "they", "them", "also", "more", "most",
  "case", "document", "documents", "record", "records", "finding", "findings", "evidence", "supports", "support",
]);
const stem = (w: string) => w.replace(/(ings|ing|ies|ied|es|ed|s)$/, "");
const contentStems = (t: string) =>
  [...new Set((t.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem))];

/** The sentences of a passage, with their offsets. */
function sentencesOf(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const [s, e] = sentenceAround(text, i, i);
    out.push({ start: s, end: e, text: text.slice(s, e) });
    i = Math.max(e, i + 1);
  }
  return out.filter((x) => x.text.trim().length > 0);
}

/** Maps each insight to the verified passages that support it, or null. */
export function mapInsights(insights: InsightRef[], passages: Passage[], documentId: string): Record<string, InsightMatch | null> {
  const out: Record<string, InsightMatch | null> = {};
  for (const ins of insights) {
    const wanted = new Set(valueTokens(ins.text).map((t) => t.norm));
    const spans: SourceSpan[] = [];
    for (const p of passages) {
      const hit = valueTokens(p.text).find((t) => wanted.has(t.norm));
      let at: { index: number; raw: string } | null = hit ? { index: hit.index, raw: hit.raw } : null;
      let how: SourceSpan["method"] = "exact-value";
      if (!at) { at = verbatimPhrase(ins.text, p.text); how = "exact-phrase"; }
      if (!at) continue;
      const [start, end] = p.kind === "field" ? [0, p.text.length] : sentenceAround(p.text, at.index, at.index + at.raw.length);
      spans.push({ id: `${ins.id}@${p.id}:${start}`, insightId: ins.id, documentId, passageId: p.id, start, end, text: p.text.slice(start, end), matched: at.raw, method: how });
    }
    if (!spans.length) {
      // Tier 3: the sentence(s) carrying most of the insight's content words.
      const want = contentStems(ins.text);
      if (want.length >= 3) {
        const scored: { p: Passage; s: { start: number; end: number; text: string }; shared: string[]; score: number }[] = [];
        for (const p of passages) {
          if (p.kind === "field") continue;
          for (const s of sentencesOf(p.text)) {
            const have = new Set(contentStems(s.text));
            const shared = want.filter((w) => have.has(w));
            const score = shared.length / want.length;
            if (shared.length >= 3 && score >= 0.5) scored.push({ p, s, shared, score });
          }
        }
        scored.sort((a, b) => b.score - a.score || b.shared.length - a.shared.length);
        const best = scored[0]?.score;
        for (const x of scored.filter((y) => y.score === best).slice(0, 2)) {
          spans.push({
            id: `${ins.id}@${x.p.id}:${x.s.start}`, insightId: ins.id, documentId, passageId: x.p.id,
            start: x.s.start, end: x.s.end, text: x.s.text, matched: x.shared.join(", "), method: "related-wording",
          });
        }
      }
    }
    if (!spans.length) { out[ins.id] = null; continue; }
    const shown = [...new Set(spans.map((s) => s.matched))].slice(0, 3).map((m) => `"${m}"`).join(", ");
    const related = spans.every((s) => s.method === "related-wording");
    out[ins.id] = {
      spans,
      basis: related
        ? `Close wording in the document — shared terms: ${spans[0].matched}`
        : spans.every((s) => s.method === "exact-value") ? `Exact value found in the document: ${shown}` : `Exact wording found in the document: ${shown}`,
      confidence: related ? "Strong overlap" : "Exact match",
    };
  }
  return out;
}
