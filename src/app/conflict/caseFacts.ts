import type { CaseDetails } from "../intake/caseDetailsStore";
import type { CasePolicy } from "../insurance/casePolicy";

/** The case's details as Stage 2 shows them: the attorney's saved values,
 *  otherwise what the case record and the policy on file already say. Nothing
 *  is filled in that neither source states. */
export function resolveCaseFacts(caseData: any, saved: CaseDetails | undefined, policy: CasePolicy): CaseDetails {
  const s = saved ?? {};
  const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    ...s,
    caseName: s.caseName ?? caseData?.caseName,
    caseType: s.caseType ?? caseData?.caseType,
    caseSubType: s.caseSubType ?? caseData?.caseSubType,
    caseJurisdiction: s.caseJurisdiction ?? caseData?.jurisdiction,
    insuredName: s.insuredName ?? policy.namedInsured,
    policyName: s.policyName ?? policy.policyType,
    policyNumber: s.policyNumber ?? policy.policyNo,
    insurerName: s.insurerName ?? policy.insurer,
    plaintiffName: s.plaintiffName ?? caseData?.plaintiff,
    plaintiffEmail: s.plaintiffEmail ?? caseData?.plaintiffEmail,
    incidentDate: s.incidentDate ?? isoDate(caseData?.dateOfIncident),
  };
}

/** "2026-10-08" → "Oct 8, 2026", read as a calendar date (no time-zone shift). */
export function fmtDay(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const isSuit = (d: CaseDetails) => d.caseStatus === "Suit";

/** Whole days from today to a yyyy-mm-dd date; negative once it has passed. */
export function daysUntil(v: string | undefined): number | undefined {
  const m = v && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((+new Date(+m[1], +m[2] - 1, +m[3]) - +t) / 86400000);
}

export const join = (...parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");
