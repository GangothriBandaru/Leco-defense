import { useSyncExternalStore } from "react";

// ── Liability analysis — the attorney's inputs ───────────────────────────────
// Everything the attorney enters on the Liability Analysis, per case: their
// estimates (kept beside the model's output, never over it), scenarios,
// recorded requests, authority checks, review marks and the sign-off, with an
// audit trail of every change. Kept in this browser like the other analysis
// decisions. A write the browser refuses throws, so nothing is shown as saved.

/** `defense`: how the defense would put it — the plaintiff estimate only. */
export interface Estimate { expected: number; low?: number; high?: number; defense?: number }

export interface Override extends Estimate {
  reason: string;
  by: string;
  at: string;
  /** The value it replaced — the model's (null: none was calculated) or an earlier override. */
  previous: Estimate | null;
}

export interface Stamp { at: string; by: string }

export interface AuditEntry extends Stamp {
  action: string;
  detail?: string;
  from?: string;
  to?: string;
  reason?: string;
}

export interface LiabilityInputs {
  plaintiffOverride?: Override;
  defendantOverrides: Record<string, Override>;
  /** The scenario being tested — never applied to the baseline. */
  scenario: string[];
  savedScenarios: { id: string; name: string; selected: string[]; at: string }[];
  requested: Record<string, Stamp & { note?: string }>;
  authorityChecks: Record<string, Stamp & { source: string }>;
  incidentDate?: Stamp & { choice: "record" | "evidence"; reason: string };
  preservation?: Stamp & { decision: "send" | "not-needed"; reason: string };
  settlementsNone?: Stamp;
  /** The client preservation checklist: what the client has confirmed keeping. */
  clientChecklist: Record<string, Stamp & { state: "confirmed" | "not-held" }>;
  /** Review marks carry the signature of what was reviewed, so a later change reopens them. */
  plaintiffReview?: Stamp & { signature: string };
  ledgerReview?: Stamp & { signature: string };
  reviewed: Record<string, Stamp & { signature: string }>;
  lastRun?: Stamp & { snapshot: Record<string, string>; changed: string[] };
  signOff?: Stamp & { signature: string };
  audit: AuditEntry[];
}

export const EMPTY_INPUTS: LiabilityInputs = {
  defendantOverrides: {}, scenario: [], savedScenarios: [], requested: {}, authorityChecks: {}, reviewed: {}, clientChecklist: {}, audit: [],
};

const STORAGE_KEY = "leco.liability.v1";
type State = Record<string, LiabilityInputs>;

function load(): State {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let state: State = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) { state = load(); emit(); }
  });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => state;

export function useLiabilityInputs(caseId: string): LiabilityInputs {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...EMPTY_INPUTS, ...s[caseId] };
}

export const stampNow = () =>
  new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Applies a change and records it in the audit trail. Throws when the browser
 *  refuses the write. */
export function updateLiability(caseId: string, by: string, fn: (prev: LiabilityInputs) => LiabilityInputs, audit?: Omit<AuditEntry, "at" | "by">) {
  const prev = { ...EMPTY_INPUTS, ...state[caseId] };
  const next = fn(prev);
  const entry = audit ? [{ ...audit, at: stampNow(), by }] : [];
  const updated = { ...state, [caseId]: { ...next, audit: [...prev.audit, ...entry] } };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  state = updated;
  emit();
}
