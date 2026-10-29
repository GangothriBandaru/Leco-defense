import { useSyncExternalStore } from "react";

// ── Case details edited from the Case Discovery card ─────────────────────────
// Sample cases are fixed in code and created cases live in intakeCaseStore, so
// the attorney's edits are kept here as per-case overrides keyed by case ID and
// saved to the browser so they survive leaving the case or a refresh.

export interface CaseDetails {
  caseName?: string;
  caseType?: string;
  caseSubType?: string;
  /** Where the case is venued — kept apart from the insurer's jurisdiction. */
  caseJurisdiction?: string;
  insuredName?: string;
  insuredEmail?: string;
  insuredPhone?: string;
  policyName?: string;
  policyNumber?: string;
  insurerName?: string;
  insurerJurisdiction?: string;
}

const STORAGE_KEY = "leco.caseDetails.v1";

function load(): Record<string, CaseDetails> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

let details: Record<string, CaseDetails> = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // Storage unavailable — the edits still hold for the rest of this session.
  }
}

/** Replaces the case's saved details. Blank values are dropped, so a cleared
 *  field falls back to the case record or shows as not provided. */
export function saveCaseDetails(caseId: string, next: CaseDetails) {
  const clean: CaseDetails = {};
  for (const [k, v] of Object.entries(next)) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) clean[k as keyof CaseDetails] = t;
  }
  details = { ...details, [caseId]: clean };
  save();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NONE: CaseDetails | undefined = undefined;

/** The case's saved details, or undefined when it has never been edited. */
export function useCaseDetails(caseId: string | undefined): CaseDetails | undefined {
  return useSyncExternalStore(subscribe, () => (caseId ? details[caseId] : NONE), () => NONE);
}
