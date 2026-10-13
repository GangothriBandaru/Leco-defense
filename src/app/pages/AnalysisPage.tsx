import { useState, useEffect } from "react";
import { FileTypeIcon, FileTypeTag } from "../components/fileType";
import { StageNavigator } from "../components/StageNavigator";
import {
  ChevronLeft, ChevronRight, ChevronDown, CheckCircle, FileText, Eye, Download, X,
  AlertCircle, ArrowRight, User, Building2, Shield, Scale, Stethoscope, Gavel,
  Users, Bot, Sparkles, ArrowUpRight
} from "lucide-react";
import { INSURANCE_ANALYSIS } from "../insurance/insuranceData";
import { Button } from "../components/ui/button";
import { DocActions, DocumentWorkspaceModal } from "../components/DocumentWorkspace";
import {
  CaseDocument, classifyDocuments, generateAnalysisFindings, AnalysisFinding,
} from "../types/case";
import { VIOLATION_CARDS, VIOLATION_SEVERITY_PILL } from "../workspace/WorkspaceTabs";
import { governingLawSummary } from "../jurisdiction/jurisdictionData";
import { defendantsForCase } from "../defendants/defendantData";
import { useDefendantDecisions } from "../defendants/defendantDecisionStore";

/* MARKER-MAKE-KIT-INVOKED */

interface AnalysisPageProps {
  caseData?: {
    caseName: string;
    caseId: string;
    plaintiff: string;
    summary: string;
    jurisdiction?: string;
  };
  documents?: CaseDocument[];
  onStageClick?: (stageName: string) => void;
  onBackToIntake?: () => void;
  onProceedToValuation?: () => void;
  /** Opens the Insurance Policy Analysis summary. */
  onOpenInsurance?: () => void;
  /** Opens the Attorney Jurisdiction Review for this case. */
  onOpenJurisdiction?: () => void;
  /** Opens the Defendant Analysis for this case, with this defendant selected. */
  onOpenDefendants?: (defendantName: string) => void;
  /** The governing law the attorney has approved, once there is one. */
  governingLaw?: string;
  /** Section to bring into view on arrival — used when returning from a sub-page. */
  scrollToSection?: string;
}

// Case narrative — incident → treatment → injury → damages → case ready
interface TimelineEvent {
  id: string;
  date: string;
  title: string;       // brief title shown in the navigation card
  cardTitle: string;   // heading shown in the intelligence panel
  summary: string;
  evidence: string[];
  liabilityImpact?: string;
  injuryImpact?: string;
}

const timelineEvents: TimelineEvent[] = [
  {
    id: "stroke-symptoms",
    date: "Feb 7, 2026",
    title: "Stroke symptoms observed by caregiver",
    cardTitle: "Stroke Symptoms Detected",
    summary: "Caregiver documented facial droop, slurred speech, and right-side weakness consistent with acute stroke onset.",
    evidence: ["Caregiver_Log.pdf", "Facility_Incident_Report.pdf"],
    liabilityImpact: "Establishes that facility staff observed and documented clear stroke indicators, triggering a duty to escalate care immediately.",
    injuryImpact: "Documents the onset of acute neurological symptoms that mark the beginning of the critical treatment window.",
  },
  {
    id: "911-delay",
    date: "Feb 7, 2026",
    title: "Delayed 911 emergency response",
    cardTitle: "Delayed 911 Emergency Response",
    summary: "Facility staff delayed emergency escalation for approximately 145 minutes after documented stroke symptoms, creating a significant treatment delay.",
    evidence: ["Caregiver_Log.pdf", "Facility_Call_Log.pdf", "Emergency_Dispatch_Record.pdf"],
    liabilityImpact: "May establish breach of duty, failure to follow emergency escalation protocols, and negligent delay in treatment.",
    injuryImpact: "Potential worsening of neurological damage due to delayed intervention during the critical stroke treatment window.",
  },
  {
    id: "hospital-admission",
    date: "Feb 7, 2026",
    title: "Hospital admission & intake",
    cardTitle: "Hospital Admission & Intake",
    summary: "Patient admitted to Cook County Medical Center emergency department with acute neurological deficits and documented time of arrival.",
    evidence: ["ER_Admission_Record.pdf", "Triage_Notes.pdf", "Emergency_Dispatch_Record.pdf", "Vitals_Chart.pdf"],
    liabilityImpact: "Hospital intake timestamps corroborate the duration of the escalation delay attributable to the facility.",
    injuryImpact: "Admission findings establish baseline severity of neurological injury upon reaching emergency care.",
  },
  {
    id: "mri-confirmation",
    date: "Feb 9, 2026",
    title: "MRI confirms ischemic stroke",
    cardTitle: "MRI Confirms Ischemic Stroke",
    summary: "MRI imaging confirmed ischemic stroke with permanent neurological injury and associated functional loss.",
    evidence: ["MRI_Cervical.pdf", "Radiology_Report.pdf"],
    liabilityImpact: "Objective imaging links the delayed intervention to a confirmed, diagnosable injury.",
    injuryImpact: "Confirms permanent neurological injury and provides the clinical basis for long-term damages.",
  },
  {
    id: "rehabilitation",
    date: "Mar 4, 2026",
    title: "Rehabilitation begins",
    cardTitle: "Rehabilitation Begins",
    summary: "Patient began an ongoing course of physical and occupational therapy to address persistent right-side weakness.",
    evidence: ["Physical_Therapy_Notes.pdf", "Rehab_Care_Plan.pdf", "Treatment_Records.pdf"],
    liabilityImpact: "Continuity of care documents the ongoing consequences flowing from the initial negligent delay.",
    injuryImpact: "Demonstrates the extent of rehabilitation required and supports future care damages.",
  },
  {
    id: "lost-wages",
    date: "Apr 1, 2026",
    title: "Lost wages documented",
    cardTitle: "Lost Wages Documented",
    summary: "Employment and wage records document loss of income resulting from the disability period following the stroke.",
    evidence: ["Wage_Loss_Statement.pdf", "Employer_Verification.pdf"],
    liabilityImpact: "Connects the defendant's negligence to quantifiable economic harm suffered by the plaintiff.",
    injuryImpact: "Supports economic damages by tying the injury to a measurable loss of earning capacity.",
  },
  {
    id: "current-condition",
    date: "May 20, 2026",
    title: "Current condition assessed",
    cardTitle: "Current Condition Assessed",
    summary: "Latest evaluation documents persistent functional impairment and chronic limitations affecting daily living.",
    evidence: ["Physical_Therapy_Notes.pdf", "Treatment_Records.pdf"],
    liabilityImpact: "Establishes lasting harm directly traceable to the chain of events beginning with the delay.",
    injuryImpact: "Documents permanent impairment and chronic limitations supporting non-economic damages.",
  },
  {
    id: "case-ready",
    date: "Jun 11, 2026",
    title: "Case ready for valuation",
    cardTitle: "Case Ready For Valuation",
    summary: "All liability and injury evidence has been verified and organized — the case is ready to advance to valuation.",
    evidence: [],
    liabilityImpact: "Verified liability chain is fully documented and ready to support a demand.",
    injuryImpact: "Injury severity and ongoing damages are substantiated across the medical record.",
  },
];

// Total events LECO extracted from the record; the timeline surfaces only the key ones
const EXTRACTED_EVENT_COUNT = 53;

export function AnalysisPage({ caseData, documents = [], onStageClick, onBackToIntake, onProceedToValuation, onOpenInsurance, onOpenJurisdiction, onOpenDefendants, governingLaw, scrollToSection }: AnalysisPageProps) {
  // Returning from a sub-page lands back on the section it was opened from.
  useEffect(() => {
    if (!scrollToSection) return;
    const t = setTimeout(() => document.getElementById(scrollToSection)?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(t);
  }, [scrollToSection]);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  // Each entry is one item's set of supporting documents; the workspace pages
  // between items (Prev/Next) and shows each item's documents as viewer tabs.
  const [docSets, setDocSets] = useState<any[][]>([]);
  const [setContexts, setSetContexts] = useState<({ contextType: string; reference: string } | undefined)[]>([]);
  const [setIndex, setSetIndex] = useState(0);
  const activeSet = docSets[setIndex] ?? [];
  const activeContext = setContexts[setIndex];
  // Which view the Document Workspace opens into: "preview" (80/20 doc + action rail),
  // "insights" (60/40 doc + AI panel), or "chat" (AI panel in chat mode).
  const [workspaceView, setWorkspaceView] = useState<"preview" | "insights" | "chat">("preview");
  // Index of the timeline event shown in the detail drawer (null = closed)
  const [drawerEventIndex, setDrawerEventIndex] = useState<number | null>(null);
  // Discovered Signals: active tab + whether each tab is expanded past the first 3
  const [signalTab, setSignalTab] = useState<"liability" | "injury" | "violations">("liability");
  const [signalExpanded, setSignalExpanded] = useState<{ liability: boolean; injury: boolean }>({ liability: false, injury: false });
  // Which signal cards have their Evidence dropdown expanded (keyed by "tab-index").
  const [evidenceOpen, setEvidenceOpen] = useState<Set<string>>(new Set());
  const toggleEvidence = (key: string) =>
    setEvidenceOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  // Per-set AI Insights passed to the Document Workspace (so the preview's
  // Insights panel matches the card's inline AI summary).
  const [insightsSets, setInsightsSets] = useState<(any | undefined)[]>([]);
  // Per-set Document Context Panel data (so the preview rail shows the card's
  // title + key info — mirrors the Negligence Analysis cards).
  const [panelSets, setPanelSets] = useState<(any | undefined)[]>([]);

  // Derive everything from shared documents
  const categories = classifyDocuments(documents);
  const signals = generateAnalysisFindings(categories);
  const verifiedDocuments = documents.map((d) => ({
    ...d,
    category: categories.find((c) => c.docs.some((f) => f.id === d.id))?.name ?? "General Documents",
    status: "Verified",
    source: d.source === "Plaintiff" ? "Plaintiff" : "Attorney Office",
  }));
  const hasFindings = signals.length > 0;

  const liabilitySignals = signals.filter((s) => s.kind === "liability");
  const injurySignals = signals.filter((s) => s.kind === "injury");
  const liabilityCount = liabilitySignals.length;
  const injuryCount = injurySignals.length;
  const violationCount = VIOLATION_CARDS.length;
  const verifiedCount = verifiedDocuments.length || 12;

  const defaultCaseData = {
    caseName: "Estate of Miller vs Logistics Co.",
    caseId: "PI-2024-001",
    plaintiff: "Evelyn Miller",
    summary: "Motor vehicle accident resulting in cervical disc herniation and ongoing physical therapy.",
    jurisdiction: "Cook County, Illinois",
  };

  const data = { ...defaultCaseData, ...caseData };

  const docForFile = (file: string) =>
    verifiedDocuments.find((d) => d.name === file) ??
    ({ id: file, name: file, source: "Attorney Office", date: "Jun 8, 2026", status: "Verified", category: "General Documents" } as typeof verifiedDocuments[number]);

  // Open the unified Document Workspace. `sets` is a list of items, each item
  // being its own array of supporting documents (rendered as viewer tabs);
  // `contexts` is the parallel note-context for each item (signal/document).
  const openSets = (
    sets: any[][],
    contexts: ({ contextType: string; reference: string } | undefined)[],
    index = 0,
    view: "preview" | "insights" | "chat" = "preview",
    insights?: (any | undefined)[],
    panels?: (any | undefined)[],
  ) => {
    setDocSets(sets);
    setSetContexts(contexts);
    setSetIndex(index);
    setWorkspaceView(view);
    setInsightsSets(insights ?? []);
    setPanelSets(panels ?? []);
    setShowDocumentPreview(true);
  };

  // Build the AI Insights for one signal — its conclusion is the headline AI
  // summary; the evidence quotes are the supporting key points.
  const signalInsight = (s: AnalysisFinding) => ({
    summary: s.conclusion,
    keyPoints: s.evidence.map((e) => e.quote),
    entities: [
      { label: "Signal", value: s.tag },
      { label: "Confidence", value: `${s.confidence}%` },
    ],
    supportingDocs: s.evidence.map((e) => e.file),
    confidence: { level: s.confidence >= 85 ? "High" : "Medium", score: s.confidence },
  });

  // Document Context Panel data for the preview rail — surfaces the signal's
  // title + key info (mirrors the Negligence Analysis cards).
  const signalPanel = (s: AnalysisFinding) => ({
    summary: [
      { label: s.kind === "liability" ? "Liability Signal" : "Injury Signal", value: s.title },
      { label: "Category", value: s.tag },
      { label: "Confidence", value: `${s.confidence}%` },
      { label: "Supporting Documents", value: String(s.evidence.length) },
    ],
  });

  // Document Context Panel + AI Insights for a timeline event, so the workspace
  // opened from the timeline drawer surfaces the event's title + key info.
  const timelinePanel = (ev: TimelineEvent) => ({
    summary: [
      { label: "Event", value: ev.cardTitle },
      { label: "Date", value: ev.date },
      { label: "Supporting Documents", value: String(ev.evidence.length) },
    ],
  });
  const timelineInsight = (ev: TimelineEvent) => ({
    summary: ev.summary,
    keyPoints: [ev.liabilityImpact, ev.injuryImpact].filter(Boolean) as string[],
    entities: [
      { label: "Event", value: ev.cardTitle },
      { label: "Date", value: ev.date },
    ],
    supportingDocs: ev.evidence,
    confidence: { level: "High", score: 96 },
  });
  // Preview evidence from the timeline drawer — carries the event context so the
  // preview rail shows the card's title + info. `focus` selects the active tab.
  const openTimelineEvidence = (ev: TimelineEvent, view: "preview" | "insights" | "chat" = "preview", focus?: string) => {
    if (ev.evidence.length === 0) return;
    const ordered = focus ? [focus, ...ev.evidence.filter((f) => f !== focus)] : ev.evidence;
    openSets(
      [ordered.map(docForFile)],
      [{ contextType: "Timeline Event", reference: ev.cardTitle }],
      0, view, [timelineInsight(ev)], [timelinePanel(ev)],
    );
  };

  // Analysis Complete panel → smooth-scroll navigation into the matching section
  const scrollToId = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goToSignals = (tab: "liability" | "injury" | "violations") => {
    setSignalTab(tab);
    setTimeout(() => scrollToId("signals-section"), 60);
  };

  // Case Intelligence Summary fields
  // Jurisdiction opens the Attorney Jurisdiction Review. Governing Law shows the
  // approved law, else the provisional finding — labelled as such.
  const law = governingLawSummary(data.caseId, data.jurisdiction, governingLaw);
  // Defendant opens the Defendant Analysis; its note comes from that record.
  const DEFENDANT = "Memory Care Facility LLC";
  const defendants = defendantsForCase(data.caseId);
  const defendantDecisions = useDefendantDecisions(defendants?.id);
  const defendantNote = defendants
    ? `${defendants.candidates.length} potential defendants · ${defendantDecisions?.confirmedAt ? "decisions confirmed" : "awaiting attorney decisions"}`
    : undefined;
  const summaryRows: { icon: any; label: string; value?: string; note?: string; onClick?: () => void; hint?: string }[] = [
    { icon: User, label: "Plaintiff", value: data.plaintiff },
    { icon: Building2, label: "Defendant", value: DEFENDANT, note: defendantNote, onClick: onOpenDefendants ? () => onOpenDefendants(DEFENDANT) : undefined, hint: "Open the Defendant Analysis" },
    { icon: Shield, label: "Insurance Carrier", value: "ABC Professional Liability Insurance" },
    { icon: Scale, label: "Jurisdiction", value: data.jurisdiction, onClick: onOpenJurisdiction, hint: "Open the Attorney Jurisdiction Review" },
    { icon: Gavel, label: "Governing Law", value: law.value, note: law.note },
  ];

  return (
    <div className="min-h-screen bg-wash">
      {/* Breadcrumb */}
      <div className="bg-white sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToIntake}
              className="flex items-center gap-2 secondary-text hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to Case Intake
            </button>
            <div className="secondary-text ml-auto">
              Case Intake <span className="mx-2">›</span>
              <span className="text-ink font-medium">{data.caseName}</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Analysis" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">

        {documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-tint rounded-xl flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8 text-[#5B6B78]" strokeWidth={1.75} />
            </div>
            <h2 className="section-header mb-2">Not enough evidence to generate intelligence findings</h2>
            <p className="secondary-text mb-6 max-w-sm">LECO requires supporting documentation before identifying liability signals.</p>
            <div className="flex gap-3">
              <button onClick={() => onStageClick?.("Client Intake")} className="btn btn-secondary">Request Additional Documents</button>
            </div>
          </div>
        )}

        {documents.length > 0 && !hasFindings && (
          <div className="lg-card p-6 text-center">
            <AlertCircle className="w-8 h-8 text-deep mx-auto mb-3" strokeWidth={1.75} />
            <h2 className="card-title mb-1">Not enough evidence to generate intelligence findings</h2>
            <p className="secondary-text">Upload police reports or medical records to unlock liability and injury signals.</p>
          </div>
        )}

        {documents.length > 0 && (
        <>
        {/* Page Header — current stage */}
        <h1 className="text-[24px] font-semibold leading-tight">
          <span className="text-[#5B6B78]">Stage 2 -</span> <span className="text-ink">Analysis</span>
        </h1>

        {/* ── Case Intelligence + Timeline Hero (45 / 55) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-6 items-start">

          {/* LEFT (45%) — Case Intelligence Summary, compact card grid (sticky while timeline scrolls) */}
          <div id="case-intelligence" className="lg-card p-6 flex flex-col lg:sticky lg:top-[150px] self-start scroll-mt-[150px]">
            <div className="flex items-center gap-2.5 mb-5">
              <h2 className="section-header">Case Intelligence Summary</h2>
              <span className="pill pill-complete">92% Complete</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {summaryRows.map(({ icon: Icon, label, value, note, onClick, hint }) => {
                const body = (
                  <>
                    <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                      <Icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      {label}
                    </div>
                    <p className="text-sm font-semibold text-ink leading-snug">{value}</p>
                    {note && <p className="text-xs text-[#5B6B78] leading-snug mt-0.5">{note}</p>}
                  </>
                );
                return onClick ? (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    title={hint}
                    aria-label={`${label}: ${value}. ${hint}`}
                    className="group relative text-left flex flex-col justify-start lg-zone lg-zone-grey p-4 cursor-pointer transition-all hover:border-soft hover:shadow-sm active:scale-[0.99]"
                  >
                    {body}
                    <ArrowUpRight className="absolute top-3 right-3 w-3.5 h-3.5 text-deep opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
                  </button>
                ) : (
                  <div key={label} className="lg-zone lg-zone-grey p-4">{body}</div>
                );
              })}

              <div className="lg-zone lg-zone-grey p-4">
                <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                  <Users className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Key Witnesses
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">Officer D. Vance</p>
                <p className="text-sm font-semibold text-ink leading-snug">John Peterson</p>
              </div>

              <div className="lg-zone lg-zone-grey p-4">
                <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                  <Stethoscope className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Primary Medical Providers
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">Cook County Medical Center</p>
                <p className="text-sm font-semibold text-ink leading-snug">Physical Therapy Associates</p>
              </div>

              <div className="lg-zone lg-zone-grey p-4">
                <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                  <Shield className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Verified Evidence
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">{verifiedCount} <span className="font-medium text-[#5B6B78]">Documents</span></p>
              </div>

              <div className="lg-zone lg-zone-grey p-4">
                <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                  <CheckCircle className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Analysis Status
                </div>
                <span className="pill pill-complete">Complete</span>
              </div>
            </div>

            {/* Primary CTA pinned full-width at the bottom */}
            <Button
              onClick={onProceedToValuation}
              className="btn btn-primary gap-2 w-full mt-5"
            >
              Proceed To Valuation
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>

          {/* RIGHT (55%) — High-level Case Timeline */}
          <div className="lg-card p-6">
            <h2 className="section-header mb-1">Case Timeline Overview</h2>
            <p className="secondary-text mb-5">{timelineEvents.length} Key Events from {EXTRACTED_EVENT_COUNT} Extracted Events</p>

            <div className="relative">
              {timelineEvents.map((ev, i) => {
                const isLast = i === timelineEvents.length - 1;
                return (
                  <div key={ev.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {/* Marker + connector line */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-3 h-3 rounded-full border-2 bg-white border-soft mt-2.5" />
                      {!isLast && <div className="w-px flex-1 bg-line mt-1" />}
                    </div>

                    {/* Compact event card — date, title, supporting doc count + View Details */}
                    <button
                      onClick={() => setDrawerEventIndex(i)}
                      className="group flex-1 flex items-center justify-between gap-3 text-left rounded-lg border border-line bg-white px-4 py-2.5 mb-1 transition-colors hover:border-soft hover:bg-wash"
                    >
                      <div className="min-w-0">
                        <div className="mono-ref mb-1">{ev.date}</div>
                        <div className="text-sm font-semibold text-ink leading-snug mb-1.5">{ev.title}</div>
                        <div className="flex items-center gap-1.5 secondary-text">
                          <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                          {ev.evidence.length} Supporting {ev.evidence.length === 1 ? "Doc" : "Docs"}
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-sm font-medium text-deep opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                        View Details
                        <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Analysis Summary + Signals (20 / 80) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[80fr_20fr] gap-6 items-start">

        {/* LEFT (80%) — Signals + Evidence Verification (the tall, scrolling column) */}
        <div className="space-y-8 min-w-0 lg:order-1">

        {/* ── Discovered Liability & Injury Signals ── */}
        <div id="signals-section" className="lg-card bg-offwhite p-6 scroll-mt-[150px]">
            <h2 className="section-header mb-1">Discovered Liability & Injury Signals</h2>
            <p className="secondary-text mb-5">The most important liability and injury findings identified by LECO — each links to the verified evidence behind it.</p>

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-6">
              {([
                { key: "liability", label: "Liability Signals", count: liabilityCount },
                { key: "injury", label: "Injury Signals", count: injuryCount },
                { key: "violations", label: "Violation Analysis", count: violationCount },
              ] as const).map((tab) => {
                const isActive = signalTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setSignalTab(tab.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      isActive
                        ? "bg-tint border-brand text-deep"
                        : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                );
              })}
            </div>

            {signalTab === "violations" ? (
              <div className="space-y-4">
                <p className="secondary-text -mt-1">
                  LECO cross-referenced the case record against the governing traffic-safety statutes and identified {violationCount} applicable violations. Each carries through to the Violations tab in the Case Workspace for the full statutory analysis, evidence, and defense-rebuttal detail.
                </p>
                <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                  {VIOLATION_CARDS.map((v) => (
                    <div key={v.id} className="flex items-start gap-3 p-4 bg-white">
                      <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                        <Gavel className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="card-title leading-snug">{v.title}</h3>
                          <span className={VIOLATION_SEVERITY_PILL[v.severity]}>{v.severity}</span>
                        </div>
                        <p className="secondary-text mt-1 leading-relaxed">{v.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (() => {
              const list = signalTab === "liability" ? liabilitySignals : injurySignals;
              const expanded = signalExpanded[signalTab];
              const visible = expanded ? list : list.slice(0, 3);
              const remaining = list.length - 3;
              const KindIcon = signalTab === "liability" ? Scale : Stethoscope;
              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visible.map((item, i) => (
                      <div
                        key={i}
                        className="lg-card-i rounded-xl border border-line bg-white flex flex-col"
                      >
                        <div className="p-5 flex flex-col flex-1">
                          {/* Eyebrow label */}
                          <div className="eyebrow flex items-center gap-1.5 mb-2">
                            <KindIcon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                            {item.tag}
                          </div>

                          {/* Title */}
                          <h3 className="card-title mb-2 leading-snug">{item.title}</h3>

                          {/* Summary */}
                          <p className="body-text leading-relaxed">{item.description}</p>

                          {/* Supporting evidence — expandable to reveal an AI summary */}
                          {(() => {
                            const evKey = `${signalTab}-${i}`;
                            const evOpen = evidenceOpen.has(evKey);
                            return (
                              <div className="mt-4 pt-4 border-t border-line">
                                <button
                                  onClick={() => toggleEvidence(evKey)}
                                  className="w-full flex items-center justify-between gap-2 group"
                                >
                                  <span className="eyebrow group-hover:text-ink transition-colors">Evidence</span>
                                  <ChevronDown className={`w-4 h-4 text-deep transition-transform ${evOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                                </button>
                                <div className="flex items-center gap-1.5 secondary-text mt-1.5">
                                  <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                                  {item.evidence.length} Supporting {item.evidence.length === 1 ? "Document" : "Documents"}
                                </div>
                                {evOpen && (
                                  <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                                      <span className="eyebrow text-deep">AI Summary</span>
                                    </div>
                                    <p className="secondary-text leading-relaxed">{item.conclusion}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Actions — pinned to the bottom; Preview & Insights open the same
                              workspace. Each signal's full set of supporting documents shows as
                              viewer tabs; Prev/Next pages between the visible signals. */}
                          <div className="mt-auto pt-4 flex items-center gap-2">
                            <button
                              onClick={() => openSets(
                                visible.map((s) => s.evidence.map((e: any) => docForFile(e.file))),
                                visible.map((s) => ({ contextType: s.kind === "liability" ? "Liability Signal" : "Injury Signal", reference: s.title })),
                                i, "preview", visible.map(signalInsight), visible.map(signalPanel),
                              )}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
                            >
                              <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
                            </button>
                            <button
                              onClick={() => openSets(
                                visible.map((s) => s.evidence.map((e: any) => docForFile(e.file))),
                                visible.map((s) => ({ contextType: s.kind === "liability" ? "Liability Signal" : "Injury Signal", reference: s.title })),
                                i, "insights", visible.map(signalInsight), visible.map(signalPanel),
                              )}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                            >
                              <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {list.length > 3 && (
                    <div className="mt-5 flex justify-center">
                      <button
                        onClick={() => setSignalExpanded((prev) => ({ ...prev, [signalTab]: !prev[signalTab] }))}
                        className="btn btn-secondary gap-2"
                      >
                        {expanded ? "Show Fewer Findings" : `View ${remaining} More Findings`}
                        <ArrowRight className={`w-4 h-4 transition-transform ${expanded ? "-rotate-90" : ""}`} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

        {/* ── Insurance Policy Analysis ──
            Entry point to the insurance module; the analysis itself lives on its
            own pages so this stage stays a scannable overview. */}
        <div id="insurance-analysis" className="lg-card bg-offwhite p-6 scroll-mt-[150px]">
          {/* Same finding card as the signals above: icon eyebrow, title,
              summary, a divider meta row, then an outline action. */}
          <div className="lg-card-i rounded-xl border border-line bg-white flex flex-col">
            <div className="p-5 flex flex-col flex-1">
              <div className="eyebrow flex items-center gap-1.5 mb-2">
                <Shield className="w-4 h-4 text-deep" strokeWidth={1.75} />
                Insurance
              </div>
              <h3 className="card-title mb-2 leading-snug">{INSURANCE_ANALYSIS.title}</h3>
              <p className="body-text leading-relaxed">
                Legal validity, coverage, limits, red flags, liens and insurer profile in one attorney-ready view.
              </p>
              <div className="mt-4 pt-4 border-t border-line flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <span className="eyebrow">Analysed</span>
                  <div className="flex items-center gap-1.5 secondary-text mt-1.5">
                    <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                    {INSURANCE_ANALYSIS.analysedOn}
                  </div>
                </div>
                <button
                  onClick={onOpenInsurance}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                >
                  Open <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Evidence Verification ── */}
        <div id="evidence-verification" className="lg-card !p-0 overflow-hidden scroll-mt-[150px]">
          <div className="px-6 py-5 border-b border-line">
            <h2 className="section-header">Evidence Verification</h2>
            <p className="secondary-text mt-0.5">Inspect the source documents used during analysis.</p>
          </div>
          <table className="w-full">
            <thead className="bg-wash border-b border-line">
              <tr>
                <th className="px-6 py-3 text-left eyebrow">Document Name</th>
                <th className="px-6 py-3 text-left eyebrow">Category</th>
                <th className="px-6 py-3 text-left eyebrow">Status</th>
                <th className="px-6 py-3 text-right eyebrow">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {verifiedDocuments.map((doc, i) => (
                <tr key={doc.id} className="lg-row transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <FileTypeIcon name={doc.name} className="w-4 h-4 text-[#5B6B78] shrink-0" />
                      <span className="mono-ref text-ink">{doc.name}</span>
                      <FileTypeTag name={doc.name} />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="pill pill-neutral">
                      {doc.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="pill pill-complete">
                      <CheckCircle className="w-4 h-4" strokeWidth={1.75} />
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <DocActions
                      size="sm"
                      onPreview={() => openSets(verifiedDocuments.map((d) => [d]), verifiedDocuments.map((d) => ({ contextType: "Document", reference: d.name })), i, "preview")}
                      onInsights={() => openSets(verifiedDocuments.map((d) => [d]), verifiedDocuments.map((d) => ({ contextType: "Document", reference: d.name })), i, "insights")}
                      onDownload={() => {}}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        </div>{/* end signals/evidence column */}

        {/* RIGHT (20%) — Analysis Complete: sticky progress + navigation panel */}
        <div className="lg:order-2 lg:sticky lg:top-[150px] self-start">
          <div className="lg-card p-5">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-full bg-tint border border-line flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-deep" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="card-title leading-tight">Analysis Complete</h2>
                <p className="secondary-text leading-snug">Case Intelligence Generated Successfully</p>
              </div>
            </div>

            {/* Stacked, clickable summary cards */}
            <div className="space-y-3">
              {([
                { value: liabilityCount, label: "Liability Signals", onClick: () => goToSignals("liability") },
                { value: injuryCount, label: "Injury Signals", onClick: () => goToSignals("injury") },
                { value: violationCount, label: "Violation Analysis", onClick: () => goToSignals("violations") },
                // Insurance has no count to show, so its icon takes the value slot —
                // a navigation entry, not a figure from the analysis.
                { value: null, label: "Insurance Analysis", icon: Shield, onClick: () => onOpenInsurance?.() },
                { value: verifiedCount, label: "Verified Evidence", onClick: () => scrollToId("evidence-verification") },
              ] as { value: number | null; label: string; icon?: any; onClick: () => void }[]).map(({ value, label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="group w-full lg-zone rounded-xl p-4 text-left flex items-center justify-between gap-3 transition-all hover:border-soft hover:bg-wash hover:shadow-sm active:scale-[0.99]"
                >
                  <div>
                    {/* The icon is sized to the value's line so every tile is the same height. */}
                    <div className="kpi-value leading-none">
                      {Icon ? <Icon className="w-7 h-7 text-deep" strokeWidth={1.75} /> : value}
                    </div>
                    <div className="eyebrow mt-1.5">{label}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-deep shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" strokeWidth={1.75} />
                </button>
              ))}
            </div>

            {/* Primary CTA */}
            <Button onClick={onProceedToValuation} className="btn btn-primary gap-2 w-full mt-4">
              Proceed To Valuation
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        </div>{/* end Signals + Analysis Summary grid */}

        </>
        )}

      </div>

      {/* ── Timeline Event Detail Drawer ── */}
      {drawerEventIndex !== null && (() => {
        const ev = timelineEvents[drawerEventIndex];
        const isFirst = drawerEventIndex === 0;
        const isLast = drawerEventIndex === timelineEvents.length - 1;
        return (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawerEventIndex(null)} />
            <div className="relative bg-white w-full sm:w-[42vw] sm:min-w-[440px] sm:max-w-[760px] h-full flex flex-col shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-line shrink-0">
                <div>
                  <div className="eyebrow mb-1.5">Event {drawerEventIndex + 1} of {EXTRACTED_EVENT_COUNT}</div>
                  <h2 className="section-header leading-snug">{ev.cardTitle}</h2>
                  <div className="mono-ref mt-1">{ev.date}</div>
                </div>
                <button onClick={() => setDrawerEventIndex(null)} className="p-2 hover:bg-tint rounded-lg transition-colors shrink-0">
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Supporting Documents — shown immediately */}
                <div>
                  <div className="eyebrow flex items-center gap-1.5 mb-3">
                    <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                    Supporting Documents
                  </div>
                  {ev.evidence.length === 0 ? (
                    <p className="secondary-text">No supporting documents linked to this event.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {ev.evidence.map((file) => (
                        <div key={file} className="rounded-lg border border-line bg-wash p-3">
                          <div className="flex items-center gap-2 mb-2.5">
                            <FileTypeIcon name={file} className="w-4 h-4 text-[#5B6B78] shrink-0" />
                            <span className="mono-ref text-ink truncate">{file}</span>
                            <FileTypeTag name={file} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openTimelineEvidence(ev, "preview", file)}
                              className="flex items-center gap-1.5 text-xs font-medium text-deep hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-tint transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview
                            </button>
                            <button
                              className="flex items-center gap-1.5 text-xs font-medium text-deep hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-tint transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Summary */}
                <div className="pt-5 border-t border-line">
                  <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
                    AI Summary
                  </div>
                  <p className="body-text leading-relaxed">{ev.summary}</p>
                </div>

                {/* Why It Matters */}
                {ev.liabilityImpact && (
                  <div className="pt-5 border-t border-line">
                    <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                      <Scale className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      Why It Matters
                    </div>
                    <p className="body-text leading-relaxed">{ev.liabilityImpact}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-5 border-t border-line">
                  <Button
                    onClick={() => openTimelineEvidence(ev, "preview")}
                    disabled={ev.evidence.length === 0}
                    className="btn btn-primary gap-2 flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview All Evidence
                  </Button>
                  <Button
                    onClick={() => openTimelineEvidence(ev, "chat")}
                    disabled={ev.evidence.length === 0}
                    className="btn btn-secondary gap-2 flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Bot className="w-4 h-4" strokeWidth={1.75} /> Chat With AI
                  </Button>
                </div>
              </div>

              {/* Footer Navigation */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-line shrink-0">
                <button
                  onClick={() => setDrawerEventIndex((idx) => (idx === null ? null : Math.max(0, idx - 1)))}
                  disabled={isFirst}
                  className="btn btn-secondary gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> Previous Event
                </button>
                <button
                  onClick={() => setDrawerEventIndex((idx) => (idx === null ? null : Math.min(timelineEvents.length - 1, idx + 1)))}
                  disabled={isLast}
                  className="btn btn-secondary gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next Event <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Document Workspace — unified Preview + Insights modal ── */}
      <DocumentWorkspaceModal
        docs={showDocumentPreview ? activeSet : null}
        noteContext={activeContext}
        insights={insightsSets[setIndex]}
        contextPanel={panelSets[setIndex]}
        initialView={workspaceView}
        position={setIndex + 1}
        total={docSets.length}
        onPrev={() => setSetIndex((i) => Math.max(0, i - 1))}
        onNext={() => setSetIndex((i) => Math.min(docSets.length - 1, i + 1))}
        onClose={() => { setShowDocumentPreview(false); setDocSets([]); setSetContexts([]); setSetIndex(0); setPanelSets([]); }}
        onDownload={() => {}}
      />
    </div>
  );
}
