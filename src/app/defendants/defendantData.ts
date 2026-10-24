// ── Defendant Analysis ───────────────────────────────────────────────────────
// Who could answer for the harm in a case, what the record shows about each,
// and what the system recommends: name now, investigate, or set aside. Every
// record here is built only from what the case already holds — the Analysis
// timeline, the case record and caption, and the jurisdiction review. Each
// statement says whether it is a fact from a source, an inference the system
// draws, or a question the record leaves open. Nothing is filled in to look
// complete: where the record is silent, the analysis says so.

export type Recommendation = "name" | "investigate" | "set-aside";
export type Tier = "Primary" | "Secondary" | "Tertiary";
export type ElementStatus = "Shown" | "Indicated" | "Not yet known" | "Not indicated" | "Not established";
export type DefendantChoice = "name" | "investigate" | "do-not-pursue";

/** A pointer into a source, with what it shows there. */
export interface Cite {
  sourceId: string;
  /** What the source shows — never a page number the record does not hold. */
  note: string;
}

/** Which negligence element a liability element speaks to. */
export type NegligenceElement = "duty" | "breach" | "causation" | "damages";

export interface LiabilityElement {
  /** The negligence element it addresses — Duty, Breach, Causation, Damages. */
  kind?: NegligenceElement;
  /** The Liability Analysis card: its category label, finding statement and
   *  explanation, and the legal authority it rests on, where one is recorded. */
  category?: string;
  finding?: string;
  /** Card-length title and summary; `finding` and `description` stay the full text. */
  shortTitle?: string;
  summary?: string;
  description?: string;
  authorityId?: string;
  name: string;
  status: ElementStatus;
  cite?: Cite;
  /** For an element not shown: what is missing, and what would show it. */
  missing?: string;
}

export interface PlanStep {
  question: string;
  request: string;
  /** Who holds the answer. */
  from: string;
  expected: string;
}

export interface Candidate {
  id: string;
  name: string;
  /** Short name for the tabs. */
  short: string;
  /** Relationship to the incident, in a few words. */
  role: string;
  /** One- or two-word role for compact party lists. */
  roleLabel?: string;
  /** Primary: caused the harm. Secondary: answers for an actor. Tertiary: an
   *  upstream cause. Absent when the record does not establish the relationship. */
  tier?: Tier;
  identified: "Named" | "Role only";
  groupId: string;
  /** Answerable through this candidate — shown indented beneath it. */
  parentId?: string;
  recommendation: Recommendation;
  /** One line on why they are on the list. */
  summary: string;
  /** The same, shorter, for compact tables. */
  summaryShort?: string;
  identifiedFrom: Cite;
  why: {
    facts: { text: string; cite?: Cite }[];
    inferences: string[];
    open: string[];
  };
  elementsLabel: string;
  elements: LiabilityElement[];
  /** Records to request next — specific to this candidate. */
  requests: string[];
  couldUndo: string;
  plan: PlanStep[];
  /** Why they were added, kept or set aside: the decision applied, the fact
   *  that triggered it and what it produced. `id` only where a real rule
   *  identifier exists — none is on record in this application. */
  ruleTrail: { id?: string; rule: string; trigger: string; result: string }[];
  /** Names this candidate is recorded under elsewhere in the app. */
  matchNames?: string[];
}

export interface DefendantSource {
  id: string;
  /** Source group shown in "Sources this analysis is based on". */
  group: string;
  name: string;
  type: string;
  /** What the source dates, when the record gives a date. */
  date?: string;
  /** Document files in the case evidence. Empty for records with no file —
   *  the case caption, a module's analysis. */
  files: string[];
  facts: { at?: string; text: string }[];
}

export interface CaseDefendants {
  id: string;
  caseRefs: string[];
  generatedFrom: string;
  /** Where the incident happened and what the injury is, from the record. */
  incident: { value: string; note: string; cite?: Cite };
  injury: { value: string; cite?: Cite };
  explanation: string;
  decideFirst: { text: string; cite?: Cite }[];
  groups: { id: string; title: string; subtitle: string }[];
  candidates: Candidate[];
  sources: DefendantSource[];
}

// ── Estate of Miller ─────────────────────────────────────────────────────────

const SRC = {
  caregiver: "caregiver-log",
  incidentReport: "facility-incident-report",
  callLog: "facility-call-log",
  dispatch: "dispatch-record",
  hospital: "hospital-admission",
  imaging: "imaging",
  rehab: "rehab-records",
  caseRecord: "case-record",
  analysis: "analysis-summary",
  jurisdiction: "jurisdiction-review",
};

export const CASE_DEFENDANTS: CaseDefendants[] = [
  {
    id: "miller",
    caseRefs: ["PI-2024-001", "CASE-94101"],
    generatedFrom: "Analysis timeline, case record and jurisdiction review",
    incident: {
      value: "Feb 7, 2026 · memory care facility, Cook County, IL",
      note: "The case record gives Feb 14, 2026; the timeline places the stroke response on Feb 7, 2026. Facility address not on record.",
      cite: { sourceId: SRC.caregiver, note: "stroke signs documented Feb 7, 2026" },
    },
    injury: {
      value: "Ischemic stroke confirmed by MRI · ongoing rehabilitation",
      cite: { sourceId: SRC.imaging, note: "MRI confirms ischemic stroke" },
    },
    explanation:
      "Facility staff documented stroke signs and the 911 call was delayed, so the facility's operator is liable on the record as it stands — once its legal name is confirmed. Its staff, the company named in the caption and whoever managed her medication are pointed to by the record, but their identity or part is not yet shown. Treating providers, the insurance carrier and witnesses are not treated as defendants.",
    decideFirst: [
      { text: "Confirm the defendant's legal entity before naming it: the caption names Logistics Co., the Analysis stage names Memory Care Facility LLC.", cite: { sourceId: SRC.jurisdiction, note: "flag: defendant named inconsistently" } },
      { text: "Working deadline Feb 7, 2028 is calculated from the Feb 7, 2026 stroke response and not yet confirmed. No defendant-specific deadline is on record.", cite: { sourceId: SRC.jurisdiction, note: "working deadline" } },
    ],
    groups: [
      { id: "facility", title: "Facility and responsible care personnel", subtitle: "Who cared for Evelyn Miller, and who answers for them" },
      { id: "medication", title: "Medication management", subtitle: "Alleged in the case description" },
      { id: "ownership", title: "Other potentially responsible entities", subtitle: "Parties named on the case without a shown connection" },
    ],
    candidates: [
      {
        id: "memory-care-llc",
        name: "Memory Care Facility LLC",
        short: "Memory Care Facility",
        role: "Facility operator · answers for its staff",
        roleLabel: "Operator",
        tier: "Secondary",
        identified: "Named",
        groupId: "facility",
        parentId: "staff",
        recommendation: "name",
        summary: "Its staff documented stroke signs and delayed the 911 call.",
        identifiedFrom: { sourceId: SRC.analysis, note: "Case Intelligence Summary · Defendant" },
        why: {
          facts: [
            { text: "Staff documented facial droop, slurred speech and right-side weakness on Feb 7, 2026.", cite: { sourceId: SRC.caregiver, note: "stroke signs documented" } },
            { text: "Emergency escalation was delayed about 145 minutes after the documented signs.", cite: { sourceId: SRC.callLog, note: "911 call delayed" } },
            { text: "The Analysis stage identifies Memory Care Facility LLC as the defendant.", cite: { sourceId: SRC.analysis, note: "Case Intelligence Summary" } },
          ],
          inferences: [
            "As the operator, it answers for the conduct of the staff caring for her.",
            "Its own escalation protocol or staffing may also have failed — the record does not yet say which.",
          ],
          open: [
            "Its exact legal name: the caption names Logistics Co.",
            "Its licensing type, which decides the claims and pre-suit requirements available.",
            "Whether the staff on duty were its employees or agency staff.",
          ],
        },
        elementsLabel: "Negligence",
        elements: [
          { kind: "duty", category: "Custodial duty of care", finding: "Reasonable care for a memory-care resident", shortTitle: "Reasonable care for a resident", description: "As the operator caring for a memory-care resident, the facility owed her reasonable care — including recognising an emergency and escalating it in time. The residency agreement setting out that care is not on file.", summary: "Owed her reasonable care, including timely escalation. Residency agreement not on file.", authorityId: "il-210-45", name: "Owed her a duty of care", status: "Indicated", cite: { sourceId: SRC.caregiver, note: "staff caring for her" }, missing: "Residency or admission agreement not on file." },
          { kind: "breach", category: "Emergency escalation", finding: "Delayed 911 call after documented stroke signs", shortTitle: "Delayed 911 after stroke signs", description: "Staff recorded facial droop, slurred speech and right-side weakness; emergency escalation came about 145 minutes later.", summary: "Stroke signs recorded; escalation came about 145 minutes later.", name: "Breached it: delayed emergency escalation", status: "Shown", cite: { sourceId: SRC.callLog, note: "911 call delayed" } },
          { kind: "duty", category: "Vicarious liability", finding: "Answers for the staff on duty", description: "An operator answers for the conduct of the employees caring for its resident. Whether the staff on duty were its employees or agency staff is not yet documented.", summary: "Answers for its staff; whether they were employees or agency staff is not documented.", name: "Answers for the staff on duty", status: "Indicated", cite: { sourceId: SRC.caregiver, note: "facility staff entries" }, missing: "Employment of the staff on duty not yet documented." },
          { kind: "causation", category: "Delay → harm", finding: "Delay worsened the stroke outcome", description: "Whether a timely call would have changed the outcome needs a medical expert. The MRI confirms the stroke, not the effect of the delay.", summary: "Needs a medical expert; the MRI confirms the stroke, not the delay's effect.", name: "The delay caused or worsened the injury", status: "Not yet known", missing: "Needs a medical expert's opinion on the treatment window; the MRI confirms the stroke, not the effect of the delay." },
          { kind: "damages", category: "Injury linked to the delay", finding: "Ischemic stroke with ongoing rehabilitation", description: "MRI confirms an ischemic stroke; rehabilitation began Mar 4, 2026. Dollar figures belong to the Damages module.", summary: "MRI confirms ischemic stroke; rehabilitation began Mar 4, 2026.", name: "Damages", status: "Shown", cite: { sourceId: SRC.imaging, note: "ischemic stroke confirmed" } },
        ],
        requests: [
          "Illinois Secretary of State entity search for Memory Care Facility LLC",
          "Facility licence and licensing type",
          "Residency or admission agreement",
          "Stroke and emergency escalation protocols in force on Feb 7, 2026",
          "Staffing records for Feb 7, 2026",
          "Liability policy declarations (ABC Professional Liability Insurance is on the case summary)",
        ],
        couldUndo:
          "An entity search showing a different operator or licensee, or records showing the staff were supplied by an agency. A licensing type outside healing-art practice changes the claims and pre-suit steps, not the facility's liability.",
        plan: [
          { question: "Which legal entity operates the facility?", request: "Secretary of State search; facility licence", from: "Illinois Secretary of State; licensing authority", expected: "The entity to name, and whether it matches the caption" },
          { question: "What type of facility is it licensed as?", request: "Facility licence", from: "Licensing authority", expected: "Which claims and pre-suit requirements apply" },
          { question: "What did its protocol require when stroke signs appear?", request: "Escalation and stroke protocols", from: "The facility", expected: "Whether the delay breached its own protocol" },
          { question: "Who was on duty, and who employed them?", request: "Staffing records and schedules for Feb 7, 2026", from: "The facility", expected: "Whether it answers for each staff member" },
          { question: "What coverage applies?", request: "Policy declarations", from: "The facility; ABC Professional Liability Insurance", expected: "Limits available for the claim" },
        ],
        ruleTrail: [
          { rule: "Identified as the defendant by the Analysis stage", trigger: "Case Intelligence Summary · Defendant: Memory Care Facility LLC", result: "Added to the analysis as a named party" },
          { rule: "Operator answers for the staff caring for its resident", trigger: "Staff documented stroke signs; escalation delayed about 145 minutes (Feb 7, 2026)", result: "Secondary · recommended Name" },
          { rule: "Entity must be confirmed before naming", trigger: "Jurisdiction flag: defendant named inconsistently", result: "Name, subject to the entity search" },
        ],
        matchNames: ["memory care facility"],
      },
      {
        id: "staff",
        name: "Caregiving staff on duty, Feb 7, 2026",
        short: "Staff on duty",
        role: "Caregivers · observed the stroke signs",
        roleLabel: "Caregivers",
        tier: "Primary",
        identified: "Role only",
        groupId: "facility",
        recommendation: "investigate",
        summary: "Documented the stroke signs; escalation was delayed. Names not on record.",
        summaryShort: "Observed stroke signs; escalation was delayed.",
        identifiedFrom: { sourceId: SRC.caregiver, note: "staff entries, Feb 7, 2026" },
        why: {
          facts: [
            { text: "Staff documented the stroke signs on Feb 7, 2026.", cite: { sourceId: SRC.caregiver, note: "stroke signs documented" } },
            { text: "The 911 call came about 145 minutes after the documented signs.", cite: { sourceId: SRC.dispatch, note: "dispatch timing" } },
          ],
          inferences: [
            "The delay may be individual staff conduct, a failed facility protocol, or both — the records do not say which.",
          ],
          open: [
            "Names and roles of the staff on duty.",
            "Who decided when to call 911, and why.",
          ],
        },
        elementsLabel: "Negligence",
        elements: [
          { kind: "duty", category: "Caregiver duty", finding: "Recognise and escalate a resident emergency", shortTitle: "Recognise and escalate an emergency", description: "The staff caring for her on Feb 7, 2026 owed her reasonable care in recognising the stroke signs and calling for help.", summary: "Owed her care in recognising the stroke signs and calling for help.", name: "Owed her a duty of care", status: "Indicated", cite: { sourceId: SRC.caregiver, note: "caring for her on Feb 7" } },
          { kind: "breach", category: "Delayed escalation", finding: "Signs documented before the delayed call", description: "The caregiver log records the stroke signs before the delayed 911 call.", name: "Breached it: delayed escalation", status: "Shown", cite: { sourceId: SRC.caregiver, note: "signs documented before the delayed call" } },
          { kind: "breach", category: "Individual decision", finding: "Who decided when to call 911", description: "Which staff member made the escalation decision — and why — is not in evidence yet.", summary: "Who made the escalation decision, and why, is not in evidence yet.", name: "Which individual made the decision", status: "Not yet known", missing: "Not in evidence yet · needs the staffing records and staff statements." },
          { kind: "causation", category: "Delay → harm", finding: "Delay worsened the stroke outcome", description: "Needs a medical expert's opinion on the treatment window.", name: "The delay caused or worsened the injury", status: "Not yet known", missing: "Needs a medical expert's opinion." },
        ],
        requests: [
          "Staff roster and schedule for Feb 7, 2026",
          "Names, roles and licences of the staff on duty",
          "Staff statements or internal review of the incident",
        ],
        couldUndo:
          "Records showing staff escalated as soon as they could and the delay arose elsewhere. Naming individual staff often adds little where the facility answers for them — an attorney's choice.",
        plan: [
          { question: "Who was on duty when the signs appeared?", request: "Roster and schedule", from: "The facility", expected: "Names and roles" },
          { question: "Who decided when to call 911?", request: "Staff statements; internal incident review", from: "The facility", expected: "Whether the delay was an individual decision or a protocol" },
          { question: "Were they qualified for the role?", request: "Licences and training records", from: "The facility; licensing boards", expected: "Whether a training or supervision claim arises" },
        ],
        ruleTrail: [
          { rule: "Actor whose conduct caused the harm", trigger: "Caregiver log: staff documented the signs; the 911 call came about 145 minutes later", result: "Primary · role only" },
          { rule: "Identity unknown — investigate before deciding", trigger: "No staff names in the records on file", result: "Recommended Investigate" },
        ],
      },
      {
        id: "logistics-co",
        name: "Logistics Co. (named in the caption)",
        short: "Logistics Co.",
        role: "Named in the caption · relationship not established",
        roleLabel: "Named in caption",
        identified: "Named",
        groupId: "ownership",
        recommendation: "investigate",
        summary: "Named in the caption; nothing in the record ties it to the facility or her care.",
        summaryShort: "Named in caption; connection to the facility unconfirmed.",
        identifiedFrom: { sourceId: SRC.caseRecord, note: "case caption" },
        why: {
          facts: [
            { text: "The case caption names Logistics Co. as the defendant.", cite: { sourceId: SRC.caseRecord, note: "case caption" } },
            { text: "The Analysis stage identifies a different defendant, Memory Care Facility LLC.", cite: { sourceId: SRC.analysis, note: "Case Intelligence Summary" } },
          ],
          inferences: [],
          open: [
            "Whether it owns or operates the facility, is a different party, or is named in error.",
          ],
        },
        elementsLabel: "Connection to the harm",
        elements: [
          { kind: "duty", category: "Connection to the facility", finding: "Tie to the facility or her care", description: "Logistics Co. is named in the caption, but no record links it to the facility, its ownership or her care.", summary: "Named in the caption; no record links it to the facility or her care.", name: "Connected to the facility or her care", status: "Not yet known", missing: "No record links it to the facility. Needs an entity search and ownership records." },
          { kind: "duty", category: "Duty of care", finding: "Duty owed to her", description: "Whether Logistics Co. owed her any duty depends on its connection to the facility, which is not established.", summary: "Depends on its connection to the facility — not established.", name: "Owed her a duty of care", status: "Not yet known", missing: "Depends on its connection to the facility." },
        ],
        requests: [
          "Illinois Secretary of State entity search for Logistics Co.",
          "Facility ownership and management records",
          "Confirmation of the caption with the intake record",
        ],
        couldUndo:
          "If the caption is an error, it drops off. If it owns or manages the facility, it is reassessed as an answerable party.",
        plan: [
          { question: "Who is Logistics Co.?", request: "Entity search", from: "Illinois Secretary of State", expected: "Its legal identity and officers" },
          { question: "Does it own or manage the facility?", request: "Ownership and management records", from: "The facility; licensing authority", expected: "Its connection to her care, if any" },
          { question: "Why is it in the caption?", request: "Intake record review", from: "The firm", expected: "Whether the caption should change" },
        ],
        ruleTrail: [
          { rule: "Party named in the caption is reviewed", trigger: "Caption: Estate of Miller vs Logistics Co.", result: "Added to the analysis" },
          { rule: "No connection to the harm shown — investigate before deciding", trigger: "Jurisdiction flag: defendant named inconsistently; no record links it to the facility", result: "Relationship not established · recommended Investigate" },
        ],
        matchNames: ["logistics co"],
      },
      {
        id: "medication",
        name: "Medication prescriber or pharmacy",
        short: "Medication",
        role: "Medication management · party not identified",
        roleLabel: "Management",
        tier: "Tertiary",
        identified: "Role only",
        groupId: "medication",
        recommendation: "investigate",
        summary: "The case description alleges negligent medication management; no medication record is on file.",
        summaryShort: "Medication negligence alleged; records not on file.",
        identifiedFrom: { sourceId: SRC.caseRecord, note: "case description" },
        why: {
          facts: [
            { text: "The case description alleges negligent medication management at the facility.", cite: { sourceId: SRC.caseRecord, note: "case description" } },
          ],
          inferences: [
            "Whoever prescribed, dispensed or gave her medication could answer for an error — facility staff, a prescriber or a pharmacy.",
          ],
          open: [
            "What medication error is alleged, and whether it relates to the stroke.",
            "Who prescribed, dispensed and gave the medication.",
          ],
        },
        elementsLabel: "Negligence",
        elements: [
          { kind: "breach", category: "Medication management", finding: "Medication given as ordered", description: "The case description alleges negligent medication management. No medication administration record is on file, so no error is shown.", summary: "Alleged, but no medication record is on file; no error is shown.", name: "A medication error occurred", status: "Not yet known", missing: "No medication administration record is on file." },
          { kind: "causation", category: "Medication → harm", finding: "Medication error contributed to the stroke", shortTitle: "Medication error and the stroke", description: "Whether any medication error contributed to the stroke or its outcome needs the records and an expert.", summary: "Needs the medication records and a medical expert.", name: "The error caused or worsened the injury", status: "Not yet known", missing: "Needs the records and a medical expert's opinion." },
        ],
        requests: [
          "Medication administration record for February 2026",
          "Physician orders and prescriptions",
          "Pharmacy dispensing records",
        ],
        couldUndo:
          "If the medication records show no error, this drops off. If facility staff gave the medication, it folds into the facility claim.",
        plan: [
          { question: "What medication was she on, and was it given as ordered?", request: "Medication administration record; physician orders", from: "The facility", expected: "Whether an error occurred, and by whom" },
          { question: "Who prescribed and dispensed it?", request: "Prescriptions; pharmacy records", from: "Prescriber; pharmacy", expected: "The parties to name, if any" },
          { question: "Did it contribute to the stroke or its outcome?", request: "Medical expert review", from: "Retained expert", expected: "Causation, or none" },
        ],
        ruleTrail: [
          { rule: "Allegation in the case description is reviewed", trigger: "Case description: negligent medication management at memory care facility", result: "Added as a role" },
          { rule: "No record yet shows an error or who made it — investigate", trigger: "No medication administration record on file", result: "Tertiary · role only · recommended Investigate" },
        ],
      },
    ],
    sources: [
      {
        id: SRC.caregiver, group: "Facility incident records", name: "Caregiver log", type: "Facility record", date: "Feb 7, 2026", files: ["Caregiver_Log.pdf"],
        facts: [
          { text: "Facial droop, slurred speech and right-side weakness documented by staff" },
          { text: "Signs recorded before the delayed emergency escalation" },
        ],
      },
      {
        id: SRC.incidentReport, group: "Facility incident records", name: "Facility incident report", type: "Facility record", date: "Feb 7, 2026", files: ["Facility_Incident_Report.pdf"],
        facts: [
          { text: "Stroke signs observed at the facility" },
          { text: "Facility licensing type not stated" },
        ],
      },
      {
        id: SRC.callLog, group: "Facility incident records", name: "Facility call log", type: "Facility record", date: "Feb 7, 2026", files: ["Facility_Call_Log.pdf"],
        facts: [{ text: "The 911 call was delayed — about 145 minutes after the documented signs" }],
      },
      {
        id: SRC.dispatch, group: "Emergency response records", name: "Emergency dispatch record", type: "Emergency services record", date: "Feb 7, 2026", files: ["Emergency_Dispatch_Record.pdf"],
        facts: [{ text: "Time of the 911 call and dispatch" }],
      },
      {
        id: SRC.hospital, group: "Medical and treatment records", name: "Hospital admission records", type: "Medical record", date: "Feb 7, 2026", files: ["ER_Admission_Record.pdf", "Triage_Notes.pdf", "Vitals_Chart.pdf"],
        facts: [
          { text: "Admitted to Cook County Medical Center with acute neurological deficits" },
          { text: "Time of arrival documented" },
        ],
      },
      {
        id: SRC.imaging, group: "Medical and treatment records", name: "Imaging", type: "Medical record", date: "Feb 9, 2026", files: ["Radiology_Report.pdf", "MRI_Cervical.pdf"],
        facts: [{ text: "MRI confirms ischemic stroke with permanent neurological injury" }],
      },
      {
        id: SRC.rehab, group: "Medical and treatment records", name: "Rehabilitation and treatment records", type: "Medical record", date: "Mar 4 – May 20, 2026", files: ["Physical_Therapy_Notes.pdf", "Treatment_Records.pdf", "Rehab_Care_Plan.pdf"],
        facts: [
          { text: "Rehabilitation began Mar 4, 2026; condition assessed May 20, 2026" },
          { text: "Use: injury severity only" },
        ],
      },
      {
        id: SRC.caseRecord, group: "Case record and analysis", name: "Case record and caption", type: "Case record", files: [],
        facts: [
          { at: "Caption", text: "Estate of Miller vs Logistics Co." },
          { at: "Description", text: "Delayed stroke response and negligent medication management at memory care facility" },
          { at: "Incident", text: "Date of incident recorded as Feb 14, 2026" },
        ],
      },
      {
        id: SRC.analysis, group: "Case record and analysis", name: "Case Intelligence Summary", type: "Stage 2 Analysis", files: [],
        facts: [
          { at: "Defendant", text: "Memory Care Facility LLC" },
          { at: "Carrier", text: "ABC Professional Liability Insurance" },
        ],
      },
      {
        id: SRC.jurisdiction, group: "Existing jurisdiction analysis", name: "Jurisdiction & SOL review", type: "Jurisdiction module", files: [],
        facts: [
          { at: "Law", text: "Illinois — provisional system finding" },
          { at: "Deadline", text: "Working deadline Feb 7, 2028, not yet confirmed" },
          { at: "Flags", text: "Defendant named inconsistently; facility licensing type not on record" },
        ],
      },
    ],
  },
];

export function defendantsForCase(caseRef?: string): CaseDefendants | undefined {
  if (!caseRef) return undefined;
  return CASE_DEFENDANTS.find((c) => c.caseRefs.includes(caseRef));
}

/** The candidate recorded under a name used elsewhere in the app, if any. */
export function candidateForName(record: CaseDefendants | undefined, name?: string): Candidate | undefined {
  if (!record || !name) return undefined;
  const n = name.toLowerCase();
  return record.candidates.find((c) => c.name.toLowerCase() === n || c.matchNames?.some((m) => n.includes(m)));
}

export const REC_ORDER: Recommendation[] = ["name", "investigate", "set-aside"];
export const REC_LABEL: Record<Recommendation, string> = { name: "Name", investigate: "Investigate", "set-aside": "Set aside" };
export const CHOICE_LABEL: Record<DefendantChoice, string> = { name: "Name", investigate: "Investigate", "do-not-pursue": "Do not pursue" };
export const choiceFor = (r: Recommendation): DefendantChoice => (r === "set-aside" ? "do-not-pursue" : r);

/** Candidates in recommendation order: name, investigate, set aside. */
export function byRecommendation(record: CaseDefendants) {
  return REC_ORDER.map((rec) => ({ rec, candidates: record.candidates.filter((c) => c.recommendation === rec) }));
}

export const shownCount = (c: Candidate) => c.elements.filter((e) => e.status === "Shown").length;
export const openCount = (c: Candidate) => c.elements.filter((e) => e.status === "Not yet known").length;
