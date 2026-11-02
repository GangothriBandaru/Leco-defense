import { type CaseCtx, type DocRequest, type MailMsg, letterOf, subjectOf, ownerEmail } from "./trackerData";
import type { CaseState } from "./trackerStore";

// ── Sample Document Tracker records for the Estate of Miller demo case ────────
// Four requests that walk the plain workflow (draft, sent, received) and the
// mail that goes with them, all marked demo. Nothing here was sent or received.
// Bump DEMO_VERSION when the set changes so an older sample set is replaced.

const DEMO_CASES = new Set(["PI-2024-001"]);
export const DEMO_VERSION = 3;
/** Local time on a 2026 date; month is 1-based. */
const on = (m: number, d: number, h = 9, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();

const JD = "Jennifer Davis", MC = "Michael Chen";
const FAIRFAX = { n: "Release of Information, Fairfax Spine & Pain", e: "records@fairfaxspine.example" };
const CCMC = { n: "Patient Financial Services, Cook County Medical Center", e: "billing@cookcountymc.example" };
const ABC = { n: "Human Resources, ABC Logistics", e: "hr@abclogistics.example" };
const SENTINEL = { n: "Claims Department, Sentinel Casualty Insurance", e: "claims@sentinelcasualty.example" };

export function buildDemoTracker(ctx: CaseCtx): (CaseState & { demoVersion: number }) | undefined {
  if (!DEMO_CASES.has(ctx.caseId)) return undefined;
  const base = { pages: 0, cost: 0, files: [], reviewed: false, auto: true, demo: true, range: "Feb 14, 2026 – present" };
  const requests: DocRequest[] = [
    {
      ...base, id: "R01", title: "Complete Medical Records", cat: "Medical records", type: "Physician and specialist",
      to: "Fairfax Spine & Pain", docs: ["Complete medical chart", "Office and progress notes"],
      method: "Authorization", channel: "Retrieval vendor portal", status: "Sent", priority: "High", owner: JD, contact: FAIRFAX.e,
      createdAt: on(10, 12, 16), sent: on(10, 12, 16, 30), due: on(11, 5, 0),
      notes: "Request sent to the provider. Awaiting the requested medical records.",
      log: [
        { at: on(10, 12, 16), text: "Request created" },
        { at: on(10, 12, 16, 30), text: "Request sent by retrieval vendor portal" },
        { at: on(10, 15, 11, 20), text: "Confirmation of receipt received from Fairfax Spine & Pain" },
      ],
    },
    {
      ...base, id: "R02", title: "Medical Bills and Payment History", cat: "Medical bills & liens", type: "Provider billing",
      to: "Cook County Medical Center", docs: ["Itemized medical bills", "Payment ledger"],
      method: "Authorization", channel: "Email", status: "Draft", priority: "Normal", owner: JD, contact: CCMC.e, auto: false,
      createdAt: on(10, 30, 15),
      notes: "Add the patient account number the billing office asked for, then send.",
      log: [
        { at: on(10, 30, 15), text: "Saved as draft" },
        { at: on(10, 31, 9, 40), text: "Cook County Medical Center asked for additional information" },
      ],
    },
    {
      ...base, id: "R03", title: "Employment and Wage Records", cat: "Employment & wages", type: "Employer",
      to: "ABC Logistics HR Department", docs: ["Employment verification", "Wage statements"],
      method: "Authorization", channel: "Email", status: "Sent", priority: "Normal", owner: MC, contact: ABC.e,
      createdAt: on(10, 19, 14), sent: on(10, 20, 9, 30), due: on(11, 10, 0),
      notes: "HR confirmed they have the request. Wage statements are expected by the due date.",
      log: [
        { at: on(10, 19, 14), text: "Request created" },
        { at: on(10, 20, 9, 30), text: "Request sent by email" },
        { at: on(10, 22, 14, 5), text: "Confirmation of receipt received from ABC Logistics" },
      ],
    },
    {
      ...base, id: "R04", title: "Insurance Policy Documents", cat: "Insurance & prior claims", type: "Claims database",
      to: "Sentinel Casualty Insurance", docs: ["Insurance policy", "Declarations page"],
      method: "Request to adjuster", channel: "Email", status: "Received", priority: "Normal", owner: JD, contact: SENTINEL.e,
      createdAt: on(10, 6, 15), sent: on(10, 7, 10, 15), due: on(10, 31, 0), received: on(10, 28, 15, 10), pages: 52,
      files: [{ name: "Sentinel_CGL-7741-22_Policy.pdf", pages: 48, demo: true }, { name: "Sentinel_Declarations_Page.pdf", pages: 4, demo: true }],
      notes: "Policy and declarations page received. Review them against the coverage summary.",
      log: [
        { at: on(10, 6, 15), text: "Request created" },
        { at: on(10, 7, 10, 15), text: "Request sent by email" },
        { at: on(10, 26, 11), text: "Update received from Sentinel Casualty Insurance" },
        { at: on(10, 28, 15, 10), text: "Documents received: 2 files attached" },
      ],
    },
  ];

  const R = Object.fromEntries(requests.map((r) => [r.id, r]));
  let mseq = 0;
  const mail: MailMsg[] = [];
  const msg = (m: Omit<MailMsg, "id" | "demo" | "replied" | "unread"> & { unread?: boolean }) =>
    mail.push({ unread: false, replied: false, ...m, id: "M" + String(++mseq).padStart(3, "0"), demo: true });
  const us = (r: DocRequest) => ({ fromN: r.owner, fromE: ownerEmail(r.owner) });
  const out = (r: DocRequest, dir: "out" | "draft", at: string) =>
    msg({ rid: r.id, dir, kind: dir === "out" ? "Request" : "Draft", ...us(r), toN: r.to, toE: r.contact, at, subject: subjectOf(r, ctx), body: letterOf(r, ctx), att: [] });
  const inc = (r: DocRequest, from: { n: string; e: string }, kind: string, at: string, subject: string, body: string, att: [string, number][] = [], unread = false) =>
    msg({ rid: r.id, dir: "in", kind, fromN: from.n, fromE: from.e, toN: r.owner, toE: ownerEmail(r.owner), at, subject, body, att: att.map(([name, pages]) => ({ name, pages })), unread });

  // Sent
  out(R.R04, "out", on(10, 7, 10, 15));
  out(R.R01, "out", on(10, 12, 16, 30));
  out(R.R03, "out", on(10, 20, 9, 30));
  // Drafts
  out(R.R02, "draft", on(10, 30, 15));

  // Fairfax Spine & Pain
  inc(R.R01, FAIRFAX, "Acknowledgment", on(10, 15, 11, 20), "Medical records request acknowledgment — Evelyn Miller",
    "We received your request and the signed authorization for Evelyn Miller's complete medical chart and office and progress notes.\n\nRecords are compiled from two clinic locations and are usually released within 10 business days. We'll upload them to the retrieval portal when they're ready.",
    [], true);
  // ABC Logistics
  inc(R.R03, ABC, "Acknowledgment", on(10, 22, 14, 5), "Employment records request received — Evelyn Miller",
    "Thank you for your request for Evelyn Miller's employment verification and wage statements. It has been logged with our payroll team, and we expect to send the records before your November 10 due date.");
  // Cook County Medical Center
  inc(R.R02, CCMC, "Notice", on(10, 31, 9, 40), "Additional information required — Evelyn Miller billing records",
    "Thank you for your call about Ms. Miller's billing records. Before we can release the itemized bills and payment history, please include the patient account number (or her date of birth and dates of service) with your written request.\n\nOnce we have it, requests are usually processed within 7 business days.",
    [], true);
  // Sentinel Casualty Insurance
  inc(R.R04, SENTINEL, "Update", on(10, 26, 11), "Insurance policy documents — Policy CGL-7741-22",
    "Following up on your request for the policy documents for Logistics Co. The certified policy and the declarations page are being prepared, and we'll send them this week.");
  inc(R.R04, SENTINEL, "Response", on(10, 28, 15, 10), "Insurance policy documents received — Policy CGL-7741-22",
    "Attached are the certified policy for CGL-7741-22 and the declarations page, as requested. Please contact us if you need anything else from the claim file.",
    [["Sentinel_CGL-7741-22_Policy.pdf", 48], ["Sentinel_Declarations_Page.pdf", 4]], true);

  return { requests, mail, seq: requests.length, mseq, demoVersion: DEMO_VERSION };
}
