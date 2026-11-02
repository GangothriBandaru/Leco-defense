import { type CaseCtx, type DocRequest, type MailMsg, type ReqStatus, addDays, iso, today, letterOf, subjectOf, ownerEmail } from "./trackerData";
import type { CaseState } from "./trackerStore";

// ── Sample Document Tracker records for the Estate of Miller demo case ────────
// Illustrative requests and correspondence, marked demo so the UI can label
// them. Dates are relative to today so the overdue and due-this-week views
// stay meaningful. Nothing here was sent or received.

const DEMO_CASES = new Set(["PI-2024-001"]);
const d = (n: number) => iso(addDays(today(), n));
const at = (n: number, h: number, m = 0) => { const x = addDays(today(), n); x.setHours(h, m, 0, 0); return x.toISOString(); };

type Seed = [
  cat: string, type: string, to: string, docs: string[], method: string, channel: string, status: ReqStatus,
  sent: number | null, due: number, pages: number, priority: DocRequest["priority"], owner: string,
  opts?: { files?: [string, number][]; reviewed?: boolean; notes?: string; cost?: number; contact?: string; approved?: boolean; next?: number },
];
const JD = "Jennifer Davis", MC = "Michael Chen";
const SEEDS: Seed[] = [
  // Medical records
  ["Medical records", "Physician and specialist", "Fairfax Spine & Pain", ["Complete medical chart", "Office and progress notes"], "Authorization", "Retrieval vendor portal", "Sent", -20, -6, 0, "High", JD,
    { notes: "Covers most of the billed treatment. Escalate if nothing arrives this week.", contact: "records@fairfaxspine.example", next: 1 }],
  ["Medical records", "Hospital and ER", "Cook County Medical Center", ["Emergency department records", "Triage notes"], "Authorization", "Retrieval vendor portal", "Received", -30, -16, 142, "High", JD,
    { files: [["ED_Records_CookCounty.pdf", 142]], reviewed: true, contact: "him@cookcountymc.example" }],
  ["Medical records", "Physical therapy", "Capital Physical Therapy", ["Treatment notes", "Discharge summary"], "Authorization", "Fax", "Partially received", -18, -4, 38, "Medium", MC,
    { files: [["PT_Notes_Part1.pdf", 38]], notes: "Treatment notes in; discharge summary still outstanding.", contact: "records@capitalpt.example" }],
  ["Medical records", "Physician and specialist", "Neurology Associates", ["Consultation notes", "Follow-up visit records"], "Authorization", "Retrieval vendor portal", "Acknowledged", -8, 6, 0, "Medium", MC,
    { contact: "medrecords@neuroassoc.example" }],
  // Medical bills & liens
  ["Medical bills & liens", "Provider billing", "Cook County Medical Center (Billing)", ["Itemized billing ledger"], "Authorization", "Email", "Received", -25, -11, 18, "Medium", JD,
    { files: [["Itemized_Bills_CCMC.pdf", 18]], reviewed: false, contact: "billing@cookcountymc.example" }],
  ["Medical bills & liens", "Provider billing", "Chicago Fire Department EMS (Billing)", ["EMS billing records"], "Authorization", "Certified mail", "Sent", -5, 9, 0, "Low", MC, {}],
  ["Medical bills & liens", "Health insurer", "Blue Cross Blue Shield of Illinois", ["Conditional payment summary", "Lien notice and amount"], "Request to adjuster", "Email", "In progress", -12, 2, 0, "High", JD,
    { notes: "Lien amount needed before any settlement discussion.", contact: "subrogation@bcbsil.example" }],
  // Pharmacy
  ["Pharmacy", "Pharmacy records", "Walgreens Pharmacy #4417", ["Prescription dispensing history"], "Authorization", "Fax", "Received", -15, -1, 9, "Low", MC,
    { files: [["Rx_History_Walgreens.pdf", 9]], reviewed: true }],
  ["Pharmacy", "Pharmacy records", "Walgreens Pharmacy #4417", ["Prescription receipts", "Medication history"], "Authorization", "Fax", "Draft", null, 14, 0, "Low", MC, {}],
  // Police & accident reports
  ["Police & accident reports", "Police", "Chicago Police Department (Records Division)", ["Final accident report"], "FOIA request", "Email", "Received", -28, -21, 6, "Medium", JD,
    { files: [["CPD_Final_Report.pdf", 6]], reviewed: true }],
  ["Police & accident reports", "Police", "Chicago Police Department (Records Division)", ["Police report addendum"], "FOIA request", "Email", "Sent", -10, -3, 0, "High", JD,
    { notes: "Addendum is referenced in the final report but hasn't been produced.", next: 0 }],
  ["Police & accident reports", "Traffic data", "Illinois State Police (Crash Reconstruction Unit)", ["Accident investigation records", "Scene measurements"], "FOIA request", "Certified mail", "Awaiting approval", null, 7, 0, "Medium", MC,
    { cost: 650 }],
  // Employment & wages
  ["Employment & wages", "Employer", "Northgate Financial Group (HR)", ["Employment verification"], "Authorization", "Email", "Received", -20, -13, 2, "Low", MC,
    { files: [["Employment_Verification.pdf", 2]], reviewed: true, contact: "hr@northgatefg.example" }],
  ["Employment & wages", "Employer", "Northgate Financial Group (Payroll)", ["Payroll records", "W-2s for 2024 and 2025"], "Authorization", "Email", "Acknowledged", -6, 1, 0, "Medium", MC,
    { contact: "payroll@northgatefg.example" }],
  ["Employment & wages", "Employer", "Northgate Financial Group (HR)", ["Wage loss documentation", "Modified-duty records"], "Authorization", "Email", "Sent", -3, 11, 0, "Medium", MC,
    { contact: "hr@northgatefg.example" }],
  // Insurance & prior claims
  ["Insurance & prior claims", "Prior insurance claim", "State Farm (plaintiff's auto insurer)", ["Prior claims history"], "Request to adjuster", "Email", "In progress", -9, -2, 0, "Medium", JD, {}],
  ["Insurance & prior claims", "Claims database", "Sentinel Casualty Insurance", ["Policy and declarations", "Coverage position letter"], "Request to adjuster", "Email", "Received", -35, -28, 54, "High", JD,
    { files: [["CGL-7741-22_Policy.pdf", 48], ["Coverage_Position_Letter.pdf", 6]], reviewed: false, contact: "claims@sentinelcasualty.example" }],
  // Plaintiff discovery
  ["Plaintiff discovery", "Interrogatories", "Thompson & Associates LLP (plaintiff's counsel)", ["Interrogatory answers"], "Discovery request", "Email", "Waiting on plaintiff", -22, -1, 0, "High", JD,
    { contact: "mthompson@thompsonlaw.example", notes: "Responses promised; send a meet-and-confer letter if not served by Friday." }],
  ["Plaintiff discovery", "Document production", "Thompson & Associates LLP (plaintiff's counsel)", ["Responses to requests for production"], "Discovery request", "Email", "Waiting on plaintiff", -10, 11, 0, "Medium", JD,
    { contact: "mthompson@thompsonlaw.example" }],
  ["Plaintiff discovery", "Authorizations", "Thompson & Associates LLP (plaintiff's counsel)", ["Signed HIPAA authorizations (4 providers)"], "Discovery request", "Email", "Partially received", -14, 4, 2, "High", JD,
    { files: [["Signed_HIPAA_Authorization_1.pdf", 2]], contact: "mthompson@thompsonlaw.example", notes: "One of four authorizations received." }],
  // Experts & investigations
  ["Experts & investigations", "IME", "Dr. Priya Raman, Neurology", ["Medical causation opinion"], "Vendor order", "Email", "In progress", -7, 3, 0, "High", JD,
    { cost: 2400, approved: true }],
  ["Experts & investigations", "IME", "Dr. Alan Brooks, Life Care Planning", ["Future care cost assessment"], "Vendor order", "Email", "Draft", null, 10, 0, "Low", MC,
    { cost: 1800 }],
  ["Experts & investigations", "Reconstruction", "Midwest Forensic Engineering", ["Accident reconstruction report"], "Vendor order", "Email", "In progress", -16, 5, 0, "Medium", MC,
    { cost: 450 }],
  // Court communications
  ["Court communications", "Court notices", "Circuit Court of Cook County (Clerk)", ["Scheduling order"], "FOIA request", "Email", "Received", -12, -5, 3, "Medium", JD,
    { files: [["Scheduling_Order.pdf", 3]], reviewed: true }],
  ["Court communications", "Court notices", "Circuit Court of Cook County (Clerk)", ["Notice of hearing"], "FOIA request", "Email", "Received", -4, 3, 1, "High", JD,
    { files: [["Notice_of_Hearing.pdf", 1]], reviewed: false }],
  ["Court communications", "Court records", "Thompson & Associates LLP (plaintiff's counsel)", ["Filed complaint", "Related pleadings"], "Discovery request", "Email", "Received", -40, -19, 24, "Medium", JD,
    { files: [["Complaint_and_Pleadings.pdf", 24]], reviewed: true }],
  // Other
  ["Other", "Other", "Thompson & Associates LLP (plaintiff's counsel)", ["Witness names and contact information"], "Discovery request", "Email", "Waiting on plaintiff", -9, 12, 0, "Low", MC,
    { contact: "mthompson@thompsonlaw.example" }],
  ["Other", "Other", "Thompson & Associates LLP (plaintiff's counsel)", ["Additional supporting documents"], "Discovery request", "Email", "Draft", null, 21, 0, "Low", MC, {}],
];

const COUNSEL = { n: "Maria Thompson, Thompson & Associates LLP", e: "mthompson@thompsonlaw.example" };

export function buildDemoTracker(ctx: CaseCtx): CaseState | undefined {
  if (!DEMO_CASES.has(ctx.caseId)) return undefined;
  const requests: DocRequest[] = SEEDS.map(([cat, type, to, docs, method, channel, status, sent, due, pages, priority, owner, o = {}], i) => {
    const created = sent ?? -1;
    const log = [{ at: at(created, 9), text: status === "Draft" ? "Saved as draft" : "Request created" }];
    if (o.cost && o.cost > 500) log.push({ at: at(created, 9, 30), text: o.approved ? "Carrier approval recorded" : "Carrier approval requested" });
    if (sent !== null) log.push({ at: at(sent, 10), text: `Sent by ${channel.toLowerCase()}` });
    if (["Acknowledged", "In progress", "Partially received", "Received"].includes(status) && sent !== null) log.push({ at: at(sent + 2, 14), text: "Recipient acknowledged the request" });
    if (status === "Partially received") log.push({ at: at(sent! + 5, 11), text: `Partial records received: ${pages} pages` });
    if (status === "Received") log.push({ at: at(Math.min(due, -1), 15), text: `Records received: ${pages} pages, ${o.files?.length ?? 0} file${(o.files?.length ?? 0) === 1 ? "" : "s"} attached` });
    if (o.reviewed) log.push({ at: at(Math.min(due, -1) + 1, 11), text: "Reviewed" });
    return {
      id: "R" + String(i + 1).padStart(2, "0"), cat, type, to, docs, range: "Feb 2026 – present", method, channel,
      sent: sent !== null ? d(sent) : undefined, due: d(due), status, pages, cost: o.cost ?? 0, owner, contact: o.contact ?? "",
      log, files: (o.files ?? []).map(([name, p]) => ({ name, pages: p })), reviewed: !!o.reviewed, auto: status !== "Draft",
      next: o.next !== undefined ? d(o.next) : undefined, createdAt: at(created, 9), priority, notes: o.notes, demo: true,
    };
  });
  const R = (n: number) => requests[n - 1];
  let mseq = 0;
  const mail: MailMsg[] = [];
  const msg = (m: Omit<MailMsg, "id" | "demo" | "replied" | "unread"> & { unread?: boolean; replied?: boolean }) =>
    mail.push({ unread: false, replied: false, ...m, id: "M" + String(++mseq).padStart(3, "0"), demo: true });
  const us = (r: DocRequest) => ({ n: r.owner, e: ownerEmail(r.owner) });
  const outRequest = (n: number) => { const r = R(n); if (!r.sent) return; msg({ rid: r.id, dir: "out", kind: "Request", fromN: us(r).n, fromE: us(r).e, toN: r.to, toE: r.contact, at: at(-Math.round((today().getTime() - new Date(r.sent).getTime()) / 864e5), 10), subject: subjectOf(r, ctx), body: letterOf(r, ctx), att: [] }); };
  const inMsg = (n: number | null, kind: string, fromN: string, fromE: string, day: number, hour: number, subject: string, body: string, att: [string, number][] = [], extra: { unread?: boolean; replied?: boolean } = {}) => {
    const r = n ? R(n) : null;
    msg({ rid: r?.id ?? null, dir: "in", kind, fromN, fromE, toN: r ? r.owner : "Jennifer Davis", toE: r ? ownerEmail(r.owner) : ownerEmail("Jennifer Davis"), at: at(day, hour), subject, body, att: att.map(([name, pages]) => ({ name, pages })), ...extra });
  };

  // The letters that went out.
  [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 26, 27].forEach(outRequest);
  // Drafts still on the desk.
  [9, 22, 28].forEach((n) => { const r = R(n); msg({ rid: r.id, dir: "draft", kind: "Draft", fromN: us(r).n, fromE: us(r).e, toN: r.to, toE: r.contact, at: at(-1, 16), subject: subjectOf(r, ctx), body: letterOf(r, ctx), att: [] }); });

  // Plaintiff's counsel
  inMsg(1, "Acknowledgment", COUNSEL.n, COUNSEL.e, -4, 11, "Re: Outstanding Medical Records — Evelyn Miller",
    "We acknowledge receipt of your request for the outstanding medical records. The available records from Cook County Medical Center have been collected. We are coordinating with Fairfax Spine & Pain to obtain the remaining treatment records and will provide an update once they are available.",
    [["Medical_Records_Index.pdf", 2]]);
  msg({ rid: R(20).id, dir: "out", kind: "Reminder", fromN: "Jennifer Davis", fromE: ownerEmail("Jennifer Davis"), toN: COUNSEL.n, toE: COUNSEL.e, at: at(-6, 9), subject: "Follow-up: Signed medical authorizations — Evelyn Miller",
    body: "Following up on our request for signed HIPAA authorizations for the four treating providers. We have one so far. Please return the remaining three so the records requests can proceed.", att: [] });
  inMsg(20, "Response", COUNSEL.n, COUNSEL.e, -5, 15, "Re: Follow-up: Signed medical authorizations — Evelyn Miller",
    "Attached is the signed authorization for Cook County Medical Center. Ms. Miller is reviewing the remaining three and we expect to return them next week.", [["Signed_HIPAA_Authorization_1.pdf", 2]]);
  inMsg(18, "Acknowledgment", COUNSEL.n, COUNSEL.e, -3, 13, "Re: Defendant's First Set of Interrogatories — Evelyn Miller",
    "We received Defendant's First Set of Interrogatories. Responses are being finalized with our client and will be served by the end of next week.");
  inMsg(null, "Response", COUNSEL.n, COUNSEL.e, -2, 10, "Supplemental medical records — Evelyn Miller",
    "Please find enclosed supplemental records from Neurology Associates covering the March and April 2026 visits, produced voluntarily ahead of formal production.",
    [["Supplemental_Records_Neurology.pdf", 14]], { unread: true });
  inMsg(15, "Reply", COUNSEL.n, COUNSEL.e, -1, 14, "Re: Wage loss and modified-duty documentation — Evelyn Miller",
    "Before we coordinate with Northgate Financial Group, can you confirm the wage loss period you need? Ms. Miller returned on modified duty in April; please confirm whether you want records through the present or only through her return date.",
    [], { unread: true });

  // Medical providers
  inMsg(4, "Acknowledgment", "Medical Records Dept., Neurology Associates", "medrecords@neuroassoc.example", -6, 10, "Re: Records request — Evelyn Miller (DOB 03/14/1981)",
    "Your request and the signed authorization were received. Records are typically released within 10 business days of receipt.");
  inMsg(1, "Notice", "Release of Information, Fairfax Spine & Pain", "records@fairfaxspine.example", -2, 9, "Status update: records request — Evelyn Miller",
    "Your request is in our queue. Records from two locations are being compiled; we expect to release them within 10 business days. Please contact us if you need a partial release sooner.",
    [], { unread: true });
  inMsg(5, "Response", "Patient Financial Services, Cook County Medical Center", "billing@cookcountymc.example", -11, 16, "Re: Itemized billing — Evelyn Miller",
    "Attached are the itemized billing statements for all dates of service on file.", [["Itemized_Bills_CCMC.pdf", 18]]);
  inMsg(3, "Reply", "Records Office, Capital Physical Therapy", "records@capitalpt.example", -3, 12, "Re: Treatment notes and discharge summary — Evelyn Miller",
    "We released the treatment notes. Our policy requires a separate patient-signed authorization for the discharge summary; please send one and we will release it promptly.",
    [], { unread: true });

  // Insurance company
  inMsg(17, "Response", "Claims Department, Sentinel Casualty Insurance", "claims@sentinelcasualty.example", -28, 11, "Re: Policy CGL-7741-22 — Logistics Co.",
    "Confirming policy CGL-7741-22 was in force on the date of loss. The policy and declarations are attached.", [["CGL-7741-22_Policy.pdf", 48]]);
  inMsg(17, "Response", "Coverage Counsel, Sentinel Casualty Insurance", "coverage@sentinelcasualty.example", -26, 15, "Coverage position — Estate of Miller vs Logistics Co.",
    "Attached is our coverage position letter for this claim. Please review it with your file.", [["Coverage_Position_Letter.pdf", 6]]);
  inMsg(7, "Reply", "Subrogation Unit, Blue Cross Blue Shield of Illinois", "subrogation@bcbsil.example", -4, 11, "Re: Conditional payment and lien information — Evelyn Miller",
    "We are preparing the conditional payment summary. To complete it, please confirm the member ID and the dates of service you are asking about.",
    [], { unread: true });

  // Employer
  inMsg(13, "Response", "Human Resources, Northgate Financial Group", "hr@northgatefg.example", -13, 14, "Re: Employment verification — Evelyn Miller",
    "Attached is the employment verification letter confirming position, hire date and salary.", [["Employment_Verification.pdf", 2]]);
  msg({ rid: R(14).id, dir: "out", kind: "Reminder", fromN: "Michael Chen", fromE: "", toN: "Northgate Financial Group (Payroll)", toE: "payroll@northgatefg.example", at: at(-2, 9),
    subject: "Follow-up: Pay stubs and W-2s — Evelyn Miller", body: "Following up on the payroll records and W-2s requested last week. Please let us know when we can expect them.", att: [] });
  inMsg(14, "Acknowledgment", "Payroll, Northgate Financial Group", "payroll@northgatefg.example", -1, 10, "Re: Follow-up: Pay stubs and W-2s — Evelyn Miller",
    "Received. The payroll records and W-2s will be sent by tomorrow.");

  // Court
  inMsg(24, "Court notice", "Clerk of the Circuit Court of Cook County", "efiling@cookcountycourt.example", -5, 9, "Scheduling order entered — Estate of Miller vs Logistics Co.",
    "A scheduling order has been entered. Fact discovery closes in six months; dispositive motions are due 60 days after.", [["Scheduling_Order.pdf", 3]]);
  inMsg(25, "Court notice", "Clerk of the Circuit Court of Cook County", "efiling@cookcountycourt.example", -1, 8, "Notice of hearing — Estate of Miller vs Logistics Co.",
    "A case management hearing has been set. Counsel of record must appear or file a status report beforehand.", [["Notice_of_Hearing.pdf", 1]], { unread: true });
  inMsg(null, "Court notice", "Clerk of the Circuit Court of Cook County", "efiling@cookcountycourt.example", -19, 13, "Filing accepted — Appearance and Jury Demand",
    "Your filing has been accepted and docketed.");

  // A reply still being written.
  msg({ rid: R(3).id, dir: "draft", kind: "Reply", fromN: "Michael Chen", fromE: "", toN: "Records Office, Capital Physical Therapy", toE: "records@capitalpt.example", at: at(-1, 17),
    subject: "Re: Treatment notes and discharge summary — Evelyn Miller", body: "Thank you. We have asked plaintiff's counsel for the separate authorization and will forward it once signed.", att: [] });

  return { requests, mail, seq: requests.length, mseq };
}
