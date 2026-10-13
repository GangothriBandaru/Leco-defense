import { useState } from "react";
import {
  ChevronLeft, ChevronRight, Users, CalendarClock, Gavel, Activity, MapPin, AlertTriangle,
  CheckCircle, FileText, HelpCircle, Lightbulb, ArrowRight, History, Building2, Scale, X,
} from "lucide-react";
import { StageNavigator } from "../components/StageNavigator";
import { DocActions, DocumentWorkspaceModal } from "../components/DocumentWorkspace";
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
const REC_COLUMN: Record<Recommendation, { tone: string; sub: string }> = {
  name: { tone: "border-t-deep bg-[#F6FDFF]", sub: "Liability shown or strongly indicated" },
  investigate: { tone: "border-t-[#F59E0B] bg-[#FFFBF5]", sub: "Pointed to by the record; fault or identity not yet shown" },
  "set-aside": { tone: "border-t-[#9BA8B4] bg-offwhite", sub: "Nothing in the record points to fault" },
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
  { id: "sources", label: "Sources" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "defendant-analysis", label: "Each defendant" },
  { id: "defendant-decisions", label: "Your decision" },
];
const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

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
      <div className="min-w-0">
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
    // A record with no file: bring its card into view instead.
    document.getElementById(`source-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashSource(s.id);
    window.setTimeout(() => setFlashSource(null), 1600);
  };
  const CiteLink = ({ cite }: { cite: Cite }) => {
    const s = sourceById(cite.sourceId);
    return (
      <button onClick={() => openCite(cite)} className="text-xs text-deep underline underline-offset-2 decoration-[#9BDAEC] hover:decoration-deep text-left">
        {s?.name ?? "Source not on record"} · {cite.note}
      </button>
    );
  };
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

  return (
    <>
      {/* The Jurisdiction review's layout: the case summary on the left, held
          below the stage navigation; the analysis on the right, scrolling with
          the page. The summary scrolls on its own only in a window too short
          for it. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,320px)_minmax(0,1fr)] gap-5 items-start">
        {/* ── LEFT — case summary ──
            One light panel. It sticks below the stage navigation and, only in a
            window too short for it, scrolls on its own; its height matches the
            space left below the sticky header, so its end is always on screen,
            and the wheel passes on to the page once it reaches either end. */}
        <aside
          id="case-context"
          className={`min-w-0 ${embedded ? "" : "lg:sticky lg:top-[176px] lg:max-h-[calc(100vh-256px)] lg:overflow-y-auto"}`}
        >
          {/* The Case Intelligence Summary's design: grouped fields on light
              surfaces, cyan icons, muted labels — sized for a sidebar. */}
          <div className="lg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <h3 className="card-title">Case Summary</h3>
              <h2 className="text-[15px] font-semibold text-ink leading-snug">{caseData?.caseName ?? "Case"}</h2>
              {meta.length > 0 && <div className="mono-ref text-[11px] break-words">{meta.join(" · ")}</div>}
              {caseData?.summary && <p className="text-xs text-[#5B6B78] leading-relaxed">{caseData.summary}</p>}
            </div>

            <div className="lg-zone lg-zone-grey p-3 space-y-1.5">
              <div className="eyebrow flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Incident</div>
              <div className="text-sm font-semibold text-ink leading-snug">{record.incident.value}</div>
              <p className="text-xs text-[#5B6B78] leading-relaxed">{record.incident.note}</p>
              {record.incident.cite && <div className="break-words leading-snug"><CiteLink cite={record.incident.cite} /></div>}
            </div>

            <div className="lg-zone lg-zone-grey p-3 space-y-1.5">
              <div className="eyebrow flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Injury</div>
              <div className="text-sm font-semibold text-ink leading-snug">{record.injury.value}</div>
              {record.injury.cite && <div className="break-words leading-snug"><CiteLink cite={record.injury.cite} /></div>}
            </div>

            <div className="lg-zone lg-zone-grey p-3 space-y-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="eyebrow flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Defendant</div>
                  <div className="text-sm font-semibold text-ink leading-snug break-words">{lead?.name ?? "Needs attorney review"}</div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="eyebrow flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Jurisdiction</div>
                  <div className="text-sm font-semibold text-ink leading-snug break-words">{caseData?.jurisdiction ?? "Not available"}</div>
                </div>
              </div>
              <p className="text-xs text-[#5B6B78] leading-relaxed pt-0.5">Defendant not yet verified — the caption names Logistics Co. Jurisdiction analysis {approved ? "approved by the attorney" : "awaiting the attorney's decision"}.</p>
            </div>

            <div className="lg-zone lg-zone-grey p-3 space-y-1.5">
              <div className="eyebrow flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Governing law</div>
              <div className="text-sm font-semibold text-ink">{law.value}{jx?.governingLaw.finding && !approved ? " · System finding" : ""}</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {jx && !approved && <span className="pill pill-neutral">{jx.governingLaw.confidence} confidence</span>}
                {approved
                  ? <span className="pill pill-complete"><CheckCircle className="w-3 h-3" strokeWidth={1.75} /> Attorney approved</span>
                  : <span className="pill pill-progress">Needs attorney review</span>}
              </div>
            </div>

            <div className="lg-zone p-3 space-y-1.5">
              <div className="eyebrow flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Working deadline</div>
              {working ? (
                <>
                  <div className="text-sm font-semibold text-ink">{formatDate(working.iso)}</div>
                  <p className="text-xs text-[#5B6B78] leading-relaxed">{approved ? "Confirmed by the attorney" : "Calculated · not yet confirmed"} · no defendant-specific deadline on record</p>
                </>
              ) : <div className="text-sm font-semibold text-[#B45309]">Needs attorney review</div>}
            </div>
          </div>
        </aside>

        {/* ── RIGHT — the five sections, in order ── */}
        <div className="min-w-0 space-y-6">
          <PageTitle
            right={confirmedAt
              ? <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Decisions confirmed · {confirmedAt}</span>
              : <span className="pill pill-progress">Awaiting attorney decisions</span>}
          />


      <nav aria-label="Sections" className="flex items-center gap-1.5 flex-wrap">
        {SECTIONS.map((x) => (
          <button key={x.id} onClick={() => goTo(x.id)} className="px-3 py-1.5 rounded-lg border border-line bg-white text-xs font-medium text-[#5B6B78] hover:text-ink hover:border-soft transition-colors">
            {x.label}
          </button>
        ))}
      </nav>

      {/* ── B · System recommendation ── */}
      <div id="recommendation" className="lg-card overflow-hidden scroll-mt-[170px]">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="section-header">System recommendation</h3>
            <span className="mono-ref">From the {record.generatedFrom.toLowerCase()} · {confirmedAt ? "decided by the attorney" : "awaiting the attorney's decision"}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
            {[
              { label: "Potential defendants", value: n },
              { label: "Named in evidence", value: named, note: `${n - named} by role only` },
              { label: "Recommended to name", value: count("name") },
              { label: "To investigate", value: count("investigate") },
              { label: "Set aside", value: count("set-aside") },
              { label: "Evidence sources", value: record.sources.length },
            ].map((x) => (
              <div key={x.label} className="lg-zone lg-zone-grey px-3.5 py-3">
                <div className="eyebrow mb-0.5">{x.label}</div>
                <div className="kpi-value" style={{ fontSize: "22px" }}>{x.value}</div>
                {x.note && <div className="text-xs text-[#5B6B78]">{x.note}</div>}
              </div>
            ))}
          </div>
          <p className="body-text leading-relaxed max-w-4xl">
            <strong className="font-semibold">Name {count("name")} now, investigate {count("investigate")}, set aside {count("set-aside")}.</strong> {record.explanation}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 border-t border-line divide-y lg:divide-y-0 lg:divide-x divide-line">
          {groups.map(({ rec, candidates }) => (
            <div key={rec} className={`p-5 border-t-4 ${REC_COLUMN[rec].tone}`}>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="kpi-value" style={{ fontSize: "26px" }}>{candidates.length}</span>
                <div>
                  <div className="text-sm font-semibold text-ink">{REC_LABEL[rec]}</div>
                  <div className="text-xs text-[#5B6B78]">{REC_COLUMN[rec].sub}</div>
                </div>
              </div>
              <div className="space-y-3">
                {candidates.length === 0 && <p className="text-sm text-[#8A98A3]">None.</p>}
                {candidates.map((c) => (
                  <div key={c.id} className="rounded-lg bg-white border border-line p-3">
                    <button onClick={() => select(c.id)} className="flex items-center gap-2 text-left group">
                      <TierBadge tier={c.tier} />
                      <span className="text-sm font-semibold text-ink group-hover:text-deep">{c.name}</span>
                    </button>
                    <p className="text-sm text-[#5B6B78] mt-1 leading-snug">{c.summary}</p>
                    <div className="mt-1"><CiteLink cite={c.identifiedFrom} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {record.decideFirst.length > 0 && (
          <div className="px-6 py-4 border-t border-[#FDE6C8] bg-[#FFF7ED] flex items-start gap-3">
            <span className="text-sm font-semibold text-[#B45309] shrink-0 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" strokeWidth={1.75} /> Decide first</span>
            <ul className="space-y-1">
              {record.decideFirst.map((d) => (
                <li key={d.text} className="text-sm text-ink leading-snug">{d.text} {d.cite && <CiteLink cite={d.cite} />}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Sources ── */}
      <div id="sources" className="lg-card p-6 space-y-5 scroll-mt-[170px]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="section-header">Sources this analysis is based on</h3>
          <span className="secondary-text max-w-xl">Evidence on file, the case record and the jurisdiction analysis. "For {selected?.short}" shows what each source gives the defendant selected above.</span>
        </div>
        {Array.from(new Set(record.sources.map((s) => s.group))).map((group) => (
          <div key={group} className="space-y-3">
            <div className="eyebrow">{group}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {record.sources.filter((s) => s.group === group).map((s) => {
                const cites = (c: Candidate) => [c.identifiedFrom, ...c.why.facts.map((f) => f.cite), ...c.elements.map((e) => e.cite)].filter((x): x is Cite => x?.sourceId === s.id);
                const usedBy = record.candidates.filter((c) => cites(c).length > 0);
                const forSelected = selected ? Array.from(new Set(cites(selected).map((x) => x.note))) : [];
                return (
                  <div key={s.id} id={`source-${s.id}`} className={`rounded-xl border p-4 flex flex-col transition-colors scroll-mt-[170px] ${flashSource === s.id ? "border-brand bg-tint" : "border-line bg-white"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink">{s.name}</div>
                        <div className="text-xs text-[#5B6B78]">{[s.type, s.date].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className="mono-ref shrink-0">{s.files.length ? `${s.files.length} ${s.files.length === 1 ? "file" : "files"}` : "No file"}</span>
                    </div>
                    {s.files.length > 0 && <div className="mono-ref mt-1 break-words">{s.files.join(" · ")} · no document ID on record</div>}
                    <div className="eyebrow mt-3 mb-1">Facts used</div>
                    <ul className="space-y-1">
                      {s.facts.map((f) => (
                        <li key={f.text} className="text-sm text-ink leading-snug flex gap-2">
                          {f.at && <span className="mono-ref shrink-0 w-[72px]">{f.at}</span>}
                          <span>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex-1">
                      <div className="eyebrow mb-0.5">For {selected?.short}</div>
                      <p className="text-xs text-[#5B6B78] leading-snug">{forSelected.length ? forSelected.join(" · ") : "Not cited for this defendant."}</p>
                      {usedBy.length > 0 && <p className="text-xs text-[#8A98A3] mt-1">Cited for: {usedBy.map((c) => c.short).join(", ")}</p>}
                    </div>
                    <div className="mt-3 pt-3 border-t border-line">
                      <DocActions
                        size="sm"
                        onPreview={() => setOpenSource({ source: s, view: "preview" })}
                        onInsights={() => setOpenSource({ source: s, view: "insights" })}
                        disabled={{
                          preview: s.files.length ? undefined : "A case record, not a document file",
                          insights: s.files.length ? undefined : "A case record, not a document file",
                          download: s.files.length ? "The original file is not stored in this prototype" : "A case record, not a document file",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-[#FDE6C8] bg-[#FFFBF5] p-4">
          <div className="eyebrow mb-1.5 text-[#B45309]">Not yet on file · to be requested</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {Array.from(new Set(record.candidates.flatMap((c) => c.requests))).map((r) => (
              <li key={r} className="text-sm text-ink leading-snug flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-[#B45309] mt-1 shrink-0" strokeWidth={1.75} />{r}</li>
            ))}
          </ul>
          <p className="text-xs text-[#5B6B78] mt-2">Nothing has been requested from any defendant yet.</p>
        </div>
      </div>

      {/* ── C · Hierarchy ── */}
      <div id="hierarchy" className="lg-card p-6 space-y-4 scroll-mt-[170px]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="section-header">Defendant hierarchy</h3>
            <p className="secondary-text mt-1 max-w-3xl">How each potential defendant connects to the injury. Indented candidates are answerable through the one above them; dashed cards are not being pursued. Select a card to open its analysis.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-[#5B6B78]">
            {(["Primary", "Secondary", "Tertiary"] as Tier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5"><TierBadge tier={t} /> {t === "Primary" ? "Primary: caused the harm" : t === "Secondary" ? "Secondary: answers for an actor" : "Tertiary: upstream cause"}</span>
            ))}
            <span className="flex items-center gap-1.5"><TierBadge /> Relationship not established</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {record.groups.map((g) => {
            const inGroup = record.candidates.filter((c) => c.groupId === g.id);
            const tops = inGroup.filter((c) => !c.parentId || !inGroup.some((p) => p.id === c.parentId));
            const card = (c: Candidate) => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  c.id === selected?.id ? "border-brand bg-tint" : c.recommendation === "set-aside" ? "border-dashed border-[#9BA8B4] bg-offwhite hover:border-soft" : "border-line bg-white hover:border-soft"
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
                  {kids.length > 0 && <div className="pl-4 ml-2 border-l-2 border-line space-y-2">{kids.map(tree)}</div>}
                </div>
              );
            };
            return (
              <div key={g.id} className="rounded-xl border border-line p-4 space-y-3 min-w-0">
                <div>
                  <div className="text-sm font-semibold text-ink">{g.title}</div>
                  <div className="text-xs text-[#5B6B78]">{g.subtitle}</div>
                </div>
                {tops.map(tree)}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── D · Each defendant ── */}
      <div id="defendant-analysis" className="lg-card p-6 space-y-5 scroll-mt-[170px]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="section-header">Analysis of each defendant</h3>
          <span className="secondary-text">One tab per defendant, grouped by recommendation. Every fact links to its source.</span>
        </div>
        <div className="overflow-x-auto -mx-1 px-1">
          <div role="tablist" className="flex items-end gap-6 min-w-max border-b border-line">
            {groups.filter((g) => g.candidates.length).map(({ rec, candidates }) => (
              <div key={rec}>
                <div className={`eyebrow mb-1.5 ${rec === "investigate" ? "text-[#B45309]" : ""}`}>{REC_LABEL[rec]} · {candidates.length}</div>
                <div className="flex items-center gap-1">
                  {candidates.map((c) => {
                    const on = c.id === selected?.id;
                    return (
                      <button
                        key={c.id}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setSelectedId(c.id)}
                        className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? "border-deep text-deep font-semibold bg-tint rounded-t-lg" : "border-transparent text-[#5B6B78] hover:text-ink"}`}
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
          <div role="tabpanel" className="space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h4 className="page-title" style={{ fontSize: "22px" }}>{selected.name}</h4>
                <p className="secondary-text mt-0.5">{selected.role}</p>
                <p className="text-xs text-[#5B6B78] mt-1">Identified from <CiteLink cite={selected.identifiedFrom} /></p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-[#5B6B78]"><TierBadge tier={selected.tier} /> {selected.tier ?? "Relationship not established"}</span>
                <IdentifiedPill c={selected} />
                <span className="mono-ref">{shownCount(selected)} of {selected.elements.length} elements shown</span>
                <RecPill rec={selected.recommendation} />
              </div>
            </div>

            <div className="rounded-xl border-l-4 border-deep bg-offwhite p-4 space-y-3">
              <div className="text-sm font-semibold text-ink">
                {WHY_HEADING[selected.recommendation]}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5"><FileText className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Facts in the record</div>
                  <ul className="space-y-2">
                    {selected.why.facts.map((f) => (
                      <li key={f.text} className="text-sm text-ink leading-snug">{f.text}{f.cite && <div><CiteLink cite={f.cite} /></div>}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5"><Lightbulb className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Preliminary system assessment</div>
                  {selected.why.inferences.length
                    ? <ul className="space-y-2">{selected.why.inferences.map((t) => <li key={t} className="text-sm text-ink leading-snug">{t}</li>)}</ul>
                    : <p className="text-sm text-[#8A98A3]">None — the system draws no inference here.</p>}
                </div>
                <div>
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
                <div className="rounded-xl border border-line divide-y divide-line">
                  {selected.elements.map((e) => (
                    <div key={e.name} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{e.name}</span>
                        <span className={`pill shrink-0 ${ELEMENT_PILL[e.status]}`}>{e.status}</span>
                      </div>
                      {e.cite && <div className="mt-0.5"><CiteLink cite={e.cite} /></div>}
                      {e.missing && <p className={`text-xs mt-0.5 ${e.status === "Shown" ? "text-[#5B6B78]" : "text-[#B45309]"}`}>{e.missing}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="eyebrow mb-2">Stage 2 will request</div>
                  {selected.requests.length
                    ? <ul className="space-y-1.5">{selected.requests.map((r) => <li key={r} className="text-sm text-ink leading-snug flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-deep mt-1 shrink-0" strokeWidth={1.75} />{r}</li>)}</ul>
                    : <p className="text-sm text-[#8A98A3]">None — no records are requested from this party as a defendant.</p>}
                </div>
                <div>
                  <div className="eyebrow mb-2">What could undo or change this</div>
                  <p className="text-sm text-ink leading-relaxed">{selected.couldUndo}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-2">Investigation plan</div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[720px] border-collapse">
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

            <div className="pt-4 border-t border-line">
              <div className="eyebrow mb-2">Rule trail</div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[720px] border-collapse">
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
      <div id="defendant-decisions" className="lg-card p-6 space-y-4 scroll-mt-[170px]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="section-header">Your decision</h3>
          <span className="secondary-text max-w-xl">The dashed option is the system's recommendation. Records and insurance requests go only to defendants you name or investigate.</span>
        </div>
        <div className="rounded-xl border border-line divide-y divide-line">
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
