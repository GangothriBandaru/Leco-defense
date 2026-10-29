import { useSyncExternalStore } from "react";

// ── Conflict check, per case ─────────────────────────────────────────────────
// No firm conflicts database is connected, so nothing here is searched
// automatically: the attorney runs each party through the firm's conflicts
// system and records what it returned, then resolves any possible match.
// Records are keyed by case ID and saved to the browser, like the case details.

export type PartyRole = "insured" | "plaintiff" | "counsel" | "firm" | "carrier" | "other";
export type SearchResult = "none" | "match" | "relationship";
/** Attorney's call on a possible match or relationship. */
export type Resolution = "diff" | "same";
/** General counsel's decision on an escalated match. */
export type GcDecision = "cleared" | "conflict";

/** A possible match: the firm's record beside what is known of the party on this case. */
export interface MatchDetail {
  /** Name on the firm's record. */
  name: string;
  dob?: string;
  location?: string;
  matter?: string;
  matterType?: string;
  matterStatus?: string;
  closedOn?: string;
  /** The current party's date of birth or age, as known. */
  partyDob?: string;
  partyLocation?: string;
}

export interface LogEntry { at: string; by: string; text: string }

export interface PartyCheck {
  /** The name that was searched; a result no longer applies once the name changes. */
  searched: string;
  result: SearchResult;
  match?: MatchDetail;
  reviewer: string;
  /** The day the search was run in the firm's system (yyyy-mm-dd). */
  searchedOn: string;
  notes?: string;
  recordedAt: string;
  resolution?: Resolution;
  resolvedBy?: string;
  resolvedAt?: string;
  gc?: GcDecision;
  gcAt?: string;
  log: LogEntry[];
}

export interface OtherParty { id: string; name: string; role: string; details?: string }

export interface ConflictRecord {
  checks: Record<string, PartyCheck>;
  others: OtherParty[];
}

const STORAGE_KEY = "leco.conflictCheck.v2";
/** The signed-in attorney, as the rest of the dashboard names them. */
export const ATTORNEY = "Jennifer Davis";
const EMPTY: ConflictRecord = { checks: {}, others: [] };

function load(): Record<string, ConflictRecord> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

let records: Record<string, ConflictRecord> = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();

/** Applies a change to the case's record. Returns false when the browser would not store it. */
function update(caseId: string, fn: (r: ConflictRecord) => ConflictRecord): boolean {
  records = { ...records, [caseId]: fn(records[caseId] ?? EMPTY) };
  let stored = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    stored = false;
  }
  listeners.forEach((l) => l());
  return stored;
}

const now = () => new Date().toISOString();
const RESULT_TEXT: Record<SearchResult, string> = { none: "no match", match: "possible match", relationship: "existing relationship" };

function patch(caseId: string, key: string, fn: (c: PartyCheck) => PartyCheck) {
  return update(caseId, (r) => (r.checks[key] ? { ...r, checks: { ...r.checks, [key]: fn(r.checks[key]) } } : r));
}

export function recordResult(caseId: string, key: string, input: {
  searched: string; result: SearchResult; match?: MatchDetail; reviewer: string; searchedOn: string; notes?: string; escalate?: boolean;
}) {
  return update(caseId, (r) => {
    const prev = r.checks[key];
    const at = now();
    const log: LogEntry[] = [...(prev?.log ?? []), { at, by: input.reviewer, text: `Recorded search result: ${RESULT_TEXT[input.result]}${input.result === "none" ? "" : ` (${input.match?.name})`}` }];
    const escalated = input.escalate && input.result !== "none";
    if (escalated) log.push({ at, by: input.reviewer, text: "Escalated to general counsel" });
    return {
      ...r,
      checks: {
        ...r.checks,
        [key]: {
          searched: input.searched, result: input.result, match: input.result === "none" ? undefined : input.match,
          reviewer: input.reviewer, searchedOn: input.searchedOn, notes: input.notes, recordedAt: at,
          ...(escalated ? { resolution: "same" as const, resolvedBy: input.reviewer, resolvedAt: at } : {}),
          log,
        },
      },
    };
  });
}

export function resolveMatch(caseId: string, key: string, resolution: Resolution) {
  return patch(caseId, key, (c) => ({
    ...c, resolution, resolvedBy: ATTORNEY, resolvedAt: now(), gc: undefined, gcAt: undefined,
    log: [...c.log, { at: now(), by: ATTORNEY, text: resolution === "diff" ? "Decision: different person, no conflict" : "Decision: same person, escalated to general counsel" }],
  }));
}

export function recordGcDecision(caseId: string, key: string, gc: GcDecision) {
  return patch(caseId, key, (c) => c.resolution !== "same" ? c : ({
    ...c, gc, gcAt: now(),
    log: [...c.log, { at: now(), by: ATTORNEY, text: gc === "cleared" ? "General counsel decision recorded: cleared, no conflict" : "General counsel decision recorded: conflict confirmed" }],
  }));
}

/** Reopens a recorded decision for review; the match details and history stay. */
export function reopenDecision(caseId: string, key: string) {
  return patch(caseId, key, (c) => ({
    ...c, resolution: undefined, resolvedBy: undefined, resolvedAt: undefined, gc: undefined, gcAt: undefined,
    log: [...c.log, { at: now(), by: ATTORNEY, text: "Decision reopened for review" }],
  }));
}

export function addOtherParty(caseId: string, p: { name: string; role: string; details?: string }) {
  return update(caseId, (r) => ({ ...r, others: [...r.others, { id: `o${Date.now().toString(36)}`, ...p }] }));
}

export function removeOtherParty(caseId: string, id: string) {
  return update(caseId, (r) => {
    const { [`other:${id}`]: _, ...rest } = r.checks;
    return { checks: rest, others: r.others.filter((o) => o.id !== id) };
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConflictRecord(caseId: string | undefined): ConflictRecord {
  return useSyncExternalStore(subscribe, () => (caseId && records[caseId]) || EMPTY, () => EMPTY);
}

// ── Status rules ──

export interface Party {
  key: string; role: PartyRole; label: string; name: string;
  /** What the case record says about the party, to compare a match against. */
  location?: string; details?: string;
}

export type PartyState =
  | "missing"      // no name on the case record to search
  | "pending"      // not searched, or the name changed since
  | "clear"        // no match
  | "review"       // possible match or relationship awaiting the attorney
  | "resolved"     // attorney: different person / not a conflict
  | "escalated"    // with general counsel
  | "gc-cleared"
  | "conflict";

export function partyState(p: Party, c: PartyCheck | undefined): PartyState {
  if (!p.name.trim()) return "missing";
  if (!c || c.searched.trim().toLowerCase() !== p.name.trim().toLowerCase()) return "pending";
  if (c.result === "none") return "clear";
  if (!c.resolution) return "review";
  if (c.resolution === "diff") return "resolved";
  return c.gc === "cleared" ? "gc-cleared" : c.gc === "conflict" ? "conflict" : "escalated";
}

/** Label and pill tone for each state; tones follow the dashboard's pills. */
export const STATE_META: Record<PartyState, [string, string]> = {
  missing: ["Name not provided", ""],
  pending: ["Not searched", ""],
  clear: ["Clear", "ok"],
  review: ["Needs review", "warn"],
  resolved: ["Cleared by attorney", "ok"],
  escalated: ["Escalated", "crit"],
  "gc-cleared": ["Cleared by GC", "ok"],
  conflict: ["Conflict confirmed", "crit"],
};

export type OverallState = "conflict" | "escalated" | "review" | "pending" | "clear";
export function overallState(states: PartyState[]): OverallState {
  if (states.includes("conflict")) return "conflict";
  if (states.includes("escalated")) return "escalated";
  if (states.includes("review")) return "review";
  if (!states.length || states.some((s) => s === "pending" || s === "missing")) return "pending";
  return "clear";
}
export const OVERALL_META: Record<OverallState, [string, string]> = {
  conflict: ["Conflict confirmed", "crit"],
  escalated: ["Escalated", "crit"],
  review: ["Needs review", "warn"],
  pending: ["Pending", ""],
  clear: ["Cleared", "ok"],
};

// ── Comparing a possible match ──

const yearOf = (v?: string): number | undefined => {
  if (!v) return undefined;
  const y = /\b(19|20)\d{2}\b/.exec(v);
  if (y) return +y[0];
  const age = /\bage\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:years|yrs|y\/o)/i.exec(v);
  return age ? new Date().getFullYear() - +(age[1] ?? age[2]) : undefined;
};
const tokens = (n: string) => n.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
const norm = (v?: string) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Differences between the firm's record and the party on this case. They help
 *  the review; on their own they don't prove two people are different. */
export function matchDifferences(m: MatchDetail, partyName: string, caseType?: string): string[] {
  const out: string[] = [];
  const a = tokens(m.name), b = tokens(partyName);
  if (a.length && b.length) {
    if (a[a.length - 1] !== b[b.length - 1]) out.push("Different last name");
    if (a[0] !== b[0]) out.push("Different first name");
    const ma = a.slice(1, -1).map((t) => t[0]).join(""), mb = b.slice(1, -1).map((t) => t[0]).join("");
    if (ma && mb && ma !== mb) out.push("Different middle initial");
    else if (ma !== mb) out.push(`Middle initial on ${ma ? "the firm record" : "this case"} only`);
  }
  const ya = yearOf(m.dob), yb = yearOf(m.partyDob);
  if (ya && yb && Math.abs(ya - yb) > 1) out.push(`Different birth year (${ya} vs about ${yb})`);
  if (m.location && m.partyLocation && norm(m.location) !== norm(m.partyLocation)) out.push("Different location");
  if (m.matterType && caseType && norm(m.matterType) !== norm(caseType)) out.push("Different matter type");
  return out;
}
