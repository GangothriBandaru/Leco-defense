import type { CaseDocument } from "../types/case";
import type { DocBlock } from "../components/documentText";
import type { CaseEvidence, Conflict, MatrixCol, Source, Statement, Stance } from "./caseEvidence";
import type { DClaim, DemandModel, Level } from "./demandModel";

// ── The workbench's reference case: Maria Delgado v. Thomas R. Whitfield ──
// Everything here is the reference file's own content (PI Defense Workbench),
// carried over as that one case's record. It is used only for this case ID;
// every other case is analysed from its own documents.

export const REFERENCE_CASE_ID = "CL-2026-14872";
export const isReferenceCase = (caseId?: string) => caseId === REFERENCE_CASE_ID;

export const REFERENCE_CASE = {
  caseName: "Maria Delgado v. Thomas R. Whitfield",
  caseId: REFERENCE_CASE_ID,
  plaintiff: "Maria Delgado",
  caseType: "Motor Vehicle Accident",
  caseSubType: "Rear-end collision, I-66 E",
  summary: "Rear-end collision on I-66 E near Exit 57; plaintiff claims neck and L4-5 back injuries. Defense: lane change before braking.",
  jurisdiction: "Fairfax County, VA",
  stage: "Analysis",
  progress: 64,
  lastUpdated: "Reference case",
  isReady: false,
};

// ── Documents on file: the exhibits she attached and our records ──
const doc = (id: string, name: string, source: CaseDocument["source"], date: string, blocks: DocBlock[]): CaseDocument =>
  ({ id, name, source, date, status: "Processed", content: { kind: "text", blocks } } as CaseDocument);
const exhibitText = (ex: string, title: string, pages: string, shows: string): DocBlock[] => [
  { type: "heading", text: `${ex} · ${title}` },
  { type: "fields", pairs: [["Exhibit", ex], ["Pages", pages], ["Attached to", "Demand letter, Jun 2, 2026"]] },
  { type: "paragraph", text: shows },
];
export const REFERENCE_DOCUMENTS: CaseDocument[] = [
  doc("dl-demand", "Demand_letter_2026-06-02.pdf", "Plaintiff", "Jun 2, 2026", [{ type: "heading", text: "Demand letter" }, { type: "paragraph", text: "Time-limited demand for $185,000. Ms. Delgado was slowing for traffic in the right lane when Mr. Whitfield's vehicle struck her from behind." }]),
  doc("dl-complaint", "Complaint_CL-2026-14872.pdf", "Plaintiff", "Sep 30, 2026", [{ type: "heading", text: "Complaint · Fairfax County Circuit Court" }, { type: "paragraph", text: "Plaintiff's vehicle was slowing with traffic in the right lane when it was struck from behind." }]),
  doc("dl-exA", "Ex_A_Police_crash_report.pdf", "Plaintiff", "Nov 14, 2024", exhibitText("Ex. A", "Police crash report", "4", "Rear-end collision; no citation issued; diagram shows both cars in the same lane.")),
  doc("dl-exB", "Ex_B_Vehicle_photos.pdf", "Plaintiff", "Nov 2024", exhibitText("Ex. B", "Photos of plaintiff's vehicle", "6", "Rear damage to her SUV.")),
  doc("dl-exC", "Ex_C_Medical_summary_chart.pdf", "Plaintiff", "Jun 2, 2026", exhibitText("Ex. C", "Medical summary chart", "3", "Written by plaintiff's counsel.")),
  doc("dl-exD", "Ex_D_Inova_Urgent_Care_records.pdf", "Plaintiff", "Nov 15, 2024", exhibitText("Ex. D", "Inova Urgent Care records", "12", "Cervical and lumbar strain diagnosed Nov 15, 2024, the day after the crash.")),
  doc("dl-exE", "Ex_E_Itemized_bills.pdf", "Plaintiff", "Jun 2, 2026", exhibitText("Ex. E", "Itemized bills, all providers", "18", "Billed charges total $58,420.")),
  doc("dl-exF", "Ex_F_MRI_report.pdf", "Plaintiff", "Apr 10, 2025", exhibitText("Ex. F", "MRI report, Advanced Imaging of Reston", "2", "Small broad-based protrusion at L4-5.")),
  doc("dl-exG", "Ex_G_Capital_PT_records.pdf", "Plaintiff", "Feb 14, 2025", exhibitText("Ex. G", "Capital PT records", "31", "24 visits, Nov 2024 – Feb 2025.")),
  doc("dl-exH", "Ex_H_Dr_Patel_letter.pdf", "Plaintiff", "Jun 2026", exhibitText("Ex. H", "Dr. Ravi Patel letter", "1", "States the L4-5 injury is related to the collision; gives no reasoning.")),
  doc("dl-exI", "Ex_I_Hartwell_HR_letter.pdf", "Plaintiff", "Jun 2026", exhibitText("Ex. I", "Hartwell Logistics HR letter", "1", "Says she was out of work after the accident; gives no dates or pay rate.")),
  doc("dl-exJ", "Ex_J_Personal_impact_statement.pdf", "Plaintiff", "Jun 2026", exhibitText("Ex. J", "Plaintiff's personal impact statement", "4", "Describes daily pain, poor sleep, missed family events.")),
  doc("dl-exK", "Ex_K_Pharmacy_receipts.pdf", "Plaintiff", "Nov 2024 – Sep 2025", exhibitText("Ex. K", "Pharmacy receipts", "5", "No prescription history.")),
  doc("dl-ems", "EMS_run_sheet.pdf", "Attorney", "Nov 14, 2024", [{ type: "heading", text: "Fairfax County Fire & Rescue run sheet" }, { type: "paragraph", text: "Pt ambulatory at scene. C/o neck pain 3/10. Denies back pain. Refused transport." }]),
  doc("dl-ptdc", "Capital_PT_discharge_summary.pdf", "Attorney", "Feb 14, 2025", [{ type: "heading", text: "Capital Physical Therapy discharge summary" }, { type: "paragraph", text: "Pain 1/10. All goals met. Discharged to home exercise program." }]),
  doc("dl-whit", "Whitfield_recorded_statement.pdf", "Attorney", "Nov 17, 2024", [{ type: "heading", text: "Whitfield recorded statement" }, { type: "paragraph", text: "She came over from the right lane into mine and hit her brakes almost right away." }]),
  doc("dl-brooks", "Jalen_Brooks_witness_statement.pdf", "Attorney", "Nov 14, 2024", [{ type: "heading", text: "Statement of Jalen Brooks, taken by police" }, { type: "paragraph", text: "The white SUV moved left in front of the Honda and its brake lights came on right after." }]),
  doc("dl-repair", "Repair_estimate.pdf", "Attorney", "Nov 21, 2024", [{ type: "heading", text: "Property damage estimate, plaintiff's SUV" }, { type: "paragraph", text: "Total repair $2,340. Rear bumper cover, tailgate glass. No frame damage." }]),
];

// ── Evidence conflicts (CONF, SOURCES, MATRIX in the reference file) ──
const SOURCES: [string, string, string, string, number][] = [
  ["Complaint", "Pleading", "Sep 30, 2026", "Unsworn", 11], ["Plaintiff's interrogatory answers", "Discovery", "Nov 25, 2026", "Sworn", 24],
  ["Delgado deposition (186 pp)", "Testimony", "Apr 14, 2027", "Sworn", 63], ["Whitfield recorded statement", "Statement", "Nov 17, 2024", "Unsworn", 29],
  ["Whitfield interrogatory answers", "Discovery", "Nov 5, 2026", "Sworn", 22], ["Whitfield deposition (142 pp)", "Testimony", "May 3, 2027", "Sworn", 48],
  ["Jalen Brooks witness statement", "Witness", "Nov 14, 2024", "Unsworn", 6], ["Police crash report and diagram", "Official record", "Nov 14, 2024", "Official", 14],
  ["Officer Ruiz body camera (38 min)", "Video", "Nov 14, 2024", "Recording", 9], ["911 call log and audio", "Official record", "Nov 14, 2024", "Official", 4],
  ["EMS run sheet", "Medical", "Nov 14, 2024", "Contemporaneous", 7], ["Medical records (455 pp, 9 providers)", "Medical", "2021–2025", "Contemporaneous", 118],
  ["MRI report", "Imaging", "Apr 10, 2025", "Contemporaneous", 5], ["ISO ClaimSearch report", "Prior claims", "Nov 6, 2026", "Database", 3],
  ["Event data recorder download", "Vehicle data", "Jan 12, 2027", "Data", 12], ["Verizon phone records", "Phone data", "Feb 22, 2027", "Data", 6],
  ["VDOT traffic sensor data", "Traffic data", "Jan 30, 2027", "Data", 3], ["Hartwell employer records", "Employment", "Nov 18, 2026", "Business record", 15],
  ["Social media capture (public)", "Social media", "Captured Mar 2027", "Public post", 7], ["Vehicle photos and repair estimate", "Physical", "Nov 2024 – Dec 2026", "Physical", 31],
  ["Dr. Patel narrative report", "Expert", "May 20, 2027", "Expert", 8], ["Dr. Mehta IME report", "Expert", "Jun 15, 2027", "Expert", 14],
  ["Kessler reconstruction report", "Expert", "Jun 28, 2027", "Expert", 17],
];
const COL: Record<string, MatrixCol> = {
  Complaint: "plaintiff", "Plaintiff's interrogatory answers": "plaintiff", "Delgado deposition (186 pp)": "plaintiff",
  "Whitfield recorded statement": "insured", "Whitfield interrogatory answers": "insured", "Whitfield deposition (142 pp)": "insured",
  "Jalen Brooks witness statement": "witness", "Police crash report and diagram": "police", "Officer Ruiz body camera (38 min)": "police", "911 call log and audio": "police",
  "EMS run sheet": "medical", "Medical records (455 pp, 9 providers)": "medical", "MRI report": "medical",
  "Dr. Patel narrative report": "experts", "Dr. Mehta IME report": "experts", "Kessler reconstruction report": "experts",
};
// Which source each cited document belongs to.
const SOURCE_OF: [RegExp, string][] = [
  [/^Complaint/, "Complaint"], [/^Plaintiff's answers to interrogatories/, "Plaintiff's interrogatory answers"], [/^Delgado deposition/, "Delgado deposition (186 pp)"],
  [/^Whitfield recorded statement/, "Whitfield recorded statement"], [/^Whitfield answers to interrogatories/, "Whitfield interrogatory answers"], [/^Whitfield deposition/, "Whitfield deposition (142 pp)"],
  [/Jalen Brooks/, "Jalen Brooks witness statement"], [/FR300P/, "Police crash report and diagram"], [/body-worn camera/, "Officer Ruiz body camera (38 min)"], [/911 call log/, "911 call log and audio"],
  [/run sheet/, "EMS run sheet"], [/^MRI report/, "MRI report"], [/ISO ClaimSearch/, "ISO ClaimSearch report"], [/Event data recorder/, "Event data recorder download"],
  [/Verizon/, "Verizon phone records"], [/VDOT/, "VDOT traffic sensor data"], [/Hartwell/, "Hartwell employer records"], [/Instagram/, "Social media capture (public)"],
  [/vehicle photos|damage estimate/i, "Vehicle photos and repair estimate"], [/Patel/, "Dr. Patel narrative report"], [/Mehta/, "Dr. Mehta IME report"], [/Kessler/, "Kessler reconstruction report"],
  [/Inova|NoVA Pain|Capital Physical|Fairfax Spine|Medical chronology/, "Medical records (455 pp, 9 providers)"],
];

type E = [type: string, doc: string, loc: string, date: string, who: string, quote: string, weight: string];
interface RefConflict { id: string; t: string; topic: Conflict["topic"]; sev: Conflict["severity"]; effect: Conflict["effect"]; sum: string; pl: string; df: string; p: E[]; d: E[]; ctx: E[]; impact: string; val: string; next: string[]; self?: boolean; fact: string }
const CONF: RefConflict[] = [
  { id: "C1", fact: "Lane change before impact", t: "Did the plaintiff change lanes right before the crash?", topic: "Liability", sev: "Critical", effect: "Helps defense", self: true,
    sum: "The plaintiff's complaint and sworn interrogatory answer say she stayed in her lane. Her own deposition, the insured, the independent witness, and the reconstruction expert all point to a lane change seconds before she braked.",
    pl: "Stayed in her lane", df: "She moved into the insured's lane",
    p: [["Complaint", "Complaint ¶5", "p. 3", "Sep 30, 2026", "Plaintiff, through counsel", "Plaintiff's vehicle was slowing with traffic in the right lane when it was struck from behind.", "Unsworn pleading"],
      ["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 4", "p. 5", "Nov 25, 2026", "Maria Delgado", "I was in the right lane the whole time and was slowing down because traffic ahead was stopping.", "Sworn"]],
    d: [["Recorded statement", "Whitfield recorded statement", "p. 6 · 00:14:22", "Nov 17, 2024", "Thomas Whitfield (insured)", "She came over from the right lane into mine and hit her brakes almost right away.", "Unsworn · 3 days after"],
      ["Witness statement", "Statement of Jalen Brooks, taken by police", "p. 1", "Nov 14, 2024", "Jalen Brooks, independent witness", "The white SUV moved left in front of the Honda and its brake lights came on right after.", "Neutral · same day"],
      ["Deposition", "Delgado deposition", "42:7–19", "Apr 14, 2027", "Maria Delgado", "I moved over maybe a couple of seconds before, because my lane was ending.", "Sworn admission"],
      ["Expert report", "Kessler Forensic reconstruction report", "p. 14", "Jun 28, 2027", "Dr. Alan Kessler, defense expert", "The offset damage pattern is consistent with the lead vehicle completing a lane change shortly before impact.", "Expert opinion"]],
    ctx: [["Police report", "FR300P crash report, diagram", "p. 2", "Nov 14, 2024", "Officer D. Ruiz", "Diagram places both vehicles in lane 2 at impact.", "Officer arrived 9 min after; did not see crash"]],
    impact: "Under Virginia's contributory negligence rule, a jury finding that she changed lanes and braked can bar her recovery entirely.", val: "Lowers liability estimate",
    next: ["Confirm with VDOT lane plans that the right lane ends near Exit 57.", "Depose Jalen Brooks before mediation to lock in his account.", "Plaintiff contradicted her sworn interrogatory answer. Consider a request to supplement."] },
  { id: "C2", fact: "Insured's speed", t: "How fast was the insured going?", topic: "Liability", sev: "Critical", effect: "Hurts defense",
    sum: "The insured has given two different speeds, both lower than the vehicle's own event data recorder, which shows 58 mph in a 55 zone and braking only one second before impact.",
    pl: "Vehicle data", df: "Insured's account",
    p: [["Vehicle data", "Event data recorder download, 2019 Honda Accord", "Pre-crash table, p. 3", "Jan 12, 2027", "Bosch CDR report (data)", "Speed 5.0 s before impact: 58 mph. Brake applied: 1.0 s before impact. Speed at impact: 31 mph.", "Objective data"],
      ["Police report", "FR300P crash report", "p. 1", "Nov 14, 2024", "Officer D. Ruiz", "Posted speed limit: 55 mph.", "Official record"]],
    d: [["Recorded statement", "Whitfield recorded statement", "p. 4 · 00:09:51", "Nov 17, 2024", "Thomas Whitfield (insured)", "I was doing about 45. Traffic was slowing a little.", "Unsworn"],
      ["Deposition", "Whitfield deposition", "61:3–12", "May 3, 2027", "Thomas Whitfield (insured)", "Maybe 50. I wasn't looking at the speedometer.", "Sworn"]],
    ctx: [], impact: "Speed over the limit and late braking support the plaintiff's following-too-closely claim and weaken the sudden emergency defense. The insured's own statements are inconsistent with each other and with the data.", val: "Raises liability estimate",
    next: ["Ask Dr. Kessler to reconcile the speed data with the lane-change timing (58 mph covers about 170 feet in 2 seconds).", "Prepare the insured for trial testimony on speed; do not repeat the 45 mph figure.", "Disclose this risk to the carrier in the pre-mediation report."] },
  { id: "C3", fact: "Insured's phone use", t: "Was the insured using his phone?", topic: "Liability", sev: "Major", effect: "Hurts defense",
    sum: "The insured denied phone use in his recorded statement and sworn interrogatory answer. His carrier records show an outgoing text 38 seconds before the first 911 call. The exact crash time is not yet fixed.",
    pl: "Phone and call records", df: "Insured's account",
    p: [["Phone records", "Verizon subscriber records (subpoena)", "Row 1,142", "Feb 22, 2027", "Verizon Wireless custodian", "Outgoing SMS, 2:14:07 PM, Nov 14, 2024.", "Objective data"],
      ["911 record", "Fairfax County 911 call log", "Incident 24-1114-0377", "Nov 14, 2024", "Fairfax County DPSC", "First call received 2:14:45 PM from Jalen Brooks.", "Official record"],
      ["Deposition", "Delgado deposition", "51:2–9", "Apr 14, 2027", "Maria Delgado", "In my mirror he looked like he was looking down right before.", "Sworn · interested party"]],
    d: [["Recorded statement", "Whitfield recorded statement", "p. 8 · 00:21:04", "Nov 17, 2024", "Thomas Whitfield (insured)", "No, I wasn't on my phone at all.", "Unsworn"],
      ["Interrogatory answer", "Whitfield answers to interrogatories, No. 9", "p. 6", "Nov 5, 2026", "Thomas Whitfield (insured)", "Defendant was not using a cell phone at the time of the collision.", "Sworn"]],
    ctx: [], impact: "If the text was sent seconds before impact, distraction undercuts the contributory negligence defense and damages the insured's credibility on everything else.", val: "Raises liability estimate",
    next: ["Fix the crash time using the EDR clock and the 911 timestamp.", "Discuss the 2:14 PM text with the insured in a privileged meeting.", "Check whether the text was sent by voice or a hands-free system."] },
  { id: "C4", fact: "Pain at the scene", t: "How badly was the plaintiff hurt at the scene?", topic: "Injury", sev: "Major", effect: "Helps defense",
    sum: "The plaintiff swears she had severe back pain immediately. The EMS crew recorded neck pain only, 3 out of 10, and body-camera audio has her saying she was okay.",
    pl: "Severe back pain right away", df: "Scene records: minor neck pain only",
    p: [["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 8", "p. 7", "Nov 25, 2026", "Maria Delgado", "I had severe back pain right away and could barely walk.", "Sworn"],
      ["Deposition", "Delgado deposition", "23:4–11", "Apr 14, 2027", "Maria Delgado", "My back was killing me at the scene.", "Sworn"]],
    d: [["EMS record", "Fairfax County Fire & Rescue run sheet", "p. 2", "Nov 14, 2024", "Medic 421 crew", "Pt ambulatory at scene. C/o neck pain 3/10. Denies back pain. Refused transport.", "Contemporaneous · neutral"],
      ["Body camera", "Officer Ruiz body-worn camera", "02:31", "Nov 14, 2024", "Maria Delgado (on video)", "I'm okay, just shaken up.", "Contemporaneous recording"]],
    ctx: [], impact: "Weakens the claim that the lumbar injury began in the crash, since the first back complaint appears the next day.", val: "Lowers damages",
    next: ["Clip the body-camera segment for use at the treating physician's deposition.", "Confirm the EMS crew's identity in case live testimony is needed."] },
  { id: "C5", fact: "Prior back problems", t: "Did the plaintiff have back problems before the crash?", topic: "Medical history", sev: "Critical", effect: "Helps defense", self: true,
    sum: "Her sworn interrogatory answer denies any prior back problems. Medical, pharmacy, and prior-claim records show back treatment in 2021 and 2022 and a 2021 injury claim. She admitted the 2022 treatment at deposition.",
    pl: "No prior back problems", df: "Records: prior back injury and treatment",
    p: [["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 12", "p. 9", "Nov 25, 2026", "Maria Delgado", "I have never had back problems or treatment before this accident.", "Sworn"]],
    d: [["Medical record", "Inova Fairfax ER record", "p. 3", "Mar 8, 2021", "ER physician", "Acute low back pain after lifting at work. Dx: lumbar strain.", "Contemporaneous"],
      ["Medical record", "NoVA Pain Associates, Dr. Anil Rao", "p. 1", "Feb 15, 2022", "Dr. Anil Rao", "Chronic low back pain x 1 yr. Rx meloxicam 15 mg.", "Contemporaneous"],
      ["Prior claims", "ISO ClaimSearch report (via adjuster)", "Match 2 of 3", "Nov 6, 2026", "Verisk ISO", "GEICO bodily injury claim, Apr 2021, neck and back strain, closed $7,500.", "Industry database"],
      ["Deposition", "Delgado deposition", "77:3–15", "Apr 14, 2027", "Maria Delgado", "I forgot about Dr. Rao. I did see him for my back in 2022.", "Sworn admission"]],
    ctx: [], impact: "A false sworn answer on prior injuries damages her credibility across the case and supports the pre-existing condition defense.", val: "Lowers damages and credibility",
    next: ["Ask plaintiff's counsel to supplement interrogatory No. 12; move to compel if refused.", "Send the 2021–2022 records to Dr. Patel before his deposition.", "Prepare impeachment exhibit for trial."] },
  { id: "C6", fact: "Pain continuous after PT", t: "Was her pain continuous after the crash?", topic: "Medical history", sev: "Major", effect: "Helps defense",
    sum: "She swears her pain never improved. Her physical therapist discharged her at 1 out of 10 pain with goals met, and seven weeks later her new doctor recorded a flare-up after moving furniture.",
    pl: "Constant pain since crash", df: "Records: recovered, then a new event",
    p: [["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 15", "p. 11", "Nov 25, 2026", "Maria Delgado", "My pain has been constant since the accident and never got better.", "Sworn"]],
    d: [["Medical record", "Capital Physical Therapy discharge summary", "p. 88", "Feb 14, 2025", "Physical therapist", "Pain 1/10. All goals met. Discharged to home exercise program.", "Contemporaneous"],
      ["Medical record", "Fairfax Spine & Pain intake note", "p. 2", "Apr 2, 2025", "Intake nurse", "Reports pain flared after moving furniture last week.", "Contemporaneous"],
      ["Chronology", "Medical chronology (system)", "Gap flag", "Nov 12, 2026", "Workbench analysis", "No treatment Feb 14 – Apr 2, 2025 (47 days).", "Derived from records"]],
    ctx: [], impact: "Supports an intervening cause argument and questions whether the MRI, injections, and later bills relate to the crash. Those later bills are $41,050 of the $58,420 billed.", val: "Lowers damages",
    next: ["Ask Dr. Mehta to address the furniture incident in a supplemental IME opinion.", "Separate pre-gap and post-gap bills in the specials summary."] },
  { id: "C7", fact: "Ability to work and coach", t: "Can the plaintiff still work and stay active?", topic: "Damages", sev: "Major", effect: "Helps defense",
    sum: "She swears she can't do her job's lifting and gave up coaching. Her employer shows full duty since January 2025 with no restrictions, and her public social media shows her running drills at a youth soccer tournament.",
    pl: "Limited at work and home", df: "Records: full duty and active",
    p: [["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 18", "p. 13", "Nov 25, 2026", "Maria Delgado", "I can no longer do the lifting my job requires, and I've had to give up coaching.", "Sworn"],
      ["Deposition", "Delgado deposition", "156:4–20", "Apr 14, 2027", "Maria Delgado", "The pain keeps me from coaching my daughter's team the way I used to.", "Sworn"]],
    d: [["Employer records", "Hartwell Logistics personnel and attendance file", "pp. 12, 31", "Nov 18, 2026", "Hartwell HR custodian", "Returned to full duty Jan 6, 2025. No restrictions on file. 2025 attendance: 98%.", "Business record"],
      ["Social media", "Public Instagram post (captured with metadata)", "Post 3 of 7", "Jun 21, 2025", "Account @mdelgado_coach", "Photos of plaintiff running drills at the Fairfax Youth Cup.", "Public post · authentication needed"]],
    ctx: [], impact: "Limits the lost-wage claim to about 7 weeks and undercuts the loss-of-enjoyment claim.", val: "Lowers damages",
    next: ["Authenticate the social media capture through the vendor's affidavit.", "Use the employer file at the treating physician's deposition."] },
  { id: "C8", fact: "Cause of L4-5 finding", t: "Did the crash cause the L4-5 disc finding?", topic: "Causation", sev: "Critical", effect: "Disputed experts",
    sum: "The treating physician attributes the disc protrusion to the crash. The radiologist described degenerative changes, and the defense IME doctor says the findings are chronic. The treating physician's report does not mention the 2021–2022 treatment.",
    pl: "Plaintiff's expert: caused by the crash", df: "Defense evidence: degenerative, pre-existing",
    p: [["Expert report", "Dr. Ravi Patel narrative report (treating physician)", "p. 4", "May 20, 2027", "Dr. Ravi Patel, Fairfax Spine & Pain", "Within a reasonable degree of medical probability, the L4-5 protrusion was caused by the November 14, 2024 collision.", "Treating physician opinion"]],
    d: [["Imaging", "MRI report, Advanced Imaging of Reston", "p. 1", "Apr 10, 2025", "Radiologist", "Mild degenerative disc disease at L4-5 with small broad-based protrusion.", "Neutral · contemporaneous"],
      ["Expert report", "Independent medical exam, Dr. Sharon Mehta", "p. 9", "Jun 15, 2027", "Dr. Sharon Mehta, defense IME", "Findings are chronic and degenerative and pre-date the accident. At most a temporary lumbar strain resolved by February 2025.", "Expert opinion"]],
    ctx: [["Medical record", "Dr. Patel's records reviewed list", "p. 1", "May 20, 2027", "Dr. Ravi Patel", "Records reviewed: Inova Urgent Care 2024, Capital PT, MRI.", "Does not list 2021 ER or 2022 pain records"]],
    impact: "Causation decides most of the damages. If the jury accepts Dr. Mehta, the case is worth roughly the urgent care and PT bills.", val: "Swings damages",
    next: ["Depose Dr. Patel and ask whether he knew of the 2021–2022 treatment.", "Consider a motion limiting Dr. Patel's causation opinion if his foundation is incomplete."] },
  { id: "C9", fact: "Impact severity", t: "How hard was the impact?", topic: "Liability", sev: "Minor", effect: "Mixed",
    sum: "The complaint calls it a violent collision. Photos, the repair estimate, and the reconstruction point to a low-speed impact, though the plaintiff's photos show cracked tailgate glass.",
    pl: "Violent collision", df: "Defense evidence: low-speed impact",
    p: [["Complaint", "Complaint ¶6", "p. 3", "Sep 30, 2026", "Plaintiff, through counsel", "The violent collision pushed plaintiff's vehicle into the adjacent lane.", "Unsworn pleading"],
      ["Photos", "Plaintiff's vehicle photos (production)", "DELG-0412 to 0419", "Dec 20, 2026", "Plaintiff", "Cracked rear tailgate glass, bumper cover displaced.", "Physical evidence"]],
    d: [["Repair estimate", "Property damage estimate, plaintiff's SUV", "p. 1", "Nov 21, 2024", "Meridian appraiser", "Total repair $2,340. Rear bumper cover, tailgate glass. No frame damage.", "Business record"],
      ["Expert report", "Kessler Forensic reconstruction report", "p. 18", "Jun 28, 2027", "Dr. Alan Kessler, defense expert", "Change in velocity of the struck vehicle: 5 to 7 mph.", "Expert opinion"],
      ["Police report", "FR300P crash report", "p. 1", "Nov 14, 2024", "Officer D. Ruiz", "Damage: minor. Vehicles driven from scene.", "Official record"]],
    ctx: [], impact: "Low-speed impacts tend to lower juror estimates of injury, but the cracked glass gives the plaintiff a visual.", val: "Small effect",
    next: ["Use repair estimate and photos together so the cracked glass is in context."] },
  { id: "C10", fact: "Traffic ahead", t: "Was traffic ahead slowing?", topic: "Liability", sev: "Major", effect: "Hurts defense",
    sum: "The insured said traffic was moving and she braked for no reason. The independent witness and state traffic sensor data show congestion building at the exit five minutes before the crash.",
    pl: "Plaintiff, witness, and traffic data", df: "Insured's account",
    p: [["Witness statement", "Statement of Jalen Brooks, taken by police", "p. 1", "Nov 14, 2024", "Jalen Brooks, independent witness", "Traffic up ahead was starting to back up near the exit.", "Neutral · same day"],
      ["Traffic data", "VDOT traffic sensor data, I-66 E Exit 57", "Sensor 0566E", "Jan 30, 2027", "Virginia DOT", "Congestion from 2:09 PM; average speed 22 mph at 2:14 PM.", "Objective data"],
      ["Interrogatory answer", "Plaintiff's answers to interrogatories, No. 4", "p. 5", "Nov 25, 2026", "Maria Delgado", "Traffic ahead was stopping.", "Sworn · interested party"]],
    d: [["Recorded statement", "Whitfield recorded statement", "p. 6 · 00:15:10", "Nov 17, 2024", "Thomas Whitfield (insured)", "Traffic was moving fine. She braked for no reason.", "Unsworn"]],
    ctx: [], impact: "Slowing traffic makes her braking expected, which weakens the sudden emergency defense and supports a following-too-closely finding. Combined with C2, the insured should have anticipated stopping.", val: "Raises liability estimate",
    next: ["Reframe the defense around the lane change itself, not the braking.", "Prepare the insured for cross-examination on traffic conditions."] },
];
type Cell = [string, "p" | "d" | "x" | "m" | ""];
const MATRIX: [string, string, Cell[]][] = [
  ["Lane change before impact", "C1", [["Stayed in lane (rogs) · moved over (depo)", "x"], ["She cut into my lane", "d"], ["Moved left, then braked", "d"], ["Diagram: same lane", "p"], ["", ""], ["", ""], ["Offset impact fits lane change", "d"]]],
  ["Insured's speed", "C2", [["", ""], ["45 (statement) · 50 (depo)", "x"], ["", ""], ["Limit 55 mph", "m"], ["", ""], ["EDR: 58 mph, braked 1 s before", "p"], ["Kessler reviewing", "m"]]],
  ["Insured's phone use", "C3", [["He looked down (depo)", "p"], ["Not on phone", "d"], ["", ""], ["911 at 2:14:45 PM", "m"], ["", ""], ["Text sent 2:14:07 PM", "p"], ["", ""]]],
  ["Traffic ahead", "C10", [["Traffic stopping", "p"], ["Moving, no reason to brake", "d"], ["Backing up near exit", "p"], ["", ""], ["", ""], ["VDOT: congested from 2:09 PM", "p"], ["", ""]]],
  ["Pain at the scene", "C4", [["Severe back pain", "p"], ["", ""], ["", ""], ["Body cam: \"I'm okay\"", "d"], ["EMS: neck 3/10, denies back", "d"], ["", ""], ["", ""]]],
  ["Prior back problems", "C5", [["None (rogs) · admitted (depo)", "x"], ["", ""], ["", ""], ["", ""], ["ER 2021 · pain care 2022", "d"], ["ISO: 2021 GEICO claim", "d"], ["Mehta: chronic", "d"]]],
  ["Pain continuous after PT", "C6", [["Constant, never better", "p"], ["", ""], ["", ""], ["", ""], ["PT discharge 1/10 · furniture flare", "d"], ["47-day gap", "d"], ["", ""]]],
  ["Ability to work and coach", "C7", [["Can't lift, gave up coaching", "p"], ["", ""], ["", ""], ["", ""], ["", ""], ["Full duty · soccer drills post", "d"], ["", ""]]],
  ["Cause of L4-5 finding", "C8", [["", ""], ["", ""], ["", ""], ["", ""], ["MRI: degenerative", "d"], ["", ""], ["Patel: crash · Mehta: degenerative", "x"]]],
  ["Impact severity", "C9", [["Violent collision", "p"], ["Light bump", "d"], ["", ""], ["Minor damage, driven away", "d"], ["", ""], ["$2,340 repair · cracked glass", "m"], ["Delta-V 5–7 mph", "d"]]],
];
const MXCOLS: MatrixCol[] = ["plaintiff", "insured", "witness", "police", "medical", "records", "experts"];
const STANCE: Record<Cell[1], Stance | "none"> = { p: "plaintiff", d: "defense", x: "self", m: "neutral", "": "none" };

/** The reference case's evidence picture, in the same shape as a derived one. */
export function referenceEvidence(): CaseEvidence {
  const sources: Source[] = SOURCES.map(([title, type, date, weight, n], i) => ({ id: `rs${i + 1}`, title, type, date, col: COL[title] ?? "records", traits: [weight], statementCount: n }));
  const byTitle = (t: string) => sources.find((s) => s.title === t)!;
  const statements: Statement[] = [];
  let sn = 0;
  const say = (e: E, stance: Stance): Statement => {
    const title = SOURCE_OF.find(([re]) => re.test(e[1]))?.[1] ?? "Medical records (455 pp, 9 providers)";
    const src = byTitle(title);
    const s: Statement = { id: `r${++sn}`, sourceId: src.id, col: src.col, text: e[5], where: `${e[1]} · ${e[2]}`, stance, weight: e[6], date: e[3], who: e[4], type: e[0] };
    statements.push(s);
    return s;
  };
  const conflicts: Conflict[] = CONF.map((c) => ({
    id: c.id, topic: c.topic, severity: c.sev, effect: c.effect, title: c.t, fact: c.fact, summary: c.sum, value: c.val, selfContradiction: c.self,
    sides: [
      { version: "plaintiff", heading: c.pl, stance: "plaintiff", statements: c.p.map((e) => say(e, "plaintiff")) },
      { version: "defense", heading: c.df, stance: "defense", statements: c.d.map((e) => say(e, "defense")) },
    ],
    context: c.ctx.map((e) => ({ basis: "source" as const, text: `${e[1]} (${e[2]}, ${e[3]}, ${e[4]}): “${e[5]}” Weight: ${e[6]}.` })),
    why: [{ basis: "analysis" as const, text: c.impact }],
    steps: c.next.map((t, i) => ({ id: `s${i + 1}`, text: t })),
  }));
  return {
    sources, statements, conflicts, claims: [], gaps: [], exhibits: [], noDemand: false, noComplaint: false,
    matrix: MATRIX.map(([fact, id, cells]) => ({ fact, conflictId: id, cells: cells.map((c, i) => ({ col: MXCOLS[i], text: c[0], stance: STANCE[c[1]] })) })),
  };
}

// ── Demand and complaint analysis (CLM, META, SECS, demandView) ──
type Q = [doc: string, loc: string, text: string];
type Xh = [ex: string, doc: string, loc: string, shows: string, str: Level];
type Oo = [doc: string, loc: string, text: string, conflict: string];
interface RefClaim { id: string; cat: string; src: DClaim["src"]; t: string; amt: number; st: DClaim["status"]; q: Q[]; ev: Xh[]; ours: Oo[]; gaps: string[]; resp: string; law: string }
const CLM: RefClaim[] = [
  { id: "L1", cat: "Liability", src: "Both", t: "She was slowing in traffic when he rear-ended her", amt: 0, st: "Contradicted",
    q: [["Demand letter", "p. 1", "Ms. Delgado was slowing for traffic in the right lane when Mr. Whitfield's vehicle struck her from behind."], ["Complaint", "¶5", "Plaintiff's vehicle was slowing with traffic in the right lane when it was struck from behind."]],
    ev: [["Ex. A", "Police crash report", "pp. 1–4", "Rear-end collision; no citation issued; diagram shows both cars in the same lane", "Moderate"], ["Ex. B", "Photos of plaintiff's vehicle", "6 images", "Rear damage to her SUV", "Weak"]],
    ours: [["Whitfield recorded statement", "p. 6", "She came over from the right lane into mine and hit her brakes almost right away.", "C1"], ["Jalen Brooks witness statement", "p. 1", "The white SUV moved left in front of the Honda and its brake lights came on right after.", "C1"], ["Police crash report", "p. 1", "Officer arrived 9 minutes after the crash; diagram is based on driver statements.", ""]],
    gaps: ["The demand does not mention the independent witness", "No video or traffic data offered"], resp: "Deny. A lane change seconds before braking supports contributory negligence.", law: "Pure contributory negligence (Virginia)" },
  { id: "L2", cat: "Liability", src: "Complaint", t: "He followed too closely, violating Va. Code § 46.2-816", amt: 0, st: "Partially supported",
    q: [["Complaint", "¶¶20–24", "Defendant followed Plaintiff's vehicle more closely than was reasonable and prudent, in violation of Va. Code § 46.2-816."]],
    ev: [], ours: [["Whitfield recorded statement", "p. 4", "I was doing about 45. Traffic was slowing a little.", ""]],
    gaps: ["No speed, distance, or reconstruction evidence", "Insured's vehicle event data not yet downloaded"], resp: "A rear-end impact supports an inference of following too closely; a sudden lane change in front of him rebuts it. Download the event data before plaintiff asks for it.", law: "Va. Code § 46.2-816 · sudden emergency doctrine" },
  { id: "L3", cat: "Liability", src: "Both", t: "She did nothing to cause the crash", amt: 0, st: "Contradicted",
    q: [["Demand letter", "p. 2", "Ms. Delgado did absolutely nothing to cause or contribute to this collision."], ["Complaint", "¶9", "Plaintiff was at all times operating her vehicle in a lawful and careful manner."]],
    ev: [["Ex. J", "Plaintiff's personal impact statement", "p. 1", "Says she was driving home from work like any other day", "Weak"]],
    ours: [["Jalen Brooks witness statement", "p. 1", "The white SUV moved left in front of the Honda.", "C1"], ["Whitfield recorded statement", "p. 6", "She came over from the right lane into mine.", "C1"]],
    gaps: ["Her account is unsworn"], resp: "The central contested issue. Any fault on her part bars recovery in Virginia.", law: "Pure contributory negligence (Virginia)" },
  { id: "M1", cat: "Injury", src: "Both", t: "The crash caused a neck and back strain", amt: 0, st: "Partially supported",
    q: [["Demand letter", "p. 3", "She sustained cervical and lumbar sprain and strain injuries in the collision."], ["Complaint", "¶11", "Plaintiff suffered injuries to her neck and back."]],
    ev: [["Ex. D", "Inova Urgent Care records", "pp. 1–12", "Cervical and lumbar strain diagnosed Nov 15, 2024, the day after the crash", "Strong"]],
    ours: [["EMS run sheet", "p. 2", "C/o neck pain 3/10. Denies back pain. Refused transport.", "C4"]],
    gaps: ["The EMS bill is in the demand, but the run sheet is not"], resp: "Concede a neck strain. Dispute that the low back was injured at the scene.", law: "" },
  { id: "M2", cat: "Injury", src: "Both", t: "The crash caused an L4-5 disc herniation", amt: 0, st: "Partially supported",
    q: [["Demand letter", "p. 3", "An MRI confirmed a disc herniation at L4-5 caused by the collision."], ["Complaint", "¶11", "including a herniated disc at L4-5"]],
    ev: [["Ex. F", "MRI report, Advanced Imaging of Reston", "p. 1", "Small broad-based protrusion at L4-5", "Moderate"], ["Ex. H", "Dr. Ravi Patel letter", "1 p.", "States the L4-5 injury is related to the collision; gives no reasoning", "Weak"]],
    ours: [["MRI report, full text", "p. 1", "Mild degenerative disc disease at L4-5. The demand quotes only the protrusion finding.", "C8"], ["Inova Fairfax ER", "Mar 8, 2021", "Acute low back pain after lifting at work.", "C5"], ["Fairfax Spine & Pain intake", "Apr 2, 2025", "Pain flared after moving furniture last week.", "C6"]],
    gaps: ["No causation analysis", "MRI taken 5 months after the crash, after a 47-day gap in treatment"], resp: "Dispute causation. Plan an orthopedic IME once records are complete.", law: "Plaintiff must prove causation with expert testimony" },
  { id: "M3", cat: "Injury", src: "Complaint", t: "Her injuries are permanent", amt: 0, st: "Unsupported",
    q: [["Complaint", "¶11", "Plaintiff suffered serious and permanent injuries."]], ev: [],
    ours: [["Capital PT discharge summary", "p. 88", "Pain 1/10. All goals met. Discharged to home program.", "C6"]],
    gaps: ["No doctor has given a permanency opinion"], resp: "Deny. Ask in interrogatories which doctor will testify to permanency.", law: "" },
  { id: "M4", cat: "Medical history", src: "Demand", t: "She had no back problems before the crash", amt: 0, st: "Contradicted",
    q: [["Demand letter", "p. 3", "Before this collision, Ms. Delgado was healthy and active, with no history of back problems."]],
    ev: [["Ex. J", "Plaintiff's personal impact statement", "p. 2", "I never had back trouble before this.", "Weak"]],
    ours: [["Inova Fairfax ER", "Mar 8, 2021", "Acute low back pain after lifting at work. Dx: lumbar strain.", "C5"], ["ISO ClaimSearch report", "Match 2", "GEICO bodily injury claim, Apr 2021, neck and back strain.", "C5"], ["CVS prescription history", "p. 4", "Meloxicam prescribed by Dr. Anil Rao, pain specialist, 2022.", "C5"]],
    gaps: ["The demand includes no records from before Nov 2024"], resp: "Strong impeachment. Request records from 2019 forward and a supplemental answer.", law: "" },
  { id: "M5", cat: "Medical history", src: "Demand", t: "All treatment was reasonable and necessary", amt: 0, st: "Partially supported",
    q: [["Demand letter", "p. 4", "All treatment was reasonable, necessary, and causally related to the collision."]],
    ev: [["Ex. E", "Itemized bills, all providers", "18 pp.", "Charges for every provider", "Strong"], ["Ex. G", "Capital PT records", "31 pp.", "24 visits, Nov 2024 – Feb 2025", "Moderate"]],
    ours: [["Records tracker", "Fairfax Spine & Pain", "Bills only. Treatment records requested Nov 2; overdue.", ""]],
    gaps: ["$36,200 billed by Fairfax Spine & Pain with no treatment records (62% of medical bills)"], resp: "Reserve until the Fairfax Spine & Pain records arrive.", law: "" },
  { id: "E1", cat: "Economic damages", src: "Both", t: "Past medical expenses of $58,420", amt: 58420, st: "Supported",
    q: [["Demand letter", "p. 5", "Past medical specials: $58,420.00"], ["Complaint", "¶13", "Plaintiff has incurred and will incur medical expenses."]],
    ev: [["Ex. E", "Itemized bills, all providers", "18 pp.", "Billed charges total $58,420", "Strong"]],
    ours: [["Provider billing ledgers", "Inova, Capital PT, Advanced Imaging", "Amounts paid after insurer adjustments: $21,310 across all providers.", ""]],
    gaps: ["No payer information or lien notices"], resp: "Virginia lets the jury hear billed amounts, so the full figure is likely admissible if related. Contest causation for the $41,050 billed after the treatment gap.", law: "Collateral source rule (Acuar v. Letourneau)" },
  { id: "E2", cat: "Economic damages", src: "Demand", t: "Future medical care of $38,500", amt: 38500, st: "Unsupported",
    q: [["Demand letter", "p. 5", "Future medical expenses: $38,500.00 (see Dr. Patel letter)."]],
    ev: [["Ex. H", "Dr. Ravi Patel letter", "1 p.", "She may need more injections and possibly radiofrequency ablation", "Weak"]],
    ours: [["Fairfax Spine & Pain", "Sep 30, 2025", "Conservative care; no surgery recommended. No treatment since.", ""]],
    gaps: ["No life care plan or cost basis", "\"May need\" is not an opinion to a reasonable degree of medical probability"], resp: "Dispute in full until a qualified opinion with costs is disclosed.", law: "" },
  { id: "E3", cat: "Economic damages", src: "Demand", t: "Lost wages of $14,400 (9 weeks at $1,600)", amt: 14400, st: "Contradicted",
    q: [["Demand letter", "p. 5", "Lost wages: 9 weeks at $1,600 per week = $14,400.00"]],
    ev: [["Ex. I", "Hartwell Logistics HR letter", "1 p.", "Says she was out of work after the accident; gives no dates or pay rate", "Weak"]],
    ours: [["Hartwell payroll records", "p. 12", "Weekly base pay: $1,320.", "C7"], ["Hartwell attendance records", "p. 31", "Returned to full duty Jan 6, 2025 (about 7 weeks off).", "C7"]],
    gaps: ["No pay stubs, W-2s, or tax returns"], resp: "Concede verified wage loss of about $9,600. Dispute the remaining $4,800.", law: "" },
  { id: "N1", cat: "Non-economic damages", src: "Demand", t: "Pain, suffering, and inconvenience of $73,680", amt: 73680, st: "Partially supported",
    q: [["Demand letter", "p. 5", "General damages: $73,680.00"]],
    ev: [["Ex. J", "Plaintiff's personal impact statement", "4 pp.", "Describes daily pain, poor sleep, missed family events", "Weak"]],
    ours: [["Workbench calculation", "Demand p. 5", "The amount equals about 1.26 times the billed medical expenses.", ""]],
    gaps: ["No sleep treatment, diary, or statements from family"], resp: "Set by the jury. The prior back history and the treatment gap are the main ways to reduce it.", law: "" },
  { id: "N2", cat: "Non-economic damages", src: "Both", t: "She had to give up coaching her daughter's soccer team", amt: 0, st: "Unsupported",
    q: [["Demand letter", "p. 4", "She has been forced to give up coaching her daughter's soccer team."], ["Complaint", "¶12", "Plaintiff has lost the enjoyment of activities she previously enjoyed."]],
    ev: [["Ex. J", "Plaintiff's personal impact statement", "p. 3", "Says she stopped coaching", "Weak"]], ours: [],
    gaps: ["No corroboration", "Public social media review not yet done"], resp: "Verify before conceding. Order a public social media review.", law: "" },
  { id: "F1", cat: "Future damages", src: "Complaint", t: "She has lost future earning capacity", amt: 0, st: "Unsupported",
    q: [["Complaint", "¶13", "Plaintiff has suffered a diminished capacity to earn money in the future."]], ev: [],
    ours: [["Hartwell attendance records", "p. 31", "Full duty since Jan 6, 2025, with no restrictions.", "C7"]],
    gaps: ["No vocational or economic expert"], resp: "Deny. Challenge the claim if no expert supports it by the designation deadline.", law: "" },
];
const META: Record<string, [Level, Level, string, string]> = {
  L1: ["Moderate", "Strong", "An independent witness supports our lane-change account. The demand never mentions him.", ""],
  L2: ["Weak", "Moderate", "Speed is unknown. Download the insured's vehicle data before plaintiff asks for it.", "New in complaint"],
  L3: ["Weak", "Strong", "This decides liability under contributory negligence. Lock in the witness's testimony.", ""],
  M1: ["Strong", "Moderate", "The EMS record shows no back complaint at the scene, and the demand left it out.", ""],
  M2: ["Moderate", "Strong", "The demand quotes the MRI selectively. Degenerative findings and the 2021 back injury undercut causation.", ""],
  M3: ["None", "Moderate", "No doctor supports permanency. Ask who will testify to it.", "New in complaint"],
  M4: ["Weak", "Strong", "Three independent records show prior back problems. This is the strongest impeachment point.", "Dropped from complaint"],
  M5: ["Moderate", "None", "$36,200 of the bills have no treatment records behind them. Chase Fairfax Spine & Pain.", ""],
  E1: ["Strong", "Moderate", "Billed amounts are likely admissible. Fight causation for the $41,050 billed after the treatment gap.", ""],
  E2: ["Weak", "Moderate", "A one-page \"may need\" letter with no costs is not enough to prove future care.", ""],
  E3: ["Weak", "Strong", "Employer records show a lower pay rate and fewer weeks off. Overstated by $4,800.", ""],
  N1: ["Weak", "Moderate", "Subjective. Reduce it through the prior history and the treatment gap.", ""],
  N2: ["Weak", "None", "Unverified. Run a public social media review.", ""],
  F1: ["None", "Moderate", "No expert, and she has been back at full duty since January 2025.", "New in complaint"],
};
const AREA_OF = (cat: string): DClaim["area"] => /Liability/.test(cat) ? "liability" : /Injury|Medical/.test(cat) ? "injury" : "damages";

export function referenceDemand(): DemandModel {
  const claims: DClaim[] = CLM.map((c) => {
    const m = META[c.id];
    return {
      id: c.id, area: AREA_OF(c.cat), src: c.src, title: c.t, amount: c.amt || undefined, status: c.st, their: m[0], ours: m[1], look: m[2], tag: m[3] || undefined,
      quotes: c.q.map(([doc, loc, text]) => ({ doc, loc, text })),
      exhibits: c.ev.map(([ex, doc, loc, shows, str]) => ({ ex, doc, loc, shows, str })),
      ours_: c.ours.map(([doc, loc, text, conflict]) => ({ doc, loc, text, conflict: conflict || undefined })),
      gaps: c.gaps, response: c.resp, law: c.law || undefined,
    };
  });
  const tone = (s: string): "ok" | "warn" | "crit" | "" => /crit/.test(s) ? "crit" : /warn/.test(s) ? "warn" : /ok/.test(s) ? "ok" : "";
  const docId = (ex: string) => REFERENCE_DOCUMENTS.find((d) => d.name.startsWith(ex.replace("Ex. ", "Ex_") + "_"))?.id;
  return {
    basis: "reference", asOf: "Nov 12, 2026",
    claims,
    sections: [
      { area: "liability", title: "Liability", question: "Who caused the crash", their: "Weak", verdict: "Their liability case rests on a police diagram drawn from driver statements. Our witness and the insured both describe a lane change.",
        attention: [["Lane change before braking is supported by an independent witness the demand never mentions.", "L1"], ["Negligence per se is new in the complaint. The insured's speed is not yet known.", "L2"], ["Contributory negligence makes liability all-or-nothing. Depose the witness early.", "L3"]] },
      { area: "injury", title: "Injury & Medical", question: "Did the crash cause the injury", their: "Moderate", verdict: "A neck strain is well documented. The L4-5 causation claim is undercut by prior back treatment, degenerative MRI findings, and a 47-day gap.",
        attention: [["Prior back injury and treatment in 2021–2022 contradict the demand.", "M4"], ["The MRI shows degenerative changes the demand left out.", "M2"], ["62% of the medical bills ($36,200) have no treatment records.", "M5"]] },
      { area: "damages", title: "Damages", question: "What the injury cost her", their: "Moderate", verdict: "Billed medical is documented. Future care, the extra wages, earning capacity, and loss of enjoyment have little or no support.",
        attention: [["Our file verifies $68,020 of the $111,320 in economic damages claimed.", "E1"], ["Future care of $38,500 has no cost basis.", "E2"], ["Lost wages are overstated by $4,800.", "E3"]] },
    ],
    readFirst: [
      { text: "The demand's claim of no prior back problems is contradicted by three independent records.", ref: "M4", basis: "source" },
      { text: "An independent witness supports the lane change, which can bar recovery under Virginia law. The demand never mentions him.", ref: "L1", basis: "analysis" },
      { text: "The demand quotes the MRI selectively and omits degenerative findings.", ref: "M2", basis: "source" },
      { text: "62% of the medical bills ($36,200) have no treatment records behind them.", ref: "M5", basis: "source" },
      { text: "Two claims are new in the complaint with no support: permanency and lost earning capacity.", ref: "F1", basis: "analysis" },
    ],
    glance: [{ label: "Demand", value: "$185,000" }, { label: "Ad damnum", value: "$350,000" }, { label: "BI limit", value: "$100,000" }, { label: "Carrier offer", value: "$35,000" }],
    glanceSub: "Jun 2, 2026 · 30-day deadline expired Jul 2",
    changes: {
      head: ["Item", "Demand · Jun 2, 2026", "Complaint · Sep 30, 2026"], sub: "New claims arrived with no new evidence",
      rows: [
        { item: "Amount", demand: "$185,000, itemized", complaint: "$350,000, not itemized", changed: true },
        { item: "Liability theory", demand: "Negligence", complaint: "Adds negligence per se (§ 46.2-816)", ref: "L2", changed: true },
        { item: "Injury", demand: "Disc herniation", complaint: "Adds \"serious and permanent\"", ref: "M3", changed: true },
        { item: "Earning capacity", demand: "Not claimed", complaint: "Claimed, no support", ref: "F1", changed: true },
        { item: "Prior history", demand: "\"No back problems\"", complaint: "Dropped", ref: "M4", changed: true },
      ],
    },
    providers: { sub: "What the demand attached, and what our records add", rows: [
      ["Fairfax Co. Fire & Rescue (EMS)", "Nov 14, 2024", "1", "$1,150", "Bill only", "Run sheet: neck pain 3/10, denies back pain", "Omitted record", "crit"],
      ["Inova Urgent Care", "Nov 15, 2024", "1", "$1,980", "Records + bill", "Consistent with the demand", "Consistent", "ok"],
      ["Capital Physical Therapy", "Nov 22 – Feb 14", "24", "$13,440", "Partial records", "Discharge: pain 1/10, goals met", "Omitted discharge", "warn"],
      ["Advanced Imaging of Reston", "Apr 10, 2025", "1", "$4,850", "Records + bill", "Report notes degenerative disc disease", "Quoted selectively", "warn"],
      ["Fairfax Spine & Pain", "Apr 2 – Sep 30, 2025", "7", "$36,200", "Bill only", "Records requested; overdue", "No records", "crit"],
      ["Pharmacy", "Nov 2024 – Sep 2025", "—", "$800", "Receipts", "CVS profile shows 2022 back prescriptions", "Prior Rx found", "warn"],
    ].map(([provider, dates, visits, billed, inDemand, ours, flag, t]) => ({ provider, dates, visits, billed, inDemand, ours, flag, tone: tone(t) })) },
    history: { sub: "From our records requests and the ISO report", rows: [
      { source: "Inova Fairfax ER", date: "Mar 8, 2021", finding: "Low back pain after lifting; lumbar strain", effect: "Contradicts M4", ref: "M4" },
      { source: "GEICO injury claim (ISO)", date: "Apr 2021", finding: "Neck and back strain from a prior crash; settled $7,500", effect: "Contradicts M4", ref: "M4" },
      { source: "NoVA Pain Associates, Dr. Rao", date: "Feb 15, 2022", finding: "Chronic low back pain; meloxicam", effect: "Contradicts M4", ref: "M4" },
      { source: "No treatment", date: "Feb 14 – Apr 2, 2025", finding: "47-day gap, then a flare after moving furniture", effect: "Undercuts M2", ref: "M2" },
    ] },
    reconcile: { title: "How they reached $185,000", sub: "Demand p. 5, checked against our file", verifiedLabel: "Our file verifies $68,020",
      rows: [
        { label: "Past medical", demanded: 58420, verified: 58420, str: "Strong", note: "Bills attached; causation of $41,050 contested" },
        { label: "Future medical", demanded: 38500, verified: 0, str: "Weak", note: "One-page letter, no costs" },
        { label: "Lost wages", demanded: 14400, verified: 9600, str: "Weak", note: "Wrong rate and weeks" },
        { label: "Pain and suffering", demanded: 73680, verified: 0, str: "Weak", note: "Unsworn statement only" },
      ],
      note: "Outlined bar: amount demanded. Solid bar: amount our records support. The complaint's $350,000 is not itemized." },
    exhibits: { sub: "11 exhibits · 87 pages", rows: [
      ["Ex. A", "Police crash report", "4", "L1, L3", "Moderate", "Diagram drawn from driver statements"], ["Ex. B", "Photos of plaintiff's vehicle", "6", "L1", "Weak", "Selected angles; low repair cost not included"],
      ["Ex. C", "Medical summary chart", "3", "M1, M2, E1", "Weak", "Written by plaintiff's counsel"], ["Ex. D", "Inova Urgent Care records", "12", "M1", "Strong", "Contemporaneous; supports a strain"],
      ["Ex. E", "Itemized bills", "18", "M5, E1", "Strong", "Billed amounts only"], ["Ex. F", "MRI report", "2", "M2", "Moderate", "Degenerative findings left out of the letter"],
      ["Ex. G", "Capital PT records", "31", "M5", "Moderate", "Discharge summary missing"], ["Ex. H", "Dr. Patel letter", "1", "M2, E2", "Weak", "No reasoning or costs"],
      ["Ex. I", "Hartwell HR letter", "1", "E3", "Weak", "No dates or pay rate"], ["Ex. J", "Personal impact statement", "4", "L3, M4, N1, N2", "Weak", "Unsworn; contradicted on prior history"],
      ["Ex. K", "Pharmacy receipts", "5", "E1", "Moderate", "No prescription history"],
    ].map(([id, doc, pages, sup, str, look]) => ({ id, doc, pages, supports: sup.split(", "), strength: str as Level, look, docId: docId(id) })) },
    exhibitsAttention: [["5 of 11 exhibits are weak: letters, summaries, and her own unsworn statement."], ["Fairfax Spine & Pain records are overdue, and they cover most of the bills.", "M5"], ["The social media review hasn't started.", "N2"]],
    gaps: [
      ["Fairfax Spine & Pain records", "62% of medical bills", "Overdue", "crit", "M5"], ["Records before Nov 2024", "Prior back treatment", "Requested", "warn", "M4"],
      ["Social media review", "Coaching and activity claims", "Not started", "crit", "N2"], ["Health insurer payments, liens", "Needed to settle", "Requested", "warn", "E1"],
      ["Medicare status", "Settlement can't close without it", "Query sent", "warn", ""], ["Pay stubs, W-2s, tax returns", "Wage claim", "In discovery", "warn", "E3"],
      ["Causation opinion with reasoning", "L4-5 claim", "At expert disclosure", "warn", "M2"], ["Future care cost basis", "$38,500 claim", "Ask in interrogatories", "warn", "E2"],
      ["EMS run sheet", "Omitted record", "Received", "ok", "M1"], ["PT discharge summary", "Omitted record", "Received", "ok", "M3"],
      ["Witness information", "Not in demand", "We have it", "ok", "L1"], ["Repair estimate", "Impact severity", "In carrier file", "ok", ""],
    ].map(([item, neededFor, status, t, c]) => ({ item, neededFor, status, tone: tone(t), claims: c ? [c] : [] })),
    terms: [["Amount demanded", "$185,000"], ["Type", "Time-limited demand, above policy limits"], ["Deadline", "Jul 2, 2026 (expired)"], ["Conditions", "Full release; payment within 15 days; plaintiff pays liens from proceeds"], ["Carrier response", "$35,000 offer Jun 28; rejected Jul 1"]],
    termsAttention: [["If plaintiff sends a time-limited demand at or under $100,000, alert the partner and adjuster the same day."], ["The demand promises to pay liens but names no health insurer or Medicare status."]],
    flags: [
      { category: "Not a policy-limits demand", title: "Not a policy-limits demand", body: "At $185,000 it exceeded the $100,000 limit, so declining it carries little bad-faith risk.", tone: "ok" },
      { category: "Within-limits demand alert", title: "Within-limits demand alert is on", body: "Missing the deadline on a within-limits demand can expose the carrier to the full verdict.", tone: "crit" },
      { category: "Excess exposure", title: "Excess exposure", body: "The $350,000 ad damnum exceeds the limit. Excess letter sent to the insured Oct 16, 2026.", tone: "" },
    ],
  };
}
