import { useState, useEffect } from "react";
import { FileTypeIcon, FileTypeTag } from "../components/fileType";
import { StageNavigator } from "../components/StageNavigator";
import {
  ChevronLeft, ChevronRight, ChevronDown, CheckCircle, FileText, Eye, Download, X,
  AlertCircle, ArrowRight, User, Building2, Shield, Scale, Stethoscope, Gavel,
  Users, Bot, Sparkles, ArrowUpRight, Plus, Pencil, Trash2, RotateCcw, ClipboardList, ExternalLink, CalendarDays
} from "lucide-react";
import { INSURANCE_ANALYSIS } from "../insurance/insuranceData";
import { Button } from "../components/ui/button";
import { DocActions, DocumentWorkspaceModal, RowMenu, RowActionGroup } from "../components/DocumentWorkspace";
import { EditDocumentDialog, DeleteDocumentDialog } from "../components/DocumentDialogs";
import { downloadMediaFile, deleteMediaFile } from "../intake/mediaFileStore";
import { releaseIntakeUpload } from "../intake/intakeRequestStore";
import { now as nowLabel } from "../intake/docProcessing";
import { draftEventFromText } from "../timeline/eventDraft";
import {
  CaseDocument, classifyDocuments, generateAnalysisFindings, AnalysisFinding,
} from "../types/case";
import { VIOLATION_CARDS, VIOLATION_SEVERITY_PILL } from "../workspace/WorkspaceTabs";
import { governingLawSummary } from "../jurisdiction/jurisdictionData";
import { defendantsForCase } from "../defendants/defendantData";
import { useDefendantDecisions } from "../defendants/defendantDecisionStore";
import { LiabilityWorkspace } from "./LiabilityWorkspace";
import { liabilityForCase } from "../liability/liabilityData";
import {
  useCaseTimeline, addTimelineEvent, updateManualEvent, editExtractedEvent, removeTimelineEvent, restoreExtractedEvents,
  EVENT_TYPES, type EventFields, type EventType,
} from "../timeline/timelineEventStore";

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
  /** Show one findings set as its own page instead of the stage overview. */
  detail?: AnalysisDetail;
  /** Opens a findings set on its own page. */
  onOpenDetail?: (detail: AnalysisDetail) => void;
  /** From a findings page, back to the stage overview. */
  onBackToAnalysis?: () => void;
  /** Opens the Medical Chronology. */
  onOpenChronology?: () => void;
  /** Changes the case documents (edit, delete) from their latest value. */
  onDocumentsUpdate?: (fn: (docs: CaseDocument[]) => CaseDocument[]) => void;
}

export type AnalysisDetail = "liability" | "injury" | "violations" | "timeline";

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

/** Who is making timeline changes, as other attorney decisions record it. */
const REVIEWER = "J. Davis";

// Timeline dates are shown "Feb 7, 2026" and edited as yyyy-mm-dd.
const toIso = (shown: string) => {
  const d = new Date(shown);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** An event as the timeline shows it: an extracted event with any attorney
 *  edits applied (the extracted original kept alongside), or one the attorney added. */
interface ShownEvent {
  id: string;
  origin: "extracted" | "manual";
  date: string;
  iso: string;
  title: string;
  cardTitle: string;
  /** The extracted summary — extracted events only, never edited. */
  summary?: string;
  /** The attorney's description. */
  description?: string;
  type?: EventType;
  evidence: string[];
  sourceRef?: string;
  liabilityImpact?: string;
  injuryImpact?: string;
  original?: TimelineEvent;
  /** The attorney's edit to an extracted event: who, when, what. */
  edit?: { at: string; by: string; fields: string[] };
  createdBy?: string;
  /** Ties on the same date keep the extracted order, then the order added. */
  order: number;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Add / edit an event — one form for both. */
function EventFormModal({
  heading, initial, docOptions, extractedSummary, onSave, onClose, allowAI = false,
}: {
  heading: string;
  /** Offer "Create with AI" — drafting the fields from a description. */
  allowAI?: boolean;
  initial: EventFields;
  /** The case's documents, plus any already linked to this event. */
  docOptions: string[];
  extractedSummary?: string;
  /** Saves; returns an error to show, or null. */
  onSave: (fields: EventFields) => string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EventFields>(initial);
  const [error, setError] = useState<string | null>(null);
  // Create with AI: the attorney's description fills the same form; they
  // review every field, and only Save Event saves.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiResult, setAiResult] = useState<{ ok: boolean; text: string; needed: string[] } | null>(null);
  const runAI = () => {
    if (!aiText.trim()) { setAiResult({ ok: false, text: "Describe the event first.", needed: [] }); return; }
    const draft = draftEventFromText(aiText, docOptions);
    if (draft.filled.length === 0) {
      setAiResult({ ok: false, text: "No event details could be read from that description. Fill in the form below, or rephrase it with a quoted title and a full date.", needed: [] });
      return;
    }
    setForm((f) => ({ ...f, ...draft.fields, evidence: draft.fields.evidence ?? f.evidence }));
    setError(null);
    setAiResult({ ok: true, text: `Filled in: ${draft.filled.join(", ")}. Review every field before saving.`, needed: draft.needed });
  };
  const toggleDoc = (name: string) =>
    setForm((f) => ({ ...f, evidence: f.evidence.includes(name) ? f.evidence.filter((x) => x !== name) : [...f.evidence, name] }));
  const submit = () => {
    const title = form.title.trim();
    if (!title) { setError("An event title is required."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) { setError("Enter a valid event date."); return; }
    const year = Number(form.date.slice(0, 4));
    if (year < 1900 || year > 2100) { setError("Enter a valid event date."); return; }
    setError(onSave({ ...form, title, description: form.description.trim() }));
  };
  const input = "w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand";
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={heading} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="card-title">{heading}</h2>
          <div className="flex items-center gap-2">
            {allowAI && (
              <button
                type="button"
                onClick={() => setAiOpen((o) => !o)}
                aria-expanded={aiOpen}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-line bg-white text-deep text-xs font-semibold hover:bg-tint transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Create with AI
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
          </div>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {aiOpen && (
            <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-3.5 space-y-2.5">
              <label className="block">
                <span className="eyebrow block mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Describe the event</span>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  rows={3}
                  placeholder="Describe the timeline event you want to add…"
                  className={`${input} resize-y`}
                />
              </label>
              <p className="text-[11px] text-[#8A98A3]">
                Read in this browser from your words only — dates need a year, and only this case's documents can be suggested. Nothing is saved until you choose Save Event.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setAiOpen(false); setAiResult(null); }} className="h-8 px-2.5 rounded-lg border border-line bg-white text-ink text-xs font-semibold hover:bg-wash">Use the form instead</button>
                <button type="button" onClick={runAI} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold"><Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Fill the form</button>
              </div>
              {aiResult && (
                <div role={aiResult.ok ? "status" : "alert"} className={`text-xs rounded-lg px-3 py-2 ${aiResult.ok ? "bg-white border border-line text-ink" : "bg-[#FEF2F2] border border-[#FBD5D5] text-[#B91C1C]"}`}>
                  <p>{aiResult.text}</p>
                  {aiResult.needed.length > 0 && <p className="text-[#B45309] mt-1">Still needed: {aiResult.needed.join("; ")}.</p>}
                </div>
              )}
            </div>
          )}
          <label className="block">
            <span className="eyebrow block mb-1">Event title *</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow block mb-1">Event date *</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
            </label>
            <label className="block">
              <span className="eyebrow block mb-1">Event type</span>
              <select value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: (e.target.value || undefined) as EventType | undefined })} className={input}>
                <option value="">Not set</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          {extractedSummary && (
            <div>
              <span className="eyebrow block mb-1">Extracted summary</span>
              <p className="text-sm text-[#5B6B78] leading-relaxed rounded-lg bg-wash border border-line px-3 py-2">{extractedSummary}</p>
              <p className="text-[11px] text-[#8A98A3] mt-1">Kept as extracted. Anything you add below is shown alongside it.</p>
            </div>
          )}
          <label className="block">
            <span className="eyebrow block mb-1">{extractedSummary ? "Attorney description" : "Description / event details"}</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={`${input} resize-y`} />
          </label>
          <div>
            <span className="eyebrow block mb-1">Supporting documents</span>
            {docOptions.length === 0 ? (
              <p className="text-xs text-[#8A98A3]">No documents on this case yet.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-line divide-y divide-line">
                {docOptions.map((name) => (
                  <label key={name} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-wash">
                    <input type="checkbox" checked={form.evidence.includes(name)} onChange={() => toggleDoc(name)} className="accent-[#3FB5D7]" />
                    <FileTypeIcon name={name} className="w-3.5 h-3.5 text-[#5B6B78] shrink-0" />
                    <span className="mono-ref text-ink truncate">{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="block">
            <span className="eyebrow block mb-1">Source / evidence reference</span>
            <select value={form.sourceRef ?? ""} onChange={(e) => setForm({ ...form, sourceRef: e.target.value || undefined })} className={input}>
              <option value="">None</option>
              {docOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl shrink-0">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={submit} className="btn btn-primary">Save Event</button>
        </div>
      </div>
    </div>
  );
}

export function AnalysisPage({ caseData, documents = [], onStageClick, onBackToIntake, onProceedToValuation, onOpenInsurance, onOpenJurisdiction, onOpenDefendants, governingLaw, scrollToSection, detail, onOpenDetail, onBackToAnalysis, onOpenChronology, onDocumentsUpdate }: AnalysisPageProps) {
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
  // With a liability analysis on record, Liability Signals opens that workspace,
  // so the card counts its findings: the defendant elements and plaintiff checks.
  const liabilityRecord = liabilityForCase(caseData?.caseId ?? "PI-2024-001");
  const liabilityDefendants = liabilityRecord ? defendantsForCase(caseData?.caseId ?? "PI-2024-001") : undefined;
  const liabilityCount = liabilityRecord && liabilityDefendants
    ? liabilityDefendants.candidates.reduce((n, c) => n + c.elements.filter((e) => e.kind).length, 0) + liabilityRecord.plaintiff.checks.length + liabilityRecord.sharedFindings.length
    : liabilitySignals.length;
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

  // ── Timeline: the extracted events with the attorney's changes applied ──
  const timeline = useCaseTimeline(data.caseId);
  const events: ShownEvent[] = [
    ...timelineEvents.filter((ev) => !timeline.removed[ev.id]).map((ev, i): ShownEvent => {
      const o = timeline.edits[ev.id];
      const date = o?.date ? fromIso(o.date) : ev.date;
      const fields = o ? (["title", "date", "description", "type", "evidence", "sourceRef"] as const).filter((k) => o[k] !== undefined) : [];
      return {
        id: ev.id, origin: "extracted", date, iso: o?.date ?? toIso(ev.date),
        title: o?.title ?? ev.title, cardTitle: o?.title ?? ev.cardTitle,
        summary: ev.summary, description: o?.description, type: o?.type,
        evidence: o?.evidence ?? ev.evidence, sourceRef: o?.sourceRef,
        liabilityImpact: ev.liabilityImpact, injuryImpact: ev.injuryImpact,
        original: ev, edit: o ? { at: o.at, by: o.by, fields: [...fields] } : undefined, order: i,
      };
    }),
    ...timeline.manual.map((m, i): ShownEvent => ({
      id: m.id, origin: "manual", date: fromIso(m.date), iso: m.date, title: m.title, cardTitle: m.title,
      description: m.description || undefined, type: m.type, evidence: m.evidence, sourceRef: m.sourceRef,
      createdBy: m.createdBy, order: timelineEvents.length + i,
    })),
  ].sort((a, b) => a.iso.localeCompare(b.iso) || a.order - b.order);
  const removedCount = Object.keys(timeline.removed).length;
  const addedCount = timeline.manual.length;
  const docOptionsFor = (current: string[]) => Array.from(new Set([...documents.map((d) => d.name), ...current]));

  const [eventForm, setEventForm] = useState<{ mode: "add" } | { mode: "edit"; ev: ShownEvent } | null>(null);
  const [eventDelete, setEventDelete] = useState<ShownEvent | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const NOT_SAVED = "The change could not be saved in this browser. Nothing was changed.";

  const saveEvent = (fields: EventFields): string | null => {
    if (!eventForm) return null;
    try {
      if (eventForm.mode === "add") {
        addTimelineEvent(data.caseId, fields, REVIEWER);
      } else {
        const ev = eventForm.ev;
        const prev = { title: ev.title, date: ev.iso, description: ev.description ?? "", type: ev.type, evidence: ev.evidence, sourceRef: ev.sourceRef };
        const changed = [
          fields.title !== prev.title && "title", fields.date !== prev.date && "date",
          fields.description !== prev.description && "description", fields.type !== prev.type && "type",
          !sameList(fields.evidence, prev.evidence) && "supporting documents", fields.sourceRef !== prev.sourceRef && "source",
        ].filter(Boolean) as string[];
        if (!changed.length) { setEventForm(null); return null; }
        const shown = { title: fields.title, date: fromIso(fields.date) };
        if (ev.origin === "manual") {
          updateManualEvent(data.caseId, ev.id, fields, changed, REVIEWER);
        } else {
          // Only what differs from the extracted original is stored.
          const orig = ev.original!;
          const overrides: Partial<EventFields> = {};
          if (fields.title !== orig.title) overrides.title = fields.title;
          if (fields.date !== toIso(orig.date)) overrides.date = fields.date;
          if (fields.description) overrides.description = fields.description;
          if (fields.type) overrides.type = fields.type;
          if (!sameList(fields.evidence, orig.evidence)) overrides.evidence = fields.evidence;
          if (fields.sourceRef) overrides.sourceRef = fields.sourceRef;
          editExtractedEvent(data.caseId, ev.id, overrides, shown, changed, REVIEWER);
        }
      }
      setEventForm(null);
      return null;
    } catch {
      return NOT_SAVED;
    }
  };
  /** A plain-text summary of one event, saved as a file. */
  const downloadEventSummary = (ev: ShownEvent) => {
    const lines = [
      `${data.caseName} — case timeline event`,
      "",
      `Title: ${ev.title}`,
      `Date: ${ev.date}`,
      `Event type: ${ev.type ?? "Not set"}`,
      `Origin: ${ev.origin === "manual" ? `Added by ${ev.createdBy ?? "the attorney"}` : ev.edit ? `Extracted; edited by ${ev.edit.by} (${ev.edit.fields.join(", ")})` : "Extracted"}`,
      ...(ev.original && (ev.title !== ev.original.title || ev.date !== ev.original.date) ? [`As extracted: ${ev.original.title} · ${ev.original.date}`] : []),
      "",
      ...(ev.description ? [ev.origin === "manual" ? "Event details:" : "Attorney description:", ev.description, ""] : []),
      ...(ev.summary ? ["Extracted summary:", ev.summary, ""] : []),
      ...(ev.liabilityImpact ? ["Why it matters:", ev.liabilityImpact, ""] : []),
      `Supporting documents (${ev.evidence.length}):`,
      ...(ev.evidence.length ? ev.evidence.map((d) => `  - ${d}`) : ["  None linked"]),
      ...(ev.sourceRef ? ["", `Source / evidence reference: ${ev.sourceRef}`] : []),
      "",
      `Downloaded ${new Date().toLocaleString("en-US")}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Timeline_${ev.iso}_${ev.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const confirmEventDelete = () => {
    if (!eventDelete) return;
    try {
      removeTimelineEvent(data.caseId, eventDelete.id, { title: eventDelete.title, date: eventDelete.date }, REVIEWER);
      setEventDelete(null);
      setDrawerEventIndex(null);
    } catch {
      setEventError(NOT_SAVED);
    }
  };

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
  const timelinePanel = (ev: ShownEvent) => ({
    summary: [
      { label: "Event", value: ev.cardTitle },
      { label: "Date", value: ev.date },
      { label: "Supporting Documents", value: String(ev.evidence.length) },
    ],
  });
  const timelineInsight = (ev: ShownEvent) => ev.origin === "extracted" ? ({
    summary: ev.summary,
    keyPoints: [ev.liabilityImpact, ev.injuryImpact].filter(Boolean) as string[],
    entities: [
      { label: "Event", value: ev.cardTitle },
      { label: "Date", value: ev.date },
    ],
    supportingDocs: ev.evidence,
    confidence: { level: "High", score: 96 },
  }) : ({
    // Added by the attorney: no analysis has run on it, so none is claimed.
    summary: ev.description ?? "Added by the attorney. No AI analysis has been run on this event.",
    keyPoints: [],
    entities: [
      { label: "Event", value: ev.cardTitle },
      { label: "Date", value: ev.date },
      { label: "Added by", value: ev.createdBy ?? "Attorney" },
    ],
    supportingDocs: ev.evidence,
    confidence: { level: "Not analysed", score: 0 },
  });
  // Preview evidence from the timeline drawer — carries the event context so the
  // preview rail shows the card's title + info. `focus` selects the active tab.
  const openTimelineEvidence = (ev: ShownEvent, view: "preview" | "insights" | "chat" = "preview", focus?: string) => {
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
  const goToSignals = (tab: AnalysisDetail) => onOpenDetail?.(tab);

  // ── Evidence Verification: edit and delete a document ──
  const [evEditDoc, setEvEditDoc] = useState<CaseDocument | null>(null);
  const [evDeleteDoc, setEvDeleteDoc] = useState<CaseDocument | null>(null);
  const [evDeleteError, setEvDeleteError] = useState<string | null>(null);
  const saveEvidenceEdit = (doc: CaseDocument, patch: Partial<CaseDocument>, changed: string[]) => {
    onDocumentsUpdate?.((ds) => ds.map((d) => (d.id === doc.id
      ? { ...d, ...patch, history: changed.length ? [...(d.history ?? []), { at: nowLabel(), event: `Details edited: ${changed.join(", ")}` }] : d.history }
      : d)));
    setEvEditDoc(null);
  };
  const confirmEvidenceDelete = async () => {
    const doc = evDeleteDoc;
    if (!doc) return;
    try {
      if (doc.storageKey) await deleteMediaFile(doc.storageKey);
      onDocumentsUpdate?.((ds) => ds.filter((d) => d.id !== doc.id));
      if (doc.intakeUploadId && doc.requestId) releaseIntakeUpload(data.caseId, doc.requestId, doc.intakeUploadId);
      setEvDeleteDoc(null);
    } catch {
      setEvDeleteError("The stored file could not be removed from this browser. The document was not deleted.");
    }
  };

  // The five analysis cards — counts read from the findings themselves.
  const analysisCards: { title: string; category: string; icon: any; description: string; count?: number; meta: string; onOpen?: () => void }[] = [
    { title: "Liability Signals", category: "Liability", icon: Scale, count: liabilityCount, meta: `${liabilityCount} ${liabilityCount === 1 ? "finding" : "findings"}`,
      description: "Key findings identifying potential liability and the evidence supporting each finding.", onOpen: () => onOpenDetail?.("liability") },
    { title: "Injury Signals", category: "Medical", icon: Stethoscope, count: injuryCount, meta: `${injuryCount} ${injuryCount === 1 ? "finding" : "findings"}`,
      description: "Key injury findings, medical evidence, and documented impacts relevant to the case.", onOpen: () => onOpenDetail?.("injury") },
    { title: "Violation Analysis", category: "Analysis", icon: Gavel, count: violationCount, meta: `${violationCount} ${violationCount === 1 ? "violation" : "violations"}`,
      description: "Identified violations, supporting evidence, and their relevance to potential liability.", onOpen: () => onOpenDetail?.("violations") },
    { title: "Insurance Policy Analysis", category: "Insurance", icon: Shield, meta: `Analysed ${INSURANCE_ANALYSIS.analysedOn}`,
      description: "Review policy validity, coverage, limits, red flags, liens, and insurer information.", onOpen: onOpenInsurance },
    { title: "Medical Chronology", category: "Medical", icon: ClipboardList, meta: "Treatment timeline",
      description: "Review the treatment timeline, key medical events, and supporting records from the incident through the present.", onOpen: onOpenChronology },
    { title: "Case Timeline Overview", category: "Timeline", icon: CalendarDays, meta: `${events.length} key ${events.length === 1 ? "event" : "events"}`,
      description: "Key events extracted from the case timeline, with supporting evidence for each event.", onOpen: () => onOpenDetail?.("timeline") },
  ];

  const DETAIL_META: Record<AnalysisDetail, { title: string; category: string; icon: any; count: number; description: string }> = {
    liability: { title: "Liability Signals", category: "Liability", icon: Scale, count: liabilityCount, description: "Key findings identifying potential liability and the evidence supporting each finding." },
    injury: { title: "Injury Signals", category: "Medical", icon: Stethoscope, count: injuryCount, description: "Key injury findings, medical evidence, and documented impacts relevant to the case." },
    violations: { title: "Violation Analysis", category: "Analysis", icon: Gavel, count: violationCount, description: "Identified violations, supporting evidence, and their relevance to potential liability." },
    timeline: { title: "Case Timeline Overview", category: "Timeline", icon: CalendarDays, count: events.length, description: "Key events extracted from the case timeline, with supporting evidence for each event." },
  };
  // One findings set on its own page: the same cards, evidence and Preview /
  // Insights the stage showed in its tabs, every finding at once.
  const renderDetail = (signalTab: AnalysisDetail) => {
    const meta = DETAIL_META[signalTab];
    // Liability Signals: the full liability analysis workspace, when the case has one.
    if (signalTab === "liability" && liabilityRecord) return (
      <LiabilityWorkspace
        caseData={data as any}
        documents={documents}
        events={events.map((ev) => ({ id: ev.id, iso: ev.iso, date: ev.date, title: ev.title, summary: ev.summary, description: ev.description, evidence: ev.evidence, origin: ev.origin }))}
        docSignals={liabilitySignals}
        governingLaw={governingLaw}
        onOpenJurisdiction={onOpenJurisdiction}
        onOpenDefendants={onOpenDefendants}
        onProceedToValuation={onProceedToValuation}
        onOpenDocs={(files, view, context, insight, panel) => openSets([files.map(docForFile)], [context], 0, view, [insight], [panel])}
      />
    );
    // The timeline page: its own panel carries the title, the count and Add Event.
    if (signalTab === "timeline") return (
      <div className="space-y-4">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep">
          <meta.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
          {meta.category}
        </div>
          {/* The case timeline — the same panel the stage showed, on its own page */}
          <div id="case-timeline" className="lg-card p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="min-w-0">
                <h1 className="page-title mb-1" style={{ fontSize: "24px" }}>Case Timeline Overview</h1>
                <p className="secondary-text">
                  {events.length} Key {events.length === 1 ? "Event" : "Events"} from {EXTRACTED_EVENT_COUNT} Extracted Events
                  {addedCount > 0 && ` · ${addedCount} added by attorney`}
                  {removedCount > 0 && (
                    <>
                      {` · ${removedCount} removed `}
                      <button
                        onClick={() => {
                          try { restoreExtractedEvents(data.caseId, Object.fromEntries(timelineEvents.map((e) => [e.id, { title: e.title, date: e.date }])), REVIEWER); }
                          catch { setEventError(NOT_SAVED); }
                        }}
                        className="inline-flex items-center gap-1 text-deep font-medium hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" strokeWidth={2} /> Restore
                      </button>
                    </>
                  )}
                </p>
                {eventError && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{eventError}</p>}
              </div>
              <button
                onClick={() => { setEventError(null); setEventForm({ mode: "add" }); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-deep text-white rounded-lg text-xs font-semibold transition-all shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Event
              </button>
            </div>

            <div className="relative">
              {events.length === 0 && (
                <p className="secondary-text py-6 text-center border border-dashed border-line rounded-lg">No events on the timeline. Add one, or restore removed events.</p>
              )}
              {events.map((ev, i) => {
                const isLast = i === events.length - 1;
                return (
                  <div key={ev.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {/* Marker + connector line */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-3 h-3 rounded-full border-2 bg-white border-soft mt-2.5" />
                      {!isLast && <div className="w-px flex-1 bg-line mt-1" />}
                    </div>

                    {/* Compact event card — date, title, supporting doc count, View Details, then Edit / Delete */}
                    <div className="group flex-1 min-w-0 flex items-center rounded-lg border border-line bg-white mb-1 transition-colors hover:border-soft hover:bg-wash">
                      <button
                        onClick={() => setDrawerEventIndex(i)}
                        className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left pl-4 pr-2 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="mono-ref mb-1 flex items-center gap-2 flex-wrap">
                            {ev.date}
                            {ev.origin === "manual" && <span className="pill pill-neutral text-[10px]">Added by attorney</span>}
                            {ev.edit && <span className="pill pill-neutral text-[10px]">Edited</span>}
                          </div>
                          <div className="text-sm font-semibold text-ink leading-snug mb-1.5">{ev.title}</div>
                          <div className="flex items-center gap-1.5 secondary-text">
                            <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                            {ev.evidence.length} Supporting {ev.evidence.length === 1 ? "Doc" : "Docs"}
                          </div>
                        </div>
                        <span className="hidden sm:flex items-center gap-1 text-sm font-medium text-deep opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                          View Details
                          <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                        </span>
                      </button>
                      <div className="flex items-center pr-2 shrink-0">
                        <RowMenu
                          name={ev.title}
                          onEdit={() => { setEventError(null); setEventForm({ mode: "edit", ev }); }}
                          onDelete={() => { setEventError(null); setEventDelete(ev); }}
                          onDownload={() => downloadEventSummary(ev)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>
    );
    return (
      <div className="space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep mb-3">
            <meta.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {meta.category}
          </div>
          <h1 className="page-title flex items-center gap-2" style={{ fontSize: "24px" }}>
            {meta.title}
            <span className="text-sm font-semibold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2.5 py-0.5 tabular-nums">{meta.count}</span>
          </h1>
          <p className="secondary-text mt-1">{meta.description}</p>
        </div>
        <div className="lg-card bg-offwhite p-6">
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
              const visible = list;
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

                </>
              );
            })()}
                  </div>
      </div>
    );
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
              onClick={detail ? onBackToAnalysis : onBackToIntake}
              className="flex items-center gap-2 secondary-text hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              {detail ? "Back to Analysis" : "Back to Case Intake"}
            </button>
            {detail ? (
              <div className="secondary-text ml-auto flex items-center gap-2 min-w-0">
                <span className="truncate">{data.caseName}</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
                <span className="shrink-0">Analysis</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
                <span className="text-ink font-medium shrink-0">{DETAIL_META[detail].title}</span>
              </div>
            ) : (
              <div className="secondary-text ml-auto">
                Case Intake <span className="mx-2">›</span>
                <span className="text-ink font-medium">{data.caseName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Analysis" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
        {detail ? renderDetail(detail) : (<>

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

        {/* ── Case Intelligence — the timeline now has its own page ── */}
        <div className="grid grid-cols-1 gap-6 items-start">

          {/* Case Intelligence Summary, compact card grid */}
          <div id="case-intelligence" className="lg-card px-6 py-5 flex flex-col scroll-mt-[150px]">
            <div className="flex items-center gap-2.5 mb-4">
              <h2 className="section-header">Case Intelligence Summary</h2>
              <span className="pill pill-complete">92% Complete</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {summaryRows.map(({ icon: Icon, label, value, note, onClick, hint }) => {
                const body = (
                  <>
                    <div className="eyebrow flex items-center gap-1.5 mb-1">
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
                    className="group relative text-left flex flex-col justify-start lg-zone lg-zone-grey px-4 py-3 cursor-pointer transition-all hover:border-soft hover:shadow-sm active:scale-[0.99]"
                  >
                    {body}
                    <ArrowUpRight className="absolute top-3 right-3 w-3.5 h-3.5 text-deep opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
                  </button>
                ) : (
                  <div key={label} className="lg-zone lg-zone-grey px-4 py-3">{body}</div>
                );
              })}

              <div className="lg-zone lg-zone-grey px-4 py-3">
                <div className="eyebrow flex items-center gap-1.5 mb-1">
                  <Users className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Key Witnesses
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">Officer D. Vance</p>
                <p className="text-sm font-semibold text-ink leading-snug">John Peterson</p>
              </div>

              <div className="lg-zone lg-zone-grey px-4 py-3">
                <div className="eyebrow flex items-center gap-1.5 mb-1">
                  <Stethoscope className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Primary Medical Providers
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">Cook County Medical Center</p>
                <p className="text-sm font-semibold text-ink leading-snug">Physical Therapy Associates</p>
              </div>

              <div className="lg-zone lg-zone-grey px-4 py-3">
                <div className="eyebrow flex items-center gap-1.5 mb-1">
                  <Shield className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Verified Evidence
                </div>
                <p className="text-sm font-semibold text-ink leading-snug">{verifiedCount} <span className="font-medium text-[#5B6B78]">Documents</span></p>
              </div>

              <div className="lg-zone lg-zone-grey px-4 py-3">
                <div className="eyebrow flex items-center gap-1.5 mb-1">
                  <CheckCircle className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  Analysis Status
                </div>
                <span className="pill pill-complete">Complete</span>
              </div>
            </div>

            {/* Primary CTA pinned full-width at the bottom */}
            <Button
              onClick={onProceedToValuation}
              className="btn btn-primary gap-2 w-full mt-4"
            >
              Proceed To Valuation
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>

        </div>

        {/* ── Analysis Summary + Signals (20 / 80) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[80fr_20fr] gap-6 items-start">

        {/* LEFT (80%) — Signals + Evidence Verification (the tall, scrolling column) */}
        <div className="space-y-8 min-w-0 lg:order-1">

        {/* ── Analysis findings — five deliverable cards, as in Case Ready ── */}
        <div id="analysis-deliverables" className="lg-card overflow-hidden scroll-mt-[150px]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 className="section-header">Analysis Findings</h2>
            <span className="secondary-text">{analysisCards.length} analyses</span>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {analysisCards.map((item) => (
              <div
                key={item.title}
                role="button"
                tabIndex={0}
                onClick={item.onOpen}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.onOpen?.(); } }}
                className="lg-card lg-card-i p-4 flex flex-col cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep">
                    <item.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {item.category}
                  </div>
                  {item.count !== undefined && (
                    <span className="text-xs font-semibold text-deep bg-white border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums">{item.count}</span>
                  )}
                </div>
                <h3 className="card-title mb-1">{item.title}</h3>
                <p className="secondary-text leading-relaxed flex-1">{item.description}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
                  <span className="mono-ref">{item.meta}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); item.onOpen?.(); }}
                    className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors"
                  >
                    Open <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
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
                <th className="px-6 py-3 text-right eyebrow w-[152px]">Action</th>
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
                    {(() => {
                      // The case's own record for this row — edits and deletion act on it.
                      const record = documents.find((d) => d.id === doc.id);
                      const actions = (
                        <DocActions
                          size="row"
                          onPreview={() => openSets(verifiedDocuments.map((d) => [d]), verifiedDocuments.map((d) => ({ contextType: "Document", reference: d.name })), i, "preview")}
                          onInsights={() => openSets(verifiedDocuments.map((d) => [d]), verifiedDocuments.map((d) => ({ contextType: "Document", reference: d.name })), i, "insights")}
                          onDownload={() => { if (doc.storageKey) void downloadMediaFile(doc.storageKey, doc.name); }}
                          disabled={{ download: doc.storageKey ? undefined : "The original file is not stored in this browser" }}
                        />
                      );
                      return record && onDocumentsUpdate ? (
                        <RowActionGroup name={doc.name} onEdit={() => setEvEditDoc(record)} onDelete={() => { setEvDeleteDoc(record); setEvDeleteError(null); }}>
                          {actions}
                        </RowActionGroup>
                      ) : <div className="flex justify-end">{actions}</div>;
                    })()}
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

        </>)}
      </div>

      {/* ── Timeline Event Detail Drawer ── */}
      {drawerEventIndex !== null && events[drawerEventIndex] && (() => {
        const ev = events[drawerEventIndex];
        const isFirst = drawerEventIndex === 0;
        const isLast = drawerEventIndex === events.length - 1;
        return (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawerEventIndex(null)} />
            <div className="relative bg-white w-full sm:w-[42vw] sm:min-w-[440px] sm:max-w-[760px] h-full flex flex-col shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-line shrink-0">
                <div>
                  <div className="eyebrow mb-1.5">Event {drawerEventIndex + 1} of {events.length}</div>
                  <h2 className="section-header leading-snug">{ev.cardTitle}</h2>
                  <div className="mono-ref mt-1">{ev.date}{ev.type && ` · ${ev.type}`}</div>
                  <div className="text-xs text-[#5B6B78] mt-1.5">
                    {ev.origin === "manual"
                      ? `Added by ${ev.createdBy ?? "the attorney"}`
                      : ev.edit
                        ? `Extracted event · edited by ${ev.edit.by} (${ev.edit.fields.join(", ")})`
                        : "Extracted event"}
                  </div>
                  {ev.original && (ev.title !== ev.original.title || ev.date !== ev.original.date) && (
                    <div className="text-xs text-[#5B6B78] mt-1">As extracted: {ev.original.title} · {ev.original.date}</div>
                  )}
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

                {/* The attorney's description, and where the event is taken from */}
                {(ev.description || ev.sourceRef) && (
                  <div className="pt-5 border-t border-line space-y-2">
                    <div className="eyebrow flex items-center gap-1.5">
                      <User className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      {ev.origin === "manual" ? "Event Details" : "Attorney Description"}
                    </div>
                    {ev.description && <p className="body-text leading-relaxed whitespace-pre-line">{ev.description}</p>}
                    {ev.sourceRef && <p className="text-xs text-[#5B6B78]">Source: <span className="mono-ref text-ink">{ev.sourceRef}</span></p>}
                  </div>
                )}

                {/* AI Summary — extracted events only, as extracted */}
                {ev.summary && (
                  <div className="pt-5 border-t border-line">
                    <div className="eyebrow flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      AI Summary
                    </div>
                    <p className="body-text leading-relaxed">{ev.summary}</p>
                  </div>
                )}

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
                  onClick={() => setDrawerEventIndex((idx) => (idx === null ? null : Math.min(events.length - 1, idx + 1)))}
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

      {evEditDoc && (
        <EditDocumentDialog
          doc={evEditDoc}
          otherNames={documents.filter((d) => d.id !== evEditDoc.id).map((d) => d.name)}
          onSave={(patch, changed) => saveEvidenceEdit(evEditDoc, patch, changed)}
          onClose={() => setEvEditDoc(null)}
        />
      )}
      {evDeleteDoc && (
        <DeleteDocumentDialog doc={evDeleteDoc} error={evDeleteError} onConfirm={() => void confirmEvidenceDelete()} onClose={() => setEvDeleteDoc(null)} />
      )}

      {/* ── Add / edit a timeline event ── */}
      {eventForm && (
        <EventFormModal
          heading={eventForm.mode === "add" ? "Add timeline event" : "Edit timeline event"}
          initial={eventForm.mode === "add"
            ? { title: "", date: "", description: "", evidence: [] }
            : { title: eventForm.ev.title, date: eventForm.ev.iso, description: eventForm.ev.description ?? "", type: eventForm.ev.type, evidence: eventForm.ev.evidence, sourceRef: eventForm.ev.sourceRef }}
          docOptions={docOptionsFor(eventForm.mode === "edit" ? [...eventForm.ev.evidence, ...(eventForm.ev.sourceRef ? [eventForm.ev.sourceRef] : [])] : [])}
          extractedSummary={eventForm.mode === "edit" ? eventForm.ev.summary : undefined}
          onSave={saveEvent}
          onClose={() => setEventForm(null)}
          allowAI={eventForm.mode === "add"}
        />
      )}

      {eventDelete && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4" onClick={() => setEventDelete(null)}>
          <div role="alertdialog" aria-modal="true" aria-label="Delete timeline event" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 space-y-2">
              <h2 className="card-title flex items-center gap-2"><Trash2 className="w-4 h-4 text-[#B91C1C]" strokeWidth={1.75} /> Delete this event?</h2>
              <p className="body-text"><span className="font-semibold text-ink">{eventDelete.title}</span> · <span className="mono-ref">{eventDelete.date}</span></p>
              <p className="text-xs text-[#5B6B78]">
                {eventDelete.origin === "manual"
                  ? "This event will be deleted from the timeline."
                  : "This extracted event will be removed from the timeline. The extracted record is kept, and you can restore it."}
                {eventDelete.evidence.length > 0 && " Its supporting documents stay in the case evidence."}
              </p>
              {eventError && <p role="alert" className="text-sm text-[#B91C1C]">{eventError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
              <button onClick={() => setEventDelete(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={confirmEventDelete} className="btn bg-[#B91C1C] border border-[#B91C1C] text-white hover:bg-[#991B1B]">Delete event</button>
            </div>
          </div>
        </div>
      )}

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
