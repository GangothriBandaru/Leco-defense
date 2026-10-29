// ── Document Tracker: request and mail model, and the workflow rules ────────
// Categories, request methods, response times and escalation steps follow the
// PI Defense Workbench reference. Everything case-specific (names, parties,
// dates, counts) comes from the open case and the requests made on it.

export type ReqStatus =
  | "Draft" | "Awaiting approval" | "Sent" | "Acknowledged" | "In progress"
  | "Waiting on plaintiff" | "Partially received" | "Escalated" | "Received" | "No records";

export interface ReqFile { name: string; pages: number; storageKey?: string; size?: number }
export interface LogEntry { at: string; text: string }

export interface DocRequest {
  id: string;
  cat: string;
  type: string;
  to: string;
  docs: string[];
  range: string;
  method: string;
  channel: string;
  /** ISO dates. */
  sent?: string;
  due?: string;
  status: ReqStatus;
  pages: number;
  cost: number;
  owner: string;
  contact: string;
  log: LogEntry[];
  files: ReqFile[];
  reviewed: boolean;
  auto: boolean;
  /** When the next follow-up is due — set by a reminder or a snooze. */
  next?: string;
  createdAt: string;
}

export type MailDir = "in" | "out" | "draft";
export interface MailMsg {
  id: string;
  /** The request the message belongs to; null for mail with no request. */
  rid: string | null;
  dir: MailDir;
  kind: string;
  fromN: string; fromE: string;
  toN: string; toE: string;
  at: string;
  subject: string;
  body: string;
  att: { name: string; pages: number }[];
  unread: boolean;
  replied: boolean;
}

/** The open case, as the tracker needs it. */
export interface CaseCtx {
  caseId: string;
  caseName: string;
  plaintiff?: string;
  insured?: string;
  insurer?: string;
  jurisdiction?: string;
  dateOfIncident?: string;
}

// [category, request types, documents that can be requested]
export const TAX: [string, string[], string[]][] = [
  ["Medical records", ["Hospital and ER", "Physician and specialist", "Physical therapy", "Imaging", "Chiropractic"], ["Complete medical chart", "Office and progress notes", "Imaging reports and films", "Itemized billing ledger", "Intake questionnaires", "Referrals and correspondence"]],
  ["Medical bills & liens", ["Health insurer", "Medicare and Medicaid", "Provider billing", "Lien holder"], ["Claims history with EOBs", "Payment ledger", "Lien notice and amount", "Itemized billing ledger"]],
  ["Pharmacy", ["Pharmacy records"], ["Prescription dispensing history", "Prescriber list", "Insurance billing for prescriptions"]],
  ["Police & accident reports", ["Police", "911 and dispatch", "EMS", "Traffic data"], ["Crash report", "Body-worn camera video", "911 audio and CAD log", "EMS run sheet", "Photographs"]],
  ["Employment & wages", ["Employer", "Tax records"], ["Payroll records", "Attendance and leave records", "Job description", "Personnel file", "Tax transcripts"]],
  ["Insurance & prior claims", ["Claims database", "Prior insurance claim", "Workers' compensation"], ["Complete claim file", "Recorded statements", "Medical records in claim file", "Settlement or award documents"]],
  ["Plaintiff discovery", ["Interrogatories", "Document production", "Authorizations"], ["Interrogatory answers", "Document production", "Signed authorizations", "Supplemental answers"]],
  ["Experts & investigations", ["IME", "Social media", "Surveillance", "Background search"], ["IME scheduling and report", "Records package for expert", "Public social media capture", "Collection affidavit"]],
  ["Court communications", ["Court records", "Clerk requests", "Court notices"], ["Docket and pleadings", "Certified copies", "Judgments and settlements"]],
  ["Other", ["Vehicle data", "Phone records", "School records", "Other"], ["Requested records", "Certification of records"]],
];
export const CATEGORIES = TAX.map((t) => t[0]);
export const taxOf = (cat: string) => TAX.find((t) => t[0] === cat) ?? TAX[TAX.length - 1];

/** Days a recipient has to respond, by request method. */
export const METHODS: Record<string, number> = {
  "Authorization": 14, "Subpoena": 14, "FOIA request": 7, "Discovery request": 21, "Request to adjuster": 7, "Vendor order": 10,
};
/** How long a response typically takes, by method — for the open-time bar. */
export const TYPICAL: Record<string, number> = {
  "Authorization": 12, "Subpoena": 10, "FOIA request": 7, "Discovery request": 21, "Request to adjuster": 5, "Vendor order": 7,
};
export const CHANNELS = ["Retrieval vendor portal", "Email", "Fax", "Certified mail", "Process server"];
export const ESC: Record<string, string> = {
  "Authorization": "Convert to subpoena", "Subpoena": "Draft motion to compel", "FOIA request": "Send FOIA deadline notice",
  "Discovery request": "Send meet-and-confer letter", "Request to adjuster": "Escalate to claims supervisor", "Vendor order": "Escalate to vendor account manager",
};
/** Costs above this need the carrier's approval before the request goes out. */
export const APPROVAL_THRESHOLD = 500;

/** The firm's people, as the dashboard knows them. */
export const OWNERS: { n: string; e: string }[] = [
  { n: "Jennifer Davis", e: "j.davis@lexguard.law" },
  { n: "Michael Chen", e: "" },
];
export const FIRM = "LexGuard Injury Intel";
export const ownerEmail = (n: string) => OWNERS.find((o) => o.n === n)?.e ?? "";

// ── Dates ──
const DAY = 86400000;
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const iso = (d: Date) => d.toISOString();
export const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
export const fmtShort = (s?: string) => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function dateRanges(ctx: CaseCtx): string[] {
  const y = today().getFullYear();
  const out = [`Jan ${y - 5} – present`];
  const inc = ctx.dateOfIncident ? new Date(ctx.dateOfIncident) : null;
  if (inc && !isNaN(+inc)) {
    out.push(`${inc.toLocaleDateString("en-US", { month: "short", year: "numeric" })} – present`);
    out.push(`${fmtDate(iso(inc))} only`);
  }
  return out;
}

// ── Status rules ──
export const DONE: ReqStatus[] = ["Received", "No records"];
export const isDone = (r: DocRequest) => DONE.includes(r.status);
export const daysTo = (r: DocRequest) => r.due ? Math.round((+new Date(r.due) - +today()) / DAY) : null;
export const isOver = (r: DocRequest) => !isDone(r) && r.due != null && new Date(r.due) < today();
export const isWaiting = (r: DocRequest) => r.status === "Waiting on plaintiff" || r.status === "Partially received";

export const STAGES = ["Drafted", "Sent", "Acknowledged", "Received", "Reviewed"];
export function stageIx(r: DocRequest) {
  if (r.status === "Draft" || r.status === "Awaiting approval") return 0;
  if (r.status === "Sent" || r.status === "Waiting on plaintiff") return 1;
  if (["Acknowledged", "In progress", "Escalated", "Partially received"].includes(r.status)) return 2;
  if (isDone(r)) return r.reviewed ? 4 : 3;
  return 1;
}

/** Pill classes from the dashboard's own status palette. */
export const TONE_PILL: Record<string, string> = {
  crit: "pill pill-risk", warn: "pill pill-progress", ok: "pill pill-complete", acc: "pill pill-neutral",
  "": "pill bg-[#F1F3F5] text-[#5B6B78] border-line",
};
export function statusLabel(r: DocRequest): [string, string] {
  if (isOver(r)) return ["Overdue", "crit"];
  if (r.status === "Received" && !r.reviewed) return ["To review", "acc"];
  if (r.status === "Received") return ["Received", "ok"];
  if (r.status === "No records") return ["No records", "ok"];
  if (r.status === "Partially received") return ["Partially returned", "warn"];
  if (r.status === "Waiting on plaintiff") return ["Waiting on plaintiff", "warn"];
  if (r.status === "Awaiting approval") return ["Needs approval", "warn"];
  if (r.status === "Draft") return ["Draft", ""];
  if (r.status === "Escalated") return ["Escalated", "crit"];
  return [r.status, "acc"];
}

export const BUCKETS = ["Overdue", "Act now", "Due this week", "Later", "Done"] as const;
export function bucket(r: DocRequest): (typeof BUCKETS)[number] {
  if (isOver(r)) return "Overdue";
  if (r.status === "Draft" || r.status === "Awaiting approval" || (r.status === "Received" && !r.reviewed)) return "Act now";
  if (isDone(r)) return "Done";
  const n = daysTo(r);
  return n !== null && n <= 7 ? "Due this week" : "Later";
}
export function urgency(r: DocRequest) {
  if (isOver(r)) return (daysTo(r) ?? 0) / 100;
  if (r.status === "Awaiting approval") return 1;
  if (r.status === "Draft") return 2;
  if (isDone(r)) return r.reviewed || r.status === "No records" ? 9 : 4;
  const n = daysTo(r);
  return 3 + (n === null ? 3 : Math.min(n, 30) / 10);
}

export type NeedKind = "remind" | "approve" | "send" | "review";
export function needsAction(r: DocRequest): NeedKind | null {
  if (isOver(r)) return "remind";
  if (r.status === "Awaiting approval") return "approve";
  if (r.status === "Draft") return "send";
  if (isWaiting(r)) return "remind";
  if (!isDone(r) && (daysTo(r) ?? 99) <= 3) return "remind";
  if (r.status === "Received" && !r.reviewed) return "review";
  return null;
}

export type ListFilter = "action" | "open" | "waiting" | "received" | "all" | "overdue" | "week" | "review";
export const FILTERS: { key: ListFilter; label: string; note: string }[] = [
  { key: "action", label: "Needs action", note: "Overdue, approvals, drafts, records to review" },
  { key: "open", label: "In progress", note: "With providers, agencies and the carrier" },
  { key: "waiting", label: "Waiting on plaintiff", note: "Discovery answers and signed forms" },
  { key: "received", label: "Received", note: "Records in hand" },
  { key: "all", label: "All requests", note: "Everything on this case" },
];
export const FOCUS_LABEL: Partial<Record<ListFilter, string>> = { overdue: "Overdue", week: "Due in the next 7 days", review: "Received, not reviewed" };
export function inFilter(r: DocRequest, f: ListFilter) {
  switch (f) {
    case "all": return true;
    case "action": return needsAction(r) !== null;
    case "overdue": return isOver(r);
    case "week": { const n = daysTo(r); return !isDone(r) && n !== null && n >= 0 && n <= 7; }
    case "review": return r.status === "Received" && !r.reviewed;
    case "open": return !isDone(r) && !isWaiting(r);
    case "waiting": return isWaiting(r);
    case "received": return isDone(r);
  }
}

export const reminderCount = (r: DocRequest) => r.log.filter((l) => /^Reminder sent|^Reminder scheduled/.test(l.text)).length;
export function nextReminder(r: DocRequest): string {
  if (r.next) return fmtDate(r.next);
  if (!r.due) return "after the request is sent";
  const due = new Date(r.due), t = today();
  if (due >= t) { const pre = addDays(due, -3); return fmtDate(iso(pre > t ? pre : due)); }
  const over = Math.ceil((+t - +due) / DAY);
  return fmtDate(iso(addDays(due, Math.ceil(over / 7) * 7 || 7)));
}

/** Who answers a request: plaintiff discovery goes through plaintiff's counsel. */
export const sentStatus = (method: string): ReqStatus => method === "Discovery request" ? "Waiting on plaintiff" : "Sent";

// ── Letters and messages ──
export const subjectOf = (r: DocRequest, ctx: CaseCtx) =>
  `${r.method === "Discovery request" ? "Discovery" : r.method === "FOIA request" ? "FOIA request" : r.method === "Subpoena" ? "Subpoena duces tecum" : "Records request"}: ${r.type} · ${ctx.caseName}`;

export function letterOf(r: DocRequest, ctx: CaseCtx): string {
  const intro: Record<string, string> = {
    "Authorization": "Enclosed is a signed authorization for the release of the records below.",
    "Subpoena": "Enclosed is a subpoena duces tecum for the records below.",
    "FOIA request": "Under the applicable public records law, we request copies of the following records.",
    "Discovery request": "Please find enclosed Defendant's discovery requests.",
    "Request to adjuster": "Could you please provide the following from the claim file?",
    "Vendor order": "Please confirm scheduling and cost for the following.",
  };
  const email = ownerEmail(r.owner);
  return `Hello,\n\n${intro[r.method] ?? "Please produce the records below."}\n\nRe: ${ctx.caseName}${ctx.caseId ? ` · ${ctx.caseId}` : ""}\nDate range: ${r.range}\n\nPlease produce:\n${r.docs.map((d) => "• " + d).join("\n")}\n\nPlease respond by ${r.due ? fmtDate(r.due) : "the date in the enclosed request"}.\n\nThank you,\n${r.owner}\n${FIRM}${email ? `\n${email}` : ""}`;
}

export type Tone = "Friendly" | "Firm" | "Final notice";
export function reminderText(r: DocRequest, tone: Tone, ctx: CaseCtx): string {
  const what = r.docs.join(", ").toLowerCase(), sent = r.sent ? ` of ${fmtDate(r.sent)}` : "", n = daysTo(r) ?? 0;
  const ref = `Ref: ${ctx.caseName}${ctx.caseId ? `, ${ctx.caseId}` : ""}.`, sig = `${r.owner}, ${FIRM}`;
  if (tone === "Firm") return `We have not yet received the ${what} requested in our ${r.method.toLowerCase()}${sent}${r.due ? `, which ${n < 0 ? "were" : "are"} due ${fmtDate(r.due)}` : ""}. Please produce them within 5 business days, or call us to discuss timing.\n\n${ref}\n\n${sig}`;
  if (tone === "Final notice") return `Final notice: the ${what} requested in our ${r.method.toLowerCase()}${sent} remain outstanding${n < 0 ? `, ${-n} days past the ${fmtDate(r.due)} deadline` : ""}. If we do not receive them by ${fmtDate(iso(addDays(today(), 5)))}, we will ${(ESC[r.method] ?? "escalate").toLowerCase()} without further notice.\n\n${ref}\n\n${sig}`;
  return `Hello, following up on our ${r.method.toLowerCase()}${sent} for ${what} (${r.range}). ${r.due ? (n < 0 ? `It was due ${fmtDate(r.due)}.` : `It is due ${fmtDate(r.due)}.`) : ""} Please send the records or let us know when to expect them.\n\n${ref}\n\nThank you,\n${sig}`;
}

export function escalationText(r: DocRequest): string {
  return `Hello,\n\nWe have not received a response to our ${r.method.toLowerCase()}${r.sent ? ` of ${fmtDate(r.sent)}` : ""}. Please be advised that we are preparing to ${(ESC[r.method] ?? "escalate").toLowerCase()}. If the records are produced within 5 business days, no further action will be needed.\n\nRegards,\n${r.owner}, ${FIRM}`;
}

export function approvalRequestText(r: DocRequest): string {
  return `Hello,\n\nWe'd like approval for ${r.to}: ${r.docs.join(", ").toLowerCase()}. Estimated cost: ${money(r.cost)}, which is above the ${money(APPROVAL_THRESHOLD)} pre-approval threshold.\n\nThanks,\n${r.owner}`;
}

/** Suggested reply text for an incoming message, by kind. */
export function smartReplies(kind: string): string[] {
  if (kind === "Approval") return ["Thank you. We'll send the request today.", "Thanks for approving. We'll report back once records arrive."];
  if (kind === "Acknowledgment") return ["Thanks for confirming. Please let us know if anything else is needed to complete this request.", "Thank you. Could you expedite? This is needed for an upcoming deadline."];
  if (kind === "Response") return ["Thank you, we received the records.", "Thank you. The production appears incomplete; could you also send the itemized billing ledger?"];
  return ["Thank you."];
}
