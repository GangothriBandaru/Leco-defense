import type { CaseDocument } from "../types/case";
import type { CaseDetails } from "../intake/caseDetailsStore";
import type { DocRequest } from "../tracker/trackerData";
import { statusLabel } from "../tracker/trackerData";
import { getDocumentContent } from "../components/documentText";
import { fmtDay, daysUntil } from "../conflict/caseFacts";
import { type CaseEvidence, type ClaimArea, type ClaimStatus, fmtMoney } from "./caseEvidence";

// ── Demand and Complaint Analysis, as one model for all six tabs ──
// A case's model comes either from its reference file (the sample case the
// workbench was built around) or is derived from the case's own records.
// Every tab reads the same claims, so counts agree across Overview and the
// detail tabs.

export type Level = "None" | "Weak" | "Moderate" | "Strong";
export type Tone = "ok" | "warn" | "crit" | "";

export interface DClaim {
  id: string;
  area: ClaimArea;
  /** Where the claim is made: the demand, the complaint, both, or (when neither is on file) the plaintiff's records. */
  src: "Demand" | "Complaint" | "Both" | "Records";
  title: string;
  amount?: number;
  status: ClaimStatus;
  /** Strength of the plaintiff's support, and of our rebuttal. */
  their: Level;
  ours: Level;
  look: string;
  /** "New in complaint", "Dropped from complaint". */
  tag?: string;
  /** What they say, with where they say it. */
  quotes: { doc: string; loc: string; text: string }[];
  /** Evidence they attached. */
  exhibits: { ex: string; doc: string; loc: string; shows: string; str?: Level }[];
  /** What our records show; `conflict` links an evidence conflict. */
  ours_: { doc: string; loc: string; text: string; conflict?: string }[];
  gaps: string[];
  response?: string;
  law?: string;
}

export interface DSection {
  area: ClaimArea;
  title: string;
  question: string;
  their: Level;
  verdict: string;
  attention: [string, string?][];
}

export interface DemandModel {
  /** "Reference file" or "Derived from the case records". */
  basis: "reference" | "derived";
  asOf?: string;
  notice?: string;
  claims: DClaim[];
  sections: DSection[];
  readFirst: { text: string; ref?: string; basis: "source" | "analysis" }[];
  glance: { label: string; value?: string; note?: string }[];
  glanceSub?: string;
  changes: { head: [string, string, string]; rows: { item: string; demand: string; complaint: string; ref?: string; changed?: boolean }[]; sub: string };
  providers?: { sub: string; rows: { provider: string; dates: string; visits: string; billed: string; inDemand: string; ours: string; flag: string; tone: Tone }[] };
  history?: { sub: string; rows: { source: string; date: string; finding: string; effect: string; ref?: string }[]; empty?: string };
  reconcile?: { title: string; sub: string; verifiedLabel: string; rows: { label: string; demanded: number; verified?: number; str?: Level; note: string }[]; note: string };
  exhibits: { sub: string; rows: { id: string; doc: string; pages?: string; supports: string[]; strength?: Level; look: string; docId?: string }[] };
  exhibitsAttention: [string, string?][];
  gaps: { item: string; neededFor: string; status: string; tone: Tone; claims?: string[]; requestId?: string }[];
  terms: [string, string | undefined][];
  termsAttention: [string, string?][];
  flags: { category: string; title: string; body: string; tone: Tone }[];
}

export const POSITIONS = ["Accept", "Dispute", "Partially dispute", "Investigate", "Concede for negotiation"];
export const conflicted = (c: DClaim) => c.status === "Contradicted" || c.ours_.some((o) => o.conflict);
export const AREA_LABEL: Record<ClaimArea, string> = { liability: "Liability", injury: "Injury & Medical", damages: "Damages" };

const toLevel = (s: ClaimStatus): Level => s === "Supported" ? "Strong" : s === "Partially supported" ? "Moderate" : "Weak";
const reb = (n: number): Level => n >= 2 ? "Strong" : n === 1 ? "Moderate" : "None";

/** Builds the model from the case's own documents and Stage 2 details. */
export function deriveDemand(ev: CaseEvidence, facts: CaseDetails, requests: DocRequest[], documents: CaseDocument[]): DemandModel {
  const srcOf = (id: string) => ev.sources.find((s) => s.id === id);
  const claims: DClaim[] = ev.claims.map((c) => ({
    id: c.id, area: c.area, src: "Records", title: c.title, amount: c.amount, status: c.status,
    their: toLevel(c.status), ours: reb(c.rebuttal.length + c.conflicts.length), look: c.lookAt,
    quotes: c.support.map((s) => ({ doc: srcOf(s.sourceId)?.title ?? "Record", loc: s.where, text: s.text })),
    exhibits: ev.exhibits.filter((x) => x.claims.includes(c.id)).map((x) => ({ ex: x.id, doc: x.doc.name, loc: x.doc.date, shows: x.issue ?? (srcOf(x.doc.id)?.type ?? "Document") })),
    ours_: [
      ...c.rebuttal.map((s) => ({ doc: srcOf(s.sourceId)?.title ?? "Record", loc: s.where, text: s.text })),
      ...c.conflicts.map((id) => { const k = ev.conflicts.find((x) => x.id === id); return { doc: "Evidence conflict", loc: id, text: k?.title ?? id, conflict: id }; }),
    ],
    gaps: c.gaps,
    response: c.analysis?.map((n) => n.text).join(" "),
  }));

  const QUESTION: Record<ClaimArea, string> = { liability: "Who caused the incident", injury: "Did the incident cause the injury", damages: "What the injury cost" };
  const sections: DSection[] = (["liability", "injury", "damages"] as ClaimArea[]).map((area) => {
    const L = claims.filter((c) => c.area === area);
    const sup = L.filter((c) => c.status === "Supported").length;
    const their: Level = !L.length ? "None" : sup / L.length >= 2 / 3 ? "Strong" : sup / L.length >= 1 / 3 ? "Moderate" : "Weak";
    const cf = L.filter(conflicted).length, un = L.filter((c) => c.status === "Unsupported").length;
    return {
      area, title: AREA_LABEL[area], question: QUESTION[area], their,
      verdict: L.length ? `${sup} of ${L.length} claim${L.length === 1 ? " is" : "s are"} supported by the records on file; ${cf} conflict${cf === 1 ? "s" : ""} with them and ${un} ${un === 1 ? "is" : "are"} unsupported. Worked out from the claim statuses below.` : "No claims of this kind found in the case documents.",
      attention: L.filter((c) => c.status !== "Supported" || conflicted(c)).map((c): [string, string] => [c.look, c.id]),
    };
  });

  const readFirst: DemandModel["readFirst"] = [
    ...ev.conflicts.filter((c) => c.severity === "Critical").map((c) => ({ text: c.summary, ref: c.id, basis: "source" as const })),
    ...claims.filter((c) => c.status === "Unsupported" || (c.area === "damages" && conflicted(c))).map((c) => ({ text: `${c.title}: ${c.look}`, ref: c.id, basis: "analysis" as const })),
    ...ev.exhibits.filter((x) => x.issue?.startsWith("Named as bills")).map((x) => ({ text: `${x.doc.name}: ${x.issue}`, ref: x.id, basis: "source" as const })),
  ].slice(0, 5);

  const limit = facts.policyLimits ?? ev.policyLimit?.text;
  const num = (s?: string) => { const m = s && /[\d,]+(\.\d+)?/.exec(s); return m ? +m[0].replace(/,/g, "") : undefined; };
  const demand = num(facts.demandAmount), limitN = num(facts.policyLimits) ?? ev.policyLimit?.amount;

  const med = ev.sources.filter((s) => s.col === "medical" && s.doc);
  const billing = ev.claims.find((c) => c.title === "Past medical expenses");
  const line = (re: RegExp) => billing?.support.find((s) => re.test(s.text))?.text.split(": ")[1];
  const providers = med.length ? {
    sub: billing ? "Billed amounts from the billing summary in the treatment record" : "No bill or billing summary is on file for any provider",
    rows: med.map((s) => {
      const head = getDocumentContent(s.doc).blocks.find((b) => b.type === "heading");
      const billed = s.type === "MRI report" ? line(/^Imaging/) : s.type === "Physical therapy notes" ? line(/^Physical therapy/) : undefined;
      const billsFile = /bill|invoice/i.test(s.title);
      return {
        provider: head && head.type === "heading" ? head.text : s.title, dates: s.date ?? "—", visits: "Not stated", billed: billed ?? "—",
        inDemand: ev.noDemand ? "No demand on file" : "—", ours: s.type,
        flag: billsFile ? "Bills file holds clinical notes" : billed ? "Summary only" : "No bill on file", tone: (billsFile ? "crit" : "warn") as Tone,
      };
    }),
  } : undefined;

  const amounts = ev.claims.filter((c) => c.amount !== undefined);
  const reconcile = amounts.length ? {
    title: "How the claimed amounts compare with the records", sub: "Amounts stated in the plaintiff's records, checked against the same records",
    verifiedLabel: `Records give ${fmtMoney(amounts.reduce((s, c) => s + (c.reconciled ?? 0), 0))}`,
    rows: amounts.map((c) => ({ label: c.title, demanded: c.amount!, verified: c.reconciled, str: toLevel(c.status), note: c.lookAt })),
    note: "Outlined bar: amount claimed. Solid bar: amount the records' own figures support. An amount with no solid bar is unverified, not disproved.",
  } : undefined;

  const names = documents.map((d) => d.name).join(" ");
  const gaps = ev.gaps.map((g) => {
    const r = requests.find((x) => g.match.test(`${x.to} ${x.type} ${x.cat} ${x.docs.join(" ")}`));
    if (r) { const [l, t] = statusLabel(r); return { item: g.item, neededFor: g.why, status: l, tone: (t === "crit" ? "crit" : t === "ok" ? "ok" : "warn") as Tone, claims: g.claims, requestId: r.id }; }
    return { item: g.item, neededFor: g.why, status: g.match.test(names) ? "Received" : "Not requested", tone: (g.match.test(names) ? "ok" : "crit") as Tone, claims: g.claims };
  });

  const solDays = daysUntil(facts.solDate);
  const flags: DemandModel["flags"] = [
    demand && limitN
      ? (demand > limitN
        ? { category: "Not a policy-limits demand", title: "Not a policy-limits demand", body: `At ${fmtMoney(demand)} the demand exceeds the ${fmtMoney(limitN)} limit. Confirm the terms before relying on this.`, tone: "ok" as Tone }
        : { category: "Within-limits demand alert", title: "Within-limits demand", body: `At ${fmtMoney(demand)} the demand is within the ${fmtMoney(limitN)} limit. Missing a deadline on it can expose the carrier beyond the limit.`, tone: "crit" as Tone })
      : { category: "Policy-limits demand", title: "Can't tell whether it is a policy-limits demand", body: `${demand ? "" : "No demand amount is recorded. "}${limitN ? "" : "No policy limit is recorded. "}Add them in Stage 2 Case Details.`.trim(), tone: "warn" as Tone },
    { category: "Within-limits demand alert", title: "Within-limits demand alert", body: limitN ? `If a time-limited demand at or under ${fmtMoney(limitN)} arrives, alert the partner and adjuster the same day.` : "Set the policy limit in Stage 2 so a within-limits demand can be spotted.", tone: "warn" },
    { category: "Excess exposure", title: "Excess exposure", body: ev.noComplaint ? "No complaint is on file, so the amount claimed against the limit can't be compared yet." : "Compare the amount claimed with the limit.", tone: "" },
    ...(facts.solDate ? [{ category: "Deadline", title: `Statute of limitations ${fmtDay(facts.solDate)}`, body: facts.solVerified === "Verified" ? (solDays! < 0 ? `Passed ${-solDays!} days ago.` : `${solDays} days left.`) : "Unverified. No status is worked out from an unverified date.", tone: (facts.solVerified === "Verified" && solDays! < 0 ? "crit" : "warn") as Tone }] : []),
    ...(ev.coverage ? [{ category: "Coverage", title: "Coverage for a vehicle loss needs review", body: `The loss involves a commercial truck and the policy on file is general liability, with “${ev.coverage.policy.text}”. For coverage review.`, tone: "warn" as Tone }] : []),
  ];

  return {
    basis: "derived",
    notice: ev.noDemand || ev.noComplaint ? `${[ev.noDemand && "No demand letter", ev.noComplaint && "no complaint"].filter(Boolean).join(" and ")} is in the case documents. The claims below are taken from the plaintiff's own records and need reconciling against those documents when they arrive.` : undefined,
    claims, sections, readFirst,
    glance: [
      { label: "Demand", value: facts.demandAmount ? `$${facts.demandAmount.replace(/^\$/, "")}` : undefined, note: facts.demandAmount ? "Case Details" : "Not recorded" },
      { label: "Ad damnum", note: ev.noComplaint ? "No complaint on file" : "Not recorded" },
      { label: "BI limit", value: limit, note: facts.policyLimits ? "Case Details" : ev.policyLimit ? ev.policyLimit.source.title : "Not recorded" },
      { label: "Carrier offer", note: "Not recorded" },
    ],
    glanceSub: [facts.demandDate && `Demand ${fmtDay(facts.demandDate)}`, facts.demandStatus].filter(Boolean).join(" · ") || "No demand recorded",
    changes: {
      head: ["Item", ev.noDemand ? "Demand · not on file" : "Demand", ev.noComplaint ? "Complaint · not on file" : "Complaint"],
      sub: ev.noDemand && ev.noComplaint ? "Neither document is on file, so nothing can be compared yet" : "Only what the documents state",
      rows: ["Amount", "Liability theory", "Injury", "Earning capacity", "Prior history"].map((item) => ({
        item, demand: item === "Amount" && facts.demandAmount ? `$${facts.demandAmount.replace(/^\$/, "")} (Case Details)` : ev.noDemand ? "Not on file" : "Not stated",
        complaint: ev.noComplaint ? "Not on file" : "Not stated",
      })),
    },
    providers,
    history: { sub: "From records on file", rows: [], empty: "No prior medical records are on file, so omissions from the plaintiff's history can't be checked yet." },
    reconcile,
    exhibits: { sub: `${ev.exhibits.length} documents received from the plaintiff`, rows: ev.exhibits.map((x) => ({ id: x.id, doc: x.doc.name, supports: x.claims, look: x.issue ?? "—", docId: x.doc.id })) },
    exhibitsAttention: [
      ...ev.exhibits.filter((x) => x.issue?.startsWith("Named as bills")).map((x): [string, string?] => [`${x.doc.name} is named as bills but holds clinical notes.`, x.id]),
      ...gaps.filter((g) => g.status === "Not requested").slice(0, 3).map((g): [string, string?] => [`${g.item}: not requested yet.`, g.claims?.[0]]),
    ],
    gaps,
    terms: [
      ["Amount demanded", facts.demandAmount ? `$${facts.demandAmount.replace(/^\$/, "")}` : undefined],
      ["Type", ev.noDemand ? "No demand letter on file" : undefined],
      ["Deadline", undefined],
      ["Conditions", ev.noDemand ? "No demand letter on file" : undefined],
      ["Carrier response", undefined],
      ["Status", facts.demandStatus],
    ],
    termsAttention: [
      ...(ev.noDemand ? [["No demand letter is on file, so its deadline, release conditions and lien language are unknown."] as [string]] : []),
      ["No lien, health-insurer or Medicare information is on file."],
    ],
    flags,
  };
}
