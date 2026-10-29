import { useSyncExternalStore } from "react";

// ── Attorney decisions on evidence conflicts and demand claims, per case ──
// Keyed by case ID, then by item ("conflict:C2", "claim:L1"); saved to the
// browser like the other case stores. Every change is kept in the item's history.

export interface Decision {
  choice: string;
  owner?: string;
  note?: string;
  by: string;
  at: string;
  history: { choice: string; owner?: string; note?: string; by: string; at: string }[];
}

interface CaseDecisions {
  items: Record<string, Decision>;
  /** Suggested next steps marked done: "C2:cad" → ISO time. */
  steps: Record<string, string>;
}

const STORAGE_KEY = "leco.analysisDecisions.v1";
export const ATTORNEY = "Jennifer Davis";
const EMPTY: CaseDecisions = { items: {}, steps: {} };

function load(): Record<string, CaseDecisions> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

let all: Record<string, CaseDecisions> = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();

function update(caseId: string, fn: (d: CaseDecisions) => CaseDecisions): boolean {
  all = { ...all, [caseId]: fn(all[caseId] ?? EMPTY) };
  let stored = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    stored = false;
  }
  listeners.forEach((l) => l());
  return stored;
}

/** Records (or updates) a decision; earlier versions stay in its history. */
export function recordDecision(caseId: string, key: string, d: { choice: string; owner?: string; note?: string }) {
  const at = new Date().toISOString();
  return update(caseId, (c) => {
    const prev = c.items[key];
    const entry = { choice: d.choice, owner: d.owner || undefined, note: d.note?.trim() || undefined, by: ATTORNEY, at };
    return { ...c, items: { ...c.items, [key]: { ...entry, history: [...(prev?.history ?? []), entry] } } };
  });
}

export function toggleStep(caseId: string, key: string) {
  return update(caseId, (c) => {
    const { [key]: was, ...rest } = c.steps;
    return { ...c, steps: was ? rest : { ...rest, [key]: new Date().toISOString() } };
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCaseDecisions(caseId: string | undefined): CaseDecisions {
  return useSyncExternalStore(subscribe, () => (caseId && all[caseId]) || EMPTY, () => EMPTY);
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// A conflict or claim to open when its workspace mounts (set by cross-links).
let pendingFocus: string | undefined;
export const setFocus = (id: string) => { pendingFocus = id; };
export const takeFocus = () => { const f = pendingFocus; pendingFocus = undefined; return f; };
