import type { NegligenceElement, ElementStatus } from "../defendants/defendantData";

// ── Liability analysis inputs, per case ──────────────────────────────────────
// What the Liability Analysis needs beyond what the Defendant Analysis, the
// Jurisdiction review and the timeline already hold: the checks run on the
// plaintiff's own conduct, who holds each record, the records still to obtain,
// how timeline events tie to findings, and the scenarios an attorney can test.
//
// Rules for a record:
// - Defendant findings are NOT repeated here — they are read from the
//   Defendant Analysis record, so one change reaches both pages. Only findings
//   that apply to every defendant at once (one indivisible injury) live here.
// - A plaintiff check is a question the analysis asked of the record, with
//   what the record shows. Where the record is silent the check says so; no
//   conduct is attributed to the plaintiff to fill a tab.
// - Nothing here holds a percentage. No validated allocation model exists in
//   this application, so shares are only ever the attorney's own entries.

/** Status of a check on the plaintiff's conduct. */
export type PlaintiffStatus = "Not indicated" | "Not yet known" | "No issue on record" | "Not applicable";

/** How one factor bears on a plaintiff-conduct item. */
export type PlaybookEffect = "Helps" | "Neutral" | "Pending" | "Flag" | "N/A";

/** The reduction playbook's nine factors, in order — every plaintiff item is
 *  read against each of them. */
export const PLAYBOOK_FACTORS = [
  "Causation", "Concurrency", "Burden", "Admissibility", "Exceptions",
  "Recharacterize", "Capacity / standard", "Comparative weight", "Rebuttal evidence",
] as const;
export type PlaybookFactor = (typeof PLAYBOOK_FACTORS)[number];

export interface PlaybookItem {
  factor: PlaybookFactor;
  explanation: string;
  effect: PlaybookEffect;
  /** What the record holds on it, or what is missing. */
  evidence: string;
  followUp?: string;
  authorityId?: string;
}

export interface PlaintiffCheck {
  id: string;
  code: string;
  element: NegligenceElement;
  category: string;
  title: string;
  /** What the defense could argue — and what the record shows. */
  description: string;
  /** Card-length title and two-line summary; the full title and description stay above. */
  shortTitle?: string;
  summary?: string;
  status: PlaintiffStatus;
  /** Defendant-analysis sources (by id) the check rests on. */
  sourceIds: string[];
  /** A fact taken from a module rather than a file. */
  moduleSource?: string;
  authorityId?: string;
  open?: string;
  /** Item-specific playbook entries; the other factors are read from the record. */
  playbook: PlaybookItem[];
}

/** A finding that applies to every defendant in the analysis at once. */
export interface SharedFinding {
  id: string;
  kind: NegligenceElement;
  category: string;
  finding: string;
  description: string;
  /** Card-length summary; `description` stays the full text. */
  summary?: string;
  status: ElementStatus;
  sourceIds: string[];
  authorityId?: string;
  missing?: string;
}

export type Priority = "Urgent" | "High" | "Medium";

export interface Recommendation {
  id: string;
  priority: Priority;
  title: string;
  /** Why it matters to liability. */
  why: string;
  /** Card-length versions of the title and reason; the full text stays in `title` and `why`. */
  shortTitle?: string;
  short?: string;
  candidateId?: string;
  /** The elements it would answer, as "candidateId:index". */
  answers: string[];
  custodian: string;
  /** How it is obtained — a records request, a public record, an expert. */
  method: string;
  /** Can it be obtained before suit? Only stated where it is known. */
  preSuit: "Yes" | "Discovery likely" | "Not assessed";
  /** A file name in the case documents that would show it has been received. */
  receivedMatch?: RegExp;
  /** The request the attorney can draft. */
  draft: { kind: "records" | "search" | "expert" | "preservation"; label: string };
}

export interface Custody {
  heldBy: string;
  preSuit: "Yes" | "Discovery likely" | "Not assessed";
}

export interface TimelineLink {
  party: string;
  /** Findings it supports, as "candidateId:index". */
  findings: string[];
  /** "impact": the harm itself, set apart on the timeline. */
  kind?: "impact";
  phaseNote?: string;
}

export interface Scenario {
  id: string;
  title: string;
  assumption: string;
  /** Scenarios in the same group are alternatives — choosing one clears the other. */
  group?: string;
  /** Whether the evidence it assumes can be had before suit, or only in litigation. */
  when: "pre-suit" | "litigation";
  changes: { ref: string; to: ElementStatus }[];
  /** What the scenario would affect. */
  affects: ("allocation" | "causation" | "legal exposure" | "litigation outlook" | "party identity")[];
  /** A record flag it would resolve, by jurisdiction flag id. */
  resolvesFlag?: string;
}

/** An exception to — or condition on — the plaintiff-fault defense. */
export interface FaultException {
  name: string;
  detail: string;
  status: "Applies" | "Pending" | "No evidence yet" | "Not met" | "N/A";
  authorityId?: string;
}

export interface CaseLiability {
  id: string;
  caseRefs: string[];
  /** The defendant-analysis record this reads its parties and findings from. */
  defendantRecordId: string;
  /** The date the record places the incident on, and where it comes from. */
  incidentOnRecord: { iso: string; source: string };
  /** The date the evidence places the events on, and where it comes from. */
  incidentInEvidence: { iso: string; source: string };
  /** Filing status, as the record holds it. */
  filing: string;
  plaintiff: { name: string; checks: PlaintiffCheck[] };
  sharedFindings: SharedFinding[];
  custody: Record<string, Custody>;
  recommendations: Recommendation[];
  timelineLinks: Record<string, TimelineLink>;
  /** The window between two timeline events where the alleged breach sits. */
  causalWindow?: { from: string; to: string; title: string; detail: string };
  scenarios: Scenario[];
  exceptions: FaultException[];
  /** What the client is asked to keep; the attorney records each as confirmed. */
  preservationChecklist: { id: string; item: string; short?: string; why: string }[];
  research: { profileQuery: string; webQuery: string };
  /** Recovery sources on record — never fault parties. */
  recoverySources: { name: string; status: string; why: string; short?: string; next: string }[];
  /** People and entities the record names that the analysis does not treat as defendants. */
  notPursued: { name: string; why: string; short?: string }[];
}

export const CASE_LIABILITY: CaseLiability[] = [
  {
    id: "miller-liability",
    caseRefs: ["PI-2024-001", "CASE-94101"],
    defendantRecordId: "miller",
    incidentOnRecord: { iso: "2026-02-14", source: "Case record — date of incident" },
    incidentInEvidence: { iso: "2026-02-07", source: "Caregiver_Log.pdf; Facility_Incident_Report.pdf" },
    filing: "Not filed — no filing on record",
    plaintiff: {
      name: "Evelyn Miller",
      checks: [
        {
          id: "p-capacity", code: "PD1", element: "duty", category: "Capacity / standard of care",
          title: "Standard of care expected of a memory-care resident",
          description: "Any self-care duty is measured against her capacity. She was a resident of a memory care facility; her cognitive capacity is not on record.",
          shortTitle: "Standard of care for a resident", summary: "Measured against her capacity, which is not on record.",
          status: "Not yet known", sourceIds: ["case-record"],
          open: "Cognitive assessment or care-level records from the facility.",
          playbook: [
            { factor: "Capacity / standard", explanation: "A resident placed in memory care for supervision is not held to the self-care expected of an unimpaired adult — confirm against her assessment.", effect: "Pending", evidence: "Care-level and cognitive assessment not on file.", followUp: "Request the admission assessment and care plan." },
            { factor: "Recharacterize", explanation: "The facility undertook her care; recognising and escalating the emergency was the staff's task, not hers.", effect: "Helps", evidence: "Caregiver log: staff documented the signs (cited; not in the case documents)." },
          ],
        },
        {
          id: "p-own-safety", code: "PD2", element: "duty", category: "Common-law duty",
          title: "Reasonable care for her own safety",
          description: "Every person must use ordinary care for their own safety. For a memory-care resident, what that requires depends on her capacity, which is not on record.",
          shortTitle: "Reasonable care for own safety", summary: "What it requires depends on her capacity — not on record.",
          status: "Not yet known", sourceIds: ["case-record"],
          open: "Her capacity and care level at the time.",
          playbook: [
            { factor: "Capacity / standard", explanation: "The standard is measured against what a person of her condition could do.", effect: "Pending", evidence: "Capacity not on record.", followUp: "Request the care plan and cognitive assessment." },
          ],
        },
        {
          id: "p-conduct", code: "PB1", element: "breach", category: "Plaintiff conduct",
          title: "Her conduct before or during the stroke response",
          description: "The record attributes no act or omission to her. The jurisdiction review records that no evidence of fault by the plaintiff is on record.",
          shortTitle: "Her conduct in the stroke response", summary: "No act or omission by her is on record.",
          status: "Not indicated", sourceIds: ["caregiver-log", "jurisdiction-review"], moduleSource: "Jurisdiction review — fault evidence", authorityId: "il-2-1116",
          playbook: [
            { factor: "Comparative weight", explanation: "Even if conduct surfaced, it is weighed against a documented escalation delay of about 145 minutes.", effect: "Helps", evidence: "Facility call log (cited; not in the case documents)." },
            { factor: "Rebuttal evidence", explanation: "Staff statements could raise resident refusal or non-cooperation — none are on file.", effect: "Pending", evidence: "Staff statements not obtained.", followUp: "Request the facility's internal incident review and staff statements." },
          ],
        },
        {
          id: "p-medication", code: "PB2", element: "breach", category: "Medication adherence",
          title: "Whether she took or refused prescribed medication",
          description: "The case alleges negligent medication management by the facility. Who gave each dose — and whether any was refused — is not on record. Open question, not a finding.",
          shortTitle: "Took or refused medication", summary: "Who gave each dose, or any refusal, is not on record. Open question.",
          status: "Not yet known", sourceIds: ["case-record"], open: "Medication administration record for February 2026.",
          playbook: [
            { factor: "Recharacterize", explanation: "In memory care, staff usually give medication; a refusal argument needs the administration record to show it.", effect: "Pending", evidence: "No medication administration record on file.", followUp: "Request the medication administration record and physician orders." },
            { factor: "Admissibility", explanation: "Until the record exists, a refusal argument is speculation and should be treated as such.", effect: "Neutral", evidence: "No record either way." },
          ],
        },
        {
          id: "p-reporting", code: "PB3", element: "breach", category: "Reporting symptoms",
          title: "Delay by her in reporting the symptoms",
          description: "The caregiver log shows staff observed the stroke signs themselves. Nothing on record shows a delay on her part in seeking help.",
          shortTitle: "Delay in reporting symptoms", summary: "Staff observed the stroke signs; no delay by her is on record.",
          status: "Not indicated", sourceIds: ["caregiver-log"],
          playbook: [
            { factor: "Recharacterize", explanation: "Recognition of the emergency was observed and documented by staff — the escalation decision was theirs.", effect: "Helps", evidence: "Caregiver log (cited; not in the case documents)." },
          ],
        },
        {
          id: "p-causation", code: "PC1", element: "causation", category: "Causal link",
          title: "Any conduct of hers linked to the injury",
          description: "With no plaintiff conduct on record there is nothing to connect to the stroke or its outcome. Revisit if the medication or staff records raise any.",
          shortTitle: "Her conduct linked to the injury", summary: "No conduct of hers is on record to link to the stroke.",
          status: "Not indicated", sourceIds: ["jurisdiction-review"], moduleSource: "Jurisdiction review — fault evidence",
          playbook: [
            { factor: "Rebuttal evidence", explanation: "Whether the delay itself worsened the outcome is open for the defendants too — it is an expert question.", effect: "Pending", evidence: "No expert opinion on file.", followUp: "Retain a neurology expert on the treatment window." },
          ],
        },
        {
          id: "p-concurrency", code: "PC2", element: "causation", category: "Concurrency",
          title: "Conduct of hers overlapping the escalation delay",
          description: "Concurrent fault needs conduct of hers at the same time as the staff's delay. None is recorded.",
          shortTitle: "Overlap with the escalation delay", summary: "Needs conduct of hers during the staff's delay — none recorded.",
          status: "Not indicated", sourceIds: ["caregiver-log", "facility-call-log"],
          playbook: [
            { factor: "Concurrency", explanation: "No conduct of hers is recorded during the window between the documented signs and the 911 call.", effect: "Helps", evidence: "Caregiver log and call log (cited; not in the case documents)." },
          ],
        },
        {
          id: "p-med-link", code: "PC3", element: "causation", category: "No causal link · PB2",
          title: "Medication refusal linked to the stroke",
          description: "If the records ever showed a refused dose, the defense would still need to link it to the stroke or its outcome. Neither is on record.",
          shortTitle: "Refusal linked to the stroke", summary: "No refused dose, and no link to the stroke, is on record.",
          status: "Not yet known", sourceIds: ["case-record"], open: "Medication administration record and an expert opinion.",
          playbook: [
            { factor: "Causation", explanation: "A refusal argument fails without a medical link to the stroke.", effect: "Pending", evidence: "No record or expert opinion either way.", followUp: "Ask the neurology expert to address medication as a factor." },
          ],
        },
        {
          id: "p-preexisting", code: "PM1", element: "damages", category: "Pre-existing condition",
          title: "Conditions before the stroke",
          description: "The defense may argue the harm stems partly from prior conditions. No pre-incident medical history is on file, and the injury findings record no pre-existing condition.",
          shortTitle: "Conditions before the stroke", summary: "No pre-incident history on file; no prior condition recorded.",
          status: "Not yet known", sourceIds: ["case-record"], moduleSource: "Injury Signals — no pre-existing condition recorded",
          open: "Prior medical history, including why she was in memory care.",
          playbook: [
            { factor: "Comparative weight", explanation: "Apportioning harm between prior conditions and the delay belongs to the Damages module; liability only flags it.", effect: "Flag", evidence: "No prior history on file." },
            { factor: "Rebuttal evidence", explanation: "Admission records set her post-stroke baseline; a pre-incident baseline is needed to argue aggravation either way.", effect: "Pending", evidence: "Pre-incident baseline not on file.", followUp: "Request prior medical records." },
          ],
        },
        {
          id: "p-mitigation", code: "PM2", element: "damages", category: "Mitigation",
          title: "Followed treatment after the stroke",
          description: "Rehabilitation began Mar 4, 2026 and continued to the May 20, 2026 assessment. Nothing on record suggests she failed to follow treatment.",
          shortTitle: "Followed treatment after the stroke", summary: "Rehabilitation ran Mar 4 – May 20, 2026; no failure to follow treatment.",
          status: "No issue on record", sourceIds: ["rehab-records"],
          playbook: [
            { factor: "Rebuttal evidence", explanation: "A continuous course of therapy answers a failure-to-mitigate argument; attendance is not recorded either way.", effect: "Pending", evidence: "Attendance log not on file.", followUp: "Confirm attendance with the therapy provider." },
          ],
        },
        {
          id: "p-restraint", code: "PM3", element: "damages", category: "Restraint / safety device",
          title: "Not applicable",
          description: "Seat-belt, helmet and similar safety-device reductions belong to vehicle and recreation claims. No such issue arises in a facility stroke-response claim.",
          shortTitle: "Not applicable", summary: "Safety-device reductions don't arise in a facility stroke claim.",
          status: "Not applicable", sourceIds: [],
          playbook: [],
        },
      ],
    },
    sharedFindings: [
      {
        id: "shared-indivisible", kind: "damages", category: "Indivisible injury",
        finding: "Single stroke, single injury", summary: "One stroke, one injury; liable defendants may each answer for all of it — not verified.",
        description: "One stroke event caused the injury, so defendants found liable may each answer for the whole harm. How it is shared follows the joint-and-several rule — not verified.",
        status: "Indicated", sourceIds: ["imaging"], authorityId: "il-2-1117",
        missing: "Whether § 2-1118 changes the § 2-1117 rule for this claim is not verified.",
      },
      {
        id: "shared-intervening", kind: "causation", category: "Intervening cause",
        finding: "No superseding cause identified", summary: "No intervening act is on record between the delay and the harm.",
        description: "Nothing in the record identifies an intervening act between the delayed escalation and the harm. Care after hospital arrival is not alleged to be negligent.",
        status: "Not indicated", sourceIds: ["hospital-admission"],
      },
    ],
    custody: {
      "caregiver-log": { heldBy: "The facility", preSuit: "Yes" },
      "facility-incident-report": { heldBy: "The facility", preSuit: "Discovery likely" },
      "facility-call-log": { heldBy: "The facility", preSuit: "Discovery likely" },
      "dispatch-record": { heldBy: "Emergency dispatch (agency not on record)", preSuit: "Not assessed" },
      "hospital-admission": { heldBy: "Cook County Medical Center", preSuit: "Yes" },
      imaging: { heldBy: "Cook County Medical Center", preSuit: "Yes" },
      "rehab-records": { heldBy: "Treating providers", preSuit: "Yes" },
    },
    recommendations: [
      {
        id: "r-entity", priority: "High", title: "Entity search — Memory Care Facility LLC and Logistics Co.", shortTitle: "Entity search — facility and Logistics Co.",
        short: "Confirms which entity to name.",
        why: "Confirms which entity to name. The caption and the Analysis stage name different defendants.",
        candidateId: "memory-care-llc", answers: ["logistics-co:0"],
        custodian: "Illinois Secretary of State", method: "Public record search", preSuit: "Yes",
        draft: { kind: "search", label: "Record search" },
      },
      {
        id: "r-expert", priority: "High", title: "Medical expert review of the treatment window", shortTitle: "Expert review of the treatment window",
        short: "Causation is not yet known; needs an expert opinion.",
        why: "Causation is not yet known for the facility or its staff. The MRI confirms the stroke, not the effect of the delay.",
        candidateId: "memory-care-llc", answers: ["memory-care-llc:3", "staff:3"],
        custodian: "Retained neurology expert", method: "Expert retention", preSuit: "Yes",
        receivedMatch: /expert|neurology_(opinion|review|report)/i,
        draft: { kind: "expert", label: "Draft expert brief" },
      },
      {
        id: "r-staffing", priority: "High", title: "Staffing roster, schedule and statements for Feb 7, 2026", shortTitle: "Staffing roster and statements, Feb 7",
        why: "Shows who decided when to call 911 and who employed them.",
        candidateId: "staff", answers: ["staff:2", "memory-care-llc:2"],
        custodian: "The facility", method: "Records request", preSuit: "Discovery likely",
        receivedMatch: /staff|roster|schedule|shift/i,
        draft: { kind: "records", label: "Draft request" },
      },
      {
        id: "r-mar", priority: "High", title: "Medication administration record and physician orders, February 2026", shortTitle: "Medication records and physician orders",
        short: "Tests the medication allegation and any refusal argument.",
        why: "The only way to test the medication allegation — and any refusal argument against her.",
        candidateId: "medication", answers: ["medication:0", "medication:1"],
        custodian: "The facility; prescriber; pharmacy", method: "Records request (patient records)", preSuit: "Yes",
        receivedMatch: /medication_administration|\bmar\b|physician_(orders|prescription)|pharmacy/i,
        draft: { kind: "records", label: "Draft request" },
      },
      {
        id: "r-licence", priority: "High", title: "Facility licence and licensing type",
        short: "Decides which Illinois filing rules and claims apply.",
        why: "Decides whether the § 2-622 report, the repose period and Nursing Home Care Act claims apply.",
        candidateId: "memory-care-llc", answers: [],
        custodian: "Illinois licensing authority", method: "Public record search", preSuit: "Yes",
        receivedMatch: /licen[cs]e/i,
        draft: { kind: "search", label: "Record search" },
      },
      {
        id: "r-protocol", priority: "Medium", title: "Stroke and emergency escalation protocols in force Feb 7, 2026", shortTitle: "Stroke escalation protocols, Feb 7",
        why: "Shows whether the delay also breached the facility's own protocol.",
        candidateId: "memory-care-llc", answers: [],
        custodian: "The facility", method: "Records request", preSuit: "Discovery likely",
        receivedMatch: /protocol/i,
        draft: { kind: "records", label: "Draft request" },
      },
      {
        id: "r-agreement", priority: "Medium", title: "Residency or admission agreement",
        why: "Documents the duty the facility undertook — currently indicated, not shown.",
        candidateId: "memory-care-llc", answers: ["memory-care-llc:0"],
        custodian: "The facility; the family", method: "Client or records request", preSuit: "Yes",
        receivedMatch: /admission_agreement|residency|custodial_care_agreement/i,
        draft: { kind: "records", label: "Draft request" },
      },
      {
        id: "r-ownership", priority: "Medium", title: "Facility ownership and management records",
        why: "Tests whether Logistics Co. has any connection to the facility or her care.",
        candidateId: "logistics-co", answers: ["logistics-co:0", "logistics-co:1"],
        custodian: "The facility; licensing authority", method: "Records request", preSuit: "Not assessed",
        receivedMatch: /ownership|management_agreement/i,
        draft: { kind: "records", label: "Draft request" },
      },
    ],
    timelineLinks: {
      "stroke-symptoms": { party: "Facility staff", findings: ["staff:0", "memory-care-llc:0"] },
      "911-delay": { party: "Facility staff", findings: ["staff:1", "memory-care-llc:1"] },
      "hospital-admission": { party: "Cook County Medical Center", findings: ["memory-care-llc:1"], phaseNote: "Arrival time corroborates the length of the delay." },
      "mri-confirmation": { party: "Cook County Medical Center", findings: ["memory-care-llc:4"], kind: "impact" },
      rehabilitation: { party: "Treating providers", findings: ["memory-care-llc:4"] },
      "lost-wages": { party: "Plaintiff", findings: [] },
      "current-condition": { party: "Treating providers", findings: ["memory-care-llc:4"] },
    },
    causalWindow: {
      from: "stroke-symptoms", to: "911-delay",
      title: "Escalation window",
      detail: "About 145 minutes between the documented stroke signs and the 911 call — the delay the breach findings rest on. Exact times are not on record.",
    },
    scenarios: [
      {
        id: "s-expert", title: "Expert finds the delay worsened the outcome", when: "pre-suit",
        assumption: "A neurology expert opines that timely escalation would have changed the outcome.",
        changes: [{ ref: "memory-care-llc:3", to: "Shown" }, { ref: "staff:3", to: "Shown" }],
        affects: ["causation", "litigation outlook"],
      },
      {
        id: "s-agreement", title: "Admission agreement obtained", when: "pre-suit",
        assumption: "The residency agreement sets out the care the facility undertook.",
        changes: [{ ref: "memory-care-llc:0", to: "Shown" }],
        affects: ["legal exposure"],
      },
      {
        id: "s-entity", title: "Entity search confirms the operator", when: "pre-suit",
        assumption: "The Secretary of State record shows Memory Care Facility LLC operates the facility.",
        changes: [],
        affects: ["party identity"],
        resolvesFlag: "defendant-name",
      },
      {
        id: "s-mar-error", title: "Medication record shows an error", when: "pre-suit", group: "mar",
        assumption: "The administration record shows missed or wrong doses before the stroke.",
        changes: [{ ref: "medication:0", to: "Shown" }],
        affects: ["legal exposure", "allocation"],
      },
      {
        id: "s-mar-clear", title: "Medication record shows no error", when: "pre-suit", group: "mar",
        assumption: "The administration record shows every dose given as ordered.",
        changes: [{ ref: "medication:0", to: "Not indicated" }],
        affects: ["allocation"],
      },
      {
        id: "s-staffing", title: "Staffing records identify the decision-maker", when: "litigation",
        assumption: "The roster and statements show who delayed the call, employed by the facility.",
        changes: [{ ref: "staff:2", to: "Shown" }, { ref: "memory-care-llc:2", to: "Shown" }],
        affects: ["legal exposure", "allocation"],
      },
    ],
    exceptions: [
      { name: "Burden on defense", detail: "Plaintiff fault is a defense the defendant must plead and prove.", status: "Applies", authorityId: "il-2-1116" },
      { name: "Plaintiff fault above 50%", detail: "The only point at which her fault would bar recovery. No plaintiff fault is on record.", status: "Not met", authorityId: "il-2-1116" },
      { name: "Capacity", detail: "Her cognitive capacity sets the standard her conduct is measured against — not on record.", status: "Pending" },
      { name: "Willful and wanton conduct", detail: "Whether any defendant's conduct rises above negligence. No evidence on record either way.", status: "No evidence yet" },
      { name: "Last clear chance", detail: "A contributory-negligence doctrine; the jurisdiction review applies Illinois modified comparative fault.", status: "N/A" },
      { name: "Sudden emergency", detail: "No defense reliance on a sudden emergency is on record.", status: "N/A" },
    ],
    preservationChecklist: [
      { id: "pc-meds", item: "Medication bottles and packaging", short: "Medication bottles", why: "Can show what was dispensed if the medication allegation is pursued." },
      { id: "pc-belongings", item: "Personal belongings returned by the facility", short: "Belongings", why: "May include care notes or medication." },
      { id: "pc-comms", item: "Texts, emails and voicemails with the facility", short: "Messages", why: "Can fix when the family was told, and what." },
      { id: "pc-photos", item: "Family photos and videos of her condition", short: "Family photos", why: "Before-and-after evidence of the harm." },
      { id: "pc-social", item: "Social media hold", why: "Posts about her care or condition must not be deleted." },
    ],
    research: {
      profileQuery: "Medical malpractice · IL · delayed stroke escalation · memory care",
      webQuery: "Illinois nursing home OR \"memory care\" delayed stroke escalation negligence",
    },
    recoverySources: [
      {
        name: "ABC Professional Liability Insurance",
        status: "Recovery source",
        why: "Carrier on the Case Intelligence Summary. Policy and declarations not on file; not a fault party.",
        short: "Potential recovery source; not a fault party.",
        next: "To Damages module",
      },
    ],
    notPursued: [
      { name: "Cook County Medical Center", why: "Treating hospital. The Defendant Analysis does not treat treating providers as defendants; nothing on record points to fault.", short: "Treating provider; no current basis to treat as a defendant." },
    ],
  },
];

export function liabilityForCase(caseRef?: string): CaseLiability | undefined {
  if (!caseRef) return undefined;
  return CASE_LIABILITY.find((c) => c.caseRefs.includes(caseRef));
}
