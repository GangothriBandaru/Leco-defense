import { useMemo, useState } from "react";
import {
  Scale, AlertTriangle, CheckCircle, FileText, ChevronDown, Eye, Sparkles, BookOpen, RefreshCw,
  ArrowRight, ShieldAlert, Search, Download, X, Clock, Info, Lock, ExternalLink, Check, Circle, Zap,
} from "lucide-react";
import type { CaseDocument, AnalysisFinding } from "../types/case";
import type { DocInsights, DocContextPanel } from "../components/DocumentWorkspace";
import { downloadTextFile, safeFileName } from "../components/downloadText";
import { defendantsForCase, type ElementStatus } from "../defendants/defendantData";
import { useDefendantDecisions } from "../defendants/defendantDecisionStore";
import { jurisdictionForCase, stateOfJurisdiction, workingDeadline, formatDate } from "../jurisdiction/jurisdictionData";
import { liabilityForCase, type PlaintiffStatus, type PlaybookEffect, type Priority } from "../liability/liabilityData";
import { rulesForState, type Authority } from "../liability/liabilityRules";
import { useLiabilityInputs, updateLiability, stampNow, type Override } from "../liability/liabilityStore";
import {
  buildLiabilityModel, changedBetween, estimateError, ELEMENTS,
  type DefendantFinding, type PlaintiffFinding, type EvidenceRef, type LiabilityEvent, type LiabilityModel, type RecommendationView, type StrategyRow,
} from "../liability/liabilityModel";

// ── Liability Analysis workspace ─────────────────────────────────────────────
// Stage 2 → Analysis → Liability Signals. Renders the liability model for the
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
const INPUT = "w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand";

const Pill = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pill ${className} text-[11px] max-w-full`}>{children}</span>
);

function Section({ id, eyebrow, title, sub, right, children, className = "" }: {
  id: string; eyebrow?: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} tabIndex={-1} className={`lg-card overflow-hidden scroll-mt-[150px] focus:outline-none ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b border-line">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h2 className="section-header leading-snug">{title}</h2>
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
      <Header caseData={caseData} model={model} inputs={inputs} jurisdiction={jurisdiction} liability={liability} running={running} onRerun={rerun}
        signedCurrent={signedCurrent} notice={notice} error={error} onDismiss={() => { setNotice(null); setError(null); }} follow={follow} />

      <div id="liability-overview" className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-[150px]">
        <FaultRuleCard rules={rules} model={model} governingLaw={governingLaw} state={state} onOpenJurisdiction={onOpenJurisdiction} onLaw={openLaw} />
        <NoFaultCard rules={rules} liability={liability} />
        <PartySummary model={model} rules={rules} inputs={inputs} onLaw={openLaw} />
      </div>

      <FaultAllocation model={model} rules={rules} inputs={inputs} liability={liability} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <PlaintiffModule model={model} liability={liability} inputs={inputs} save={save} rules={rules}
            onOpen={(f, view) => openFinding({ kind: "plaintiff", f }, view)} onLaw={openLaw} onDetails={(f) => setFindingOpen({ kind: "plaintiff", f })} />
          <DefendantModule model={model} inputs={inputs} save={save}
            onOpen={(f, view) => openFinding({ kind: "defendant", f }, view)} onLaw={openLaw} onDetails={(f) => setFindingOpen({ kind: "defendant", f })} />
          <OtherParties model={model} liability={liability} onOpenDefendants={onOpenDefendants} onOpenJurisdiction={onOpenJurisdiction} />
          <NegligenceTimeline model={model} onFinding={(f) => setFindingOpen({ kind: "defendant", f })} onOpenDocs={onOpenDocs} />
        </div>
        <aside className="space-y-6 min-w-0" aria-label="Supporting analysis">
          <Recommendations model={model} caseData={caseData} save={save} />
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

function Header({ caseData, model, inputs, jurisdiction, liability, running, onRerun, signedCurrent, notice, error, onDismiss, follow }: {
  caseData: LiabilityWorkspaceProps["caseData"]; model: LiabilityModel; inputs: Inputs; jurisdiction: Jx; liability: Liability; running: boolean; onRerun: () => void;
  signedCurrent: boolean; notice: string | null; error: string | null; onDismiss: () => void; follow: (t: string) => void;
}) {
  const status = signedCurrent ? "Signed off" : inputs.signOff ? "Changed since sign-off" : model.blocking.length ? "Blocked — attorney inputs needed" : "Ready for sign-off";
  const accrual = workingDeadline(jurisdiction);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="eyebrow mb-1.5 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Liability Analysis · Pre-suit</div>
          <h1 className="page-title" style={{ fontSize: "24px" }}>{caseData.caseName}</h1>
          <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap mt-2 secondary-text">
            {caseData.caseType && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-ink text-white text-xs font-semibold">
                {[caseData.caseType, caseData.caseSubType].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="mono-ref text-ink">{caseData.caseId}</span>
            <span>· Incident {model.fmtIso(model.recorded)} <span className="text-[#8A98A3]">(record · time not on record)</span></span>
            {model.datesDiffer && <Pill className="pill-progress">Evidence places it on {model.fmtIso(model.anchor)}</Pill>}
            {caseData.jurisdiction && <span>· {caseData.jurisdiction}</span>}
            <span>· Accrual {accrual ? <>{formatDate(accrual.row.start)} <span className="text-[#8A98A3]">({accrual.row.status === "Open" ? "working" : "uncertain"}, not verified)</span></> : "Not available"}</span>
            <span>· {liability.filing}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-[#5B6B78]">
            <Pill className={signedCurrent ? "pill-complete" : model.blocking.length ? "pill-risk" : "pill-progress"}>{status}</Pill>
            <span>{inputs.lastRun ? `Last run ${inputs.lastRun.at} by ${inputs.lastRun.by}` : "Not yet run — figures below are built from the current record"}</span>
          </div>
        </div>
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

function FaultRuleCard({ rules, model, governingLaw, state, onOpenJurisdiction, onLaw }: {
  rules: Rules; model: LiabilityModel; governingLaw?: string; state?: string; onOpenJurisdiction?: () => void; onLaw: (id?: string) => void;
}) {
  const auth = model.authorities.find((a) => a.id === "il-2-1116");
  const verified = auth && !model.unverified.some((a) => a.id === auth.id);
  return (
    <div className="lg-card p-5 flex flex-col">
      <div className="eyebrow mb-2">Governing fault rule</div>
      {rules ? (
        <>
          <h3 className="card-title">{rules.state} · {rules.faultRuleLabel}</h3>
          <p className="secondary-text mt-1.5 leading-relaxed">{rules.plaintiffFault}</p>
          <p className="text-xs text-[#5B6B78] mt-1.5">Threshold: <span className="font-semibold text-ink">{rules.threshold}</span></p>
          {auth && (
            <button onClick={() => onLaw(auth.id)} className="text-xs text-deep font-semibold hover:text-ink mt-1 self-start inline-flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /> {auth.citation}
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Pill className={GREY}>From Jurisdiction module · read-only</Pill>
            <Pill className={governingLaw ? "pill-complete" : "pill-progress"}>{governingLaw ? "Governing law approved" : "Governing law provisional"}</Pill>
            <Pill className={verified ? "pill-complete" : "pill-progress"}>{verified ? "Verified by attorney" : "Unverified — attorney review required"}</Pill>
          </div>
          <button onClick={onOpenJurisdiction} className="mt-auto pt-3 self-start text-xs font-semibold text-deep hover:text-ink inline-flex items-center gap-1">Review in Jurisdiction module <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} /></button>
        </>
      ) : (
        <p className="secondary-text">No liability rules are recorded for {state ?? "this jurisdiction"}. Pending verification — the fault rule needs attorney review.</p>
      )}
    </div>
  );
}

function NoFaultCard({ rules, liability }: { rules: Rules; liability: Liability }) {
  return (
    <div className="lg-card p-5">
      <div className="eyebrow mb-2">No-fault / PIP</div>
      {rules ? (
        <>
          <h3 className="card-title">Tort claim · {rules.noFault.applicable ? "Threshold applies" : "No threshold"}</h3>
          <p className="secondary-text mt-1.5 leading-relaxed">{rules.noFault.detail}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Pill className={rules.noFault.applicable ? "pill-progress" : "pill-complete"}>Threshold check: {rules.noFault.applicable ? "applies" : "not applicable"}</Pill>
            <Pill className={GREY}>Medical payments (MedPay): not applicable</Pill>
          </div>
          <div className="mt-3 pt-3 border-t border-line space-y-1">
            <p className="eyebrow">Recovery sources</p>
            {liability.recoverySources.map((r) => (
              <p key={r.name} className="text-xs text-[#5B6B78]"><span className="font-semibold text-ink">{r.name}</span> · {r.why}</p>
            ))}
            <p className="text-[11px] text-[#8A98A3]">Recovery sources are excluded from fault allocation.</p>
          </div>
        </>
      ) : <p className="secondary-text">Pending verification — no rules recorded for this jurisdiction.</p>}
    </div>
  );
}

function PartySummary({ model, rules, inputs, onLaw }: { model: LiabilityModel; rules: Rules; inputs: Inputs; onLaw: (id?: string) => void }) {
  const p = inputs.plaintiffOverride;
  return (
    <div className="lg-card p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="eyebrow">Defendant liability</div>
        <span className="text-[11px] text-[#8A98A3]">Expected · range</span>
      </div>
      <ul className="space-y-2">
        {model.parties.map((pt, i) => (
          <li key={pt.candidate.id} className={`flex items-start gap-2 ${pt.choice === "do-not-pursue" ? "opacity-60" : ""}`}>
            <span className={`w-2.5 h-2.5 rounded-sm mt-1 shrink-0 ${pt.choice === "do-not-pursue" ? "bg-line" : PARTY_BAR[i % PARTY_BAR.length]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink leading-snug">{pt.candidate.short} <span className="font-normal text-[#5B6B78]">{pt.candidate.role.split("·")[0].trim().toLowerCase()}</span></p>
              <p className="text-[11px] text-[#5B6B78]">{pt.shown}/{pt.total} elements shown · {pt.choice === "name" ? "Name" : pt.choice === "investigate" ? "Investigate" : "Do not pursue"} ({pt.confirmed ? "attorney" : "system"})</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-ink tabular-nums">{pt.override ? `${pt.override.expected}%` : <span className="text-xs font-normal text-[#8A98A3]">Not calculated</span>}</p>
              {range(pt.override) && <p className="mono-ref text-[11px]">{range(pt.override)}</p>}
            </div>
          </li>
        ))}
        <li className="flex items-start gap-2 pt-2 border-t border-line">
          <span className="w-2.5 h-2.5 rounded-sm mt-1 shrink-0 bg-[#B91C1C]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Plaintiff <span className="font-normal text-[#5B6B78]">{p ? "attorney estimate · no fault on record" : "no fault on record"}</span></p>
            <p className="text-[11px] text-[#5B6B78]">{model.plaintiffFindings.filter((x) => x.status === "Not yet known").length} open checks · none indicates fault</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-ink tabular-nums">{p ? `${p.expected}%` : <span className="text-xs font-normal text-[#8A98A3]">Not calculated</span>}</p>
            {range(p) && <p className="mono-ref text-[11px]">{range(p)}</p>}
          </div>
        </li>
      </ul>
      {rules && (
        <p className="text-[11px] text-[#5B6B78] mt-3 leading-snug">
          Joint and several: medical expenses jointly; other damages split at 25% of total fault.{" "}
          <button onClick={() => onLaw("il-2-1117")} className="text-[11px] font-semibold text-deep hover:text-ink">735 ILCS 5/2-1117 · unverified</button>
        </p>
      )}
      <p className="text-[11px] text-[#8A98A3] mt-1.5 leading-snug">Shares appear only when the attorney enters them — no allocation model is calculated.</p>
    </div>
  );
}

// ── Fault allocation ──────────────────────────────────────────────────────────

function AllocationBar({ shares, empty }: { shares: { key: string; label: string; value: number; cls: string }[]; empty: string[] }) {
  const total = shares.reduce((n, s) => n + s.value, 0);
  return (
    <div className="flex h-10 rounded-lg overflow-hidden border border-line" role="img"
      aria-label={shares.length ? `Attorney-assessed shares: ${shares.map((s) => `${s.label} ${s.value}%`).join(", ")}` : "No shares calculated"}>
      {shares.filter((s) => s.value > 0).map((s) => (
        <div key={s.key} className={`${s.cls} text-white text-xs font-semibold flex items-center px-2 min-w-0`} style={{ width: `${s.value}%` }} title={`${s.label} · ${s.value}%`}>
          <span className="truncate">{s.label} · {s.value}%</span>
        </div>
      ))}
      {total < 100 && (
        <div className="flex-1 bg-track text-[11px] text-[#5B6B78] flex items-center px-3 min-w-0">
          <span className="truncate">{shares.length ? `Not allocated · ${100 - total}%` : "Not calculated"}{empty.length ? ` — ${empty.join(", ")}` : ""}</span>
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
    <Section
      id="liability-allocation"
      eyebrow={`Fault allocation · ${view === "expected" ? "Expected" : view === "defense" ? "Defense view" : "Litigation outlook"}`}
      title="How responsibility may be distributed"
      sub="Analytical shares for demand strategy and insurer targeting — not a verdict or settlement prediction."
      right={
        <div role="tablist" aria-label="Allocation view" className="flex items-center gap-1.5 flex-wrap">
          {([["defense", "Defense view"], ["expected", "Expected"], ["outlook", "Litigation outlook"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${view === k ? "bg-deep text-white border-deep" : "bg-white text-ink border-line hover:bg-wash"}`}>{l}</button>
          ))}
        </div>
      }
    >
      <div className="p-5 space-y-3">
        {view === "expected" && (
          <>
            <AllocationBar shares={[...plaintiffShare(p?.expected), ...defendantShares]} empty={notEstimated} />
            <p className="text-xs text-[#5B6B78]">Expected: the attorney's working estimates, entered with reasons in the estimate panels. No model estimate exists.</p>
          </>
        )}
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
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-3 border-t border-line text-xs text-[#5B6B78]">
          <span><span className="font-semibold text-[#B91C1C]">Plaintiff</span> · {p ? `${p.expected}% expected${range(p) ? ` · range ${range(p)}` : ""}${p.defense !== undefined ? ` · defense view ${p.defense}%` : ""}` : "not calculated — no plaintiff fault on record"}</span>
          {model.groups.map((g) => (
            <span key={g.head.id}><span className="font-semibold text-ink">{g.head.short} + {g.through.short}</span> grouped for a vicarious share; {g.through.short.toLowerCase()} scored separately</span>
          ))}
          {liability.recoverySources.map((r) => <span key={r.name}><span className="font-semibold text-ink">{r.name}</span> excluded (recovery source)</span>)}
          <span><span className="font-semibold text-ink">Gaps</span> · {model.recommendations.filter((r) => r.state !== "received").length} records outstanding</span>
        </div>
      </div>
    </Section>
  );
}

// ── Finding cards ─────────────────────────────────────────────────────────────

function EvidenceBlock({ evidence, empty }: { evidence: EvidenceRef[]; empty: string }) {
  const [open, setOpen] = useState(false);
  const on = evidence.filter((e) => e.onFile).length;
  return (
    <div className="mt-3 pt-3 border-t border-line">
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

function FindingCard({ code, category, title, party, body, status, statusCls, extra, scenario, evidence, emptyEvidence, onPreview, onInsights, law, reviewed, onDetails }: {
  code: string; category: string; title: string; party?: string; body: React.ReactNode; status: string; statusCls: string; extra?: React.ReactNode; scenario?: ElementStatus;
  evidence: EvidenceRef[]; emptyEvidence: string; onPreview: () => void; onInsights: () => void; law?: { onClick?: () => void; label: string }; reviewed?: string; onDetails: () => void;
}) {
  return (
    <div className="lg-card-i rounded-xl border border-line bg-white p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="eyebrow flex items-center gap-1.5 min-w-0"><Scale className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /><span className="truncate">{category}</span></div>
        {party ? <Pill className="pill-neutral">{party}</Pill> : <span className="mono-ref text-[11px]">{code}</span>}
      </div>
      <button onClick={onDetails} className="text-left card-title leading-snug hover:text-deep transition-colors">{title}</button>
      <div className="secondary-text mt-1.5 leading-relaxed">{body}</div>
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Pill className={statusCls}>{status}</Pill>
        {party && <span className="mono-ref text-[11px]">{code}</span>}
        {extra}
        {scenario && <Pill className="pill-neutral">Scenario: {scenario}</Pill>}
        {reviewed && <Pill className={reviewed === "changed" ? "pill-risk" : "pill-complete"}>{reviewed === "changed" ? "Changed since review" : "Reviewed"}</Pill>}
      </div>
      <EvidenceBlock evidence={evidence} empty={emptyEvidence} />
      <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
        {law && (
          <button onClick={law.onClick} disabled={!law.onClick} title={law.onClick ? undefined : "No legal authority is recorded for this finding"}
            className="flex items-center justify-center gap-1.5 px-2 py-2 bg-tint border border-[#D6F2F7] text-deep rounded-lg text-xs font-semibold hover:bg-[#D6F2F7] disabled:bg-white disabled:border-line disabled:text-[#8A98A3] disabled:cursor-not-allowed transition-colors">
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} /> {law.label}
          </button>
        )}
        <button onClick={onPreview} className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white border border-line text-ink rounded-lg text-xs font-semibold hover:bg-wash transition-colors">
          <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview
        </button>
        <button onClick={onInsights} className={`flex items-center justify-center gap-1.5 px-2 py-2 bg-white border border-line text-deep rounded-lg text-xs font-semibold hover:bg-tint transition-colors ${law ? "col-span-2" : ""}`}>
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

function EstimateForm({ placeholder, current, withDefense, onSave, onReset }: {
  placeholder: string; current?: Override; withDefense?: boolean;
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
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${withDefense ? "grid-cols-2" : "grid-cols-3"}`}>
        {fields.map(([k, l]) => (
          <label key={k} className="block">
            <span className="text-[11px] text-[#5B6B78]">{l}</span>
            <input inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={k === "expected" ? placeholder : ""} className={INPUT} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-[11px] text-[#5B6B78]">Reason (required)</span>
        <textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} className={`${INPUT} resize-y`} />
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
  const reviewed = inputs.plaintiffReview?.signature === model.plaintiffSignature;
  const o = inputs.plaintiffOverride;
  return (
    <Section id="liability-plaintiff" eyebrow="L4 · Plaintiff negligence" title={`${liability.plaintiff.name} · what the defense can point to`}
      sub="Checks run on her own conduct. None attributes fault to her; open questions are labelled as open, not as findings."
      right={
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-[#5B6B78]">
            Defense view <span className="font-semibold text-[#B91C1C]">{o?.defense !== undefined ? `${o.defense}%` : "—"}</span> → after playbook <span className="font-semibold text-[#15803D]">{o ? `${o.expected}%` : "—"}</span>
            {!o && <span className="text-[#8A98A3]"> · not calculated</span>}
          </span>
          <button onClick={() => save((p) => ({ ...p, plaintiffReview: { at: stampNow(), by: REVIEWER, signature: model.plaintiffSignature } }), { action: "Plaintiff conduct items reviewed", detail: `${model.plaintiffFindings.length} checks` }, "Plaintiff conduct items marked reviewed.")}
            disabled={reviewed} className={BTN_S}>
            {reviewed ? <><Check className="w-3.5 h-3.5" strokeWidth={2} /> Reviewed</> : "Mark reviewed"}
          </button>
        </div>
      }>
      <ElementTabs active={tab} onChange={setTab} counts={counts} label="Plaintiff negligence elements" />
      <div className="p-5 bg-offwhite">
        {list.length === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No {ELEMENTS.find((e) => e.key === tab)!.label.toLowerCase()} check applies to her on the current record.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {list.map((p) => (
              <FindingCard key={p.id} code={p.code} category={p.category} title={p.title} body={p.description}
                status={p.status} statusCls={PLAINTIFF_PILL[p.status]} evidence={p.evidence}
                extra={p.element === "breach" ? <span className="text-[11px] text-[#5B6B78]">Share: not calculated</span> : undefined}
                emptyEvidence={p.status === "Not applicable" ? "No documents needed" : p.moduleSource ? `From ${p.moduleSource}` : "No documents linked"}
                onPreview={() => onOpen(p, "preview")} onInsights={() => onOpen(p, "insights")} onDetails={() => onDetails(p)}
                law={p.status === "Not applicable" ? undefined : { label: p.element === "breach" ? "Violated law" : "Triggering law", onClick: p.authorityId ? () => onLaw(p.authorityId) : undefined }} />
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 p-5 border-t border-line">
        <div className="rounded-xl border border-line p-4 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="eyebrow text-deep">Reduction playbook</h3>
            <label className="flex items-center gap-2 text-xs text-[#5B6B78] min-w-0 max-w-full">Item
              <select value={selected?.id} onChange={(e) => setItem(e.target.value)} className="px-2 py-1 rounded-lg border border-line text-xs bg-white text-ink max-w-[260px] min-w-0 w-full sm:w-auto">
                {model.plaintiffFindings.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}
              </select>
            </label>
          </div>
          {selected && (
            <ol className="divide-y divide-line">
              {selected.rows.map((pb, i) => (
                <li key={pb.factor} className="py-2.5 flex items-start gap-3">
                  <span className="text-xs text-[#8A98A3] tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink"><span className="font-semibold">{pb.factor}</span> · {pb.explanation}</p>
                    <p className="text-xs text-[#5B6B78] mt-0.5">Evidence: {pb.evidence}{pb.followUp && <> · Next: {pb.followUp}</>}{pb.origin === "record" && <span className="text-[#8A98A3]"> · read from the record</span>}</p>
                    {pb.authorityId && <button onClick={() => onLaw(pb.authorityId)} className="text-[11px] font-semibold text-deep hover:text-ink mt-0.5">Authority · {model.authorities.find((a) => a.id === pb.authorityId)?.citation}</button>}
                  </div>
                  <Pill className={EFFECT_PILL[pb.effect]}>{pb.effect}</Pill>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[11px] text-[#8A98A3] mt-2">Adverse facts are shown, not hidden. A factor marked Pending is unresolved, not favourable.</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <h3 className="eyebrow mb-3">Plaintiff estimate</h3>
            <div className="grid grid-cols-3 text-center">
              {([["Low", o?.low], ["Expected", o?.expected], ["High", o?.high]] as const).map(([l, v]) => (
                <div key={l}>
                  <p className={`text-xl font-semibold tabular-nums ${v === undefined ? "text-[#9BA8B4]" : l === "High" ? "text-[#B91C1C]" : l === "Low" ? "text-[#15803D]" : "text-ink"}`}>{pct(v)}</p>
                  <p className="text-[11px] text-[#5B6B78]">{l}</p>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-[#5B6B78] mt-3 space-y-1 leading-snug">
              <p>Her share of fault — not a settlement or verdict probability.</p>
              <p><span className="font-semibold text-ink">Method:</span> no validated model; the model estimate is not calculated. Values shown are the attorney's override{o ? ` — ${overrideLine(o)}` : " — none entered"}.</p>
              {rules && <p><span className="font-semibold text-ink">Legal risk:</span> under {rules.state} {rules.faultRuleLabel.toLowerCase()}, her fault reduces damages up to 50% and bars recovery only above it — the risk is the size of a reduction, not a bar{model.ruleResult ? ` (at ${o!.expected}%: ${model.ruleResult.label})` : ""}.</p>}
              <p><span className="font-semibold text-ink">Confidence:</span> not scored.</p>
            </div>
          </div>
          <div className="rounded-xl border border-line p-4">
            <h3 className="eyebrow mb-2">Attorney override</h3>
            <EstimateForm placeholder="e.g. 5" current={o} withDefense
              onSave={(est, reason) => {
                if (totalWith(inputs, "plaintiff", est.expected) > 100) return OVER_100;
                return save((p) => ({ ...p, plaintiffOverride: { ...est, reason, by: REVIEWER, at: stampNow(), previous: p.plaintiffOverride ? { expected: p.plaintiffOverride.expected, low: p.plaintiffOverride.low, high: p.plaintiffOverride.high, defense: p.plaintiffOverride.defense } : null } }),
                  { action: "Plaintiff estimate overridden", from: o ? `${o.expected}%` : "Not calculated", to: `${est.expected}%`, reason }, "Plaintiff estimate saved as an attorney override.") ? null : "Not saved.";
              }}
              onReset={(reason) => save((p) => ({ ...p, plaintiffOverride: undefined }), { action: "Plaintiff override removed", from: o ? `${o.expected}%` : undefined, to: "Not calculated", reason }, "Override removed — the model value (not calculated) is shown.") ? null : "Not saved."} />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── L5 · Defendant negligence ────────────────────────────────────────────────

function DefendantModule({ model, inputs, save, onOpen, onLaw, onDetails }: {
  model: LiabilityModel; inputs: Inputs; save: Save; onOpen: (f: DefendantFinding, view: "preview" | "insights") => void; onLaw: (id?: string) => void; onDetails: (f: DefendantFinding) => void;
}) {
  const all = model.parties.map((p) => p.candidate.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(all));
  const [tab, setTab] = useState<ElementKey>("duty");
  const filtered = model.defendantFindings.filter((f) => [...selected].some((id) => model.forParty(f, id)));
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e.key, filtered.filter((f) => f.kind === e.key).length]));
  const list = filtered.filter((f) => f.kind === tab);
  const allOn = selected.size === all.length;
  const toggle = (id: string) => setSelected((s) => {
    if (s.size === all.length) return new Set([id]);
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const reviewState = (f: DefendantFinding) => {
    const r = inputs.reviewed[f.id];
    if (!r) return undefined;
    return r.signature === model.snapshot[f.id] ? "reviewed" : "changed";
  };
  return (
    <Section id="liability-defendants" eyebrow="L5 · Defendant negligence" title="Defendants from Defendants module"
      sub="Each card is a liability element recorded for that party in the Defendant Analysis, with its source. Status and evidence are changed there, not here."
      right={
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(new Set(all))} disabled={allOn} className={BTN_S}>Select all</button>
          <button onClick={() => setSelected(new Set())} disabled={selected.size === 0} className={BTN_S}>Deselect all</button>
        </div>
      }>
      <div className="px-5 pt-4 flex flex-wrap gap-2" role="group" aria-label="Defendant filter">
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
      <div className="mt-3"><ElementTabs active={tab} onChange={setTab} counts={counts} label="Defendant negligence elements" /></div>
      <div className="p-5 bg-offwhite">
        {selected.size === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No defendants selected. Choose one above, or Select all.</p>
        ) : list.length === 0 ? (
          <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg bg-white">No {ELEMENTS.find((e) => e.key === tab)!.label.toLowerCase()} element is recorded for the selected {selected.size === 1 ? "defendant" : "defendants"}.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {list.map((f) => (
              <FindingCard key={f.id} code={f.code} category={f.category} title={f.title} party={f.shared ? "All" : f.candidate.short}
                body={<>{f.description ?? (f.note ? `Record: ${f.note}.` : "No source recorded.")}{f.missing && f.status !== "Shown" && f.description !== f.missing && <span className="block text-[#B45309] mt-1">Missing: {f.missing}</span>}</>}
                status={f.status} statusCls={ELEMENT_PILL[f.status]} scenario={f.scenarioStatus} evidence={f.evidence}
                emptyEvidence={f.status === "Not yet known" ? "No documents yet" : "No documents linked"}
                onPreview={() => onOpen(f, "preview")} onInsights={() => onOpen(f, "insights")} onDetails={() => onDetails(f)}
                law={{ label: f.kind === "breach" ? "Violated law" : "Triggering law", onClick: f.authorityId ? () => onLaw(f.authorityId) : undefined }} reviewed={reviewState(f)} />
            ))}
          </div>
        )}
      </div>
      <Strengthening model={model} inputs={inputs} save={save} />
    </Section>
  );
}

function Strengthening({ model, inputs, save }: { model: LiabilityModel; inputs: Inputs; save: Save }) {
  const [pid, setPid] = useState(model.inAnalysis[0]?.candidate.id ?? model.parties[0]?.candidate.id);
  const rows = model.strengtheningFor(pid);
  const [overrideFor, setOverrideFor] = useState(model.inAnalysis[0]?.candidate.id);
  const target = model.inAnalysis.find((p) => p.candidate.id === overrideFor) ?? model.inAnalysis[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 p-5 border-t border-line">
      <div className="rounded-xl border border-line p-4 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="eyebrow text-deep">Strengthening playbook</h3>
          <label className="flex items-center gap-2 text-xs text-[#5B6B78]">Defendant
            <select value={pid} onChange={(e) => setPid(e.target.value)} className="px-2 py-1 rounded-lg border border-line text-xs bg-white text-ink">
              {model.parties.map((p) => <option key={p.candidate.id} value={p.candidate.id}>{p.candidate.short}</option>)}
            </select>
          </label>
        </div>
        <ol className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.title} className="py-2.5 flex items-start gap-3">
              <span className="text-xs text-[#8A98A3] tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink"><span className="font-semibold">{r.title}</span> · {r.explanation}</p>
                <p className="text-xs text-[#5B6B78] mt-0.5">Evidence: {r.evidence}{r.followUp && <> · Next: {r.followUp}</>}</p>
              </div>
              <Pill className={TONE_PILL[r.tone]}>{r.status}</Pill>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-line p-4">
          <h3 className="eyebrow mb-2">Defendant estimates</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-[#5B6B78]"><th className="text-left font-semibold py-1">Party</th><th className="text-right font-semibold py-1">Expected</th><th className="text-right font-semibold py-1">Range</th></tr></thead>
            <tbody>
              {model.inAnalysis.map((p) => (
                <tr key={p.candidate.id} className="border-t border-line">
                  <td className="py-1.5 text-ink">{p.candidate.short}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{p.override ? `${p.override.expected}%` : <span className="font-normal text-[#8A98A3]">Not calculated</span>}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#5B6B78]">{range(p.override) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-[#8A98A3] mt-2 leading-snug">Shares are attorney entries. Under joint and several liability a share is not the amount a defendant can be made to pay.</p>
        </div>
        {target && (
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="eyebrow">Attorney override</h3>
              <select value={target.candidate.id} onChange={(e) => setOverrideFor(e.target.value)} aria-label="Defendant to override" className="px-2 py-1 rounded-lg border border-line text-xs bg-white text-ink max-w-[150px]">
                {model.inAnalysis.map((p) => <option key={p.candidate.id} value={p.candidate.id}>{p.candidate.short}</option>)}
              </select>
            </div>
            {target.override && <p className="text-[11px] text-[#5B6B78] mb-2">Current: {overrideLine(target.override)}</p>}
            <EstimateForm key={target.candidate.id} placeholder="e.g. 60" current={target.override}
              onSave={(est, reason) => {
                if (totalWith(inputs, target.candidate.id, est.expected) > 100) return OVER_100;
                const prev = inputs.defendantOverrides[target.candidate.id];
                return save((p) => ({ ...p, defendantOverrides: { ...p.defendantOverrides, [target.candidate.id]: { ...est, reason, by: REVIEWER, at: stampNow(), previous: prev ? { expected: prev.expected, low: prev.low, high: prev.high } : null } } }),
                  { action: `Estimate overridden · ${target.candidate.short}`, from: prev ? `${prev.expected}%` : "Not calculated", to: `${est.expected}%`, reason }, `${target.candidate.short} estimate saved as an attorney override.`) ? null : "Not saved.";
              }}
              onReset={(reason) => save((p) => { const { [target.candidate.id]: _, ...rest } = p.defendantOverrides; return { ...p, defendantOverrides: rest }; },
                { action: `Override removed · ${target.candidate.short}`, to: "Not calculated", reason }, "Override removed.") ? null : "Not saved."} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Other parties ─────────────────────────────────────────────────────────────

function OtherParties({ model, liability, onOpenDefendants, onOpenJurisdiction }: { model: LiabilityModel; liability: Liability; onOpenDefendants?: (n: string) => void; onOpenJurisdiction?: () => void }) {
  const link = (label: string, onClick?: () => void) => <button onClick={onClick} className="text-xs font-semibold text-deep hover:text-ink underline underline-offset-2 text-left">{label}</button>;
  const rows = [
    ...model.parties.filter((p) => p.choice !== "name").map((p) => ({
      name: p.candidate.name, sub: p.candidate.role, status: p.choice === "investigate" ? "Under investigation" : "Not pursued",
      cls: p.choice === "investigate" ? "pill-progress" : GREY, why: p.candidate.summary,
      action: link("Review in Defendant Analysis", () => onOpenDefendants?.(p.candidate.name)),
    })),
    ...liability.recoverySources.map((r) => ({ name: r.name, sub: "Insurance", status: r.status, cls: "pill-neutral", why: r.why, action: <span className="text-xs text-[#5B6B78]">{r.next}</span> })),
    ...liability.notPursued.map((n) => ({ name: n.name, sub: "Named in the record", status: "Not pursued", cls: GREY, why: n.why, action: link("Review in Jurisdiction module", onOpenJurisdiction) })),
  ];
  return (
    <Section id="liability-other-parties" title="Other parties" sub="Parties whose responsibility is unresolved, and sources of recovery that are not fault parties.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-wash border-b border-line">
            <tr>{["Other parties", "Status", "Why surfaced", "Action"].map((h) => <th key={h} className="px-5 py-2.5 text-left eyebrow">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-5 py-3 align-top"><p className="text-sm font-semibold text-ink">{r.name}</p><p className="text-xs text-[#5B6B78]">{r.sub}</p></td>
                <td className="px-5 py-3 align-top"><Pill className={r.cls}>{r.status}</Pill></td>
                <td className="px-5 py-3 align-top text-sm text-[#5B6B78] max-w-md">{r.why}</td>
                <td className="px-5 py-3 align-top">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
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
    const marker = isWindow
      ? "bg-[#F5C26B] border-[#F5C26B]"
      : impact ? "bg-ink border-ink" : `bg-white ${ring(t.party)}`;
    return (
      <li className="grid grid-cols-[12px_minmax(0,1fr)] sm:grid-cols-[64px_12px_minmax(0,1fr)] gap-x-3">
        {/* Date — the record gives days, not times. On small screens it moves into the card. */}
        <span className={`hidden sm:block mono-ref text-xs pt-2.5 ${isWindow ? "text-[#B45309]" : ""}`}>{dateLabel}</span>
        {/* Rail: an unbroken line through every marker in the group */}
        <div className="flex flex-col items-center">
          <div className={`w-px h-3 ${first ? "" : "bg-line"}`} />
          <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${marker}`} />
          {!last && <div className="w-px flex-1 bg-line" />}
        </div>
        <div className={last ? "" : "pb-3"}>
          {isWindow ? (
            <div className="rounded-lg border border-[#FDE6C8] bg-[#FFFBF5] px-4 py-2.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="eyebrow text-[#B45309]"><span className="sm:hidden mono-ref mr-1.5">{model.fmtIso(t.iso).replace(/, \d{4}$/, "")} ·</span>{t.title}</span>
                <span className="text-[11px] text-[#B45309]">Causal window</span>
              </div>
              <p className="secondary-text text-ink mt-1 leading-relaxed">{t.detail}</p>
            </div>
          ) : (
            <div className={`rounded-lg border bg-white px-4 py-2.5 transition-colors hover:border-soft ${t.phase === "evidence" ? "border-dashed border-line" : "border-line"}`}>
              <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap">
                <span className="eyebrow text-deep flex items-center gap-1.5 flex-wrap">
                  <span className="sm:hidden mono-ref text-ink normal-case">{dateLabel} ·</span>
                  {impact && <span className="pill pill-risk text-[10px]">Harm</span>}
                  {t.party}
                </span>
                {t.findings.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {t.findings.map((f) => (
                      <button key={f.id} onClick={() => onFinding(f)} title={f.title} className="mono-ref text-[11px] text-deep hover:underline">{f.code} · {f.shared ? "All" : f.candidate.short}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-ink leading-snug mt-1">{t.title}</p>
              {t.detail && <p className="secondary-text leading-relaxed mt-1">{t.detail}</p>}
              <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-2">
                {t.origin !== "record" && (
                  <span className="flex items-center gap-1.5 secondary-text">
                    <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                    {t.evidence.length === 0 ? "No supporting docs linked" : `${t.evidence.length} Supporting ${t.evidence.length === 1 ? "Doc" : "Docs"} · ${on.length} on file`}
                  </span>
                )}
                {t.origin === "manual" && <Pill className="pill-neutral">Added by attorney</Pill>}
                {t.conflict && <Pill className="pill-progress">Disputed date · {t.conflict}</Pill>}
                {on.length > 0 && (
                  <button onClick={() => onOpenDocs(on.map((e) => e.file), "preview", { contextType: "Timeline Event", reference: t.title })} className="text-xs font-semibold inline-flex items-center gap-1 text-deep hover:text-ink">
                    <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <Section id="liability-timeline" eyebrow="Negligence timeline" title="How each breach led to the impact"
      right={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5B6B78]">
          {parties.map((p) => <span key={p} className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot(p)}`} />{p}</span>)}
          {model.timeline.some((t) => t.kind === "window") && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-[#F5C26B]" />Causal window</span>}
        </div>
      }>
      <div className="p-5 space-y-6">
        {phases.map((ph) => {
          const items = model.timeline.filter((t) => t.phase === ph.key);
          return (
            <div key={ph.key}>
              <div className="eyebrow pb-2 mb-3 border-b border-line">{ph.label}</div>
              {items.length === 0
                ? <p className="secondary-text py-3 text-center border border-dashed border-line rounded-lg">{ph.key === "evidence" ? "No requests or preservation decisions recorded yet. They appear here when recorded in Recommendations or the Evidence Ledger." : "No events on the timeline in this phase."}</p>
                : <ol>{items.map((t, i) => <Event key={t.id} t={t} first={i === 0} last={i === items.length - 1} />)}</ol>}
            </div>
          );
        })}
      </div>
      <p className="px-5 py-3 border-t border-line bg-wash text-sm text-ink"><span className="font-semibold">Reading it:</span> {model.reading}</p>
    </Section>
  );
}

// ── Right column ──────────────────────────────────────────────────────────────

function Panel({ id, eyebrow, title, badge, children }: { id?: string; eyebrow: string; title?: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className="lg-card overflow-hidden scroll-mt-[150px] focus:outline-none">
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
    <Panel id="liability-recommendations" eyebrow="Recommendations" title="Evidence to request now" badge={urgent ? <Pill className="pill-risk">{urgent} urgent</Pill> : undefined}>
      <ul className="divide-y divide-line">
        {model.recommendations.map((r) => {
          const codes = r.answers.map((a) => model.defendantFindings.find((f) => f.id === a)?.code).filter(Boolean);
          return (
            <li key={r.id} className={`p-4 ${r.state === "received" ? "bg-wash" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Pill className={r.state === "received" ? "pill-complete" : PRIORITY_PILL[r.priority]}>{r.state === "received" ? "Received" : r.priority}</Pill>
                <span className="text-[11px] text-[#5B6B78] text-right">{codes.length ? `Answers ${codes.join(", ")}` : r.preSuit === "Yes" ? "Pre-suit" : r.preSuit}</span>
              </div>
              <p className="text-sm font-semibold text-ink mt-1.5 leading-snug">{r.title}</p>
              <p className="text-xs text-[#5B6B78] mt-0.5">From {r.custodian} · {r.method}</p>
              <p className="text-xs text-ink mt-1 leading-relaxed break-words">{r.why}</p>
              <p className="text-[11px] text-[#8A98A3] mt-1">
                {r.state === "received" ? <>On file: <span className="mono-ref">{r.receivedFile}</span></> : r.state === "requested" ? `Request recorded ${r.requestedAt} · awaiting the record` : "Deadline: requires verification"}
              </p>
              {r.state !== "received" && (
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <button onClick={() => downloadTextFile(`${safeFileName(r.title)}_DRAFT.txt`, requestLetter(r, caseData))} className={r.priority === "Urgent" ? BTN_P : BTN_S}>
                    <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> {r.draft.label}
                  </button>
                  {r.state === "open" && (
                    <button onClick={() => save((p) => ({ ...p, requested: { ...p.requested, [r.id]: { at: stampNow(), by: REVIEWER } } }), { action: "Request recorded", detail: r.title }, `Recorded as requested: ${r.title}. Nothing was sent from here.`)} className={BTN_S}>
                      Record as requested
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-3 text-[11px] text-[#8A98A3] border-t border-line">A request shows Received when a matching file is added to the case documents. Nothing is sent from this page.</p>
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
        <button disabled title="No case-profile database is connected to this application" className="w-full text-left rounded-lg border border-line px-3 py-2 opacity-60 cursor-not-allowed">
          <span className="text-sm font-semibold text-ink flex items-center gap-1.5"><Search className="w-3.5 h-3.5" strokeWidth={1.75} /> Fetch matching case profiles</span>
          <span className="block text-[11px] text-[#5B6B78]">{liability.research.profileQuery}</span>
          <span className="block text-[11px] text-[#B45309]">Not connected — no case-profile database</span>
        </button>
        <a href={scholar} target="_blank" rel="noreferrer" className="block w-full text-left rounded-lg border border-line px-3 py-2 hover:bg-wash transition-colors">
          <span className="text-sm font-semibold text-ink flex items-center gap-1.5"><Search className="w-3.5 h-3.5" strokeWidth={1.75} /> Web research <ExternalLink className="w-3 h-3 text-deep" strokeWidth={1.75} /></span>
          <span className="block text-[11px] text-[#5B6B78]">Illinois case law: delayed stroke escalation in care facilities</span>
          <span className="block text-[11px] text-[#8A98A3]">Opens Google Scholar · no case details are sent</span>
        </a>
        <p className="text-[11px] text-[#8A98A3]">Findings stay unverified until reviewed, then feed the authority list. Nothing found there is added here automatically.</p>
      </div>
    </Panel>
  );
}

function Exceptions({ liability, onLaw }: { liability: Liability; onLaw: (id?: string) => void }) {
  return (
    <Panel id="liability-exceptions" eyebrow="Fault-rule exceptions · Illinois">
      <ul className="divide-y divide-line">
        {liability.exceptions.map((e) => (
          <li key={e.name} className="px-4 py-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{e.name}</p>
              <p className="text-[11px] text-[#5B6B78]">{e.detail}</p>
              {e.authorityId && <button onClick={() => onLaw(e.authorityId)} className="text-[11px] font-semibold text-deep hover:text-ink">Authority · unverified</button>}
            </div>
            <Pill className={EXCEPTION_PILL[e.status]}>{e.status}</Pill>
          </li>
        ))}
      </ul>
      <p className="px-4 py-3 text-[11px] text-[#8A98A3] border-t border-line">Rated from the record and the Jurisdiction review; not verified.</p>
    </Panel>
  );
}

function Simulator({ model, liability, inputs, save }: { model: LiabilityModel; liability: Liability; inputs: Inputs; save: Save }) {
  const [name, setName] = useState("");
  const toggle = (id: string) => {
    const sc = liability.scenarios.find((s) => s.id === id)!;
    const next = inputs.scenario.includes(id) ? inputs.scenario.filter((x) => x !== id)
      : [...inputs.scenario.filter((x) => !sc.group || liability.scenarios.find((s) => s.id === x)?.group !== sc.group), id];
    save((p) => ({ ...p, scenario: next }));
  };
  const { baseline, preSuit, litigation, total, chosen, ranked, impact } = model.simulator;
  return (
    <Panel id="liability-simulator" eyebrow="Liability simulator" badge={<span className="text-[11px] text-[#8A98A3]">Ranked by impact</span>}>
      <div className="p-4 space-y-2">
        {ranked.map((s) => {
          const on = inputs.scenario.includes(s.id);
          const n = impact(s);
          return (
            <label key={s.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${on ? "border-brand bg-tint" : "border-line border-dashed hover:bg-wash"}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="mt-0.5 accent-[#1E7C99]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink leading-snug">{s.title}</span>
                  <span className="mono-ref text-[11px] text-deep shrink-0">{n ? `+${n}` : "0"}</span>
                </span>
                <span className="block text-[11px] text-[#5B6B78]">{s.assumption}</span>
                <span className={`block text-[11px] ${s.when === "litigation" ? "text-[#B45309]" : "text-[#8A98A3]"}`}>{s.when === "litigation" ? "Litigation only" : "Pre-suit"} · affects {s.affects.join(", ")}</span>
              </span>
            </label>
          );
        })}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {([["Pre-suit scenario", preSuit, chosen.some((s) => s.when === "pre-suit")], ["Litigation outlook", litigation, chosen.length > 0]] as const).map(([l, v, any]) => (
            <div key={l} className="rounded-lg bg-wash p-2.5 text-center">
              <p className="eyebrow">{l}</p>
              <p className={`text-lg font-semibold tabular-nums ${any ? "text-deep" : "text-[#9BA8B4]"}`}>{v.shown}/{total}</p>
              <p className="text-[11px] text-[#5B6B78]">elements shown</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#5B6B78]">Baseline {baseline.shown}/{total} shown, {baseline.open} not yet known{chosen.length ? ` → ${litigation.open} with every selected scenario` : ""}{litigation.resolvedFlags.length ? ` · resolves ${litigation.resolvedFlags.length} record flag` : ""}. Allocation effect: not calculated.</p>
        <div className="flex gap-2 pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" aria-label="Scenario name" className={`${INPUT} py-1.5 text-xs`} />
          <button disabled={!name.trim() || !inputs.scenario.length}
            onClick={() => { if (save((p) => ({ ...p, savedScenarios: [...p.savedScenarios, { id: `sv-${Date.now()}`, name: name.trim(), selected: p.scenario, at: stampNow() }] }), { action: "Scenario saved", detail: name.trim() }, `Scenario “${name.trim()}” saved separately from the baseline.`)) setName(""); }}
            className={BTN_S}>Save</button>
        </div>
        {inputs.savedScenarios.length > 0 && (
          <ul className="space-y-1">
            {inputs.savedScenarios.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-ink truncate">{sv.name} · {sv.selected.length} assumption{sv.selected.length === 1 ? "" : "s"} · {sv.at}</span>
                <button onClick={() => save((p) => ({ ...p, scenario: sv.selected }))} className="font-semibold text-deep hover:text-ink shrink-0">Load</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[#8A98A3]">Estimates for strategy, not verdict predictions. Scenarios are saved separately from the baseline.</p>
      </div>
    </Panel>
  );
}

function AuthorityPanel({ model, inputs, onOpen }: { model: LiabilityModel; inputs: Inputs; onOpen: (a: Authority) => void }) {
  return (
    <Panel id="liability-authority" eyebrow="Legal authority" badge={<span className="text-[11px] text-[#8A98A3] text-right">No legal DB · {model.unverified.length} unverified</span>}>
      <ul className="divide-y divide-line">
        {model.authorities.map((a) => {
          const v = inputs.authorityChecks[a.id];
          return (
            <li key={a.id}>
              <button onClick={() => onOpen(a)} className="w-full text-left px-4 py-2.5 flex items-start justify-between gap-2 hover:bg-wash">
                <span className="min-w-0"><span className="block mono-ref text-ink text-xs">{a.citation}</span><span className="block text-[11px] text-[#5B6B78]">{a.issue}</span></span>
                <Pill className={v ? "pill-complete" : "pill-progress"}>{v ? "Verified" : "Verify"}</Pill>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-3 text-[11px] text-[#8A98A3] border-t border-line">Unverified — attorney review required before any of these is relied on.</p>
    </Panel>
  );
}

function AllocationRules({ rules, model, inputs }: { rules: Rules; model: LiabilityModel; inputs: Inputs }) {
  if (!rules) return null;
  return (
    <Panel eyebrow="Allocation rules applied">
      <dl className="divide-y divide-line">
        {rules.allocation.map((r) => {
          const ok = r.authorityId && inputs.authorityChecks[r.authorityId];
          return (
            <div key={r.label} className="px-4 py-2 flex items-start justify-between gap-3">
              <dt className="text-xs text-[#5B6B78] shrink-0">{r.label}</dt>
              <dd className="text-xs text-ink text-right">{r.value}<span className={`block text-[10px] ${ok ? "text-[#15803D]" : "text-[#B45309]"}`}>{model.authorities.find((a) => a.id === r.authorityId)?.citation} · {ok ? "verified" : "unverified"}</span></dd>
            </div>
          );
        })}
        <div className="px-4 py-2 flex items-start justify-between gap-3">
          <dt className="text-xs text-[#5B6B78] shrink-0">Grouping</dt>
          <dd className="text-xs font-semibold text-ink text-right">{model.groups.length ? model.groups.map((g) => `${g.head.short} + ${g.through.short} (vicarious)`).join("; ") : "No grouping"}</dd>
        </div>
        <div className="px-4 py-2 flex items-start justify-between gap-3">
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
          <li key={r.label} className="px-4 py-2.5 flex items-start justify-between gap-2">
            <span className="min-w-0"><span className="block text-xs text-ink font-semibold">{r.label}</span><span className="block text-[11px] text-[#5B6B78]">{r.basis}</span></span>
            <Pill className={r.cls}>{r.value}</Pill>
          </li>
        ))}
        <li className="px-4 py-2.5 flex items-start justify-between gap-2">
          <span className="block text-xs text-ink font-semibold">Litigation-only evidence</span>
          <span className="text-xs font-semibold text-ink tabular-nums">{model.litigationOnly.length} {model.litigationOnly.length === 1 ? "item" : "items"}</span>
        </li>
      </ul>
      <p className="px-4 py-3 text-[11px] text-[#8A98A3] border-t border-line">Risks read from the record{rules ? ` and ${rules.state} rules` : ""}. Not a probability or a prediction.</p>
    </Panel>
  );
}

function JurisdictionComparison({ jurisdiction, onOpenJurisdiction }: { jurisdiction: Jx; onOpenJurisdiction?: () => void }) {
  const rulesUsed = new Set(jurisdiction?.forums.map((f) => f.appliedRule));
  return (
    <Panel eyebrow="Jurisdiction comparison · read-only">
      <div className="p-4 space-y-2">
        {jurisdiction ? jurisdiction.forums.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-2 text-xs">
            <span><span className="font-semibold text-ink">{f.title}</span>{f.defaultSelected && " · selected"}<span className="block text-[11px] text-[#5B6B78]">{f.court} · {f.cells.basis.value}</span></span>
            <span className="text-right text-[#5B6B78]">{f.appliedRuleLabel}</span>
          </div>
        )) : <p className="text-xs text-[#5B6B78]">No jurisdiction review on record.</p>}
        {jurisdiction && <p className="text-[11px] text-[#5B6B78]">{rulesUsed.size === 1 ? "Rule difference: none — every candidate forum applies Illinois law." : "The candidate forums apply different fault rules."}</p>}
        <button onClick={onOpenJurisdiction} className="text-xs font-semibold text-deep hover:text-ink underline underline-offset-2">Open in Jurisdiction module →</button>
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
  return (
    <Section id="liability-ledger" eyebrow="Evidence ledger" title="Completeness, preservation and spoliation"
      right={
        <div className="flex items-center gap-1.5 flex-wrap" title="Defendant elements marked Shown, of those recorded, for parties in the analysis">
          {model.completeness.map((c) => (
            <Pill key={c.key} className={c.pct === 100 ? "pill-complete" : c.pct ? "pill-progress" : GREY}>{c.label} {c.pct === null ? "—" : `${c.pct}%`} <span className="opacity-70">({c.shown}/{c.total})</span></Pill>
          ))}
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="bg-wash border-b border-line">
            <tr>{["Evidence", "Held by", "Pre-suit?", "Status", "Proves", "Deadline / note"].map((h) => <th key={h} className="px-5 py-2.5 text-left eyebrow">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {model.ledger.map((r) => {
              const on = r.files.filter((f) => f.onFile);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-ink">{r.name}</p>
                    {r.files.length > 0 && r.sourceId !== "case-documents" && <p className="mono-ref text-[11px] break-all">{r.files.map((f) => f.file).join(", ")}</p>}
                    {on.length > 0 && <button onClick={() => onOpenDocs(on.map((f) => f.file), "preview", { contextType: "Evidence", reference: r.name })} className="text-[11px] font-semibold text-deep hover:text-ink mt-0.5">Preview</button>}
                  </td>
                  <td className="px-5 py-3 text-sm text-[#5B6B78]">{r.heldBy}</td>
                  <td className="px-5 py-3"><Pill className={r.preSuit === "Yes" ? "pill-complete" : r.preSuit === "Discovery likely" ? "pill-progress" : GREY}>{r.preSuit === "Discovery likely" ? "Litigation likely" : r.preSuit}</Pill></td>
                  <td className="px-5 py-3"><Pill className={LEDGER_PILL[r.status]}>{r.status}</Pill></td>
                  <td className="px-5 py-3 text-sm text-[#5B6B78]">{r.proves}</td>
                  <td className="px-5 py-3 text-xs text-[#5B6B78] max-w-xs">{r.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5 border-t border-line">
        <div id="decide-preservation" tabIndex={-1} className="rounded-xl border border-[#FDE6C8] bg-[#FFFBF5] p-4 scroll-mt-[150px] focus:outline-none">
          <p className="text-sm font-semibold text-[#B45309] flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" strokeWidth={1.75} /> Spoliation review ({model.spoliationFlags.length})</p>
          <p className="text-xs text-ink mt-1">No confirmed loss, deletion or alleged deletion is on record. {risks.length} facility-held {risks.length === 1 ? "record is" : "records are"} not in the case file — a potential preservation risk, not a loss.</p>
          {risks.length > 0 && <p className="text-[11px] text-[#5B6B78] mt-1">{risks.map((r) => r.name).join(" · ")}</p>}
          {inputs.preservation ? (
            <p className="text-xs text-ink mt-3">Decision: <span className="font-semibold">{inputs.preservation.decision === "send" ? "Send a preservation request" : "Not needed"}</span> · {inputs.preservation.reason} · {inputs.preservation.by}, {inputs.preservation.at}</p>
          ) : risks.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
          )}
        </div>
        <div className="rounded-xl border border-line bg-wash p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Client preservation checklist</p>
            <span className="text-[11px] text-[#5B6B78]">{confirmed} of {checklist.length} confirmed</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {checklist.map((c) => {
              const st = inputs.clientChecklist[c.id];
              return (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      {st?.state === "confirmed" ? <Check className="w-3.5 h-3.5 text-[#15803D]" strokeWidth={2} /> : <Circle className="w-3 h-3 text-[#9BA8B4]" strokeWidth={2} />}{c.item}
                    </span>
                    <span className="block text-[11px] text-[#5B6B78] pl-5">{st ? `${st.state === "confirmed" ? "Kept by the client" : "Client does not have it"} · ${st.at}` : c.why}</span>
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
          <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-line flex-wrap">
            <p className="text-xs text-[#5B6B78]">{reviewed ? `Statuses reviewed · ${inputs.ledgerReview!.at}` : inputs.ledgerReview ? "Statuses changed since your review" : `${model.ledger.length} items not yet reviewed`}</p>
            <button disabled={reviewed} onClick={() => save((p) => ({ ...p, ledgerReview: { at: stampNow(), by: REVIEWER, signature: model.ledgerSignature } }), { action: "Evidence statuses reviewed", detail: `${model.ledger.length} items` }, "Evidence statuses marked reviewed.")} className={BTN_S}>
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
  const decisions = model.readiness.filter((r) => r.decision && (!r.done || r.alwaysListed))
    .sort((a, b) => Number(b.blocking && !b.done) - Number(a.blocking && !a.done) || Number(!!a.alwaysListed && a.done) - Number(!!b.alwaysListed && b.done));
  const [date, setDate] = useState<{ choice: "record" | "evidence" | ""; reason: string }>({ choice: "", reason: "" });
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
    <section id="liability-signoff" tabIndex={-1} className="lg-card overflow-hidden scroll-mt-[150px] focus:outline-none grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="p-5 bg-wash border-b lg:border-b-0 lg:border-r border-line flex flex-col">
        <div className="eyebrow mb-1">L7 · Attorney inputs</div>
        <h2 className="section-header">Ready for sign-off?</h2>
        <p className="mt-4"><span className="text-4xl font-semibold text-ink tabular-nums">{done}</span><span className="text-2xl text-[#9BA8B4] tabular-nums">/{total}</span> <span className="secondary-text">inputs complete</span></p>
        <div className="h-2 rounded-full bg-track mt-3 overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}><div className="h-full bg-deep" style={{ width: `${(done / total) * 100}%` }} /></div>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Blocking sign-off</dt><dd className="font-semibold text-[#B91C1C] tabular-nums">{model.blocking.length}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Open, not blocking</dt><dd className="font-semibold text-[#B45309] tabular-nums">{model.openItems.length}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5B6B78]">Complete</dt><dd className="font-semibold text-[#15803D] tabular-nums">{done}</dd></div>
        </dl>
        <div className="mt-auto pt-6 space-y-2">
          {signedCurrent ? (
            <p className="text-sm text-[#15803D] flex items-center gap-1.5"><CheckCircle className="w-4 h-4" strokeWidth={1.75} /> Signed off by {inputs.signOff!.by} · {inputs.signOff!.at}</p>
          ) : inputs.signOff && (
            <p className="text-xs text-[#B45309]">Signed off {inputs.signOff.at}, but inputs have changed since — sign off again.</p>
          )}
          <button
            disabled={model.blocking.length > 0 || signedCurrent}
            onClick={() => save((p) => ({ ...p, signOff: { at: stampNow(), by: REVIEWER, signature: model.signature } }), { action: "Attorney sign-off", detail: `${done}/${total} inputs complete; ${model.openItems.length} open, not blocking` }, "Liability analysis signed off. The case stage has not changed.")}
            className="btn btn-primary w-full gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {model.blocking.length ? <Lock className="w-4 h-4" strokeWidth={1.75} /> : <CheckCircle className="w-4 h-4" strokeWidth={1.75} />} Attorney sign-off
          </button>
          {model.blocking.length > 0 && <p className="text-xs text-[#B91C1C]">Resolve to enable sign-off: {model.blocking.map((b) => b.title.toLowerCase()).join("; ")}.</p>}
        </div>
      </div>
      <div className="p-5 space-y-5 min-w-0">
        <div>
          <h3 className="eyebrow mb-2">Needs your decision</h3>
          {decisions.length === 0 ? <p className="text-sm text-[#15803D]">Nothing awaiting a decision.</p> : (
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className={`rounded-lg border px-3 py-2.5 ${d.blocking && !d.done ? "border-[#FBD5D5] bg-[#FEF2F2]" : "border-line"}`}>
                  <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${d.done ? "bg-[#ECFDF3] text-[#15803D]" : d.blocking ? "bg-[#FBD5D5] text-[#B91C1C]" : "bg-[#FFF7ED] text-[#B45309]"}`}>{d.done ? <Check className="w-3 h-3" strokeWidth={2} /> : <AlertTriangle className="w-3 h-3" strokeWidth={2} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{d.title}</p>
                      <p className="text-xs text-[#5B6B78]">{d.detail}</p>
                    </div>
                    <Pill className={d.done ? (d.alwaysListed === "optional" ? GREY : "pill-complete") : d.blocking ? "pill-risk" : "pill-progress"}>{d.done ? (d.alwaysListed === "optional" ? "Optional" : "None") : d.blocking ? "Blocking" : d.count ? `${d.count} open` : "Open"}</Pill>
                    {d.id !== "incident-date" && <button onClick={() => follow(d.link.target)} className="text-xs font-semibold text-deep hover:text-ink underline underline-offset-2 shrink-0">{d.link.label}</button>}
                  </div>
                  {d.id === "incident-date" && (
                    <div id="decide-incident-date" className="mt-3 sm:pl-8 space-y-2">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(["facts", "legal"] as const).map((g) => (
            <div key={g}>
              <h3 className="eyebrow mb-2">{g === "facts" ? "Facts and parties" : "Evidence and legal"}</h3>
              <ul className="space-y-2">
                {model.readiness.filter((r) => r.group === g).map((r) => (
                  <li key={r.id} className="rounded-lg border border-line px-3 py-2 flex items-start gap-2.5">
                    {r.done ? <CheckCircle className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" strokeWidth={1.75} /> : r.blocking ? <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" strokeWidth={1.75} /> : <Circle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" strokeWidth={1.75} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{r.title}</p>
                      <p className="text-xs text-[#5B6B78] break-words">{r.detail}</p>
                      {r.id === "settlements" && !r.done && (
                        <button onClick={() => save((p) => ({ ...p, settlementsNone: { at: stampNow(), by: REVIEWER } }), { action: "Confirmed no settlements or releases" }, "Recorded: no settlements or releases to date.")} className="text-xs font-semibold text-deep hover:text-ink mt-1">Confirm none to date</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-line">
          <h3 className="eyebrow mb-2">Outputs</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={outputs.demand} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Draft demand liability section</button>
            <button onClick={outputs.plan} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Pre-suit evidence plan</button>
            <button onClick={outputs.outlook} className={BTN_S}><Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Litigation outlook summary</button>
            <button onClick={onProceedToValuation} disabled={!signedCurrent || !onProceedToValuation} title={signedCurrent ? undefined : "Available after attorney sign-off"} className={BTN_S}>Send to Damages <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} /></button>
            <button onClick={() => follow("flags")} disabled={model.flags.length === 0} className={BTN_S}>Upstream flags ({model.flags.length})</button>
          </div>
          <p className="text-[11px] text-[#8A98A3] mt-2">Unverified authority and not-yet-known findings are left out of the demand draft and listed at its end. Send to Damages uses the existing move to Valuation and is offered only after sign-off.</p>
        </div>

        {inputs.audit.length > 0 && (
          <details className="pt-4 border-t border-line">
            <summary className="eyebrow cursor-pointer inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" strokeWidth={1.75} /> Audit trail ({inputs.audit.length})</summary>
            <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
              {[...inputs.audit].reverse().map((a, i) => (
                <li key={i} className="text-[11px] text-[#5B6B78]"><span className="text-ink font-semibold">{a.action}</span>{a.detail && ` · ${a.detail}`}{a.from && ` · ${a.from} → ${a.to}`}{!a.from && a.to && ` · ${a.to}`}{a.reason && ` · “${a.reason}”`} — {a.by}, {a.at}</li>
              ))}
            </ul>
          </details>
        )}
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
        <p className="body-text">{isD ? (d.note ? `${d.note[0].toUpperCase()}${d.note.slice(1)}.` : "No source note recorded.") : p.description}</p>
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
