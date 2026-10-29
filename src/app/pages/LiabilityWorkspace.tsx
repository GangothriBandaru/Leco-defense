import { useEffect, useMemo, useState } from "react";
import {
  Scale, AlertTriangle, CheckCircle, FileText, ChevronDown, Eye, Sparkles, BookOpen, RefreshCw,
  ArrowRight, ShieldAlert, Search, Download, X, Clock, Info, Lock, ExternalLink, Check, Circle, Zap,
} from "lucide-react";
import type { CaseDocument, AnalysisFinding } from "../types/case";
import type { DocInsights, DocContextPanel } from "../components/DocumentWorkspace";
import { downloadTextFile, safeFileName } from "../components/downloadText";
import { defendantsForCase, type ElementStatus } from "../defendants/defendantData";
import { useDefendantDecisions } from "../defendants/defendantDecisionStore";
import { jurisdictionForCase, stateOfJurisdiction } from "../jurisdiction/jurisdictionData";
import { liabilityForCase, type PlaintiffStatus, type PlaybookEffect, type Priority } from "../liability/liabilityData";
import { rulesForState, type Authority } from "../liability/liabilityRules";
import { useLiabilityInputs, updateLiability, stampNow, type Override } from "../liability/liabilityStore";
import {
  buildLiabilityModel, changedBetween, estimateError, ELEMENTS,
  type DefendantFinding, type PlaintiffFinding, type EvidenceRef, type LiabilityEvent, type LiabilityModel, type RecommendationView, type StrategyRow,
} from "../liability/liabilityModel";

// ── Liability Analysis workspace ─────────────────────────────────────────────
// Stage 3 → Analysis → Liability Signals. Renders the liability model for the
// open case, in the reference's order: header, the three summary cards, fault
// allocation, plaintiff negligence (L4) with its playbook and estimate,
// defendant negligence (L5) with its playbook and estimates, other parties,
// the negligence timeline, the evidence ledger and the attorney's sign-off
// (L7), with the supporting sidebar beside L4–L5. Every figure is read from
// the model; every percentage is the attorney's own.

const REVIEWER = "J. Davis";
const GREY = "bg-[#F1F3F5] text-[#5B6B78] border-line";
const ELEMENT_PILL: Record<ElementStatus, string> = {
  Shown: "pill-complete", Indicated: "pill-neutral", "Not yet known": "pill-progress", "Not indicated": GREY, "Not established": GREY,
};
const PLAINTIFF_PILL: Record<PlaintiffStatus, string> = {
  "Not indicated": "pill-complete", "No issue on record": "pill-complete", "Not yet known": "pill-progress", "Not applicable": GREY,
};
const EFFECT_PILL: Record<PlaybookEffect, string> = { Helps: "pill-complete", Neutral: "pill-neutral", Pending: "pill-progress", Flag: "pill-risk", "N/A": GREY };
const PRIORITY_PILL: Record<Priority, string> = { Urgent: "pill-risk", High: "pill-progress", Medium: "pill-neutral" };
const TONE_PILL: Record<StrategyRow["tone"], string> = { good: "pill-complete", pending: "pill-progress", neutral: "pill-neutral", na: GREY };
const EXCEPTION_PILL: Record<string, string> = { Applies: "pill-complete", Pending: "pill-progress", "No evidence yet": "pill-progress", "Not met": GREY, "N/A": GREY };
const LEDGER_PILL: Record<string, string> = {
  "On file": "pill-complete", "Partly on file": "pill-progress", "Cited, not on file": "pill-progress", Requested: "pill-neutral", "Not requested": GREY, "On file · not linked": GREY,
};
const PARTY_BAR = ["bg-deep", "bg-brand", "bg-[#6FA8BC]", "bg-soft", "bg-[#B7C9D3]"];
const BTN_S = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-line text-ink rounded-lg text-xs font-semibold hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_P = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-deep text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
// Recommendation CTAs: one height, kept on one line.
const REC_BTN = "!h-7 !px-2.5 !text-[11px] whitespace-nowrap";
const INPUT = "w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand";

const Pill = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pill ${className} text-[11px] max-w-full`}>{children}</span>
);

function Section({ id, eyebrow, title, sub, right, children, className = "", titleClassName = "section-header" }: {
  id: string; eyebrow?: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; titleClassName?: string;
}) {
  return (
    <section id={id} tabIndex={-1} className={`lg-card overflow-hidden scroll-mt-[150px] focus:outline-none ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b border-line">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h2 className={`${titleClassName} leading-snug`}>{title}</h2>
          {sub && <p className="secondary-text mt-0.5 max-w-3xl">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const goTo = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  el.focus?.({ preventScroll: true });
};
const pct = (v?: number) => (v === undefined ? "—" : `${v}%`);
const range = (o?: { low?: number; high?: number }) => (o && (o.low !== undefined || o.high !== undefined) ? `${o.low ?? "–"}–${o.high ?? "–"}%` : null);

export interface LiabilityWorkspaceProps {
  caseData: { caseName: string; caseId: string; plaintiff: string; jurisdiction?: string; caseType?: string; caseSubType?: string };
  documents: CaseDocument[];
  events: LiabilityEvent[];
  docSignals: AnalysisFinding[];
  /** The governing law, once the attorney has approved it. */
  governingLaw?: string;
  onOpenJurisdiction?: () => void;
  onOpenDefendants?: (name: string) => void;
  /** The existing transition to Valuation — only offered after sign-off. */
  onProceedToValuation?: () => void;
  /** Opens files from the case documents in the Document Workspace. */
  onOpenDocs: (files: string[], view: "preview" | "insights", context: { contextType: string; reference: string }, insight?: DocInsights, panel?: DocContextPanel) => void;
}

export function LiabilityWorkspace(props: LiabilityWorkspaceProps) {
  const { caseData } = props;
  const defendants = defendantsForCase(caseData.caseId);
  const liability = liabilityForCase(caseData.caseId);
  if (!defendants || !liability) {
    return (
      <div className="space-y-4">
        <h1 className="page-title" style={{ fontSize: "24px" }}>Liability Analysis</h1>
        <div className="lg-card p-10 flex flex-col items-center text-center">
          <Scale className="w-8 h-8 text-soft mb-3" strokeWidth={1.75} />
          <p className="text-sm font-medium text-ink">No liability analysis on record for this case yet.</p>
          <p className="secondary-text mt-1 max-w-md">
            {!defendants ? "The Defendant Analysis has no record for this case, so there are no parties to analyse." : "No liability inputs have been recorded for this case."} Needs attorney review.
          </p>
        </div>
      </div>
    );
  }
  return <Workspace {...props} defendants={defendants} liability={liability} />;
}

type Liability = NonNullable<ReturnType<typeof liabilityForCase>>;
type Rules = ReturnType<typeof rulesForState>;
type Jx = ReturnType<typeof jurisdictionForCase>;
type Inputs = ReturnType<typeof useLiabilityInputs>;
type Save = (fn: Parameters<typeof updateLiability>[2], audit?: Parameters<typeof updateLiability>[3], ok?: string) => boolean;
type Target = { kind: "defendant"; f: DefendantFinding } | { kind: "plaintiff"; f: PlaintiffFinding };

function Workspace({ caseData, documents, events, docSignals, governingLaw, onOpenJurisdiction, onOpenDefendants, onProceedToValuation, onOpenDocs, defendants, liability }:
  LiabilityWorkspaceProps & { defendants: NonNullable<ReturnType<typeof defendantsForCase>>; liability: Liability }) {
  const caseId = caseData.caseId;
  const jurisdiction = jurisdictionForCase(caseId);
  const state = governingLaw ?? jurisdiction?.governingLaw.finding ?? stateOfJurisdiction(caseData.jurisdiction);
  const rules = rulesForState(state);
  const decisions = useDefendantDecisions(defendants.id);
  const inputs = useLiabilityInputs(caseId);

  const model = useMemo(() => buildLiabilityModel({
    caseType: caseData.caseType, documents, defendants, decisions, jurisdiction, rules, liability, inputs,
    governingLawApproved: governingLaw, events, docSignals,
  }), [caseData.caseType, documents, defendants, decisions, jurisdiction, rules, liability, inputs, governingLaw, events, docSignals]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Every write goes through here: a refused write is reported, never shown as saved. */
  const save: Save = (fn, audit, ok) => {
    try {
      updateLiability(caseId, REVIEWER, fn, audit);
      setError(null);
      if (ok) setNotice(ok);
      return true;
    } catch {
      setError("This change could not be saved — the browser refused the write. Nothing was changed.");
      return false;
    }
  };

  const follow = (target: string) => {
    if (target === "defendants") onOpenDefendants?.(model.lead.name);
    else if (target === "jurisdiction") onOpenJurisdiction?.();
    else if (target === "flags") setFlagsOpen(true);
    else goTo(target);
  };

  // The upstream flags, opened from the Upstream flags output and the L7 link.
  const [flagsOpen, setFlagsOpen] = useState(false);

  // ── Rerun ──
  const [running, setRunning] = useState(false);
  const rerun = async () => {
    setRunning(true);
    setNotice(null);
    // Let the running state paint before the model is compared and recorded.
    await new Promise((r) => window.setTimeout(r, 0));
    const changed = changedBetween(inputs.lastRun?.snapshot, model.snapshot);
    const flagged = changed.filter((id) => inputs.reviewed[id]);
    const ok = save(
      (p) => ({ ...p, lastRun: { at: stampNow(), by: REVIEWER, snapshot: model.snapshot, changed } }),
      { action: "Analysis rerun", detail: `${changed.length} changed since the last run${flagged.length ? `; ${flagged.length} reviewed finding(s) flagged` : ""}` },
    );
    setRunning(false);
    if (ok) setNotice(inputs.lastRun
      ? `Analysis rerun from the current case record. ${changed.length ? `${changed.length} ${changed.length === 1 ? "finding" : "findings"} changed since the last run${flagged.length ? ` — ${flagged.length} you had reviewed ${flagged.length === 1 ? "is" : "are"} flagged for review` : ""}.` : "No findings changed since the last run."} Overrides were not touched.`
      : "Analysis run recorded. Later reruns are compared against this one; overrides are never changed by a rerun.");
  };

  // ── Panels ──
  const [findingOpen, setFindingOpen] = useState<Target | null>(null);
  const [authorityOpen, setAuthorityOpen] = useState<Authority | null>(null);
  const openLaw = (id?: string) => { const a = model.authorities.find((x) => x.id === id); if (a) setAuthorityOpen(a); };

  /** Preview / Insights: the Document Workspace for evidence on file; the
   *  finding's own panel when nothing it cites is in the case documents. */
  const openFinding = (target: Target, view: "preview" | "insights") => {
    const files = target.f.evidence.filter((e) => e.onFile);
    if (!files.length) { setFindingOpen(target); return; }
    const isD = target.kind === "defendant";
    const d = target.f as DefendantFinding;
    const p = target.f as PlaintiffFinding;
    const party = isD ? (d.shared ? "All defendants" : d.candidate.name) : liability.plaintiff.name;
    const points = (isD ? [d.description, d.note, d.missing] : [p.description, p.open]).filter(Boolean) as string[];
    onOpenDocs(files.map((f) => f.file), view, { contextType: isD ? "Defendant Negligence" : "Plaintiff Negligence", reference: `${target.f.code} · ${target.f.title}` },
      {
        summary: `${target.f.title} — ${target.f.status}. ${points[0] ?? ""}`.trim(),
        keyPoints: points,
        entities: [{ label: "Party", value: party }, { label: "Status", value: target.f.status }, { label: "Finding", value: target.f.code }],
        supportingDocs: files.map((f) => f.file),
        confidence: { level: "Not scored", score: 0 },
      },
      { summary: [{ label: isD ? "Defendant finding" : "Plaintiff finding", value: target.f.title }, { label: "Party", value: party }, { label: "Status", value: target.f.status }, { label: "Evidence on file", value: `${files.length} of ${target.f.evidence.length}` }] });
  };

  const signedCurrent = !!inputs.signOff && inputs.signOff.signature === model.signature;

  return (
    <div className="space-y-6">
      <Header running={running} onRerun={rerun} notice={notice} error={error} onDismiss={() => { setNotice(null); setError(null); }} />

      <div id="liability-overview" className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch scroll-mt-[150px]">
        <FaultRuleCard rules={rules} model={model} governingLaw={governingLaw} state={state} onLaw={openLaw} />
        <NoFaultCard rules={rules} liability={liability} />
        <PartySummary model={model} rules={rules} inputs={inputs} onLaw={openLaw} />
      </div>

      <FaultAllocation model={model} rules={rules} inputs={inputs} liability={liability} />

      {/* Recommendations (left) beside L4 (right): the list takes L4's height and scrolls within it. */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <div className="min-w-0 order-2 xl:order-1 xl:relative">
          <div className="xl:absolute xl:inset-0">
            <Recommendations model={model} caseData={caseData} save={save} />
          </div>
        </div>
        <div className="min-w-0 order-1 xl:order-2">
          <PlaintiffModule model={model} liability={liability} inputs={inputs} save={save} rules={rules}
            onOpen={(f, view) => openFinding({ kind: "plaintiff", f }, view)} onLaw={openLaw} onDetails={(f) => setFindingOpen({ kind: "plaintiff", f })} />
        </div>
      </div>

      {/* Supporting cards (left) beside L5 and the rest of the analysis (right), as in the row above. */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start xl:items-stretch">
        <div className="flex flex-col gap-6 min-w-0 order-1 xl:order-2 [&>*:last-child]:xl:flex-1">
          <DefendantModule model={model} inputs={inputs} save={save}
            footer={<OtherParties model={model} liability={liability} onOpenDefendants={onOpenDefendants} onOpenJurisdiction={onOpenJurisdiction} />}
            onOpen={(f, view) => openFinding({ kind: "defendant", f }, view)} onLaw={openLaw} onDetails={(f) => setFindingOpen({ kind: "defendant", f })} />
          <NegligenceTimeline model={model} onFinding={(f) => setFindingOpen({ kind: "defendant", f })} onOpenDocs={onOpenDocs} />
        </div>
        <aside className="flex flex-col gap-6 min-w-0 order-2 xl:order-1 [&>*:last-child]:xl:flex-1" aria-label="Supporting analysis">
          <Research liability={liability} />
          <Exceptions liability={liability} onLaw={openLaw} />
          <Simulator model={model} liability={liability} inputs={inputs} save={save} />
          <AuthorityPanel model={model} inputs={inputs} onOpen={setAuthorityOpen} />
          <AllocationRules rules={rules} model={model} inputs={inputs} />
          <Outlook model={model} rules={rules} inputs={inputs} />
          <JurisdictionComparison jurisdiction={jurisdiction} onOpenJurisdiction={onOpenJurisdiction} />
        </aside>
      </div>

      <EvidenceLedger model={model} liability={liability} inputs={inputs} save={save} onOpenDocs={onOpenDocs} />
      <SignOff model={model} inputs={inputs} save={save} follow={follow} caseData={caseData} rules={rules} liability={liability}
        signedCurrent={signedCurrent} onProceedToValuation={onProceedToValuation} />

      {findingOpen && (
        <FindingPanel target={findingOpen} model={model} inputs={inputs} save={save} onClose={() => setFindingOpen(null)} onLaw={openLaw}
          onPreview={(file) => onOpenDocs([file], "preview", { contextType: "Liability finding", reference: findingOpen.f.title })} />
      )}
      {flagsOpen && (
        <Modal label={`Upstream flags (${model.flags.length})`} onClose={() => setFlagsOpen(false)}>
          <ul className="space-y-3">
            {model.flags.map((f) => (
              <li key={f.id} className="rounded-lg border border-line bg-wash p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink leading-snug">{f.title}</p>
                  <Pill className={f.severity === "HIGH" ? "pill-risk" : "pill-progress"}>{f.severity === "HIGH" ? "High" : "Medium"}</Pill>
                </div>
                <p className="text-xs text-[#5B6B78] mt-1 leading-relaxed">{f.detail}</p>
                <p className="mono-ref text-[11px] break-all mt-1.5">{f.sources.join(" · ")}</p>
                {f.owner !== "liability" && (
                  <button onClick={() => { setFlagsOpen(false); follow(f.owner); }} className="text-xs font-semibold text-deep hover:text-ink inline-flex items-center gap-1 mt-1.5">
                    Resolve in {f.owner === "defendants" ? "Defendant Analysis" : "Jurisdiction review"} <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {authorityOpen && <AuthorityModal authority={authorityOpen} inputs={inputs} save={save} onClose={() => setAuthorityOpen(null)} />}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

// The case details live on the case overview; this header names the page and
// carries its two actions.
function Header({ running, onRerun, notice, error, onDismiss }: {
  running: boolean; onRerun: () => void; notice: string | null; error: string | null; onDismiss: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="page-title min-w-0" style={{ fontSize: "21px", fontWeight: 600, lineHeight: 1.25 }}>Liability Signals</h1>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button onClick={onRerun} disabled={running} aria-busy={running} className="btn btn-secondary gap-2">
            <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} strokeWidth={1.75} /> {running ? "Running…" : "Rerun analysis"}
          </button>
          <button onClick={() => goTo("liability-signoff")} className="btn btn-primary gap-2">Review attorney inputs</button>
        </div>
      </div>
      {(notice || error) && (
        <div role={error ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm border ${error ? "bg-[#FEF2F2] border-[#FBD5D5] text-[#B91C1C]" : "bg-[#ECFDF3] border-[#D1FADF] text-[#15803D]"}`}>
          <span>{error ?? notice}</span>
          <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0"><X className="w-4 h-4" strokeWidth={1.75} /></button>
        </div>
      )}
    </div>
  );
}

// ── The three summary cards ───────────────────────────────────────────────────

// Compact, reference-sized cards: an eyebrow, one bold line, one short line
// and a single status row. The full explanations live in the sections below.
const CARD = "lg-card px-4 py-3.5 flex flex-col h-full min-w-0";

function FaultRuleCard({ rules, model, governingLaw, state, onLaw }: {
  rules: Rules; model: LiabilityModel; governingLaw?: string; state?: string; onLaw: (id?: string) => void;
}) {
  const auth = model.authorities.find((a) => a.id === "il-2-1116");
  const verified = auth && !model.unverified.some((a) => a.id === auth.id);
  // One indicator for the governing-law and authority review status.
  const status = governingLaw && verified ? "Verified" : governingLaw ? "Authority unverified" : "Provisional · verify";
  const statusHint = governingLaw && verified ? "Governing law approved; authority verified" : governingLaw ? "Governing law approved; authority not yet verified" : "Governing law provisional — attorney verification required";
  return (
    <div className={CARD}>
      <div className="eyebrow mb-1.5">Governing fault rule</div>
      {rules ? (
        <>
          <h3 className="card-title leading-snug">{rules.state} · {rules.faultRuleName}</h3>
          <p className="text-xs text-[#5B6B78] mt-1 leading-snug">{rules.plaintiffFaultShort}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2.5">
            {auth && (
              <button onClick={() => onLaw(auth.id)} title="Open the authority" className="text-[11px] text-deep font-semibold hover:text-ink inline-flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /> {auth.citation}
              </button>
            )}
            <span title={statusHint}><Pill className={governingLaw && verified ? "pill-complete" : "pill-progress"}>{status}</Pill></span>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#5B6B78]">No rules recorded for {state ?? "this jurisdiction"} — needs attorney review.</p>
      )}
    </div>
  );
}

function NoFaultCard({ rules, liability }: { rules: Rules; liability: Liability }) {
  return (
    <div className={CARD}>
      <div className="eyebrow mb-1.5">No-fault / PIP</div>
      {rules ? (
        <>
          <h3 className="card-title leading-snug">Tort claim · {rules.noFault.applicable ? "Threshold applies" : "No threshold"}</h3>
          <p className="text-xs text-[#5B6B78] mt-1 leading-snug">{rules.noFault.short}</p>
          <div className="mt-2.5">
            <Pill className={rules.noFault.applicable ? "pill-progress" : "pill-complete"}>Threshold check: {rules.noFault.applicable ? "applies" : "not applicable"}</Pill>
          </div>
          {liability.recoverySources.map((r) => (
            <p key={r.name} title={`${r.name} · ${r.status}, not a fault party. ${r.why}`} className="text-[11px] text-[#5B6B78] leading-snug mt-2 truncate">
              <span className="font-semibold text-ink">{r.name}</span> · {r.status}, not a fault party
            </p>
          ))}
        </>
      ) : <p className="text-xs text-[#5B6B78]">No rules recorded for this jurisdiction — needs attorney review.</p>}
    </div>
  );
}

function PartySummary({ model, rules, inputs, onLaw }: { model: LiabilityModel; rules: Rules; inputs: Inputs; onLaw: (id?: string) => void }) {
  const p = inputs.plaintiffOverride;
  const js = model.authorities.find((a) => a.id === "il-2-1117");
  const jsVerified = js && !model.unverified.some((a) => a.id === js.id);
  const value = (o?: { expected: number; low?: number; high?: number }) => o
    ? <><span className="font-semibold text-ink tabular-nums">{o.expected}%</span>{range(o) && <span className="mono-ref text-[11px] ml-1.5">{range(o)}</span>}</>
    : <span className="text-[11px] text-[#9BA8B4]">Not calculated</span>;
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="eyebrow">Defendant liability</div>
        <span className="text-[11px] text-[#9BA8B4]">Expected · range</span>
      </div>
      <ul className="space-y-1">
        {model.parties.map((pt, i) => (
          <li key={pt.candidate.id} title={`${pt.candidate.name} · ${pt.candidate.role} · ${pt.shown}/${pt.total} elements shown`} className={`flex items-center gap-2 text-xs leading-tight ${pt.choice === "do-not-pursue" ? "opacity-60" : ""}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${pt.choice === "do-not-pursue" ? "bg-line" : PARTY_BAR[i % PARTY_BAR.length]}`} />
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-ink">{pt.candidate.short}</span> <span className="text-[#8A98A3]">· {pt.candidate.roleLabel ?? pt.candidate.role.split("·")[0].trim()}</span></span>
            <span className="shrink-0 text-right">{value(pt.override)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs leading-tight pt-1.5">
          <span className="w-2 h-2 rounded-full shrink-0 bg-[#B91C1C]" />
          <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-[#B91C1C]">Plaintiff</span> <span className="text-[#8A98A3]">· {p ? "Attorney estimate" : "No fault established"}</span></span>
          <span className="shrink-0 text-right">{value(p)}</span>
        </li>
      </ul>
      {rules && js && (
        <p className="text-[11px] text-[#9BA8B4] mt-auto pt-2 leading-snug">
          Joint and several ·{" "}
          <button onClick={() => onLaw(js.id)} className="text-[11px] text-deep hover:text-ink">{js.citation} · {jsVerified ? "Verified" : "Unverified"}</button>
        </p>
      )}
    </div>
  );
}

// ── Fault allocation ──────────────────────────────────────────────────────────

function AllocationBar({ shares, empty }: { shares: { key: string; label: string; value: number; cls: string }[]; empty: string[] }) {
  const total = shares.reduce((n, s) => n + s.value, 0);
  return (
    <div className="flex h-7 rounded-lg overflow-hidden border border-line" role="img"
      aria-label={shares.length ? `Attorney-assessed shares: ${shares.map((s) => `${s.label} ${s.value}%`).join(", ")}` : "Allocation not calculated"}>
      {shares.filter((s) => s.value > 0).map((s) => (
        <div key={s.key} className={`${s.cls} text-white text-xs font-semibold flex items-center px-2 min-w-0`} style={{ width: `${s.value}%` }} title={`${s.label} · ${s.value}%`}>
          {/* Labels only where the segment has room for them. */}
          {s.value >= 6 && <span className="truncate">{s.value >= 15 ? `${s.label} · ${s.value}%` : `${s.value}%`}</span>}
        </div>
      ))}
      {total < 100 && (
        <div className="flex-1 bg-track text-[11px] text-[#8A98A3] flex items-center px-3 min-w-0" title={empty.length ? `Not estimated: ${empty.join(", ")}` : undefined}>
          <span className="truncate">{shares.length ? `Not allocated · ${100 - total}%` : "Allocation not calculated"}</span>
        </div>
      )}
    </div>
  );
}

function FaultAllocation({ model, rules, inputs, liability }: { model: LiabilityModel; rules: Rules; inputs: Inputs; liability: Liability }) {
  const [view, setView] = useState<"defense" | "expected" | "outlook">("expected");
  const parties = model.inAnalysis;
  const p = inputs.plaintiffOverride;
  const defendantShares = parties.filter((x) => x.override).map((x) => ({ key: x.candidate.id, label: x.candidate.short, value: x.override!.expected, cls: PARTY_BAR[model.parties.indexOf(x) % PARTY_BAR.length] }));
  const notEstimated = [...(p ? [] : ["Plaintiff"]), ...parties.filter((x) => !x.override).map((x) => x.candidate.short)];
  const plaintiffShare = (v?: number) => (v !== undefined ? [{ key: "plaintiff", label: "Plaintiff", value: v, cls: "bg-[#B91C1C]" }] : []);
  return (
    <section id="liability-allocation" tabIndex={-1} aria-label="How responsibility may be distributed" className="lg-card px-5 py-3.5 space-y-2.5 scroll-mt-[150px] focus:outline-none">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="eyebrow">Fault allocation · {view === "expected" ? "Expected" : view === "defense" ? "Defense view" : "Litigation outlook"}</div>
          <p className="text-xs text-[#5B6B78] mt-0.5">How responsibility may be distributed — analytical shares guide demand strategy and insurer targeting.</p>
        </div>
        <div role="tablist" aria-label="Allocation view" className="flex items-center gap-1.5">
          {([["defense", "Defense view"], ["expected", "Expected"], ["outlook", "Litigation outlook"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors ${view === k ? "bg-deep text-white border-deep" : "bg-white text-ink border-line hover:bg-wash"}`}>{l}</button>
          ))}
        </div>
      </div>

      {view === "expected" && <AllocationBar shares={[...plaintiffShare(p?.expected), ...defendantShares]} empty={notEstimated} />}
      {view === "defense" && (
        <>
          <AllocationBar shares={plaintiffShare(p?.defense)} empty={p?.defense === undefined ? ["Plaintiff (defense view)"] : []} />
          <p className="text-xs text-[#5B6B78]">Qualitative — how the defense may characterise the current record. {p?.defense !== undefined ? `Attorney's defense-view plaintiff share: ${p.defense}%.` : "Enter a defense-view share in the plaintiff override to show it."}</p>
          <ul className="space-y-2">
            {model.plaintiffFindings.filter((x) => x.status === "Not yet known").map((x) => (
              <li key={x.id} className="flex items-start gap-2 text-sm flex-wrap sm:flex-nowrap"><Pill className="pill-progress">{x.code} · open</Pill><span className="text-[#5B6B78]"><span className="font-semibold text-ink">{x.title}.</span> {x.description}</span></li>
            ))}
            {model.causationOpen.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-sm flex-wrap sm:flex-nowrap"><Pill className="pill-progress">{f.code} · {f.candidate.short}</Pill><span className="text-[#5B6B78]">{f.title}: {f.missing ?? "not yet known"}</span></li>
            ))}
            {parties.map((x) => (
              <li key={x.candidate.id} className="flex items-start gap-2 text-sm flex-wrap sm:flex-nowrap"><Pill className={GREY}>{x.candidate.short}</Pill><span className="text-[#5B6B78]">{x.candidate.couldUndo}</span></li>
            ))}
          </ul>
        </>
      )}
      {view === "outlook" && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-[#5B6B78]">Scenario-based and qualitative. The fault rule's effect is calculated only from the attorney's plaintiff estimate.</p>
          <p className="text-ink">
            {rules ? <>Under {rules.state} {rules.faultRuleLabel.toLowerCase()}: </> : null}
            {model.ruleResult
              ? <>at the expected plaintiff share of {p!.expected}%, recovery would be <span className="font-semibold">{model.ruleResult.label}</span>{model.defenseResult && <>; at the defense view of {p!.defense}%, <span className="font-semibold">{model.defenseResult.label}</span></>}.</>
              : <>no plaintiff fault is on record, so the rule would not reduce recovery unless fault is shown.</>}
          </p>
          <div className="grid grid-cols-3 gap-2 max-w-lg">
            {([["Baseline", model.simulator.baseline], ["Pre-suit scenario", model.simulator.preSuit], ["Litigation outlook", model.simulator.litigation]] as const).map(([l, v]) => (
              <div key={l} className="rounded-lg bg-wash p-2.5 text-center">
                <p className="eyebrow">{l}</p>
                <p className="text-base font-semibold text-ink tabular-nums">{v.shown}/{model.simulator.total}</p>
                <p className="text-[11px] text-[#5B6B78]">elements shown</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One summary line: plaintiff, defendants, recovery sources. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#5B6B78]">
        <span><span className="font-semibold text-[#B91C1C]">Plaintiff</span> · {p ? `${p.expected}% expected${range(p) ? ` · range ${range(p)}` : ""}${p.defense !== undefined ? ` · defense view ${p.defense}%` : ""}` : "Not calculated — no plaintiff fault established on the current record."}</span>
        <span><span className="font-semibold text-ink">Defendants</span> · {defendantShares.length ? defendantShares.map((s) => `${s.label} ${s.value}%`).join(" · ") : "Liability shares not calculated."}</span>
        {liability.recoverySources.map((r) => <span key={r.name}><span className="font-semibold text-ink">{r.name}</span> — {r.status.toLowerCase()}, excluded from fault allocation.</span>)}
      </div>
    </section>
  );
}

// ── Finding cards ─────────────────────────────────────────────────────────────

function EvidenceBlock({ evidence, empty, compact }: { evidence: EvidenceRef[]; empty: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const on = evidence.filter((e) => e.onFile).length;
  return (
    <div className={`${compact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"} border-t border-line`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={!evidence.length} className="w-full flex items-center justify-between gap-2 group disabled:cursor-default">
        <span className="eyebrow group-hover:text-ink transition-colors">Evidence</span>
        {evidence.length > 0 && <ChevronDown className={`w-4 h-4 text-deep transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />}
      </button>
      <div className="flex items-center gap-1.5 text-xs text-[#5B6B78] mt-1">
        <FileText className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        {evidence.length ? `${evidence.length} supporting ${evidence.length === 1 ? "document" : "documents"} · ${on} on file` : empty}
      </div>
      {open && evidence.length > 0 && (
        <ul className="mt-2 space-y-1">
          {evidence.map((e) => (
            <li key={e.file} className="flex items-center justify-between gap-2 text-xs">
              <span className="mono-ref text-ink truncate">{e.file}</span>
              <Pill className={e.onFile ? "pill-complete" : "pill-progress"}>{e.onFile ? "On file" : "Not on file"}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingCard({ code, category, title, fullTitle, party, body, status, statusCls, extra, scenario, evidence, emptyEvidence, onPreview, onInsights, law, reviewed, onDetails, compact }: {
  code: string; category: string; title: string; fullTitle?: string; party?: string; body: React.ReactNode; status: string; statusCls: string; extra?: React.ReactNode; scenario?: ElementStatus;
  evidence: EvidenceRef[]; emptyEvidence: string; onPreview: () => void; onInsights: () => void; law?: { onClick?: () => void; label: string }; reviewed?: string; onDetails: () => void;
  /** Smaller type and spacing; the full description stays in the finding's details panel. */
  compact?: boolean;
}) {
  const btn = compact ? "py-1.5" : "py-2";
  return (
    <div className="lg-card-i rounded-xl border border-line bg-white flex flex-col p-4">
      <div className={`flex items-start justify-between gap-2 ${compact ? "mb-1" : "mb-1.5"}`}>
        <div className={`eyebrow flex items-center gap-1.5 min-w-0 ${compact ? "!text-[10px]" : ""}`}><Scale className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /><span className="truncate">{category}</span></div>
        {party ? <Pill className={`pill-neutral ${compact ? "whitespace-nowrap shrink-0" : ""}`}>{party}</Pill> : <span className="mono-ref text-[11px]">{code}</span>}
      </div>
      <button onClick={onDetails} title={compact ? fullTitle ?? title : undefined}
        className={`text-left leading-snug hover:text-deep transition-colors ${compact ? "text-[13px] font-semibold text-ink truncate" : "card-title"}`}>{title}</button>
      <div className={compact ? "text-xs text-[#5B6B78] mt-0.5 leading-snug line-clamp-2" : "secondary-text mt-1.5 leading-relaxed"}>{body}</div>
      <div className={`flex items-center gap-1.5 flex-wrap ${compact ? "mt-2.5" : "mt-2"}`}>
        <Pill className={statusCls}>{status}</Pill>
        {party && <span className="mono-ref text-[11px]">{code}</span>}
        {extra}
        {scenario && <Pill className="pill-neutral">Scenario: {scenario}</Pill>}
        {reviewed && <Pill className={reviewed === "changed" ? "pill-risk" : "pill-complete"}>{reviewed === "changed" ? "Changed since review" : "Reviewed"}</Pill>}
      </div>
      <EvidenceBlock evidence={evidence} empty={emptyEvidence} compact={compact} />
      <div className={`mt-auto grid grid-cols-2 ${compact ? "pt-2.5 gap-1.5" : "pt-3 gap-2"}`}>
        {law && (
          <button onClick={law.onClick} disabled={!law.onClick} title={law.onClick ? undefined : "No legal authority is recorded for this finding"}
            className={`flex items-center justify-center gap-1.5 px-2 ${btn} bg-tint border border-[#D6F2F7] text-deep rounded-lg text-xs font-semibold hover:bg-[#D6F2F7] disabled:bg-white disabled:border-line disabled:text-[#8A98A3] disabled:cursor-not-allowed transition-colors`}>
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /> {law.label}
          </button>
        )}
        <button onClick={onPreview} className={`flex items-center justify-center gap-1.5 px-2 ${btn} bg-white border border-line text-ink rounded-lg text-xs font-semibold hover:bg-wash transition-colors`}>
          <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview
        </button>
        <button onClick={onInsights} className={`flex items-center justify-center gap-1.5 px-2 ${btn} bg-white border border-line text-deep rounded-lg text-xs font-semibold hover:bg-tint transition-colors ${law ? "col-span-2" : ""}`}>
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Insights
        </button>
      </div>
    </div>
  );
}

type ElementKey = (typeof ELEMENTS)[number]["key"];

function ElementTabs({ active, onChange, counts, label }: { active: ElementKey; onChange: (k: ElementKey) => void; counts: Record<string, number>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-1 px-5 border-b border-line overflow-x-auto">
      {ELEMENTS.map((e) => (
        <button key={e.key} role="tab" aria-selected={active === e.key} onClick={() => onChange(e.key)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active === e.key ? "border-deep text-deep" : "border-transparent text-[#5B6B78] hover:text-ink"}`}>
          {e.label}
          <span className={`text-[11px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums ${active === e.key ? "bg-tint text-deep" : "bg-[#F1F3F5] text-[#5B6B78]"}`}>{counts[e.key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

// ── Estimates ─────────────────────────────────────────────────────────────────

function EstimateForm({ placeholder, current, withDefense, compact, single, onSave, onReset }: {
  placeholder: string; current?: Override; withDefense?: boolean; compact?: boolean;
  /** One expected-share input and the reason; Apply appears once something is entered. */
  single?: boolean;
  onSave: (e: { expected: number; low?: number; high?: number; defense?: number }, reason: string) => string | null; onReset: (reason: string) => string | null;
}) {
  const blank = { expected: "", low: "", high: "", defense: "", reason: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const submit = () => {
    const e = estimateError(f);
    if (e) { setErr(e); return; }
    const r = onSave({ expected: Number(f.expected), low: n(f.low), high: n(f.high), ...(withDefense ? { defense: n(f.defense) } : {}) }, f.reason.trim());
    setErr(r);
    if (!r) setF(blank);
  };
  const reset = () => {
    if (!f.reason.trim()) { setErr("Give a reason for removing the override."); return; }
    const r = onReset(f.reason.trim());
    setErr(r);
    if (!r) setF(blank);
  };
  const fields = [["expected", "Expected %"], ["low", "Low %"], ["high", "High %"], ...(withDefense ? [["defense", "Defense view %"]] : [])] as [keyof typeof blank, string][];
  const input = compact ? `${INPUT} !py-1.5 !text-xs` : INPUT;
  if (single) {
    const touched = f.expected.trim() !== "" || f.reason.trim() !== "";
    return (
      // Fills its card: the reason box takes any spare height.
      <div className="flex-1 flex flex-col gap-2">
        <input inputMode="decimal" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value.replace(/%$/, "") })} placeholder={placeholder}
          aria-label="Expected plaintiff share, percent" className={`${INPUT} !py-1.5 !text-xs`} />
        <label className="flex-1 flex flex-col">
          <span className="text-[11px] text-[#5B6B78] mb-1">Reason (required)</span>
          <textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} className={`${INPUT} !py-1.5 !text-xs resize-y flex-1 min-h-[56px]`} />
        </label>
        {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
        {(touched || current) && (
          <div className="flex justify-end gap-2">
            {current && <button onClick={reset} className={BTN_S}>Reset to model</button>}
            {touched && <button onClick={submit} className={BTN_P}>Apply override</button>}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className={`grid ${compact ? "gap-1.5" : "gap-2"} ${withDefense ? "grid-cols-2" : "grid-cols-3"}`}>
        {fields.map(([k, l]) => (
          <label key={k} className="block min-w-0">
            <span className="text-[11px] text-[#5B6B78] whitespace-nowrap">{compact ? l.replace(" view", "") : l}</span>
            <input inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={k === "expected" ? placeholder : ""} className={input} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-[11px] text-[#5B6B78]">Reason (required)</span>
        <textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} className={`${input} resize-y`} />
      </label>
      {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
      <div className="flex justify-end gap-2">
        {current && <button onClick={reset} className={BTN_S}>Reset to model</button>}
        <button onClick={submit} className={BTN_P}>Apply override</button>
      </div>
    </div>
  );
}

const overrideLine = (o?: Override) =>
  o ? `${o.expected}%${range(o) ? ` (${range(o)})` : ""} · ${o.by}, ${o.at} · “${o.reason}” · replaced ${o.previous ? `${o.previous.expected}%` : "no calculated value"}` : "";

/** The attorney's shares across plaintiff and defendants may not exceed 100%. */
function totalWith(inputs: Inputs, key: string, value: number) {
  const plaintiff = key === "plaintiff" ? value : inputs.plaintiffOverride?.expected ?? 0;
  const defs = Object.entries(inputs.defendantOverrides).reduce((n, [k, o]) => n + (k === key ? 0 : o.expected), 0) + (key !== "plaintiff" ? value : 0);
  return plaintiff + defs;
}
const OVER_100 = "Plaintiff and defendant shares together cannot exceed 100%.";

// ── L4 · Plaintiff negligence ────────────────────────────────────────────────

function PlaintiffModule({ model, liability, inputs, save, rules, onOpen, onLaw, onDetails }: {
  model: LiabilityModel; liability: Liability; inputs: Inputs; save: Save; rules: Rules;
  onOpen: (f: PlaintiffFinding, view: "preview" | "insights") => void; onLaw: (id?: string) => void; onDetails: (f: PlaintiffFinding) => void;
}) {
  const [tab, setTab] = useState<ElementKey>("duty");
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e.key, model.plaintiffFindings.filter((p) => p.element === e.key).length]));
  const list = model.plaintiffFindings.filter((p) => p.element === tab);
  const [item, setItem] = useState(model.plaintiffFindings.find((p) => p.element === "breach")?.id ?? model.plaintiffFindings[0]?.id);
  const selected = model.plaintiffFindings.find((p) => p.id === item) ?? model.plaintiffFindings[0];
  const o = inputs.plaintiffOverride;
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    // Marking the conduct items reviewed lives on the L7 sign-off checklist.
    <Section id="liability-plaintiff" eyebrow="L4 · Plaintiff negligence" title={`${liability.plaintiff.name} · what the defense can point to`}
      titleClassName="text-base font-medium text-ink"
      right={
        <span className="text-[11px] text-[#8A98A3] self-center">
          Defense view <span className="font-semibold text-[#B91C1C]">{o?.defense !== undefined ? `${o.defense}%` : "—"}</span> → after playbook <span className="font-semibold text-[#15803D]">{o ? `${o.expected}%` : "—"}</span>
          {!o && <span className="text-[#8A98A3]"> · not calculated</span>}
        </span>
      }>
      <ElementTabs active={tab} onChange={setTab} counts={counts} label="Plaintiff negligence elements" />
      <div className="p-4 bg-offwhite">
        {list.length === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No {ELEMENTS.find((e) => e.key === tab)!.label.toLowerCase()} check applies to her on the current record.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((p) => (
              <FindingCard key={p.id} compact code={p.code} category={p.category} title={p.shortTitle ?? p.title} fullTitle={p.title} body={p.summary ?? p.description}
                status={p.status} statusCls={PLAINTIFF_PILL[p.status]} evidence={p.evidence}
                extra={p.element === "breach" ? <span className="text-[11px] text-[#5B6B78]">Share: not calculated</span> : undefined}
                emptyEvidence={p.status === "Not applicable" ? "No documents needed" : p.moduleSource ? `From ${p.moduleSource}` : "No documents linked"}
                onPreview={() => onOpen(p, "preview")} onInsights={() => onOpen(p, "insights")} onDetails={() => onDetails(p)}
                law={p.status === "Not applicable" ? undefined : { label: p.element === "breach" ? "Violated law" : "Triggering law", onClick: p.authorityId ? () => onLaw(p.authorityId) : undefined }} />
            ))}
          </div>
        )}
      </div>
      {/* Reduction playbook (left, ~2/3) beside the plaintiff estimate (right, ~1/3); stacked on small screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start lg:items-stretch p-4 border-t border-line">
        {/* Plaintiff estimate, then the attorney override, as two small cards (reference 6).
            On desktop the column takes the playbook's height; the override card fills the rest. */}
        <div className="flex flex-col gap-4 min-w-0 lg:col-start-2 lg:row-start-1">
        <div className="rounded-xl border border-line px-4 py-3.5">
          <h3 className="eyebrow mb-2">Plaintiff estimate</h3>
          <div className="grid grid-cols-3 text-center">
            {([["Low", o?.low], ["Expected", o?.expected], ["High", o?.high]] as const).map(([l, v]) => (
              <div key={l}>
                <p className={`text-lg font-semibold tabular-nums leading-tight ${v === undefined ? "text-[#9BA8B4]" : l === "High" ? "text-[#B91C1C]" : l === "Low" ? "text-[#15803D]" : "text-ink"}`}>{pct(v)}</p>
                <p className="text-[11px] text-[#5B6B78]">{l}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#5B6B78] leading-snug mt-4" title={o ? overrideLine(o) : undefined}>
            {o ? `Attorney override · ${o.by}.` : "No validated model — not calculated."}
            {rules && <> Legal risk: <span className="font-semibold text-ink">{rules.threshold.toLowerCase()}</span>{model.ruleResult ? ` (at ${o!.expected}%: ${model.ruleResult.label})` : ""}.</>}
          </p>
        </div>
        <div className="rounded-xl border border-line px-4 py-3.5 lg:flex-1 flex flex-col">
          <h3 className="eyebrow mb-2.5">Attorney override</h3>
          <div className="lg:flex-1 flex flex-col">
              <EstimateForm placeholder="e.g. Expected 5%" current={o} single
              onSave={(est, reason) => {
                if (totalWith(inputs, "plaintiff", est.expected) > 100) return OVER_100;
                return save((p) => ({ ...p, plaintiffOverride: { ...est, reason, by: REVIEWER, at: stampNow(), previous: p.plaintiffOverride ? { expected: p.plaintiffOverride.expected, low: p.plaintiffOverride.low, high: p.plaintiffOverride.high, defense: p.plaintiffOverride.defense } : null } }),
                  { action: "Plaintiff estimate overridden", from: o ? `${o.expected}%` : "Not calculated", to: `${est.expected}%`, reason }, "Plaintiff estimate saved as an attorney override.") ? null : "Not saved.";
              }}
              onReset={(reason) => save((p) => ({ ...p, plaintiffOverride: undefined }), { action: "Plaintiff override removed", from: o ? `${o.expected}%` : undefined, to: "Not calculated", reason }, "Override removed — the model value (not calculated) is shown.") ? null : "Not saved."} />
          </div>
        </div>
        </div>

        <div className="rounded-xl border border-line px-4 py-3 min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <h3 className="eyebrow text-deep">Reduction playbook</h3>
            <label className="flex items-center gap-2 text-[11px] text-[#5B6B78] min-w-0 max-w-full">Item
              <select value={selected?.id} onChange={(e) => { setItem(e.target.value); setOpenRow(null); }} className="px-2 py-1 rounded-lg border border-line text-xs bg-white text-ink max-w-[280px] min-w-0 w-full sm:w-auto">
                {model.plaintiffFindings.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}
              </select>
            </label>
          </div>
          {selected && (
            <ol className="divide-y divide-line">
              {selected.rows.map((pb, i) => {
                const open = openRow === pb.factor;
                return (
                  <li key={pb.factor}>
                    {/* One line per factor; the row opens to its evidence and authority. */}
                    <button onClick={() => setOpenRow(open ? null : pb.factor)} aria-expanded={open}
                      className="w-full py-1.5 flex items-center gap-2.5 text-left group">
                      <span className="text-[11px] text-[#8A98A3] tabular-nums w-3.5 shrink-0">{i + 1}</span>
                      <span className={`min-w-0 flex-1 text-xs text-ink leading-snug ${open ? "" : "truncate"}`}><span className="font-semibold">{pb.factor}</span> · {pb.explanation}</span>
                      <Pill className={EFFECT_PILL[pb.effect]}>{pb.effect}</Pill>
                    </button>
                    {open && (
                      <p className="pl-6 pb-2 text-[11px] text-[#5B6B78] leading-snug">
                        Evidence: {pb.evidence}{pb.followUp && <> · Next: {pb.followUp}</>}{pb.origin === "record" && <span className="text-[#8A98A3]"> · from the record</span>}
                        {pb.authorityId && <> · <button onClick={() => onLaw(pb.authorityId)} className="text-[11px] font-semibold text-deep hover:text-ink">{model.authorities.find((a) => a.id === pb.authorityId)?.citation}</button></>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── L5 · Defendant negligence ────────────────────────────────────────────────

function DefendantModule({ model, inputs, save, onOpen, onLaw, onDetails, footer }: {
  model: LiabilityModel; inputs: Inputs; save: Save; onOpen: (f: DefendantFinding, view: "preview" | "insights") => void; onLaw: (id?: string) => void; onDetails: (f: DefendantFinding) => void;
  /** Shown at the foot of the card, beneath the playbook and estimates (Other parties). */
  footer?: React.ReactNode;
}) {
  const all = model.parties.map((p) => p.candidate.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(all));
  const [tab, setTab] = useState<ElementKey>("duty");
  const filtered = model.defendantFindings.filter((f) => [...selected].some((id) => model.forParty(f, id)));
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e.key, filtered.filter((f) => f.kind === e.key).length]));
  const list = filtered.filter((f) => f.kind === tab);
  const allOn = selected.size === all.length;
  // A party chip shows that defendant alone — switching replaces the selection,
  // so findings from the previous party never carry over.
  const toggle = (id: string) => setSelected(new Set([id]));
  const focusId = !allOn && selected.size === 1 ? [...selected][0] : undefined;
  const reviewState = (f: DefendantFinding) => {
    const r = inputs.reviewed[f.id];
    if (!r) return undefined;
    return r.signature === model.snapshot[f.id] ? "reviewed" : "changed";
  };
  return (
    // Status and evidence are changed in the Defendant Analysis, not here.
    <Section id="liability-defendants" eyebrow="L5 · Defendant negligence" title="Defendants from Defendants module"
      titleClassName="text-base font-medium text-ink"
      right={
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(new Set(all))} disabled={allOn} className={BTN_S}>Select all</button>
          <button onClick={() => setSelected(new Set())} disabled={selected.size === 0} className={BTN_S}>Deselect all</button>
        </div>
      }>
      <div className="px-5 pt-3 flex flex-wrap gap-2" role="group" aria-label="Defendant filter">
        <button onClick={() => setSelected(new Set(all))} aria-pressed={allOn}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${allOn ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:bg-wash"}`}>All defendants</button>
        {model.parties.map((p) => {
          const on = selected.has(p.candidate.id) && !allOn;
          return (
            <button key={p.candidate.id} onClick={() => toggle(p.candidate.id)} aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-ink text-white border-ink" : "bg-white text-ink border-line hover:bg-wash"} ${p.choice === "do-not-pursue" ? "opacity-60" : ""}`}>
              {p.candidate.short}{p.candidate.identified === "Role only" && " · role only"}
            </button>
          );
        })}
      </div>
      <div className="mt-2"><ElementTabs active={tab} onChange={setTab} counts={counts} label="Defendant negligence elements" /></div>
      <div className="p-4 bg-offwhite">
        {selected.size === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No defendants selected. Choose one above, or Select all.</p>
        ) : list.length === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No {ELEMENTS.find((e) => e.key === tab)!.label.toLowerCase()} element is recorded for the selected {selected.size === 1 ? "defendant" : "defendants"}.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((f) => (
              // The card shows the short summary; the full description and what is missing open in the finding panel.
              <FindingCard key={f.id} compact code={f.code} category={f.category} title={f.shortTitle ?? f.title} fullTitle={f.title} party={f.shared ? "All" : f.candidate.short}
                body={<span title={[f.description, f.missing && f.status !== "Shown" ? `Missing: ${f.missing}` : ""].filter(Boolean).join(" ")}>{f.summary ?? f.description ?? (f.note ? `Record: ${f.note}.` : "No source recorded.")}</span>}
                status={f.status} statusCls={ELEMENT_PILL[f.status]} scenario={f.scenarioStatus} evidence={f.evidence}
                emptyEvidence={f.status === "Not yet known" ? "No documents yet" : "No documents linked"}
                onPreview={() => onOpen(f, "preview")} onInsights={() => onOpen(f, "insights")} onDetails={() => onDetails(f)}
                law={{ label: f.kind === "breach" ? "Violated law" : "Triggering law", onClick: f.authorityId ? () => onLaw(f.authorityId) : undefined }} reviewed={reviewState(f)} />
            ))}
          </div>
        )}
      </div>
      <Strengthening model={model} inputs={inputs} save={save} focusId={focusId} />
      {footer}
    </Section>
  );
}

function Strengthening({ model, inputs, save, focusId }: { model: LiabilityModel; inputs: Inputs; save: Save; focusId?: string }) {
  const [pid, setPid] = useState(model.inAnalysis[0]?.candidate.id ?? model.parties[0]?.candidate.id);
  // Follows the defendant chosen in the L5 filter.
  useEffect(() => { if (focusId && model.parties.some((p) => p.candidate.id === focusId)) setPid(focusId); }, [focusId, model.parties]);
  const rows = model.strengtheningFor(pid);
  const [openRow, setOpenRow] = useState<string | null>(null);
  return (
    // Strengthening playbook (left, ~3/5) beside the defendant estimates and override (right).
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start lg:items-stretch p-4 border-t border-line">
      <div className="rounded-xl border border-line px-4 py-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="eyebrow text-deep">Strengthening playbook</h3>
          <label className="flex items-center gap-2 text-[11px] text-[#5B6B78]">Defendant
            <select value={pid} onChange={(e) => { setPid(e.target.value); setOpenRow(null); }} className="px-2 py-1 rounded-lg border border-line text-xs bg-white text-ink">
              {model.parties.map((p) => <option key={p.candidate.id} value={p.candidate.id}>{p.candidate.short}</option>)}
            </select>
          </label>
        </div>
        <ol className="divide-y divide-line">
          {rows.map((r, i) => {
            const open = openRow === r.title;
            return (
              <li key={r.title}>
                {/* One line per item; the row opens to its evidence and next step. */}
                <button onClick={() => setOpenRow(open ? null : r.title)} aria-expanded={open} className="w-full py-1.5 flex items-center gap-2.5 text-left">
                  <span className="text-[11px] text-[#8A98A3] tabular-nums w-3.5 shrink-0">{i + 1}</span>
                  <span className={`min-w-0 flex-1 text-xs text-ink leading-snug ${open ? "" : "truncate"}`}><span className="font-semibold">{r.title}</span> · {r.explanation}</span>
                  <Pill className={`${TONE_PILL[r.tone]} whitespace-nowrap shrink-0`}>{r.status}</Pill>
                </button>
                {open && <p className="pl-6 pb-2 text-[11px] text-[#5B6B78] leading-snug">Evidence: {r.evidence}{r.followUp && <> · Next: {r.followUp}</>}</p>}
              </li>
            );
          })}
        </ol>
      </div>
      {/* Estimates on top, override below; the override's reason box takes any spare
          height so the column ends level with the playbook. */}
      <div className="flex flex-col gap-3 min-w-0">
        <div id="liability-estimates" className="rounded-xl border border-line px-4 py-3">
          <h3 className="eyebrow mb-1.5">Defendant estimates</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-[#8A98A3] text-[10px] uppercase tracking-wide"><th className="text-left font-medium py-1">Party</th><th className="text-right font-medium py-1">Expected</th><th className="text-right font-medium py-1 pl-4 w-16">Range</th></tr></thead>
            <tbody>
              {model.inAnalysis.map((p) => (
                <tr key={p.candidate.id} title={p.override ? overrideLine(p.override) : undefined}>
                  <td className="py-1 text-ink truncate max-w-0 w-full">{p.candidate.short}</td>
                  <td className="py-1 text-right tabular-nums font-semibold whitespace-nowrap">{p.override ? `${p.override.expected}%` : <span className="font-normal text-[11px] text-[#9BA8B4]">Not calculated</span>}</td>
                  <td className="py-1 pl-4 text-right tabular-nums text-[#5B6B78] mono-ref text-[11px]">{range(p.override) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {model.inAnalysis.length > 0 && <DefendantOverride model={model} inputs={inputs} save={save} />}
      </div>
    </div>
  );
}

/** The defendant override as one line — "<party> <n>%" — and a reason. Saved on
 *  Enter in the line, or Ctrl/⌘+Enter in the reason, through the same checks and
 *  save as the estimate form. */
function DefendantOverride({ model, inputs, save }: { model: LiabilityModel; inputs: Inputs; save: Save }) {
  const [line, setLine] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const parties = model.inAnalysis;
  const example = parties[0]?.candidate.short ?? "Party";
  const submit = () => {
    const text = line.trim().toLowerCase();
    // The party whose name the line starts with — the longest match wins.
    const target = [...parties]
      .filter((p) => [p.candidate.short, p.candidate.name].some((n) => text.startsWith(n.toLowerCase()) || text.startsWith(n.toLowerCase().split(" ")[0])))
      .sort((a, b) => b.candidate.short.length - a.candidate.short.length)[0];
    if (!target) { setErr(`Start with a party: ${parties.map((p) => p.candidate.short).join(", ")}.`); return; }
    const pct = text.match(/(\d+(?:\.\d+)?)\s*%?\s*$/)?.[1] ?? "";
    const e = estimateError({ expected: pct, low: "", high: "", reason });
    if (e) { setErr(e); return; }
    const expected = Number(pct);
    if (totalWith(inputs, target.candidate.id, expected) > 100) { setErr(OVER_100); return; }
    const prev = inputs.defendantOverrides[target.candidate.id];
    const ok = save((p) => ({ ...p, defendantOverrides: { ...p.defendantOverrides, [target.candidate.id]: { expected, reason: reason.trim(), by: REVIEWER, at: stampNow(), previous: prev ? { expected: prev.expected, low: prev.low, high: prev.high } : null } } }),
      { action: `Estimate overridden · ${target.candidate.short}`, from: prev ? `${prev.expected}%` : "Not calculated", to: `${expected}%`, reason: reason.trim() }, `${target.candidate.short} estimate saved as an attorney override.`);
    if (!ok) { setErr("Not saved."); return; }
    setErr(null); setLine(""); setReason("");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} title="Press Enter to apply (Ctrl+Enter in the reason)"
      className="rounded-xl border border-line px-4 py-3 lg:flex-1 flex flex-col gap-1.5">
      <h3 className="eyebrow mb-0.5">Attorney override</h3>
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={`e.g. ${example} 15%`} aria-label="Override: party and expected percentage"
        className={`${INPUT} !py-1.5 !text-xs`} />
      <label className="flex-1 flex flex-col">
        <span className="text-[11px] text-[#5B6B78] mb-1">Reason (required)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          className={`${INPUT} !py-1.5 !text-xs resize-y flex-1 min-h-[56px]`} />
      </label>
      {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
    </form>
  );
}

// ── Other parties ─────────────────────────────────────────────────────────────

function OtherParties({ model, liability, onOpenDefendants, onOpenJurisdiction }: { model: LiabilityModel; liability: Liability; onOpenDefendants?: (n: string) => void; onOpenJurisdiction?: () => void }) {
  const link = (label: string, onClick?: () => void) => <button onClick={onClick} className="text-[11px] font-semibold text-deep hover:text-ink underline underline-offset-2 text-left leading-snug">{label}</button>;
  const rows = [
    ...model.parties.filter((p) => p.choice !== "name").map((p) => ({
      name: p.candidate.name, sub: p.candidate.role, status: p.choice === "investigate" ? "Under investigation" : "Not pursued",
      cls: p.choice === "investigate" ? "pill-progress" : GREY, why: p.candidate.summary, short: p.candidate.summaryShort,
      action: link("Review in Defendant Analysis", () => onOpenDefendants?.(p.candidate.name)),
    })),
    ...liability.recoverySources.map((r) => ({ name: r.name, sub: "Insurance", status: r.status, cls: "pill-neutral", why: r.why, short: r.short, action: <span className="text-[11px] text-[#5B6B78] leading-snug">{r.next}</span> })),
    ...liability.notPursued.map((n) => ({ name: n.name, sub: "Named in the record", status: "Not pursued", cls: GREY, why: n.why, short: n.short, action: link("Review in Jurisdiction module", onOpenJurisdiction) })),
  ];
  return (
    // Unresolved parties and recovery sources that are not fault parties; full reasons on hover.
    // Sits at the foot of the L5 card, set off by a divider rather than its own card.
    <div id="liability-other-parties" tabIndex={-1} className="border-t border-line scroll-mt-[150px] focus:outline-none">
      <h3 className="px-4 pt-3 pb-2 text-sm font-medium text-ink">Other parties</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed">
          <colgroup><col className="w-[30%]" /><col className="w-[17%]" /><col /><col className="w-[18%]" /></colgroup>
          <thead className="bg-wash border-b border-line">
            <tr>{["Other parties", "Status", "Why surfaced", "Action"].map((h) => <th key={h} className="px-4 py-2 text-left eyebrow !text-[10px]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2.5 align-top"><p className="text-[13px] font-semibold text-ink leading-snug">{r.name}</p><p className="text-[11px] text-[#8A98A3] truncate" title={r.sub}>{r.sub}</p></td>
                <td className="px-4 py-2.5 align-top"><Pill className={`${r.cls} whitespace-nowrap`}>{r.status}</Pill></td>
                <td className="px-4 py-2.5 align-top text-xs text-[#5B6B78] leading-snug"><span className="line-clamp-2" title={r.why}>{r.short ?? r.why}</span></td>
                <td className="px-4 py-2.5 align-top">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Negligence timeline ───────────────────────────────────────────────────────
// The Case Timeline Overview's vertical treatment: a rail of markers on the
// left, the date beside it, and each event in its own white card.

const PARTY_DOT: Record<string, string> = {
  "Facility staff": "bg-deep", "Cook County Medical Center": "bg-brand", "Treating providers": "bg-[#6FA8BC]", Plaintiff: "bg-[#B91C1C]", Firm: "bg-soft",
};
const PARTY_RING: Record<string, string> = {
  "Facility staff": "border-deep", "Cook County Medical Center": "border-brand", "Treating providers": "border-[#6FA8BC]", Plaintiff: "border-[#B91C1C]", Firm: "border-soft",
};
const dot = (party: string) => PARTY_DOT[party] ?? "bg-[#9BA8B4]";
const ring = (party: string) => PARTY_RING[party] ?? "border-[#9BA8B4]";

type TimelineRow = LiabilityModel["timeline"][number];

function NegligenceTimeline({ model, onFinding, onOpenDocs }: { model: LiabilityModel; onFinding: (f: DefendantFinding) => void; onOpenDocs: LiabilityWorkspaceProps["onOpenDocs"] }) {
  const phases = [
    { key: "before", label: "Upstream · before the day" },
    { key: "incident", label: `Incident · ${model.fmtIso(model.anchor)} · exact times not on record` },
    { key: "treatment", label: "After · treatment and harm" },
    { key: "evidence", label: "After · evidence and leverage, not causation" },
  ] as const;
  const parties = Array.from(new Set(model.timeline.filter((t) => t.kind !== "window").map((t) => t.party)));

  const Event = ({ t, first, last }: { t: TimelineRow; first: boolean; last: boolean }) => {
    const on = t.evidence.filter((e) => e.onFile);
    const isWindow = t.kind === "window";
    const dateLabel = isWindow ? "window" : t.date.replace(/, \d{4}(,.*)?$/, "");
    const impact = t.kind === "impact";
    const evidencePhase = t.phase === "evidence";
    // Filled party marker; the causal window and the harm get their own.
    const marker = isWindow ? "bg-[#F5C26B]" : impact ? "bg-deep" : evidencePhase ? "bg-white border-2 border-[#9BA8B4]" : dot(t.party);
    const rail = isWindow ? "w-1 bg-[#F5C26B]" : "w-px bg-line";
    return (
      <li className="grid grid-cols-[12px_minmax(0,1fr)] sm:grid-cols-[56px_12px_minmax(0,1fr)] gap-x-3">
        {/* Date — the record gives days, not times. On small screens it moves into the card. */}
        <span className={`hidden sm:block mono-ref text-[11px] text-right pt-2 ${isWindow ? "text-[#B45309]" : "text-ink"}`}>{dateLabel}</span>
        {/* Rail: an unbroken line through every marker in the group */}
        <div className="flex flex-col items-center">
          <div className={`h-2.5 ${first ? "" : rail}`} />
          <div className={`w-3 h-3 rounded-full shrink-0 ring-2 ring-white ${marker}`} />
          {!last && <div className={`flex-1 ${rail}`} />}
        </div>
        <div className={last ? "" : "pb-2.5"}>
          {isWindow ? (
            <div className="rounded-lg border border-[#F5D9A8] bg-[#FFF8EC] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#B45309]"><span className="sm:hidden mono-ref mr-1.5 normal-case">{model.fmtIso(t.iso).replace(/, \d{4}$/, "")} ·</span>{t.title}</span>
                <span className="mono-ref text-[11px] text-[#B45309]">Causal window</span>
              </div>
              <p className="text-[11px] text-[#5B6B78] mt-0.5 leading-snug line-clamp-2" title={t.detail}>{t.detail}</p>
            </div>
          ) : (
            <div className={`rounded-lg border px-3 py-2 transition-colors ${impact ? "bg-deep border-deep" : evidencePhase ? "bg-white border-dashed border-line" : "bg-white border-line hover:border-soft"}`}>
              <div className="flex items-center justify-between gap-x-3 gap-y-0.5 flex-wrap">
                <span className={`text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5 ${impact ? "text-white/85" : "text-deep"}`}>
                  <span className={`sm:hidden mono-ref normal-case ${impact ? "text-white" : "text-ink"}`}>{dateLabel} ·</span>
                  {impact ? "Harm · " : ""}{t.party}
                </span>
                {t.findings.length > 0 && (
                  <div className="flex flex-wrap gap-x-2">
                    {t.findings.map((f) => (
                      <button key={f.id} onClick={() => onFinding(f)} title={f.title} className={`mono-ref text-[11px] hover:underline ${impact ? "text-white" : "text-deep"}`}>{f.code} · {f.shared ? "All" : f.candidate.short}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className={`text-[13px] font-semibold leading-snug mt-0.5 ${impact ? "text-white" : "text-ink"}`}>{t.title}</p>
              {t.detail && <p className={`text-[11px] leading-snug mt-0.5 truncate ${impact ? "text-white/90" : "text-[#5B6B78]"}`} title={t.detail}>{t.detail}</p>}
              {(t.origin !== "record" || t.conflict || on.length > 0) && (
                <div className={`flex items-center gap-x-2.5 gap-y-1 flex-wrap mt-1 text-[11px] ${impact ? "text-white/85" : "text-[#8A98A3]"}`}>
                  {t.origin !== "record" && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" strokeWidth={1.75} />
                      {t.evidence.length === 0 ? "No docs linked" : `${t.evidence.length} ${t.evidence.length === 1 ? "doc" : "docs"} · ${on.length} on file`}
                    </span>
                  )}
                  {t.origin === "manual" && <span>Added by attorney</span>}
                  {t.conflict && <span className="text-[#B45309]" title={`Disputed date · ${t.conflict}`}>Disputed date</span>}
                  {on.length > 0 && (
                    <button onClick={() => onOpenDocs(on.map((e) => e.file), "preview", { contextType: "Timeline Event", reference: t.title })} className={`text-[11px] font-semibold inline-flex items-center gap-1 ${impact ? "text-white" : "text-deep hover:text-ink"}`}>
                      <Eye className="w-3 h-3" strokeWidth={1.75} /> Preview
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <Section id="liability-timeline" eyebrow="Negligence timeline" title="How each breach led to the impact" titleClassName="text-base font-medium text-ink" className="flex flex-col"
      right={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5B6B78]">
          {parties.map((p) => <span key={p} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot(p)}`} />{p}</span>)}
          {model.timeline.some((t) => t.kind === "window") && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-[#F5C26B]" />Causal window</span>}
        </div>
      }>
      <div className="px-5 py-4 space-y-4 flex-1">
        {phases.map((ph) => {
          const items = model.timeline.filter((t) => t.phase === ph.key);
          return (
            <div key={ph.key}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink pb-1.5 mb-2.5 border-b border-[#C5CED6]">{ph.label}</div>
              {items.length === 0
                ? <p className="text-xs text-[#8A98A3] py-2 text-center border border-dashed border-line rounded-lg">{ph.key === "evidence" ? "No requests or preservation decisions recorded yet." : "No events on the timeline in this phase."}</p>
                : <ol>{items.map((t, i) => <Event key={t.id} t={t} first={i === 0} last={i === items.length - 1} />)}</ol>}
            </div>
          );
        })}
      </div>
      <p className="px-5 py-2.5 border-t border-line bg-wash text-xs text-ink leading-snug" title={model.reading}><span className="font-semibold">Reading it:</span> {model.readingShort}</p>
    </Section>
  );
}

// ── Right column ──────────────────────────────────────────────────────────────

function Panel({ id, eyebrow, title, badge, className = "", children }: { id?: string; eyebrow: string; title?: string; badge?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className={`lg-card overflow-hidden scroll-mt-[150px] focus:outline-none ${className}`}>
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="eyebrow">{eyebrow}</h2>
          {title && <p className="card-title mt-0.5">{title}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function requestLetter(r: RecommendationView, caseData: LiabilityWorkspaceProps["caseData"]) {
  return [
    "DRAFT — for attorney review. Not sent.",
    "",
    `Re: ${caseData.caseName} (${caseData.caseId})`,
    `To: ${r.custodian}`,
    "",
    r.draft.kind === "expert" ? `Request for expert review: ${r.title}` : `Request: ${r.title}`,
    "",
    `Purpose: ${r.why}`,
    "",
    r.draft.kind === "search"
      ? "Run and record the search described above, with the date searched and the record retrieved."
      : r.draft.kind === "expert"
        ? "Please review the enclosed records and state whether, to a reasonable degree of medical certainty, timely escalation would have changed the outcome."
        : "Please produce the records described above and preserve all related records, including electronic records, pending this matter.",
    "",
    "Retention or preservation deadline: not verified — confirm before relying on any date.",
    "",
    `Prepared ${new Date().toLocaleString("en-US")}`,
  ];
}

function Recommendations({ model, caseData, save }: { model: LiabilityModel; caseData: LiabilityWorkspaceProps["caseData"]; save: Save }) {
  const urgent = model.recommendations.filter((r) => r.priority === "Urgent" && r.state !== "received").length;
  return (
    <Panel id="liability-recommendations" eyebrow="Recommendations" title="Evidence to request now" badge={urgent ? <Pill className="pill-risk">{urgent} urgent</Pill> : undefined}
      className="xl:h-full flex flex-col">
      <ul className="divide-y divide-line xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
        {model.recommendations.map((r) => {
          const codes = r.answers.map((a) => model.defendantFindings.find((f) => f.id === a)?.code).filter(Boolean);
          return (
            <li key={r.id} className={`px-4 py-2.5 ${r.state === "received" ? "bg-wash" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Pill className={r.state === "received" ? "pill-complete" : PRIORITY_PILL[r.priority]}>{r.state === "received" ? "Received" : r.priority}</Pill>
                <span className="text-[11px] text-[#5B6B78] text-right">{codes.length ? `Answers ${codes.join(", ")}` : r.preSuit === "Yes" ? "Pre-suit" : r.preSuit}</span>
              </div>
              {/* Title, source and reason are clamped to the reference's line counts; hover shows the full text. */}
              <p className="text-xs font-semibold text-ink mt-1.5 leading-snug truncate" title={r.title}>{r.shortTitle ?? r.title}</p>
              <p className="text-[11px] text-[#8A98A3] leading-snug truncate" title={`From ${r.custodian} · ${r.method}`}>{r.custodian} · {r.method}</p>
              <p className="text-[11px] text-[#5B6B78] mt-0.5 leading-snug break-words line-clamp-2" title={`${r.why} Deadline: requires verification.`}>{r.short ?? r.why}</p>
              {r.state !== "open" && (
                <p className="text-[11px] text-[#8A98A3] mt-1 truncate">
                  {r.state === "received" ? <>On file: <span className="mono-ref">{r.receivedFile}</span></> : `Requested ${r.requestedAt} · awaiting the record`}
                </p>
              )}
              {r.state !== "received" && (
                <div className="flex items-center gap-1.5 mt-2">
                  <button onClick={() => downloadTextFile(`${safeFileName(r.title)}_DRAFT.txt`, requestLetter(r, caseData))} className={`${r.priority === "Urgent" ? BTN_P : BTN_S} ${REC_BTN}`}>
                    <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> {r.draft.label}
                  </button>
                  {r.state === "open" && (
                    <button onClick={() => save((p) => ({ ...p, requested: { ...p.requested, [r.id]: { at: stampNow(), by: REVIEWER } } }), { action: "Request recorded", detail: r.title }, `Recorded as requested: ${r.title}. Nothing was sent from here.`)} className={`${BTN_S} ${REC_BTN}`}>
                      Record as requested
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Research({ liability }: { liability: Liability }) {
  // Google Scholar's case-law search, restricted to Illinois courts. Only the
  // generic query is sent — no names or case details.
  const scholar = `https://scholar.google.com/scholar?hl=en&as_sdt=4,14&q=${encodeURIComponent(liability.research.webQuery)}`;
  return (
    <Panel eyebrow="Research" badge={<Pill className={GREY}>Partly connected</Pill>}>
      <div className="p-4 space-y-2">
        <button disabled title={`No case-profile database is connected to this application. Query: ${liability.research.profileQuery}`} className="w-full text-left rounded-lg border border-line px-3 py-2 opacity-60 cursor-not-allowed">
          <span className="text-[13px] font-semibold text-ink flex items-center gap-1.5"><Search className="w-3.5 h-3.5" strokeWidth={1.75} /> Fetch matching case profiles</span>
          <span className="block text-[11px] text-[#B45309] truncate">Not connected — no case-profile database</span>
        </button>
        <a href={scholar} target="_blank" rel="noreferrer" title="Illinois case law: delayed stroke escalation in care facilities. Opens Google Scholar; no case details are sent." className="block w-full text-left rounded-lg border border-line px-3 py-2 hover:bg-wash transition-colors">
          <span className="text-[13px] font-semibold text-ink flex items-center gap-1.5"><Search className="w-3.5 h-3.5" strokeWidth={1.75} /> Web research <ExternalLink className="w-3 h-3 text-deep" strokeWidth={1.75} /></span>
          <span className="block text-[11px] text-[#5B6B78] truncate">Illinois case law · Google Scholar, no case details sent</span>
        </a>
        <p className="text-[11px] text-[#8A98A3]" title="Nothing found there is added here automatically.">Findings stay unverified until reviewed.</p>
      </div>
    </Panel>
  );
}

function Exceptions({ liability, onLaw }: { liability: Liability; onLaw: (id?: string) => void }) {
  return (
    <Panel id="liability-exceptions" eyebrow="Fault-rule exceptions · Illinois">
      <ul className="divide-y divide-line">
        {liability.exceptions.map((e) => (
          <li key={e.name} className="px-4 py-2 flex items-center justify-between gap-2">
            {/* One line of detail; the full text is on hover, the authority behind the book icon. */}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                {e.name}
                {e.authorityId && <button onClick={() => onLaw(e.authorityId)} title="Authority · unverified" aria-label={`Authority for ${e.name} · unverified`} className="text-deep hover:text-ink"><BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /></button>}
              </p>
              <p className="text-[11px] text-[#5B6B78] truncate" title={e.detail}>{e.detail}</p>
            </div>
            <Pill className={`${EXCEPTION_PILL[e.status]} whitespace-nowrap shrink-0`}>{e.status}</Pill>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2.5 text-[11px] text-[#8A98A3] border-t border-line">Rated from the record; not verified.</p>
    </Panel>
  );
}

function Simulator({ model, liability, inputs, save }: { model: LiabilityModel; liability: Liability; inputs: Inputs; save: Save }) {
  const toggle = (id: string) => {
    const sc = liability.scenarios.find((s) => s.id === id)!;
    const next = inputs.scenario.includes(id) ? inputs.scenario.filter((x) => x !== id)
      : [...inputs.scenario.filter((x) => !sc.group || liability.scenarios.find((s) => s.id === x)?.group !== sc.group), id];
    save((p) => ({ ...p, scenario: next }));
  };
  const { baseline, preSuit, litigation, total, chosen, ranked, impact } = model.simulator;
  return (
    <Panel id="liability-simulator" eyebrow="Liability simulator" badge={<span className="text-[11px] text-[#8A98A3]">Ranked by impact</span>}>
      <div className="p-3 space-y-2">
        {ranked.map((s) => {
          const on = inputs.scenario.includes(s.id);
          const n = impact(s);
          return (
            // Title and one line of when/affects; the full assumption is on hover.
            <label key={s.id} title={s.assumption} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${on ? "border-brand bg-tint" : "border-line border-dashed hover:bg-wash"}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="mt-[3px] accent-[#1E7C99] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-ink leading-snug line-clamp-2">{s.title}</span>
                  <span className="mono-ref text-[11px] text-deep shrink-0">{n ? `+${n}` : "0"}</span>
                </span>
                <span className={`block text-[11px] leading-snug truncate ${s.when === "litigation" ? "text-[#B45309]" : "text-[#8A98A3]"}`}>{s.when === "litigation" ? "Litigation only" : "Pre-suit"} · {s.affects.join(", ")}</span>
              </span>
            </label>
          );
        })}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {([["Pre-suit scenario", preSuit, chosen.some((s) => s.when === "pre-suit")], ["Litigation outlook", litigation, chosen.length > 0]] as const).map(([l, v, any]) => (
            <div key={l} className="rounded-lg bg-wash px-2 py-2.5 text-center">
              <p className="eyebrow !text-[10px]">{l}</p>
              <p className={`text-lg font-semibold tabular-nums leading-tight mt-0.5 ${any ? "text-deep" : "text-[#9BA8B4]"}`}>{v.shown}/{total}</p>
              <p className="text-[11px] text-[#5B6B78]">elements shown</p>
            </div>
          ))}
        </div>
        {inputs.savedScenarios.length > 0 && (
          <ul className="space-y-1">
            {inputs.savedScenarios.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-ink truncate">{sv.name} · {sv.selected.length} assumption{sv.selected.length === 1 ? "" : "s"} · {sv.at}</span>
                <button onClick={() => save((p) => ({ ...p, scenario: sv.selected }))} className="text-[11px] font-semibold text-deep hover:text-ink shrink-0">Load</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[#8A98A3] leading-snug">Estimates for strategy, not verdict predictions. Scenarios saved separately from baseline.</p>
      </div>
    </Panel>
  );
}

// Compact one-line rows throughout; full text is kept on hover.
function AuthorityPanel({ model, inputs, onOpen }: { model: LiabilityModel; inputs: Inputs; onOpen: (a: Authority) => void }) {
  return (
    <Panel id="liability-authority" eyebrow="Legal authority" badge={<span className="text-[11px] text-[#8A98A3] text-right">No legal DB · {model.unverified.length} unverified</span>}>
      <ul className="divide-y divide-line">
        {model.authorities.map((a) => {
          const v = inputs.authorityChecks[a.id];
          return (
            <li key={a.id}>
              <button onClick={() => onOpen(a)} title={`${a.citation} — ${a.issue}`} className="w-full text-left px-4 py-2 flex items-center justify-between gap-2 hover:bg-wash">
                <span className="min-w-0 text-xs truncate"><span className="font-medium text-ink">{a.citation}</span> <span className="text-[#5B6B78]">{a.issue}</span></span>
                <Pill className={`${v ? "pill-complete" : "pill-progress"} shrink-0`}>{v ? "Verified" : "Verify"}</Pill>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2 text-[11px] text-[#8A98A3] border-t border-line">Unverified — attorney review required before reliance.</p>
    </Panel>
  );
}

function AllocationRules({ rules, model, inputs }: { rules: Rules; model: LiabilityModel; inputs: Inputs }) {
  if (!rules) return null;
  const row = "px-4 py-2 flex items-start justify-between gap-3";
  return (
    <Panel eyebrow="Allocation rules applied">
      <dl className="divide-y divide-line">
        {rules.allocation.map((r) => {
          const ok = r.authorityId && inputs.authorityChecks[r.authorityId];
          return (
            <div key={r.label} className={row} title={`${r.value} — ${model.authorities.find((a) => a.id === r.authorityId)?.citation ?? "no authority"} · ${ok ? "verified" : "unverified"}`}>
              <dt className="text-xs text-[#5B6B78] shrink-0">{r.label}</dt>
              <dd className="text-xs font-semibold text-ink text-right min-w-0 truncate">{r.short ?? r.value}</dd>
            </div>
          );
        })}
        <div className={row}>
          <dt className="text-xs text-[#5B6B78] shrink-0">Grouping</dt>
          <dd className="text-xs font-semibold text-ink text-right">{model.groups.length ? model.groups.map((g) => `${g.head.short} + ${g.through.short} (vicarious)`).join("; ") : "No grouping"}</dd>
        </div>
        <div className={row}>
          <dt className="text-xs text-[#5B6B78] shrink-0">Settlements</dt>
          <dd className="text-xs font-semibold text-ink text-right">{inputs.settlementsNone ? "None to date · confirmed" : "None on record · unconfirmed"}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function Outlook({ model, rules, inputs }: { model: LiabilityModel; rules: Rules; inputs: Inputs }) {
  const offFile = model.flags.find((f) => f.id === "cited-off-file");
  const identityOpen = model.flags.some((f) => f.id === "defendant-name");
  const expert = model.recommendations.find((r) => r.id === "r-expert");
  const rows: { label: string; value: string; cls: string; basis: string }[] = [
    { label: "Causation proof", value: model.causationOpen.length ? "Needs expert" : "Supported", cls: model.causationOpen.length ? "pill-progress" : "pill-complete", basis: `${model.causationOpen.length} causation element(s) not yet known` },
    { label: "Expert testimony", value: expert?.state === "received" ? "On file" : expert?.state === "requested" ? "Requested" : "Not retained", cls: expert?.state === "received" ? "pill-complete" : "pill-progress", basis: "Causation rests on it" },
    { label: "Plaintiff fault defense", value: model.plaintiffFindings.some((p) => p.status === "Not yet known") ? "Open questions" : "None on record", cls: "pill-neutral", basis: `${model.plaintiffFindings.filter((p) => p.status === "Not yet known").length} open plaintiff checks; none indicates fault` },
    { label: "Defendant identity", value: identityOpen ? "Unresolved" : "No conflict", cls: identityOpen ? "pill-progress" : "pill-complete", basis: "Caption vs. Analysis stage" },
    { label: "Pre-suit report (§ 2-622)", value: "Depends on licensing", cls: GREY, basis: inputs.authorityChecks["il-2-622"] ? "Authority verified" : "Authority unverified" },
    { label: "Evidence in the case file", value: offFile ? `${offFile.sources.length} cited, missing` : "Complete", cls: offFile ? "pill-progress" : "pill-complete", basis: "Cited records vs. case documents" },
  ];
  return (
    <Panel eyebrow="Litigation outlook" badge={<span className="text-[11px] text-[#8A98A3]">Qualitative</span>}>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="px-4 py-2 flex items-center justify-between gap-2" title={r.basis}>
            <span className="min-w-0"><span className="block text-xs text-ink">{r.label}</span><span className="block text-[11px] text-[#8A98A3] truncate">{r.basis}</span></span>
            <Pill className={`${r.cls} whitespace-nowrap shrink-0`}>{r.value}</Pill>
          </li>
        ))}
        <li className="px-4 py-2 flex items-center justify-between gap-2">
          <span className="block text-xs text-ink">Litigation-only evidence</span>
          <span className="text-xs font-semibold text-ink tabular-nums">{model.litigationOnly.length} {model.litigationOnly.length === 1 ? "item" : "items"}</span>
        </li>
      </ul>
      <p className="px-4 py-2 text-[11px] text-[#8A98A3] border-t border-line">Read from the record{rules ? ` and ${rules.state} rules` : ""} — not a prediction.</p>
    </Panel>
  );
}

function JurisdictionComparison({ jurisdiction, onOpenJurisdiction }: { jurisdiction: Jx; onOpenJurisdiction?: () => void }) {
  const rulesUsed = new Set(jurisdiction?.forums.map((f) => f.appliedRule));
  return (
    <Panel eyebrow="Jurisdiction comparison · read-only" className="flex flex-col">
      <div className="px-4 py-2.5 space-y-1.5 flex-1 flex flex-col">
        {jurisdiction ? jurisdiction.forums.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-3 text-xs" title={`${f.court} · ${f.cells.basis.value}`}>
            <span className="min-w-0"><span className="font-semibold text-ink">{f.title}</span><span className="text-[#5B6B78]">{f.defaultSelected ? " · selected" : ""}</span><span className="block text-[11px] text-[#8A98A3] truncate">{f.court}</span></span>
            <span className="text-right text-[11px] text-ink max-w-[45%]">{f.appliedRuleLabel}</span>
          </div>
        )) : <p className="text-xs text-[#5B6B78]">No jurisdiction review on record.</p>}
        {jurisdiction && <p className="text-[11px] text-[#8A98A3] pt-0.5">{rulesUsed.size === 1 ? "Rule difference: none — every forum applies Illinois law." : "The candidate forums apply different fault rules."}</p>}
        <button onClick={onOpenJurisdiction} className="mt-auto self-start text-xs font-semibold text-deep hover:text-ink underline underline-offset-2">Open in Jurisdiction module →</button>
      </div>
    </Panel>
  );
}

// ── Evidence ledger ───────────────────────────────────────────────────────────

function EvidenceLedger({ model, liability, inputs, save, onOpenDocs }: { model: LiabilityModel; liability: Liability; inputs: Inputs; save: Save; onOpenDocs: LiabilityWorkspaceProps["onOpenDocs"] }) {
  const reviewed = inputs.ledgerReview?.signature === model.ledgerSignature;
  const risks = model.ledger.filter((r) => r.sourceId && /facility/i.test(r.heldBy) && r.status !== "On file");
  const [dec, setDec] = useState<{ decision: "send" | "not-needed" | ""; reason: string }>({ decision: "", reason: "" });
  const [decErr, setDecErr] = useState<string | null>(null);
  const checklist = liability.preservationChecklist;
  const confirmed = checklist.filter((c) => inputs.clientChecklist[c.id]?.state === "confirmed").length;
  const mark = (id: string, item: string, state: "confirmed" | "not-held" | undefined) =>
    save((p) => {
      const { [id]: _, ...rest } = p.clientChecklist;
      return { ...p, clientChecklist: state ? { ...rest, [id]: { at: stampNow(), by: REVIEWER, state } } : rest };
    }, { action: "Client preservation checklist", detail: item, to: state === "confirmed" ? "Kept by the client" : state === "not-held" ? "Client does not have it" : "Cleared" });
  // One line per panel, read from the saved states; the controls open beneath it.
  const checklistLine = checklist.map((c) => {
    const st = inputs.clientChecklist[c.id]?.state;
    return { id: c.id, label: c.short ?? c.item, mark: st === "confirmed" ? "✓" : st === "not-held" ? "not held" : "pending", done: !!st };
  });
  const td = "px-4 py-2 align-top";
  return (
    <Section id="liability-ledger" eyebrow="Evidence ledger" title="Completeness, preservation and spoliation" titleClassName="text-base font-medium text-ink"
      right={
        <div className="flex items-center gap-1.5 flex-wrap" title="Defendant elements marked Shown, of those recorded, for parties in the analysis">
          {model.completeness.map((c) => (
            <Pill key={c.key} className={c.pct === 100 ? "pill-complete" : c.pct ? "pill-progress" : GREY}>{c.label} {c.pct === null ? "—" : `${c.pct}%`} <span className="opacity-70">({c.shown}/{c.total})</span></Pill>
          ))}
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed">
          <colgroup><col className="w-[24%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[18%]" /><col /></colgroup>
          <thead className="bg-wash border-b border-line">
            <tr>{["Evidence", "Held by", "Pre-suit?", "Status", "Proves", "Deadline / note"].map((h) => <th key={h} className="px-4 py-2 text-left eyebrow !text-[10px]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {model.ledger.map((r) => {
              const on = r.files.filter((f) => f.onFile);
              const files = r.files.length > 0 && r.sourceId !== "case-documents" ? r.files.map((f) => f.file).join(", ") : "";
              return (
                <tr key={r.id}>
                  <td className={td}>
                    <p className="text-[13px] font-semibold text-ink leading-snug truncate" title={r.name}>{r.name}</p>
                    {(files || on.length > 0) && (
                      <p className="flex items-center gap-1.5 text-[11px] leading-snug min-w-0">
                        {files && <span className="mono-ref text-[#8A98A3] truncate" title={files}>{files}</span>}
                        {on.length > 0 && <button onClick={() => onOpenDocs(on.map((f) => f.file), "preview", { contextType: "Evidence", reference: r.name })} className="text-[11px] font-semibold text-deep hover:text-ink shrink-0">Preview</button>}
                      </p>
                    )}
                  </td>
                  <td className={`${td} text-xs text-[#5B6B78]`}><span className="line-clamp-2" title={r.heldBy}>{r.heldBy}</span></td>
                  <td className={td}><Pill className={`${r.preSuit === "Yes" ? "pill-complete" : r.preSuit === "Discovery likely" ? "pill-progress" : GREY} whitespace-nowrap`}>{r.preSuit === "Discovery likely" ? "Litigation" : r.preSuit}</Pill></td>
                  <td className={td}><Pill className={`${LEDGER_PILL[r.status]} whitespace-nowrap`}>{r.status}</Pill></td>
                  <td className={`${td} text-xs text-[#5B6B78]`}><span className="line-clamp-2" title={r.proves}>{r.proves}</span></td>
                  <td className={`${td} text-[11px] text-[#5B6B78]`}><span className="line-clamp-2" title={r.note}>{r.note}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start lg:items-stretch px-4 py-3 border-t border-line">
        <div id="decide-preservation" tabIndex={-1} className="rounded-lg border border-[#FBD5D5] bg-[#FEF6F6] px-3.5 py-2.5 scroll-mt-[150px] focus:outline-none">
          <p className="text-xs font-semibold text-[#B91C1C] flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.75} /> Spoliation review ({model.spoliationFlags.length})</p>
          <p className="text-[11px] text-ink mt-0.5 leading-snug" title={risks.map((r) => r.name).join(" · ")}>
            No confirmed loss or deletion on record{risks.length ? ` · ${risks.length} facility-held ${risks.length === 1 ? "record" : "records"} not in the file — a preservation risk, not a loss.` : "."}
          </p>
          {inputs.preservation ? (
            <p className="text-[11px] text-[#5B6B78] mt-1">Decision: <span className="font-semibold text-ink">{inputs.preservation.decision === "send" ? "Send a preservation request" : "Not needed"}</span> · {inputs.preservation.reason} · {inputs.preservation.by}, {inputs.preservation.at}</p>
          ) : risks.length > 0 && (
            // The existing decision form, opened on demand.
            <details className="mt-1 group">
              <summary className="text-[11px] font-semibold text-deep hover:text-ink cursor-pointer list-none inline-flex items-center gap-1">Preservation decision <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" strokeWidth={2} /></summary>
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-[#5B6B78]">{risks.map((r) => r.name).join(" · ")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {([["send", "Send a preservation request"], ["not-needed", "Not needed"]] as const).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs"><input type="radio" name="preservation" checked={dec.decision === k} onChange={() => setDec({ ...dec, decision: k })} className="accent-[#1E7C99]" />{l}</label>
                  ))}
                </div>
                <input value={dec.reason} onChange={(e) => setDec({ ...dec, reason: e.target.value })} placeholder="Reason (required)" aria-label="Preservation decision reason" className={`${INPUT} py-1.5 text-xs`} />
                {decErr && <p role="alert" className="text-xs text-[#B91C1C]">{decErr}</p>}
                <button onClick={() => {
                  if (!dec.decision || !dec.reason.trim()) { setDecErr("Choose a decision and give a reason."); return; }
                  setDecErr(null);
                  save((p) => ({ ...p, preservation: { decision: dec.decision as "send" | "not-needed", reason: dec.reason.trim(), at: stampNow(), by: REVIEWER } }),
                    { action: "Preservation decision", to: dec.decision === "send" ? "Send request" : "Not needed", reason: dec.reason.trim() }, "Preservation decision recorded. Nothing was sent from here.");
                }} className={BTN_P}>Record decision</button>
              </div>
            </details>
          )}
        </div>
        <div className="rounded-lg border border-line bg-wash px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">Client preservation checklist</p>
            <span className="text-[11px] text-[#5B6B78]">{confirmed} of {checklist.length} confirmed</span>
          </div>
          <p className="text-[11px] text-ink mt-0.5 leading-snug">
            {checklistLine.map((c, i) => (
              <span key={c.id}>{i > 0 && <span className="text-[#9BA8B4]"> · </span>}{c.label} <span className={c.mark === "✓" ? "text-[#15803D] font-semibold" : c.done ? "text-[#5B6B78]" : "text-[#B45309]"}>{c.mark}</span></span>
            ))}
          </p>
          <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
            {/* Each item's status, opened on demand. */}
            <details className="group min-w-0 basis-full order-last">
              <summary className="text-[11px] font-semibold text-deep hover:text-ink cursor-pointer list-none inline-flex items-center gap-1">Item statuses <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" strokeWidth={2} /></summary>
              <ul className="mt-1.5 space-y-1">
                {checklist.map((c) => {
                  const st = inputs.clientChecklist[c.id];
                  return (
                    <li key={c.id} className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-[11px]">
                        <span className="font-semibold text-ink">{c.item}</span>
                        <span className="block text-[#5B6B78]">{st ? `${st.state === "confirmed" ? "Kept by the client" : "Client does not have it"} · ${st.at}` : c.why}</span>
                      </span>
                      <span className="flex gap-1 shrink-0">
                        {st ? <button onClick={() => mark(c.id, c.item, undefined)} className="text-[11px] font-semibold text-deep hover:text-ink">Clear</button> : (
                          <>
                            <button onClick={() => mark(c.id, c.item, "confirmed")} className="text-[11px] font-semibold text-deep hover:text-ink">Kept</button>
                            <span className="text-[#9BA8B4]">·</span>
                            <button onClick={() => mark(c.id, c.item, "not-held")} className="text-[11px] font-semibold text-[#5B6B78] hover:text-ink">Not held</button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
            <p className="text-[11px] text-[#5B6B78]">{reviewed ? `Statuses reviewed · ${inputs.ledgerReview!.at}` : inputs.ledgerReview ? "Statuses changed since your review" : `${model.ledger.length} items not yet reviewed`}</p>
            <button disabled={reviewed} onClick={() => save((p) => ({ ...p, ledgerReview: { at: stampNow(), by: REVIEWER, signature: model.ledgerSignature } }), { action: "Evidence statuses reviewed", detail: `${model.ledger.length} items` }, "Evidence statuses marked reviewed.")} className={`${BTN_S} !py-1`}>
              {reviewed ? <><Check className="w-3.5 h-3.5" strokeWidth={2} /> Reviewed</> : "Mark statuses reviewed"}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── L7 · Attorney inputs and sign-off ────────────────────────────────────────

function SignOff({ model, inputs, save, follow, caseData, rules, liability, signedCurrent, onProceedToValuation }: {
  model: LiabilityModel; inputs: Inputs; save: Save; follow: (t: string) => void; caseData: LiabilityWorkspaceProps["caseData"];
  rules: ReturnType<typeof rulesForState>; liability: NonNullable<ReturnType<typeof liabilityForCase>>; signedCurrent: boolean; onProceedToValuation?: () => void;
}) {
  const total = model.readiness.length;
  const done = model.readiness.filter((r) => r.done).length;
  // Open decisions, blocking first; spoliation and override reasons are always listed, with their state.
  const decisions = model.readiness.filter((r) => r.decision && r.blocking && !r.done);
  // One short line per blocking decision; anything else keeps the model's own detail.
  const SHORT: Record<string, string> = {
    defendants: "Potential defendant decisions are not confirmed.",
    "incident-date": `Record: ${model.fmtIso(model.recorded)} · Evidence: ${model.fmtIso(model.anchor)}`,
  };
  const [date, setDate] = useState<{ choice: "record" | "evidence" | ""; reason: string }>({ choice: "", reason: "" });
  // What the attorney must do for each blocking item, in a few words.
  const ACTION: Record<string, string> = {
    defendants: "Confirm the defendant selection", "governing-law": "Approve the governing law", "incident-date": "Choose the incident date for this analysis",
    spoliation: "Decide on the spoliation flags", "changed-since-review": "Review the findings that changed",
  };
  const blockers = model.blocking.map((b) => ACTION[b.id] ?? `Resolve ${b.title.toLowerCase()}`);
  const guidance = blockers.length === 1 ? `${blockers[0]} to enable sign-off.`
    : blockers.length > 1 ? `Resolve ${blockers.length} blocking decisions to enable sign-off.` : "";
  const [dateErr, setDateErr] = useState<string | null>(null);

  const verified = (id?: string) => !!(id && inputs.authorityChecks[id]);
  const file = (s: string) => `${safeFileName(caseData.caseName)}_${s}.txt`;
  const outputs = {
    demand: () => {
      const usable = model.defendantFindings.filter((f) => (f.status === "Shown" || f.status === "Indicated") && model.inAnalysis.some((p) => p.candidate.id === f.candidate.id));
      const verifiedRules = rules?.allocation.filter((r) => verified(r.authorityId)) ?? [];
      downloadTextFile(file("Liability_Section_DRAFT"), [
        "DRAFT — demand liability section. For attorney review.", "", `${caseData.caseName} (${caseData.caseId})`, "", "LIABILITY", "",
        ...model.inAnalysis.flatMap((p) => {
          const own = usable.filter((f) => f.candidate.id === p.candidate.id);
          return own.length ? [p.candidate.name, ...own.map((f) => `  - ${f.title} (${f.status.toLowerCase()}${f.note ? `: ${f.note}` : ""})`), ""] : [];
        }),
        "APPLICABLE LAW", ...(verifiedRules.length ? verifiedRules.map((r) => `  - ${r.label}: ${r.value}`) : ["  [No authority verified yet — left out of this draft]"]), "",
        "LEFT OUT OF THIS DRAFT",
        ...model.unverified.map((a) => `  - ${a.citation} (unverified)`),
        ...model.defendantFindings.filter((f) => f.status === "Not yet known").map((f) => `  - ${f.candidate.short}: ${f.title} (not yet known)`),
        ...model.flags.map((f) => `  - Flag: ${f.title}`),
      ]);
    },
    plan: () => downloadTextFile(file("PreSuit_Evidence_Plan"), [
      "Pre-suit evidence plan", `${caseData.caseName} (${caseData.caseId})`, "",
      ...model.recommendations.filter((r) => r.state !== "received").flatMap((r) => [
        `[${r.priority}] ${r.title}`, `  From: ${r.custodian} · pre-suit: ${r.preSuit} · ${r.state === "requested" ? `requested ${r.requestedAt}` : "not yet requested"}`, `  Why: ${r.why}`, "  Deadline: requires verification", "",
      ]),
    ]),
    outlook: () => downloadTextFile(file("Litigation_Outlook"), [
      "Litigation outlook summary — qualitative, not a prediction", `${caseData.caseName} (${caseData.caseId})`, "",
      `Fault rule: ${rules ? `${rules.state} — ${rules.faultRuleLabel}` : "not recorded"} (${verified("il-2-1116") ? "verified" : "unverified"})`,
      `Plaintiff estimate: ${inputs.plaintiffOverride ? `${inputs.plaintiffOverride.expected}% (attorney) → ${model.ruleResult?.label}` : "not calculated"}`,
      `Defendant elements shown: ${model.simulator.baseline.shown} of ${model.simulator.total}; not yet known: ${model.simulator.baseline.open}`,
      ...inputs.savedScenarios.map((s) => `Saved scenario: ${s.name} (${s.selected.join(", ")})`), "",
      "Flags:", ...model.flags.map((f) => `  - ${f.title}`),
    ]),
  };

  return (
    <section id="liability-signoff" tabIndex={-1} className="lg-card overflow-hidden scroll-mt-[150px] focus:outline-none grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
      <div className="px-4 py-4 bg-wash border-b lg:border-b-0 lg:border-r border-line flex flex-col">
        <div className="eyebrow mb-0.5">L7 · Attorney inputs</div>
        <h2 className="text-base font-medium text-ink leading-snug">Ready for sign-off?</h2>
        <p className="mt-3 leading-none"><span className="text-3xl font-semibold text-ink tabular-nums">{done}</span><span className="text-xl text-[#9BA8B4] tabular-nums">/{total}</span> <span className="text-xs text-[#5B6B78]">inputs complete</span></p>
        <div className="h-1.5 rounded-full bg-track mt-2.5 overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}><div className="h-full bg-deep" style={{ width: `${(done / total) * 100}%` }} /></div>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Blocking sign-off</dt><dd className="font-semibold text-[#B91C1C] tabular-nums">{model.blocking.length}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Open, not blocking</dt><dd className="font-semibold text-[#B45309] tabular-nums">{model.openItems.length}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Complete</dt><dd className="font-semibold text-[#15803D] tabular-nums">{done}</dd></div>
        </dl>
        <div className="mt-auto pt-5 space-y-2">
          {signedCurrent ? (
            <p className="text-sm text-[#15803D] flex items-center gap-1.5"><CheckCircle className="w-4 h-4" strokeWidth={1.75} /> Signed off by {inputs.signOff!.by} · {inputs.signOff!.at}</p>
          ) : inputs.signOff && (
            <p className="text-xs text-[#B45309]">Signed off {inputs.signOff.at}, but inputs have changed since — sign off again.</p>
          )}
          <button
            disabled={model.blocking.length > 0 || signedCurrent}
            onClick={() => save((p) => ({ ...p, signOff: { at: stampNow(), by: REVIEWER, signature: model.signature } }), { action: "Attorney sign-off", detail: `${done}/${total} inputs complete; ${model.openItems.length} open, not blocking` }, "Liability analysis signed off. The case stage has not changed.")}
            className="btn btn-primary w-full gap-2 !py-2 !text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {model.blocking.length ? <Lock className="w-4 h-4" strokeWidth={1.75} /> : <CheckCircle className="w-4 h-4" strokeWidth={1.75} />} Attorney sign-off
          </button>
          {guidance && <p className="text-[11px] text-[#B91C1C] leading-snug">{guidance}</p>}
        </div>
      </div>
      <div className="px-4 py-4 space-y-4 min-w-0">
        <div>
          <h3 className="eyebrow mb-2">Needs your decision</h3>
          {decisions.length === 0 ? <p className="text-xs text-[#15803D]">No blocking decisions remain.</p> : (
            <ul className="space-y-1.5">
              {decisions.map((d) => (
                <li key={d.id} className={`rounded-lg border px-3 py-2 ${d.blocking && !d.done ? "border-[#FBD5D5] bg-[#FFFAFA]" : "border-line"}`}>
                  <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${d.done ? "bg-[#ECFDF3] text-[#15803D]" : d.blocking ? "bg-[#FBD5D5] text-[#B91C1C]" : "bg-[#FFF7ED] text-[#B45309]"}`}>{d.done ? <Check className="w-2.5 h-2.5" strokeWidth={2.25} /> : <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2.25} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink leading-snug">{d.title}</p>
                      <p className="text-[11px] text-[#5B6B78] leading-snug truncate" title={d.detail}>{SHORT[d.id] ?? d.detail}</p>
                    </div>
                    <Pill className={`${d.done ? (d.alwaysListed === "optional" ? GREY : "pill-complete") : d.blocking ? "pill-risk" : "pill-progress"} whitespace-nowrap shrink-0`}>{d.done ? (d.alwaysListed === "optional" ? "Optional" : "None") : d.blocking ? "Blocking" : d.count ? `${d.count} open` : "Open"}</Pill>
                    {d.id !== "incident-date" && <button onClick={() => follow(d.link.target)} className="text-xs font-semibold text-deep hover:text-ink underline underline-offset-2 shrink-0">{d.link.label}</button>}
                  </div>
                  {d.id === "incident-date" && (
                    <details id="decide-incident-date" className="mt-1 sm:pl-[26px] group">
                    <summary className="text-[11px] font-semibold text-deep hover:text-ink cursor-pointer list-none inline-flex items-center gap-1">Choose the date <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" strokeWidth={2} /></summary>
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-col gap-1 text-xs">
                        <label className="flex items-center gap-1.5 text-xs text-ink"><input type="radio" name="incident-date" checked={date.choice === "record"} onChange={() => setDate({ ...date, choice: "record" })} className="accent-[#1E7C99]" />{model.fmtIso(model.recorded)} · {liability.incidentOnRecord.source}</label>
                        <label className="flex items-center gap-1.5 text-xs text-ink"><input type="radio" name="incident-date" checked={date.choice === "evidence"} onChange={() => setDate({ ...date, choice: "evidence" })} className="accent-[#1E7C99]" />{model.fmtIso(model.anchor)} · {liability.incidentInEvidence.source}</label>
                      </div>
                      <input value={date.reason} onChange={(e) => setDate({ ...date, reason: e.target.value })} placeholder="Reason (required)" aria-label="Incident date reason" className={`${INPUT} py-1.5 text-xs`} />
                      {dateErr && <p role="alert" className="text-xs text-[#B91C1C]">{dateErr}</p>}
                      <button onClick={() => {
                        if (!date.choice || !date.reason.trim()) { setDateErr("Choose a date and give a reason."); return; }
                        setDateErr(null);
                        save((p) => ({ ...p, incidentDate: { choice: date.choice as "record" | "evidence", reason: date.reason.trim(), at: stampNow(), by: REVIEWER } }),
                          { action: "Incident date chosen for liability analysis", to: date.choice === "record" ? model.fmtIso(model.recorded) : model.fmtIso(model.anchor), reason: date.reason.trim() },
                          "Incident date recorded for this analysis. The case record and the timeline are unchanged.");
                      }} className={BTN_P}>Record date</button>
                    </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {inputs.incidentDate && (
            <p className="text-[11px] text-[#5B6B78] mt-2">Incident date for this analysis: {inputs.incidentDate.choice === "record" ? model.fmtIso(model.recorded) : model.fmtIso(model.anchor)} · {inputs.incidentDate.by}, {inputs.incidentDate.at}.{" "}
              <button onClick={() => save((p) => ({ ...p, incidentDate: undefined }), { action: "Incident date choice withdrawn" })} className="text-[11px] font-semibold text-deep hover:text-ink">Change</button></p>
          )}
        </div>

        {(["facts", "legal"] as const).map((g) => (
          <div key={g}>
            <h3 className="eyebrow mb-2">{g === "facts" ? "Facts and parties" : "Evidence and legal"}</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {model.readiness.filter((r) => r.group === g).map((r) => {
                // A link to where it is resolved — not back to this panel.
                const link = r.link.target !== "liability-signoff" && r.link.target !== "decide-incident-date" ? r.link : null;
                return (
                  <li key={r.id} className="rounded-lg border border-line px-3 py-1.5 flex items-center gap-2 min-w-0" title={r.detail}>
                    {r.done ? <CheckCircle className="w-3.5 h-3.5 text-[#15803D] shrink-0" strokeWidth={1.75} /> : r.blocking ? <AlertTriangle className="w-3.5 h-3.5 text-[#B91C1C] shrink-0" strokeWidth={1.75} /> : <Circle className="w-3.5 h-3.5 text-[#B45309] shrink-0" strokeWidth={1.75} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink leading-snug truncate">{r.title}{!r.done && r.count ? <span className="font-normal text-[#B45309]"> · {r.count} open</span> : null}</p>
                      <p className="text-[11px] text-[#5B6B78] leading-snug truncate">{r.detail}</p>
                    </div>
                    {r.id === "plaintiff-review" && !r.done ? (
                      <button onClick={() => save((p) => ({ ...p, plaintiffReview: { at: stampNow(), by: REVIEWER, signature: model.plaintiffSignature } }), { action: "Plaintiff conduct items reviewed", detail: `${model.plaintiffFindings.length} checks` }, "Plaintiff conduct items marked reviewed.")} className="text-[11px] font-semibold text-deep hover:text-ink shrink-0 whitespace-nowrap">Mark reviewed</button>
                    ) : r.id === "settlements" && !r.done ? (
                      <button onClick={() => save((p) => ({ ...p, settlementsNone: { at: stampNow(), by: REVIEWER } }), { action: "Confirmed no settlements or releases" }, "Recorded: no settlements or releases to date.")} className="text-[11px] font-semibold text-deep hover:text-ink shrink-0 whitespace-nowrap">Confirm none to date</button>
                    ) : link && (
                      <button onClick={() => follow(link.target)} className="text-[11px] font-semibold text-deep hover:text-ink shrink-0">{link.label}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="pt-3 border-t border-line">
          <h3 className="eyebrow mb-2">Outputs</h3>
          <div className="flex flex-wrap gap-1.5 [&>button]:whitespace-nowrap [&>button]:!px-2.5">
            <button onClick={outputs.demand} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Draft demand liability section</button>
            <button onClick={outputs.plan} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Pre-suit evidence plan</button>
            <button onClick={outputs.outlook} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Litigation outlook summary</button>
            <button onClick={onProceedToValuation} disabled={!signedCurrent || !onProceedToValuation} title={signedCurrent ? undefined : "Available after attorney sign-off"} className={BTN_S}>Send to Damages <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} /></button>
            <button onClick={() => follow("flags")} disabled={model.flags.length === 0} className={BTN_S}>Upstream flags ({model.flags.length})</button>
          </div>
          <p className="text-[11px] text-[#8A98A3] mt-1.5" title="Not-yet-known findings are also left out and listed at the end of the draft. Send to Damages is offered only after sign-off.">Unverified authority is excluded from the demand draft until verified.</p>
        </div>

      </div>
    </section>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-line">
          <h2 className="card-title">{label}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg shrink-0"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function FindingPanel({ target, model, inputs, save, onClose, onLaw, onPreview }: {
  target: { kind: "defendant"; f: DefendantFinding } | { kind: "plaintiff"; f: PlaintiffFinding }; model: LiabilityModel; inputs: Inputs; save: Save;
  onClose: () => void; onLaw: (id: string) => void; onPreview: (file: string) => void;
}) {
  const f = target.f;
  const isD = target.kind === "defendant";
  const d = f as DefendantFinding;
  const p = f as PlaintiffFinding;
  const r = inputs.reviewed[f.id];
  const current = model.snapshot[f.id];
  return (
    <Modal label={`${f.code} · ${f.title}`} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <Pill className={isD ? ELEMENT_PILL[d.status] : PLAINTIFF_PILL[p.status]}>{f.status}</Pill>
        {isD && d.scenarioStatus && <Pill className="pill-neutral">Scenario: {d.scenarioStatus}</Pill>}
        <Pill className={GREY}>{isD ? d.candidate.name : "Plaintiff"}</Pill>
      </div>
      <div>
        <p className="eyebrow mb-1">{isD ? "What the record shows" : "The check"}</p>
        {/* The cards show a short summary; the full description is kept here. */}
        {isD && d.description && <p className="body-text mb-1">{d.description}</p>}
        <p className={isD && d.description ? "text-xs text-[#5B6B78]" : "body-text"}>{isD ? (d.note ? `Source note: ${d.note}.` : "No source note recorded.") : p.description}</p>
        {(isD ? d.missing : p.open) && <p className="text-sm text-[#B45309] mt-1">{isD ? "Missing" : "Open"}: {isD ? d.missing : p.open}</p>}
        {!isD && p.moduleSource && <p className="text-xs text-[#5B6B78] mt-1">Source: {p.moduleSource}</p>}
      </div>
      <div>
        <p className="eyebrow mb-1">Evidence</p>
        {f.evidence.length === 0 ? <p className="text-sm text-[#5B6B78]">No documents linked.</p> : (
          <ul className="space-y-1.5">
            {f.evidence.map((e) => (
              <li key={e.file} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="min-w-0"><span className="block mono-ref text-ink truncate">{e.file}</span><span className="block text-[11px] text-[#5B6B78]">{e.sourceName}</span></span>
                {e.onFile ? <button onClick={() => onPreview(e.file)} className={BTN_S}><Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview</button>
                  : <Pill className="pill-progress">Not in case documents</Pill>}
              </li>
            ))}
          </ul>
        )}
        {f.evidence.some((e) => !e.onFile) && <p className="text-[11px] text-[#8A98A3] mt-1">Cited by the analysis but not in this case's documents, so there is no original to preview. Add it to the case to preview it.</p>}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap pt-3 border-t border-line">
        {!isD && p.authorityId
          ? <button onClick={() => onLaw(p.authorityId!)} className={BTN_S}><BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /> Triggering law</button>
          : <span className="text-[11px] text-[#8A98A3] flex items-center gap-1"><Info className="w-3.5 h-3.5" strokeWidth={1.75} /> No legal authority recorded for this finding</span>}
        {isD && (
          r && r.signature === current
            ? <span className="text-xs text-[#15803D] flex items-center gap-1"><Check className="w-3.5 h-3.5" strokeWidth={2} /> Reviewed {r.at}</span>
            : <button onClick={() => save((s) => ({ ...s, reviewed: { ...s.reviewed, [f.id]: { at: stampNow(), by: REVIEWER, signature: current } } }), { action: "Finding reviewed", detail: `${f.code} · ${f.title}` }, `${f.code} marked reviewed.`)} className={BTN_P}>
                {r ? "Review again" : "Mark reviewed"}
              </button>
        )}
      </div>
    </Modal>
  );
}

function AuthorityModal({ authority: a, inputs, save, onClose }: { authority: Authority; inputs: Inputs; save: Save; onClose: () => void }) {
  const v = inputs.authorityChecks[a.id];
  const [src, setSrc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal label={a.citation} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <Pill className={v ? "pill-complete" : "pill-progress"}>{v ? "Verified by attorney" : "Unverified — attorney review required"}</Pill>
        <Pill className={GREY}>{a.jurisdiction}</Pill>
      </div>
      <div><p className="eyebrow mb-1">Governs</p><p className="body-text">{a.issue}</p></div>
      <div><p className="eyebrow mb-1">What this analysis relies on</p><p className="body-text">{a.summary}</p></div>
      {a.applicability && <div><p className="eyebrow mb-1">Applicability</p><p className="body-text">{a.applicability}</p></div>}
      <p className="text-xs text-[#5B6B78]">Effective date: {v ? `checked to be in force ${v.at}` : "not verified"}</p>
      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-deep hover:text-ink">Read the current text <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} /></a>}
      {v ? (
        <div className="pt-3 border-t border-line flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-[#5B6B78]">Checked by {v.by}, {v.at} · against {v.source}</p>
          <button onClick={() => save((p) => { const { [a.id]: _, ...rest } = p.authorityChecks; return { ...p, authorityChecks: rest }; }, { action: "Authority verification withdrawn", detail: a.citation })} className={BTN_S}>Withdraw</button>
        </div>
      ) : (
        <div className="pt-3 border-t border-line space-y-2">
          <label className="block"><span className="text-[11px] text-[#5B6B78]">Source you checked it against (required)</span>
            <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="e.g. ILGA current text, checked today" className={INPUT} /></label>
          {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
          <button onClick={() => {
            if (!src.trim()) { setErr("Record the source you checked."); return; }
            if (save((p) => ({ ...p, authorityChecks: { ...p.authorityChecks, [a.id]: { at: stampNow(), by: REVIEWER, source: src.trim() } } }), { action: "Authority verified by attorney", detail: a.citation, reason: src.trim() }, `${a.citation} recorded as verified.`)) onClose();
          }} className={BTN_P}>Record as verified</button>
        </div>
      )}
    </Modal>
  );
}
