import { EVENT_TYPES, type EventFields, type EventType } from "./timelineEventStore";
import { documentsNamedIn } from "../damages/damageDraft";

// ── A timeline event drafted from the attorney's own words ───────────────────
// Like the AI Assistant's chronology actions, this reads the attorney's text in
// the browser — no model service is connected. It only lifts what the text
// states: a title in quotes or after "titled", a date written with its year,
// an event type its wording names, a "describe that …" passage, and case
// documents the text names. Anything it cannot find stays empty for the
// attorney, and nothing is saved until they choose Save Event.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
const validIso = (y: number, m: number, d: number) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// Words an event type is named by. A type is suggested only when exactly one
// type's words appear.
const TYPE_WORDS: Record<EventType, RegExp> = {
  Incident: /\b(incident|collision|crash|accident|fall|911|emergency (call|response|services)|stroke symptoms)\b/i,
  Treatment: /\b(treatment|therapy|rehab\w*|surgery|appointment|follow-up|prescri\w*|admission|admitted)\b/i,
  Injury: /\b(injur\w*|diagnos\w*|mri|x-?ray|fracture|herniat\w*|impairment)\b/i,
  Damages: /\b(wages?|bills?|invoice|expenses?|damages|income|billing)\b/i,
  "Case milestone": /\b(filed|filing|deposition|settlement|demand|retainer|signed)\b/i,
  Other: /$^/,
};


export interface EventDraft {
  fields: Partial<EventFields>;
  /** Fields the description did not settle, and why. */
  needed: string[];
  /** What was filled in. */
  filled: string[];
}

export function draftEventFromText(text: string, documents: string[]): EventDraft {
  const fields: Partial<EventFields> = {};
  const needed: string[] = [];
  const filled: string[] = [];
  const t = text.trim();

  // Title: quoted, preferably after "titled/called/named".
  const quoted = t.match(/\b(?:titled|called|named|title)\s*[:]?\s*["'“‘]([^"'”’]{3,120})["'”’]/i) ?? t.match(/["“]([^"”]{3,120})["”]/);
  const titled = quoted ?? t.match(/\b(?:titled|called|named)\s+([^,.;]{3,80})/i);
  if (titled) { fields.title = titled[1].trim(); filled.push("title"); } else needed.push("title — put it in quotes or after “titled”");

  // Date: only with its year — a date without one is left for the attorney.
  const names = Object.keys(MONTHS).join("|");
  const md = t.match(new RegExp(`\\b(${names})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, "i"));
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${names})[a-z]*\\.?(?:,?\\s*(\\d{4}))?`, "i"));
  const isoText = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const us = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  let iso: string | null = null;
  let yearMissing = false;
  if (isoText) iso = validIso(+isoText[1], +isoText[2], +isoText[3]);
  else if (us) iso = validIso(+us[3], +us[1], +us[2]);
  else if (md) { if (md[3]) iso = validIso(+md[3], MONTHS[md[1].toLowerCase().slice(0, 3)], +md[2]); else yearMissing = true; }
  else if (dm) { if (dm[3]) iso = validIso(+dm[3], MONTHS[dm[2].toLowerCase().slice(0, 3)], +dm[1]); else yearMissing = true; }
  if (iso) { fields.date = iso; filled.push("date"); }
  else needed.push(yearMissing ? "date — the description gives no year" : "date — none was given");

  // Type: only when the wording points to one.
  const types = (EVENT_TYPES.filter((ty) => TYPE_WORDS[ty].test(t)) as EventType[]);
  if (types.length === 1) { fields.type = types[0]; filled.push("event type"); }

  // Description: what the attorney asked to be described, in their words.
  const desc = t.match(/\b(?:describe|describing|noting|note|explain|stating)\s+(?:that\s+)?([^.]{8,600})/i);
  if (desc) {
    const d = desc[1].trim().replace(/^./, (c) => c.toUpperCase());
    fields.description = /[.!?]$/.test(d) ? d : `${d}.`;
    filled.push("description");
  }

  // Supporting documents: case documents the text names (every distinctive
  // word of the file name appears).
  const matched = documentsNamedIn(t, documents);
  if (matched.length) {
    fields.evidence = matched;
    filled.push(`${matched.length} supporting ${matched.length === 1 ? "document" : "documents"}`);
    if (/\b(source|based on|from the)\b/i.test(t)) { fields.sourceRef = matched[0]; filled.push("source"); }
  }
  return { fields, needed, filled };
}
