import type { CaseDetails } from "../intake/caseDetailsStore";

// ── Demonstration values for the sample case ─────────────────────────────────
// Illustrative data only, not verified case facts. Stage 2 offers these as
// unsaved changes for fields the case has no saved value for, so a saved
// record is never overwritten; the attorney saves them or discards them.

const DEMO: Record<string, CaseDetails> = {
  "PI-2024-001": {
    insuredName: "Logistics Co.",
    insuredType: "LLC",
    insuredContact: "Dana Whitaker, Risk Manager",
    insuredEmail: "claims@logisticsco.example",
    insuredPhone: "+1 (312) 555-0148",
    insuredAddress: "250 South Wacker Drive, Chicago, IL 60606",
    insuredState: "Illinois",
    insuredCountry: "United States",
    insuredJurisdiction: "Cook County, Illinois",
    insurerName: "Sentinel Casualty Insurance",
    policyNumber: "CGL-7741-22",
    policyName: "Commercial General Liability",
    policyLimitOccurrence: "$1,000,000",
    policyLimitAggregate: "$2,000,000",
    policyLimits: "$1,000,000 per occurrence / $2,000,000 aggregate",
    coverageNotes: "Standard commercial general liability coverage; subject to policy terms, exclusions, and applicable endorsements.",

    plaintiffName: "Evelyn Miller",
    plaintiffLocation: "Chicago, Cook County, Illinois",
    plaintiffEmail: "evelyn.miller@gmail.com",
    plaintiffPhone: "(555) 123-4567",
    plaintiffState: "Illinois",
    plaintiffCounty: "Cook County",
    plaintiffJurisdiction: "Cook County, Illinois",
    counselName: "Maria Thompson",
    counselFirm: "Thompson & Associates LLP",
    counselEmail: "mthompson@thompsonlaw.example",
    counselPhone: "+1 (312) 555-0192",
    counselAddress: "120 West Madison Street, Chicago, IL 60602",

    incidentType: "Delayed medical treatment",
    caseType: "Medical Malpractice",
    caseSubType: "Delayed Treatment",
    incidentDate: "2026-02-14",
    incidentLocation: "Cook County Medical Center, Chicago, Illinois",
    incidentState: "Illinois",
    incidentCounty: "Cook County",
    jurisdictionalLimits: "Cook County, Illinois",
    caseStatus: "Suit",
    suitFiledDate: "2026-02-20",
    courtName: "Circuit Court of Cook County",
    courtLocation: "Chicago, Cook County, Illinois",
    suitJurisdiction: "Cook County, Illinois",
    courtState: "Illinois",
    courtCounty: "Cook County",
    jurisdictionVerified: "Unverified",
    solDate: "2028-02-14",
    solVerified: "Unverified",
    answerDueDate: "2026-03-23",
    answerVerified: "Unverified",
    governingLaw: "Illinois State Law",
    jurisdictionType: "Comparative Negligence",
    caseJurisdiction: "Cook County, Illinois",

    demandAmount: "350,000",
    demandDate: "2026-03-02",
    demandStatus: "Demand received",
    exposureNotes: "Demo note: initial demand of $350,000 received; no offer made yet.",
  },
};

/** The sample case's demo values, if it has any. */
export const demoCaseDetails = (caseId: string): CaseDetails | undefined => DEMO[caseId];

/** Fills only the fields `base` leaves empty; returns the keys it filled. */
export function withDemo(base: CaseDetails, demo: CaseDetails | undefined): { details: CaseDetails; filled: (keyof CaseDetails)[] } {
  if (!demo) return { details: base, filled: [] };
  const details = { ...base };
  const filled: (keyof CaseDetails)[] = [];
  for (const [k, v] of Object.entries(demo) as [keyof CaseDetails, string][]) {
    if (!(base[k] ?? "").trim()) { details[k] = v; filled.push(k); }
  }
  return { details, filled };
}
