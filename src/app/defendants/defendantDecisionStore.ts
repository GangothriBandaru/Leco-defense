import { useSyncExternalStore } from "react";
import type { DefendantChoice } from "./defendantData";

// ── Defendant decisions ──────────────────────────────────────────────────────
// The attorney's decision on each potential defendant, per analysis record —
// one record shared by every place the analysis opens from (Analysis, Case
// Ready, Case Overview). Kept in this browser. A write that fails is reported
// to the caller, never shown as saved.

export interface RowDecision { choice: DefendantChoice; reason: string }

export interface HistoryEntry {
  at: string;
  by: string;
  candidate: string;
  /** What the system recommended, what the attorney chose, and why. */
  from: DefendantChoice;
  to: DefendantChoice;
  reason: string;
}

export interface CaseDecisions {
  rows: Record<string, RowDecision>;
  history: HistoryEntry[];
  /** When the attorney last confirmed the decisions. Cleared by any later change. */
  confirmedAt?: string;
  confirmedBy?: string;
}

const STORAGE_KEY = "leco.defendant.decisions.v1";
type State = Record<string, CaseDecisions>;

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

export function useDefendantDecisions(recordId?: string): CaseDecisions | undefined {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return recordId ? s[recordId] : undefined;
}

/** Saves one record's decisions. Throws when the browser refuses the write, so
 *  the caller can say it was not saved. */
export function saveDefendantDecisions(recordId: string, next: CaseDecisions) {
  const updated = { ...state, [recordId]: next };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  state = updated;
  emit();
}
