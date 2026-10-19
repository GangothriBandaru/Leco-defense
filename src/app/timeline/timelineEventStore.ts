import { useSyncExternalStore } from "react";

// ── Case timeline: the attorney's changes ────────────────────────────────────
// The extracted timeline events are never changed. What the attorney does is
// kept beside them, per case, in this browser:
//   • edits to an extracted event — only the fields changed, so the extracted
//     original stays readable and an edit can be undone;
//   • extracted events removed from the timeline — a marker, not a deletion of
//     the extracted record or its documents, so they can be restored;
//   • events the attorney added;
//   • a history of every change.
// A write the browser refuses throws, so the caller never shows it as saved.

export const EVENT_TYPES = ["Incident", "Treatment", "Injury", "Damages", "Case milestone", "Other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The fields an attorney can set on an event. Dates are ISO (yyyy-mm-dd). */
export interface EventFields {
  title: string;
  date: string;
  description: string;
  type?: EventType;
  /** File names of the case documents supporting the event. */
  evidence: string[];
  /** The document the event is taken from, when the attorney names one. */
  sourceRef?: string;
}

export interface ManualEvent extends EventFields {
  id: string;
  createdAt: string;
  createdBy: string;
}

export interface TimelineHistoryEntry {
  at: string;
  by: string;
  eventId: string;
  action: "added" | "edited" | "removed" | "restored";
  /** The event as it read when the change was made. */
  title: string;
  date: string;
  /** Which fields changed, for an edit. */
  fields?: string[];
}

export interface CaseTimeline {
  edits: Record<string, Partial<EventFields> & { at: string; by: string }>;
  removed: Record<string, { at: string; by: string }>;
  manual: ManualEvent[];
  history: TimelineHistoryEntry[];
}

const EMPTY: CaseTimeline = { edits: {}, removed: {}, manual: [], history: [] };
const STORAGE_KEY = "leco.timeline.events.v1";
type State = Record<string, CaseTimeline>;

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

export function useCaseTimeline(caseId: string): CaseTimeline {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return s[caseId] ?? EMPTY;
}

/** Saves one case's timeline changes. Throws when the browser refuses. */
function save(caseId: string, next: CaseTimeline) {
  const updated = { ...state, [caseId]: next };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  state = updated;
  emit();
}

const current = (caseId: string) => state[caseId] ?? EMPTY;
const entry = (by: string, eventId: string, action: TimelineHistoryEntry["action"], f: { title: string; date: string }, fields?: string[]): TimelineHistoryEntry =>
  ({ at: new Date().toISOString(), by, eventId, action, title: f.title, date: f.date, ...(fields ? { fields } : {}) });

export function addTimelineEvent(caseId: string, fields: EventFields, by: string): ManualEvent {
  const c = current(caseId);
  const ev: ManualEvent = { ...fields, id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), createdBy: by };
  save(caseId, { ...c, manual: [...c.manual, ev], history: [...c.history, entry(by, ev.id, "added", fields)] });
  return ev;
}

/** Edits an attorney-added event in place. */
export function updateManualEvent(caseId: string, id: string, fields: EventFields, changed: string[], by: string) {
  const c = current(caseId);
  save(caseId, {
    ...c,
    manual: c.manual.map((e) => (e.id === id ? { ...e, ...fields } : e)),
    history: [...c.history, entry(by, id, "edited", fields, changed)],
  });
}

/** Records an edit to an extracted event: only the fields that now differ from
 *  the extracted original are kept, so the original is never overwritten. */
export function editExtractedEvent(caseId: string, id: string, overrides: Partial<EventFields>, shown: { title: string; date: string }, changed: string[], by: string) {
  const c = current(caseId);
  const edits = { ...c.edits };
  if (Object.keys(overrides).length) edits[id] = { ...overrides, at: new Date().toISOString(), by };
  else delete edits[id];
  save(caseId, { ...c, edits, history: [...c.history, entry(by, id, "edited", shown, changed)] });
}

/** Removes an event from the timeline. An attorney-added event is deleted; an
 *  extracted one is only hidden. Supporting documents are never touched. */
export function removeTimelineEvent(caseId: string, id: string, shown: { title: string; date: string }, by: string) {
  const c = current(caseId);
  const manual = c.manual.some((e) => e.id === id);
  save(caseId, {
    ...c,
    manual: manual ? c.manual.filter((e) => e.id !== id) : c.manual,
    removed: manual ? c.removed : { ...c.removed, [id]: { at: new Date().toISOString(), by } },
    history: [...c.history, entry(by, id, "removed", shown)],
  });
}

/** Puts removed extracted events back on the timeline. */
export function restoreExtractedEvents(caseId: string, shown: Record<string, { title: string; date: string }>, by: string) {
  const c = current(caseId);
  const ids = Object.keys(c.removed);
  save(caseId, { ...c, removed: {}, history: [...c.history, ...ids.map((id) => entry(by, id, "restored", shown[id] ?? { title: id, date: "" }))] });
}
