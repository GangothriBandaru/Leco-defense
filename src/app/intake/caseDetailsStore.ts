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

  // ── Stage 2 Case Details ──
  // Insured & insurance. policyName above is the policy type.
  insuredType?: string;
  insuredContact?: string;
  insuredAddress?: string;
  insuredState?: string;
  insuredCountry?: string;
  insuredJurisdiction?: string;
  policyLimits?: string;
  coverageNotes?: string;
  // Plaintiff & counsel
  plaintiffName?: string;
  plaintiffLocation?: string;
  plaintiffState?: string;
  plaintiffCounty?: string;
  plaintiffJurisdiction?: string;
  counselName?: string;
  counselFirm?: string;
  counselEmail?: string;
  counselPhone?: string;
  counselAddress?: string;
  // Incident, suit and deadlines. Dates are yyyy-mm-dd; *Verified is "Verified" | "Unverified".
  incidentType?: string;
  incidentDate?: string;
  incidentLocation?: string;
  incidentState?: string;
  incidentCounty?: string;
  jurisdictionalLimits?: string;
  caseStatus?: string;
  suitFiledDate?: string;
  courtName?: string;
  courtLocation?: string;
  courtState?: string;
  courtCounty?: string;
  jurisdictionVerified?: string;
  solDate?: string;
  solVerified?: string;
  answerDueDate?: string;
  answerVerified?: string;
  governingLaw?: string;
  // Demands & exposure. demandDocs holds document names joined by "\n".
  demandAmount?: string;
  demandDate?: string;
  demandStatus?: string;
  demandDocs?: string;
  exposureNotes?: string;
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

function save(): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
    return true;
  } catch {
    // Storage unavailable — the edits still hold for the rest of this session.
    return false;
  }
}

/** Updates the fields given; fields left out keep their saved values. Blank
 *  values are dropped, so a cleared field falls back to the case record or
 *  shows as not provided. Returns false when the browser would not store it. */
export function saveCaseDetails(caseId: string, next: CaseDetails): boolean {
  const clean: CaseDetails = {};
  for (const [k, v] of Object.entries({ ...details[caseId], ...next })) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) clean[k as keyof CaseDetails] = t;
  }
  details = { ...details, [caseId]: clean };
  const stored = save();
  listeners.forEach((l) => l());
  return stored;
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
