// ── Jurisdiction & statute-of-limitations analysis ───────────────────────────
// One structured record per case, in the shape the Jurisdiction & SOL Review
// renders: candidate forums, the fault picture, deadlines per forum and claim,
// the facts and parties behind them, what is missing or assumed, and the
// liability summary the attorney decides on. The page holds no case content.
//
// Rules for what goes in a record:
// - A case fact comes from the case record or its evidence, and names its source.
// - A legal rule names the statute or decision it rests on.
// - Anything the record does not establish is null / "Not available" /
//   "Unconfirmed", or an explicit ASSUMED item — never filled in.
// - Deadlines are calculated (start date + period), not typed in.

export type Confidence = "High" | "Medium" | "Low";
export type Severity = "HIGH" | "MEDIUM" | "LOW";

// ── Fault rules ──────────────────────────────────────────────────────────────
// The four ways a jurisdiction can treat the plaintiff's own share of fault.
// General reference; the example states must be verified (see the page note).

export type FaultRuleId = "contributory" | "pure" | "mod50" | "mod51";

export const FAULT_RULES: {
  id: FaultRuleId;
  name: string;
  how: string;
  examples: string;
  /** Share of damages recovered at a client-fault percentage; 0 = barred. */
  recovers: (fault: number) => number;
}[] = [
  { id: "contributory", name: "Contributory", how: "Any client fault bars recovery", examples: "VA, MD, DC, NC, AL", recovers: (f) => (f > 0 ? 0 : 100) },
  { id: "pure", name: "Pure comparative", how: "Recovery reduced by client's share, at any level", examples: "e.g., CA, NY", recovers: (f) => 100 - f },
  { id: "mod50", name: "Modified, 50% bar", how: "Barred at 50% or more; otherwise reduced", examples: "e.g., CO, GA", recovers: (f) => (f >= 50 ? 0 : 100 - f) },
  { id: "mod51", name: "Modified, 51% bar", how: "Barred above 50%; otherwise reduced", examples: "e.g., PA, TX, IL", recovers: (f) => (f > 50 ? 0 : 100 - f) },
];

export const faultRule = (id: FaultRuleId) => FAULT_RULES.find((r) => r.id === id)!;

/** "Barred" or "90% of damages" for a rule at a client-fault level. */
export function faultResult(id: FaultRuleId, fault: number): { barred: boolean; label: string } {
  const pct = faultRule(id).recovers(fault);
  return pct === 0 ? { barred: true, label: "Barred" } : { barred: false, label: `${pct}% of damages` };
}

// ── Record shape ─────────────────────────────────────────────────────────────

export interface ForumCell {
  value: string;
  /** Uncertain values carry the reference's "?" marker. */
  uncertain?: boolean;
  tone?: "warning";
}

export const FORUM_ROWS = [
  { key: "basis", label: "Jurisdiction basis" },
  { key: "strength", label: "Strength" },
  { key: "amount", label: "Amount over $75,000" },
  { key: "removal", label: "Removal risk" },
  { key: "choiceOfLaw", label: "Choice-of-law approach" },
  { key: "governingLaw", label: "Likely governing law" },
  { key: "ownFaultRule", label: "Forum's own fault rule" },
  { key: "faultApplied", label: "Fault rule likely applied" },
  { key: "resultAtFault", label: "Result at client fault" },
  { key: "damageCaps", label: "Damage caps" },
  { key: "preSuit", label: "Pre-suit requirements" },
  { key: "firmAdmitted", label: "Firm admitted" },
  { key: "deadline", label: "Deadline (from Deadlines tab)" },
] as const;
export type ForumRowKey = (typeof FORUM_ROWS)[number]["key"];

export interface CandidateForum {
  id: string;
  /** "Illinois state court" */
  title: string;
  /** "Circuit Court of Cook County" */
  court: string;
  /** The rule the forum would likely apply, which decides the fault result. */
  appliedRule: FaultRuleId;
  ownRuleLabel: string;
  appliedRuleLabel: string;
  /** The working-deadline row for this forum. */
  deadlineId: string;
  /** Checked when the decision card opens — the forum where the incident occurred. */
  defaultSelected?: boolean;
  cells: Record<Exclude<ForumRowKey, "resultAtFault" | "deadline">, ForumCell>;
}

export interface DeadlineRow {
  id: string;
  forum: string;
  claim: string;
  /** ISO start date and the period, from which the deadline is calculated. */
  start: string;
  startLabel: string;
  years: number;
  periodLabel: string;
  adjustments: string;
  ruleSource: string;
  status: "Open" | "Uncertain";
  confidence: Confidence;
  /** The deadline the decision card asks the attorney to confirm. */
  working?: boolean;
}

export interface FactRow {
  field: string;
  value: string | null;
  source: string | null;
  confidence: Confidence | null;
  verified: boolean;
  verifiedNote?: string;
}

export interface PartyRow {
  name: string;
  roleType: string;
  citizenship: string | null;
  citizenshipWarn?: boolean;
  basis: string | null;
  diversity: "Diverse" | "Not diverse" | "Unconfirmed" | "—";
}

export interface AssumptionItem {
  kind: "MISSING" | "ASSUMED";
  title: string;
  detail: string;
  /** Becomes a follow-up task when the attorney asks for more information. */
  task?: string;
}

export interface JurisdictionFlag {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  sources: string[];
}

export interface FaultException {
  name: string;
  status: "POSSIBLE" | "NO EVIDENCE YET" | "NOT APPLICABLE";
  detail: string;
}

/** One way the case connects to a state: where the plaintiff lives, where the
 *  defendant is based, or where the incident happened. A candidate for the
 *  attorney to weigh — not a confirmed filing forum. */
export interface JurisdictionConnection {
  type: "plaintiff" | "defendant" | "incident";
  /** The state, only when the record establishes it. */
  state: string | null;
  location: string | null;
  /** Why this location — or why it is not known. */
  basis: string;
  /** The deadline row for this state's limitations rule, when it has been analysed. */
  deadlineId?: string;
  /** Where the finding is shown in this review. */
  source?: { label: string; tab: "facts" | "parties" | "deadlines" };
}

export interface CaseJurisdiction {
  caseRefs: string[];
  defendant: string;
  incidentDate: string;
  governingLaw: { finding: string | null; confidence: Confidence; basis: string };
  governingLawOptions: string[];
  forums: CandidateForum[];
  fault: {
    /** Client-fault estimate from the liability analysis, when there is one. */
    estimate: { low: number; high: number; source: string; confidence: Confidence } | null;
    evidence: string[];
    exceptions: FaultException[];
    /** Shown instead of the exceptions when they cannot arise. */
    exceptionsNote?: string;
  };
  deadlines: DeadlineRow[];
  facts: FactRow[];
  parties: PartyRow[];
  specialRegimes: string;
  assumptions: AssumptionItem[];
  flags: JurisdictionFlag[];
  liability: { summary: string; bestPath: string };
  connections?: JurisdictionConnection[];
}

// ── Records ──────────────────────────────────────────────────────────────────

export const CASE_JURISDICTIONS: CaseJurisdiction[] = [
  {
    // Estate of Miller vs Logistics Co.
    caseRefs: ["PI-2024-001", "CASE-94101"],
    defendant: "Memory Care Facility LLC",
    incidentDate: "2026-02-14",
    governingLaw: {
      finding: "Illinois",
      confidence: "Medium",
      basis: "Jurisdiction on record is Cook County, IL, where the conduct alleged took place. Illinois applies the most-significant-relationship test.",
    },
    governingLawOptions: ["Illinois", "Another state (explain in override reason)"],
    forums: [
      {
        id: "il-state",
        title: "Illinois state court",
        court: "Circuit Court of Cook County",
        appliedRule: "mod51",
        ownRuleLabel: "Modified, 51% bar",
        appliedRuleLabel: "Modified, 51% bar (Illinois law)",
        deadlineId: "il-pi",
        defaultSelected: true,
        cells: {
          basis: { value: "Incident state (Cook County, IL)" },
          strength: { value: "Strong — facility address to confirm", uncertain: true },
          amount: { value: "Not required" },
          removal: { value: "Only if diversity is confirmed and no defendant is an Illinois citizen", uncertain: true },
          choiceOfLaw: { value: "Most significant relationship" },
          governingLaw: { value: "Illinois" },
          ownFaultRule: { value: "Modified, 51% bar" },
          faultApplied: { value: "Modified, 51% bar (Illinois law)" },
          damageCaps: { value: "None on compensatory damages" },
          preSuit: { value: "Health professional's report (§ 2-622), if a healing-art claim", uncertain: true },
          firmAdmitted: { value: "Not available", tone: "warning" },
        },
      },
      {
        id: "federal",
        title: "Federal court",
        court: "N.D. Ill., Chicago",
        appliedRule: "mod51",
        ownRuleLabel: "Follows Illinois",
        appliedRuleLabel: "Modified, 51% bar (Illinois law)",
        deadlineId: "fed-pi",
        cells: {
          basis: { value: "Diversity — unconfirmed", uncertain: true, tone: "warning" },
          strength: { value: "Uncertain — LLC members unknown", tone: "warning" },
          amount: { value: "Likely (valuation estimate $968,700–$1,372,325)" },
          removal: { value: "Not applicable" },
          choiceOfLaw: { value: "Follows Illinois" },
          governingLaw: { value: "Illinois" },
          ownFaultRule: { value: "Follows Illinois" },
          faultApplied: { value: "Modified, 51% bar (Illinois law)" },
          damageCaps: { value: "None on compensatory damages" },
          preSuit: { value: "§ 2-622 report, as in state court", uncertain: true },
          firmAdmitted: { value: "Not available", tone: "warning" },
        },
      },
    ],
    fault: {
      estimate: null,
      evidence: [
        "Caregiver_Log.pdf: staff documented stroke indicators on Feb 7, 2026",
        "Facility_Call_Log.pdf: the 911 call was delayed",
        "No evidence of fault by the plaintiff is on record",
      ],
      exceptions: [],
      exceptionsNote: "Not applicable — every forum likely applies Illinois modified comparative fault, under which client fault reduces recovery rather than barring it below 51%.",
    },
    deadlines: [
      {
        id: "il-pi",
        forum: "Illinois state",
        claim: "Personal injury / medical malpractice",
        start: "2026-02-07",
        startLabel: "Stroke response, Feb 7, 2026 (Caregiver_Log.pdf) — earlier than the recorded incident date, Feb 14, 2026",
        years: 2,
        periodLabel: "2 years",
        adjustments: "Discovery rule — runs from when the injury was known; incident-date conflict unresolved",
        ruleSource: "735 ILCS 5/13-212(a); 735 ILCS 5/13-202 · not yet verified",
        status: "Open",
        confidence: "Medium",
        working: true,
      },
      {
        id: "il-repose",
        forum: "Illinois state",
        claim: "Statute of repose (healing-art claims)",
        start: "2026-02-07",
        startLabel: "Date of the act, Feb 7, 2026",
        years: 4,
        periodLabel: "4 years (outer limit)",
        adjustments: "Applies only if the claim is healing-art malpractice — depends on the facility's licensing",
        ruleSource: "735 ILCS 5/13-212(a) · not yet verified",
        status: "Uncertain",
        confidence: "Low",
      },
      {
        id: "fed-pi",
        forum: "Federal (N.D. Ill.)",
        claim: "Personal injury / medical malpractice",
        start: "2026-02-07",
        startLabel: "Stroke response, Feb 7, 2026",
        years: 2,
        periodLabel: "2 years (Illinois law applies)",
        adjustments: "Follows forum state rules",
        ruleSource: "735 ILCS 5/13-212(a) · not yet verified",
        status: "Open",
        confidence: "Low",
      },
    ],
    facts: [
      { field: "Incident date", value: "Feb 14, 2026", source: "Case record", confidence: "Low", verified: false, verifiedNote: "conflicts with timeline" },
      { field: "Stroke response date", value: "Feb 7, 2026", source: "Caregiver_Log.pdf; Facility_Incident_Report.pdf", confidence: "High", verified: true },
      { field: "Incident location", value: "Memory care facility — address not on record", source: "Facility_Incident_Report.pdf", confidence: "Medium", verified: false },
      { field: "Jurisdiction on record", value: "Cook County, IL", source: "Case record", confidence: "Medium", verified: false, verifiedNote: "not tied to an address" },
      { field: "Client residence", value: null, source: null, confidence: null, verified: false },
      { field: "Defendant", value: "Memory Care Facility LLC", source: "Stage 3 Analysis", confidence: "Medium", verified: false, verifiedNote: "caption names Logistics Co." },
      { field: "LLC registration", value: null, source: null, confidence: null, verified: false },
      { field: "Injuries / treatment", value: "Ischemic stroke confirmed by MRI; rehabilitation", source: "Radiology_Report.pdf; Physical_Therapy_Notes.pdf", confidence: "High", verified: true },
    ],
    parties: [
      { name: "Evelyn Miller", roleType: "Plaintiff · individual", citizenship: null, basis: "Domicile not on record", diversity: "—" },
      { name: "Memory Care Facility LLC", roleType: "Defendant · LLC", citizenship: "Unknown — members not listed", citizenshipWarn: true, basis: null, diversity: "Unconfirmed" },
      { name: "Logistics Co. (named in caption)", roleType: "Defendant · entity type unknown", citizenship: "Unknown", citizenshipWarn: true, basis: null, diversity: "Unconfirmed" },
    ],
    specialRegimes: "None identified on the record. The defendant is a private LLC, not a government entity. The facility's licensing is not on record — if it is licensed under the Illinois Nursing Home Care Act, statutory resident-rights claims may also be available.",
    assumptions: [
      { kind: "MISSING", title: "LLC member citizenship", detail: "Federal court eligibility unconfirmed. If any member is an Illinois citizen and the plaintiff is too, diversity fails and the case stays in state court.", task: "LLC member citizenship" },
      { kind: "MISSING", title: "Plaintiff's domicile", detail: "Needed for diversity. Not on the intake record.", task: "Plaintiff's domicile" },
      { kind: "MISSING", title: "Which incident date is correct", detail: "The case record gives Feb 14, 2026; the timeline records the stroke response on Feb 7, 2026. The deadline uses the earlier date until confirmed.", task: "Correct incident date" },
      { kind: "MISSING", title: "Facility licensing type", detail: "Decides whether the § 2-622 report and the 4-year repose period apply, and whether Nursing Home Care Act claims are available.", task: "Facility licensing type" },
      { kind: "MISSING", title: "Whether the plaintiff has died", detail: "The caption reads \"Estate of Miller\" but the treatment record shows the plaintiff living. A death changes the parties, claims and deadlines.", task: "Plaintiff's status (estate caption)" },
      { kind: "ASSUMED", title: "Facility is within Cook County, IL", detail: "Taken from the jurisdiction on record; the facility address is not on file. Venue and governing law rest on it." },
      { kind: "ASSUMED", title: "Injury known on Feb 7, 2026", detail: "The limitation period runs from the earliest dated event. A later discovery date would extend it." },
      { kind: "ASSUMED", title: "Damages exceed $75,000", detail: "Based on the valuation estimate of $968,700–$1,372,325. If lower, federal court is not available." },
    ],
    flags: [
      {
        id: "incident-date-conflict",
        severity: "HIGH",
        title: "Two incident dates on record",
        detail: "The case record gives Feb 14, 2026, but the Analysis timeline records the stroke symptoms, the delayed 911 response and the hospital admission on Feb 7, 2026. The working deadline runs from the earlier date until the attorney confirms which is correct.",
        sources: ["Case record — date of incident", "Caregiver_Log.pdf", "Facility_Incident_Report.pdf", "Emergency_Dispatch_Record.pdf"],
      },
      {
        id: "estate-caption",
        severity: "HIGH",
        title: "Case is styled as an estate, but the plaintiff is living",
        detail: "The caption reads \"Estate of Miller\", while the timeline shows Evelyn Miller beginning rehabilitation on Mar 4, 2026 and her condition assessed on May 20, 2026. If the caption reflects a death not yet on record, the parties, the claims available and their deadlines all change.",
        sources: ["Case caption", "Physical_Therapy_Notes.pdf", "Treatment_Records.pdf"],
      },
      {
        id: "defendant-name",
        severity: "MEDIUM",
        title: "Defendant named inconsistently",
        detail: "The caption names Logistics Co.; the Analysis stage identifies Memory Care Facility LLC. The correct entity — and its members' citizenship — decides venue and whether a federal forum is available at all.",
        sources: ["Case caption", "Stage 3 Analysis — Case Intelligence Summary"],
      },
      {
        id: "facility-licensing",
        severity: "MEDIUM",
        title: "Facility licensing type not on record",
        detail: "Whether the facility is licensed as a nursing home, an assisted-living establishment or otherwise decides whether the health professional's report (735 ILCS 5/2-622) and the repose period apply, and which Illinois resident-protection statutes are available.",
        sources: ["Facility_Incident_Report.pdf"],
      },
      {
        id: "firm-admission",
        severity: "LOW",
        title: "Firm admission not on record",
        detail: "Confirm the firm's admission to the Northern District of Illinois before a federal forum is planned around.",
        sources: ["Firm record"],
      },
    ],
    connections: [
      {
        type: "plaintiff",
        state: null,
        location: null,
        basis: "Evelyn Miller's domicile is not on the intake record.",
        source: { label: "Parties & regimes · Evelyn Miller", tab: "parties" },
      },
      {
        type: "defendant",
        state: null,
        location: null,
        basis: "Memory Care Facility LLC's registered location and principal place of business are not on record; its members are not listed.",
        source: { label: "Parties & regimes · Memory Care Facility LLC", tab: "parties" },
      },
      {
        type: "incident",
        state: "Illinois",
        location: "Cook County, IL · memory care facility",
        basis: "From the jurisdiction on record; the facility address is not on file.",
        deadlineId: "il-pi",
        source: { label: "Facts & sources · incident location", tab: "facts" },
      },
    ],
    liability: {
      summary: "Facility staff documented stroke indicators on Feb 7, 2026 and the 911 response was delayed; imaging confirmed an ischemic stroke.",
      bestPath: "confirm the incident date and the facility's licensing; document the escalation delay.",
    },
  },
];

export function jurisdictionForCase(caseRef?: string): CaseJurisdiction | undefined {
  if (!caseRef) return undefined;
  return CASE_JURISDICTIONS.find((c) => c.caseRefs.includes(caseRef));
}

// ── Calculations ─────────────────────────────────────────────────────────────

/** Start date + whole years, in UTC so the date never shifts with the viewer's timezone. */
export function deadlineDate(row: DeadlineRow): string {
  const [y, m, d] = row.start.split("-").map(Number);
  return new Date(Date.UTC(y + row.years, m - 1, d)).toISOString().slice(0, 10);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "Not available";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function workingDeadline(record?: CaseJurisdiction): { iso: string; row: DeadlineRow } | undefined {
  const row = record?.deadlines.find((d) => d.working);
  return row ? { iso: deadlineDate(row), row } : undefined;
}

export const faultRangeLabel = (e: { low: number; high: number }) => `${e.low}–${e.high}%`;

// ── The attorney's decision ──────────────────────────────────────────────────

export type DecisionStatus = "open" | "approved" | "needs-info" | "escalated";

export interface AuditEntry {
  at: string;
  action: string;
  detail?: string;
  from?: string;
  to?: string;
  reason?: string;
}

export interface AttorneyDecision {
  governingLaw: string;
  forums: string[];
  deadlineConfirmed: boolean;
  reason: string;
  status: DecisionStatus;
  reviewer?: string;
  decidedAt?: string;
  /** Every decision and override, with the system finding it replaced. */
  audit: AuditEntry[];
}

export function initialDecision(record?: CaseJurisdiction): AttorneyDecision {
  return {
    governingLaw: record?.governingLaw.finding ?? "",
    forums: record?.forums.filter((f) => f.defaultSelected).map((f) => f.id) ?? [],
    deadlineConfirmed: false,
    reason: "",
    status: "open",
    audit: [],
  };
}

// ── Governing law, as the Case Intelligence Summary states it ────────────────

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "Cook County, IL" → "Illinois"; undefined when no state can be read. */
export function stateOfJurisdiction(jurisdiction?: string): string | undefined {
  const last = jurisdiction?.split(",").pop()?.trim();
  if (!last) return undefined;
  if (US_STATES[last.toUpperCase()]) return US_STATES[last.toUpperCase()];
  return Object.values(US_STATES).find((s) => s.toLowerCase() === last.toLowerCase());
}

/** What the Governing Law field shows, strongest source first: the law the
 *  attorney approved; the system's provisional finding; the state of the
 *  jurisdiction on record. Anything short of approval says it needs review. */
export function governingLawSummary(caseRef: string | undefined, jurisdiction: string | undefined, approved?: string): { value: string; note?: string } {
  if (approved) return { value: approved, note: "Approved by the attorney" };
  const finding = jurisdictionForCase(caseRef)?.governingLaw.finding;
  if (finding) return { value: finding, note: "Provisional system finding · needs attorney confirmation" };
  const state = stateOfJurisdiction(jurisdiction);
  if (state) return { value: state, note: "From the jurisdiction on record · needs attorney review" };
  return { value: "Needs attorney review" };
}
