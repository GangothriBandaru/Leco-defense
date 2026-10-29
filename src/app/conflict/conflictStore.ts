import { useSyncExternalStore } from "react";

// ── Conflict check, per case ─────────────────────────────────────────────────
// No firm conflicts database is connected, so nothing here is searched
// automatically: the attorney runs each party through the firm's conflicts
// system and records the result, then resolves any possible match. Records are
// keyed by case ID and saved to the browser, like the case details.

export type PartyRole = "insured" | "plaintiff" | "counsel" | "firm" | "carrier" | "other";
export type SearchResult = "none" | "match" | "relationship";
/** Attorney's call on a possible match or relationship. */
export type Resolution = "diff" | "same";
/** General counsel's decision on an escalated match. */
export type GcDecision = "cleared" | "conflict";

export interface MatchDetail {
  /** The person or organization in the firm's records. */
  name: string;
  /** Prior matter or relationship, e.g. "Matter 2019-0442, former client (closed)". */
  matter?: string;
  /** Identifying details from the record. */
  identifiers?: string;
  /** What supports or distinguishes the match. */
  distinguishing?: string;
}

export interface PartyCheck {
  /** The name that was searched; a result no longer applies once the name changes. */
  searched: string;
  result: SearchResult;
  match?: MatchDetail;
  recordedBy: string;
  recordedAt: string;
  resolution?: Resolution;
  resolvedBy?: string;
  resolvedAt?: string;
  gc?: GcDecision;
  gcAt?: string;
}

export interface OtherParty { id: string; name: string; role: string }

export interface ConflictRecord {
  checks: Record<string, PartyCheck>;
  others: OtherParty[];
}

const STORAGE_KEY = "leco.conflictCheck.v1";
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

export function recordResult(caseId: string, key: string, searched: string, result: SearchResult, match?: MatchDetail) {
  return update(caseId, (r) => ({
    ...r,
    checks: { ...r.checks, [key]: { searched, result, match: result === "none" ? undefined : match, recordedBy: ATTORNEY, recordedAt: now() } },
  }));
}

export function resolveMatch(caseId: string, key: string, resolution: Resolution) {
  return update(caseId, (r) => {
    const c = r.checks[key];
    if (!c) return r;
    return { ...r, checks: { ...r.checks, [key]: { ...c, resolution, resolvedBy: ATTORNEY, resolvedAt: now(), gc: undefined, gcAt: undefined } } };
  });
}

export function recordGcDecision(caseId: string, key: string, gc: GcDecision) {
  return update(caseId, (r) => {
    const c = r.checks[key];
    if (!c || c.resolution !== "same") return r;
    return { ...r, checks: { ...r.checks, [key]: { ...c, gc, gcAt: now() } } };
  });
}

/** Removes the recorded result, returning the party to not searched. */
export function clearResult(caseId: string, key: string) {
  return update(caseId, (r) => {
    const { [key]: _, ...rest } = r.checks;
    return { ...r, checks: rest };
  });
}

export function addOtherParty(caseId: string, name: string, role: string) {
  return update(caseId, (r) => ({ ...r, others: [...r.others, { id: `o${Date.now().toString(36)}`, name, role }] }));
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

export interface Party { key: string; role: PartyRole; label: string; name: string }

export type PartyState =
  | "missing"      // no name on the case record to search
  | "pending"      // not searched, or the name changed since
  | "clear"        // no match
  | "review"       // possible match awaiting the attorney
  | "assess"       // existing relationship awaiting the attorney
  | "resolved"     // attorney: different person / not a conflict
  | "escalated"    // with general counsel
  | "gc-cleared"
  | "conflict";

export function partyState(p: Party, c: PartyCheck | undefined): PartyState {
  if (!p.name.trim()) return "missing";
  if (!c || c.searched.trim().toLowerCase() !== p.name.trim().toLowerCase()) return "pending";
  if (c.result === "none") return "clear";
  if (!c.resolution) return c.result === "match" ? "review" : "assess";
  if (c.resolution === "diff") return "resolved";
  return c.gc === "cleared" ? "gc-cleared" : c.gc === "conflict" ? "conflict" : "escalated";
}

/** Label and pill tone for each state; tones follow the dashboard's pills. */
export const STATE_META: Record<PartyState, [string, string]> = {
  missing: ["Name not provided", ""],
  pending: ["Not searched", ""],
  clear: ["Clear", "ok"],
  review: ["Needs review", "warn"],
  assess: ["Needs assessment", "warn"],
  resolved: ["Cleared by attorney", "ok"],
  escalated: ["Escalated to GC", "crit"],
  "gc-cleared": ["Cleared by GC", "ok"],
  conflict: ["Conflict confirmed", "crit"],
};

export type OverallState = "conflict" | "escalated" | "review" | "pending" | "clear";
export function overallState(states: PartyState[]): OverallState {
  if (states.includes("conflict")) return "conflict";
  if (states.includes("escalated")) return "escalated";
  if (states.some((s) => s === "review" || s === "assess")) return "review";
  if (!states.length || states.some((s) => s === "pending" || s === "missing")) return "pending";
  return "clear";
}
export const OVERALL_META: Record<OverallState, [string, string]> = {
  conflict: ["Conflict confirmed", "crit"],
  escalated: ["Escalated to GC", "crit"],
  review: ["Needs review", "warn"],
  pending: ["Pending", ""],
  clear: ["Clear", "ok"],
};
