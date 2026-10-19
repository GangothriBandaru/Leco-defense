import { Fragment, useEffect, useState } from "react";
import {
  ChevronLeft, ChevronRight, Users, Gavel, AlertTriangle, User, Calendar,
  CheckCircle, FileText, HelpCircle, Lightbulb, ArrowRight, History, Building2, Scale, X, ChevronDown, FileSearch, Database, Info,
} from "lucide-react";
import { StageNavigator } from "../components/StageNavigator";
import { DocActions, DocumentWorkspaceModal } from "../components/DocumentWorkspace";
import { FileTypeTag } from "../components/fileType";
import {
  jurisdictionForCase, workingDeadline, formatDate, governingLawSummary, type AttorneyDecision,
} from "../jurisdiction/jurisdictionData";
import {
  defendantsForCase, candidateForName, byRecommendation, shownCount, openCount, choiceFor,
  REC_LABEL, CHOICE_LABEL,
  type Candidate, type Cite, type DefendantChoice, type DefendantSource, type Recommendation, type Tier, type ElementStatus,
} from "../defendants/defendantData";
import { useDefendantDecisions, saveDefendantDecisions, type RowDecision, type HistoryEntry } from "../defendants/defendantDecisionStore";

// ── Defendant Analysis ───────────────────────────────────────────────────────
// One page for every entry point: the Analysis stage's Defendant card, the Case
// Ready deliverable and the Case Workspace's Case Overview. It reads the case's
// defendant analysis record and the attorney's saved decisions — the same
// record wherever it is opened from.

const REVIEWER = "J. Davis";
const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const TIER_BADGE: Record<Tier, string> = {
  Primary: "border-brand text-deep bg-tint",
  Secondary: "border-[#FDE6C8] text-[#B45309] bg-[#FFF7ED]",
  Tertiary: "border-[#D1FADF] text-[#15803D] bg-[#ECFDF3]",
};
const REC_PILL: Record<Recommendation, string> = {
  name: "bg-deep text-white border-deep",
  investigate: "bg-[#FFF7ED] text-[#B45309] border-[#FDE6C8]",
  "set-aside": "bg-[#F1F3F5] text-[#5B6B78] border-line",
};
const REC_COLUMN: Record<Recommendation, { sub: string }> = {
  name: { sub: "Liability shown or strongly indicated" },
  investigate: { sub: "Pointed to by the record; fault or identity not yet shown" },
  "set-aside": { sub: "Nothing in the record points to fault" },
};
const ELEMENT_PILL: Record<ElementStatus, string> = {
  Shown: "pill-complete",
  Indicated: "pill-neutral",
  "Not yet known": "pill-progress",
  "Not indicated": "bg-[#F1F3F5] text-[#5B6B78] border-line",
  "Not established": "bg-[#F1F3F5] text-[#5B6B78] border-line",
};

const WHY_HEADING: Record<Recommendation, string> = {
  name: "Why the system finds liability",
  investigate: "Why the system wants more before deciding",
  "set-aside": "Why the system sets it aside",
};

const SECTIONS = [
  { id: "recommendation", label: "Recommendation" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "defendant-analysis", label: "Each defendant" },
  { id: "defendant-decisions", label: "Your decision" },
  { id: "sources", label: "Evidence" },
];
/** Scrolls a section into view — instantly when the attorney prefers reduced
 *  motion — and moves keyboard focus to it. Each section's scroll margin keeps
 *  its heading clear of the sticky header and stage navigation. */
const goTo = (id: string, focus = false) => {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (focus) el.focus({ preventScroll: true });
};
const TAB = "px-4 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors";
const TAB_ON = "bg-tint border-brand text-deep";
const TAB_OFF = "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink";
/** "How it works" for Your Decision: a small popover, closed by clicking
 *  outside it or pressing Escape. */
function DecisionHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-decision-help]")) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);
  const options: [string, string][] = [
    ["Name", "Select this when the available evidence supports naming the entity as a defendant. It will be included in the named-defendant decisions."],
    ["Investigate", "Select this when the record suggests potential responsibility but additional evidence or identity confirmation is needed."],
    ["Do not pursue", "Select this when you decide not to pursue the entity based on the current assessment."],
  ];
  return (
    <div className="relative shrink-0" data-decision-help>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
      >
        <Info className="w-4 h-4" strokeWidth={1.75} /> How it works
      </button>
      {open && (
        <div role="dialog" aria-label="Understanding your decision" className="fixed left-4 right-4 top-24 max-h-[calc(100vh-120px)] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] sm:max-h-none sm:overflow-visible z-30 rounded-xl border border-line bg-white shadow-sm p-4 space-y-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <h3 className="card-title">Understanding Your Decision</h3>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 -m-1 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
          </div>
          <dl className="space-y-2">
            {options.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm font-semibold text-ink">{k}</dt>
                <dd className="secondary-text leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="pt-3 border-t border-line space-y-2 secondary-text leading-snug">
            <p>The dashed option indicates the system's recommendation. The final decision belongs to the attorney.</p>
            <p>Use the reason field to document why you selected a different option or to record important context for the decision. A reason is required only when you choose a different option from the system's recommendation.</p>
            <p>Records and insurance requests are directed only to defendants you choose to name or investigate. Nothing is sent from this page — the application has no request workflow yet.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** A section's heading and one-line description, as on the Analysis stage. */
function SectionHead({ title, sub, right, compact }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${compact ? "mb-4" : "mb-5"}`}>
      <div className="min-w-0">
        <h2 className="section-header mb-1">{title}</h2>
        {sub && <p className="secondary-text max-w-3xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function TierBadge({ tier }: { tier?: Tier }) {
  return (
    <span
      title={tier ? `${tier}: ${tier === "Primary" ? "caused the harm" : tier === "Secondary" ? "answers for an actor" : "upstream cause"}` : "Relationship not established"}
      className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[11px] font-bold shrink-0 ${tier ? TIER_BADGE[tier] : "border-line text-[#8A98A3] bg-white"}`}
    >
      {tier ? tier[0] : "?"}
    </span>
  );
}

function RecPill({ rec }: { rec: Recommendation }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${REC_PILL[rec]}`}>{rec === "set-aside" ? "Do not pursue" : REC_LABEL[rec]}</span>;
}

function IdentifiedPill({ c }: { c: Candidate }) {
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium text-[#5B6B78] ${c.identified === "Role only" ? "border-dashed border-[#9BA8B4]" : "border-line"}`}>{c.identified}</span>;
}

interface Props {
  caseData?: any;
  /** The case reference the analysis record is found by. */
  caseRef?: string;
  /** The attorney's jurisdiction decision, when there is one. */
  jurisdictionDecision?: AttorneyDecision;
  /** A defendant name used where the page was opened from — selected first. */
  focusName?: string;
  onBack: () => void;
  backLabel: string;
  /** The stage shell to show; omitted inside the Case Workspace. */
  stage?: "Analysis" | "Case Ready";
  onStageClick?: (stageName: string) => void;
  embedded?: boolean;
}

export function DefendantAnalysisPage({ caseData, caseRef, jurisdictionDecision, focusName, onBack, backLabel, stage = "Analysis", onStageClick, embedded = false }: Props) {
  const record = defendantsForCase(caseRef);
  const jx = jurisdictionForCase(caseRef);
  const caseName = caseData?.caseName ?? "This case";

  const shell = (content: React.ReactNode) =>
    embedded ? (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-2 secondary-text hover:text-ink transition-colors">
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> {backLabel}
        </button>
        {content}
      </div>
    ) : (
      <div className="min-h-screen bg-wash">
        <div className="bg-white sticky top-0 z-40">
          <div className="max-w-[1400px] mx-auto px-8 py-4">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="flex items-center gap-2 secondary-text hover:text-ink transition-colors">
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> {backLabel}
              </button>
              <div className="secondary-text ml-auto flex items-center gap-2 min-w-0">
                <span className="shrink-0">Case Intake</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
                <span className="truncate">{caseName}</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
                <span className="text-ink font-medium shrink-0">Defendant Analysis</span>
              </div>
            </div>
          </div>
        </div>
        <StageNavigator currentStage={stage} onStageClick={onStageClick} />
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">{content}</div>
      </div>
    );

  if (!record) {
    return shell(
      <>
        <PageTitle />
        <div className="lg-card p-10 flex flex-col items-center text-center">
          <Users className="w-8 h-8 text-soft mb-3" strokeWidth={1.75} />
          <p className="text-sm font-medium text-ink">No defendant analysis on record for this case yet.</p>
          <p className="secondary-text mt-1 max-w-md">
            {caseData?.defendant ? `${caseData.defendant} is named on the case record but has not been analysed.` : "No defendant is on the case record."} Needs attorney review.
          </p>
        </div>
      </>,
    );
  }
  return shell(<Analysis record={record} jx={jx} caseData={caseData} jurisdictionDecision={jurisdictionDecision} focusName={focusName} embedded={embedded} />);
}

function PageTitle({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-[260px] flex-1 basis-0">
        <h1 className="page-title" style={{ fontSize: "24px" }}>Defendant Analysis</h1>
        <p className="secondary-text mt-1">Who could answer for the harm, what the record shows about each, and the attorney's decision on whom to pursue.</p>
      </div>
      {right}
    </div>
  );
}

// ── The analysis ─────────────────────────────────────────────────────────────

function Analysis({ record, jx, caseData, jurisdictionDecision, focusName, embedded }: {
  record: NonNullable<ReturnType<typeof defendantsForCase>>;
  jx: ReturnType<typeof jurisdictionForCase>;
  caseData?: any;
  jurisdictionDecision?: AttorneyDecision;
  focusName?: string;
  embedded?: boolean;
}) {
  const groups = byRecommendation(record);
  const ordered = groups.flatMap((g) => g.candidates);
  const [selectedId, setSelectedId] = useState(() => candidateForName(record, focusName)?.id ?? ordered[0]?.id);
  const selected = record.candidates.find((c) => c.id === selectedId) ?? ordered[0];
  const sourceById = (id: string) => record.sources.find((s) => s.id === id);

  // The source open in the Document Workspace.
  const [openSource, setOpenSource] = useState<{ source: DefendantSource; view: "preview" | "insights" } | null>(null);
  const [flashSource, setFlashSource] = useState<string | null>(null);
  const openCite = (cite: Cite) => {
    const s = sourceById(cite.sourceId);
    if (!s) return;
    if (s.files.length) { setOpenSource({ source: s, view: "preview" }); return; }
    // A record with no file: open its row in Evidence instead.
    showInEvidence(s.id);
  };
  // "View Details": one panel for every source-backed finding on the page.
  const [details, setDetails] = useState<{ title: string; explanation?: string; cites: Cite[] } | null>(null);
  // The Evidence row expanded to show its facts.
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const showInEvidence = (id: string) => {
    setDetails(null);
    setExpandedSource(id);
    setFlashSource(id);
    window.setTimeout(() => document.getElementById(`source-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    window.setTimeout(() => setFlashSource(null), 1600);
  };
  const ViewDetails = ({ title, explanation, cites, className = "" }: { title: string; explanation?: string; cites: (Cite | undefined)[]; className?: string }) => {
    const list = cites.filter((c): c is Cite => !!c);
    if (list.length === 0) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setDetails({ title, explanation, cites: list }); }}
        className={`inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink transition-colors shrink-0 ${className}`}
      >
        View Details <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    );
  };
  // The liability element expanded.
  const [expandedEl, setExpandedEl] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  // The recommendation group shown — Name first.
  const [recTab, setRecTab] = useState<Recommendation>("name");
  const select = (id: string) => {
    setSelectedId(id);
    window.setTimeout(() => document.getElementById("defendant-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  // ── Section A facts ──
  const working = workingDeadline(jx);
  const approved = jurisdictionDecision?.status === "approved";
  const law = governingLawSummary(caseData?.caseId, caseData?.jurisdiction, approved ? jurisdictionDecision?.governingLaw : undefined);
  const meta = [caseData?.caseId, caseData?.caseType, caseData?.caseSubType].filter(Boolean);

  // The defendant the case record names — the first named recommendation.
  const lead = record.candidates.find((c) => c.recommendation === "name" && c.identified === "Named");

  // ── Counts, from the record ──
  const n = record.candidates.length;
  const named = record.candidates.filter((c) => c.identified === "Named").length;
  const count = (r: Recommendation) => record.candidates.filter((c) => c.recommendation === r).length;

  // ── Decisions ──
  const stored = useDefendantDecisions(record.id);
  const initialRows = () => Object.fromEntries(record.candidates.map((c) => [c.id, stored?.rows[c.id] ?? { choice: choiceFor(c.recommendation), reason: "" }])) as Record<string, RowDecision>;
  const [rows, setRows] = useState<Record<string, RowDecision>>(initialRows);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const overridden = (c: Candidate) => rows[c.id].choice !== choiceFor(c.recommendation);

  /** Saves the decisions; a change clears the last confirmation. */
  const persist = (next: Record<string, RowDecision>, extra?: { confirmedAt?: string; confirmedBy?: string; history?: HistoryEntry[] }) => {
    try {
      saveDefendantDecisions(record.id, { rows: next, history: extra?.history ?? stored?.history ?? [], confirmedAt: extra?.confirmedAt, confirmedBy: extra?.confirmedBy });
      setSaveError(null);
      return true;
    } catch {
      setSaveError("Your decisions could not be saved — this browser refused the write. Nothing has been confirmed.");
      return false;
    }
  };
  const change = (id: string, patch: Partial<RowDecision>) => {
    const next = { ...rows, [id]: { ...rows[id], ...patch } };
    setRows(next);
    setJustConfirmed(false);
    setErrors((e) => { const { [id]: _, ...rest } = e; return rest; });
    persist(next);
  };
  const acceptAll = () => {
    const next = Object.fromEntries(record.candidates.map((c) => [c.id, { choice: choiceFor(c.recommendation), reason: rows[c.id]?.reason ?? "" }])) as Record<string, RowDecision>;
    setRows(next);
    setErrors({});
    setJustConfirmed(false);
    persist(next);
  };
  const confirm = () => {
    const missing: Record<string, string> = {};
    record.candidates.forEach((c) => {
      if (overridden(c) && !rows[c.id].reason.trim()) missing[c.id] = "Give a reason for changing the system's recommendation.";
    });
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setConfirming(true);
  };
  /** Commits the decisions once the attorney has reviewed them. */
  const commit = () => {
    // Every override goes into the history, unless it is already there unchanged.
    const history = [...(stored?.history ?? [])];
    const at = now();
    record.candidates.filter(overridden).forEach((c) => {
      const last = [...history].reverse().find((h) => h.candidate === c.name);
      const entry: HistoryEntry = { at, by: REVIEWER, candidate: c.name, from: choiceFor(c.recommendation), to: rows[c.id].choice, reason: rows[c.id].reason.trim() };
      if (!last || last.to !== entry.to || last.reason !== entry.reason) history.push(entry);
    });
    if (persist(rows, { confirmedAt: at, confirmedBy: REVIEWER, history })) setJustConfirmed(true);
    setConfirming(false);
  };
  const tally = (ch: DefendantChoice) => record.candidates.filter((c) => rows[c.id].choice === ch).length;
  const pursued = tally("name") + tally("investigate");
  const confirmedAt = stored?.confirmedAt;
  const toRequest = record.candidates.filter((c) => rows[c.id].choice !== "do-not-pursue" && c.requests.length > 0);

  // The section in view, for the section tabs.
  const [inView, setInView] = useState(SECTIONS[0].id);
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => {
      let current = SECTIONS[0].id;
      for (const x of SECTIONS) {
        const el = document.getElementById(x.id);
        if (el && el.getBoundingClientRect().top <= 280) current = x.id;
      }
      // The last section never reaches the top — at the end of the page it is the one in view.
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id;
      setInView(current);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* The Jurisdiction review's layout: the case summary on the left, held
          below the stage navigation; the analysis on the right, scrolling with
          the page. The summary scrolls on its own only in a window too short
          for it. */}
      <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-5 items-start">
        {/* ── LEFT — case summary ──
            One light panel. It sticks below the stage navigation and, only in a
            window too short for it, scrolls on its own; its height matches the
            space left below the sticky header, so its end is always on screen,
            and the wheel passes on to the page once it reaches either end. */}
        <aside
          id="case-context"
          className={`min-w-0 ${embedded ? "" : "lg:sticky lg:top-[176px] lg:max-h-[calc(100vh-256px)] lg:overflow-y-auto"}`}
        >
          {/* The Case Intelligence Summary's grid: small icons, muted labels,
              clear values — sized for a sidebar. */}
          <div className="lg-card p-4 space-y-3">
            <div>
              <div className="eyebrow mb-1">Case Summary</div>
              <h2 className="text-[15px] font-semibold text-ink leading-snug">{caseData?.caseName ?? "Case"}</h2>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <div className="lg-zone lg-zone-grey px-2.5 py-2.5 min-w-0">
                <dt className="eyebrow text-[11px] tracking-[0.02em] flex items-center gap-1 mb-1 min-w-0"><User className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Plaintiff</dt>
                <dd className="text-sm font-semibold text-ink leading-snug break-words">{caseData?.plaintiff ?? "Not available"}</dd>
              </div>
              <div className="lg-zone lg-zone-grey px-2.5 py-2.5 min-w-0">
                <dt className="eyebrow text-[11px] tracking-[0.02em] flex items-center gap-1 mb-1 min-w-0"><Building2 className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Defendant</dt>
                <dd className="text-sm font-semibold text-ink leading-snug break-words">{lead?.name ?? "Needs attorney review"}</dd>
              </div>
              <div className="lg-zone lg-zone-grey px-2.5 py-2.5 min-w-0">
                <dt className="eyebrow text-[11px] tracking-[0.02em] flex items-center gap-1 mb-1 min-w-0"><Scale className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Jurisdiction</dt>
                <dd className="text-sm font-semibold text-ink leading-snug break-words">{caseData?.jurisdiction ?? "Not available"}</dd>
              </div>
              <div className="lg-zone lg-zone-grey px-2.5 py-2.5 min-w-0">
                <dt className="eyebrow text-[11px] tracking-[0.02em] flex items-center gap-1 mb-1 min-w-0"><Calendar className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Date of incident</dt>
                <dd className="text-sm font-semibold text-ink leading-snug break-words">{jx ? formatDate(jx.incidentDate) : "Not available"}</dd>
                {record.incident.cite && (
                  <dd className="mt-1">
                    <button
                      onClick={() => openCite(record.incident.cite!)}
                      title={`Conflicts with the timeline — open the source: ${record.incident.cite.note}`}
                      className="text-[11px] text-[#B45309] underline underline-offset-2 decoration-[#FDE6C8] hover:decoration-[#B45309] text-left"
                    >
                      Timeline: Feb 7, 2026
                    </button>
                  </dd>
                )}
              </div>
              <div className="lg-zone lg-zone-grey px-2.5 py-2.5 min-w-0 col-span-2">
                <dt className="eyebrow text-[11px] tracking-[0.02em] flex items-center gap-1 mb-1 min-w-0"><Gavel className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Governing law</dt>
                <dd className="text-sm font-semibold text-ink leading-snug break-words">{law.value}</dd>
                <dd className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {jx?.governingLaw.finding && !approved && <span className="pill pill-neutral">System finding</span>}
                  {jx && !approved && <span className="pill pill-neutral">{jx.governingLaw.confidence} confidence</span>}
                  {approved
                    ? <span className="pill pill-complete"><CheckCircle className="w-3 h-3" strokeWidth={1.75} /> Attorney approved</span>
                    : <span className="pill pill-progress">Needs attorney review</span>}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* ── RIGHT — the five sections, in order ── */}
        <div className="min-w-0 space-y-6">
          <PageTitle
            right={
              <div className="flex items-center justify-end gap-2 flex-wrap shrink-0">
                {confirmedAt
                  ? <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Decisions confirmed · {confirmedAt}</span>
                  : <span className="pill pill-progress">Awaiting attorney decisions</span>}
                <button
                  onClick={() => { setInView("defendant-decisions"); goTo("defendant-decisions", true); }}
                  aria-label="Go to Your Decision"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand hover:bg-deep text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Go to Your Decision <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            }
          />


      <nav aria-label="Sections" className="flex items-center gap-2 flex-wrap">
        {SECTIONS.map((x) => (
          <button
            key={x.id}
            onClick={() => { setInView(x.id); goTo(x.id); }}
            aria-current={inView === x.id ? "true" : undefined}
            className={`${TAB} ${inView === x.id ? TAB_ON : TAB_OFF}`}
          >
            {x.label}
          </button>
        ))}
      </nav>

      {/* ── B · System recommendation ── */}
      <div id="recommendation" className="lg-card p-6 scroll-mt-[170px]">
          <SectionHead
            compact
            title="System recommendation"
            sub={`From the ${record.generatedFrom.toLowerCase()} · ${confirmedAt ? "decided by the attorney" : "awaiting the attorney's decision"}`}
          />
          {/* The defendant overview's cards: grey zone, small label, value below.
              Six across where they stay readable, fewer where they would not. */}
          <div className="grid grid-cols-1 min-[640px]:grid-cols-3 min-[1400px]:grid-cols-6 gap-2">
            {[
              { label: "Potential defendants", value: n },
              { label: "Named in evidence", value: named, note: `${n - named} by role only` },
              { label: "Recommended to name", value: count("name") },
              { label: "To investigate", value: count("investigate") },
              { label: "Set aside", value: count("set-aside") },
              { label: "Evidence sources", value: record.sources.length },
            ].map((x) => (
              <div key={x.label} className="lg-zone lg-zone-grey px-3 py-2 min-w-0 flex flex-col">
                <div className="eyebrow leading-snug mb-1">{x.label}</div>
                <div className="mt-auto flex items-baseline gap-1.5 flex-wrap min-h-[22px]">
                  <span className="text-base font-semibold text-ink leading-tight">{x.value}</span>
                  {x.note && <span className="text-xs text-[#5B6B78]">{x.note}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] px-4 py-2.5">
            <p className="body-text leading-relaxed">
              <strong className="font-semibold">Name {count("name")} now, investigate {count("investigate")}, set aside {count("set-aside")}.</strong> {record.explanation}
            </p>
          </div>
        {/* One recommendation group at a time, behind the Intake workspace's tab bar. */}
        <div className="mt-3">
          <div
            role="tablist"
            aria-label="Recommendation groups"
            className="rounded-xl border border-line bg-white p-1.5 flex items-center gap-1.5"
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = groups.findIndex((g) => g.rec === recTab);
              const next = groups[(i + (e.key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length].rec;
              setRecTab(next);
              (document.getElementById(`rec-tab-${next}`) as HTMLButtonElement | null)?.focus();
            }}
          >
            {groups.map(({ rec, candidates }) => {
              const on = rec === recTab;
              return (
                <button
                  key={rec}
                  id={`rec-tab-${rec}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls="rec-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setRecTab(rec)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
                    on ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"
                  }`}
                >
                  {REC_LABEL[rec]} ({candidates.length})
                </button>
              );
            })}
          </div>
          {(() => {
            const { rec, candidates } = groups.find((g) => g.rec === recTab) ?? groups[0];
            return (
              <div id="rec-panel" role="tabpanel" aria-labelledby={`rec-tab-${rec}`} className="mt-2.5">
                {candidates.length === 0 ? (
                  <div className="rounded-xl border border-line bg-offwhite px-3.5 py-2.5 flex items-baseline gap-2 flex-wrap">
                    <span className="kpi-value leading-tight" style={{ fontSize: "18px" }}>0</span>
                    <span className="text-xs text-[#5B6B78]">{REC_COLUMN[rec].sub}</span>
                    <span className="text-sm text-[#8A98A3] ml-auto">None.</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-[#5B6B78] mb-2">{REC_COLUMN[rec].sub}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {candidates.map((c) => (
                        <div key={c.id} className="lg-card-i rounded-xl bg-white border border-line p-3.5 min-w-0 flex flex-col">
                          <div className="eyebrow flex items-center gap-1.5 mb-2">
                            <TierBadge tier={c.tier} />
                            <span className="truncate">{c.tier ?? "Relationship not established"} · {c.identified}</span>
                          </div>
                          <button onClick={() => select(c.id)} className="text-left group">
                            <h3 className="card-title leading-snug group-hover:text-deep transition-colors">{c.name}</h3>
                          </button>
                          <p className="secondary-text mt-1 mb-2.5 leading-snug">{c.summary}</p>
                          <div className="mt-auto pt-2.5 border-t border-line flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs text-[#5B6B78]"><FileText className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} /> 1 source</span>
                            <ViewDetails title={`${c.name} — why it is on the list`} explanation={c.summary} cites={[c.identifiedFrom]} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
        {record.decideFirst.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#FDE6C8] bg-[#FFF7ED] px-4 py-3 flex items-start gap-3">
            <span className="text-sm font-semibold text-[#B45309] shrink-0 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" strokeWidth={1.75} /> Decide first</span>
            <ul className="space-y-1">
              {record.decideFirst.map((d) => (
                <li key={d.text} className="text-sm text-ink leading-snug">{d.text} {d.cite && <ViewDetails className="ml-1 align-middle" title="Decide first" explanation={d.text} cites={[d.cite]} />}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── C · Hierarchy ── */}
      <div id="hierarchy" className="lg-card bg-offwhite p-6 scroll-mt-[170px]">
        <SectionHead
          title="Defendant hierarchy"
          sub="How each potential defendant connects to the injury. Indented candidates are answerable through the one above them; dashed cards are not being pursued. Select a card to open its analysis."
        />
          <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-[#5B6B78] -mt-2 mb-4">
            {(["Primary", "Secondary", "Tertiary"] as Tier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5"><TierBadge tier={t} /> {t === "Primary" ? "Primary: caused the harm" : t === "Secondary" ? "Secondary: answers for an actor" : "Tertiary: upstream cause"}</span>
            ))}
            <span className="flex items-center gap-1.5"><TierBadge /> Relationship not established</span>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {record.groups.map((g) => {
            const inGroup = record.candidates.filter((c) => c.groupId === g.id);
            const tops = inGroup.filter((c) => !c.parentId || !inGroup.some((p) => p.id === c.parentId));
            const card = (c: Candidate) => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                aria-pressed={c.id === selected?.id}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  c.id === selected?.id ? "border-brand bg-tint" : c.recommendation === "set-aside" ? "border-dashed border-[#CBD5DD] bg-offwhite hover:border-soft" : "border-line bg-offwhite hover:border-soft hover:bg-wash"
                }`}
              >
                <div className="flex items-center gap-2"><TierBadge tier={c.tier} /><span className="text-sm font-semibold text-ink">{c.name}</span></div>
                <p className="text-xs text-[#5B6B78] mt-1 leading-snug">{c.role}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <RecPill rec={c.recommendation} />
                  <IdentifiedPill c={c} />
                  <span className="mono-ref">{shownCount(c)}/{c.elements.length} shown · {openCount(c)} to investigate</span>
                </div>
              </button>
            );
            const tree = (c: Candidate): React.ReactNode => {
              const kids = inGroup.filter((k) => k.parentId === c.id);
              return (
                <div key={c.id} className="space-y-2">
                  {card(c)}
                  {kids.length > 0 && <div className="pl-4 ml-2.5 border-l-2 border-[#D6F2F7] space-y-2">{kids.map(tree)}</div>}
                </div>
              );
            };
            return (
              <div key={g.id} className="rounded-xl border border-line bg-white p-4 space-y-2.5 min-w-0">
                <div>
                  <h3 className="card-title leading-snug">{g.title}</h3>
                  <div className="secondary-text">{g.subtitle}</div>
                </div>
                {tops.map(tree)}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── D · Each defendant ── */}
      <div id="defendant-analysis" className="lg-card p-6 space-y-5 scroll-mt-[170px]">
        <SectionHead title="Analysis of each defendant" sub="One tab per defendant, grouped by recommendation. Every fact links to its source." />
        <div className="overflow-x-auto -mx-1 px-1 -mt-1">
          <div role="tablist" className="flex items-end gap-5 min-w-max pb-1">
            {groups.filter((g) => g.candidates.length).map(({ rec, candidates }) => (
              <div key={rec}>
                <div className="eyebrow mb-1.5">{REC_LABEL[rec]} · {candidates.length}</div>
                <div className="flex items-center gap-2">
                  {candidates.map((c) => {
                    const on = c.id === selected?.id;
                    return (
                      <button
                        key={c.id}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setSelectedId(c.id)}
                        className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}
                      >
                        {c.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div role="tabpanel" className="space-y-5 pt-5 border-t border-line">
            <div>
              <h3 className="section-header">{selected.name}</h3>
              <p className="secondary-text mt-0.5">{selected.role}</p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.7fr)] gap-2">
                {[
                  { label: "Role", body: <span className="flex items-center gap-1.5"><TierBadge tier={selected.tier} /> {selected.tier ?? "Not established"}</span> },
                  { label: "Identified", body: <IdentifiedPill c={selected} /> },
                  { label: "Liability elements", body: <>{shownCount(selected)} of {selected.elements.length} shown</> },
                  { label: "Recommendation", body: <RecPill rec={selected.recommendation} /> },
                  { label: "Identified from", body: <span className="flex items-center justify-between gap-x-2 gap-y-0.5 w-full flex-wrap"><span className="min-w-0 leading-snug">{sourceById(selected.identifiedFrom.sourceId)?.name ?? "Not on record"}</span><ViewDetails title={`${selected.name} — where it is identified`} cites={[selected.identifiedFrom]} /></span> },
                ].map((x) => (
                  <div key={x.label} className="lg-zone lg-zone-grey px-3 py-2 min-w-0">
                    <div className="eyebrow mb-1">{x.label}</div>
                    <div className="text-sm font-medium text-ink flex items-center min-h-[22px]">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-4 space-y-3">
              <div className="card-title flex items-center gap-2">
                <Scale className="w-4 h-4 text-deep" strokeWidth={1.75} />
                {WHY_HEADING[selected.recommendation]}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-lg bg-white border border-line p-3 flex flex-col">
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5"><FileText className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Facts in the record</div>
                  <ul className="space-y-2 mb-3">
                    {selected.why.facts.map((f) => (
                      <li key={f.text} className="text-sm text-ink leading-snug">{f.text}</li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-2.5 border-t border-line flex justify-end">
                    <ViewDetails title={`Facts in the record — ${selected.name}`} explanation={selected.why.facts.map((f) => f.text).join(" ")} cites={selected.why.facts.map((f) => f.cite)} />
                  </div>
                </div>
                <div className="rounded-lg bg-white border border-line p-3">
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5"><Lightbulb className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Preliminary system assessment</div>
                  {selected.why.inferences.length
                    ? <ul className="space-y-2">{selected.why.inferences.map((t) => <li key={t} className="text-sm text-ink leading-snug">{t}</li>)}</ul>
                    : <p className="text-sm text-[#8A98A3]">None — the system draws no inference here.</p>}
                </div>
                <div className="rounded-lg bg-white border border-line p-3">
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5"><HelpCircle className="w-3.5 h-3.5 text-[#B45309]" strokeWidth={1.75} /> Missing or unresolved</div>
                  {selected.why.open.length
                    ? <ul className="space-y-2">{selected.why.open.map((t) => <li key={t} className="text-sm text-ink leading-snug">{t}</li>)}</ul>
                    : <p className="text-sm text-[#8A98A3]">No open questions on this record.</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
              <div>
                <div className="eyebrow mb-2">Liability elements · {selected.elementsLabel}</div>
                <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                  {selected.elements.map((e) => {
                    const key = `${selected.id}:${e.name}`;
                    const open = expandedEl === key;
                    const src = e.cite ? sourceById(e.cite.sourceId) : undefined;
                    return (
                      <div key={e.name}>
                        <button
                          onClick={() => setExpandedEl(open ? null : key)}
                          aria-expanded={open}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-wash transition-colors text-left"
                        >
                          <span className="text-sm font-medium text-ink">{e.name}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`pill ${ELEMENT_PILL[e.status]}`}>{e.status}</span>
                            <ChevronDown className={`w-4 h-4 text-[#5B6B78] transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
                          </span>
                        </button>
                        {open && (
                          <div className="px-4 py-3 bg-offwhite border-t border-line space-y-2">
                            {e.cite && (
                              <div>
                                <div className="eyebrow mb-0.5">Supporting evidence</div>
                                <p className="text-sm text-ink">{src?.name ?? "Source not on record"} — {e.cite.note}</p>
                              </div>
                            )}
                            {e.missing && (
                              <div>
                                <div className="eyebrow mb-0.5">{e.status === "Shown" ? "Note" : "Unresolved"}</div>
                                <p className={`text-sm ${e.status === "Shown" ? "text-[#5B6B78]" : "text-[#B45309]"}`}>{e.missing}</p>
                              </div>
                            )}
                            {!e.cite && !e.missing && <p className="text-sm text-[#8A98A3]">No further detail on record.</p>}
                            {e.cite && <div className="flex justify-end"><ViewDetails title={e.name} explanation={e.missing} cites={[e.cite]} /></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-white">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line">
                    <div className="eyebrow">Stage 2 will request</div>
                    {selected.requests.length > 0 && <span className="text-xs text-[#5B6B78]">{selected.requests.length} · not yet requested</span>}
                  </div>
                  {selected.requests.length
                    ? <ul className="divide-y divide-line">{selected.requests.map((r) => <li key={r} className="px-4 py-2 text-sm text-ink leading-snug flex gap-2"><FileSearch className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />{r}</li>)}</ul>
                    : <p className="px-4 py-3 text-sm text-[#8A98A3]">None — no records are requested from this party as a defendant.</p>}
                </div>
                <div className="lg-zone lg-zone-grey p-4">
                  <div className="eyebrow mb-2">What could undo or change this</div>
                  <p className="body-text leading-relaxed">{selected.couldUndo}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-2">Investigation plan</div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[720px] table-fixed border-collapse">
                  <colgroup><col className="w-[56px]" /><col /><col /><col className="w-[20%]" /><col /></colgroup>
                  <thead className="bg-wash">
                    <tr>
                      {["Step", "Question to answer", "Request or evidence needed", "Source or responsible party", "Expected result"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 eyebrow border-b border-line">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-line">
                    {selected.plan.map((p, i) => (
                      <tr key={p.question}>
                        <td className="px-4 py-3 align-top mono-ref">{i + 1}</td>
                        <td className="px-4 py-3 align-top text-sm text-ink">{p.question}</td>
                        <td className="px-4 py-3 align-top text-sm text-ink">{p.request}</td>
                        <td className="px-4 py-3 align-top text-sm text-[#5B6B78]">{p.from}</td>
                        <td className="px-4 py-3 align-top text-sm text-[#5B6B78]">{p.expected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-2">Rule trail</div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[720px] table-fixed border-collapse">
                  <colgroup><col className="w-[120px]" /><col /><col /><col /></colgroup>
                  <thead className="bg-wash">
                    <tr>
                      {["Rule ID", "Rule or decision applied", "Triggering fact", "Result"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 eyebrow border-b border-line">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-line">
                    {selected.ruleTrail.map((r) => (
                      <tr key={r.rule}>
                        <td className="px-4 py-3 align-top mono-ref text-[#8A98A3]">{r.id ?? "None on record"}</td>
                        <td className="px-4 py-3 align-top text-sm text-ink">{r.rule}</td>
                        <td className="px-4 py-3 align-top text-sm text-[#5B6B78]">{r.trigger}</td>
                        <td className="px-4 py-3 align-top text-sm text-ink">{r.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[#8A98A3] mt-2">These are the system's recorded reasons, not the output of a rule engine — no defendant-identification framework is connected, so no rule IDs exist.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Your decision ── */}
      <div id="defendant-decisions" tabIndex={-1} aria-label="Your decision" className="lg-card p-6 space-y-4 scroll-mt-[170px] outline-none">
        <SectionHead title="Your decision" sub="The dashed option is the system's recommendation. Records and insurance requests go only to defendants you name or investigate." right={<DecisionHelp />} />
        <div className="rounded-xl border border-line divide-y divide-line -mt-1">
          {ordered.map((c) => {
            const row = rows[c.id];
            const rec = choiceFor(c.recommendation);
            const changed = row.choice !== rec;
            return (
              <div key={c.id} className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-start">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{c.name}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <TierBadge tier={c.tier} />
                    <IdentifiedPill c={c} />
                    <button onClick={() => select(c.id)} className="text-xs text-deep underline underline-offset-2">See analysis</button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label={`Decision for ${c.name}`}>
                  {(["name", "investigate", "do-not-pursue"] as DefendantChoice[]).map((ch) => {
                    const on = row.choice === ch;
                    return (
                      <button
                        key={ch}
                        role="radio"
                        aria-checked={on}
                        onClick={() => change(c.id, { choice: ch })}
                        title={ch === rec ? "System recommendation" : undefined}
                        className={`btn ${on ? "btn-primary" : "btn-secondary"} ${!on && ch === rec ? "border-dashed" : ""}`}
                      >
                        {CHOICE_LABEL[ch]}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className="text-xs text-[#5B6B78] block mb-1" htmlFor={`reason-${c.id}`}>Reason{changed ? " (required — you changed the recommendation)" : ""}</label>
                  <input
                    id={`reason-${c.id}`}
                    value={row.reason}
                    onChange={(e) => change(c.id, { reason: e.target.value })}
                    placeholder={changed ? "Why you changed it" : "Optional note"}
                    className={`w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:border-brand ${errors[c.id] ? "border-[#FBD5D5]" : "border-line"}`}
                  />
                  {errors[c.id] && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{errors[c.id]}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg-zone lg-zone-grey p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-ink">
              {n} of {n} decided · {tally("name")} to name · {tally("investigate")} to investigate · {tally("do-not-pursue")} not to pursue
            </div>
            <p className="text-xs text-[#5B6B78] mt-0.5">
              Requests are listed for the {pursued} {pursued === 1 ? "defendant" : "defendants"} you name or investigate. This application has no defendant-request workflow yet, so nothing is sent from here.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={acceptAll} className="btn btn-secondary">Accept all recommendations</button>
            <button onClick={confirm} className="btn btn-primary">Confirm decisions</button>
          </div>
        </div>
        {saveError && <p role="alert" className="text-sm text-[#B91C1C] flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" strokeWidth={1.75} /> {saveError}</p>}
        {!saveError && confirmedAt && (
          <p className="text-sm text-[#15803D] flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" strokeWidth={1.75} /> {justConfirmed ? "Decisions confirmed and saved" : "Decisions confirmed"} · {stored?.confirmedBy} · {confirmedAt}
          </p>
        )}
        {!saveError && !confirmedAt && stored && (
          <p className="text-sm text-[#B45309]">Draft saved — not yet confirmed.</p>
        )}

        {confirmedAt && !saveError && (
          <div className="rounded-xl border border-line p-4">
            <div className="text-sm font-semibold text-ink">Next step · 2 · Records and insurance requests</div>
            {toRequest.length === 0 ? (
              <p className="text-sm text-[#5B6B78] mt-1">No defendant is named or under investigation, so there is nothing to request.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {toRequest.map((c) => (
                  <li key={c.id} className="text-sm text-ink">
                    <span className="font-semibold">{c.name}</span> <span className="text-[#5B6B78]">({CHOICE_LABEL[rows[c.id].choice]})</span>
                    <div className="text-xs text-[#5B6B78]">{c.requests.join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-[#B45309] mt-2">To be prepared — not sent. This application has no request workflow yet, so nothing has gone to any defendant or insurer.</p>
          </div>
        )}

        {(stored?.history.length ?? 0) > 0 && (
          <div className="pt-3 border-t border-line">
            <div className="eyebrow flex items-center gap-1.5 mb-2"><History className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Decision history</div>
            <ul className="space-y-1.5">
              {[...stored!.history].reverse().map((h, i) => (
                <li key={i} className="text-sm text-ink">
                  <span className="mono-ref mr-2">{h.at} · {h.by}</span>
                  {h.candidate}: {CHOICE_LABEL[h.from]} → <strong className="font-semibold">{CHOICE_LABEL[h.to]}</strong> — {h.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>


      {/* ── Sources ── */}
      <div id="sources" className="lg-card p-6 scroll-mt-[170px]">
        <SectionHead
          title="Sources this analysis is based on"
          sub={<>Evidence on file, the case record and the jurisdiction analysis. Each source shows how it supports the selected defendant's analysis — <strong className="font-medium text-ink">{selected?.short}</strong>.</>}
        />
        <div className="rounded-xl border border-line bg-white overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed">
            <colgroup><col className="w-[24%]" /><col className="w-[17%]" /><col /><col className="w-[124px]" /><col className="w-[268px]" /></colgroup>
            <thead className="bg-wash border-b border-line">
              <tr>
                {["Document / source", "Category", "Relevance", "Status", "Actions"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 eyebrow ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {record.sources.map((s) => {
                const cites = (c: Candidate) => [c.identifiedFrom, ...c.why.facts.map((f) => f.cite), ...c.elements.map((e) => e.cite)].filter((x): x is Cite => x?.sourceId === s.id);
                const usedBy = record.candidates.filter((c) => cites(c).length > 0);
                const forSelected = selected ? Array.from(new Set(cites(selected).map((x) => x.note))) : [];
                const hasFile = s.files.length > 0;
                const noFile = "A case record, not a document file";
                const open = expandedSource === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr id={`source-${s.id}`} className={`lg-row transition-colors scroll-mt-[170px] ${flashSource === s.id ? "bg-tint" : ""}`}>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-2">
                          {hasFile ? <FileText className="w-4 h-4 text-[#5B6B78] shrink-0 mt-0.5" strokeWidth={1.75} /> : <Database className="w-4 h-4 text-[#5B6B78] shrink-0 mt-0.5" strokeWidth={1.75} />}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink">{s.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {hasFile && <FileTypeTag name={s.files[0]} />}
                              <span className="text-xs text-[#5B6B78]">{hasFile ? `${s.files.length} ${s.files.length === 1 ? "file" : "files"}` : s.type}{s.date ? ` · ${s.date}` : ""}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top"><span className="pill pill-neutral whitespace-normal text-left">{s.group}</span></td>
                      <td className="px-4 py-3 align-top text-sm text-ink leading-snug">
                        {forSelected.length
                          ? <>{forSelected[0].charAt(0).toUpperCase() + forSelected[0].slice(1)}{forSelected.length > 1 && <span className="text-[#5B6B78]"> · +{forSelected.length - 1} more</span>}</>
                          : <span className="text-[#8A98A3]">Not cited for this defendant</span>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {hasFile
                          ? <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> On file</span>
                          : <span className="pill pill-neutral">Internal record</span>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <DocActions
                            size="sm"
                            onPreview={() => setOpenSource({ source: s, view: "preview" })}
                            onInsights={() => setOpenSource({ source: s, view: "insights" })}
                            disabled={{
                              preview: hasFile ? undefined : noFile,
                              insights: hasFile ? undefined : noFile,
                              download: hasFile ? "The original file is not stored in this prototype" : noFile,
                            }}
                          />
                          <button
                            onClick={() => setExpandedSource(open ? null : s.id)}
                            aria-expanded={open}
                            aria-label={`${open ? "Hide" : "View"} details for ${s.name}`}
                            className="p-1.5 rounded-lg hover:bg-tint transition-colors"
                          >
                            <ChevronDown className={`w-4 h-4 text-deep transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-offwhite">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <div className="eyebrow mb-1.5">Facts used</div>
                              <ul className="space-y-1">
                                {s.facts.map((f) => (
                                  <li key={f.text} className="text-sm text-ink leading-snug flex gap-2">
                                    {f.at && <span className="mono-ref shrink-0 min-w-[64px] whitespace-nowrap">{f.at}</span>}
                                    <span>{f.text}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="eyebrow mb-1.5">For {selected?.short}</div>
                              <p className="text-sm text-ink leading-snug">{forSelected.length ? forSelected.join(" · ") : "Not cited for this defendant."}</p>
                              <div className="eyebrow mt-3 mb-1">Cited for</div>
                              <p className="text-sm text-ink">{usedBy.length ? usedBy.map((c) => c.short).join(", ") : "No defendant — background record."}</p>
                            </div>
                            <div>
                              <div className="eyebrow mb-1.5">Document</div>
                              <dl className="text-sm space-y-0.5">
                                <div className="flex gap-2"><dt className="text-[#5B6B78] w-14 shrink-0">Type</dt><dd className="text-ink">{s.type}</dd></div>
                                <div className="flex gap-2"><dt className="text-[#5B6B78] w-14 shrink-0">Date</dt><dd className="text-ink">{s.date ?? "Not available"}</dd></div>
                                <div className="flex gap-2"><dt className="text-[#5B6B78] w-14 shrink-0">Files</dt><dd className="text-ink mono-ref break-words min-w-0">{hasFile ? s.files.join(" · ") : "None — an internal record"}</dd></div>
                                <div className="flex gap-2"><dt className="text-[#5B6B78] w-14 shrink-0">ID</dt><dd className="text-ink">Not on record</dd></div>
                              </dl>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {(() => {
          const missing = Array.from(new Set(record.candidates.flatMap((c) => c.requests)));
          return (
            <div className="mt-4 rounded-xl border border-[#FDE6C8] bg-[#FFF7ED]">
              <button onClick={() => setMissingOpen((o) => !o)} aria-expanded={missingOpen} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#B45309]" strokeWidth={1.75} />
                  <span className="text-sm font-semibold text-[#B45309]">Not yet on file · to be requested</span>
                  <span className="pill pill-progress">{missing.length}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[#B45309] transition-transform ${missingOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {missingOpen && (
                <div className="px-4 pb-4">
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {missing.map((r) => (
                      <li key={r} className="text-sm text-ink leading-snug flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-[#B45309] mt-1 shrink-0" strokeWidth={1.75} />{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-[#5B6B78] px-4 pb-3 -mt-1">Nothing has been requested from any defendant yet.</p>
            </div>
          );
        })()}
      </div>

        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-label="Confirm defendant decisions" className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="card-title">Confirm defendant decisions</h2>
              <button onClick={() => setConfirming(false)} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
            </div>
            <div className="p-6 space-y-4">
              <ul className="space-y-2">
                {ordered.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-ink">{c.name}</span>
                    <span className="text-right shrink-0">
                      <span className="font-semibold text-ink">{CHOICE_LABEL[rows[c.id].choice]}</span>
                      {overridden(c) && <span className="block text-xs text-[#B45309]">Changed from {CHOICE_LABEL[choiceFor(c.recommendation)]}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-[#5B6B78]">
                Records and insurance requests will be prepared for {toRequest.length} {toRequest.length === 1 ? "defendant" : "defendants"}. Nothing is sent from here.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line">
              <button onClick={() => setConfirming(false)} className="btn btn-secondary">Back</button>
              <button onClick={commit} className="btn btn-primary">Confirm decisions</button>
            </div>
          </div>
        </div>
      )}

      {details && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={() => setDetails(null)}>
          <aside role="dialog" aria-modal="true" aria-label="Source details" className="bg-white w-full max-w-[480px] h-full flex flex-col shadow-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <div className="eyebrow mb-0.5">Source details</div>
                <h2 className="card-title leading-snug">{details.title}</h2>
              </div>
              <button onClick={() => setDetails(null)} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg shrink-0"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {details.explanation && (
                <div className="rounded-lg bg-tint border border-[#D6F2F7] p-3">
                  <div className="eyebrow text-deep mb-1">Finding</div>
                  <p className="body-text leading-relaxed">{details.explanation}</p>
                </div>
              )}
              <div className="eyebrow">{details.cites.length === 1 ? "Supporting source" : `Supporting sources · ${details.cites.length}`}</div>
              {details.cites.map((c, i) => {
                const src = sourceById(c.sourceId);
                if (!src) return <p key={i} className="text-sm text-[#8A98A3]">Source not on record.</p>;
                const hasFile = src.files.length > 0;
                return (
                  <div key={i} className="rounded-xl border border-line p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink">{src.name}</div>
                        <div className="text-xs text-[#5B6B78]">{[src.type, src.date].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className={`pill shrink-0 ${hasFile ? "pill-complete" : "pill-neutral"}`}>{hasFile ? "On file" : "Internal record"}</span>
                    </div>
                    <div>
                      <div className="eyebrow mb-0.5">What it shows</div>
                      <p className="text-sm text-ink">{c.note}</p>
                    </div>
                    <div>
                      <div className="eyebrow mb-0.5">Facts used from it</div>
                      <ul className="space-y-0.5">{src.facts.map((f) => <li key={f.text} className="text-sm text-[#5B6B78]">{f.at ? `${f.at}: ` : ""}{f.text}</li>)}</ul>
                    </div>
                    {hasFile && <div className="mono-ref break-words">{src.files.join(" · ")}</div>}
                    <div className="pt-2 flex items-center justify-between gap-2 flex-wrap border-t border-line">
                      <button onClick={() => showInEvidence(src.id)} className="text-xs font-semibold text-deep hover:text-ink">Show in Evidence</button>
                      {hasFile ? (
                        <DocActions
                          size="sm"
                          onPreview={() => { setDetails(null); setOpenSource({ source: src, view: "preview" }); }}
                          onInsights={() => { setDetails(null); setOpenSource({ source: src, view: "insights" }); }}
                          disabled={{ download: "The original file is not stored in this prototype" }}
                        />
                      ) : <span className="text-xs text-[#8A98A3]">No document to preview — a case record</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <DocumentWorkspaceModal
        docs={openSource ? openSource.source.files.map((f) => ({ id: f, name: f, source: openSource.source.type, date: openSource.source.date ?? "", category: openSource.source.name })) : null}
        initialView={openSource?.view}
        noteContext={openSource ? { contextType: "Defendant Analysis", reference: openSource.source.name } : undefined}
        insights={openSource ? {
          summary: `What this defendant analysis uses from the ${openSource.source.name.toLowerCase()}.`,
          keyPoints: openSource.source.facts.map((f) => (f.at ? `${f.at}: ${f.text}` : f.text)),
          entities: [
            { label: "Source", value: openSource.source.type },
            { label: "Date", value: openSource.source.date ?? "Not available" },
          ],
          supportingDocs: openSource.source.files,
          confidence: { level: "Extracted facts", score: 0 },
        } : undefined}
        onClose={() => setOpenSource(null)}
      />
    </>
  );
}
