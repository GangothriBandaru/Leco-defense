import type { CaseDefendants, Candidate, ElementStatus, NegligenceElement, DefendantChoice } from "../defendants/defendantData";
import { choiceFor } from "../defendants/defendantData";
import type { CaseDecisions } from "../defendants/defendantDecisionStore";
import type { CaseJurisdiction } from "../jurisdiction/jurisdictionData";
import { faultResult } from "../jurisdiction/jurisdictionData";
import type { AnalysisFinding } from "../types/case";
import {
  PLAYBOOK_FACTORS,
  type CaseLiability, type PlaintiffCheck, type PlaybookItem, type Recommendation, type Priority, type Scenario,
} from "./liabilityData";
import type { JurisdictionRules } from "./liabilityRules";
import type { LiabilityInputs } from "./liabilityStore";

// ── Liability model ──────────────────────────────────────────────────────────
// Builds the Liability Analysis from what the case holds: the Defendant
// Analysis (parties and elements), the jurisdiction review, the liability
// record, the case documents, the timeline and the attorney's inputs. Pure
// functions — the workspace renders what comes back and computes nothing.
//
// What it does not do: produce a fault percentage. No validated allocation
// model exists here, so every share comes from an attorney entry, labelled as
// such, and the model's own estimate is reported as not calculated.

export const ELEMENTS: { key: NegligenceElement; label: string; letter: string }[] = [
  { key: "duty", label: "Duty", letter: "D" },
  { key: "breach", label: "Breach", letter: "B" },
  { key: "causation", label: "Causation", letter: "C" },
  { key: "damages", label: "Damages", letter: "M" },
];

export interface EvidenceRef {
  file: string;
  /** In the case documents — not just cited by an analysis. */
  onFile: boolean;
  sourceId: string;
  sourceName: string;
}

export interface DefendantFinding {
  id: string;
  code: string;
  kind: NegligenceElement;
  /** The party it is recorded against; for a shared finding, the lead party. */
  candidate: Candidate;
  /** Applies to every defendant in the analysis at once. */
  shared?: boolean;
  category: string;
  title: string;
  description?: string;
  /** Card-length title and summary; `title` and `description` stay the full text. */
  shortTitle?: string;
  summary?: string;
  status: ElementStatus;
  /** Status under the scenario being tested, when it differs. */
  scenarioStatus?: ElementStatus;
  note?: string;
  missing?: string;
  authorityId?: string;
  evidence: EvidenceRef[];
}

export interface PlaybookRow extends PlaybookItem {
  /** From the item's own analysis, or read from the record for this factor. */
  origin: "item" | "record";
}

export interface PlaintiffFinding extends PlaintiffCheck {
  evidence: EvidenceRef[];
  rows: PlaybookRow[];
}

export interface StrategyRow {
  title: string;
  explanation: string;
  evidence: string;
  status: string;
  tone: "good" | "pending" | "neutral" | "na";
  followUp?: string;
}

export interface LedgerRow {
  id: string;
  name: string;
  files: EvidenceRef[];
  heldBy: string;
  preSuit: string;
  status: "On file" | "Partly on file" | "Cited, not on file" | "Requested" | "Not requested" | "On file · not linked";
  proves: string;
  note: string;
  sourceId?: string;
}

export interface RecommendationView extends Recommendation {
  state: "received" | "requested" | "open";
  receivedFile?: string;
  requestedAt?: string;
  computed?: boolean;
}

export interface TimelineItem {
  id: string;
  iso: string;
  date: string;
  title: string;
  detail?: string;
  party: string;
  phase: "before" | "incident" | "treatment" | "evidence";
  kind?: "impact" | "window";
  findings: DefendantFinding[];
  evidence: EvidenceRef[];
  conflict?: string;
  origin: "extracted" | "manual" | "record";
}

export interface Flag {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  detail: string;
  sources: string[];
  /** Where it is resolved. */
  owner: "jurisdiction" | "defendants" | "liability";
}

export interface ReadinessItem {
  id: string;
  group: "facts" | "legal";
  title: string;
  detail: string;
  done: boolean;
  blocking: boolean;
  /** Shown under Needs Your Decision while open. */
  decision: boolean;
  /** Shown under Needs Your Decision even when complete — with its state. */
  alwaysListed?: "optional" | "none";
  count?: number;
  link: { label: string; target: string };
}

export interface LiabilityEvent {
  id: string;
  iso: string;
  date: string;
  title: string;
  summary?: string;
  description?: string;
  evidence: string[];
  origin: "extracted" | "manual";
}

export interface ModelInput {
  caseType?: string;
  documents: { name: string }[];
  defendants: CaseDefendants;
  decisions?: CaseDecisions;
  jurisdiction?: CaseJurisdiction;
  rules?: JurisdictionRules;
  liability: CaseLiability;
  inputs: LiabilityInputs;
  governingLawApproved?: string;
  events: LiabilityEvent[];
  docSignals: AnalysisFinding[];
}

const prioRank: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2 };

const fmtIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
/** "Oct 21, 2026" or "Oct 21, 2026, 7:05 PM" → yyyy-mm-dd, for ordering stamped events. */
const isoOfStamp = (s: string) => {
  const d = new Date(s.replace(/, (\d+:\d+ [AP]M)$/, " $1"));
  return Number.isNaN(d.getTime()) ? "9999-12-31" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function buildLiabilityModel(m: ModelInput) {
  const docNames = new Map(m.documents.map((d) => [d.name.toLowerCase(), d.name]));
  const onFile = (f: string) => docNames.has(f.toLowerCase());
  const source = (id: string) => m.defendants.sources.find((s) => s.id === id);
  const refsFor = (sourceIds: string[]): EvidenceRef[] =>
    sourceIds.flatMap((id) => {
      const s = source(id);
      return s ? s.files.map((file) => ({ file, onFile: onFile(file), sourceId: s.id, sourceName: s.name })) : [];
    });

  // ── Scenario: the attorney's assumptions, applied beside the baseline ──
  const chosen = m.liability.scenarios.filter((s) => m.inputs.scenario.includes(s.id));
  const scenarioChange = new Map<string, ElementStatus>();
  chosen.forEach((s) => s.changes.forEach((c) => scenarioChange.set(c.ref, c.to)));

  // ── Parties: the attorney's decision where confirmed, else the system's ──
  const choiceOf = (c: Candidate): DefendantChoice => m.decisions?.rows[c.id]?.choice ?? choiceFor(c.recommendation);
  const inAnalysisIds = new Set(m.defendants.candidates.filter((c) => choiceOf(c) !== "do-not-pursue").map((c) => c.id));
  const lead = m.defendants.candidates.find((c) => c.recommendation === "name" && c.identified === "Named") ?? m.defendants.candidates[0];

  // ── Defendant findings: the Defendant Analysis elements, plus findings that
  // apply to every defendant at once, by negligence element ──
  type Raw = Omit<DefendantFinding, "code">;
  const raw: Raw[] = [
    ...m.defendants.candidates.flatMap((c) => c.elements.map((e, i) => ({ c, e, i })))
      .filter(({ e }) => !!e.kind)
      .map(({ c, e, i }): Raw => {
        const id = `${c.id}:${i}`;
        const sc = scenarioChange.get(id);
        return {
          id, kind: e.kind!, candidate: c,
          category: e.category ?? ELEMENTS.find((x) => x.key === e.kind)!.label,
          title: e.finding ?? e.name, description: e.description, shortTitle: e.shortTitle, summary: e.summary,
          status: e.status, scenarioStatus: sc && sc !== e.status ? sc : undefined,
          note: e.cite?.note, missing: e.missing, authorityId: e.authorityId,
          evidence: e.cite ? refsFor([e.cite.sourceId]) : [],
        };
      }),
    ...m.liability.sharedFindings.map((s): Raw => ({
      id: s.id, kind: s.kind, candidate: lead, shared: true, category: s.category, title: s.finding, description: s.description, summary: s.summary,
      status: s.status, missing: s.missing, authorityId: s.authorityId, evidence: refsFor(s.sourceIds),
    })),
  ];
  const counters: Record<string, number> = {};
  const defendantFindings: DefendantFinding[] = raw
    .sort((a, b) => ELEMENTS.findIndex((x) => x.key === a.kind) - ELEMENTS.findIndex((x) => x.key === b.kind))
    .map((f) => {
      counters[f.kind] = (counters[f.kind] ?? 0) + 1;
      return { ...f, code: `${ELEMENTS.find((x) => x.key === f.kind)!.letter}${counters[f.kind]}` };
    });
  const findingById = new Map(defendantFindings.map((f) => [f.id, f]));
  /** A finding counts for a party when recorded against it, or shared by all. */
  const forParty = (f: DefendantFinding, id: string) => f.shared ? inAnalysisIds.has(id) : f.candidate.id === id;

  const parties = m.defendants.candidates.map((c) => {
    const own = defendantFindings.filter((f) => !f.shared && f.candidate.id === c.id);
    return {
      candidate: c,
      choice: choiceOf(c),
      confirmed: !!m.decisions?.confirmedAt,
      shown: own.filter((f) => f.status === "Shown").length,
      indicated: own.filter((f) => f.status === "Indicated").length,
      open: own.filter((f) => f.status === "Not yet known").length,
      total: own.length,
      override: m.inputs.defendantOverrides[c.id],
    };
  });
  /** Parties the analysis carries into allocation: everyone not set aside. */
  const inAnalysis = parties.filter((p) => p.choice !== "do-not-pursue");
  /** Parties answerable through another — grouped for a vicarious share. */
  const groups = m.defendants.candidates.filter((c) => c.parentId && inAnalysisIds.has(c.id) && inAnalysisIds.has(c.parentId))
    .map((c) => ({ head: c, through: m.defendants.candidates.find((x) => x.id === c.parentId)! }));

  // ── Completeness: shown elements per negligence element, an explicit count ──
  const completeness = ELEMENTS.map((el) => {
    const list = defendantFindings.filter((f) => f.kind === el.key && (f.shared || inAnalysisIds.has(f.candidate.id)) && f.status !== "Not indicated");
    const shown = list.filter((f) => f.status === "Shown").length;
    return { ...el, shown, total: list.length, pct: list.length ? Math.round((shown / list.length) * 100) : null };
  });

  // ── Recommendations — received when a matching file is in the case documents ──
  const citedOffFile = Array.from(new Map(
    defendantFindings.filter((f) => f.status === "Shown").flatMap((f) => f.evidence).filter((e) => !e.onFile).map((e) => [e.file, e]),
  ).values());
  const computedRecs: Recommendation[] = citedOffFile.length
    ? [{
        id: "r-cited-files",
        priority: "Urgent",
        title: `Bring the ${citedOffFile.length} cited facility and emergency records into the case file`,
        shortTitle: `Obtain ${citedOffFile.length} cited facility and dispatch records`,
        short: "Shown findings rely on records not yet in the case file.",
        why: `Findings marked Shown rest on ${citedOffFile.map((e) => e.file).join(", ")} — cited by the Defendant Analysis but not in this case's documents.`,
        answers: defendantFindings.filter((f) => f.status === "Shown" && f.evidence.some((e) => !e.onFile)).map((f) => f.id),
        custodian: "The facility; emergency dispatch",
        method: "Records request and preservation letter",
        preSuit: "Yes",
        draft: { kind: "preservation", label: "Draft request" },
      }]
    : [];
  const recommendations: RecommendationView[] = [...computedRecs, ...m.liability.recommendations]
    .map((r) => {
      const received = r.receivedMatch ? m.documents.find((d) => r.receivedMatch!.test(d.name))?.name : undefined;
      const req = m.inputs.requested[r.id];
      return {
        ...r,
        computed: r.id === "r-cited-files",
        state: (received ? "received" : req ? "requested" : "open") as RecommendationView["state"],
        receivedFile: received,
        requestedAt: req?.at,
      };
    })
    .sort((a, b) => (a.state === "received" ? 1 : 0) - (b.state === "received" ? 1 : 0) || prioRank[a.priority] - prioRank[b.priority]);

  // ── Plaintiff findings, each read against the nine playbook factors ──
  const capacity = m.liability.plaintiff.checks.find((p) => p.id === "p-capacity");
  const exceptionsNote = m.jurisdiction?.fault.exceptionsNote;
  const plaintiffFindings: PlaintiffFinding[] = m.liability.plaintiff.checks.map((p) => {
    const evidence = refsFor(p.sourceIds);
    const on = evidence.filter((e) => e.onFile).length;
    if (p.status === "Not applicable") {
      return { ...p, evidence, rows: PLAYBOOK_FACTORS.map((factor) => ({ factor, explanation: "Not applicable to this item.", effect: "N/A" as const, evidence: "—", origin: "record" as const })) };
    }
    const open = p.status === "Not yet known";
    const rebuttal = recommendations.find((r) => (p.id.includes("med") && r.id === "r-mar") || (p.id === "p-capacity" && r.id === "r-agreement"));
    const defaults: Record<string, Omit<PlaybookRow, "factor">> = {
      Causation: open
        ? { explanation: "No link between this item and the injury is on record yet.", effect: "Pending", evidence: p.open ?? "Not yet known.", origin: "record" }
        : { explanation: "No link between this item and the injury is on record.", effect: "Helps", evidence: "Nothing on record ties it to the stroke.", origin: "record" },
      Concurrency: { explanation: "Weighed against the staff's escalation delay of about 145 minutes.", effect: "Neutral", evidence: "Facility call log (cited by the Defendant Analysis).", origin: "record" },
      Burden: { explanation: "Plaintiff fault is a defense the defendant must plead and prove.", effect: "Helps", evidence: "No plaintiff fault is pleaded or on record.", authorityId: "il-2-1116", origin: "record" },
      Admissibility: evidence.length
        ? { explanation: "Whether the records behind this item can be admitted is not assessed.", effect: on === evidence.length ? "Neutral" : "Pending", evidence: `${on} of ${evidence.length} cited records in the case documents.`, origin: "record" }
        : { explanation: "No records are linked to this item.", effect: "N/A", evidence: p.moduleSource ?? "—", origin: "record" },
      Exceptions: { explanation: exceptionsNote ?? "No exceptions rated in the jurisdiction review.", effect: exceptionsNote ? "N/A" : "Pending", evidence: "Jurisdiction review", origin: "record" },
      Recharacterize: { explanation: "Not assessed for this item.", effect: "N/A", evidence: "—", origin: "record" },
      "Capacity / standard": capacity?.status === "Not yet known"
        ? { explanation: "Her capacity sets the standard her conduct is measured against.", effect: "Pending", evidence: "Capacity not on record.", followUp: capacity.open, origin: "record" }
        : { explanation: "Adult standard.", effect: "Neutral", evidence: "—", origin: "record" },
      "Comparative weight": open
        ? { explanation: "Cannot be weighed until the open question is answered.", effect: "Pending", evidence: p.open ?? "—", origin: "record" }
        : { explanation: "No conduct of hers on record to weigh against the documented delay.", effect: "Helps", evidence: "No plaintiff conduct on record.", origin: "record" },
      "Rebuttal evidence": rebuttal
        ? { explanation: `${rebuttal.title}.`, effect: rebuttal.state === "received" ? "Helps" : "Pending", evidence: rebuttal.state === "received" ? `On file: ${rebuttal.receivedFile}` : rebuttal.state === "requested" ? `Requested ${rebuttal.requestedAt}` : "Not yet requested.", origin: "record" }
        : { explanation: "No rebuttal evidence needed on the current record.", effect: open ? "Pending" : "N/A", evidence: "—", origin: "record" },
    };
    const rows = PLAYBOOK_FACTORS.map((factor): PlaybookRow => {
      const own = p.playbook.find((x) => x.factor === factor);
      return own ? { ...own, origin: "item" } : { factor, ...defaults[factor] };
    });
    return { ...p, evidence, rows };
  });

  // ── Strengthening playbook: per defendant, the strategies the record supports ──
  const strengtheningFor = (cid: string): StrategyRow[] => {
    const c = m.defendants.candidates.find((x) => x.id === cid);
    if (!c) return [];
    // A party's own record only — a finding shared by all defendants says
    // nothing about this party's strength.
    const own = defendantFindings.filter((f) => !f.shared && f.candidate.id === cid);
    const by = (k: NegligenceElement) => own.filter((f) => f.kind === k);
    const tone = (list: DefendantFinding[]): StrategyRow["tone"] => list.every((f) => f.status === "Shown") ? "good" : list.some((f) => f.status === "Not yet known") ? "pending" : "neutral";
    const label = (list: DefendantFinding[]) => list.every((f) => f.status === "Shown") ? "Strong" : list.some((f) => f.status === "Shown") ? "Partial" : list.some((f) => f.status === "Not yet known") ? "Needs records" : "Indicated";
    const next = (list: DefendantFinding[]) => recommendations.find((r) => r.state !== "received" && list.some((f) => r.answers.includes(f.id)));
    const evidenceLine = (list: DefendantFinding[]) => {
      const ev = list.flatMap((f) => f.evidence);
      return ev.length ? `${ev.filter((e) => e.onFile).length} of ${ev.length} cited records on file` : "No documents linked";
    };
    const rows: StrategyRow[] = [];
    const add = (title: string, list: DefendantFinding[], explanation: string) => {
      if (!list.length) return;
      const n = next(list);
      rows.push({ title, explanation, evidence: evidenceLine(list), status: label(list), tone: tone(list), followUp: n ? `${n.title}${n.state === "requested" ? " (requested)" : ""}` : list.find((f) => f.missing)?.missing });
    };
    add("Breach", by("breach"), by("breach").map((f) => f.title).join("; "));
    add("Duty basis", by("duty"), by("duty").map((f) => f.title).join("; "));
    add("Causation proof", by("causation"), by("causation").map((f) => f.title).join("; "));
    add("Damages link", by("damages"), by("damages").map((f) => f.title).join("; "));
    const statements = recommendations.find((r) => r.id === "r-staffing");
    if (cid === "staff" || cid === "memory-care-llc") {
      rows.push({
        title: "Admissions and statements",
        explanation: "Staff statements and the facility's internal review of the incident.",
        evidence: statements?.state === "received" ? `On file: ${statements.receivedFile}` : "Not obtained",
        status: statements?.state === "received" ? "Obtained" : statements?.state === "requested" ? "Requested" : "Not obtained",
        tone: statements?.state === "received" ? "good" : "pending",
        followUp: statements?.state === "received" ? undefined : statements?.title,
      });
    }
    rows.push({
      title: "Spoliation leverage",
      explanation: "Any loss of records after notice could support an adverse inference.",
      evidence: "No loss, deletion or alleged deletion on record.",
      status: "None on record", tone: "na",
    });
    rows.push({
      title: "Defense will argue",
      explanation: c.couldUndo,
      evidence: c.why.open.length ? `Open: ${c.why.open.join(" · ")}` : "—",
      status: "Rebut", tone: "neutral",
      followUp: c.requests[0],
    });
    return rows;
  };

  // ── Evidence ledger ──
  const provesFor = (sourceId: string) => {
    const kinds = new Set(defendantFindings.filter((f) => f.evidence.some((e) => e.sourceId === sourceId)).map((f) => f.kind));
    plaintiffFindings.filter((p) => p.sourceIds.includes(sourceId)).forEach((p) => kinds.add(p.element));
    return ELEMENTS.filter((e) => kinds.has(e.key)).map((e) => e.label).join(" · ") || "Context only";
  };
  const citedFiles = new Set<string>();
  const ledger: LedgerRow[] = m.defendants.sources.filter((s) => s.files.length).map((s) => {
    const files = refsFor([s.id]);
    files.forEach((f) => citedFiles.add(f.file.toLowerCase()));
    const on = files.filter((f) => f.onFile).length;
    const custody = m.liability.custody[s.id];
    return {
      id: `src-${s.id}`,
      sourceId: s.id,
      name: s.name,
      files,
      heldBy: custody?.heldBy ?? "Not on record",
      preSuit: custody?.preSuit ?? "Not assessed",
      status: on === files.length ? "On file" : on > 0 ? "Partly on file" : "Cited, not on file",
      proves: provesFor(s.id),
      note: [s.date, s.facts[0]?.text].filter(Boolean).join(" · "),
    };
  });
  recommendations.filter((r) => !r.computed).forEach((r) => {
    ledger.push({
      id: `rec-${r.id}`,
      name: r.title,
      files: r.receivedFile ? [{ file: r.receivedFile, onFile: true, sourceId: r.id, sourceName: r.title }] : [],
      heldBy: r.custodian,
      preSuit: r.preSuit,
      status: r.state === "received" ? "On file" : r.state === "requested" ? "Requested" : "Not requested",
      proves: r.answers.map((a) => findingById.get(a)?.kind).filter(Boolean).map((k) => ELEMENTS.find((e) => e.key === k)!.label)
        .filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "Context only",
      note: r.state === "requested" ? `Request recorded ${r.requestedAt}` : "Retention period not verified",
    });
  });
  m.documents.filter((d) => !citedFiles.has(d.name.toLowerCase()) && !recommendations.some((r) => r.receivedFile === d.name)).forEach((d) => {
    ledger.push({
      id: `doc-${d.name}`,
      name: d.name,
      files: [{ file: d.name, onFile: true, sourceId: "case-documents", sourceName: "Case documents" }],
      heldBy: "Case file",
      preSuit: "—",
      status: "On file · not linked",
      proves: "Not linked to a liability finding",
      note: "In the case documents; no liability finding cites it",
    });
  });
  const litigationOnly = ledger.filter((r) => r.preSuit === "Discovery likely" && r.status !== "On file");

  // ── Timeline ──
  const anchor = m.liability.incidentInEvidence.iso;
  const recorded = m.liability.incidentOnRecord.iso;
  const timeline: TimelineItem[] = m.events
    .filter((ev) => ev.id !== "case-ready")
    .map((ev): TimelineItem => {
      const link = m.liability.timelineLinks[ev.id];
      return {
        id: ev.id,
        iso: ev.iso,
        date: ev.date,
        title: ev.title,
        detail: ev.description ?? ev.summary,
        party: link?.party ?? (ev.origin === "manual" ? "Added by attorney" : "Not attributed"),
        phase: ev.iso < anchor ? "before" : ev.iso === anchor ? "incident" : "treatment",
        kind: link?.kind,
        findings: (link?.findings ?? []).map((id) => findingById.get(id)).filter((f): f is DefendantFinding => !!f),
        evidence: ev.evidence.map((file) => ({ file, onFile: onFile(file), sourceId: ev.id, sourceName: ev.title })),
        conflict: ev.iso === anchor && anchor !== recorded ? `The case record gives ${fmtIso(recorded)}` : undefined,
        origin: ev.origin,
      };
    });
  // The causal window sits between the two events it spans.
  const win = m.liability.causalWindow;
  if (win) {
    const toIdx = timeline.findIndex((t) => t.id === win.to);
    const from = timeline.find((t) => t.id === win.from);
    if (toIdx > 0 && from) {
      timeline.splice(toIdx, 0, {
        id: "causal-window", iso: from.iso, date: from.date, title: win.title, detail: win.detail, party: "Causal window",
        phase: from.phase, kind: "window", findings: timeline[toIdx].findings, evidence: [], origin: "record",
      });
    }
  }
  // After: evidence and preservation — what the attorney has actually recorded.
  const evidenceEvents: TimelineItem[] = [
    ...recommendations.filter((r) => r.requestedAt).map((r): TimelineItem => ({
      id: `ev-${r.id}`, iso: isoOfStamp(r.requestedAt!), date: r.requestedAt!, title: `Requested: ${r.title}`,
      detail: `From ${r.custodian}`, party: "Firm", phase: "evidence", findings: r.answers.map((a) => findingById.get(a)).filter((f): f is DefendantFinding => !!f), evidence: [], origin: "record",
    })),
    ...(m.inputs.preservation ? [{
      id: "ev-preservation", iso: isoOfStamp(m.inputs.preservation.at), date: m.inputs.preservation.at,
      title: m.inputs.preservation.decision === "send" ? "Decision: send a preservation request" : "Decision: no preservation request needed",
      detail: m.inputs.preservation.reason, party: "Firm", phase: "evidence" as const, findings: [], evidence: [], origin: "record" as const,
    }] : []),
  ].sort((a, b) => a.iso.localeCompare(b.iso));
  timeline.push(...evidenceEvents);

  // ── Flags: the jurisdiction review's, and what this analysis finds ──
  const flags: Flag[] = (m.jurisdiction?.flags ?? []).filter((f) => f.severity !== "LOW").map((f) => ({
    ...f,
    owner: f.id === "defendant-name" ? "defendants" : "jurisdiction",
  }));
  const vehicleTerms = /traffic|red-light|intersection|vehicle|speed|skid|collision/i;
  const vehicleSignals = m.docSignals.filter((s) => vehicleTerms.test(`${s.tag} ${s.title} ${s.description}`));
  if (vehicleSignals.length && m.caseType && !/motor|vehicle|auto/i.test(m.caseType)) {
    flags.push({
      id: "signals-case-type",
      severity: "HIGH",
      title: "Document-analysis signals describe a traffic collision",
      detail: `${vehicleSignals.length} liability ${vehicleSignals.length === 1 ? "signal" : "signals"} from the document analysis (${vehicleSignals.map((s) => s.title).join("; ")}) describe a vehicle collision, but the case is ${m.caseType}. They are kept as recorded and are not used in this analysis.`,
      sources: Array.from(new Set(vehicleSignals.flatMap((s) => s.evidence.map((e) => e.file)))),
      owner: "liability",
    });
  }
  const allCited = Array.from(new Map([...defendantFindings, ...plaintiffFindings].flatMap((f) => f.evidence).map((e) => [e.file, e])).values());
  const offFile = allCited.filter((e) => !e.onFile);
  if (offFile.length) {
    flags.push({
      id: "cited-off-file",
      severity: "MEDIUM",
      title: `${offFile.length} cited ${offFile.length === 1 ? "record is" : "records are"} not in the case documents`,
      detail: "The Defendant Analysis cites these files, but they are not among this case's documents, so they cannot be previewed as originals and do not count as evidence on file.",
      sources: offFile.map((e) => e.file),
      owner: "liability",
    });
  }

  // ── Simulator ──
  const scenarioEval = (s: Scenario[]) => {
    const changes = new Map<string, ElementStatus>();
    s.forEach((x) => x.changes.forEach((c) => changes.set(c.ref, c.to)));
    const status = (f: DefendantFinding) => changes.get(f.id) ?? f.status;
    return {
      shown: defendantFindings.filter((f) => status(f) === "Shown").length,
      open: defendantFindings.filter((f) => status(f) === "Not yet known").length,
      resolvedFlags: s.map((x) => x.resolvesFlag).filter(Boolean) as string[],
      affects: Array.from(new Set(s.flatMap((x) => x.affects))),
    };
  };
  /** How many recorded elements a scenario changes — the simulator's ranking. */
  const impact = (s: Scenario) => s.changes.filter((c) => findingById.get(c.ref)?.status !== c.to).length + (s.resolvesFlag ? 1 : 0);
  const simulator = {
    baseline: scenarioEval([]),
    scenario: scenarioEval(chosen),
    preSuit: scenarioEval(chosen.filter((s) => s.when === "pre-suit")),
    litigation: scenarioEval(chosen),
    ranked: [...m.liability.scenarios].sort((a, b) => impact(b) - impact(a)),
    impact,
    chosen,
    total: defendantFindings.length,
  };

  // ── Snapshot: what a rerun compares, and what review marks and sign-off sign ──
  const snapshot: Record<string, string> = Object.fromEntries([
    ...defendantFindings.map((f) => [f.id, `${f.status}|${f.evidence.filter((e) => e.onFile).length}/${f.evidence.length}`]),
    ...plaintiffFindings.map((p) => [p.id, `${p.status}|${p.evidence.filter((e) => e.onFile).length}/${p.evidence.length}`]),
  ]);
  const plaintiffSignature = plaintiffFindings.map((p) => snapshot[p.id]).join(",");
  const ledgerSignature = ledger.map((r) => `${r.id}:${r.status}`).join(",");
  const changedSinceReview = (m.inputs.lastRun?.changed ?? []).filter((id) => m.inputs.reviewed[id] && m.inputs.reviewed[id].signature !== snapshot[id]);

  // ── Readiness ──
  const authorities = m.rules?.authorities ?? [];
  const unverified = authorities.filter((a) => !m.inputs.authorityChecks[a.id]);
  const datesDiffer = m.liability.incidentOnRecord.iso !== m.liability.incidentInEvidence.iso;
  const facilityHeldOff = ledger.filter((r) => r.sourceId && /facility/i.test(r.heldBy) && r.status !== "On file");
  const causationOpen = defendantFindings.filter((f) => f.kind === "causation" && f.status === "Not yet known" && inAnalysisIds.has(f.candidate.id));
  const clientAccount = m.documents.find((d) => /client_statement|plaintiff_statement|client_account|declaration/i.test(d.name));
  const upstream = flags.filter((f) => f.owner !== "liability");
  const overrides = [m.inputs.plaintiffOverride, ...Object.values(m.inputs.defendantOverrides)].filter(Boolean);
  /** Confirmed spoliation, deletion or alleged deletion — none is recorded anywhere in the case. */
  const spoliationFlags: string[] = [];

  const readiness: ReadinessItem[] = [
    {
      id: "spoliation", group: "legal", title: "Spoliation flags", blocking: spoliationFlags.length > 0, decision: true, alwaysListed: "none",
      done: spoliationFlags.length === 0, count: spoliationFlags.length,
      detail: spoliationFlags.length ? spoliationFlags.join(" · ") : "No loss, deletion or alleged deletion of evidence is on record.",
      link: { label: "Evidence", target: "liability-ledger" },
    },
    {
      id: "defendants", group: "facts", title: "Defendant selection", blocking: true, decision: true,
      done: !!m.decisions?.confirmedAt,
      detail: m.decisions?.confirmedAt
        ? `${inAnalysis.length} in the analysis · confirmed ${m.decisions.confirmedAt}`
        : "Decisions on each potential defendant are not confirmed in the Defendant Analysis.",
      link: { label: "Defendants", target: "defendants" },
    },
    {
      id: "governing-law", group: "legal", title: "Governing law", blocking: true, decision: true,
      done: !!m.governingLawApproved,
      detail: m.governingLawApproved ? `${m.governingLawApproved} · approved` : `Provisional: ${m.jurisdiction?.governingLaw.finding ?? "none"} — the fault rule depends on it.`,
      link: { label: "Jurisdiction", target: "jurisdiction" },
    },
    ...(datesDiffer ? [{
      id: "incident-date", group: "facts" as const, title: "Incident date for this analysis", blocking: true, decision: true,
      done: !!m.inputs.incidentDate,
      detail: m.inputs.incidentDate
        ? `Using ${fmtIso(m.inputs.incidentDate.choice === "record" ? recorded : anchor)} · ${m.inputs.incidentDate.reason}`
        : `Case record ${fmtIso(recorded)} vs. evidence ${fmtIso(anchor)} — choose which the analysis relies on.`,
      link: { label: "Decide", target: "decide-incident-date" },
    }] : []),
    ...(changedSinceReview.length ? [{
      id: "changed-since-review", group: "facts" as const, title: "Findings changed since review", blocking: true, decision: true,
      done: false, count: changedSinceReview.length,
      detail: `${changedSinceReview.length} reviewed ${changedSinceReview.length === 1 ? "finding" : "findings"} changed on the last rerun — review again.`,
      link: { label: "Findings", target: "liability-defendants" },
    }] : []),
    {
      id: "authority", group: "legal", title: "Unverified authority", blocking: false, decision: true,
      done: unverified.length === 0, count: unverified.length,
      detail: unverified.length ? `${unverified.length} of ${authorities.length} unverified · left out of the demand draft until verified` : `All ${authorities.length} checked by the attorney`,
      link: { label: "Authority", target: "liability-authority" },
    },
    {
      id: "override-reasons", group: "legal", title: "Override reasons", blocking: false, decision: true, alwaysListed: "optional",
      done: true, count: overrides.length,
      detail: overrides.length ? `${overrides.length} ${overrides.length === 1 ? "override" : "overrides"}, each with its reason` : "No overrides entered — a reason is required only if you change an estimate.",
      link: { label: "L4 · L5", target: "liability-plaintiff" },
    },
    {
      id: "preservation", group: "legal", title: "Preservation of facility records", blocking: false, decision: true,
      done: !!m.inputs.preservation || facilityHeldOff.length === 0, count: facilityHeldOff.length,
      detail: m.inputs.preservation
        ? `${m.inputs.preservation.decision === "send" ? "Preservation request to be sent" : "Not needed"} · ${m.inputs.preservation.reason}`
        : `${facilityHeldOff.length} facility-held ${facilityHeldOff.length === 1 ? "record is" : "records are"} not in the case file. No loss or deletion is on record — decide whether to send a preservation request.`,
      link: { label: "Evidence", target: "decide-preservation" },
    },
    {
      id: "upstream", group: "facts", title: "Upstream record conflicts", blocking: false, decision: true,
      done: upstream.length === 0, count: upstream.length,
      detail: upstream.map((f) => f.title).join(" · ") || "None",
      link: { label: "Flags", target: "flags" },
    },
    {
      id: "client-account", group: "facts", title: "Client's account", blocking: false, decision: false,
      done: !!clientAccount,
      detail: clientAccount ? clientAccount.name : "No statement from the client or family is in the case documents.",
      link: { label: "Evidence", target: "liability-ledger" },
    },
    {
      id: "plaintiff-review", group: "facts", title: "Plaintiff conduct items", blocking: false, decision: false,
      done: m.inputs.plaintiffReview?.signature === plaintiffSignature,
      detail: m.inputs.plaintiffReview?.signature === plaintiffSignature
        ? `${plaintiffFindings.length} reviewed · ${m.inputs.plaintiffReview.at}`
        : `${plaintiffFindings.length} checks — none attributes fault to her; review and confirm.`,
      link: { label: "L4", target: "liability-plaintiff" },
    },
    {
      id: "evidence-review", group: "legal", title: "Evidence statuses", blocking: false, decision: false,
      done: m.inputs.ledgerReview?.signature === ledgerSignature,
      detail: m.inputs.ledgerReview?.signature === ledgerSignature ? `${ledger.length} items reviewed` : m.inputs.ledgerReview ? "Changed since your review" : `${ledger.length} items to review`,
      link: { label: "Ledger", target: "liability-ledger" },
    },
    {
      id: "exceptions", group: "legal", title: "Exception ratings", blocking: false, decision: false,
      done: m.liability.exceptions.length > 0,
      detail: `${m.liability.exceptions.length} rated · ${m.liability.exceptions.filter((e) => e.status === "Pending" || e.status === "No evidence yet").length} open`,
      link: { label: "Exceptions", target: "liability-exceptions" },
    },
    {
      id: "no-fault", group: "legal", title: "No-fault check", blocking: false, decision: false,
      done: !!m.rules, detail: m.rules ? `${m.rules.noFault.title} · ${m.rules.state}` : "No rules recorded for this jurisdiction",
      link: { label: "Rule", target: "liability-overview" },
    },
    {
      id: "settlements", group: "legal", title: "Settlements and releases", blocking: false, decision: false,
      done: !!m.inputs.settlementsNone,
      detail: m.inputs.settlementsNone ? `None to date · confirmed ${m.inputs.settlementsNone.at}` : "None on record — confirm.",
      link: { label: "Confirm", target: "liability-signoff" },
    },
  ];
  const blocking = readiness.filter((r) => r.blocking && !r.done);
  const openItems = readiness.filter((r) => !r.blocking && !r.done);
  const signature = JSON.stringify([snapshot, readiness.map((r) => `${r.id}:${r.done}`), m.inputs.plaintiffOverride?.expected, Object.entries(m.inputs.defendantOverrides).map(([k, v]) => `${k}:${v.expected}`)]);

  // ── Plaintiff fault under the rule, from the attorney's estimate only ──
  const plaintiffEstimate = m.inputs.plaintiffOverride;
  const ruleResult = m.rules && plaintiffEstimate ? faultResult(m.rules.faultRule, plaintiffEstimate.expected) : undefined;
  const defenseResult = m.rules && plaintiffEstimate?.defense !== undefined ? faultResult(m.rules.faultRule, plaintiffEstimate.defense) : undefined;

  // ── Reading the timeline: a summary built from the record, not written ──
  const breachLinked = new Set(timeline.flatMap((t) => t.findings.filter((f) => f.kind === "breach").map((f) => f.id)));
  const reading = [
    `${breachLinked.size} recorded ${breachLinked.size === 1 ? "breach links" : "breaches link"} to the timeline`,
    win ? `the ${win.title.toLowerCase()} between the documented signs and the 911 call is the central causal issue` : null,
    causationOpen.length ? `whether it worsened the outcome is not yet known (${causationOpen.length} causation ${causationOpen.length === 1 ? "element" : "elements"} need an expert)` : null,
    plaintiffFindings.some((p) => p.element === "breach" && p.status !== "Not indicated" && p.status !== "Not applicable") ? null : "no conduct of the plaintiff is recorded in that window",
    datesDiffer ? `the incident date is disputed (${fmtIso(anchor)} in the evidence vs. ${fmtIso(recorded)} on the record)` : null,
  ].filter(Boolean).join("; ") + ".";
  // The same facts in one line for the timeline footer; the full reading keeps
  // the disputed date and the expert count.
  const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const readingShort = [
    `${NUM[breachLinked.size] ?? breachLinked.size} recorded ${breachLinked.size === 1 ? "breach links" : "breaches link"} to the timeline.`,
    win ? `The 911 response delay is the central causal issue${causationOpen.length ? "; its effect on the outcome remains unconfirmed." : "."}` : null,
  ].filter(Boolean).join(" ");

  return {
    defendantFindings, plaintiffFindings, parties, inAnalysis, groups, completeness, recommendations, ledger, timeline, flags,
    simulator, snapshot, plaintiffSignature, ledgerSignature, changedSinceReview, readiness, blocking, openItems, signature,
    unverified, authorities, ruleResult, defenseResult, causationOpen, datesDiffer, recorded, anchor, fmtIso, forParty,
    strengtheningFor, litigationOnly, reading, readingShort, spoliationFlags, lead,
  };
}

export type LiabilityModel = ReturnType<typeof buildLiabilityModel>;

/** Ids whose status or evidence differ between two snapshots. */
export function changedBetween(prev: Record<string, string> | undefined, next: Record<string, string>): string[] {
  if (!prev) return [];
  return Object.keys(next).filter((k) => prev[k] !== undefined && prev[k] !== next[k]);
}

/** Validates an estimate entry; returns an error to show, or null. */
export function estimateError(e: { expected: string; low: string; high: string; reason: string; defense?: string }): string | null {
  const num = (s?: string) => (s === undefined || s.trim() === "" ? undefined : Number(s));
  const vals = [num(e.expected), num(e.low), num(e.high), num(e.defense)];
  if (vals[0] === undefined) return "Enter an expected percentage.";
  if (vals.some((v) => v !== undefined && (Number.isNaN(v) || v < 0 || v > 100))) return "Percentages must be between 0 and 100.";
  const [x, lo, hi] = vals as (number | undefined)[];
  if (lo !== undefined && lo > x!) return "Low cannot be above expected.";
  if (hi !== undefined && hi < x!) return "High cannot be below expected.";
  if (!e.reason.trim()) return "A reason is required for every override.";
  return null;
}
