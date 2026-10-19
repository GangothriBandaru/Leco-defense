import { useState, useRef, useEffect, useLayoutEffect, ReactNode } from "react";
import { FileTypeIcon, FileTypeTag } from "../components/fileType";
import {
  Scale, MapPin, CheckCircle, ShieldCheck, User, Building2, Hash, Calendar, AlertTriangle, X,
  FileText, Activity, Stethoscope, DollarSign, Sparkles,
  ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Search, Eye, Lightbulb, Download,
  Gavel, MessageSquare, SlidersHorizontal,
  HeartPulse, ClipboardList, Image as ImageIcon, Video, FileSignature, Quote,
  Pencil, RotateCcw, History, TrendingUp, TrendingDown, Info, Shield, Circle, Loader2, Bot, Send,
  Plus, UserPlus, Receipt, Trash2, Check,
  ArrowUpRight, ArrowDown, Briefcase, Home, Wallet, Car,
} from "lucide-react";
import type { AnalysisFinding, CaseDocument } from "../types/case";
import { classifyDocuments } from "../types/case";
import { DocumentWorkspaceModal } from "../components/DocumentWorkspace";
import { EvidenceReviewModal } from "./EvidenceReviewModal";
import { AddChronologyDrawer, type CreatedChronology } from "./AddChronologyDrawer";
import {
  useChronologyOptional, PROVENANCE_LABEL,
  type Provenance, type ChronVersion, type ChronAddition, type ChronOverride,
} from "../chronology/ChronologyContext";
import {
  useFactorsOptional, attorneyFactorActor, SEVERITY_RANGE,
  FACTOR_SEED, FACTOR_PROVENANCE_LABEL, FACTOR_ACTION_LABEL,
  type FactorItem, type FactorProvenance, type Severity,
} from "../damages/FactorsContext";
import { FactorReasoning } from "./FactorReasoning";
import {
  usePillarsOptional, attorneyPillarActor, PILLAR_SEED, PILLAR_PROVENANCE_LABEL, PILLAR_ACTION_LABEL,
  type PillarItem, type PillarAudit,
} from "./PillarsContext";
import {
  useViolationsOptional, attorneyViolationActor, VIOLATION_SEED, VIOLATION_SEVERITIES,
  VIOLATION_PROVENANCE_LABEL, VIOLATION_ACTION_LABEL,
  type ViolationItem, type ViolationAudit, type ViolationSeverity,
} from "./ViolationsContext";
import {
  useDamagesOptional, attorneyActor, formatDamageUSD, ECONOMIC_CATEGORIES, ECONOMIC_SUBCATEGORIES, isEconomicCategory,
  DAMAGE_SEED, DAMAGE_PROVENANCE_LABEL, DAMAGE_ACTION_LABEL, DAMAGE_FIELD_LABEL, BUCKET_LABEL,
  type DamageAudit, type DamageBucket, type DamageItem, type DamageProvenance,
  type EconomicCategory, type FieldChange,
} from "../damages/DamagesContext";
import { InjuryIntelligenceSection } from "../components/InjuryIntelligenceSection";
import { PractitionerSnapshotCard } from "../practitioners/MedicalPractitionersPanel";

// ── Shared model & helpers ────────────────────────────────────────────────────

export interface WorkspaceModel {
  caseName: string;
  caseId: string;
  plaintiff: string;
  defendant: string;
  insuranceCarrier: string;
  caseType: string;
  jurisdiction: string;
  incidentDate: string;
  status: string;
  recommendedSettlement: number;
  confidence: number;
  multiplier: number;
  economicTotal: number;
  nonEconomicTotal: number;
  estimatedLow: number;
  estimatedHigh: number;
}

interface TabProps {
  model: WorkspaceModel;
  findings: AnalysisFinding[];
  documents: CaseDocument[];
  goTo: (tab: string) => void;
  goToValuation?: () => void;
  onGenerateDemand?: (strategyLabel: string, amount: number) => void;
  /** Opens the case's Insurance Policy Analysis — the shared insurance pages. */
  onOpenInsurance?: () => void;
  /** Opens the case's Defendant Analysis with this defendant selected. */
  onOpenDefendants?: (defendantName: string) => void;
}

function formatUSD(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString()}`;
}

// Show a value as a ±15% range (compact) instead of an exact figure.
function formatRange(n: number) {
  return `${formatCompact(n * 0.85)} – ${formatCompact(n * 1.15)}`;
}

// Show a multiplier as a ±1 range (e.g. 9 → "8× – 10×").
function multiplierRange(m: number) {
  return `${m - 1}× – ${m + 1}×`;
}

// Stable string hash → non-negative int, so per-document amounts/dates are
// deterministic across renders (no jitter when a drawer re-renders).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

type DocLine = { name: string; amount: number; aiSummary: string; billingPeriod: string };

const BREAKDOWN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Build an itemized, evidence-backed breakdown for an economic damage category.
// Amounts are deterministic and reconcile EXACTLY to the verified category total.
function buildDocBreakdown(item: { value: number; category: string; docCount: number; docs: string[] }): DocLine[] {
  const files = padDocsToCount(item.docs, item.category, item.docCount);
  const weights = files.map((f) => 0.6 + (hashStr(f + item.category) % 1000) / 1000); // 0.6 – 1.6
  const wsum = weights.reduce((a, b) => a + b, 0);
  // Round each share to the nearest $50, then absorb the rounding drift into the
  // last line so the itemized amounts sum exactly to the category total.
  const amounts = weights.map((w) => Math.max(50, Math.round((item.value * w / wsum) / 50) * 50));
  amounts[amounts.length - 1] += item.value - amounts.reduce((a, b) => a + b, 0);

  return files.map((name, i) => {
    const h = hashStr(name + i);
    const m = h % 6;                     // billing window within Jan–Jun 2026
    const startDay = 1 + (h % 18);
    const endDay = Math.min(28, startDay + 4 + ((h >> 4) % 16));
    const summaries = [
      `Itemized ${item.category.toLowerCase()} charges verified against the provider ledger; line items reconcile with no duplicates.`,
      `${item.category} entry cross-checked to the source billing statement and confirmed attributable to this claim.`,
      `Verified ${item.category.toLowerCase()} amount — matches the provider invoice and is supported by treatment records.`,
    ];
    return {
      name,
      amount: amounts[i],
      aiSummary: summaries[h % summaries.length],
      billingPeriod: `${BREAKDOWN_MONTHS[m]} ${startDay} – ${BREAKDOWN_MONTHS[m]} ${endDay}, 2026`,
    };
  });
}

// Pad a list of named documents up to `count` with realistic placeholder names,
// so a category's preview reflects its full supporting-document count.
function padDocsToCount(names: string[], category: string, count: number): string[] {
  const slug = category.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const out = [...names];
  let n = out.length + 1;
  while (out.length < count) {
    out.push(`${slug}_${String(n).padStart(2, "0")}.pdf`);
    n++;
  }
  return out;
}

// Resolve a filename to a workspace-document shape (category/source/date) for the
// shared Document Workspace. Unknown files fall back to a generic attorney doc.
export function buildDocResolver(documents: CaseDocument[]) {
  const categories = classifyDocuments(documents);
  return (file: string) => {
    const d = documents.find((x) => x.name === file);
    const category = d ? categories.find((c) => c.docs.some((f) => f.id === d.id))?.name ?? "General Documents" : "General Documents";
    return d
      ? { ...d, category, source: d.source === "Plaintiff" ? "Plaintiff" : "Attorney Office" }
      : { id: file, name: file, source: "Attorney Office", date: "Jun 8, 2026", status: "Processed", category: "General Documents" };
  };
}

// A reading-first section: Onest heading, optional description, generous spacing.
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="section-header">{title}</h2>
        {description && <p className="secondary-text mt-1 max-w-2xl">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Compact information tile: outline icon, uppercase muted label, bold value.
// `wide` spans the full grid width; `big` enlarges the value for emphasis.
function InfoTile({ icon: Icon, label, value, wide, big, onClick, hint }: {
  icon: any; label: string; value: string; wide?: boolean; big?: boolean;
  /** Makes the tile a link; it looks the same until hovered. */
  onClick?: () => void;
  hint?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
        <span className="eyebrow truncate">{label}</span>
      </div>
      {/* Sits in the corner padding so it never takes room from the label. */}
      {onClick && (
        <ArrowUpRight className="absolute top-1.5 right-1.5 w-3 h-3 text-deep opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" strokeWidth={2} />
      )}
      <div className={`font-semibold text-ink leading-snug break-words ${big ? "text-xl tabular-nums" : "text-sm"}`}>{value}</div>
    </>
  );
  if (!onClick) {
    return <div className={`rounded-xl border border-line bg-offwhite p-3 ${wide ? "col-span-2" : ""}`}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={hint ? `${label}: ${value}. ${hint}` : undefined}
      className={`group relative text-left rounded-xl border border-line bg-offwhite p-3 cursor-pointer transition-all hover:border-soft hover:bg-wash hover:shadow-sm active:scale-[0.99] ${wide ? "col-span-2" : ""}`}
    >
      {body}
    </button>
  );
}

// ── Tab 1 — Case Overview ─────────────────────────────────────────────────────

// A single AI-summary card: icon + title aligned on one row, summary left-aligned below.
function SummaryCard({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-[18px] h-[18px] text-deep shrink-0" strokeWidth={1.75} />
        <h3 className="card-title">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const LIABILITY_POINTS = [
  "Failure to yield at a controlled intersection confirmed by police report.",
  "Commercial driver cited for a traffic violation.",
  "Witness statements corroborate the plaintiff's account.",
  "Crash reconstruction supports the impact sequence.",
  "Skid marks and scene evidence match the vehicle positions.",
];

// Evidence-backed litigation findings — each links to the verified documents
// behind it and opens the shared Document Workspace (Preview / Insights).
const KEY_FINDINGS: { title: string; kind: "strength" | "risk"; description: string; evidence: string[]; aiSummary: string }[] = [
  {
    title: "Liability Favors Plaintiff",
    kind: "strength",
    description: "Officer fault determination and a confirmed red-light violation establish a strong liability position under state negligence standards.",
    evidence: ["police_report_final.pdf", "witness_statement.pdf"],
    aiSummary: "The police report and a corroborating witness statement both place fault on the defendant, leaving little room to dispute liability.",
  },
  {
    title: "Severe Injuries Verified",
    kind: "strength",
    description: "MRI imaging confirms C5–C6 and C6–C7 disc herniations with nerve-root compression — objectively documented, severe cervical injuries.",
    evidence: ["MRI_Report_2026.pdf", "hospital_medical_records.pdf"],
    aiSummary: "Objective MRI imaging documents two-level cervical herniations with nerve compression — hard medical evidence the defense cannot easily contest.",
  },
  {
    title: "Strong Supporting Evidence",
    kind: "strength",
    description: "A continuous, well-documented treatment record corroborates causation and ties the injuries directly to the collision.",
    evidence: ["physical_therapy_notes.pdf", "ER_Bills.pdf"],
    aiSummary: "An unbroken treatment trail from the ER through physical therapy ties the injuries directly to the collision and reinforces causation.",
  },
  {
    title: "High Settlement Potential",
    kind: "strength",
    description: "Clear liability, severe verified injuries, and confirmed commercial coverage support a strong demand at the recommended multiplier.",
    evidence: ["insurance_policy_v2.pdf", "wage_loss_statement.pdf"],
    aiSummary: "Clear liability plus verified injuries and confirmed commercial coverage support a strong demand with adequate funds to recover against.",
  },
  {
    title: "Pre-Existing Condition Risk",
    kind: "risk",
    description: "The defense may attribute part of the cervical findings to prior degeneration; causation records should be marshaled to rebut this.",
    evidence: ["hospital_medical_records.pdf", "MRI_Report_2026.pdf"],
    aiSummary: "The defense may argue prior degeneration explains part of the cervical findings; line up causation records and a treating-physician opinion to rebut it.",
  },
  {
    title: "Treatment Gap Exposure",
    kind: "risk",
    description: "A brief gap in the physical therapy record could be used to question injury severity and continuity of care.",
    evidence: ["physical_therapy_notes.pdf"],
    aiSummary: "A short gap in the therapy record could be used to question injury severity; document the reason for the gap to neutralize the argument.",
  },
];

export function OverviewTab({ model, documents, goTo, onOpenInsurance, onOpenDefendants }: TabProps) {
  const [bioOpen, setBioOpen] = useState(false);

  // Shared Document Workspace state (reused from the Analysis stage). Each finding
  // contributes a set of supporting documents; Prev/Next pages between findings.
  const [wsOpen, setWsOpen] = useState(false);
  const [wsView, setWsView] = useState<"preview" | "insights">("preview");
  const [wsIndex, setWsIndex] = useState(0);
  const [findingTab, setFindingTab] = useState<"strengths" | "risks">("strengths");

  const docForFile = buildDocResolver(documents);

  // Split findings into Strengths (pros) and Risks (cons).
  const strengthCount = KEY_FINDINGS.filter((f) => f.kind === "strength").length;
  const riskCount = KEY_FINDINGS.filter((f) => f.kind === "risk").length;
  const visibleFindings = KEY_FINDINGS.filter((f) => (findingTab === "strengths" ? f.kind === "strength" : f.kind === "risk"));
  const findingDocSets = visibleFindings.map((f) => f.evidence.map(docForFile));
  const findingContexts = visibleFindings.map((f) => ({ contextType: "Finding", reference: f.title }));
  // AI Insights per finding — its aiSummary is the headline; the same text is
  // surfaced inline when the card's Evidence dropdown is expanded.
  const findingInsights = visibleFindings.map((f) => ({
    summary: f.aiSummary,
    keyPoints: [f.description],
    entities: [{ label: "Finding", value: f.title }, { label: "Type", value: f.kind === "strength" ? "Strength" : "Risk" }],
    supportingDocs: f.evidence,
    confidence: { level: f.kind === "strength" ? "High" : "Medium", score: f.kind === "strength" ? 92 : 74 },
  }));
  const openFinding = (i: number, view: "preview" | "insights") => { setWsIndex(i); setWsView(view); setWsOpen(true); };

  // Which finding cards have their Evidence dropdown expanded (by index within the visible tab).
  const [findingEvidenceOpen, setFindingEvidenceOpen] = useState<Set<number>>(new Set());
  const toggleFindingEvidence = (i: number) =>
    setFindingEvidenceOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const plaintiffBio =
    `${model.plaintiff} is a 47-year-old resident of ${model.jurisdiction} and a full-time logistics coordinator. ` +
    `A parent of two with no prior history of cervical injury, she was in good health and actively employed at the time of the incident. ` +
    `Since the collision she has undergone a continuous course of treatment for cervical disc herniations, with documented impact on her ` +
    `ability to work and to carry out everyday activities.`;

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-20 gap-8 items-start">
      {/* LEFT — 30% */}
      <div className="lg:col-span-6 space-y-6 lg:sticky lg:top-[176px] self-start">
        {/* Case Snapshot */}
        <div className="lg-card p-6">
          <h3 className="card-title mb-4">Case Snapshot</h3>
          {/* Two-column grid of compact info tiles. Rows fill left→right:
              Plaintiff/Defendant · Carrier/Jurisdiction · Case ID/Case Type · Date/Status */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Plaintiff — expandable to reveal biography */}
            <div className="col-span-2 rounded-xl border border-line bg-offwhite p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                  <span className="eyebrow truncate">Plaintiff</span>
                </div>
                <button
                  onClick={() => setBioOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors shrink-0"
                >
                  {bioOpen ? "Hide biography" : "Check biography"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${bioOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
              </div>
              <div className="text-sm font-semibold text-ink leading-snug break-words">{model.plaintiff}</div>
              {bioOpen && (
                <p className="secondary-text leading-relaxed mt-2.5 pt-2.5 border-t border-line">{plaintiffBio}</p>
              )}
            </div>
            <InfoTile
              icon={Building2}
              label="Defendant"
              value={model.defendant}
              onClick={onOpenDefendants ? () => onOpenDefendants(model.defendant) : undefined}
              hint="Open Defendant Analysis"
            />
            <InfoTile
              icon={ShieldCheck}
              label="Insurance Carrier"
              value={model.insuranceCarrier}
              onClick={onOpenInsurance}
              hint="Open Insurance Policy Analysis"
            />
            <InfoTile icon={MapPin} label="Jurisdiction" value={model.jurisdiction} />
            <InfoTile icon={Hash} label="Case ID" value={model.caseId} />
            <InfoTile icon={Scale} label="Case Type" value={model.caseType} />
            <InfoTile icon={Calendar} label="Incident Date" value={model.incidentDate} />
            <InfoTile icon={DollarSign} label="Recommended Settlement" value={formatRange(model.recommendedSettlement)} wide big />
          </div>

          {/* View Chronology — jumps to the Medical Timeline */}
          <button onClick={() => goTo("medical")} className="btn btn-primary w-full gap-2 mt-4">
            <ClipboardList className="w-4 h-4" strokeWidth={1.75} /> View Chronology
          </button>
        </div>
      </div>

      {/* RIGHT — 70% */}
      <div className="lg:col-span-14 space-y-6">
        {/* AI Case Summary — structured, attorney-friendly breakdown */}
        <div className="rounded-2xl border border-line bg-offwhite p-8 shadow-sm">
          {/* Header */}
          <h2 className="section-header mb-4" style={{ fontSize: "22px" }}>AI Case Summary</h2>

          {/* Summary cards */}
          <div className="space-y-5">
            <SummaryCard icon={Calendar} title="Event Summary">
              <p className="body-text leading-relaxed">
                {model.plaintiff} was involved in a {model.caseType.toLowerCase()} on {model.incidentDate} in {model.jurisdiction} after a
                commercial vehicle operated by {model.defendant} failed to yield at a controlled intersection. The collision resulted in
                significant injuries and initiated the current personal injury claim.
              </p>
            </SummaryCard>

            <SummaryCard icon={HeartPulse} title="Injury Summary">
              <p className="body-text leading-relaxed">
                MRI confirms C5–C6 and C6–C7 disc herniations with nerve-root compression — a severe, objectively verified cervical
                injury. The plaintiff sought emergency care within 24 hours and remains in active treatment, with a guarded prognosis
                and permanent residual impairment expected to affect daily function long-term.
              </p>
            </SummaryCard>

            <SummaryCard icon={Scale} title="Facts & Liability">
              <p className="body-text leading-relaxed mb-4">
                Liability strongly favors the plaintiff based on verified evidence and documented negligence.
              </p>
              <div className="space-y-2.5">
                {LIABILITY_POINTS.map((p) => (
                  <div key={p} className="flex items-start gap-2.5 rounded-lg border border-line bg-offwhite px-3.5 py-2.5">
                    <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                    <span className="text-sm text-ink leading-relaxed">{p}</span>
                  </div>
                ))}
              </div>
            </SummaryCard>

            <SummaryCard icon={Stethoscope} title="Treatment Summary">
              <p className="body-text leading-relaxed">
                Emergency department admission and cervical imaging on the date of incident, followed by a neurology consultation and a
                12-week multi-modal physical therapy program. No surgical intervention to date; care remains ongoing with documented
                range-of-motion deficits and continued pain management.
              </p>
            </SummaryCard>

            <SummaryCard icon={DollarSign} title="Estimated Settlement">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-line bg-offwhite p-3">
                  <div className="eyebrow mb-1">Recommended Settlement</div>
                  <div className="text-xl font-bold text-ink tabular-nums">{formatRange(model.recommendedSettlement)}</div>
                </div>
                <div className="rounded-lg border border-line bg-offwhite p-3">
                  <div className="eyebrow mb-1">Recommended Multiplier</div>
                  <div className="text-xl font-bold text-deep tabular-nums">{model.multiplier}×</div>
                </div>
                <div className="rounded-lg border border-line bg-offwhite p-3">
                  <div className="eyebrow mb-1">Confidence</div>
                  <div className="text-xl font-bold text-deep tabular-nums">{model.confidence}%</div>
                </div>
              </div>
              <p className="body-text leading-relaxed">
                “Recommendation based on verified economic damages, severe injuries, strong liability, and supporting evidence.”
              </p>
            </SummaryCard>
          </div>
        </div>

        {/* Litigation Key Findings — evidence-backed & actionable, split into pros / cons */}
        <div className="lg-card p-6">
          <h3 className="card-title mb-4">Litigation Key Findings</h3>

          {/* Strengths / Risks tabs */}
          <div className="flex items-center gap-2 mb-5">
            {([
              { key: "strengths", label: "Strengths", count: strengthCount },
              { key: "risks", label: "Risks", count: riskCount },
            ] as const).map((tab) => {
              const active = findingTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFindingTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          {visibleFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle className="w-8 h-8 text-green-700 mb-3" strokeWidth={1.75} />
              <p className="text-sm font-medium text-ink">No risks identified</p>
              <p className="secondary-text mt-1">No material weaknesses were flagged for this case.</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleFindings.map((f, i) => (
              <div key={f.title} className="rounded-xl border border-line bg-white p-5 flex flex-col">
                {/* Status icon + title */}
                <div className="flex items-start gap-2.5 mb-2">
                  {f.kind === "strength"
                    ? <CheckCircle className="w-5 h-5 text-green-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                    : <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" strokeWidth={1.75} />}
                  <h4 className="card-title leading-snug">{f.title}</h4>
                </div>

                {/* Description */}
                <p className="body-text leading-relaxed">{f.description}</p>

                {/* Evidence — expandable to reveal an AI summary */}
                <div className="mt-4 pt-4 border-t border-line">
                  <button
                    onClick={() => toggleFindingEvidence(i)}
                    className="w-full flex items-center justify-between gap-2 group"
                  >
                    <span className="eyebrow group-hover:text-ink transition-colors">Evidence</span>
                    <ChevronDown className={`w-4 h-4 text-deep transition-transform ${findingEvidenceOpen.has(i) ? "rotate-180" : ""}`} strokeWidth={1.75} />
                  </button>
                  <div className="flex items-center gap-1.5 secondary-text mt-1.5">
                    <FileText className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                    {f.evidence.length} Supporting {f.evidence.length === 1 ? "Document" : "Documents"}
                  </div>
                  {findingEvidenceOpen.has(i) && (
                    <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                        <span className="eyebrow text-deep">AI Summary</span>
                      </div>
                      <p className="secondary-text leading-relaxed">{f.aiSummary}</p>
                    </div>
                  )}
                </div>

                {/* Actions — reuse the Analysis Preview / Insights workspace */}
                <div className="mt-auto pt-4 flex items-center gap-2">
                  <button
                    onClick={() => openFinding(i, "preview")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
                  </button>
                  <button
                    onClick={() => openFinding(i, "insights")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                  >
                    <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

      </div>
    </div>

    {/* Shared Document Workspace — Preview / Insights for the selected finding */}
    <DocumentWorkspaceModal
      docs={wsOpen ? (findingDocSets[wsIndex] ?? []) : null}
      noteContext={findingContexts[wsIndex]}
      insights={findingInsights[wsIndex]}
      initialView={wsView}
      position={wsIndex + 1}
      total={findingDocSets.length}
      onPrev={() => setWsIndex((i) => Math.max(0, i - 1))}
      onNext={() => setWsIndex((i) => Math.min(findingDocSets.length - 1, i + 1))}
      onClose={() => setWsOpen(false)}
      onDownload={() => {}}
    />
    </>
  );
}

// ── Tab 2 — Chronology ────────────────────────────────────────────────────────

// Structured classification behind a chronology card's contextual tags.
// `tags` is what the card renders: primary category first, then specificity.
export interface ChronTaxonomy {
  eventType: "medical" | "case";
  category: string;
  subcategory?: string;
  tags: string[];
}

export interface ChronEvent {
  id?: string;
  date: string;
  time?: string;
  title: string;
  description: string;
  insight: string;
  evidence: string[];
  actions?: { text: string; time?: string; description?: string; evidence?: string[] }[]; // key actions (Event Chronology milestones)
  // ── Origin of the entry. Absent = system-generated from verified evidence.
  // "user" = created by hand in the Add Chronology drawer. The origin never
  // changes, even after AI tools are run on the event.
  source?: "system" | "user";
  // Provenance beyond system/user: set when the assistant created or changed
  // the entry, or when the attorney edited one. Never overwritten.
  provenance?: Provenance;
  history?: ChronVersion[];
  evidencePage?: string;
  category?: string;                              // set on user-added events; drives the event-type filter
  // Structured tag metadata. The contextual tags on a card are read from here,
  // never inferred from the title at render time.
  taxonomy?: ChronTaxonomy;
  addedBy?: string;
  addedAt?: string;
  details?: { label: string; value: string }[];   // provider / injury / severity / notes, shown on open
}

const MEDICAL_CHRONOLOGY: ChronEvent[] = [
  {
    date: "Feb 14, 2026", time: "9:42 AM", title: "Initial Emergency Admission",
    taxonomy: { eventType: "medical", category: "Emergency Care", subcategory: "Initial Assessment", tags: ["Emergency Care","Initial Assessment"] },
    description: "The plaintiff arrived by ambulance at Cook County Medical Center with acute neck pain and neurological symptoms. Trauma assessment and cervical immobilization were performed on arrival.",
    insight: "This event establishes the beginning of documented treatment within hours of the collision and supports causation.",
    evidence: ["ER_Bills.pdf", "hospital_medical_records.pdf"],
  },
  {
    date: "Feb 16, 2026", title: "MRI Completed",
    taxonomy: { eventType: "medical", category: "Diagnostic Imaging", subcategory: "MRI", tags: ["Diagnostic Imaging","MRI"] },
    description: "Diagnostic MRI of the cervical spine was performed, confirming C5–C6 and C6–C7 disc herniations with nerve-root compression.",
    insight: "Objective imaging links the collision to a confirmed, diagnosable injury — a cornerstone of the damages case.",
    evidence: ["MRI_Report_2026.pdf"],
  },
  {
    date: "Feb 23, 2026", title: "Neurology Consultation",
    taxonomy: { eventType: "medical", category: "Specialist Consultation", subcategory: "Neurology", tags: ["Specialist Consultation","Neurology"] },
    description: "A neurology specialist evaluated the plaintiff, confirmed traumatic causation, and recommended a course of conservative management with physical therapy.",
    insight: "Specialist confirmation of traumatic causation strengthens the link between the incident and the injury.",
    evidence: ["hospital_medical_records.pdf"],
  },
  {
    date: "Mar 2, 2026", title: "Physical Therapy Started",
    taxonomy: { eventType: "medical", category: "Rehabilitation", subcategory: "Physical Therapy", tags: ["Rehabilitation","Physical Therapy"] },
    description: "The plaintiff began a structured, multi-modal physical therapy program targeting cervical mobility and pain management.",
    insight: "Prompt, continuous treatment demonstrates the seriousness of the injury and supports ongoing-care damages.",
    evidence: ["physical_therapy_notes.pdf"],
  },
  {
    date: "Apr 20, 2026", title: "Mid-Treatment Re-Evaluation",
    taxonomy: { eventType: "medical", category: "Follow-Up", subcategory: "Treatment Progress", tags: ["Follow-Up","Treatment Progress"] },
    description: "A re-evaluation documented persistent range-of-motion deficits and chronic pain despite ongoing therapy.",
    insight: "Documented lack of full recovery supports the severity and permanence of the injury.",
    evidence: ["physical_therapy_notes.pdf"],
  },
  {
    date: "Jun 5, 2026", title: "Follow-Up Evaluation",
    taxonomy: { eventType: "medical", category: "Follow-Up Care", subcategory: "Prognosis", tags: ["Follow-Up Care","Prognosis"] },
    description: "A follow-up assessment recorded a guarded prognosis with permanent residual impairment anticipated, and recommended continued care.",
    insight: "A guarded prognosis substantiates future-care and non-economic damages.",
    evidence: ["hospital_medical_records.pdf"],
  },
];

// Event Chronology — each entry is a major case milestone grouping several
// underlying actions (the timeline shows only the most important ones).
const EVENT_CHRONOLOGY: ChronEvent[] = [
  {
    date: "Feb 14, 2026", time: "9:05 AM", title: "Collision Occurred",
    taxonomy: { eventType: "case", category: "Accident", subcategory: "Liability", tags: ["Accident","Liability"] },
    description: "A commercial vehicle operated by Midwest Logistics Co. failed to yield at a controlled intersection and struck the plaintiff's vehicle.",
    insight: "This is the originating event of the claim and the basis for the negligence theory against the defendant.",
    actions: [
      { text: "Commercial vehicle entered the intersection", time: "9:04 AM", description: "Officer reconstruction confirms the truck entered the intersection against a red signal.", evidence: ["Police Report", "Traffic Camera"] },
      { text: "Impact with plaintiff's vehicle", time: "9:05 AM", description: "Front-end collision caused significant cervical trauma.", evidence: ["Police Report", "Vehicle Photos"] },
      { text: "Emergency services notified", time: "9:07 AM", description: "Witnesses contacted 911 immediately after the collision.", evidence: ["Dispatch Log"] },
    ],
    evidence: ["police_report_final.pdf"],
  },
  {
    date: "Feb 14, 2026", title: "Initial Emergency Response",
    taxonomy: { eventType: "case", category: "Emergency Response", subcategory: "Accident Response", tags: ["Emergency Response","Accident Response"] },
    description: "Emergency services responded to the scene and transported the plaintiff to Cook County Medical Center for assessment.",
    insight: "Establishes an immediate, contemporaneous record of the incident and the plaintiff's injuries.",
    actions: [
      { text: "Ambulance dispatched", time: "9:11 AM", description: "EMS was dispatched to the scene within minutes of the 911 call.", evidence: ["Dispatch Log"] },
      { text: "Scene documented by first responders", time: "9:20 AM", description: "Responders photographed the scene and recorded initial observations.", evidence: ["Scene Photos"] },
      { text: "Plaintiff transported to Cook County Medical Center", time: "9:42 AM", description: "Plaintiff transported by ambulance for emergency assessment.", evidence: ["EMS Report"] },
      { text: "Vitals and injuries recorded on arrival", time: "9:55 AM", description: "Acute neck pain and neurological symptoms documented at intake.", evidence: ["ER Record"] },
    ],
    evidence: ["emergency_dispatch_record.pdf", "hospital_medical_records.pdf"],
  },
  {
    date: "Feb 14 – 15, 2026", title: "Police Investigation",
    taxonomy: { eventType: "case", category: "Police Investigation", subcategory: "Liability Evidence", tags: ["Police Investigation","Liability Evidence"] },
    description: "Responding officers investigated the scene, determined fault, and collected initial witness accounts.",
    insight: "The officer's fault determination and witness corroboration are strong, objective evidence of liability.",
    actions: [
      { text: "Officers arrived and secured the scene", time: "Feb 14 · 9:28 AM", description: "Responding officers established the scene and managed traffic.", evidence: ["Police Report"] },
      { text: "Skid marks and debris field documented", time: "Feb 14 · 9:45 AM", description: "Physical evidence consistent with the plaintiff's account of the collision.", evidence: ["Scene Photos"] },
      { text: "Initial witness statements collected", time: "Feb 14 · 10:10 AM", description: "An independent witness corroborated the signal violation.", evidence: ["Witness Statement"] },
      { text: "Commercial driver cited for failure to yield", time: "Feb 14 · 11:30 AM", description: "The officer attributed primary fault to the commercial driver.", evidence: ["Citation"] },
      { text: "Police report filed", time: "Feb 15", description: "The final report was completed and filed with the fault determination.", evidence: ["Police Report"] },
    ],
    evidence: ["police_report_final.pdf", "witness_statement.pdf"],
  },
  {
    date: "Feb 20, 2026", title: "Insurance Claim Filed",
    taxonomy: { eventType: "case", category: "Insurance", subcategory: "Claim", tags: ["Insurance","Claim"] },
    description: "A claim was filed against the defendant's commercial liability policy and acknowledged by the carrier.",
    insight: "Confirmed coverage ensures an adequate source of recovery for the projected demand.",
    actions: [
      { text: "Claim filed against the carrier", time: "Feb 20", description: "A liability claim was submitted to the defendant's commercial carrier.", evidence: ["Claim Form"] },
      { text: "Commercial coverage confirmed active", time: "Feb 24", description: "The policy was verified active on the date of loss.", evidence: ["Insurance Policy"] },
      { text: "Carrier acknowledged the claim", time: "Mar 6", description: "The carrier opened its investigation and requested documentation.", evidence: ["Correspondence"] },
    ],
    evidence: ["insurance_policy_v2.pdf"],
  },
  {
    date: "Mar – May, 2026", title: "Case Preparation",
    taxonomy: { eventType: "case", category: "Case Preparation", subcategory: "Evidence Collection", tags: ["Case Preparation","Evidence Collection"] },
    description: "Medical records and supporting documentation were assembled to substantiate liability and damages.",
    insight: "A complete, verified record base underpins both causation and the damages calculation.",
    actions: [
      { text: "Medical records requested and assembled", time: "Mar 24", description: "Complete treatment records were gathered to substantiate the injuries.", evidence: ["Medical Records"] },
      { text: "Wage-loss documentation obtained", time: "Apr 10", description: "Employer verification of lost income was collected.", evidence: ["Wage Loss Statement"] },
      { text: "Evidence index compiled", time: "May 2", description: "All exhibits were organized and indexed for the demand.", evidence: ["Evidence Index"] },
      { text: "Damages computed", time: "May 28", description: "Economic and non-economic damages were calculated.", evidence: ["Damages Summary"] },
    ],
    evidence: ["hospital_medical_records.pdf", "wage_loss_statement.pdf"],
  },
  {
    date: "Jun 9 – 11, 2026", title: "Settlement Negotiation",
    taxonomy: { eventType: "case", category: "Settlement", subcategory: "Negotiation", tags: ["Settlement","Negotiation"] },
    description: "An attorney-ready demand package was delivered to the carrier and the matter advanced to negotiation.",
    insight: "Anchors the negotiation above the projected settlement range with documented support.",
    actions: [
      { text: "Demand letter delivered", time: "Jun 9", description: "An attorney-ready demand package was delivered to the carrier.", evidence: ["Demand Letter"] },
      { text: "Recommended settlement value asserted", time: "Jun 9", description: "The recommended value was asserted with supporting documentation.", evidence: ["Damages Summary"] },
      { text: "Negotiation opened with the carrier", time: "Jun 11", description: "Negotiations commenced toward a resolution.", evidence: ["Correspondence"] },
    ],
    evidence: ["demand_letter_draft.pdf"],
  },
];

// The signed-in attorney — stamped on manually created chronology entries.
export const CURRENT_USER = "Jennifer Davis";

// Titles already on the seeded timelines, so the assistant only ever proposes
// events the chronology does not already carry.
export const CHRONOLOGY_TITLES = {
  medical: MEDICAL_CHRONOLOGY.map((e) => e.title),
  event: EVENT_CHRONOLOGY.map((e) => e.title),
};

// ── Chronology toolbar helpers ────────────────────────────────────────────────

// Event categories, keyed by title, drive the tab-aware filter dropdown.
const MEDICAL_CATEGORIES: Record<string, string> = {
  "Initial Emergency Admission": "Emergency",
  "MRI Completed": "Diagnostic",
  "Neurology Consultation": "Consultation",
  "Physical Therapy Started": "Therapy",
  "Mid-Treatment Re-Evaluation": "Evaluation",
  "Follow-Up Evaluation": "Evaluation",
};
const EVENT_CATEGORIES: Record<string, string> = {
  "Collision Occurred": "Incident",
  "Initial Emergency Response": "Medical Response",
  "Police Investigation": "Investigation",
  "Insurance Claim Filed": "Insurance",
  "Case Preparation": "Preparation",
  "Settlement Negotiation": "Negotiation",
};
const MEDICAL_FILTERS = ["Emergency", "Diagnostic", "Consultation", "Therapy", "Evaluation"];
const EVENT_FILTERS = ["Incident", "Medical Response", "Investigation", "Insurance", "Preparation", "Negotiation"];

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Parse the starting month/day/year from a chronology date label. Handles single
// dates ("Feb 14, 2026") and ranges ("Feb 14 – 15, 2026", "Mar – May, 2026").
function parseChronStart(date: string): { month: number; day: number; year: number } | null {
  const mon = date.match(/([A-Z][a-z]{2,})/);
  const yr = date.match(/(\d{4})/);
  const dayMatch = date.match(/[A-Z][a-z]{2,}\s+(\d{1,2})/);
  if (!mon || !yr) return null;
  const month = MONTHS_ABBR.indexOf(mon[1].slice(0, 3));
  if (month < 0) return null;
  return { month, day: dayMatch ? parseInt(dayMatch[1], 10) : 1, year: parseInt(yr[1], 10) };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmtShort = (d: Date) => `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`;

// "9:42 AM" → minutes past midnight; null when the event carries no time.
function parseChronTime(time?: string): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10) % 12;
  return (m[3].toUpperCase() === "PM" ? h + 12 : h) * 60 + parseInt(m[2], 10);
}

// Merge manually added events into the generated timeline and keep the whole
// list in date order — a new Feb 20 event lands between Feb 16 and Feb 23, not
// at the bottom. Same-day entries keep their existing relative order unless
// both carry a time, so the generated sequence is never reshuffled.
function mergeChronologically(base: ChronEvent[], added: ChronEvent[]): ChronEvent[] {
  return [...base, ...added]
    .map((ev, i) => {
      const p = parseChronStart(ev.date);
      return { ev, i, day: p ? new Date(p.year, p.month, p.day).getTime() : 0, min: parseChronTime(ev.time) };
    })
    .sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      if (a.min !== null && b.min !== null && a.min !== b.min) return a.min - b.min;
      return a.i - b.i;
    })
    .map((x) => x.ev);
}

// Store additions render as ordinary chronology cards; only the badge differs.
function additionToEvent(a: ChronAddition): ChronEvent {
  return {
    id: a.id, date: a.date, time: a.time, title: a.title, description: a.description,
    insight: a.insight, evidence: a.evidence, evidencePage: a.evidencePage,
    source: a.provenance === "user" ? "user" : "system",
    provenance: a.provenance, history: a.history,
    category: a.category, taxonomy: a.taxonomy, details: a.details,
    addedBy: a.addedBy, addedAt: a.addedAt,
  };
}

// An override edits a seeded event in place and records the change on it. The
// previous wording lives on in `history`, never overwritten.
function applyOverrides(events: ChronEvent[], overrides: Record<string, ChronOverride>): ChronEvent[] {
  return events.map((ev) => {
    const o = overrides[ev.title];
    if (!o) return ev;
    return { ...ev, ...o.patch, provenance: o.provenance, history: o.history };
  });
}

// A manually created entry, as the drawer hands it back.
function toChronEvent(c: CreatedChronology): ChronEvent {
  return {
    id: `user-${c.addedAt}-${c.title}`,
    date: c.date,
    time: c.time,
    title: c.title,
    description: c.description,
    insight:
      "Attorney-recorded event. It is part of the chronology and is supported by the documentation attached to it.",
    evidence: c.evidence,
    actions: c.actions && c.actions.length > 0 ? c.actions : undefined,
    source: "user",
    category: c.category,
    taxonomy: c.taxonomy.tags.length > 0 ? c.taxonomy : undefined,
    addedBy: c.addedBy,
    addedAt: c.addedAt,
    details: c.details,
  };
}

// Date-picker popup for the Chronology toolbar — pick a single date or a custom
// range. Selection filters the chronology; nothing selected = show everything.
function ChronologyDatePicker({
  mode, setMode, selDate, rangeFrom, rangeTo, onPick, onClear, onDone, setRangeFrom, setRangeTo,
}: {
  mode: "single" | "range";
  setMode: (m: "single" | "range") => void;
  selDate: Date | null;
  rangeFrom: Date | null;
  rangeTo: Date | null;
  onPick: (d: Date) => void;
  onClear: () => void;
  onDone: () => void;
  setRangeFrom: (d: Date | null) => void;
  setRangeTo: (d: Date | null) => void;
}) {
  // <input type="date"> uses yyyy-mm-dd; convert to/from local Date.
  const toInput = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  const fromInput = (v: string) => {
    if (!v) return null;
    const [y, m, dd] = v.split("-").map(Number);
    return new Date(y, m - 1, dd);
  };
  // The visible month defaults to the first selection, else the chronology start (Feb 2026).
  const initial = selDate ?? rangeFrom ?? new Date(2026, 1, 1);
  const [cal, setCal] = useState<{ year: number; month: number }>({ year: initial.getFullYear(), month: initial.getMonth() });
  const shift = (delta: number) =>
    setCal((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const firstWeekday = new Date(cal.year, cal.month, 1).getDay();
  const daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, k) => k + 1),
  ];

  const rangeEnd = rangeTo ?? rangeFrom;
  const isSelected = (d: Date) =>
    mode === "single" ? !!selDate && sameDay(d, selDate) : (!!rangeFrom && sameDay(d, rangeFrom)) || (!!rangeEnd && sameDay(d, rangeEnd));
  const inRangeMiddle = (d: Date) =>
    mode === "range" && !!rangeFrom && !!rangeTo && d.getTime() > rangeFrom.getTime() && d.getTime() < rangeTo.getTime();

  const summary =
    mode === "single"
      ? (selDate ? fmtShort(selDate) : "No date selected")
      : rangeFrom
      ? `${fmtShort(rangeFrom)}${rangeTo ? ` – ${fmtShort(rangeTo)}` : " – …"}`
      : "No range selected";

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onDone} />
      <div className="absolute left-0 mt-1.5 z-20 w-[300px] rounded-xl border border-line bg-white shadow-lg p-3">
        {/* Mode toggle — Date | Range */}
        <div className="flex items-center rounded-lg border border-line bg-white p-0.5 mb-3">
          {([{ key: "single", label: "Date" }, { key: "range", label: "Custom Range" }] as const).map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m.key ? "bg-tint text-deep" : "text-[#5B6B78] hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Custom range — type or pick the From / To dates directly */}
        {mode === "range" && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="eyebrow mb-1 block">From</label>
              <input
                type="date"
                value={toInput(rangeFrom)}
                onChange={(e) => setRangeFrom(fromInput(e.target.value))}
                className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block">To</label>
              <input
                type="date"
                value={toInput(rangeTo)}
                min={toInput(rangeFrom)}
                onChange={(e) => setRangeTo(fromInput(e.target.value))}
                className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shift(-1)} aria-label="Previous month" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5B6B78] hover:bg-wash hover:text-ink transition-colors">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <span className="card-title">{MONTHS_FULL[cal.month]} {cal.year}</span>
          <button onClick={() => shift(1)} aria-label="Next month" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5B6B78] hover:bg-wash hover:text-ink transition-colors">
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, k) => (
            <div key={k} className="text-center eyebrow py-1">{d}</div>
          ))}
          {cells.map((day, k) => {
            if (day === null) return <div key={k} />;
            const date = new Date(cal.year, cal.month, day);
            const selected = isSelected(date);
            const middle = inRangeMiddle(date);
            return (
              <button
                key={k}
                onClick={() => onPick(date)}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                  selected
                    ? "bg-brand text-white"
                    : middle
                    ? "bg-tint text-deep"
                    : "text-ink hover:bg-wash"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Selection summary + actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
          <span className="secondary-text">{summary}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="text-sm font-medium text-[#5B6B78] hover:text-ink transition-colors">Clear</button>
            <button onClick={onDone} className="btn btn-primary px-3 py-1.5 text-sm">Done</button>
          </div>
        </div>
      </div>
    </>
  );
}

type PanelMode = "severity" | "forensic" | "expert";

// Close (X) button shown on the revealed panel.
function PanelClose({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <button onClick={onClose} title="Close" className="p-1 -mr-1 rounded-md hover:bg-white/70 transition-colors shrink-0">
      <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
    </button>
  );
}

// 1 — Assess Severity (brand light theme)
function SeverityPanel({ onClose }: { onClose?: () => void }) {
  return (
    <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="card-title">Priority Assessment</h4>
          <span className="pill pill-neutral shrink-0"><AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} /> Moderate Priority</span>
        </div>
        <PanelClose onClose={onClose} />
      </div>
      <div className="eyebrow text-deep mb-2">Liability Priority Assessment</div>
      <p className="body-text leading-relaxed">
        Requires regulatory review. This event has moderate litigation importance and contributes supporting evidence toward liability.
      </p>
    </div>
  );
}

// 2 — Forensic Analysis (brand light theme)
function ForensicPanel({ ev, onClose }: { ev: ChronEvent; onClose?: () => void }) {
  const sections: [string, string][] = [
    ["Evidence Summary", ev.description],
    ["Medical Interpretation", "Findings are consistent with a traumatic cervical injury showing disc herniation and nerve-root involvement — a significant, objectively documented impairment."],
    ["Legal Significance", "Reinforces the negligence theory and ties the documented harm directly to the defendant's breach of duty."],
    ["Settlement Impact", "Reinforces causation and injury severity, supporting the recommended multiplier and overall settlement value."],
  ];
  return (
    <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
          <h4 className="card-title">Forensic Analysis</h4>
          <span className="pill pill-neutral shrink-0">AI Generated</span>
        </div>
        <PanelClose onClose={onClose} />
      </div>
      {/* AI Summary — moved off the timeline card */}
      <div className="rounded-lg border border-[#D6F2F7] bg-white p-3 mb-3">
        <div className="eyebrow text-deep mb-1">AI Summary</div>
        <p className="body-text leading-relaxed">{ev.insight}</p>
      </div>
      <div className="space-y-3">
        {sections.map(([t, b]) => (
          <div key={t}>
            <div className="eyebrow text-deep mb-1">{t}</div>
            <p className="body-text leading-relaxed">{b}</p>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="eyebrow">Confidence</span>
          <span className="pill pill-complete">High (92%)</span>
        </div>
      </div>
    </div>
  );
}

// 3 — Ask Medical Expert (brand light theme)
function ExpertPanel({ onClose }: { ev?: ChronEvent; onClose?: () => void }) {
  const questions = ["Explain standard of care", "What is the medical causation?", "What future medical costs can we claim?"];
  return (
    <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-tint flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-deep" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h4 className="card-title leading-tight">Dr. Sarah Lin, MD</h4>
            <div className="secondary-text">Forensic Medical Consultant</div>
          </div>
        </div>
        <PanelClose onClose={onClose} />
      </div>
      <p className="body-text leading-relaxed mb-3">Ask Dr. Lin about the clinical significance of this evidence.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {questions.map((q) => (
          <button key={q} className="inline-flex items-center gap-1.5 rounded-full border border-[#D6F2F7] bg-white px-3 py-1.5 text-xs text-ink hover:bg-tint transition-colors">
            <MessageSquare className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> {q}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Ask Dr. Lin about this evidence..."
          className="flex-1 bg-white border border-[#D6F2F7] rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
        />
        <button className="btn btn-primary shrink-0">Consult Expert</button>
      </div>
    </div>
  );
}

// Contextual tags shown under a chronology card's title. Reads the event's
// structured taxonomy — never inferred from the title at render time — and
// renders nothing for an event that has not been classified. Capped at three
// so the strip stays scannable.
function ChronologyTags({ taxonomy }: { taxonomy?: ChronTaxonomy }) {
  const tags = taxonomy?.tags?.filter(Boolean).slice(0, 3) ?? [];
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded-md border border-[#DCEEF4] bg-tint px-2 py-0.5 text-[11px] font-medium text-deep leading-[1.5]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// Amounts billed on the documents attached to ONE medical chronology event.
// Card-level only — never a chronology-wide total. A card with no billing
// document renders nothing: absence of a bill is not a bill of zero.
function CardMedicalBills({ evidence }: { evidence: string[] }) {
  const bills = billsForEvidence(evidence);
  if (bills.length === 0) return null;
  const priced = bills.filter((b) => b.amount !== null);
  const total = priced.reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return (
    <div className="mt-2 flex flex-col items-end gap-1">
      {bills.map((b) => (
        <div key={b.doc} className="flex items-baseline gap-2 text-right">
          <span className="text-[11px] text-[#8A98A3]">{b.label} · {b.doc}</span>
          {b.amount === null ? (
            <span className="text-[11px] text-[#8A98A3] italic">Bill amount unavailable</span>
          ) : (
            <span className="text-sm font-semibold text-ink tabular-nums">{formatUSD(b.amount)}</span>
          )}
        </div>
      ))}
      {priced.length > 1 && (
        <div className="flex items-baseline gap-2 text-right pt-1 mt-0.5 border-t border-line">
          <span className="eyebrow">Documented on this event</span>
          <span className="text-sm font-semibold text-ink tabular-nums">{formatUSD(total)}</span>
        </div>
      )}
    </div>
  );
}

// Provenance badges. `Verified` describes the evidence; the second badge says
// who or what created the entry, and opens its change history when there is one.
function ProvenanceBadges({ ev, onHistory }: { ev: ChronEvent; onHistory: () => void }) {
  const prov: Provenance = ev.provenance ?? (ev.source === "user" ? "user" : "system");
  const label = PROVENANCE_LABEL[prov];
  const Icon = prov === "user" || prov === "user-edited" ? UserPlus : prov.startsWith("ai") ? Sparkles : Bot;
  const hasHistory = !!ev.history && ev.history.length > 0;

  const badge = (
    <span
      className={`pill pill-neutral ${hasHistory ? "cursor-pointer hover:bg-[#D7EEF5] transition-colors" : ""}`}
      onClick={hasHistory ? onHistory : undefined}
      title={hasHistory ? "View change history" : ev.addedBy ? `Added by ${ev.addedBy}` : undefined}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {label}
      {hasHistory && <History className="w-3 h-3 ml-0.5" strokeWidth={1.75} />}
    </span>
  );

  // A manually added entry carries no evidence-verification status.
  if (prov === "user") return <div className="flex items-center gap-1.5 shrink-0">{badge}</div>;
  return (
    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
      <span className="pill pill-complete"><ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} /> Verified</span>
      {badge}
    </div>
  );
}

// Change history — every version an entry has been through, newest first.
function ChangeHistoryDrawer({ ev, onClose }: { ev: ChronEvent; onClose: () => void }) {
  const versions = [...(ev.history ?? [])].reverse();
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Change History</div>
            <h2 className="card-title">{ev.title}</h2>
            <div className="mono-ref mt-1">{ev.date}{ev.time ? ` · ${ev.time}` : ""}</div>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {versions.length === 0 ? (
            <p className="secondary-text">No changes recorded for this entry.</p>
          ) : (
            <div className="relative">
              {versions.map((v, i) => (
                <div key={v.version} className="relative flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-brand mt-1.5" />
                    {i < versions.length - 1 && <div className="w-px flex-1 bg-line mt-1.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">v{v.version} · {v.label}</span>
                      <span className="mono-ref">{v.at}</span>
                    </div>
                    {v.reason && <p className="body-text leading-relaxed mt-1.5">{v.reason}</p>}
                    <div className="rounded-xl border border-line divide-y divide-line mt-2.5">
                      <div className="px-3.5 py-2">
                        <div className="eyebrow mb-0.5">Event</div>
                        <p className="body-text leading-relaxed">{v.snapshot.title}</p>
                      </div>
                      <div className="px-3.5 py-2">
                        <div className="eyebrow mb-0.5">Description</div>
                        <p className="body-text leading-relaxed">{v.snapshot.description}</p>
                      </div>
                      {v.sources && v.sources.length > 0 && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-1">Source</div>
                          <div className="flex flex-wrap gap-1.5">
                            {v.sources.map((d) => (
                              <span key={d} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-offwhite px-2.5 py-1 text-xs text-ink">
                                <FileTypeIcon name={d} className="w-3.5 h-3.5 text-deep" /> {d} <FileTypeTag name={d} />
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-4 px-3.5 py-2">
                        <span className="text-sm text-[#5B6B78]">Modified by</span>
                        <span className="text-sm font-medium text-ink">{v.by}</span>
                      </div>
                      {v.approvedBy && (
                        <div className="flex items-center justify-between gap-4 px-3.5 py-2">
                          <span className="text-sm text-[#5B6B78]">Approved by</span>
                          <span className="text-sm font-medium text-ink">{v.approvedBy}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Supporting-evidence chips: one document + an aggregated "+N More".
function EvidenceChips({ evidence, onOpen, align }: { evidence: string[]; onOpen: () => void; align?: "right" }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${align === "right" ? "justify-end" : ""}`}>
      <button
        onClick={onOpen}
        title="Open evidence review"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm text-ink cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
      >
        <FileTypeIcon name={evidence[0]} className="w-4 h-4 text-deep shrink-0" />
        <span className="truncate max-w-[220px]">{evidence[0]}</span>
        <FileTypeTag name={evidence[0]} />
      </button>
      {evidence.length > 1 && (
        <button
          onClick={onOpen}
          title="Open evidence review"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm font-medium text-deep cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
        >
          <FileText className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          +{evidence.length - 1} More
        </button>
      )}
    </div>
  );
}

// Manually added chronology lives above this component so it survives tab
// switches and so the Chronology stage's Evidence section can see the documents
// the attorney attached to those events.
export interface UserChronology { medical: ChronEvent[]; event: ChronEvent[] }
export const EMPTY_USER_CHRONOLOGY: UserChronology = { medical: [], event: [] };

// ── Medical Conditions: one condition ───────────────────────────────────────
// Built like the Analysis stage's signal cards (eyebrow tag, title, summary,
// evidence), with what the before/after reading turns on — timing, severity
// and the relationship across the incident — shown as tags. Each shows the
// record's value or says it is not established; none is ever inferred here.

type ConditionRelation = NonNullable<AnalysisFinding["relationship"]>;

const CONDITION_TIMING_LABEL: Record<NonNullable<AnalysisFinding["timing"]>, string> = {
  "pre-incident": "Pre-Incident",
  "post-incident": "Post-Incident",
};

const CONDITION_RELATION_LABEL: Record<ConditionRelation, string> = {
  new: "New",
  aggravated: "Aggravated",
  worsened: "Worsened",
  related: "Related",
  unchanged: "Unchanged",
};

// What each relationship means, in the attorney's words — the line a card
// shows under RELATIONSHIP.
const CONDITION_RELATION_MEANING: Record<ConditionRelation, string> = {
  new: "New injury",
  aggravated: "Aggravated pre-existing condition",
  worsened: "Worsened pre-existing condition",
  related: "Related to pre-existing condition",
  unchanged: "Pre-existing condition continued without documented material change",
};

// What a relationship rests on. A documented fact, a relationship the medical
// evidence supports, and an AI inference are never presented as the same thing.
const CONDITION_BASIS_LABEL: Record<NonNullable<AnalysisFinding["relationshipBasis"]>, string> = {
  documented: "Documented fact",
  evidence: "Supported by medical evidence",
  ai: "AI inference — not verified",
};

const RELATIONSHIP_NOT_ESTABLISHED = "Relationship not established";

// Severity and relationship → the product's existing status pills.
const CONDITION_SEVERITY_PILL: Record<NonNullable<AnalysisFinding["severity"]>, string> = {
  Mild: "pill pill-complete",
  Moderate: "pill pill-neutral",
  Severe: "pill pill-progress",
  Critical: "pill pill-risk",
};

const CONDITION_RELATION_PILL: Record<ConditionRelation, string> = {
  new: "pill pill-neutral",
  aggravated: "pill pill-progress",
  worsened: "pill pill-progress",
  related: "pill pill-neutral",
  unchanged: "pill pill-neutral",
};

// Two conditions share a body part only when the record names the same part on
// the same side — "Right leg" and "Left leg" stay separate. A match is shown as
// worth checking, never as a relationship.
const sameBodyPart = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// A pre-incident condition and the post-incident condition the record relates
// to it.
interface ConditionPair { pre: AnalysisFinding; post: AnalysisFinding }

// A labelled dropdown in the Chronology Filters card — the same control the
// Medical / Case Events filter uses.
function ChronFilterSelect<T extends string>({
  label, value, options, open, onToggle, onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  open: boolean;
  onToggle: () => void;
  onPick: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  const narrowed = value !== options[0]?.value;
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="relative">
        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            narrowed ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-soft"
          }`}
        >
          <span className="truncate">{current}</span>
          <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={onToggle} />
            <div className="absolute left-0 right-0 mt-1.5 z-20 rounded-lg border border-line bg-white shadow-lg p-1">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onPick(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    value === opt.value ? "bg-tint text-deep font-medium" : "text-ink hover:bg-wash"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConditionRelationTag({ relation }: { relation: ConditionRelation }) {
  return (
    <span className={`${CONDITION_RELATION_PILL[relation]} uppercase tracking-[0.06em]`}>
      {CONDITION_RELATION_LABEL[relation]}
    </span>
  );
}

function InjurySignalCard({
  signal, linkedPost = [], bodyPartMatches = [], onPreview, onInsights, onDetails,
}: {
  signal: AnalysisFinding;
  /** For a pre-incident condition: the post-incident conditions the record
   *  relates to it, so the link reads from both ends. */
  linkedPost?: AnalysisFinding[];
  /** Conditions on the other side of the incident naming the same body part
   *  with no relationship recorded — shown as worth checking, nothing more. */
  bodyPartMatches?: AnalysisFinding[];
  onPreview: () => void;
  onInsights: () => void;
  onDetails: () => void;
}) {
  const files = signal.evidence.map((e) => e.file);
  const pre = signal.timing === "pre-incident";
  return (
    <div className="rounded-xl border border-line bg-white p-5 flex flex-col">
      <div className="eyebrow flex items-center gap-1.5 mb-2">
        <Stethoscope className="w-4 h-4 text-deep" strokeWidth={1.75} />
        {signal.tag}
      </div>
      <h3 className="card-title leading-snug">{signal.title}</h3>

      {/* Timing, pre-existing, relationship and severity */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        {signal.timing
          ? <span className="pill pill-neutral uppercase tracking-[0.06em]">{CONDITION_TIMING_LABEL[signal.timing]}</span>
          : <span className="text-xs text-[#8A98A3]">Timing not established</span>}
        {pre && <span className="pill pill-neutral uppercase tracking-[0.06em]">Pre-existing</span>}
        {signal.relationship && <ConditionRelationTag relation={signal.relationship} />}
        {signal.severity
          ? <span className={CONDITION_SEVERITY_PILL[signal.severity]}>Severity: {signal.severity}</span>
          : <span className="text-xs text-[#8A98A3]">Severity not assessed</span>}
      </div>

      <p className="body-text leading-relaxed mt-3">{signal.description}</p>
      {signal.bodyPart && <p className="text-xs text-[#5B6B78] mt-1.5">Body part: {signal.bodyPart}</p>}

      {/* Relationship across the incident */}
      {!pre && (
        signal.relationship ? (
          // Shown on the card itself, not only in Details: what the relationship
          // is, which pre-existing condition it concerns, and what changed.
          <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3 space-y-1.5">
            <div className="eyebrow">Relationship</div>
            <p className="text-sm font-semibold text-ink">{CONDITION_RELATION_MEANING[signal.relationship]}</p>
            {signal.relatedCondition ? (
              <p className="secondary-text">Pre-existing: <span className="font-medium text-ink">{signal.relatedCondition}</span></p>
            ) : signal.relationship === "new" ? (
              <p className="secondary-text">No pre-existing related condition identified.</p>
            ) : null}
            {signal.changeAfterIncident && (
              <p className="secondary-text">Incident-related change: <span className="font-medium text-ink">{signal.changeAfterIncident}</span></p>
            )}
            {signal.relationshipBasis && <p className="text-xs text-[#5B6B78]">{CONDITION_BASIS_LABEL[signal.relationshipBasis]}</p>}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="eyebrow">Relationship</span>
            <span className="text-xs text-[#8A98A3]">{RELATIONSHIP_NOT_ESTABLISHED}</span>
          </div>
        )
      )}
      {pre && linkedPost.length > 0 && (
        <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
          <div className="eyebrow mb-1.5">Linked to post-incident condition</div>
          <div className="space-y-1">
            {linkedPost.map((p) => (
              <div key={p.title} className="flex items-center gap-2 flex-wrap text-sm">
                {p.relationship && <ConditionRelationTag relation={p.relationship} />}
                <ArrowRight className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                <span className="font-medium text-ink">{p.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {pre && signal.relationship === "unchanged" && (
        <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3 space-y-1">
          <div className="eyebrow flex items-center gap-1">Continues into post-incident period <ArrowRight className="w-3 h-3" strokeWidth={2} /></div>
          <p className="secondary-text">{CONDITION_RELATION_MEANING.unchanged}</p>
          {signal.relationshipBasis && <p className="text-xs text-[#5B6B78]">{CONDITION_BASIS_LABEL[signal.relationshipBasis]}</p>}
        </div>
      )}

      {/* Same body part on the other side of the incident, no relationship recorded */}
      {bodyPartMatches.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-[#5B6B78]">
          <Info className="w-3.5 h-3.5 text-deep shrink-0 mt-px" strokeWidth={1.75} />
          Same body part as {bodyPartMatches.map((m) => m.title).join(", ")} — {RELATIONSHIP_NOT_ESTABLISHED.toLowerCase()}.
        </p>
      )}

      {/* Supporting evidence */}
      <div className="mt-4 pt-4 border-t border-line">
        <div className="eyebrow mb-2">Supporting Evidence</div>
        {files.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {files.map((f) => (
              <button
                key={f}
                onClick={onPreview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-2.5 py-1.5 text-xs text-ink hover:border-brand hover:bg-tint transition-all"
              >
                <FileTypeIcon name={f} className="w-3.5 h-3.5 text-deep shrink-0" />
                <span className="truncate max-w-[200px]">{f}</span>
                <FileTypeTag name={f} />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#8A98A3]">No supporting documents on file.</p>
        )}
      </div>

      {/* Preview & Insights — as on the Analysis stage's signal cards — and the
          before/after detail */}
      <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onPreview}
          className="flex-1 min-w-[96px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
        >
          <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
        </button>
        <button
          onClick={onInsights}
          className="flex-1 min-w-[96px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
        >
          <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
        </button>
        <button
          onClick={onDetails}
          className="flex-1 min-w-[96px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
        >
          Details <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

// A right-hand drawer in the stage's existing pattern.
function ConditionDrawer({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[640px] max-w-[94vw] bg-offwhite shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line bg-white shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">{eyebrow}</div>
            <h2 className="card-title">{title}</h2>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </>
  );
}

const muted = (v?: string, empty = "Not available") =>
  v ? <span className="text-ink">{v}</span> : <span className="text-[#8A98A3]">{empty}</span>;

// One condition, before and after the incident, in a few short sections.
function ConditionDetailDrawer({
  pre, post, onClose, onPreview,
}: { pre?: AnalysisFinding; post?: AnalysisFinding; onClose: () => void; onPreview: (s: AnalysisFinding) => void }) {
  const relation = post?.relationship ?? (pre?.relationship === "unchanged" ? "unchanged" : undefined);
  const basis = post?.relationshipBasis ?? pre?.relationshipBasis;
  const side = (s: AnalysisFinding | undefined, when: string, empty: string) => (
    s ? (
      <div className="space-y-0.5 text-sm">
        <div className="font-semibold text-ink">{s.title}</div>
        <div className="text-[#5B6B78]">{when}</div>
        <div>Severity: {muted(s.severity, "Not assessed")}</div>
      </div>
    ) : <p className="text-sm text-[#8A98A3]">{empty}</p>
  );
  const evidenceOf = [pre, post].filter((s): s is AnalysisFinding => !!s);
  return (
    <ConditionDrawer eyebrow="Condition Detail" title={(post ?? pre)!.title} onClose={onClose}>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="eyebrow mb-2">Pre-Incident</div>
        {side(pre, "Documented before incident", "No documented pre-incident condition")}
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="eyebrow mb-2">Post-Incident</div>
        {post
          ? side(post, "Documented after incident", "")
          : <p className="text-sm text-[#8A98A3]">{relation === "unchanged" ? CONDITION_RELATION_MEANING.unchanged : "No post-incident condition is linked to it"}</p>}
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="eyebrow mb-2">Change After Incident</div>
        <p className="text-sm">{muted(post?.changeAfterIncident, "Not described in the record")}</p>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="eyebrow mb-2">Relationship</div>
        {relation ? (
          <div className="space-y-1">
            <ConditionRelationTag relation={relation} />
            <p className="text-sm font-medium text-ink">{CONDITION_RELATION_MEANING[relation]}</p>
            {basis && <p className="text-xs text-[#5B6B78]">{CONDITION_BASIS_LABEL[basis]}</p>}
          </div>
        ) : <p className="text-sm text-[#8A98A3]">{RELATIONSHIP_NOT_ESTABLISHED}</p>}
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="eyebrow mb-2">Supporting Evidence</div>
        <div className="space-y-2">
          {evidenceOf.map((s) => (
            <div key={s.title} className="flex items-center gap-2 flex-wrap">
              {s.evidence.map((e) => (
                <button
                  key={e.file}
                  onClick={() => onPreview(s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-2.5 py-1.5 text-xs text-ink hover:border-brand hover:bg-tint transition-all"
                >
                  <FileTypeIcon name={e.file} className="w-3.5 h-3.5 text-deep shrink-0" />
                  {e.file}
                  <FileTypeTag name={e.file} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>
    </ConditionDrawer>
  );
}

// An attorney's reading of one pre/post pair, built only from what the record
// states — the conditions, the recorded relationship and its basis. It frames
// what to evaluate; it never asserts causation, coverage or recovery.
function compareInsight(pre: AnalysisFinding, post: AnalysisFinding | undefined, relation: ConditionRelation | undefined, sameBody: boolean) {
  const basis = (post?.relationshipBasis ?? pre.relationshipBasis);
  const basisNote = basis ? ` (${CONDITION_BASIS_LABEL[basis]}.)` : "";
  const body = sameBody && pre.bodyPart ? `, affecting the same body part (${pre.bodyPart.toLowerCase()})` : "";
  if (relation === "unchanged") {
    return `${pre.title} is recorded as continuing after the incident without documented material change.${basisNote}`;
  }
  if (!post || !relation) {
    return `The record documents ${pre.title} before the incident but does not establish how it relates to a post-incident condition. Review the medical evidence before treating any post-incident condition as new or as an aggravation.`;
  }
  if (relation === "aggravated" || relation === "worsened") {
    return `The record documents ${pre.title} before the incident and ${post.title} after it${body}. The relationship is recorded as ${CONDITION_RELATION_MEANING[relation].toLowerCase()}, so the post-incident condition should be evaluated as a potential aggravation of a pre-existing condition rather than an entirely new injury.${basisNote}`;
  }
  if (relation === "related") {
    return `The record documents ${pre.title} before the incident and ${post.title} after it${body}. It records the two as related but does not establish aggravation — weigh the pre-existing condition when evaluating the post-incident one.${basisNote}`;
  }
  return `${post.title} is recorded as a new injury after the incident, with no documented pre-existing condition corresponding to it.${basisNote}`;
}

// The Compare sub-tab: every pre-incident condition, then what became of it
// after the incident, then the relationship and an attorney insight. With no
// pre-incident condition on record it says so, and lists the post-incident
// findings rather than a comparison that would mislead.
function ConditionCompareView({
  rows, unlinkedPost, onReviewPost,
}: { rows: { pre: AnalysisFinding; post?: AnalysisFinding }[]; unlinkedPost: AnalysisFinding[]; onReviewPost: () => void }) {
  const fields: { label: string; get: (s: AnalysisFinding) => string | undefined }[] = [
    { label: "Body Part", get: (s) => s.bodyPart },
    { label: "Severity", get: (s) => s.severity },
    { label: "Symptoms", get: (s) => s.symptoms },
    { label: "Treatment", get: (s) => s.treatment },
    { label: "Functional Impact", get: (s) => s.functionalImpact },
  ];
  const step = (label: string, s?: AnalysisFinding, note?: string, empty?: string) => (
    <div className="rounded-xl border border-line bg-offwhite p-4">
      <div className="eyebrow mb-1">{label}</div>
      {s ? (
        <>
          <div className="card-title leading-snug">{s.title}</div>
          {note && <div className="secondary-text mt-0.5">{note}</div>}
          <div className="text-xs text-[#5B6B78] mt-1">Severity: {s.severity ?? "Not assessed"}</div>
        </>
      ) : <div className="text-sm text-[#8A98A3]">{empty}</div>}
    </div>
  );
  const arrow = (
    <div className="flex justify-center py-1.5" aria-hidden="true">
      <ArrowDown className="w-4 h-4 text-deep" strokeWidth={1.75} />
    </div>
  );
  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-5">
          <p className="secondary-text">No pre-incident conditions are currently documented.</p>
          <p className="secondary-text">Post-incident findings can still be reviewed below.</p>
        </div>
      )}

      {rows.map(({ pre, post }) => {
        const relation = post?.relationship ?? (pre.relationship === "unchanged" ? "unchanged" : undefined);
        const sameBody = !!post && sameBodyPart(pre.bodyPart, post.bodyPart);
        return (
          <section key={pre.title} className="rounded-xl border border-line bg-white p-5">
            {step("Pre-Incident", pre, "Existing condition documented before incident")}
            {arrow}
            {step(
              "Post-Incident",
              post,
              post?.changeAfterIncident,
              relation === "unchanged" ? CONDITION_RELATION_MEANING.unchanged : "No post-incident condition is linked to it",
            )}
            {arrow}
            {/* Relationship / change */}
            <div className="rounded-xl bg-tint border border-[#D6F2F7] p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="eyebrow">Relationship</span>
                {relation
                  ? <><ConditionRelationTag relation={relation} /><span className="text-sm font-medium text-ink">{CONDITION_RELATION_MEANING[relation]}</span></>
                  : <span className="text-sm text-[#8A98A3]">No relationship established</span>}
                {sameBody && <span className="pill pill-neutral uppercase tracking-[0.06em]">Same body part</span>}
              </div>
              <div>
                <div className="eyebrow text-deep mb-0.5">Attorney Insight</div>
                <p className="body-text leading-relaxed">{compareInsight(pre, post, relation, sameBody)}</p>
              </div>
            </div>

            {/* Side by side, field by field */}
            <div className="grid grid-cols-2 gap-x-4 mt-4">
              <div className="eyebrow pb-2 border-b border-line">Pre-Incident</div>
              <div className="eyebrow pb-2 border-b border-line">Post-Incident</div>
              {fields.map((f) => (
                <div key={f.label} className="contents">
                  <div className="py-2 border-b border-line">
                    <div className="text-[11px] text-[#8A98A3] uppercase tracking-[0.06em]">{f.label}</div>
                    <div className="text-sm">{muted(f.get(pre))}</div>
                  </div>
                  <div className="py-2 border-b border-line">
                    <div className="text-[11px] text-[#8A98A3] uppercase tracking-[0.06em]">{f.label}</div>
                    <div className="text-sm">{post ? muted(f.get(post)) : <span className="text-[#8A98A3]">—</span>}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="eyebrow mb-1.5">Supporting Evidence</div>
              <p className="secondary-text">{Array.from(new Set([pre, post].filter(Boolean).flatMap((s) => s!.evidence.map((e) => e.file)))).join(" · ") || "No supporting documents on file."}</p>
            </div>
          </section>
        );
      })}

      {/* Post-incident findings with no pre-incident condition linked */}
      {unlinkedPost.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <div className="eyebrow">Post-Incident Findings With No Linked Pre-Incident Condition</div>
            <button onClick={onReviewPost} className="inline-flex items-center gap-1 text-sm font-semibold text-deep hover:text-ink transition-colors">
              Review post-incident findings <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="divide-y divide-line">
            {unlinkedPost.map((p) => (
              <div key={p.title} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium text-ink">{p.title}</span>
                {p.relationship
                  ? <span className="flex items-center gap-2"><ConditionRelationTag relation={p.relationship} /><span className="text-xs text-[#5B6B78]">{CONDITION_RELATION_MEANING[p.relationship]}</span></span>
                  : <span className="text-xs text-[#8A98A3]">No relationship established</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function MedicalTimelineTab({
  model, documents, goTo, findings = [], userChronology = EMPTY_USER_CHRONOLOGY, onAddChronology,
  hideEventChronology = false,
}: TabProps & {
  userChronology?: UserChronology;
  onAddChronology?: (kind: "medical" | "event", ev: ChronEvent) => void;
  /** Leaves out Event Chronology entirely — its tab and its Timeline
   *  Navigator card. The Case Ready Medical Chronology deliverable is medical
   *  only; the Chronology stage keeps all three tabs. */
  hideEventChronology?: boolean;
}) {
  // Medical and Event Chronology answer "what happened and when"; Medical
  // Conditions answers what the plaintiff's condition was before and after.
  const [subTab, setSubTab] = useState<"medical" | "event" | "conditions">("medical");
  // The timeline the date and event-type filters apply to. On Medical Conditions
  // they keep their medical-timeline meaning, and using them returns there.
  const timelineKind: "medical" | "event" = subTab === "event" ? "event" : "medical";
  // Inline accordion: only one panel open across all medical cards at a time.
  const [openPanel, setOpenPanel] = useState<{ index: number; mode: PanelMode } | null>(null);
  const togglePanel = (index: number, mode: PanelMode) =>
    setOpenPanel((p) => (p && p.index === index && p.mode === mode ? null : { index, mode }));
  // Evidence Review Workspace — opened from a card's Supporting Evidence chips.
  const [evidenceEvent, setEvidenceEvent] = useState<ChronEvent | null>(null);
  const [evidenceAI, setEvidenceAI] = useState<"actions" | "insights" | "chat" | "severity" | "forensic" | "expert" | null>(null);
  const openEvidence = (
    ev: ChronEvent,
    opts: { ai?: "actions" | "insights" | "chat" | "severity" | "forensic" | "expert" } = {},
  ) => { setEvidenceEvent(ev); setEvidenceAI(opts.ai ?? null); };

  // ── Chronology toolbar state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" or a category name
  const [filterOpen, setFilterOpen] = useState(false);
  // Date filter (calendar popup): single date or a custom from–to range.
  const [calOpen, setCalOpen] = useState(false);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null);
  const [rangeTo, setRangeTo] = useState<Date | null>(null);

  // ── Manually added chronology (Add Chronology drawer) ──
  const [addOpen, setAddOpen] = useState(false);
  const userMedical = userChronology.medical;
  const userEvent = userChronology.event;
  const [toast, setToast] = useState<string | null>(null);
  const [historyEvent, setHistoryEvent] = useState<ChronEvent | null>(null);

  // Full timelines — generated events with the attorney's entries slotted in by date.
  // Seeded events, plus anything the attorney or the assistant added, with any
  // approved edits applied on top. One timeline, several provenances.
  const store = useChronologyOptional();
  const aiMedical = (store?.additions ?? []).filter((a) => a.kind === "medical").map(additionToEvent);
  const aiEvent = (store?.additions ?? []).filter((a) => a.kind === "event").map(additionToEvent);
  const overrides = store?.overrides ?? {};
  const medicalAll = applyOverrides(mergeChronologically(MEDICAL_CHRONOLOGY, [...userMedical, ...aiMedical]), overrides);
  const eventAll = applyOverrides(mergeChronologically(EVENT_CHRONOLOGY, [...userEvent, ...aiEvent]), overrides);

  const addChronology = (c: CreatedChronology) => {
    onAddChronology?.(c.kind, toChronEvent(c));
    setAddOpen(false);
    setOpenPanel(null); // indices shift once the new card is slotted in
    setToast(c.kind === "medical" ? "Medical chronology added successfully." : "Event chronology added successfully.");
  };

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const clearDates = () => { setSelDate(null); setRangeFrom(null); setRangeTo(null); };
  // Click handling inside the calendar grid: single sets the date; range fills
  // from → to, then starts over on the next click.
  const pickDay = (d: Date) => {
    if (subTab === "conditions") setSubTab("medical");
    if (dateMode === "single") { setSelDate(d); return; }
    if (!rangeFrom || (rangeFrom && rangeTo)) { setRangeFrom(d); setRangeTo(null); return; }
    if (d.getTime() < rangeFrom.getTime()) { setRangeTo(rangeFrom); setRangeFrom(d); }
    else setRangeTo(d);
  };
  const hasDateFilter = dateMode === "single" ? !!selDate : !!rangeFrom;

  // Switching tabs resets the category + date filters (and any open dropdown).
  const selectSubTab = (key: "medical" | "event" | "conditions") => {
    setSubTab(key);
    setFilter("all");
    setFilterOpen(false);
    setCondOpen(null);
    clearDates();
  };

  // ── Medical Conditions ──
  // The case's own Injury Signals — the same findings the Analysis stage shows —
  // read as BEFORE → INCIDENT → AFTER. Pre- and post-incident are not exclusive:
  // a post-incident condition the record relates to a pre-incident one is shown
  // with it, joined by the relationship. Nothing here is derived or filled in —
  // a link exists only where the record names it, never from a shared body part.
  const injurySignals = findings.filter((f) => f.kind === "injury");
  const [condTiming, setCondTiming] = useState<"all" | "pre-incident" | "post-incident" | ConditionRelation>("all");
  const [condRelation, setCondRelation] = useState<"all" | ConditionRelation | "none">("all");
  const [condOpen, setCondOpen] = useState<"timing" | "relation" | null>(null);
  // The Medical Conditions filter picks a period or a relationship; Condition
  // Relationship narrows by relationship, including "not established".
  const timingView = condTiming === "pre-incident" || condTiming === "post-incident";
  const matchesCondition = (s: AnalysisFinding) =>
    condTiming === "all" ? true : timingView ? s.timing === condTiming : s.relationship === condTiming;
  const matchesRelation = (s: AnalysisFinding) =>
    condRelation === "all" ? true : condRelation === "none" ? !s.relationship : s.relationship === condRelation;
  const narrowed = condTiming !== "all" || condRelation !== "all";

  const allPre = injurySignals.filter((s) => s.timing === "pre-incident");
  const allPost = injurySignals.filter((s) => s.timing === "post-incident");
  // Pairs the record establishes: a post-incident condition naming the
  // pre-incident condition it relates to.
  const conditionPairs: ConditionPair[] = allPost
    .map((post) => ({ pre: allPre.find((p) => p.title === post.relatedCondition), post }))
    .filter((x): x is ConditionPair => !!x.pre);
  const pairOf = (s: AnalysisFinding) => conditionPairs.find((p) => p.pre === s || p.post === s);
  // Each condition stays in its own period's list; a linked pair is joined by
  // what the two cards say about each other. A relationship filter keeps the
  // pre-incident half of a matching pair in view, since the relationship is
  // recorded on the post-incident half.
  const matchesFilters = (s: AnalysisFinding) => matchesCondition(s) && matchesRelation(s);
  const shownSignals = injurySignals.filter(
    (s) => matchesFilters(s) || (narrowed && !timingView && conditionPairs.some((p) => p.pre === s && matchesFilters(p.post))),
  );
  const preSignals = shownSignals.filter((s) => s.timing === "pre-incident");
  const postSignals = shownSignals.filter((s) => s.timing === "post-incident");
  const untimedSignals = shownSignals.filter((s) => !s.timing);
  // Each section previews three conditions, as the Analysis stage's Injury
  // Signals do, and expands on its own.
  const CONDITION_PREVIEW = 3;
  const [preExpanded, setPreExpanded] = useState(false);
  const [postExpanded, setPostExpanded] = useState(false);
  // Post-incident conditions the record links to no pre-incident one.
  const unlinkedPost = allPost.filter((p) => !conditionPairs.some((x) => x.post === p));
  // Conditions on the other side of the incident naming the same body part,
  // with no relationship recorded between them — flagged, never classified.
  const bodyPartMatches = (s: AnalysisFinding) => {
    const linked = pairOf(s);
    const other = s.timing === "pre-incident" ? allPost : s.timing === "post-incident" ? allPre : [];
    return other.filter((o) => sameBodyPart(o.bodyPart, s.bodyPart) && linked?.pre !== o && linked?.post !== o);
  };
  // Every pre-incident condition beside what became of it, for the comparison.
  const compareRows = allPre.map((pre) => ({ pre, post: conditionPairs.find((p) => p.pre === pre)?.post }));
  // Which Medical Conditions sub-tab is open. A case with pre-incident conditions
  // opens on them; one without opens on the post-incident findings.
  const [condView, setCondView] = useState<"pre" | "post" | "compare">(allPre.length > 0 ? "pre" : "post");
  // Choosing a period in the Medical Conditions filter shows that sub-tab.
  useEffect(() => {
    if (condTiming === "pre-incident") setCondView("pre");
    else if (condTiming === "post-incident") setCondView("post");
  }, [condTiming]);
  const [detailSignal, setDetailSignal] = useState<AnalysisFinding | null>(null);
  const detailPair = detailSignal ? pairOf(detailSignal) : undefined;
  // A signal's evidence opens in the same review workspace as a timeline card —
  // Preview on the documents, Insights on the AI panel.
  const openSignalEvidence = (s: AnalysisFinding, view?: "insights") =>
    openEvidence(
      { date: "", title: s.title, description: s.description, insight: s.conclusion, evidence: s.evidence.map((e) => e.file) },
      view ? { ai: view } : {},
    );

  const categoryOf = (ev: ChronEvent) =>
    ev.category ?? (timelineKind === "medical" ? MEDICAL_CATEGORIES : EVENT_CATEGORIES)[ev.title] ?? "Other";
  // Base options, plus any category a manually added event introduced.
  const baseFilters = timelineKind === "medical" ? MEDICAL_FILTERS : EVENT_FILTERS;
  const filterOptions = [
    ...baseFilters,
    ...Array.from(new Set((timelineKind === "medical" ? userMedical : userEvent).map(categoryOf))).filter(
      (c) => !baseFilters.includes(c),
    ),
  ];
  const allLabel = timelineKind === "medical" ? "All Medical Events" : "All Case Events";
  const filterLabel = filter === "all" ? allLabel : filter;

  const eventDate = (ev: ChronEvent) => {
    const p = parseChronStart(ev.date);
    return p ? new Date(p.year, p.month, p.day) : null;
  };
  const matchesDate = (ev: ChronEvent) => {
    if (!hasDateFilter) return true;
    const d = eventDate(ev);
    if (!d) return false;
    if (dateMode === "single") return !!selDate && sameDay(d, selDate);
    const end = rangeTo ?? rangeFrom!;
    return d.getTime() >= rangeFrom!.getTime() && d.getTime() <= end.getTime();
  };
  const calLabel = !hasDateFilter
    ? "Calendar"
    : dateMode === "single"
    ? fmtShort(selDate!)
    : `${fmtShort(rangeFrom!)}${rangeTo ? ` – ${fmtShort(rangeTo)}` : ""}`;

  const docForFile = buildDocResolver(documents);
  // Documents the attorney can attach — the case file, plus anything already
  // cited by the generated chronology.
  const attachableDocs = Array.from(
    new Set([
      ...documents.map((d) => d.name),
      ...MEDICAL_CHRONOLOGY.flatMap((e) => e.evidence),
      ...EVENT_CHRONOLOGY.flatMap((e) => e.evidence),
    ]),
  );
  const q = search.trim().toLowerCase();
  const events = (timelineKind === "medical" ? medicalAll : eventAll).filter(
    (ev) =>
      (filter === "all" || categoryOf(ev) === filter) &&
      (q === "" || (ev.title + " " + ev.description).toLowerCase().includes(q)) &&
      matchesDate(ev),
  );
  const evidenceDocs = evidenceEvent ? evidenceEvent.evidence.map(docForFile) : [];

  // Two-panel workspace on desktop, sized to the space beneath the case header.
  // The floor is what Filters and Timeline Navigator need to show in full.
  const workspaceRef = useRef<HTMLDivElement>(null);
  const panelHeight = useWorkspacePanelHeight(workspaceRef, 520);

  // Medical Chronology, Event Chronology and Medical Conditions share the one
  // chronology scroll area. A newly chosen tab opens at its start rather than
  // part-way down wherever the previous tab was left.
  const chronoScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chronoScrollRef.current;
    if (el && el.scrollTop > 0) el.scrollTo({ top: 0 });
  }, [subTab]);

  return (
    <>
    {/* A compact sidebar of controlled width — its content wraps, it never
        widens — and the chronology takes all the remaining width. */}
    <div
      ref={workspaceRef}
      className="w-full grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] gap-6 items-start lg:items-stretch"
      style={panelHeight ? { height: panelHeight } : undefined}
    >
      {/* RIGHT — the chronology, the one scroll area of the workspace; reaching
          its end does not carry on into the page */}
      <div ref={chronoScrollRef} className="min-w-0 order-2 rounded-2xl border border-line bg-offwhite p-6 xl:p-8 space-y-8 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="section-header" style={{ fontSize: "22px" }}>Chronology</h2>
          <p className="secondary-text mt-1 max-w-2xl">
            Review the complete sequence of medical treatment and case events generated from verified evidence.
          </p>
        </div>
        <span className="pill pill-complete shrink-0"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Timeline Generated</span>
      </div>

      {/* Toolbar (tabs + controls) with the active date-filter chip beneath it */}
      <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left — chronology tabs. A label never breaks across lines; only on
            the narrowest desktop width does a whole tab move to a second row. */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: "medical", label: "Medical Chronology", count: medicalAll.length },
            { key: "event", label: "Event Chronology", count: eventAll.length },
            { key: "conditions", label: "Medical Conditions", count: injurySignals.length },
          ] as const).filter((t) => !(hideEventChronology && t.key === "event")).map((t) => {
            const active = subTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => selectSubTab(t.key)}
                className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded-lg text-sm font-medium border whitespace-nowrap shrink-0 transition-colors ${
                  active ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                }`}
              >
                {t.label}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                  active ? "bg-brand text-white" : "bg-track text-[#5B6B78]"
                }`}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Right — Add Chronology + expandable search (date & event filters live in the Filters card).
            Both act on timeline events, so they belong to the two timeline views. */}
        {subTab !== "conditions" && (
        <div className="flex items-center gap-2">
          {/* Add Chronology — opens the form for whichever tab is active */}
          <button
            onClick={() => setAddOpen(true)}
            className="btn btn-primary gap-1.5 px-4 py-2"
            title={subTab === "medical" ? "Add a medical chronology event" : "Add a case chronology event"}
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} /> Add Chronology
          </button>

          {/* Expandable search — icon-only until clicked */}
          <div className={`flex items-center rounded-lg border transition-all duration-300 ease-out overflow-hidden ${
            searchOpen ? "w-[240px] border-line bg-white" : "w-9 border-transparent bg-transparent"
          }`}>
            <button
              onClick={() => (searchOpen && !search ? setSearchOpen(false) : setSearchOpen(true))}
              aria-label="Search chronology"
              className="w-9 h-9 shrink-0 flex items-center justify-center text-[#5B6B78] hover:text-ink transition-colors"
            >
              <Search className="w-4 h-4" strokeWidth={1.75} />
            </button>
            {searchOpen && (
              <>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => { if (!search) setSearchOpen(false); }}
                  placeholder="Search chronology..."
                  className="flex-1 min-w-0 bg-transparent text-sm py-2 pr-1 placeholder:text-[#9BA8B4] focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(""); setSearchOpen(false); }}
                    aria-label="Clear search"
                    className="w-8 h-9 shrink-0 flex items-center justify-center text-[#9BA8B4] hover:text-ink transition-colors"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </>
            )}
          </div>

        </div>
        )}
      </div>

      {/* Active date filter — small chip below the tabs; ✕ clears it */}
      {hasDateFilter && subTab !== "conditions" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tint border border-[#D6F2F7] pl-3 pr-1.5 py-1 text-deep text-xs font-medium">
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
            {dateMode === "single"
              ? `Showing ${fmtShort(selDate!)}`
              : `Showing ${fmtShort(rangeFrom!)}${rangeTo ? ` – ${fmtShort(rangeTo)}` : ""}`}
            <button
              onClick={clearDates}
              aria-label="Clear date filter"
              className="ml-0.5 w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#D7EEF5] transition-colors"
            >
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </span>
          <span className="secondary-text">{events.length} {events.length === 1 ? "event" : "events"}</span>
        </div>
      )}
      </div>

      {/* Medical Conditions — what existed before the incident, what was
          documented after it, and how the record relates the two */}
      {subTab === "conditions" && (
        <div className="space-y-8 @container">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <p className="secondary-text max-w-2xl">
              The case&apos;s Injury Signals across the incident. Where the record links a post-incident condition to a
              pre-existing one, its card says so; severity and relationship appear only where the record assesses them.
            </p>
            <button
              onClick={() => setCondView("compare")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-white text-sm font-semibold text-deep hover:border-brand hover:bg-tint transition-colors shrink-0"
            >
              Compare Pre &amp; Post-Incident <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* Sub-tabs — the same tab treatment as the chronology tabs above */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "pre", label: "Pre-Incident", count: preSignals.length },
              { key: "post", label: "Post-Incident", count: postSignals.length },
              { key: "compare", label: "Compare", count: compareRows.length },
            ] as const).map((t) => {
              const active = condView === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setCondView(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                    active ? "bg-brand text-white" : "bg-track text-[#5B6B78]"
                  }`}>{t.count}</span>
                </button>
              );
            })}
          </div>

          {injurySignals.length === 0 ? (
            <div className="text-center py-16 secondary-text">No Injury Signals have been identified for this case.</div>
          ) : condView === "compare" ? (
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-line">
                <div className="w-8 h-8 rounded-lg bg-tint flex items-center justify-center shrink-0">
                  <ArrowRight className="w-4 h-4 text-deep" strokeWidth={1.75} />
                </div>
                <h3 className="card-title flex-1">Compare Pre &amp; Post-Incident</h3>
              </div>
              <ConditionCompareView rows={compareRows} unlinkedPost={unlinkedPost} onReviewPost={() => setCondView("post")} />
            </section>
          ) : (
            <>
              {([
                {
                  key: "pre", title: "Pre-Incident Medical Conditions", icon: History, list: preSignals,
                  expanded: preExpanded, setExpanded: setPreExpanded,
                  empty: narrowed && !timingView
                    ? "No pre-incident conditions match the current filters."
                    : "No pre-incident conditions are documented in the case record.",
                },
                {
                  key: "post", title: "Post-Incident Medical Conditions", icon: Activity, list: postSignals,
                  expanded: postExpanded, setExpanded: setPostExpanded,
                  empty: narrowed
                    ? "No post-incident conditions match the current filters."
                    : "No post-incident conditions are documented in the case record.",
                },
              ] as const).filter((sec) => sec.key === condView).map((sec) => {
                const visible = sec.expanded ? sec.list : sec.list.slice(0, CONDITION_PREVIEW);
                const remaining = sec.list.length - CONDITION_PREVIEW;
                return (
                  <section key={sec.key} className="space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-line">
                      <div className="w-8 h-8 rounded-lg bg-tint flex items-center justify-center shrink-0">
                        <sec.icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      </div>
                      <h3 className="card-title flex-1">{sec.title}</h3>
                      <span className="text-xs font-semibold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums">{sec.list.length}</span>
                    </div>
                    {sec.list.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-4">
                          {visible.map((s) => (
                            <InjurySignalCard
                              key={s.title}
                              signal={s}
                              linkedPost={conditionPairs.filter((p) => p.pre === s).map((p) => p.post)}
                              bodyPartMatches={bodyPartMatches(s)}
                              onPreview={() => openSignalEvidence(s)}
                              onInsights={() => openSignalEvidence(s, "insights")}
                              onDetails={() => setDetailSignal(s)}
                            />
                          ))}
                        </div>
                        {/* Three at a time, as on the Analysis stage */}
                        {remaining > 0 && (
                          <div className="flex justify-center">
                            <button onClick={() => sec.setExpanded(!sec.expanded)} className="btn btn-secondary gap-2">
                              {sec.expanded
                                ? "Show Fewer Findings"
                                : `View ${remaining} More ${remaining === 1 ? "Finding" : "Findings"}`}
                              <ArrowRight className={`w-4 h-4 transition-transform ${sec.expanded ? "-rotate-90" : ""}`} strokeWidth={1.75} />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-line bg-white p-5 secondary-text">{sec.empty}</div>
                    )}
                  </section>
                );
              })}

              {/* Signals the record does not place before or after the incident */}
              {condView === "post" && untimedSignals.length > 0 && (
                <section className="space-y-4">
                  <h3 className="card-title pb-3 border-b border-line">Timing Not Established</h3>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-4">
                    {untimedSignals.map((s) => (
                      <InjurySignalCard
                        key={s.title}
                        signal={s}
                        onPreview={() => openSignalEvidence(s)}
                        onInsights={() => openSignalEvidence(s, "insights")}
                        onDetails={() => setDetailSignal(s)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* Timeline */}
      {subTab === "conditions" ? null : events.length === 0 ? (
        <div className="text-center py-16 secondary-text">No events match the current filters.</div>
      ) : (
      <div className="relative">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1;
          return (
            <div key={ev.id ?? ev.title} className="relative flex gap-5 pb-6 last:pb-0">
              {/* Marker + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-brand mt-6" />
                {!isLast && <div className="w-px flex-1 bg-line mt-1.5" />}
              </div>

              {/* Event card */}
              <div className="flex-1 min-w-0 lg-card p-6">
                {/* Top row */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-1.5 mono-ref">
                    <Calendar className="w-3.5 h-3.5 text-[#5B6B78]" strokeWidth={1.75} />
                    {ev.date}{ev.time && <span className="text-[#9BA8B4]"> · {ev.time}</span>}
                  </div>
                  {/* Origin — how the entry came to exist. Verified is the
                      evidence status and is unchanged; the second badge records
                      provenance and is never overwritten by later AI work. */}
                  <ProvenanceBadges ev={ev} onHistory={() => setHistoryEvent(ev)} />
                </div>

                {/* Title */}
                <h3 className="card-title mb-2 leading-snug" style={{ fontSize: "18px" }}>{ev.title}</h3>

                {/* Contextual tags — what the event is about, at a glance */}
                <ChronologyTags taxonomy={ev.taxonomy} />

                {/* Description */}
                <p className="body-text leading-relaxed">{ev.description}</p>

                {/* Event Chronology — Key Actions beside Supporting Evidence (+ actions under it) */}
                {subTab === "event" && ((ev.actions?.length ?? 0) > 0 || ev.evidence.length > 0) && (
                  <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    {/* Key Actions — the 2–3 most important; full list lives in the preview */}
                    {ev.actions && ev.actions.length > 0 && (
                      <div className="rounded-xl border border-line bg-offwhite p-4">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="eyebrow">Key Actions</div>
                          {/* The detail drawer is evidence-backed — only offered when documents are attached */}
                          {ev.evidence.length > 0 && (
                            <button onClick={() => openEvidence(ev, { ai: "actions" })} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink transition-colors shrink-0">
                              View Details <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                        <ul className="space-y-1.5">
                          {(ev.evidence.length > 0 ? ev.actions.slice(0, 3) : ev.actions).map((a) => (
                            <li key={a.text} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-deep mt-[7px] shrink-0" />
                              <span className="body-text leading-relaxed">{a.text}</span>
                            </li>
                          ))}
                        </ul>
                        {ev.evidence.length > 0 && ev.actions.length > 3 && (
                          <button onClick={() => openEvidence(ev, { ai: "actions" })} className="mt-2.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                            +{ev.actions.length - 3} more actions
                          </button>
                        )}
                      </div>
                    )}

                    {/* Supporting Evidence card + actions directly under it */}
                    {ev.evidence.length > 0 && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-line bg-offwhite p-4">
                          <div className="eyebrow mb-2.5">Supporting Evidence</div>
                          <EvidenceChips evidence={ev.evidence} onOpen={() => openEvidence(ev)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEvidence(ev)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-tint border border-[#D6F2F7] text-deep rounded-lg text-sm font-medium hover:bg-[#D7EEF5] transition-colors"
                          >
                            <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview Evidences
                          </button>
                          <button
                            onClick={() => openEvidence(ev, { ai: "insights" })}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-tint border border-[#D6F2F7] text-deep rounded-lg text-sm font-medium hover:bg-[#D7EEF5] transition-colors"
                          >
                            <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Medical Chronology — divider, then AI tool buttons (left) aligned with Supporting Evidence pills (right) */}
                {subTab === "medical" && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                      {/* Left — AI tool buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {([
                          { mode: "severity", label: "Assess Severity", icon: AlertTriangle, accent: "#0E3A47", tint: "#E6F6FB", line: "#D6F2F7" },
                          { mode: "forensic", label: "Forensic Analysis", icon: Sparkles, accent: "#0E3A47", tint: "#E6F6FB", line: "#D6F2F7" },
                          { mode: "expert", label: "Ask Medical Expert", icon: Stethoscope, accent: "#0E3A47", tint: "#E6F6FB", line: "#D6F2F7" },
                        ] as const).map((b) => {
                          const active = openPanel?.index === i && openPanel.mode === b.mode;
                          return (
                            <button
                              key={b.mode}
                              onClick={() => togglePanel(i, b.mode)}
                              aria-expanded={active}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all whitespace-nowrap"
                              style={{ background: active ? "#D7EEF5" : "#E6F6FB", borderColor: active ? "#1E7C99" : "#D6F2F7", color: "#0E3A47" }}
                            >
                              <b.icon className="w-4 h-4" style={{ color: "#0E3A47" }} strokeWidth={1.75} /> {b.label}
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${active ? "rotate-180" : ""}`} style={{ color: "#0E3A47" }} strokeWidth={1.75} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Right — Supporting Evidence label above the pills; row bottom-aligns so buttons line up with the pills */}
                      {ev.evidence.length > 0 && (
                        <div className="shrink-0">
                          <div className="eyebrow mb-2 text-right">Supporting Evidence</div>
                          <EvidenceChips evidence={ev.evidence} onOpen={() => openEvidence(ev)} align="right" />
                          <CardMedicalBills evidence={ev.evidence} />
                        </div>
                      )}
                    </div>

                    {/* Expandable panel — animates open/closed via grid-rows */}
                    <div className={`grid transition-all duration-300 ease-out ${openPanel?.index === i ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="overflow-hidden">
                        {openPanel?.index === i && openPanel.mode === "severity" && <SeverityPanel onClose={() => setOpenPanel(null)} />}
                        {openPanel?.index === i && openPanel.mode === "forensic" && <ForensicPanel ev={ev} onClose={() => setOpenPanel(null)} />}
                        {openPanel?.index === i && openPanel.mode === "expert" && <ExpertPanel ev={ev} onClose={() => setOpenPanel(null)} />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {subTab === "medical" && <InjuryIntelligenceSection />}

      </div>

      {/* LEFT — Medical Practitioners, Filters, Timeline Navigator: static while
          the chronology scrolls, and one scroll area of its own when taller
          than the window — nothing inside it scrolls separately. First on
          narrow screens. */}
      <div className="min-w-0 order-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
      <div className="space-y-6">

        {/* The practitioners of the case that is open */}
        <PractitionerSnapshotCard key={model.caseId} caseRef={model.caseId} />

        {/* Filters — date filter + event-type filter */}
        <div className="rounded-2xl border border-line bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-deep" strokeWidth={1.75} />
            <h3 className="card-title">Filters</h3>
          </div>

          {/* Date and Medical Events filter the timelines; Medical Conditions and
              Condition Relationship filter the Injury Signals. Using a filter shows
              the view it applies to. */}
          {/* Date filter — opens the date-picker popup (single date or custom range) */}
          <div>
            <div className="eyebrow mb-2">Date</div>
            <div className="relative">
              <button
                onClick={() => setCalOpen((o) => !o)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  hasDateFilter ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-soft"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{calLabel}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${calOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {calOpen && (
                <ChronologyDatePicker
                  mode={dateMode}
                  setMode={(m) => { setDateMode(m); clearDates(); }}
                  selDate={selDate}
                  rangeFrom={rangeFrom}
                  rangeTo={rangeTo}
                  onPick={pickDay}
                  onClear={clearDates}
                  onDone={() => setCalOpen(false)}
                  setRangeFrom={setRangeFrom}
                  setRangeTo={setRangeTo}
                />
              )}
            </div>
            {hasDateFilter && (
              <button onClick={clearDates} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#5B6B78] hover:text-ink transition-colors">
                <X className="w-3 h-3" strokeWidth={2} /> Clear date
              </button>
            )}
          </div>

          {/* Event-type filter — dropdown; options follow the active chronology tab */}
          <div>
            <div className="eyebrow mb-2">{timelineKind === "medical" ? "Medical Events" : "Case Events"}</div>
            <div className="relative">
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  filter !== "all" ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-soft"
                }`}
              >
                <span className="truncate">{filterLabel}</span>
                <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${filterOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className="absolute left-0 right-0 mt-1.5 z-20 rounded-lg border border-line bg-white shadow-lg p-1">
                    {[{ value: "all", label: allLabel }, ...filterOptions.map((c) => ({ value: c, label: c }))].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setFilter(opt.value); setFilterOpen(false); if (subTab === "conditions") setSubTab("medical"); }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          filter === opt.value ? "bg-tint text-deep font-medium" : "text-ink hover:bg-wash"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <ChronFilterSelect
            label="Medical Conditions"
            value={condTiming}
            options={[
              { value: "all", label: "All Conditions" },
              { value: "pre-incident", label: "Pre-Incident Conditions" },
              { value: "post-incident", label: "Post-Incident Conditions" },
              { value: "new", label: "New Conditions" },
              { value: "aggravated", label: "Aggravated Conditions" },
              { value: "worsened", label: "Worsened Conditions" },
              { value: "related", label: "Related Conditions" },
              { value: "unchanged", label: "Unchanged Conditions" },
            ]}
            open={condOpen === "timing"}
            onToggle={() => setCondOpen((o) => (o === "timing" ? null : "timing"))}
            onPick={(v) => { setCondTiming(v); setCondOpen(null); setSubTab("conditions"); }}
          />
          <ChronFilterSelect
            label="Condition Relationship"
            value={condRelation}
            options={[
              { value: "all", label: "All Relationships" },
              { value: "new", label: "New" },
              { value: "aggravated", label: "Aggravated" },
              { value: "worsened", label: "Worsened" },
              { value: "related", label: "Related" },
              { value: "unchanged", label: "Unchanged" },
              { value: "none", label: "Relationship Not Established" },
            ]}
            open={condOpen === "relation"}
            onToggle={() => setCondOpen((o) => (o === "relation" ? null : "relation"))}
            onPick={(v) => { setCondRelation(v); setCondOpen(null); setSubTab("conditions"); }}
          />
        </div>

        {/* Timeline Navigator */}
        <div className="rounded-2xl border border-line bg-white p-5 flex flex-col gap-2.5">
          <h3 className="card-title">Timeline Navigator</h3>
          {([
            { key: "medical", num: medicalAll.length, label: "Medical Events", helper: "Verified treatment timeline" },
            { key: "event", num: eventAll.length, label: "Case Events", helper: "Incident & legal timeline" },
          ] as const).filter((c) => !(hideEventChronology && c.key === "event")).map((c) => {
            const active = subTab === c.key;
            return (
              <button
                key={c.key}
                onClick={() => selectSubTab(c.key)}
                className={`w-full rounded-xl border px-4 py-3 text-left cursor-pointer transition-all ${
                  active ? "border-brand bg-tint shadow-sm" : "border-line bg-offwhite hover:border-soft hover:bg-wash hover:shadow-sm"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className={`font-bold tabular-nums leading-none ${active ? "text-deep" : "text-ink"}`} style={{ fontSize: "22px", letterSpacing: "-0.01em", fontFamily: "var(--font-display)" }}>{c.num}</span>
                  <span className="card-title">{c.label}</span>
                </div>
                <div className="secondary-text mt-0.5">{c.helper}</div>
              </button>
            );
          })}

          <button onClick={() => goTo("economic")} className="btn btn-primary w-full gap-2 mt-1">
            Explore Damages Analysis <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      </div>
    </div>

    {/* Medical Conditions — one condition before and after, and the side-by-side comparison */}
    {detailSignal && (
      <ConditionDetailDrawer
        pre={detailPair?.pre ?? (detailSignal.timing === "pre-incident" ? detailSignal : undefined)}
        post={detailPair?.post ?? (detailSignal.timing !== "pre-incident" ? detailSignal : undefined)}
        onClose={() => setDetailSignal(null)}
        onPreview={(s) => { setDetailSignal(null); openSignalEvidence(s); }}
      />
    )}

    {/* Evidence Review Workspace — PDF viewer + AI analysis tools */}
    <EvidenceReviewModal
      open={!!evidenceEvent}
      title={evidenceEvent?.title ?? ""}
      date={evidenceEvent?.date}
      time={evidenceEvent?.time}
      insight={evidenceEvent?.insight ?? ""}
      description={evidenceEvent?.description ?? ""}
      actions={evidenceEvent?.actions}
      docs={evidenceDocs}
      initialAI={evidenceAI}
      source={evidenceEvent?.source}
      addedBy={evidenceEvent?.addedBy}
      addedAt={evidenceEvent?.addedAt}
      details={evidenceEvent?.details}
      onClose={() => setEvidenceEvent(null)}
    />

    {/* Add Chronology — the active tab decides which form opens */}
    <AddChronologyDrawer
      open={addOpen}
      kind={subTab === "event" ? "event" : "medical"}
      documents={attachableDocs}
      existing={(timelineKind === "medical" ? medicalAll : eventAll).map((e) => ({ date: e.date, title: e.title, description: e.description }))}
      addedBy={CURRENT_USER}
      onCancel={() => setAddOpen(false)}
      onSubmit={addChronology}
    />

    {historyEvent && <ChangeHistoryDrawer ev={historyEvent} onClose={() => setHistoryEvent(null)} />}

    {/* Confirmation toast */}
    {toast && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 rounded-xl border border-line bg-white shadow-lg px-4 py-3">
        <CheckCircle className="w-4 h-4 text-[#15803D] shrink-0" strokeWidth={1.75} />
        <span className="text-sm font-medium text-ink">{toast}</span>
        <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-1 p-1 rounded-md text-[#8A98A3] hover:bg-wash hover:text-ink transition-colors">
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    )}
    </>
  );
}

// ── Billing extraction ────────────────────────────────────────────────────────
// Which case documents are actually billing documents, and whether an amount
// could be read off them. This is an explicit classification, never inferred
// from a filename: a document called ER_Bills is a bill, but a hospital record
// or an imaging report that happens to sit in a billing category is not.
// The amount itself is read from the itemised damages breakdown below, so a
// figure shown on a chronology card reconciles with Damages Analysis.

type BillExtract = { label: string; readable: boolean };

const BILLING_DOCUMENTS: Record<string, BillExtract> = {
  "er_bills.pdf": { label: "Medical Bill", readable: true },
  "hospital_bill.pdf": { label: "Medical Bill", readable: true },
  "therapy_invoices.pdf": { label: "Medical Bill", readable: true },
};

export interface DocumentBill {
  doc: string;
  label: string;
  amount: number | null; // null = a bill, but no amount could be read from it
}

// The amount recorded against a document in the existing itemised damages
// breakdown. Returns null when the document is not itemised anywhere.
function itemisedAmountFor(doc: string): number | null {
  const key = doc.toLowerCase();
  for (const item of ECONOMIC) {
    const line = buildDocBreakdown(item).find((d) => d.name.toLowerCase() === key);
    if (line) return line.amount;
  }
  return null;
}

// The amount the itemised damages breakdown records against a document, wherever
// in the breakdown it appears. Null when the document is not itemised at all —
// which means nothing is evidenced by it, not that it evidences zero.
export function documentAmount(doc: string): number | null {
  return itemisedAmountFor(doc);
}

// A single document's bill, or null when the document is not a billing document.
// Absence of a bill is never zero — it means nothing was billed on this record.
export function billForDocument(doc: string): DocumentBill | null {
  const extract = BILLING_DOCUMENTS[doc.toLowerCase()];
  if (!extract) return null;
  const amount = extract.readable ? itemisedAmountFor(doc) : null;
  return { doc, label: extract.label, amount };
}

// Every bill attached to one chronology event, de-duplicated by document so a
// document referenced twice on a card is counted once.
export function billsForEvidence(evidence: string[]): DocumentBill[] {
  const seen = new Set<string>();
  const out: DocumentBill[] = [];
  for (const name of evidence) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const bill = billForDocument(name);
    if (bill) out.push(bill);
  }
  return out;
}

// ── Tab 3 — Damages Analysis ──────────────────────────────────────────────────
// Explains the financial impact of the case and the evidence supporting each
// damage figure. This is NOT the Valuation page: there are no interactive
// multiplier controls and no settlement-strategy scenarios here — those live on
// the Valuation stage, which this page links out to at the bottom.

// Icons for the seeded damage categories. A damage added later — by the
// attorney or through the assistant — falls back to the generic receipt.
const DAMAGE_ICON: Record<string, typeof DollarSign> = {
  stethoscope: Stethoscope, dollar: DollarSign, heart: HeartPulse,
  activity: Activity, pin: MapPin, clipboard: ClipboardList,
};

// One icon per main economic category, from the set the stage already uses.
const ECONOMIC_CATEGORY_ICON: Record<EconomicCategory, typeof DollarSign> = {
  "Medical & Care Expenses": Stethoscope,
  "Lost Earnings": Briefcase,
  "Household Services": Home,
  "Out-of-Pocket Expenses": Wallet,
  "Property Damage": Car,
  "Other Damages": ClipboardList,
};

// One economic damage as this stage renders it. The damage record itself is
// carried on `item`, so a row can show its provenance and be acted upon.
type EcoRow = {
  label: string; desc: string; value: number; icon: typeof DollarSign;
  category: string; docCount: number; reasoning: string; docs: string[];
  item: DamageItem;
};

const toRow = (d: DamageItem): EcoRow => ({
  label: d.label, desc: d.description, value: d.amount,
  icon: DAMAGE_ICON[d.iconKey] ?? Receipt,
  category: d.category, docCount: d.docCount, reasoning: d.reasoning, docs: d.docs,
  item: d,
});

// The damages on file at load. Module-level helpers (document billing, stage
// citations) read this; the stage itself reads the live store, so an assistant
// edit is reflected the moment it is applied.
const ECONOMIC: EcoRow[] = DAMAGE_SEED.filter((d) => d.bucket === "economic").map(toRow);

// Non-economic damage categories the recommended multiplier is applied to.
// Severity tag → pill class. Mirrors the LECO status-pill palette
// (risk = red, progress = amber, neutral = teal, complete = green).
const SEVERITY_PILL: Record<string, string> = {
  Critical: "pill pill-risk",
  High: "pill pill-progress",
  Moderate: "pill pill-neutral",
  Low: "pill pill-complete",
};

// How much each factor contributes to the recommended multiplier, by severity.
// These are multiplier ranges (not dollar amounts) — the factors justify the
// multiplier, which is then applied to the verified economic damages.
const SEVERITY_MULTIPLIER: Record<string, string> = {
  Critical: "2×–3×",
  High: "1×–1.5×",
  Moderate: "0.5×–1×",
  Low: "0.25×–0.5×",
};

// Opposing-argument strength → pill. A strong defense argument is a risk to us.
const DEFENSE_PILL: Record<string, string> = {
  Strong: "pill pill-risk",
  Moderate: "pill pill-progress",
  Weak: "pill pill-complete",
};

// Format a multiplier value cleanly (2 → "2×", 1.25 → "1.25×").
function fmtMult(m: number) {
  return `${Number(m.toFixed(2))}×`;
}

// Severity, the multiplier bands and the factor shape now live with the factors
// store, so the stage and the store cannot drift apart.
export type { Severity } from "../damages/FactorsContext";
export type DamageFactor = FactorItem;

// The factors the AI put on the case, as first recorded. The stage reads the
// live store; this is what module-level consumers (the demand-package builder)
// read, and what the store seeds itself from.
export const DA_DAMAGE_FACTORS: DamageFactor[] = FACTOR_SEED;

// Why LECO recommends the 9× multiplier.
const DA_STRATEGY_FACTORS = ["Clear Liability", "Severe Injuries", "Strong Supporting Evidence", "Favorable Jurisdiction"];

// Each verified damage category, the amount it contributes (matches the Economic
// Damages table above), and the supporting documents behind it. `docs` resolves
// to real evidence files for the shared Document Workspace; `docCount` is the
// full count of supporting documents on file.
export const DAMAGE_EVIDENCE = [
  {
    category: "Medical Bills", amount: 87500, docCount: 18, primary: "Hospital_Bill.pdf",
    docs: ["hospital_medical_records.pdf", "ER_Bills.pdf", "MRI_Report_2026.pdf"],
    insight: {
      summary: "The $87,500 in medical expenses is fully substantiated. Every charge traces to an itemized billing document — emergency, hospital, imaging, and physician services — and reconciles to the verified total with no duplicate or unsupported line items.",
      keyPoints: [
        "18 itemized bills reconcile to the $87,500 total.",
        "All charges fall within the post-incident treatment window.",
        "No duplicate or out-of-scope line items detected.",
      ],
    },
  },
  {
    category: "Lost Wages", amount: 43200, docCount: 6, primary: "Wage_Loss_Statement.pdf",
    docs: ["wage_loss_statement.pdf", "physical_therapy_notes.pdf"],
    insight: {
      summary: "The $43,200 lost-wages figure reflects documented income loss during treatment, corroborated by employer payroll records and the plaintiff's pre-incident earnings history.",
      keyPoints: [
        "Wage loss verified against employer payroll records.",
        "Time out of work aligns with the treatment timeline.",
        "Calculated from pre-incident average earnings.",
      ],
    },
  },
  {
    category: "Future Medical Care", amount: 18750, docCount: 9, primary: "Life_Care_Plan.pdf",
    docs: ["hospital_medical_records.pdf", "MRI_Report_2026.pdf"],
    insight: {
      summary: "The $18,750 projection for future medical care is grounded in a physician-prepared treatment plan covering ongoing management of the cervical injuries, discounted to present value.",
      keyPoints: [
        "Based on a physician-prepared life-care projection.",
        "Covers anticipated follow-up and management costs.",
        "Discounted to present value.",
      ],
    },
  },
  {
    category: "Rehabilitation", amount: 6000, docCount: 12, primary: "PT_Treatment_Notes.pdf",
    docs: ["physical_therapy_notes.pdf"],
    insight: {
      summary: "The $6,000 rehabilitation total captures the completed physical-therapy program, supported session-by-session by the treating provider's notes.",
      keyPoints: [
        "12 documented therapy sessions support the total.",
        "Charges match the prescribed rehabilitation plan.",
        "Continuous course of care with no unexplained gaps.",
      ],
    },
  },
  {
    category: "Transportation", amount: 3850, docCount: 5, primary: "Mileage_Log.pdf",
    docs: ["ER_Bills.pdf"],
    insight: {
      summary: "The $3,850 in transportation costs reflects mileage and medical-travel expenses, each tied to a documented appointment and applied at the standard reimbursement rate.",
      keyPoints: [
        "Mileage logged against verified appointment dates.",
        "Standard medical-travel reimbursement rate applied.",
        "Every trip corresponds to a treatment record.",
      ],
    },
  },
  {
    category: "Other Damages", amount: 2150, docCount: 4, primary: "Out_of_Pocket_Receipts.pdf",
    docs: ["physical_therapy_notes.pdf"],
    insight: {
      summary: "The $2,150 in other damages covers assistive devices and out-of-pocket costs, each backed by an itemized receipt and limited to incident-related purchases.",
      keyPoints: [
        "Itemized receipts support each out-of-pocket cost.",
        "Limited to incident-related purchases.",
        "No speculative or unsupported amounts.",
      ],
    },
  },
];

// Inline "Chat with AI" panel — swaps into a precedent-case drawer's body so the
// same drawer (and header) can move between the case detail view and a chat view.
function PrecedentChatPanel({ caseName, onBack }: { caseName: string; onBack: () => void }) {
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([
    { from: "ai", text: `Ask me anything about ${caseName} — similarity drivers, settlement rationale, or how to use it in your strategy.` },
  ]);
  const [input, setInput] = useState("");
  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { from: "user", text },
      { from: "ai", text: `Reviewing ${caseName} — I'll factor this into the precedent analysis for your case strategy.` },
    ]);
    setInput("");
  };
  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-deep hover:text-ink transition-colors">
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Case Details
        </button>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${m.from === "user" ? "bg-brand text-white" : "bg-tint text-ink"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-4 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask about this case..."
          className="flex-1 px-3.5 py-2.5 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors"
        />
        <button onClick={send} className="btn btn-primary px-3.5 py-2.5"><Send className="w-4 h-4" strokeWidth={1.75} /></button>
      </div>
    </>
  );
}

// Provenance for one damage. `Verified` describes the evidence; the second
// badge says how the record came to hold its current values. An AI edit changes
// the second badge and leaves the first alone.
function DamageProvenanceBadges({ item }: { item: DamageItem }) {
  const prov: DamageProvenance = item.provenance;
  const Icon = prov === "user" || prov === "user-edited" ? UserPlus : prov.startsWith("ai") ? Sparkles : Bot;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {item.verified && (
        <span className="pill pill-complete"><ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} /> Verified</span>
      )}
      <span className="pill pill-neutral" title={item.addedBy ? `${DAMAGE_PROVENANCE_LABEL[prov]} · ${item.addedBy}` : DAMAGE_PROVENANCE_LABEL[prov]}>
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {DAMAGE_PROVENANCE_LABEL[prov]}
      </span>
    </div>
  );
}

// One damage line. Collapsed it is a label and an amount; opened it explains the
// figure and offers the itemised detail drawer where there are documents to show.
// ── Settlement explainer ─────────────────────────────────────────────────────
// The total is the one figure an attorney is asked to defend, so it answers for
// itself. Hover or focus gives the one-line reason; View details opens the
// arithmetic. Every figure is passed in from the stage's own calculation — this
// component computes nothing, so it cannot disagree with the bar above it.

function SettlementExplainer({
  economic, nonEconomic, total, multiplier, itemisedNonEconomic, factors,
}: {
  economic: number;
  nonEconomic: number;
  total: number;
  multiplier: number;
  /** Non-economic damages listed as line items rather than derived from the multiplier. */
  itemisedNonEconomic: number;
  factors: string[];
}) {
  const [mode, setMode] = useState<"closed" | "hint" | "details">("closed");
  // Hover alone closes again on mouse-out; a click or a keyboard focus keeps it
  // open, so the panel is usable without a pointer.
  const [held, setHeld] = useState(false);
  // The bar sits low in the card, so upward is the natural direction — but the
  // page header is sticky, and a tall panel would slide underneath it. Open on
  // whichever side has the room and cap the panel to it, so the whole thing is
  // always reachable. 176px is the header stack this stage already
  // scroll-anchors against.
  const [pos, setPos] = useState({ drop: false, max: 420 });
  const root = useRef<HTMLDivElement>(null);

  const close = () => { setMode("closed"); setHeld(false); };

  const place = (needed: number) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return setPos({ drop: true, max: needed });
    const above = box.top - 176 - 8;
    const below = window.innerHeight - box.bottom - 16;
    const drop = above < needed && below > above;
    setPos({ drop, max: Math.max(200, Math.floor(drop ? below : above)) });
  };
  const open = (next: "hint" | "details") => {
    place(next === "details" ? 420 : 150);
    setMode(next);
  };

  useEffect(() => {
    if (mode === "closed") return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  const derived = nonEconomic - itemisedNonEconomic;

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={mode !== "closed"}
        aria-label={`Total estimated settlement ${formatUSD(total)}. How this is calculated.`}
        onMouseEnter={() => { if (mode === "closed") open("hint"); }}
        onMouseLeave={() => { if (mode === "hint" && !held) setMode("closed"); }}
        onFocus={() => { if (mode === "closed") { open("hint"); setHeld(true); } }}
        // Clicking never dismisses a hint the pointer just opened — it pins it,
        // so hovering and then clicking the figure does not close it in the
        // attorney's face. Only a click on an already-pinned popover shuts it.
        onClick={() => {
          if (mode === "closed") { open("hint"); setHeld(true); return; }
          if (!held) { setHeld(true); return; }
          close();
        }}
        className="flex items-center gap-1.5 rounded-lg px-1.5 -mx-1.5 py-0.5 text-white font-bold tabular-nums hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand transition-colors"
        style={{ fontSize: "24px", lineHeight: 1.1, letterSpacing: "-0.01em" }}
      >
        {formatUSD(total)}
        <Info className="w-4 h-4 text-soft shrink-0" strokeWidth={1.75} />
      </button>

      {/* Opens upward: the bar sits at the foot of the card, so downward would
          push the panel off the fold. */}
      {mode === "hint" && (
        <div className={`absolute right-0 ${pos.drop ? "top-full mt-2" : "bottom-full mb-2"} z-40 w-[280px] rounded-xl border border-line bg-white shadow-lg p-3.5 text-left`}>
          <p className="text-sm font-semibold text-ink">How is this settlement value calculated?</p>
          <p className="secondary-text mt-1 leading-relaxed">
            Verified economic damages plus the estimated non-economic damages, using the recommended multiplier.
          </p>
          <button
            onClick={() => { open("details"); setHeld(true); }}
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-deep hover:text-ink transition-colors"
          >
            View details <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {mode === "details" && (
        <div
          style={{ maxHeight: pos.max }}
          className={`absolute right-0 ${pos.drop ? "top-full mt-2" : "bottom-full mb-2"} z-40 w-[400px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-line bg-white shadow-lg text-left`}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
            <span className="eyebrow">Settlement Calculation</span>
            <button onClick={close} title="Close" className="p-0.5 -mr-1 -mt-0.5 rounded hover:bg-tint transition-colors shrink-0">
              <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>

          {/* The arithmetic, in the order it is worked out. */}
          <div className="px-4">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="body-text">Economic Damages</span>
              <span className="text-sm font-medium text-ink tabular-nums shrink-0">{formatUSD(economic)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="body-text">Non-Economic Damages</span>
              <span className="text-sm font-medium text-ink tabular-nums shrink-0">{formatUSD(nonEconomic)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-2.5 mt-1 border-t-2 border-line">
              <span className="text-sm font-semibold text-ink">Total Estimated Settlement</span>
              <span className="text-base font-bold text-ink tabular-nums shrink-0">{formatUSD(total)}</span>
            </div>
          </div>

          {/* Where the non-economic figure comes from — the step the attorney is
              most likely to be asked about. */}
          <div className="mx-4 mt-3.5 rounded-xl bg-tint border border-[#D6F2F7] px-3.5 py-3">
            <div className="eyebrow mb-1.5">Non-Economic Damages</div>
            <div className="mono-ref text-ink">
              {formatUSD(economic)} <span className="text-deep">×</span> {fmtMult(multiplier)} multiplier
            </div>
            <div className="mono-ref text-ink font-semibold mt-0.5">= {formatUSD(derived)}</div>
            {itemisedNonEconomic > 0 && (
              <div className="mono-ref text-ink mt-1 pt-1 border-t border-[#D6F2F7]">
                <span className="text-deep">+</span> {formatUSD(itemisedNonEconomic)} itemised
                <span className="font-semibold"> = {formatUSD(nonEconomic)}</span>
              </div>
            )}
          </div>

          <div className="px-4 pt-3.5 pb-4">
            <div className="eyebrow mb-1.5">Why this value?</div>
            <p className="secondary-text leading-relaxed">
              Based on the current case assessment, the estimate considers the documented severity of
              injuries, permanent impairment, and supporting liability evidence.
            </p>
            {factors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {factors.map((f) => (
                  <span key={f} className="pill pill-neutral">
                    <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attorney editing ─────────────────────────────────────────────────────────
// One Edit icon per row is the whole entry point, and the form replaces the row
// in place rather than opening over the page. Moving a damage, deleting it and
// reading its history live inside that form, so the computation view stays a
// list of figures. All four actions go through the shared damage operations, so
// the trail, the provenance and the totals behave identically however a change
// was made.

// The editable shape of a damage. Only the fields the record actually holds —
// there is no second model behind the form.
export interface DamageDraft {
  label: string;
  category: string;
  amount: string;
  description: string;
  reasoning: string;
  notes: string;
  docs: string;
  /** The economic category the damage is filed under. Whether it is economic
   *  or non-economic at all is a separate thing, and not edited here. */
  group: EconomicCategory;
  /** The subcategory within `group`; empty for a damage kept at category level. */
  subcategory: string;
}

export const draftOf = (d: DamageItem): DamageDraft => ({
  label: d.label,
  category: d.category,
  amount: String(d.amount),
  description: d.description,
  reasoning: d.reasoning,
  notes: d.notes ?? "",
  docs: d.docs.join(", "),
  group: d.group,
  subcategory: d.subcategory ?? "",
});

export const blankDraft = (group: EconomicCategory = "Other Damages", subcategory = ""): DamageDraft => ({
  label: "", category: "", amount: "", description: "", reasoning: "", notes: "", docs: "", group, subcategory,
});

export const parseDocs = (s: string) => s.split(",").map((d) => d.trim()).filter(Boolean);
export const parseMoney = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^0-9.]/g, "")) || 0));
/** Why an amount as typed is not a valid figure, or null. */
export const amountError = (s: string): string | null => {
  const t = s.trim().replace(/^\$/, "");
  if (!t) return "Enter an amount.";
  if (t.startsWith("-")) return "The amount cannot be negative.";
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(t)) return "Enter the amount as a number, e.g. 12,500.";
  return null;
};

// A labelled field in the damage form.
function Field({
  label, value, onChange, multiline = false, hint, prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  hint?: string;
  prefix?: string;
}) {
  const cls = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors";
  return (
    <div>
      <label className="eyebrow block mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y`} />
      ) : (
        <div className="relative">
          {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[#8A98A3]">{prefix}</span>}
          <input value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} ${prefix ? "pl-6 tabular-nums" : ""}`} />
        </div>
      )}
      {hint && <p className="text-[11px] text-[#8A98A3] mt-1">{hint}</p>}
    </div>
  );
}

// ── The damage-factor form ───────────────────────────────────────────────────
// One shape for editing a factor and for creating one, so the two forms cannot
// come apart. The multiplier itself is held separately, because the drawer's
// existing preset buttons and settlement preview already drive it.

export interface FactorDraft {
  name: string;
  description: string;
  severity: Severity;
  rangeLow: string;
  rangeHigh: string;
}

export const draftOfFactor = (f: FactorItem): FactorDraft => ({
  name: f.category,
  description: f.rationale,
  severity: f.severity,
  rangeLow: String(f.range[0]),
  rangeHigh: String(f.range[1]),
});

// A new factor starts on the Moderate band, which is what its severity implies.
export const blankFactorDraft = (): FactorDraft => ({
  name: "",
  description: "",
  severity: "Moderate",
  rangeLow: String(SEVERITY_RANGE.Moderate[0]),
  rangeHigh: String(SEVERITY_RANGE.Moderate[1]),
});

// The band as entered, kept the right way round and never negative.
export const draftRange = (d: FactorDraft): [number, number] => {
  const lo = Math.max(0, Number(d.rangeLow) || 0);
  const hi = Math.max(0, Number(d.rangeHigh) || 0);
  return lo <= hi ? [lo, hi] : [hi, lo];
};

// Severity → pill, reusing the stage's own status palette.
const FACTOR_PROVENANCE_PILL: Record<FactorProvenance, string> = {
  "ai-generated": "pill pill-neutral",
  "ai-modified": "pill pill-neutral",
  "user-created": "pill pill-progress",
  "user-modified": "pill pill-progress",
};

export function FactorProvenanceBadge({ provenance }: { provenance: FactorProvenance }) {
  const Icon = provenance.startsWith("ai") ? Sparkles : UserPlus;
  return (
    <span className={FACTOR_PROVENANCE_PILL[provenance]}>
      <Icon className="w-3 h-3" strokeWidth={1.75} /> {FACTOR_PROVENANCE_LABEL[provenance]}
    </span>
  );
}

// Removing a factor changes the multiplier, so it is always confirmed.
export function DeleteFactorDialog({
  factor, impact, onCancel, onConfirm,
}: { factor: FactorItem; impact: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[80]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[440px] max-w-[92vw] rounded-2xl border border-line bg-white shadow-xl p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" strokeWidth={1.75} />
          <h3 className="card-title">Delete Damage Factor?</h3>
        </div>
        <p className="body-text leading-relaxed">
          Are you sure you want to remove &ldquo;<span className="font-semibold">{factor.category}</span>&rdquo;?
        </p>
        <p className="secondary-text leading-relaxed mt-2">
          Removing this factor will lower the recommended multiplier by {fmtMult(factor.multiplier)} and reduce
          the estimated non-economic damages. {impact}
        </p>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#B42318] hover:bg-[#96200F] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete Factor
          </button>
        </div>
      </div>
    </>
  );
}

// One factor's change history, in the drawer pattern the stage already uses.
export function FactorHistoryDrawer({
  factor, entries, onClose,
}: { factor: FactorItem; entries: { id: string; action: string; previous?: string; next?: string; changedBy: string; at: string; reason?: string }[]; onClose: () => void }) {
  const newestFirst = [...entries].reverse();
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[440px] max-w-[92vw] bg-white shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Damage Factor History</div>
            <h2 className="card-title">{factor.category}</h2>
            <div className="mono-ref mt-1">{fmtMult(factor.multiplier)} · {factor.severity}</div>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {newestFirst.length === 0 ? (
            <p className="secondary-text">
              No changes recorded. This factor is as the AI first assessed it.
            </p>
          ) : (
            <div className="relative">
              {newestFirst.map((e, i) => (
                <div key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-brand mt-1.5" />
                    {i < newestFirst.length - 1 && <div className="w-px flex-1 bg-line mt-1.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">
                        {FACTOR_ACTION_LABEL[e.action as keyof typeof FACTOR_ACTION_LABEL] ?? e.action}
                      </span>
                      <span className="mono-ref">{e.at}</span>
                    </div>
                    <p className="text-xs text-[#8A98A3] mt-0.5">{e.changedBy}</p>
                    {(e.previous || e.next) && (
                      <div className="rounded-xl border border-line mt-2 px-3.5 py-2">
                        <div className="flex items-center gap-2 flex-wrap body-text">
                          {e.previous && <span className="text-[#5B6B78]">{e.previous}</span>}
                          {e.previous && e.next && <ArrowRight className="w-3.5 h-3.5 text-[#8A98A3] shrink-0" strokeWidth={1.75} />}
                          {e.next && <span className="font-semibold text-ink">{e.next}</span>}
                        </div>
                      </div>
                    )}
                    {e.reason && (
                      <div className="rounded-xl border border-line mt-2 px-3.5 py-2">
                        <div className="eyebrow mb-0.5">Reason</div>
                        <p className="body-text leading-relaxed">{e.reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// The damage form, used for both editing an existing damage and adding a new
// one. Same fields either way, so the two never drift apart. Editing an existing
// damage also offers its history and its deletion — secondary actions that would
// clutter the row but belong here.
export function DamageForm({
  title, draft, setDraft, onCancel, onSave, saveLabel, lockBucket = false, onDelete, onHistory, bucket = "economic",
}: {
  title: string;
  /** Non-economic damages are not filed under the economic categories, so the
   *  form leaves those fields out for them. */
  bucket?: DamageBucket;
  draft: DamageDraft;
  setDraft: (d: DamageDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  lockBucket?: boolean;
  /** Editing an existing damage only — absent when adding a new one. */
  onDelete?: () => void;
  onHistory?: () => void;
}) {
  const set = (k: keyof DamageDraft) => (v: string) => setDraft({ ...draft, [k]: v });
  // Problems are shown once the attorney tries to save, not while they type.
  const [tried, setTried] = useState(false);
  const errors = [
    !draft.label.trim() && "Enter the damage name.",
    amountError(draft.amount),
  ].filter(Boolean) as string[];
  const save = () => { setTried(true); if (errors.length === 0) onSave(); };
  return (
    <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Pencil className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
        <span className="eyebrow text-deep">{title}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Where the damage is filed, then how much, then what it is */}
        {bucket === "economic" && (<>
        <div>
          <label className="eyebrow block mb-1">Category</label>
          <select
            value={draft.group}
            disabled={lockBucket}
            // A subcategory belongs to its category, so changing the category
            // clears it rather than leaving one that no longer fits.
            onChange={(e) => setDraft({ ...draft, group: e.target.value as EconomicCategory, subcategory: "" })}
            className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors disabled:text-[#8A98A3]"
          >
            {ECONOMIC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="eyebrow block mb-1">Subcategory</label>
          <select
            value={draft.subcategory}
            disabled={lockBucket}
            onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
            className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors disabled:text-[#8A98A3]"
          >
            <option value="">— None —</option>
            {(ECONOMIC_SUBCATEGORIES[draft.group] ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        </>)}
        <Field label="Amount" value={draft.amount} onChange={set("amount")} prefix="$" />
        <Field label="Damage" value={draft.label} onChange={set("label")} />
        <Field label="Damage Type" value={draft.category} onChange={set("category")} />
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Description" value={draft.description} onChange={set("description")} multiline />
        <Field label="Supporting Information" value={draft.reasoning} onChange={set("reasoning")} multiline />
        <Field
          label="Supporting Documents"
          value={draft.docs}
          onChange={set("docs")}
          hint="Comma-separated. Removing one here releases this damage's claim on it; the document stays on the case file."
        />
        <Field label="Notes" value={draft.notes} onChange={set("notes")} multiline />
      </div>
      {tried && errors.length > 0 && (
        <div role="alert" className="mt-3 text-xs text-[#B42318] space-y-0.5">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <div className="flex items-center gap-3">
          {onHistory && (
            <button onClick={onHistory} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
              <History className="w-3.5 h-3.5" strokeWidth={1.75} /> History
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318] hover:text-[#96200F] transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete damage
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button onClick={save} className="btn btn-primary px-3 py-2 text-sm">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Deleting is destructive, so it is always confirmed and always says what goes.
export function DeleteDamageDialog({
  item, onCancel, onConfirm,
}: { item: DamageItem; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[80]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[420px] max-w-[92vw] rounded-2xl border border-line bg-white shadow-xl p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" strokeWidth={1.75} />
          <h3 className="card-title">Delete this damage?</h3>
        </div>
        <div className="rounded-xl border border-[#F5C9C4] bg-[#FEF4F3] px-3.5 py-3 flex items-center justify-between gap-3">
          <span className="body-text font-medium">{item.label}</span>
          <span className="text-sm font-bold text-ink tabular-nums shrink-0">{formatUSD(item.amount)}</span>
        </div>
        <p className="secondary-text mt-2.5">
          This will remove this damage from the case calculation. Its supporting documents stay on the case file.
        </p>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#B42318] hover:bg-[#96200F] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete
          </button>
        </div>
      </div>
    </>
  );
}

// The change history for one damage — every action, who made it and when.
export function DamageHistoryDrawer({
  item, entries, onClose,
}: { item: DamageItem; entries: DamageAudit[]; onClose: () => void }) {
  const newestFirst = [...entries].reverse();
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Damage History</div>
            <h2 className="card-title">{item.label}</h2>
            <div className="mono-ref mt-1">{formatUSD(item.amount)} · {BUCKET_LABEL[item.bucket]}</div>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {newestFirst.length === 0 ? (
            <p className="secondary-text">
              No changes recorded. This damage is as it was first put on the case file.
            </p>
          ) : (
            <div className="relative">
              {newestFirst.map((e, i) => (
                <div key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-brand mt-1.5" />
                    {i < newestFirst.length - 1 && <div className="w-px flex-1 bg-line mt-1.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">
                        {e.changedBy} {DAMAGE_ACTION_LABEL[e.action]}
                      </span>
                      <span className="mono-ref">{e.at}</span>
                    </div>
                    {e.requestedBy && (
                      <p className="text-xs text-[#8A98A3] mt-0.5">Requested by {e.requestedBy}</p>
                    )}
                    <div className="rounded-xl border border-line divide-y divide-line mt-2">
                      {e.field && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">{e.field}</div>
                          <div className="flex items-center gap-2 flex-wrap body-text">
                            <span className="text-[#5B6B78]">{e.previous || "—"}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#8A98A3] shrink-0" strokeWidth={1.75} />
                            <span className="font-semibold text-ink">{e.next || "—"}</span>
                          </div>
                        </div>
                      )}
                      {e.action === "moved" && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Bucket</div>
                          <div className="flex items-center gap-2 flex-wrap body-text">
                            <span className="text-[#5B6B78]">{e.from}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#8A98A3] shrink-0" strokeWidth={1.75} />
                            <span className="font-semibold text-ink">{e.to}</span>
                          </div>
                        </div>
                      )}
                      {e.action === "created" && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Created</div>
                          <p className="body-text">{e.next} in {e.to}</p>
                        </div>
                      )}
                      {e.action === "deleted" && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Deleted</div>
                          <p className="body-text">{e.amount} removed from {e.from}</p>
                        </div>
                      )}
                      {e.reason && (
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Reason</div>
                          <p className="body-text leading-relaxed">{e.reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DamageRow({
  row, open, onToggle, onDetails, editing, onEdit, onCancelEdit, onSave, onHistory, onDelete, title, compact = false,
}: {
  row: EcoRow;
  /** The name the row shows, when it stands for its subcategory rather than
   *  under its own label. */
  title?: string;
  /** The lighter subcategory style: no icon, smaller text, no extra indent. */
  compact?: boolean;
  open: boolean;
  onToggle: () => void;
  onDetails: () => void;
  /** Editing controls are absent outside the provider, leaving the row read-only. */
  editing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSave?: (draft: DamageDraft) => void;
  onHistory?: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<DamageDraft>(() => draftOf(row.item));
  // Re-seed the form each time this row is opened for editing, so it always
  // starts from what is on the record rather than a stale draft.
  useEffect(() => { if (editing) setDraft(draftOf(row.item)); }, [editing, row.item]);

  const changed = row.item.provenance !== "system";
  const editable = !!onEdit;
  const hasDocs = row.docCount > 0 && row.docs.length > 0;

  if (editing && onSave && onCancelEdit) {
    return (
      <div className="py-2.5">
        <DamageForm
          bucket={row.item.bucket}
          title={`Edit ${row.label}`}
          draft={draft}
          setDraft={setDraft}
          onCancel={onCancelEdit}
          onSave={() => onSave(draft)}
          saveLabel="Save Changes"
          onDelete={onDelete}
          onHistory={onHistory}
        />
      </div>
    );
  }

  return (
    <div className={compact ? "py-2" : "py-2.5"}>
      <div className="flex items-center justify-between gap-3">
        <button onClick={onToggle} aria-expanded={open} className={`flex items-center text-left min-w-0 ${compact ? "gap-1.5" : "gap-3"}`}>
          {!compact && (
            <div className="w-8 h-8 rounded-lg bg-tint flex items-center justify-center shrink-0">
              <row.icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
            </div>
          )}
          <span className={compact ? "text-sm text-ink truncate" : "body-text truncate"}>{title ?? row.label}</span>
          {changed && (
            <span className="pill pill-neutral shrink-0">
              {row.item.provenance.startsWith("ai")
                ? <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                : <UserPlus className="w-3 h-3" strokeWidth={1.75} />}
              {DAMAGE_PROVENANCE_LABEL[row.item.provenance]}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-medium text-ink tabular-nums">{formatUSD(row.value)}</span>
          {editable && (
            <button
              onClick={onEdit}
              title="Edit damage"
              aria-label={`Edit ${row.label}`}
              className="p-1.5 rounded-lg text-[#8A98A3] hover:bg-tint hover:text-deep transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className={`mt-2.5 rounded-xl border border-line bg-white p-3.5 ${compact ? "" : "ml-11"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="secondary-text">{row.reasoning}</p>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[#5B6B78]">
                <FileText className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                {hasDocs
                  ? `We considered ${row.docs[0]} and ${row.docCount - 1}+ more documents.`
                  : "No supporting documents are attached yet."}
              </div>
              {row.item.notes && <p className="secondary-text mt-1.5">Note: {row.item.notes}</p>}
            </div>
            {hasDocs && (
              <button onClick={onDetails} className="shrink-0 text-sm font-semibold text-deep hover:text-ink transition-colors whitespace-nowrap">
                View details →
              </button>
            )}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-line flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-[#5B6B78]">{row.desc}</span>
            <DamageProvenanceBadges item={row.item} />
          </div>
        </div>
      )}
    </div>
  );
}

// The change history for the whole damage record — every create, edit, move and
// delete, whoever made it, newest first. Per-damage history lives on the row's
// own menu; this is the stage-wide view.
function DamageEditHistory({ audit }: { audit: DamageAudit[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
          <History className="w-3.5 h-3.5" strokeWidth={1.75} /> {open ? "Hide" : "View"} Damage Change History
        </button>
        <span className="text-xs text-[#8A98A3]">
          {audit.length === 0 ? "No changes yet" : `${audit.length} change${audit.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {audit.length === 0 ? (
            <p className="secondary-text">
              No damage has been changed yet. Every figure here is as it was first recorded.
            </p>
          ) : (
            [...audit].reverse().map((e) => {
              const Icon = e.action === "deleted" ? Trash2 : e.action === "created" ? Plus : e.action === "moved" ? ArrowRight : Pencil;
              return (
                <div key={e.id} className="rounded-lg border border-line bg-offwhite p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="pill pill-neutral"><Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {DAMAGE_ACTION_LABEL[e.action]}</span>
                    <span className="text-sm font-semibold text-ink">{e.damage}</span>
                    <span className="mono-ref">{e.at}</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-[#5B6B78]">
                    {e.field && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{e.field}:</span>
                        <span className="tabular-nums">{e.previous}</span>
                        <ArrowRight className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span className="font-semibold text-ink tabular-nums">{e.next}</span>
                      </div>
                    )}
                    {e.action === "moved" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{e.from}</span>
                        <ArrowRight className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span className="font-semibold text-ink">{e.to}</span>
                      </div>
                    )}
                    {e.action === "created" && <div>Added to {e.to} at <span className="font-semibold text-ink tabular-nums">{e.next}</span></div>}
                    {e.action === "deleted" && <div>Removed from {e.from} · <span className="font-semibold text-ink tabular-nums">{e.amount}</span></div>}
                    <div>Changed by {e.changedBy}{e.requestedBy ? ` · Requested by ${e.requestedBy}` : ""}</div>
                    <div className="italic">&ldquo;{e.reason}&rdquo;</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Two-panel stage workspace ────────────────────────────────────────────────
// The height a stage's two-panel workspace should take on desktop: whatever is
// left beneath the case header when the page is at the top, so a static panel
// on one side stays in view while the other side scrolls on its own. The page
// scrolls inside <main>, not the window, so that is what gets measured. Below
// the desktop breakpoint it returns null and the stage stacks normally.
function useWorkspacePanelHeight(ref: React.RefObject<HTMLElement>, minHeight: number): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = (el.closest("main") as HTMLElement | null) ?? document.documentElement;
    const wide = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      if (!wide.matches) { setHeight(null); return; }
      // Where the workspace starts within the page, independent of how far
      // the page happens to be scrolled right now.
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setHeight(Math.max(scroller.clientHeight - top - 24, minHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    wide.addEventListener("change", measure);
    return () => { ro.disconnect(); wide.removeEventListener("change", measure); };
  }, [ref, minHeight]);
  return height;
}

export function EconomicDamagesTab({ model, documents, goTo, goToValuation }: TabProps) {
  // The damage record, live. The assistant writes to the same store, so an
  // applied change lands here without the attorney navigating anywhere.
  const damages = useDamagesOptional();
  const economicRows: EcoRow[] = damages ? damages.itemsIn("economic").map(toRow) : ECONOMIC;
  const nonEconomicRows: EcoRow[] = damages ? damages.itemsIn("noneconomic").map(toRow) : [];
  const damageAudit = damages?.audit ?? [];
  const subtotal = economicRows.reduce((s, e) => s + e.value, 0);
  const nonEconomicItemsTotal = nonEconomicRows.reduce((s, e) => s + e.value, 0);

  // Economic damages sit under the six main categories, each with its fixed
  // subcategories. Every category is always listed, with or without figures, so
  // the attorney sees the whole taxonomy. A damage whose category is not one of
  // the six (an older record) is shown under Other Damages rather than lost.
  const categoryOf = (item: DamageItem): EconomicCategory => (isEconomicCategory(item.group) ? item.group : "Other Damages");
  const economicGroups = ECONOMIC_CATEGORIES.map((category) => {
    const subcategories = ECONOMIC_SUBCATEGORIES[category];
    const rows = economicRows.filter((e) => categoryOf(e.item) === category);
    return {
      category,
      subcategories: subcategories.map((sub) => {
        const subRows = rows.filter((e) => e.item.subcategory === sub);
        return { name: sub, rows: subRows, total: subRows.reduce((s, e) => s + e.value, 0) };
      }),
      // Damages filed under the category but no one subcategory — kept at
      // category level rather than guessed into one.
      categoryLevel: rows.filter((e) => !e.item.subcategory || !subcategories.includes(e.item.subcategory)),
      rows,
      total: rows.reduce((s, e) => s + e.value, 0),
    };
  });

  // ── Attorney editing ─────────────────────────────────────────────────────
  // Which row is in edit mode, which is pending deletion, whose history is
  // open, and whether the add form is showing. Every handler below goes through
  // the shared damage operations — this component holds no calculation or
  // provenance logic of its own.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<DamageBucket | null>(null);
  const [addDraft, setAddDraft] = useState<DamageDraft>(blankDraft());
  const actor = attorneyActor(CURRENT_USER);
  const deleting = damages?.items.find((i) => i.id === deletingId) ?? null;
  const historyItem = damages?.items.find((i) => i.id === historyId) ?? null;

  // Only what the attorney actually changed is written, and only what changed
  // is recorded — a saved form with one edited field leaves one history entry.
  const saveEdit = (item: DamageItem, draft: DamageDraft) => {
    if (!damages) return;
    const next: Partial<DamageItem> = {
      label: draft.label.trim() || item.label,
      category: draft.category.trim(),
      amount: parseMoney(draft.amount),
      description: draft.description,
      reasoning: draft.reasoning,
      notes: draft.notes.trim() || undefined,
      docs: parseDocs(draft.docs),
    };
    const changes: FieldChange[] = [];
    const note = (field: string, previous: string, nextValue: string) => {
      if (previous !== nextValue) changes.push({ field, previous: previous || "—", next: nextValue || "—" });
    };
    note("Damage", item.label, next.label!);
    note(DAMAGE_FIELD_LABEL.category, item.category, next.category!);
    note(DAMAGE_FIELD_LABEL.amount, formatDamageUSD(item.amount), formatDamageUSD(next.amount!));
    note(DAMAGE_FIELD_LABEL.description, item.description, next.description!);
    note(DAMAGE_FIELD_LABEL.reasoning, item.reasoning, next.reasoning!);
    note(DAMAGE_FIELD_LABEL.notes, item.notes ?? "", next.notes ?? "");
    note(DAMAGE_FIELD_LABEL.docs, item.docs.join(", "), next.docs!.join(", "));
    // Re-filing a damage under another category is a change to the record like
    // any other, so it is diffed and recorded here rather than specially.
    if (item.bucket === "economic") {
      next.group = draft.group;
      next.subcategory = draft.subcategory || undefined;
      note(DAMAGE_FIELD_LABEL.group, item.group, draft.group);
      note("Subcategory", item.subcategory ?? "", draft.subcategory);
    }

    // A damage that now cites a different set of documents should say so in its
    // count, but never below the number it actually lists.
    if (next.docs!.length !== item.docs.length) {
      next.docCount = Math.max(item.docCount - item.docs.length, 0) + next.docs!.length;
    }

    if (changes.length > 0) {
      damages.updateDamage(item.id, next, changes, actor, "Edited by attorney on the Damages Analysis stage.");
    }
    setEditingId(null);
  };

  const addDamage = (draft: DamageDraft) => {
    if (!damages) return;
    const docs = parseDocs(draft.docs);
    damages.createDamage(
      {
        id: `damage-${Math.round(performance.now())}-${Math.random().toString(36).slice(2, 6)}`,
        label: draft.label.trim(),
        // The add form is opened against a bucket; within Economic Damages the
        // form's own category decides which heading it files under.
        bucket: addingTo ?? "economic",
        group: draft.group,
        subcategory: draft.subcategory || undefined,
        amount: parseMoney(draft.amount),
        description: draft.description,
        category: draft.category.trim() || draft.label.trim(),
        reasoning: draft.reasoning,
        notes: draft.notes.trim() || undefined,
        docs,
        docCount: docs.length,
        iconKey: "receipt",
        // Added by hand and not yet reconciled against the evidence — authorship
        // and verification are recorded separately.
        verified: false,
      },
      actor,
      "Added by attorney on the Damages Analysis stage.",
    );
    setAddingTo(null);
    setAddAt(null);
  };

  // Where the economic add form opens: at the top of the list (from the header's
  // Add Damage), or inside one subcategory with that category and subcategory
  // already chosen (from an empty subcategory's edit action).
  const [addAt, setAddAt] = useState<string | null>(null);
  const openAdd = (bucket: DamageBucket, group?: EconomicCategory, subcategory?: string) => {
    setAddDraft(blankDraft(group, subcategory));
    setEditingId(null);
    setAddingTo(bucket);
    setAddAt(group && subcategory ? `${group}::${subcategory}` : null);
    if (group) setOpenCats((prev) => new Set(prev).add(group));
  };
  const cancelAdd = () => { setAddingTo(null); setAddAt(null); };

  // Which main categories are open. Medical & Care Expenses — the first and
  // most detailed — starts open; the rest start closed so the list stays short.
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(["Medical & Care Expenses"]));
  const toggleCat = (c: string) =>
    setOpenCats((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  // Which subcategories have their damages showing, keyed "category::subcategory".
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const toggleSub = (k: string) =>
    setOpenSubs((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Handlers a damage row needs, or undefined outside the provider — which is
  // what leaves the row read-only rather than half-editable.
  const rowActions = (item: DamageItem) => (damages ? {
    editing: editingId === item.id,
    onEdit: () => { setAddingTo(null); setEditingId(item.id); },
    onCancelEdit: () => setEditingId(null),
    onSave: (draft: DamageDraft) => saveEdit(item, draft),
    onHistory: () => setHistoryId(item.id),
    onDelete: () => setDeletingId(item.id),
  } : {});

  // Shared Document Workspace (reused from Analysis/Overview). Each damage
  // category contributes a set of supporting documents; "View Evidence" opens
  // the existing Document Preview experience.
  // Damage Computation tabs (Economic · Non-Economic) — Total stays below both.
  const [compTab, setCompTab] = useState<"economic" | "noneconomic">("economic");
  // Damage Factors accordion — collapsed by default.
  const [damageFactorsOpen, setDamageFactorsOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsIndex, setWsIndex] = useState(0);
  const [wsView, setWsView] = useState<"preview" | "insights">("preview");
  const docForFile = buildDocResolver(documents);

  // ── Damage-factor review workspace: per-factor multiplier (attorney-editable),
  // override history, edit drawer, and expandable detail/defence sections. ──
  // The factors, live. Editing, adding and removing one all go through the
  // store, which is also what the recommended multiplier is summed from.
  const factorsStore = useFactorsOptional();
  const factors: FactorItem[] = factorsStore?.factors ?? FACTOR_SEED;
  const factorActor = attorneyFactorActor(CURRENT_USER);

  // Editing happens inline inside the View Details drawer.
  const [editMode, setEditMode] = useState(false);
  const [draftMult, setDraftMult] = useState(0);
  const [draftNote, setDraftNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // When an override was last made, per factor (e.g. "Today • 3:42 PM").
  // When a factor was last changed, read off its own trail rather than tracked
  // separately — one source, so the two can never disagree.
  const lastChangedAt = (id: string) => {
    const trail = factorsStore?.historyFor(id) ?? [];
    return trail.length > 0 ? trail[trail.length - 1].at : undefined;
  };
  // "View Details" drawer for a damage factor.
  const [detailFactor, setDetailFactor] = useState<string | null>(null);
  const [detailDocsOpen, setDetailDocsOpen] = useState(false);
  // The whole Supporting Documents block, collapsed until asked for.
  const [detailDocsSectionOpen, setDetailDocsSectionOpen] = useState(false);
  const [detailChatOpen, setDetailChatOpen] = useState(false);
  // Precedent case detail drawer from the Intelligence cards.
  const [selectedPrecedent, setSelectedPrecedent] = useState<(typeof COMPARABLE_VERDICTS)[number] | null>(null);
  const [precedentReasoningOpen, setPrecedentReasoningOpen] = useState(true);
  const [precedentSuggestionOpen, setPrecedentSuggestionOpen] = useState(false);
  // Factor-evidence Preview / Insights workspace.
  const [factorWsCat, setFactorWsCat] = useState<string | null>(null);
  const [factorWsView, setFactorWsView] = useState<"preview" | "insights">("preview");
  const [factorWsFocus, setFactorWsFocus] = useState<string | null>(null);
  const openFactorWs = (cat: string, view: "preview" | "insights") => { setFactorWsCat(cat); setFactorWsView(view); setFactorWsFocus(null); };
  const openFactorDoc = (cat: string, docName: string) => { setFactorWsCat(cat); setFactorWsView("preview"); setFactorWsFocus(docName); };
  // Factors are addressed by id, so a rename never loses the thread. The
  // evidence workspace below is keyed by name, so it gets its own lookup.
  const factorById = (id: string) => factors.find((f) => f.id === id);
  const factorByCat = (cat: string) => factors.find((f) => f.category === cat) ?? factors[0];
  const currentMult = (id: string) => factorById(id)?.multiplier ?? 0;

  // Live recalculation — the overall multiplier is the sum of factor
  // contributions, applied to the economic damages actually on file. Every
  // dependent figure below derives from these two, so nothing goes stale when a
  // damage is edited, added, moved or deleted.
  const economicTotal = subtotal;
  const aiOverall = factors.reduce((s, f) => s + f.aiMultiplier, 0);
  const overallMult = factors.reduce((s, f) => s + f.multiplier, 0);
  // Itemised non-economic damages sit alongside the multiplier-derived figure.
  const nonEconomicTotal = Math.round(economicTotal * overallMult) + nonEconomicItemsTotal;
  const recommendedSettlement = economicTotal + nonEconomicTotal;
  const aiRecommendedSettlement = economicTotal + Math.round(economicTotal * aiOverall) + nonEconomicItemsTotal;
  const settlementForOverall = (m: number) => economicTotal + Math.round(economicTotal * m) + nonEconomicItemsTotal;
  const hasOverride = (id: string) => {
    const f = factorById(id);
    return !!f && f.multiplier !== f.aiMultiplier;
  };
  const anyOverride = factors.some((f) => f.multiplier !== f.aiMultiplier);

  // The whole factor, as the form holds it. The same shape serves editing an
  // existing factor and creating a new one, so the two cannot drift apart.
  const [factorDraft, setFactorDraft] = useState<FactorDraft>(() => blankFactorDraft());
  const [creatingFactor, setCreatingFactor] = useState(false);
  const [deletingFactorId, setDeletingFactorId] = useState<string | null>(null);
  const [factorHistoryId, setFactorHistoryId] = useState<string | null>(null);
  const deletingFactor = factors.find((f) => f.id === deletingFactorId) ?? null;
  const factorHistoryItem = factors.find((f) => f.id === factorHistoryId) ?? null;

  // Open the reasoning drawer (read mode) — understanding, not changing.
  const openDetail = (id: string) => {
    setDetailFactor(id); setEditMode(false); setCreatingFactor(false);
    setDraftMult(currentMult(id)); setDraftNote("");
    setDetailDocsOpen(false); setDetailChatOpen(false);
  };
  // Open the drawer straight into edit mode (from a card's Edit button).
  const openEditDrawer = (id: string) => {
    const f = factorById(id);
    if (!f) return;
    setDetailFactor(id); setEditMode(true); setCreatingFactor(false);
    setFactorDraft(draftOfFactor(f));
    setDraftMult(f.multiplier); setDraftNote("");
    setDetailDocsOpen(false); setDetailChatOpen(false);
  };
  // The same drawer, in create mode.
  const openCreateFactor = () => {
    setDetailFactor(null); setCreatingFactor(true); setEditMode(true);
    setFactorDraft(blankFactorDraft());
    setDraftMult(0.5); setDraftNote("");
  };
  const startEdit = () => {
    if (!detailFactor) return;
    const f = factorById(detailFactor);
    if (!f) return;
    setFactorDraft(draftOfFactor(f));
    setDraftMult(f.multiplier); setDraftNote(""); setEditMode(true);
  };
  const cancelEdit = () => { setEditMode(false); setCreatingFactor(false); };

  // Save whatever moved. Name, description, severity, band and position are all
  // one save, and the store records each change that actually happened.
  const saveFactorEdit = () => {
    if (!factorsStore) { setEditMode(false); return; }
    const range = draftRange(factorDraft);
    if (creatingFactor) {
      const name = factorDraft.name.trim();
      if (!name) return;
      factorsStore.createFactor(
        {
          id: `factor-${Math.round(performance.now())}-${Math.random().toString(36).slice(2, 6)}`,
          category: name,
          rationale: factorDraft.description.trim(),
          severity: factorDraft.severity,
          // A factor the attorney adds carries no AI recommendation to restore
          // to, so the AI position is recorded as the one they set.
          aiMultiplier: draftMult, aiRange: range,
          multiplier: draftMult, range,
          confidence: 0,
          docCount: 0,
          drivers: [],
          aiReasoning: factorDraft.description.trim() || `${name} was added by the attorney and has no AI analysis on file yet.`,
          evidence: { strength: "Limited", primaryRecords: 0, expertOpinions: 0, witnessStatements: 0, medicalQuality: "Limited" },
          defense: { argument: "No defense analysis is on file for this factor yet.", strength: "Moderate", rebuttal: "Add supporting evidence to develop a rebuttal." },
          suggestion: { evidence: "Supporting documentation", why: "Evidence on file would let the AI assess this factor.", multiplierGain: 0 },
        },
        factorActor,
        draftNote.trim() || undefined,
      );
      setCreatingFactor(false); setEditMode(false);
      return;
    }
    if (!detailFactor) return;
    factorsStore.updateFactor(
      detailFactor,
      {
        category: factorDraft.name.trim() || undefined,
        rationale: factorDraft.description,
        severity: factorDraft.severity,
        multiplier: draftMult,
        range,
      },
      factorActor,
      draftNote.trim() || undefined,
    );
    setEditMode(false);
  };

  const restoreFactor = (id: string) => factorsStore?.restoreFactor(id, factorActor);
  // Draft-aware live preview while editing in the drawer.
  const draftOverall = detailFactor ? overallMult - currentMult(detailFactor) + draftMult : overallMult;
  const draftSettlement = settlementForOverall(draftOverall);

  // ── Economic line-item detail drawer (mirrors the Valuation page) ──
  // Which Economic Damages rows are expanded (reasoning + View details).
  const [ecoRowsOpen, setEcoRowsOpen] = useState<Set<string>>(new Set());
  const toggleEcoRow = (label: string) =>
    setEcoRowsOpen((prev) => { const n = new Set(prev); if (n.has(label)) n.delete(label); else n.add(label); return n; });
  const [drawerItem, setDrawerItem] = useState<EcoRow | null>(null);
  const [drawerDocsOpen, setDrawerDocsOpen] = useState(false);
  // Which itemized document rows are expanded (keyed by file name).
  const [expandedDocRows, setExpandedDocRows] = useState<Set<string>>(new Set());
  const toggleDocRow = (name: string) =>
    setExpandedDocRows((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const openDrawer = (item: EcoRow) => { setDrawerItem(item); setDrawerDocsOpen(false); setExpandedDocRows(new Set()); };

  // Lock background scroll while any right-side drawer is open, so the dimmed
  // backdrop always covers the full viewport regardless of scroll position.
  useEffect(() => {
    const anyDrawerOpen = !!detailFactor || creatingFactor || !!selectedPrecedent || !!drawerItem
      || !!deletingId || !!historyId || !!deletingFactorId || !!factorHistoryId;
    document.body.style.overflow = anyDrawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [detailFactor, creatingFactor, selectedPrecedent, drawerItem, deletingId, historyId, deletingFactorId, factorHistoryId]);
  // Preview/Insights workspace for the drawer's documents (separate from the
  // Verified Damage Evidence workspace below).
  const [ecoWsView, setEcoWsView] = useState<"preview" | "insights" | null>(null);
  const [ecoWsFocus, setEcoWsFocus] = useState<string | null>(null);
  const breakdown = drawerItem ? buildDocBreakdown(drawerItem) : [];
  const verifiedTotal = breakdown.reduce((a, d) => a + d.amount, 0);
  const drawerDocs = drawerItem
    ? padDocsToCount(drawerItem.docs, drawerItem.category, drawerItem.docCount).map((name) => docForFile(name))
    : [];
  const orderedDrawerDocs = ecoWsFocus
    ? [...drawerDocs.filter((d) => d.name === ecoWsFocus), ...drawerDocs.filter((d) => d.name !== ecoWsFocus)]
    : drawerDocs;
  // Each category lists a few named files plus a larger docCount. Pad the named
  // set up to docCount with realistic supporting-document names so the preview
  // shows the full set (and the "+N more docs" menu appears for large sets).
  const evidenceDocSets = DAMAGE_EVIDENCE.map((d) => padDocsToCount([d.primary, ...d.docs], d.category, d.docCount).map(docForFile));
  const evidenceContexts = DAMAGE_EVIDENCE.map((d) => ({ contextType: "Damage Category", reference: d.category }));
  // Amount-focused AI Insights — explains *why* each damage figure is what it is.
  const evidenceInsights = DAMAGE_EVIDENCE.map((d) => ({
    summary: d.insight.summary,
    keyPoints: d.insight.keyPoints,
    entities: [
      { label: "Category", value: d.category },
      { label: "Verified Amount", value: formatUSD(d.amount) },
    ],
    supportingDocs: [d.primary, ...d.docs],
    confidence: { level: "High", score: 96 },
  }));
  // Document Context Panel data for the preview rail (per damage category).
  const evidencePanels = DAMAGE_EVIDENCE.map((d) => ({
    summary: [
      { label: "Category", value: d.category },
      { label: "Verified Amount", value: formatUSD(d.amount) },
      { label: "Supporting Documents", value: String(d.docCount) },
    ],
  }));
  const openEvidence = (i: number, view: "preview" | "insights" = "preview") => { setWsIndex(i); setWsView(view); setWsOpen(true); };

  // Which evidence cards have their Evidence dropdown expanded (by index).
  const [evidenceExpand, setEvidenceExpand] = useState<Set<number>>(new Set());
  const toggleEvidenceExpand = (i: number) =>
    setEvidenceExpand((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  // Verified Damage Evidence tabs (Economic · Non-Economic) + non-economic expand.
  const [evidenceTab, setEvidenceTab] = useState<"economic" | "noneconomic">("economic");
  const [neEvidenceExpand, setNeEvidenceExpand] = useState<Set<string>>(new Set());
  const toggleNeEvidence = (cat: string) =>
    setNeEvidenceExpand((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  // Sidebar: count of verified damage-evidence documents on file.
  const evidenceDocTotal = 42;

  // Quick-action targets — each sidebar card scrolls to its section on the right.
  const economicRef = useRef<HTMLDivElement>(null);
  const nonEconomicRef = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  // Two-panel workspace on desktop: Quick Actions stays put on the left while
  // the damage sections scroll on the right. The floor is what the Quick
  // Actions card needs to show everything it holds.
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const panelHeight = useWorkspacePanelHeight(workspaceRef, 520);

  // Jump to a section. In the two-panel workspace only the sections pane moves
  // — scrollIntoView would also scroll the page and carry Quick Actions away.
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    const el = ref.current;
    const pane = sectionsRef.current;
    if (!el) return;
    if (panelHeight && pane) {
      const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      pane.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
    <div
      ref={workspaceRef}
      className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8 items-start lg:items-stretch"
      style={panelHeight ? { height: panelHeight } : undefined}
    >

      {/* LEFT — Quick Actions, static while the damage sections scroll. The
          card fills the panel height, which keeps Estimated Value and the CTA
          at its foot. */}
      <div className="min-w-0 lg:min-h-0">
        <div className="lg-card p-5 flex flex-col gap-3 lg:h-full">
          <h3 className="card-title">Quick Actions</h3>

          {/* card 1 — Damages Summary. The page now opens on Damage Computation,
              so this takes the attorney to the top of it. */}
          <button
            onClick={() => scrollTo(economicRef)}
            className="rounded-xl border border-line bg-offwhite p-4 text-left transition-all hover:border-brand hover:bg-tint hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
              <span className="card-title">Damages Summary</span>
            </div>
          </button>

          {/* card 2 — Economic Damages */}
          <button
            onClick={() => { setCompTab("economic"); scrollTo(economicRef); }}
            className="rounded-xl border border-line bg-offwhite p-4 text-left transition-all hover:border-brand hover:bg-tint hover:shadow-sm"
          >
            <div className="text-xl font-bold text-ink tabular-nums">{formatUSD(economicTotal)}</div>
            <div className="eyebrow mt-1">Economic Damages</div>
          </button>

          {/* card 3 — Non-Economic Damages */}
          <button
            onClick={() => { setCompTab("noneconomic"); scrollTo(economicRef); }}
            className="rounded-xl border border-line bg-offwhite p-4 text-left transition-all hover:border-brand hover:bg-tint hover:shadow-sm"
          >
            <div className="text-xl font-bold text-ink tabular-nums">{formatCompact(nonEconomicTotal)}</div>
            <div className="eyebrow mt-1">Non-Economic Damages</div>
          </button>

          {/* card 4 — Damage Evidence count */}
          <button
            onClick={() => scrollTo(evidenceRef)}
            className="rounded-xl border border-line bg-offwhite p-4 text-left transition-all hover:border-brand hover:bg-tint hover:shadow-sm"
          >
            <div className="text-xl font-bold text-ink tabular-nums">{evidenceDocTotal}</div>
            <div className="eyebrow mt-1">Damage Evidence</div>
          </button>

          {/* Estimated value — emphasized, below the four cards */}
          <div className="mt-auto pt-4 border-t border-line">
            <div className="eyebrow mb-1">Estimated Value</div>
            <div className="text-2xl font-bold text-deep tabular-nums">{formatCompact(recommendedSettlement)}</div>
          </div>

          {/* CTA — jump to the Negligence (Non-Economic) tab */}
          <button onClick={() => goTo("noneconomic")} className="btn btn-primary w-full gap-2">
            Negligence <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* RIGHT — all damage sections, in their own scroll area; reaching its
          end does not carry on into the page */}
      <div ref={sectionsRef} className="min-w-0 space-y-12 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:-mr-3 lg:pr-3">

      {/* 1 + 2 — Damage Computation (single card: Economic · Non-Economic · Total).
          Adopts the Valuation page's "Damage Computation" design, minus the
          interactive multiplier controls — those stay on the Valuation page. */}
      <div ref={economicRef} className="lg-card bg-offwhite p-6 scroll-mt-[176px] lg:scroll-mt-0">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          <h2 className="section-header">Damage Computation</h2>
        </div>

        {/* Tabs — Economic · Non-Economic */}
        <div className="flex items-center gap-2 mb-5">
          {([
            { key: "economic", label: "Economic Damages", count: economicRows.length },
            { key: "noneconomic", label: "Non-Economic Damages", count: DA_DAMAGE_FACTORS.length + nonEconomicRows.length },
          ] as const).map((t) => {
            const active = compTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setCompTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  active ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                }`}
              >
                {t.label}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                  active ? "bg-brand text-white" : "bg-track text-[#5B6B78]"
                }`}>{t.count}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-5">
          {/* Economic Damages — clean table, with a leading icon per line item */}
          {compTab === "economic" && (
          <div className="border border-line rounded-xl overflow-hidden">
            <div className="bg-tint px-5 py-3 border-b border-line flex items-center justify-between gap-3">
              <h3 className="card-title">Economic Damages</h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className="pill pill-progress">Verified</span>
                {damages && (
                  <button
                    onClick={() => openAdd("economic")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand hover:bg-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage
                  </button>
                )}
              </div>
            </div>
            <div className="p-5">
              {addingTo === "economic" && addAt === null && (
                <div className="mb-4">
                  <DamageForm
                    title="Add Economic Damage"
                    draft={addDraft}
                    setDraft={setAddDraft}
                    onCancel={cancelAdd}
                    onSave={() => addDamage(addDraft)}
                    saveLabel="Add Damage"
                  />
                </div>
              )}
              {/* The six main categories. Each opens to its subcategories; a
                  subcategory with no damage on file shows $— rather than a
                  figure, since nothing has been calculated for it. */}
              <div className="space-y-3">
                {economicGroups.map((g) => {
                  const Icon = ECONOMIC_CATEGORY_ICON[g.category];
                  const catOpen = openCats.has(g.category);
                  const hasFigures = g.rows.length > 0;
                  return (
                    <div key={g.category} className="rounded-xl border border-line bg-white overflow-hidden">
                      <button
                        onClick={() => toggleCat(g.category)}
                        aria-expanded={catOpen}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-wash transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-tint flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                        </div>
                        <span className="card-title flex-1 min-w-0 truncate">{g.category}</span>
                        {/* How many subcategories the category holds */}
                        <span
                          title={`${g.subcategories.length} subcategories`}
                          className="text-xs font-semibold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums shrink-0"
                        >
                          {g.subcategories.length}
                        </span>
                        <span className={`w-28 text-right text-sm tabular-nums shrink-0 ${hasFigures ? "font-semibold text-ink" : "text-[#8A98A3]"}`}>
                          {hasFigures ? formatUSD(g.total) : "$—"}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${catOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                      </button>

                      {catOpen && (
                        <div className="border-t border-line bg-offwhite px-4 py-1.5">
                          {/* Damages on file for the category as a whole, where
                              the evidence does not tie them to one subcategory */}
                          {g.categoryLevel.length > 0 && (
                            <div className="pb-1.5 mb-1 border-b border-line">
                              <div className="eyebrow pt-2.5 pl-11">Recorded at category level</div>
                              <div className="pl-11 divide-y divide-line">
                                {g.categoryLevel.map((e) => (
                                  <DamageRow
                                    key={e.item.id}
                                    row={e}
                                    open={ecoRowsOpen.has(e.label)}
                                    onToggle={() => toggleEcoRow(e.label)}
                                    onDetails={() => openDrawer(e)}
                                    {...rowActions(e.item)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="divide-y divide-line">
                            {g.subcategories.map((s) => {
                              const key = `${g.category}::${s.name}`;
                              const has = s.rows.length > 0;
                              // Open to show its damages, or while one of them
                              // is being edited (the form lives in the row).
                              const subOpen = openSubs.has(key) || s.rows.some((e) => e.item.id === editingId);
                              const onEditSub = () => {
                                if (s.rows.length === 0) openAdd("economic", g.category, s.name);
                                else toggleSub(key);
                              };
                              // A subcategory holding one damage is that damage's
                              // row: its name, amount, edit and evidence details.
                              if (s.rows.length === 1) {
                                const e = s.rows[0];
                                return (
                                  <div key={s.name} className="pl-11">
                                    <DamageRow
                                      compact
                                      title={s.name}
                                      row={e}
                                      open={ecoRowsOpen.has(e.label)}
                                      onToggle={() => toggleEcoRow(e.label)}
                                      onDetails={() => openDrawer(e)}
                                      {...rowActions(e.item)}
                                    />
                                  </div>
                                );
                              }
                              return (
                                <div key={s.name} className="py-2">
                                  <div className="flex items-center justify-between gap-3 pl-11">
                                    {has ? (
                                      <button
                                        onClick={() => toggleSub(key)}
                                        aria-expanded={subOpen}
                                        className="flex items-center gap-1.5 min-w-0 text-left text-sm text-ink hover:text-deep transition-colors"
                                      >
                                        <span className="truncate">{s.name}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-[#5B6B78] shrink-0 transition-transform ${subOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                                      </button>
                                    ) : (
                                      <span className="text-sm text-[#5B6B78] truncate min-w-0">{s.name}</span>
                                    )}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className={`text-sm tabular-nums ${has ? "font-medium text-ink" : "text-[#8A98A3]"}`}>
                                        {has ? formatUSD(s.total) : "$—"}
                                      </span>
                                      {damages && (
                                        <button
                                          onClick={onEditSub}
                                          title={has ? "Edit damage" : "Add a damage here"}
                                          aria-label={has ? `Edit ${s.name}` : `Add a damage to ${s.name}`}
                                          className="p-1.5 rounded-lg text-[#8A98A3] hover:bg-tint hover:text-deep transition-colors"
                                        >
                                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {addingTo === "economic" && addAt === key && (
                                    <div className="pl-11 pt-2">
                                      <DamageForm
                                        title={`Add to ${s.name}`}
                                        draft={addDraft}
                                        setDraft={setAddDraft}
                                        onCancel={cancelAdd}
                                        onSave={() => addDamage(addDraft)}
                                        saveLabel="Add Damage"
                                      />
                                    </div>
                                  )}

                                  {has && subOpen && (
                                    <div className="pl-11 mt-1 divide-y divide-line">
                                      {s.rows.map((e) => (
                                        <DamageRow
                                          key={e.item.id}
                                          row={e}
                                          open={ecoRowsOpen.has(e.label)}
                                          onToggle={() => toggleEcoRow(e.label)}
                                          onDetails={() => openDrawer(e)}
                                          {...rowActions(e.item)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t-2 border-line flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Economic Damages Subtotal</span>
                <span className="text-lg font-bold text-ink tabular-nums">{formatUSD(subtotal)}</span>
              </div>
            </div>
          </div>
          )}

          {/* Non-Economic Damages — interactive attorney review workspace */}
          {compTab === "noneconomic" && (
          <div ref={nonEconomicRef} className="border border-line rounded-xl overflow-hidden scroll-mt-[176px] lg:scroll-mt-0">
            <div className="bg-tint px-5 py-3 border-b border-line flex items-center justify-between gap-3">
              <h3 className="card-title">Non-Economic Damages</h3>
              {anyOverride && <span className="pill pill-progress"><Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Attorney-adjusted</span>}
            </div>
            <div className="p-5 space-y-6">
              {damages && nonEconomicRows.length === 0 && addingTo !== "noneconomic" && (
                <button
                  onClick={() => openAdd("noneconomic")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage
                </button>
              )}
              {/* Itemised non-economic damages. Empty until a damage is placed
                  here, so the multiplier workspace stays the default view. */}
              {(nonEconomicRows.length > 0 || addingTo === "noneconomic") && (
                <div className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <h4 className="card-title">Itemised Non-Economic Damages</h4>
                    <span className="text-sm font-bold text-ink tabular-nums shrink-0">{formatUSD(nonEconomicItemsTotal)}</span>
                  </div>
                  {addingTo === "noneconomic" && (
                    <div className="mb-3">
                      <DamageForm
                        bucket="noneconomic"
                        title="Add Non-Economic Damage"
                        draft={addDraft}
                        setDraft={setAddDraft}
                        onCancel={() => setAddingTo(null)}
                        onSave={() => addDamage(addDraft)}
                        saveLabel="Add Damage"
                      />
                    </div>
                  )}
                  <div className="divide-y divide-line">
                    {nonEconomicRows.map((e) => (
                      <DamageRow
                        key={e.item.id}
                        row={e}
                        open={ecoRowsOpen.has(e.label)}
                        onToggle={() => toggleEcoRow(e.label)}
                        onDetails={() => openDrawer(e)}
                        {...rowActions(e.item)}
                      />
                    ))}
                  </div>
                  <p className="secondary-text mt-2.5">
                    Itemised amounts are added to the multiplier-derived figure below.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-tint border border-[#D6F2F7] rounded-xl p-4">
                  <div className="eyebrow mb-1">Recommended Multiplier</div>
                  <div className="text-2xl font-bold text-deep tabular-nums">{fmtMult(overallMult)}</div>
                  {anyOverride && <div className="text-xs text-[#8A98A3] mt-0.5">AI recommended {fmtMult(aiOverall)}</div>}
                </div>
                <div className="bg-tint border border-[#D6F2F7] rounded-xl p-4">
                  <div className="eyebrow mb-1">Estimated Non-Economic Damages</div>
                  <div className="text-2xl font-bold text-ink tabular-nums">{formatUSD(nonEconomicTotal)}</div>
                  {anyOverride && <div className="text-xs text-[#8A98A3] mt-0.5">AI estimate {formatCompact(economicTotal * aiOverall)}</div>}
                </div>
              </div>

              <div className="bg-[#F6FDFF] border border-[#D6F2F7] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  <span className="eyebrow text-deep">Recommended Valuation Strategy</span>
                </div>
                <p className="body-text">
                  LECO recommends applying a <strong className="font-semibold text-ink">{fmtMult(aiOverall)} multiplier</strong> to estimate{" "}
                  <strong className="font-semibold text-ink">Non-Economic Damages</strong>. Review, challenge, and adjust each factor below — the estimate recalculates instantly.
                </p>
              </div>

              {/* Damage Factors — interactive review & editing */}
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="w-full flex items-center justify-between gap-4 px-4 py-3">
                  <button
                    onClick={() => setDamageFactorsOpen((v) => !v)}
                    aria-expanded={damageFactorsOpen}
                    className="flex-1 min-w-0 flex items-center justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="card-title">Damage Factors</span>
                        <span className="text-xs font-semibold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums">
                          {factors.length}
                        </span>
                      </div>
                      <p className="secondary-text mt-0.5">
                        Review and edit each factor contributing to the {fmtMult(overallMult)} multiplier.
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-[#5B6B78] shrink-0 transition-transform duration-200 ${damageFactorsOpen ? "" : "-rotate-90"}`}
                      strokeWidth={1.75}
                    />
                  </button>
                  {factorsStore && (
                    <button
                      onClick={() => { setDamageFactorsOpen(true); openCreateFactor(); }}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand hover:bg-tint transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage Factor
                    </button>
                  )}
                </div>

                {damageFactorsOpen && (
                  <div className="border-t border-line bg-offwhite p-4 space-y-4">
                    {factors.map((f) => {
                      const cur = f.multiplier;
                      const [lo, hi] = f.range;
                      const overridden = hasOverride(f.id);
                      const stamp = overridden ? lastChangedAt(f.id) : undefined;
                      return (
                        <div key={f.id} className="lg-card p-5 space-y-3">
                          {/* Header — title, severity, modified badge · multiplier + Edit */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="card-title">{f.category}</h4>
                                <span className={SEVERITY_PILL[f.severity]}>{f.severity}</span>
                                <FactorProvenanceBadge provenance={f.provenance} />
                              </div>
                              <div className="flex items-center gap-2.5 mt-1 text-xs text-[#5B6B78] flex-wrap">
                                <span>Range <span className="font-semibold text-ink tabular-nums">{fmtMult(lo)}–{fmtMult(hi)}</span></span>
                                <span className="text-[#CBD5DD]">·</span>
                                <span><span className="font-semibold text-ink tabular-nums">{f.docCount}</span> supporting evidence</span>
                                {overridden && stamp && (<><span className="text-[#CBD5DD]">·</span><span className="text-deep font-medium">{stamp}</span></>)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <div className="text-base font-bold text-ink tabular-nums">{fmtMult(cur)}</div>
                                <div className="text-[10px] uppercase tracking-wide text-[#8A98A3]">Multiplier</div>
                              </div>
                              <button onClick={() => openEditDrawer(f.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-deep text-xs font-medium hover:bg-tint transition-colors">
                                <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Edit
                              </button>
                            </div>
                          </div>

                          {/* Compact summary — 2-line AI blurb + View Details */}
                          <div className="flex items-stretch gap-3">
                            <div className="flex-1 min-w-0 rounded-xl border border-line bg-offwhite p-3.5">
                              <p className="secondary-text leading-relaxed line-clamp-2">{f.aiReasoning}</p>
                            </div>
                            <button onClick={() => openDetail(f.id)} className="shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-line text-deep text-xs font-semibold hover:border-brand hover:bg-tint transition-colors">
                              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> View reasoning
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Summary + version history */}
                    <div className="rounded-xl border border-[#D6F2F7] bg-tint p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#5B6B78]">Recommended Multiplier</span>
                        <span className="text-sm font-bold text-ink tabular-nums">{fmtMult(overallMult)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#5B6B78]">Estimated Non-Economic Damages</span>
                        <span className="text-sm font-bold text-ink tabular-nums">{formatUSD(nonEconomicTotal)}</span>
                      </div>
                      <div className="pt-2.5 border-t border-[#D6F2F7] flex items-center justify-between gap-3">
                        <button onClick={() => setHistoryOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                          <History className="w-3.5 h-3.5" strokeWidth={1.75} /> {historyOpen ? "Hide" : "View"} Edit History
                        </button>
                        {anyOverride && (
                          <button onClick={() => factors.forEach((f) => restoreFactor(f.id))} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Restore All AI
                          </button>
                        )}
                      </div>
                      {historyOpen && (
                        <div className="pt-1 space-y-2">
                          {(factorsStore?.audit.length ?? 0) === 0 ? (
                            <p className="secondary-text">No changes yet — every factor is as the AI assessed it.</p>
                          ) : (
                            [...(factorsStore?.audit ?? [])].reverse().map((e) => (
                              <div key={e.id} className="rounded-lg border border-line bg-white p-3">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-semibold text-ink">{e.factor}</span>
                                  <span className="pill pill-neutral">{FACTOR_ACTION_LABEL[e.action]}</span>
                                  <span className="mono-ref">{e.at}</span>
                                </div>
                                <div className="space-y-0.5 text-xs text-[#5B6B78]">
                                  {(e.previous || e.next) && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {e.previous && <span className="tabular-nums">{e.previous}</span>}
                                      {e.previous && e.next && <ArrowRight className="w-3 h-3 shrink-0" strokeWidth={1.75} />}
                                      {e.next && <span className="font-semibold text-ink tabular-nums">{e.next}</span>}
                                    </div>
                                  )}
                                  <div>Changed by {e.changedBy}</div>
                                  {e.reason && <div className="italic">&ldquo;{e.reason}&rdquo;</div>}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="eyebrow mb-3">Recommendation Factors</div>
                <div className="flex flex-wrap gap-2">
                  {DA_STRATEGY_FACTORS.map((f) => (
                    <span key={f} className="pill pill-neutral"><CheckCircle className="w-4 h-4" strokeWidth={1.75} />{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          )}

          {/* One trail for the whole damage record, so it is reachable from
              either tab whoever made the change. */}
          <DamageEditHistory audit={damageAudit} />

          {/* Total Estimated Settlement — stays below both tabs (recalculates live) */}
          <div className="bg-ink rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow text-soft mb-1">Total Estimated Settlement</div>
              <div className="font-mono text-xs text-soft tabular-nums truncate">
                {formatUSD(economicTotal)} <span className="text-brand">+</span> {formatUSD(nonEconomicTotal)}
              </div>
            </div>
            <SettlementExplainer
              economic={economicTotal}
              nonEconomic={nonEconomicTotal}
              total={recommendedSettlement}
              multiplier={overallMult}
              itemisedNonEconomic={nonEconomicItemsTotal}
              factors={DA_STRATEGY_FACTORS}
            />
          </div>
        </div>
      </div>

      {/* 3 — Verified Damage Evidence (new) — one big card; each category is a bordered tile */}
      <div ref={evidenceRef} className="lg-card bg-offwhite p-6 scroll-mt-[176px] lg:scroll-mt-0">
        <div className="mb-5">
          <h2 className="section-header">Verified Evidence by Damage Type</h2>
          <p className="secondary-text mt-1 max-w-2xl">How each economic amount and non-economic factor is supported by evidence on file. Open any to review its documents.</p>
        </div>

        {/* Tabs — Economic · Non-Economic */}
        <div className="flex items-center gap-2 mb-5">
          {([
            { key: "economic", label: "Economic Damages", count: DAMAGE_EVIDENCE.length },
            { key: "noneconomic", label: "Non-Economic Damages", count: DA_DAMAGE_FACTORS.length },
          ] as const).map((t) => {
            const active = evidenceTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setEvidenceTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  active ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                }`}
              >
                {t.label}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                  active ? "bg-brand text-white" : "bg-track text-[#5B6B78]"
                }`}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {evidenceTab === "economic" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DAMAGE_EVIDENCE.map((d, i) => (
            <div key={d.category} className="border border-line rounded-xl bg-white p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow mb-1.5">Category</div>
                  <div className="card-title truncate">{d.category}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="eyebrow mb-1.5">Amount</div>
                  <div className="text-lg font-bold text-ink tabular-nums">{formatUSD(d.amount)}</div>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <button
                  onClick={() => toggleEvidenceExpand(i)}
                  className="w-full flex items-center justify-between gap-2 mb-2.5 group"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                    <span className="text-sm font-semibold text-ink">{d.docCount} Supporting Documents</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-deep transition-transform ${evidenceExpand.has(i) ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openEvidence(i)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm text-ink cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                  >
                    <FileTypeIcon name={d.primary} className="w-4 h-4 text-deep shrink-0" />
                    <span className="truncate max-w-[180px]">{d.primary}</span>
                    <FileTypeTag name={d.primary} />
                  </button>
                  {d.docCount > 1 && (
                    <button
                      onClick={() => openEvidence(i)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm font-medium text-deep cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                    >
                      <FileText className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                      +{d.docCount - 1} More
                    </button>
                  )}
                </div>
                {evidenceExpand.has(i) && (
                  <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                      <span className="eyebrow text-deep">AI Summary</span>
                    </div>
                    <p className="secondary-text leading-relaxed">{d.insight.summary}</p>
                  </div>
                )}
              </div>

              {/* Divider above the action buttons */}
              <div className="mt-auto border-t border-line" />

              {/* Actions — Preview & Insights open the same Document Workspace
                  used by the Analysis tab's signal cards. */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEvidence(i, "preview")}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
                >
                  <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
                </button>
                <button
                  onClick={() => openEvidence(i, "insights")}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
                </button>
              </div>
            </div>
          ))}
        </div>
        )}

        {evidenceTab === "noneconomic" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DA_DAMAGE_FACTORS.map((f) => {
            const names = padDocsToCount([], f.category, f.docCount);
            const primary = names[0];
            const expanded = neEvidenceExpand.has(f.category);
            return (
              <div key={f.category} className="border border-line rounded-xl bg-white p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow mb-1.5">Factor</div>
                    <div className="card-title truncate">{f.category}</div>
                    <span className={`${SEVERITY_PILL[f.severity]} mt-1.5`}>{f.severity}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="eyebrow mb-1.5">Multiplier</div>
                    <div className="text-lg font-bold text-ink tabular-nums">{fmtMult(currentMult(f.category))}</div>
                  </div>
                </div>

                <div className="border-t border-line pt-4">
                  <button
                    onClick={() => toggleNeEvidence(f.category)}
                    className="w-full flex items-center justify-between gap-2 mb-2.5 group"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                      <span className="text-sm font-semibold text-ink">{f.docCount} Supporting Documents</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-deep transition-transform ${expanded ? "rotate-180" : ""}`} strokeWidth={1.75} />
                  </button>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => openFactorDoc(f.category, primary)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm text-ink cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                    >
                      <FileTypeIcon name={primary} className="w-4 h-4 text-deep shrink-0" />
                      <span className="truncate max-w-[180px]">{primary}</span>
                      <FileTypeTag name={primary} />
                    </button>
                    {f.docCount > 1 && (
                      <button
                        onClick={() => openFactorWs(f.category, "preview")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm font-medium text-deep cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                      >
                        <FileText className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                        +{f.docCount - 1} More
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                        <span className="eyebrow text-deep">AI Summary</span>
                      </div>
                      <p className="secondary-text leading-relaxed">{f.aiReasoning}</p>
                    </div>
                  )}
                </div>

                <div className="mt-auto border-t border-line" />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openFactorWs(f.category, "preview")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
                  </button>
                  <button
                    onClick={() => openFactorWs(f.category, "insights")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                  >
                    <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
      </div>
    </div>

    {/* Shared Document Workspace — Preview / Insights for the selected category */}
    <DocumentWorkspaceModal
      docs={wsOpen ? (evidenceDocSets[wsIndex] ?? []) : null}
      noteContext={evidenceContexts[wsIndex]}
      insights={evidenceInsights[wsIndex]}
      contextPanel={evidencePanels[wsIndex]}
      initialView={wsView}
      position={wsIndex + 1}
      total={evidenceDocSets.length}
      onPrev={() => setWsIndex((i) => Math.max(0, i - 1))}
      onNext={() => setWsIndex((i) => Math.min(evidenceDocSets.length - 1, i + 1))}
      onClose={() => setWsOpen(false)}
      onDownload={() => {}}
    />

    {/* Removing a damage factor moves the multiplier, so it is confirmed with
        the effect spelled out. */}
    {deletingFactor && factorsStore && (
      <DeleteFactorDialog
        factor={deletingFactor}
        impact={`The estimate would fall from ${formatUSD(recommendedSettlement)} to ${formatUSD(settlementForOverall(overallMult - deletingFactor.multiplier))}.`}
        onCancel={() => setDeletingFactorId(null)}
        onConfirm={() => {
          factorsStore.deleteFactor(deletingFactor.id, factorActor, "Deleted by attorney on the Damages Analysis stage.");
          setDeletingFactorId(null);
          // The drawer was open on a factor that no longer exists.
          setDetailFactor((id) => (id === deletingFactor.id ? null : id));
          setEditMode(false);
        }}
      />
    )}
    {factorHistoryItem && factorsStore && (
      <FactorHistoryDrawer
        factor={factorHistoryItem}
        entries={factorsStore.historyFor(factorHistoryItem.id)}
        onClose={() => setFactorHistoryId(null)}
      />
    )}

    {/* Attorney damage editing — confirmation before a delete, and the change
        history for one damage. Both are dismissible and change nothing on open. */}
    {deleting && damages && (
      <DeleteDamageDialog
        item={deleting}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          damages.deleteDamage(deleting.id, actor, "Deleted by attorney on the Damages Analysis stage.");
          setDeletingId(null);
          // The form was opened on a damage that no longer exists.
          setEditingId((id) => (id === deleting.id ? null : id));
        }}
      />
    )}
    {historyItem && damages && (
      <DamageHistoryDrawer
        item={historyItem}
        entries={damages.historyFor(historyItem.id)}
        onClose={() => setHistoryId(null)}
      />
    )}

    {/* Economic line-item detail drawer — itemized, evidence-backed breakdown */}
    {drawerItem && (
      <>
        <div className="fixed inset-0 bg-ink/40 z-50" onClick={() => setDrawerItem(null)} />
        <div className="fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-white shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
            <h2 className="card-title">Document Details</h2>
            <button onClick={() => setDrawerItem(null)} className="p-1.5 hover:bg-tint rounded-lg transition-colors">
              <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <div className="eyebrow mb-1">Category</div>
              <div className="text-sm font-semibold text-ink">{drawerItem.category}</div>
            </div>
            <div>
              <div className="eyebrow mb-1">Amount</div>
              <div className="text-sm font-semibold text-ink tabular-nums">{formatUSD(drawerItem.value)}</div>
            </div>

            <div className="border-t border-line" />

            <div>
              <div className="eyebrow mb-2">{drawerItem.docCount} Supporting Documents</div>
              <div className="space-y-2">
                {(drawerDocsOpen ? breakdown : breakdown.slice(0, 3)).map((doc, i) => {
                  const open = expandedDocRows.has(doc.name);
                  return (
                    <div key={doc.name} className="rounded-lg border border-line bg-offwhite overflow-hidden">
                      <button onClick={() => toggleDocRow(doc.name)} className="w-full text-left px-3 py-2.5 hover:bg-wash transition-colors">
                        <div className="eyebrow text-[#8A98A3] mb-1.5">Document {String(i + 1).padStart(2, "0")}</div>
                        <div className="flex items-center gap-2">
                          <FileTypeIcon name={doc.name} className="w-3.5 h-3.5 text-deep shrink-0" />
                          <span className="text-xs font-medium text-ink truncate flex-1">{doc.name}</span>
                          <FileTypeTag name={doc.name} />
                          <span className="text-xs font-semibold text-ink tabular-nums shrink-0">{formatUSD(doc.amount)}</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-deep shrink-0 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
                        </div>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 pt-2.5 border-t border-line bg-white space-y-3">
                          <div>
                            <div className="eyebrow flex items-center gap-1.5 mb-1">
                              <Sparkles className="w-3 h-3 text-deep" strokeWidth={1.75} /> AI Summary
                            </div>
                            <p className="text-xs text-[#5B6B78] leading-relaxed">{doc.aiSummary}</p>
                          </div>
                          <div>
                            <div className="eyebrow mb-1">Billing Period</div>
                            <p className="text-xs font-medium text-ink">{doc.billingPeriod}</p>
                          </div>
                          <button
                            onClick={() => { setEcoWsFocus(doc.name); setEcoWsView("preview"); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line text-deep text-xs font-medium hover:bg-tint transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Preview Document
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {drawerItem.docCount > 3 && (
                <button onClick={() => setDrawerDocsOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink transition-colors">
                  {drawerDocsOpen ? "Show less" : `+${drawerItem.docCount - 3} More`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${drawerDocsOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
              )}
            </div>

            {/* Verified Total — itemized amounts reconcile to the category total */}
            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-tint border border-[#D6F2F7] px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
                  <span className="text-xs font-semibold text-deep">Verified Total</span>
                </div>
                <span className="text-sm font-bold text-ink tabular-nums">{formatUSD(verifiedTotal)}</span>
              </div>
              <p className="text-[11px] text-[#8A98A3] mt-1.5">Sum of all {drawerItem.docCount} itemized documents · matches the verified {drawerItem.category} total.</p>
            </div>
          </div>

          <div className="border-t border-line p-4 flex items-center gap-2">
            <button onClick={() => { setEcoWsFocus(null); setEcoWsView("preview"); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-line text-ink text-sm font-medium hover:bg-wash transition-colors">
              <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
            </button>
            <button onClick={() => { setEcoWsFocus(null); setEcoWsView("insights"); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-colors">
              <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
            </button>
          </div>
        </div>
      </>
    )}

    {/* Preview / Insights workspace for the economic drawer's documents */}
    <DocumentWorkspaceModal
      docs={ecoWsView && drawerItem ? orderedDrawerDocs : null}
      contextPanel={drawerItem ? { summary: [
        { label: "Category", value: drawerItem.category },
        { label: "Amount", value: formatUSD(drawerItem.value) },
        { label: "Supporting Documents", value: String(drawerItem.docCount) },
      ] } : undefined}
      initialView={ecoWsView ?? "preview"}
      onClose={() => { setEcoWsView(null); setEcoWsFocus(null); }}
      onDownload={() => {}}
    />

    {/* Precedent case detail drawer */}
    {selectedPrecedent && (
      <>
        <div className="fixed inset-0 bg-ink/40 z-50" onClick={() => setSelectedPrecedent(null)} />
        <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-50 flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <div className="eyebrow mb-1">PRECEDENT CASE</div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="card-title">{selectedPrecedent.caseName}</h2>
                <span className="pill pill-complete">{selectedPrecedent.matchScore}% Match</span>
              </div>
            </div>
            <button onClick={() => setSelectedPrecedent(null)} className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0"><X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="text-xs text-[#5B6B78] flex items-center gap-2.5 flex-wrap">
              <span>{selectedPrecedent.matchScore}% Match <span className="font-semibold text-ink">•</span> {selectedPrecedent.labels[0]} <span className="font-semibold text-ink">•</span> {selectedPrecedent.labels[1] ?? selectedPrecedent.tags[0]}</span>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-offwhite p-3.5">
              <div>
                <div className="eyebrow mb-0.5">SETTLEMENT OUTCOME</div>
                <div className="text-xl font-bold text-ink tabular-nums">{formatUSD(selectedPrecedent.amount)}</div>
                <div className="text-xs text-[#8A98A3] mt-0.5">Resolved through Pre-Trial Settlement</div>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-1.5">SIMILARITY DRIVERS</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedPrecedent.labels.map((label) => <span key={label} className="pill pill-neutral">{label}</span>)}
                {selectedPrecedent.tags.map((tag) => <span key={tag} className="pill pill-neutral">{tag}</span>)}
              </div>
            </div>

            <div className="rounded-xl border border-line overflow-hidden">
              <button onClick={() => setPrecedentReasoningOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-wash transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Summary</span>
                <ChevronDown className={`w-4 h-4 text-deep transition-transform ${precedentReasoningOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {precedentReasoningOpen && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-line bg-tint">
                  <div className="eyebrow mb-1.5">Why {selectedPrecedent.matchScore}% Match</div>
                  <p className="secondary-text leading-relaxed">
                    LECO identified this precedent because it closely aligns with Estate of Miller across multiple legal and factual dimensions. Both matters involve catastrophic injuries, clearly documented negligence, strong liability evidence, and long-term medical impact. The comparable jurisdiction and settlement outcome make this case a reliable benchmark for estimating recovery potential and supporting the recommended settlement corridor.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line overflow-hidden">
              <button onClick={() => setPrecedentSuggestionOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-wash transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Suggestions</span>
                <ChevronDown className={`w-4 h-4 text-deep transition-transform ${precedentSuggestionOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {precedentSuggestionOpen && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-line bg-offwhite space-y-2.5">
                  <div className="rounded-lg bg-white border border-line p-2.5">
                    <div className="eyebrow mb-1">Recommended Use</div>
                    <ul className="space-y-1.5 text-sm text-ink">
                      <li>• Support the initial settlement demand with a comparable recovery outcome.</li>
                      <li>• Reference this case when explaining long-term injury valuation.</li>
                      <li>• Strengthen liability discussions using similar negligence findings.</li>
                      <li>• Cite this precedent during negotiation to reinforce the recommended settlement corridor.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-line p-4 flex items-center gap-2">
            <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-line text-ink text-sm font-medium hover:bg-wash transition-colors">💬 Chat with AI</button>
            <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-colors">✨ View Insights</button>
          </div>
        </div>
      </>
    )}

    {/* ── Damage-factor drawer — reasoning in read mode, the full factor in
           edit mode, and the same form again for a new factor. ── */}
    {(detailFactor || creatingFactor) && (() => {
      const existing = detailFactor ? factorById(detailFactor) : undefined;
      // In create mode there is no factor yet; the form drives everything.
      const f = existing ?? factors[0];
      if (!f) return null;
      const cur = existing ? existing.multiplier : draftMult;
      const [lo, hi] = creatingFactor ? draftRange(factorDraft) : f.range;
      const overridden = !!existing && hasOverride(existing.id);
      const prevForFactor = existing ? settlementForOverall(overallMult - cur + existing.aiMultiplier) : recommendedSettlement;
      const diff = recommendedSettlement - prevForFactor;
      const gainSettlement = Math.round(economicTotal * f.suggestion.multiplierGain);
      const docNames = padDocsToCount([], f.category, f.docCount);
      const stamp = existing && overridden ? lastChangedAt(existing.id) : undefined;
      const presets = Array.from(new Set([lo, Math.round(((lo + hi) / 2) * 100) / 100, hi]));
      // While creating, the preview adds the new factor rather than replacing one.
      const draftOverall2 = creatingFactor ? overallMult + draftMult : draftOverall;
      const draftDiff = settlementForOverall(draftOverall2) - recommendedSettlement;
      const closeDrawer = () => { setDetailFactor(null); setCreatingFactor(false); setEditMode(false); };
      const dim = editMode ? "opacity-50 pointer-events-none select-none" : "";
      return (
        <>
          <div className="fixed inset-0 bg-ink/40 z-50" onClick={closeDrawer} />
          <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <div className="eyebrow mb-1">{creatingFactor ? "Add Damage Factor" : "Damage Factor"}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="card-title">{creatingFactor ? (factorDraft.name.trim() || "New factor") : f.category}</h2>
                  <span className={SEVERITY_PILL[creatingFactor ? factorDraft.severity : f.severity]}>
                    {creatingFactor ? factorDraft.severity : f.severity}
                  </span>
                  {!creatingFactor && <FactorProvenanceBadge provenance={f.provenance} />}
                </div>
              </div>
              <button onClick={closeDrawer} className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0"><X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} /></button>
            </div>

            {detailChatOpen ? (
              <PrecedentChatPanel caseName={f.category} onBack={() => setDetailChatOpen(false)} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Current Multiplier — read view or inline editor */}
                  {!editMode ? (
                    <div className="rounded-xl border border-line bg-offwhite p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="eyebrow mb-0.5">Current Multiplier</div>
                          <div className="text-xl font-bold text-ink tabular-nums">{fmtMult(cur)}</div>
                          <div className="text-xs text-[#8A98A3] mt-0.5">Range {fmtMult(lo)}–{fmtMult(hi)} · AI recommended {fmtMult(f.aiMultiplier)}</div>
                        </div>
                        <button onClick={startEdit} className="btn btn-secondary text-xs px-3 py-2 gap-1.5 shrink-0">
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Edit
                        </button>
                      </div>
                      {overridden && (
                        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line flex-wrap">
                          <div className="text-xs text-ink">
                            <span className="font-semibold tabular-nums">{diff > 0 ? "+" : ""}{formatUSD(diff)}</span> vs. AI recommendation
                            {stamp && <span className="text-[#8A98A3]"> · {stamp}</span>}
                          </div>
                          <button onClick={() => restoreFactor(detailFactor)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Restore AI Recommendation
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                    {/* The factor itself — name, what it covers, how severe */}
                    <div className="rounded-xl border border-line bg-white p-3.5 space-y-3">
                      <div className="eyebrow">Factor Details</div>
                      <div>
                        <label className="eyebrow block mb-1">Factor Name</label>
                        <input
                          value={factorDraft.name}
                          onChange={(e) => setFactorDraft({ ...factorDraft, name: e.target.value })}
                          placeholder="Enter factor name"
                          className="w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                      <div>
                        <label className="eyebrow block mb-1">Description</label>
                        <textarea
                          value={factorDraft.description}
                          onChange={(e) => setFactorDraft({ ...factorDraft, description: e.target.value })}
                          rows={3}
                          placeholder="Describe how this factor affects the case..."
                          className="w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors resize-y"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="eyebrow block mb-1">Severity</label>
                          <select
                            value={factorDraft.severity}
                            onChange={(e) => {
                              const severity = e.target.value as Severity;
                              const [sLo, sHi] = SEVERITY_RANGE[severity];
                              // Changing severity offers that band; the attorney
                              // can still set their own below.
                              setFactorDraft({ ...factorDraft, severity, rangeLow: String(sLo), rangeHigh: String(sHi) });
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                          >
                            {(Object.keys(SEVERITY_RANGE) as Severity[]).map((sev) => (
                              <option key={sev} value={sev}>{sev}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="eyebrow block mb-1">Multiplier Range</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" step="0.05" min="0" value={factorDraft.rangeLow}
                              onChange={(e) => setFactorDraft({ ...factorDraft, rangeLow: e.target.value })}
                              className="w-full px-2 py-2 rounded-lg border border-line text-sm text-ink tabular-nums focus:outline-none focus:border-brand transition-colors"
                            />
                            <span className="text-xs text-[#8A98A3] shrink-0">–</span>
                            <input
                              type="number" step="0.05" min="0" value={factorDraft.rangeHigh}
                              onChange={(e) => setFactorDraft({ ...factorDraft, rangeHigh: e.target.value })}
                              className="w-full px-2 py-2 rounded-lg border border-line text-sm text-ink tabular-nums focus:outline-none focus:border-brand transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-brand bg-tint p-3.5 space-y-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="eyebrow">{creatingFactor ? "Recommended Multiplier" : "Edit Multiplier"}</div>
                        {!creatingFactor && detailFactor && (
                          <button onClick={() => restoreFactor(detailFactor)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Restore AI
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-[#5B6B78]">
                        Recommended range <span className="font-semibold text-ink tabular-nums">{fmtMult(lo)}–{fmtMult(hi)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {presets.map((p) => (
                          <button
                            key={p}
                            onClick={() => setDraftMult(p)}
                            className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold tabular-nums transition-colors ${draftMult === p ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-wash"}`}
                          >
                            {fmtMult(p)}
                          </button>
                        ))}
                      </div>
                      <div>
                        <div className="eyebrow mb-1.5">Custom Value</div>
                        <input
                          type="number" step="0.05" value={draftMult}
                          onChange={(e) => setDraftMult(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                      <div className="rounded-lg bg-white border border-line p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="secondary-text">Settlement Impact</span>
                          <span className="font-semibold tabular-nums text-ink">{draftDiff === 0 ? "No change" : `${draftDiff > 0 ? "+" : ""}${formatUSD(draftDiff)}`}</span>
                        </div>
                        <div className="text-xs text-[#8A98A3] mt-1">New Total: {formatUSD(draftSettlement)}</div>
                      </div>
                      <div>
                        <div className="eyebrow mb-1.5">Note (optional)</div>
                        <textarea
                          value={draftNote} onChange={(e) => setDraftNote(e.target.value)} rows={2}
                          placeholder="Reason for adjustment..."
                          className="w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors resize-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={cancelEdit} className="btn btn-secondary flex-1 justify-center">Cancel</button>
                        <button
                          onClick={saveFactorEdit}
                          disabled={creatingFactor && factorDraft.name.trim().length === 0}
                          className="btn btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingFactor ? "Add Damage Factor" : "Save Changes"}
                        </button>
                      </div>
                    </div>

                    {/* Deleting changes the valuation, so it sits apart from
                        Save and is always confirmed. */}
                    {!creatingFactor && existing && (
                      <div className="rounded-xl border border-[#F5C9C4] bg-[#FEF4F3] p-3.5 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink">Delete Damage Factor</div>
                          <p className="text-xs text-[#5B6B78] mt-0.5">Removes it from the recommended multiplier.</p>
                        </div>
                        <button
                          onClick={() => setDeletingFactorId(existing.id)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#F5C9C4] bg-white text-sm font-semibold text-[#B42318] hover:bg-[#FDEBE9] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete Factor
                        </button>
                      </div>
                    )}

                    {/* This factor's own change history. */}
                    {!creatingFactor && existing && (
                      <button
                        onClick={() => setFactorHistoryId(existing.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors"
                      >
                        <History className="w-3.5 h-3.5" strokeWidth={1.75} /> View this factor's history
                      </button>
                    )}
                    </div>
                  )}

                  <div className={`space-y-5 transition-opacity ${dim}`}>
                    {/* Why this band — the case, the comparables, and the
                        money the two produce. Read-only: understanding a factor
                        and changing one are different things. */}
                    {existing && (
                      <FactorReasoning
                        factor={existing}
                        precedents={COMPARABLE_VERDICTS}
                        economicTotal={economicTotal}
                        caseType={model.caseType}
                        jurisdiction={model.jurisdiction}
                        matchedByCorridor={CORRIDOR_RESULT.matchedCases}
                      />
                    )}

                    <div className="rounded-xl border border-line overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-ink border-b border-line bg-offwhite">
                        <Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Suggestions
                      </div>
                      <div className="px-3.5 py-3 bg-offwhite">
                        <div className="rounded-lg bg-white border border-line p-3">
                          <div className="eyebrow mb-1">Recommended Additional Evidence</div>
                          <div className="text-sm font-semibold text-ink">{f.suggestion.evidence}</div>
                          <p className="secondary-text mt-1.5 leading-relaxed">{f.suggestion.why}</p>
                          <div className="flex items-center gap-5 mt-3 pt-3 border-t border-line">
                            <div>
                              <div className="eyebrow">Multiplier Gain</div>
                              <div className="text-sm font-bold text-deep tabular-nums mt-0.5">+{fmtMult(f.suggestion.multiplierGain)}</div>
                            </div>
                            <div>
                              <div className="eyebrow">Settlement Impact</div>
                              <div className="text-sm font-bold text-deep tabular-nums mt-0.5">+{formatUSD(gainSettlement)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Collapsed by default: the drawer is about the reasoning,
                        and the file list is a click away when it is wanted. */}
                    <div>
                      <button
                        onClick={() => setDetailDocsSectionOpen((v) => !v)}
                        aria-expanded={detailDocsSectionOpen}
                        className="w-full flex items-center justify-between gap-2 py-1 text-left group"
                      >
                        <span className="eyebrow">Supporting Documents ({f.docCount})</span>
                        <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${detailDocsSectionOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                      </button>
                      <div className={`space-y-1.5 mt-2 ${detailDocsSectionOpen ? "" : "hidden"}`}>
                        {(detailDocsOpen ? docNames : docNames.slice(0, 5)).map((name) => (
                          <button
                            key={name}
                            onClick={() => openFactorDoc(detailFactor, name)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-white hover:bg-wash transition-colors text-left"
                          >
                            <FileTypeIcon name={name} className="w-3.5 h-3.5 text-deep shrink-0" />
                            <span className="text-sm text-ink truncate">{name}</span>
                            <FileTypeTag name={name} />
                          </button>
                        ))}
                        {docNames.length > 5 && (
                          <button onClick={() => setDetailDocsOpen((v) => !v)} className="text-xs font-semibold text-deep hover:text-ink transition-colors">
                            {detailDocsOpen ? "Show less" : `View ${docNames.length - 5} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line p-4">
                  <button onClick={() => setDetailChatOpen(true)} className="btn btn-primary w-full justify-center gap-2">
                    <Bot className="w-4 h-4" strokeWidth={1.75} /> Chat with AI
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      );
    })()}

    {/* Preview / Insights workspace for a damage factor's supporting evidence */}
    <DocumentWorkspaceModal
      docs={factorWsCat ? (() => {
        const names = padDocsToCount([], factorWsCat, factorByCat(factorWsCat).docCount);
        const ordered = factorWsFocus ? [factorWsFocus, ...names.filter((n) => n !== factorWsFocus)] : names;
        return ordered.map((n) => docForFile(n));
      })() : null}
      contextPanel={factorWsCat ? { summary: [
        { label: "Factor", value: factorWsCat },
        { label: "Severity", value: factorByCat(factorWsCat).severity },
        { label: "Multiplier", value: fmtMult(currentMult(factorWsCat)) },
        { label: "Supporting Documents", value: String(factorByCat(factorWsCat).docCount) },
      ] } : undefined}
      insights={factorWsCat ? {
        summary: factorByCat(factorWsCat).aiReasoning,
        keyPoints: factorByCat(factorWsCat).drivers.map((d) => `${d} — verified in the record.`),
        entities: [
          { label: "Factor", value: factorWsCat },
          { label: "Confidence", value: `${factorByCat(factorWsCat).confidence}%` },
        ],
        supportingDocs: padDocsToCount([], factorWsCat, factorByCat(factorWsCat).docCount),
        confidence: { level: "High", score: factorByCat(factorWsCat).confidence },
      } : undefined}
      initialView={factorWsView}
      onClose={() => { setFactorWsCat(null); setFactorWsFocus(null); }}
      onDownload={() => {}}
    />
    </>
  );
}

// ── Tab 4 — Negligence ────────────────────────────────────────────────────────
// An attorney's negligence investigation workspace: the four legal elements,
// the negligent events (expected vs actual), the evidence proving each, the AI
// assessment, the supporting documents, and the overall liability strength.

// Section 1 — the legal elements of negligence. Icons live here rather than on
// the record so the store stays plain data; a pillar added later falls back to
// the generic legal icon.
const PILLAR_ICON: Record<string, typeof ShieldCheck> = {
  shield: ShieldCheck, alert: AlertTriangle, activity: Activity, heart: HeartPulse,
};

const pillarIcon = (key: string) => PILLAR_ICON[key] ?? Scale;

// The elements on file at load. Module-level helpers (stage citations) read
// this; the stage itself reads the live store, so an edit shows immediately.
const NEGLIGENCE_PILLARS = PILLAR_SEED;

// AI reasoning for why this constitutes negligence (concise).
const AI_REASONING = [
  "Duty of care clearly established.",
  "Multiple documented breaches of standard care.",
  "Direct causation linked to the stroke and death.",
  "Evidence shows deviation from medical standards.",
  "Liability strongly supported by the pattern of harm.",
];


// Circular AI-confidence indicator drawn as an SVG ring (green success stroke).
function ConfidenceRing({ value }: { value: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  return (
    <div className="relative w-[150px] h-[150px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EAEEF2" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#3FB5D7" strokeWidth="10" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-bold text-ink tabular-nums" style={{ fontSize: "26px", letterSpacing: "-0.02em" }}>{value}%</div>
        <div className="eyebrow mt-0.5">AI Confidence</div>
      </div>
    </div>
  );
}

// ── Attorney editing of the negligence pillars ───────────────────────────────
// One Edit action per card, and the form replaces the card in place rather than
// opening over the stage. Deleting and reading a pillar's history live inside
// that form, so the cards stay a reading surface.

interface PillarDraft {
  title: string;
  subtitle: string;
  body: string;
  /** The documents this pillar cites, as a list rather than typed text. */
  docs: string[];
}

const pillarDraftOf = (p: PillarItem): PillarDraft => ({
  title: p.title,
  subtitle: p.subtitle,
  body: p.body,
  docs: [...p.docs],
});

const blankPillarDraft = (): PillarDraft => ({ title: "", subtitle: "", body: "", docs: [] });

// A labelled field in the pillar form.
function PillarField({
  label, value, onChange, rows, hint, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  const cls = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors";
  return (
    <div>
      <label className="eyebrow block mb-1">{label}</label>
      {rows ? (
        <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y`} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
      {hint && <p className="text-[11px] text-[#8A98A3] mt-1">{hint}</p>}
    </div>
  );
}

// Supporting evidence, edited as a list rather than typed as text. Removing a
// chip detaches the document from this pillar; the file stays on the case and
// can be cited by another pillar.
function EvidenceEditor({
  docs, onChange, available, subject = "pillar",
}: {
  docs: string[];
  onChange: (d: string[]) => void;
  available: string[];
  /** What the record is called, so the wording fits whichever stage uses it. */
  subject?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  // Everything on the case that this pillar does not already cite.
  const attached = new Set(docs);
  const offered = available
    .filter((d) => !attached.has(d))
    .filter((d) => d.toLowerCase().includes(query.trim().toLowerCase()));

  const openPicker = () => { setChosen([]); setQuery(""); setPicking(true); };
  const commit = () => { if (chosen.length > 0) onChange([...docs, ...chosen]); setPicking(false); };

  return (
    <div>
      <label className="eyebrow block mb-1">Supporting Evidence</label>
      {docs.length === 0 && !picking && (
        <p className="secondary-text mb-2">No documents are cited by this {subject} yet.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {docs.map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white pl-2.5 pr-1.5 py-1.5 text-xs text-ink">
            <FileTypeIcon name={d} className="w-3.5 h-3.5 text-deep shrink-0" />
            <span className="truncate max-w-[180px]">{d}</span>
            <FileTypeTag name={d} />
            <button
              onClick={() => onChange(docs.filter((x) => x !== d))}
              title={`Remove ${d} from this ${subject}`}
              aria-label={`Remove ${d} from this ${subject}`}
              className="p-0.5 rounded text-[#8A98A3] hover:bg-[#FEF4F3] hover:text-[#B42318] transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </span>
        ))}
      </div>
      {!picking ? (
        <button
          onClick={openPicker}
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-soft bg-white text-xs font-semibold text-deep hover:border-brand hover:bg-tint transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Supporting Document
        </button>
      ) : (
        <div className="mt-2 rounded-xl border border-line bg-white p-3">
          <div className="eyebrow mb-2">Select supporting documents</div>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-[#8A98A3] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search case documents…"
              className="w-full rounded-lg border border-line bg-white pl-8 pr-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto divide-y divide-line border border-line rounded-lg">
            {offered.length === 0 ? (
              <p className="secondary-text p-2.5">
                {query.trim() ? "No case documents match that." : "Every case document is already cited here."}
              </p>
            ) : offered.map((d) => {
              const on = chosen.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => setChosen((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-wash transition-colors"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-brand border-brand" : "border-line bg-white"}`}>
                    {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <FileTypeIcon name={d} className="w-3.5 h-3.5 text-deep shrink-0" />
                  <span className="mono-ref text-ink truncate">{d}</span>
                  <FileTypeTag name={d} />
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2.5">
            <span className="text-xs text-[#8A98A3]">
              {chosen.length === 0 ? "None selected" : `${chosen.length} selected`}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPicking(false)} className="btn btn-secondary px-2.5 py-1.5 text-xs">Cancel</button>
              <button onClick={commit} className="btn btn-primary px-2.5 py-1.5 text-xs">Done</button>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-[#8A98A3] mt-1.5">
        Removing a document releases this {subject}'s citation. The document stays on the case file.
      </p>
    </div>
  );
}

// The pillar form, used both for editing an existing element and adding a new
// one. Same fields either way, so the two cannot drift apart.
function PillarForm({
  title, no, draft, setDraft, onCancel, onSave, saveLabel, onDelete, onHistory, available,
}: {
  title: string;
  no: string;
  draft: PillarDraft;
  setDraft: (d: PillarDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  /** Every document on the case, for the evidence picker. */
  available: string[];
  /** Editing an existing pillar only — absent when adding a new one. */
  onDelete?: () => void;
  onHistory?: () => void;
}) {
  const set = (k: "title" | "subtitle" | "body") => (v: string) => setDraft({ ...draft, [k]: v });
  const valid = draft.title.trim().length > 0;
  return (
    <div className="border border-[#D6F2F7] rounded-xl bg-[#F6FDFF] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-deep">{title}</span>
        <span className="eyebrow text-[#8A98A3]">Pillar {no}</span>
      </div>
      <PillarField label="Title" value={draft.title} onChange={set("title")} placeholder="Enter pillar title" />
      <PillarField label="Question" value={draft.subtitle} onChange={set("subtitle")} placeholder="What was expected?" />
      <PillarField label="Analysis" value={draft.body} onChange={set("body")} rows={5} placeholder="Describe the legal analysis for this element…" />
      <EvidenceEditor docs={draft.docs} onChange={(docs) => setDraft({ ...draft, docs })} available={available} />
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <div className="flex items-center gap-3">
          {onHistory && (
            <button onClick={onHistory} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
              <History className="w-3.5 h-3.5" strokeWidth={1.75} /> History
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318] hover:text-[#96200F] transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete pillar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button onClick={onSave} disabled={!valid} className="btn btn-primary px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Deleting a pillar removes an element of the case, so it is always confirmed
// and always says what happens to the evidence behind it.
function DeletePillarDialog({
  item, onCancel, onConfirm,
}: { item: PillarItem; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[80]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[440px] max-w-[92vw] rounded-2xl border border-line bg-white shadow-xl p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" strokeWidth={1.75} />
          <h3 className="card-title">Delete Negligence Pillar?</h3>
        </div>
        <p className="body-text leading-relaxed">
          Are you sure you want to delete &ldquo;{item.title}&rdquo;? This will remove this negligence pillar
          from the current case.
        </p>
        {item.docs.length > 0 && (
          <div className="rounded-xl border border-[#FDE6C8] bg-[#FFF7ED] px-3.5 py-3 mt-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-[#B45309] shrink-0" strokeWidth={1.75} />
              <span className="eyebrow text-[#B45309]">{item.docCount} supporting documents</span>
            </div>
            <p className="secondary-text">
              The pillar's citation of this evidence is released. The documents themselves stay on the case file.
            </p>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#B42318] hover:bg-[#96200F] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete
          </button>
        </div>
      </div>
    </>
  );
}

// The change history for one pillar — every action, who made it and when.
function PillarHistoryDrawer({
  item, entries, onClose,
}: { item: PillarItem; entries: PillarAudit[]; onClose: () => void }) {
  const newestFirst = [...entries].reverse();
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Pillar History</div>
            <h2 className="card-title">{item.title}</h2>
            <div className="mono-ref mt-1">Pillar {item.no} · {PILLAR_PROVENANCE_LABEL[item.provenance]}</div>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {newestFirst.length === 0 ? (
            <p className="secondary-text">
              No changes recorded. This pillar is as the AI first put it on the case.
            </p>
          ) : (
            <div className="relative">
              {newestFirst.map((e, i) => (
                <div key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-brand mt-1.5" />
                    {i < newestFirst.length - 1 && <div className="w-px flex-1 bg-line mt-1.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">{PILLAR_ACTION_LABEL[e.action]}</span>
                      <span className="mono-ref">{e.at}</span>
                    </div>
                    <p className="text-xs text-[#8A98A3] mt-0.5">{e.changedBy}</p>
                    {/* An evidence change is one document in or out, so it
                        reads as that rather than as a before/after pair. */}
                    {(e.action === "evidence-added" || e.action === "evidence-removed") && (
                      <div className="rounded-xl border border-line mt-2 px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold ${e.action === "evidence-added" ? "text-[#15803D]" : "text-[#B42318]"}`}>
                            {e.action === "evidence-added" ? "+" : "−"}
                          </span>
                          <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                          <span className="mono-ref text-ink">{e.next ?? e.previous}</span>
                        </div>
                      </div>
                    )}
                    {e.previous !== undefined && e.next !== undefined && e.action !== "created" && e.action !== "deleted" && (
                      <div className="rounded-xl border border-line divide-y divide-line mt-2">
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Previous</div>
                          <p className="body-text leading-relaxed">{e.previous || "—"}</p>
                        </div>
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">New</div>
                          <p className="body-text leading-relaxed font-medium">{e.next || "—"}</p>
                        </div>
                      </div>
                    )}
                    {e.reason && (
                      <p className="secondary-text mt-2 italic">&ldquo;{e.reason}&rdquo;</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function NonEconomicDamagesTab({ goTo, documents }: TabProps) {
  // Shared Document Workspace — Preview / Insights for each pillar's evidence.
  const [wsOpen, setWsOpen] = useState(false);
  const [wsIndex, setWsIndex] = useState(0);
  const [wsView, setWsView] = useState<"preview" | "insights">("preview");
  const docForFile = buildDocResolver(documents);
  // The pillars, live. A rename reaches the cards, the evidence workspace and
  // the insight panels together because they all read this one list.
  const pillarStore = usePillarsOptional();
  const pillars = pillarStore?.pillars ?? NEGLIGENCE_PILLARS;
  const negDocSets = pillars.map((p) => padDocsToCount(p.docs, p.title, p.docCount).map(docForFile));
  const negContexts = pillars.map((p) => ({ contextType: "Negligence Element", reference: p.title }));
  const negInsights = pillars.map((p) => ({
    summary: p.insight,
    keyPoints: p.docs.map((d) => `${d.replace(/_/g, " ").replace(/\.pdf$/, "")} reviewed and verified.`),
    entities: [
      { label: "Element", value: p.title },
      { label: "Confidence", value: `${p.confidence}%` },
    ],
    supportingDocs: p.docs,
    confidence: { level: "High", score: p.confidence },
  }));
  // Document Context Panel data for the preview rail (per negligence element).
  const negPanels = pillars.map((p) => ({
    summary: [
      { label: "Element", value: p.title },
      { label: "Confidence", value: `${p.confidence}%` },
      { label: "Supporting Documents", value: String(p.docCount) },
    ],
  }));
  const openNeg = (i: number, view: "preview" | "insights" = "preview") => { setWsIndex(i); setWsView(view); setWsOpen(true); };

  // ── Attorney editing ─────────────────────────────────────────────────────
  // Which card is in edit mode, which is pending deletion, and whether the add
  // form is open. Every handler calls a store operation; this component holds
  // no provenance or history logic of its own.
  const [editingPillar, setEditingPillar] = useState<string | null>(null);
  const [deletingPillar, setDeletingPillar] = useState<string | null>(null);
  const [historyPillar, setHistoryPillar] = useState<string | null>(null);
  const [addingPillar, setAddingPillar] = useState(false);
  const [pillarDraft, setPillarDraft] = useState<PillarDraft>(blankPillarDraft());
  const pillarActor = attorneyPillarActor(CURRENT_USER);
  const caseDocumentNames = Array.from(
    new Set([...documents.map((d) => d.name), ...pillars.flatMap((p) => p.docs)]),
  ).sort((a, b) => a.localeCompare(b));
  const deletingPillarItem = pillars.find((p) => p.id === deletingPillar) ?? null;
  const historyPillarItem = pillars.find((p) => p.id === historyPillar) ?? null;

  const savePillar = (item: PillarItem, draft: PillarDraft) => {
    if (!pillarStore) return;
    const docs = draft.docs;
    pillarStore.updatePillar(
      item.id,
      {
        title: draft.title.trim() || item.title,
        subtitle: draft.subtitle,
        body: draft.body,
        docs,
        // A pillar that now cites a different set of documents says so in its
        // count, but never below the number it actually lists.
        docCount: docs.length === item.docs.length ? item.docCount : Math.max(item.docCount - item.docs.length, 0) + docs.length,
      },
      pillarActor,
    );
    setEditingPillar(null);
  };

  const addPillar = (draft: PillarDraft) => {
    if (!pillarStore) return;
    const docs = draft.docs;
    pillarStore.createPillar(
      {
        id: `pillar-${Math.round(performance.now())}-${Math.random().toString(36).slice(2, 6)}`,
        title: draft.title.trim(),
        subtitle: draft.subtitle,
        body: draft.body,
        // Written by the attorney, so there is no AI summary or confidence to
        // show — the card omits both rather than borrowing another pillar's.
        insight: "",
        confidence: 0,
        docs,
        docCount: docs.length,
        iconKey: "scale",
      },
      pillarActor,
    );
    setAddingPillar(false);
  };

  // Which pillar cards have their Supporting Documents AI summary expanded.
  const [pillarExpand, setPillarExpand] = useState<Set<number>>(new Set());
  const togglePillar = (i: number) =>
    setPillarExpand((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <>
    <div className="w-full space-y-5">

      {/* ── AI Assessment (≈31%, sticky, left) + Negligence Analysis (≈69%, right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[31fr_69fr] gap-6 items-start">

      {/* AI assessment card — on the left, sticky while the pillars scroll */}
      <div className="lg:sticky lg:top-[176px] self-start lg-card p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-deep" strokeWidth={1.75} />
          <h3 className="card-title" style={{ fontSize: "18px" }}>Why This Constitutes Negligence</h3>
        </div>
        <div className="flex flex-col items-center gap-5">
          <ConfidenceRing value={98.4} />
          <ul className="space-y-2.5 w-full">
            {AI_REASONING.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                <span className="body-text leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <button onClick={() => goTo("liability")} className="btn btn-primary w-full gap-2 mt-6">
          Proceed to Violations <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Negligence Analysis — pillars as compact cards, two per row when the
          panel is wide enough (measured on the panel, not the window) */}
      <div className="min-w-0 lg-card bg-offwhite p-6 @container">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 className="section-header">Negligence Analysis</h2>
          {pillarStore && !addingPillar && (
            <button
              onClick={() => { setEditingPillar(null); setPillarDraft(blankPillarDraft()); setAddingPillar(true); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Pillar
            </button>
          )}
        </div>
        {addingPillar && (
          <div className="mb-4">
            <PillarForm
              title="Add Negligence Pillar"
              no={String(pillars.length + 1).padStart(2, "0")}
              draft={pillarDraft}
              setDraft={setPillarDraft}
              onCancel={() => setAddingPillar(false)}
              onSave={() => addPillar(pillarDraft)}
              saveLabel="Add Pillar"
              available={caseDocumentNames}
            />
          </div>
        )}
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
          {pillars.map((p, i) => {
            const shown = p.docs.slice(0, 1);
            const more = p.docCount - shown.length;
            const Icon = pillarIcon(p.iconKey);
            const changed = p.provenance !== "ai-generated";

            if (editingPillar === p.id && pillarStore) {
              return (
                <PillarForm
                  key={p.id}
                  title={`Edit ${p.title}`}
                  no={p.no}
                  draft={pillarDraft}
                  setDraft={setPillarDraft}
                  onCancel={() => setEditingPillar(null)}
                  onSave={() => savePillar(p, pillarDraft)}
                  saveLabel="Save Changes"
                  available={caseDocumentNames}
                  onDelete={() => setDeletingPillar(p.id)}
                  onHistory={() => setHistoryPillar(p.id)}
                />
              );
            }

            return (
              <div key={p.id} className="border border-line rounded-xl bg-white p-6 flex flex-col gap-4">
                {/* Header — pillar number with Edit and icon on one line; the
                    title and question beneath */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="eyebrow text-deep">Pillar {p.no}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {pillarStore && (
                        <button
                          onClick={() => { setAddingPillar(false); setPillarDraft(pillarDraftOf(p)); setEditingPillar(p.id); }}
                          title="Edit pillar"
                          aria-label={`Edit ${p.title}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-[#8A98A3] hover:bg-tint hover:text-deep transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Edit
                        </button>
                      )}
                      <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="card-title" style={{ fontSize: "18px" }}>{p.title}</h3>
                    {changed && (
                      <span className="pill pill-neutral">
                        {p.provenance.startsWith("ai")
                          ? <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                          : <UserPlus className="w-3 h-3" strokeWidth={1.75} />}
                        {PILLAR_PROVENANCE_LABEL[p.provenance]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-deep mt-0.5">{p.subtitle}</p>
                </div>

                {/* Analysis */}
                <div>
                  <p className="body-text leading-relaxed">{p.body}</p>
                  {/* The AI read the wording as it was. Once that wording is
                      rewritten by hand, its analysis is stale and says so
                      rather than being presented as current. */}
                  {p.aiStale && (
                    <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-[#FDE6C8] bg-[#FFF7ED] px-2.5 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <p className="text-[11px] text-[#B45309] leading-relaxed">
                        This element has been edited since the AI analysed it. The AI summary and confidence below may be out of date.
                      </p>
                    </div>
                  )}
                </div>

                {/* Supporting documents — header dropdown reveals the AI summary */}
                <div className="border-t border-line pt-4">
                  <button onClick={() => togglePillar(i)} className="w-full flex items-center justify-between gap-2 mb-2.5 group">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                      <span className="text-sm font-semibold text-ink">{p.docCount} Supporting Documents</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-deep transition-transform ${pillarExpand.has(i) ? "rotate-180" : ""}`} strokeWidth={1.75} />
                  </button>
                  <div className="flex items-center gap-2 flex-wrap">
                    {shown.map((d) => (
                      <button
                        key={d}
                        onClick={() => openNeg(i, "preview")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-2.5 py-1.5 text-xs text-ink cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                      >
                        <FileTypeIcon name={d} className="w-3.5 h-3.5 text-deep shrink-0" />
                        <span className="truncate max-w-[180px]">{d}</span>
                        <FileTypeTag name={d} />
                      </button>
                    ))}
                    {more > 0 && (
                      <button
                        onClick={() => openNeg(i, "preview")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-offwhite px-2.5 py-1.5 text-xs font-medium text-deep cursor-pointer hover:border-brand hover:bg-tint hover:shadow-sm transition-all"
                      >
                        +{more} more
                      </button>
                    )}
                  </div>
                  {pillarExpand.has(i) && (
                    <div className="mt-3 rounded-lg bg-tint border border-[#D6F2F7] p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                        <span className="eyebrow text-deep">AI Summary</span>
                        {p.aiStale && <span className="pill pill-progress">May be out of date</span>}
                      </div>
                      <p className="secondary-text leading-relaxed">
                        {p.insight || "This element was written by the attorney and has not been analysed by the AI."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions — Preview / Insights open the shared Document Workspace.
                    Pinned to the bottom so cards in a row end level. */}
                <div className="mt-auto border-t border-line pt-4 flex items-center gap-2">
                  <button
                    onClick={() => openNeg(i, "preview")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview Evidence
                  </button>
                  <button
                    onClick={() => openNeg(i, "insights")}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors"
                  >
                    <Sparkles className="w-4 h-4" strokeWidth={1.75} /> View Insights
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>

    {/* Shared Document Workspace — Preview / Insights for the selected pillar's evidence */}
    <DocumentWorkspaceModal
      docs={wsOpen ? (negDocSets[wsIndex] ?? []) : null}
      noteContext={negContexts[wsIndex]}
      insights={negInsights[wsIndex]}
      contextPanel={negPanels[wsIndex]}
      initialView={wsView}
      position={wsIndex + 1}
      total={negDocSets.length}
      onPrev={() => setWsIndex((i) => Math.max(0, i - 1))}
      onNext={() => setWsIndex((i) => Math.min(negDocSets.length - 1, i + 1))}
      onClose={() => setWsOpen(false)}
      onDownload={() => {}}
    />

    {/* Confirmation before a pillar is removed, and the change history for one
        pillar. Both are dismissible and change nothing on open. */}
    {deletingPillarItem && pillarStore && (
      <DeletePillarDialog
        item={deletingPillarItem}
        onCancel={() => setDeletingPillar(null)}
        onConfirm={() => {
          pillarStore.deletePillar(deletingPillarItem.id, pillarActor, "Deleted by attorney on the Negligence stage.");
          setDeletingPillar(null);
          // The form was open on a pillar that no longer exists.
          setEditingPillar((id) => (id === deletingPillarItem.id ? null : id));
        }}
      />
    )}
    {historyPillarItem && pillarStore && (
      <PillarHistoryDrawer
        item={historyPillarItem}
        entries={pillarStore.historyFor(historyPillarItem.id)}
        onClose={() => setHistoryPillar(null)}
      />
    )}
    </>
  );
}

// ── Tab 5 — Liability Analysis ────────────────────────────────────────────────

// Severity tag → pill class for violations (Critical = red, Major = amber, Moderate = teal).
export const VIOLATION_SEVERITY_PILL: Record<string, string> = {
  Critical: "pill pill-risk",
  High: "pill pill-progress",
  Medium: "pill pill-neutral",
  Low: "pill pill-complete",
};

// The legal framework that governs every violation shown on this page.
const LEGAL_FRAMEWORK = {
  venue: "Circuit Court of Cook County, IL",
  agency: "Illinois Secretary of State · FMCSA",
  statute: "Illinois Vehicle Code (625 ILCS 5)",
};

// The violation cards live in the violations store, which owns the record
// and the operations over it. Re-exported here because the rest of the app
// has always read them from this module.
export type { ViolationCard } from "./ViolationsContext";
export const VIOLATION_CARDS = VIOLATION_SEED;

// Toggle a card id within a Set-based open/closed state.
type SetState = (updater: (prev: Set<string>) => Set<string>) => void;
const toggleId = (setter: SetState, id: string) =>
  setter((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

// ── Attorney editing of the violations ───────────────────────────────────────
// The same pattern the negligence pillars use: one Edit action per card, a form
// that replaces the card in place, and the secondary actions — delete, history —
// kept inside that form so the stage stays a reading surface.

interface ViolationDraft {
  title: string;
  description: string;
  severity: ViolationSeverity;
  statute: string;
  jurisdiction: string;
  evidence: string[];
}

const violationDraftOf = (v: ViolationItem): ViolationDraft => ({
  title: v.title,
  description: v.description,
  severity: v.severity,
  statute: v.statute,
  jurisdiction: v.jurisdiction,
  evidence: [...v.evidence],
});

const blankViolationDraft = (jurisdiction: string): ViolationDraft => ({
  title: "", description: "", severity: "Medium", statute: "", jurisdiction, evidence: [],
});

// The violation form, used both for editing an existing violation and adding a
// new one. Same fields either way, so the two cannot drift apart.
function ViolationForm({
  title, draft, setDraft, onCancel, onSave, saveLabel, available, statutes, onDelete, onHistory,
}: {
  title: string;
  draft: ViolationDraft;
  setDraft: (d: ViolationDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  /** Every document on the case, for the evidence picker. */
  available: string[];
  /** Every statute the case already references. */
  statutes: string[];
  onDelete?: () => void;
  onHistory?: () => void;
}) {
  const set = (k: "title" | "description" | "jurisdiction") => (v: string) => setDraft({ ...draft, [k]: v });
  const valid = draft.title.trim().length > 0;
  const field = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors";
  return (
    <div className="border border-[#D6F2F7] rounded-xl bg-[#F6FDFF] p-5 flex flex-col gap-3">
      <div className="eyebrow text-deep">{title}</div>

      <PillarField label="Violation" value={draft.title} onChange={set("title")} placeholder="Enter violation title" />
      <PillarField label="Description" value={draft.description} onChange={set("description")} rows={3} placeholder="Describe the conduct at issue…" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="eyebrow block mb-1">Severity</label>
          <select
            value={draft.severity}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value as ViolationSeverity })}
            className={field}
          >
            {VIOLATION_SEVERITIES.map((sv) => <option key={sv} value={sv}>{sv}</option>)}
          </select>
        </div>
        <PillarField label="Jurisdiction" value={draft.jurisdiction} onChange={set("jurisdiction")} />
      </div>

      {/* The statutes the case already cites — its own and the alternatives the
          AI considered — rather than a list invented for the picker. */}
      <div>
        <label className="eyebrow block mb-1">Applied Legal Statute</label>
        <select
          value={statutes.includes(draft.statute) ? draft.statute : "__custom"}
          onChange={(e) => setDraft({ ...draft, statute: e.target.value === "__custom" ? "" : e.target.value })}
          className={`${field} mb-1.5`}
        >
          {statutes.map((st) => <option key={st} value={st}>{st}</option>)}
          <option value="__custom">Other statute…</option>
        </select>
        <input
          value={draft.statute}
          onChange={(e) => setDraft({ ...draft, statute: e.target.value })}
          placeholder="625 ILCS 5/11-000 — Statute title"
          className={field}
        />
        <p className="text-[11px] text-[#8A98A3] mt-1">
          Choose a statute the case already cites, or enter another. Keep the code — title format.
        </p>
      </div>

      <EvidenceEditor
        docs={draft.evidence}
        onChange={(evidence) => setDraft({ ...draft, evidence })}
        available={available}
        subject="violation"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <div className="flex items-center gap-3">
          {onHistory && (
            <button onClick={onHistory} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
              <History className="w-3.5 h-3.5" strokeWidth={1.75} /> History
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318] hover:text-[#96200F] transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete Violation
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button onClick={onSave} disabled={!valid} className="btn btn-primary px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Removing a violation changes the case analysis, so it is always confirmed and
// always says what happens to the evidence behind it.
function DeleteViolationDialog({
  item, onCancel, onConfirm,
}: { item: ViolationItem; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[80]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[440px] max-w-[92vw] rounded-2xl border border-line bg-white shadow-xl p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0" strokeWidth={1.75} />
          <h3 className="card-title">Delete violation?</h3>
        </div>
        <p className="body-text leading-relaxed">
          Are you sure you want to remove &ldquo;{item.title}&rdquo; from this case? This will remove the
          violation from the current case analysis.
        </p>
        {item.evidence.length > 0 && (
          <div className="rounded-xl border border-[#FDE6C8] bg-[#FFF7ED] px-3.5 py-3 mt-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-[#B45309] shrink-0" strokeWidth={1.75} />
              <span className="eyebrow text-[#B45309]">{item.evidence.length} supporting documents</span>
            </div>
            <p className="secondary-text">
              The violation's citation of this evidence is released. The documents themselves stay in the case repository.
            </p>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn btn-secondary px-3 py-2 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#B42318] hover:bg-[#96200F] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete Violation
          </button>
        </div>
      </div>
    </>
  );
}

// The change history for one violation.
function ViolationHistoryDrawer({
  item, entries, onClose,
}: { item: ViolationItem; entries: ViolationAudit[]; onClose: () => void }) {
  const newestFirst = [...entries].reverse();
  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-[70] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Violation History</div>
            <h2 className="card-title">{item.title}</h2>
            <div className="mono-ref mt-1">{item.severity} · {VIOLATION_PROVENANCE_LABEL[item.provenance]}</div>
          </div>
          <button onClick={onClose} title="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {newestFirst.length === 0 ? (
            <p className="secondary-text">
              No changes recorded. This violation is as the AI first cited it.
            </p>
          ) : (
            <div className="relative">
              {newestFirst.map((e, i) => (
                <div key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-brand mt-1.5" />
                    {i < newestFirst.length - 1 && <div className="w-px flex-1 bg-line mt-1.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">{VIOLATION_ACTION_LABEL[e.action]}</span>
                      <span className="mono-ref">{e.at}</span>
                    </div>
                    <p className="text-xs text-[#8A98A3] mt-0.5">{e.changedBy}</p>
                    {(e.action === "evidence-added" || e.action === "evidence-removed") && (
                      <div className="rounded-xl border border-line mt-2 px-3.5 py-2 flex items-center gap-1.5">
                        <span className={`text-sm font-semibold ${e.action === "evidence-added" ? "text-[#15803D]" : "text-[#B42318]"}`}>
                          {e.action === "evidence-added" ? "+" : "−"}
                        </span>
                        <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
                        <span className="mono-ref text-ink">{e.next ?? e.previous}</span>
                      </div>
                    )}
                    {e.previous !== undefined && e.next !== undefined && e.action !== "created" && e.action !== "deleted" && (
                      <div className="rounded-xl border border-line divide-y divide-line mt-2">
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">Previous</div>
                          <p className="body-text leading-relaxed">{e.previous || "—"}</p>
                        </div>
                        <div className="px-3.5 py-2">
                          <div className="eyebrow mb-0.5">New</div>
                          <p className="body-text leading-relaxed font-medium">{e.next || "—"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function LiabilityAnalysisTab({ goTo, documents }: TabProps) {
  const [statuteOpen, setStatuteOpen] = useState<Set<string>>(new Set());
  const [similarOpen, setSimilarOpen] = useState<Set<string>>(new Set());
  const [docsOpen, setDocsOpen] = useState<Set<string>>(new Set());

  // Shared Document Workspace — Preview / Insights for each violation's evidence
  // (mirrors the Negligence Analysis cards).
  const [wsOpen, setWsOpen] = useState(false);
  const [wsIndex, setWsIndex] = useState(0);
  const [wsView, setWsView] = useState<"preview" | "insights">("preview");
  const docForFile = buildDocResolver(documents);
  // The violations, live. The cards, the workspace and the summary all read
  // this one list, so an edit reaches them together.
  const violationStore = useViolationsOptional();
  const violations = violationStore?.violations ?? VIOLATION_SEED;
  const violationDocSets = violations.map((v) => v.evidence.map(docForFile));
  const violationContexts = violations.map((v) => ({ contextType: "Violation", reference: v.title }));
  const violationInsights = violations.map((v) => ({
    summary: v.aiSummary,
    keyPoints: v.evidence.map((d) => `${d.replace(/_/g, " ").replace(/\.[a-z0-9]+$/i, "")} reviewed and verified.`),
    entities: [
      { label: "Violation", value: v.title },
      { label: "Severity", value: v.severity },
      { label: "Confidence", value: `${v.confidence}%` },
    ],
    supportingDocs: v.evidence,
    confidence: { level: v.confidence >= 90 ? "High" : v.confidence >= 75 ? "Medium" : "Low", score: v.confidence },
  }));
  // Document Context Panel data for the preview rail (per violation).
  const violationPanels = violations.map((v) => ({
    summary: [
      { label: "Violation", value: v.title },
      { label: "Severity", value: v.severity },
      { label: "Jurisdiction", value: v.jurisdiction },
      { label: "Supporting Documents", value: String(v.evidence.length) },
    ],
  }));
  const openViolation = (i: number, view: "preview" | "insights" = "preview") => { setWsIndex(i); setWsView(view); setWsOpen(true); };

  const total = violations.length;
  const counts = {
    Critical: violations.filter((v) => v.severity === "Critical").length,
    High: violations.filter((v) => v.severity === "High").length,
    Medium: violations.filter((v) => v.severity === "Medium").length,
    Low: violations.filter((v) => v.severity === "Low").length,
  };

  // ── Attorney editing ─────────────────────────────────────────────────────
  // Which card is in edit mode, which is pending deletion, and whether the add
  // form is open. Every handler calls a store operation.
  const [editingViolation, setEditingViolation] = useState<string | null>(null);
  const [deletingViolation, setDeletingViolation] = useState<string | null>(null);
  const [historyViolation, setHistoryViolation] = useState<string | null>(null);
  const [addingViolation, setAddingViolation] = useState(false);
  const [violationDraft, setViolationDraft] = useState<ViolationDraft>(blankViolationDraft(LEGAL_FRAMEWORK.venue));
  const violationActor = attorneyViolationActor(CURRENT_USER);
  const deletingViolationItem = violations.find((v) => v.id === deletingViolation) ?? null;
  const historyViolationItem = violations.find((v) => v.id === historyViolation) ?? null;
  // The pool the evidence picker offers: the case's documents, plus anything a
  // violation already cites, so a citation is never dropped for being unlisted.
  const violationDocNames = Array.from(
    new Set([...documents.map((d) => d.name), ...violations.flatMap((v) => v.evidence)]),
  ).sort((a, b) => a.localeCompare(b));

  const saveViolation = (item: ViolationItem, draft: ViolationDraft) => {
    if (!violationStore) return;
    violationStore.updateViolation(
      item.id,
      {
        title: draft.title.trim() || item.title,
        description: draft.description,
        severity: draft.severity,
        statute: draft.statute.trim(),
        jurisdiction: draft.jurisdiction.trim(),
        evidence: draft.evidence,
      },
      violationActor,
    );
    setEditingViolation(null);
  };

  const addViolation = (draft: ViolationDraft) => {
    if (!violationStore) return;
    violationStore.createViolation(
      {
        id: `violation-${Math.round(performance.now())}-${Math.random().toString(36).slice(2, 6)}`,
        title: draft.title.trim(),
        severity: draft.severity,
        description: draft.description,
        jurisdiction: draft.jurisdiction.trim(),
        statute: draft.statute.trim(),
        // Cited by the attorney, so there is no AI analysis behind it — the card
        // shows none rather than borrowing another violation's.
        aiSummary: "",
        whyApplied: "",
        confidence: 0,
        evidenceStrength: "Moderate",
        similar: [],
        evidence: draft.evidence,
      },
      violationActor,
    );
    setAddingViolation(false);
  };
  // Severity cells — Low is only shown when at least one Low violation exists.
  const severityCells = ([["Critical", counts.Critical], ["High", counts.High], ["Medium", counts.Medium], ["Low", counts.Low]] as const)
    .filter(([label, n]) => label !== "Low" || n > 0);

  // ── Two-panel workspace ──────────────────────────────────────────────────
  // On desktop the stage fills the height left beneath the case header, so the
  // framework stays in view and only the violation list scrolls.
  const workspaceRef = useRef<HTMLDivElement>(null);
  const panelHeight = useWorkspacePanelHeight(workspaceRef, 480);

  return (
    <>
    <div className="w-full">
      <div
        ref={workspaceRef}
        className="grid grid-cols-1 lg:grid-cols-[31fr_69fr] gap-6 items-start lg:items-stretch"
        style={panelHeight ? { height: panelHeight } : undefined}
      >
      {/* LEFT — Applicable Legal Framework (static, ~31%). Scrolls on its own
          only if a short window cannot fit it. */}
      <aside className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
        <div className="lg-card p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-tint border border-line flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-deep" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="card-title leading-tight">Applicable Legal Framework</h2>
              <p className="secondary-text leading-snug">Legal context for every violation</p>
            </div>
          </div>

          {/* Framework facts */}
          <div className="space-y-3">
            {[
              { icon: MapPin, label: "Target Venue", value: LEGAL_FRAMEWORK.venue },
              { icon: Building2, label: "Governing Regulatory Agency", value: LEGAL_FRAMEWORK.agency },
              { icon: Gavel, label: "Applicable Legal Code", value: LEGAL_FRAMEWORK.statute },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="lg-zone rounded-xl p-3.5 flex items-start gap-2.5">
                <Icon className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                <div className="min-w-0">
                  <div className="eyebrow mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-ink leading-snug">{value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line" />

          {/* Total Violations */}
          <div className="flex items-end justify-between">
            <div>
              <div className="eyebrow mb-1">Total Violations</div>
              <div className="kpi-value leading-none">{total}</div>
            </div>
            <Hash className="w-5 h-5 text-deep shrink-0" strokeWidth={1.75} />
          </div>

          {/* Severity counts */}
          <div className={`grid gap-2 ${severityCells.length >= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {severityCells.map(([label, n]) => (
              <div key={label} className="rounded-xl border border-line bg-white p-3 flex flex-col items-center gap-1.5">
                <div className="text-lg font-bold text-ink tabular-nums leading-none">{n}</div>
                <span className={VIOLATION_SEVERITY_PILL[label]}>{label}</span>
              </div>
            ))}
          </div>

          {/* Primary CTA — review the full case journey */}
          <button
            onClick={() => goTo("evidence")}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-all"
          >
            View Case Journey
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* RIGHT — Violation cards (~69%). The heading stays put; only the list
          of cards scrolls, and reaching its end does not scroll the page. */}
      <div className="min-w-0 lg:min-h-0">
        <div className="lg-card bg-offwhite p-6 flex flex-col lg:h-full @container">
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <h2 className="page-title" style={{ fontSize: "24px" }}>Violations</h2>
          {violationStore && !addingViolation && (
            <button
              onClick={() => { setEditingViolation(null); setViolationDraft(blankViolationDraft(LEGAL_FRAMEWORK.venue)); setAddingViolation(true); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Violation
            </button>
          )}
        </div>
        <div className="lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:min-h-0 lg:-mr-3 lg:pr-3">
        {/* Compact cards, two per row when the panel is wide enough; the add
            and edit forms take the full row */}
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
        {addingViolation && violationStore && (
          <div className="lg-card p-6 @2xl:col-span-2">
            <ViolationForm
              title="Add Violation"
              draft={violationDraft}
              setDraft={setViolationDraft}
              onCancel={() => setAddingViolation(false)}
              onSave={() => addViolation(violationDraft)}
              saveLabel="Add Violation"
              available={violationDocNames}
              statutes={violationStore.statutes}
            />
          </div>
        )}
        {violations.map((v, i) => {
          const statuteShown = statuteOpen.has(v.id);
          const similarShown = similarOpen.has(v.id);
          const docsShown = docsOpen.has(v.id);
          const changed = v.provenance !== "ai-generated";

          if (editingViolation === v.id && violationStore) {
            return (
              <div key={v.id} className="lg-card p-6 @2xl:col-span-2">
                <ViolationForm
                  title={`Edit ${v.title}`}
                  draft={violationDraft}
                  setDraft={setViolationDraft}
                  onCancel={() => setEditingViolation(null)}
                  onSave={() => saveViolation(v, violationDraft)}
                  saveLabel="Save Changes"
                  available={violationDocNames}
                  statutes={violationStore.statutes}
                  onDelete={() => setDeletingViolation(v.id)}
                  onHistory={() => setHistoryViolation(v.id)}
                />
              </div>
            );
          }

          return (
            <div key={v.id} className="lg-card flex flex-col">
              {/* Header — icon, title and severity, with Edit at the right */}
              <div className="px-5 pt-5 pb-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-tint border border-line flex items-center justify-center shrink-0">
                  <Gavel className="w-[18px] h-[18px] text-deep" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap pt-1">
                  <h3 className="text-lg font-semibold text-ink leading-tight tracking-tight">{v.title}</h3>
                  <span className={VIOLATION_SEVERITY_PILL[v.severity]}>{v.severity}</span>
                  {changed && (
                    <span className="pill pill-neutral">
                      {v.provenance.startsWith("ai")
                        ? <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                        : <UserPlus className="w-3 h-3" strokeWidth={1.75} />}
                      {VIOLATION_PROVENANCE_LABEL[v.provenance]}
                    </span>
                  )}
                </div>
                {violationStore && (
                  <button
                    onClick={() => { setAddingViolation(false); setViolationDraft(violationDraftOf(v)); setEditingViolation(v.id); }}
                    title="Edit violation"
                    aria-label={`Edit ${v.title}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-[#8A98A3] hover:bg-tint hover:text-deep transition-colors shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Edit
                  </button>
                )}
              </div>

              {/* Body — description, then the violation's facts */}
              <div className="px-5 pb-5 space-y-5">
                <div className="min-w-0">
                  <p className="body-text leading-relaxed">{v.description}</p>
                  {/* The AI read the wording as it was. Once it is rewritten by
                      hand, its summary and confidence are stale and say so. */}
                  {v.aiStale && (
                    <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-[#FDE6C8] bg-[#FFF7ED] px-2.5 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <p className="text-[11px] text-[#B45309] leading-relaxed">
                        This violation has been edited since the AI analysed it. The AI summary and confidence below may be out of date.
                      </p>
                    </div>
                  )}
                </div>

                {/* Metadata — Location and Applied Legal Statute side by side,
                    Supporting Documents beneath them with the full card width */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 eyebrow mb-1.5">
                      <MapPin className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Location
                    </div>
                    <div className="text-sm font-semibold text-ink leading-snug">{v.jurisdiction}</div>
                  </div>

                  {/* Applied Legal Statute — statute code only; click to expand reasoning */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 eyebrow mb-1.5">
                      <Gavel className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Applied Legal Statute
                    </div>
                    <button
                      onClick={() => toggleId(setStatuteOpen, v.id)}
                      aria-expanded={statuteShown}
                      className="flex items-center gap-1 text-sm font-semibold text-ink hover:text-deep transition-colors text-left"
                    >
                      {v.statute.split(" — ")[0]}
                      <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform duration-200 ${statuteShown ? "rotate-180" : ""}`} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* Supporting Documents */}
                  <div className="col-span-2 min-w-0">
                    <div className="flex items-center gap-1.5 eyebrow mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} /> Supporting Documents ({v.evidence.length})
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                      <span className="mono-ref truncate max-w-full" title={v.evidence[0]}>{v.evidence[0]}</span>
                      {v.evidence.length > 1 && (
                        <button
                          onClick={() => toggleId(setDocsOpen, v.id)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-deep hover:text-ink transition-colors"
                        >
                          {docsShown ? "Show less" : `+${v.evidence.length - 1} More`}
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${docsShown ? "rotate-180" : ""}`} strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                    {docsShown && v.evidence.length > 1 && (
                      <div className="space-y-1.5 mt-1.5">
                        {v.evidence.slice(1).map((doc) => (
                          <div key={doc} className="flex items-center gap-2 rounded-lg bg-white border border-line px-2.5 py-1.5 min-w-0">
                            <FileTypeIcon name={doc} className="w-3.5 h-3.5 text-deep shrink-0" /><span className="mono-ref truncate" title={doc}>{doc}</span> <FileTypeTag name={doc} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Applied Legal Statute — expanded reasoning */}
                {statuteShown && (
                  <div className="rounded-xl border border-line p-4 space-y-3 bg-offwhite">
                    <div className="rounded-lg bg-[#F6FDFF] border border-[#D6F2F7] p-3.5">
                      <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} /><span className="eyebrow text-deep">AI Summary</span></div>
                      <p className="secondary-text">{v.aiSummary}</p>
                    </div>
                    <div>
                      <div className="eyebrow mb-1">Why This Statute Applies</div>
                      <p className="secondary-text">{v.whyApplied}</p>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-line bg-white px-3.5 py-2.5">
                      <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-deep" strokeWidth={1.75} /><span className="eyebrow">Confidence Score</span></div>
                      <span className="text-sm font-bold text-ink tabular-nums">{v.confidence}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer — pinned to the bottom so cards in a row end level:
                  Similar Statutes, then Preview / Insights */}
              <div className="mt-auto border-t border-line px-5 py-4 space-y-3">
                <button
                  onClick={() => toggleId(setSimilarOpen, v.id)}
                  aria-expanded={similarShown}
                  className="w-full flex items-center justify-between gap-2 text-sm font-medium text-deep hover:text-ink transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Scale className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Want to see similar statutes considered?
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform duration-200 ${similarShown ? "" : "-rotate-90"}`} strokeWidth={1.75} />
                </button>

                {/* Similar Statutes — collapsed by default */}
                {similarShown && (
                  <div className="space-y-2">
                    {v.similar.map((s) => (
                      <div key={s.name} className="rounded-lg border border-line bg-offwhite p-3.5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-1.5"><Scale className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />{s.name}</div>
                        <p className="secondary-text mb-1"><span className="font-medium text-ink">Considered:</span> {s.reasonConsidered}</p>
                        <p className="secondary-text"><span className="font-medium text-ink">Not selected:</span> {s.whyNot}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openViolation(i, "preview")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-line text-deep text-sm font-medium hover:bg-wash transition-all"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview Evidence
                  </button>
                  <button
                    onClick={() => openViolation(i, "insights")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-all"
                  >
                    <Sparkles className="w-4 h-4" strokeWidth={1.75} /> View Insights
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>
        </div>
        </div>
      </div>
      </div>
    </div>

    {/* Shared Document Workspace — Preview / Insights for the selected violation's evidence */}
    <DocumentWorkspaceModal
      docs={wsOpen ? (violationDocSets[wsIndex] ?? []) : null}
      noteContext={violationContexts[wsIndex]}
      contextPanel={violationPanels[wsIndex]}
      insights={violationInsights[wsIndex]}
      initialView={wsView}
      position={wsIndex + 1}
      total={violationDocSets.length}
      onPrev={() => setWsIndex((i) => Math.max(0, i - 1))}
      onNext={() => setWsIndex((i) => Math.min(violationDocSets.length - 1, i + 1))}
      onClose={() => setWsOpen(false)}
      onDownload={() => {}}
    />

    {/* Confirmation before a violation is removed, and the change history for
        one violation. Both are dismissible and change nothing on open. */}
    {deletingViolationItem && violationStore && (
      <DeleteViolationDialog
        item={deletingViolationItem}
        onCancel={() => setDeletingViolation(null)}
        onConfirm={() => {
          violationStore.deleteViolation(deletingViolationItem.id, violationActor);
          setDeletingViolation(null);
          // The form was open on a violation that no longer exists.
          setEditingViolation((id) => (id === deletingViolationItem.id ? null : id));
        }}
      />
    )}
    {historyViolationItem && violationStore && (
      <ViolationHistoryDrawer
        item={historyViolationItem}
        entries={violationStore.historyFor(historyViolationItem.id)}
        onClose={() => setHistoryViolation(null)}
      />
    )}
    </>
  );
}

// ── Tab 6 — Evidence Repository ───────────────────────────────────────────────

const EVIDENCE_GROUPS: { name: string; icon: any; match: RegExp }[] = [
  { name: "Medical Records", icon: Stethoscope, match: /(mri|er_|hospital|medical|therapy|treatment|discharge|physical|radiology|bills)/ },
  { name: "Police Reports", icon: FileText, match: /(police|accident|incident|citation|crash|report)/ },
  { name: "Witness Statements", icon: MessageSquare, match: /(witness|statement)/ },
  { name: "Insurance & Financial", icon: DollarSign, match: /(insurance|policy|wage|loss|claim)/ },
  { name: "Photos", icon: ImageIcon, match: /\.(jpg|jpeg|png|gif|webp)$|photo|image|scene/ },
  { name: "Videos", icon: Video, match: /\.(mp4|mov|avi|webm)$|video|dashcam/ },
];

export function EvidenceRepositoryTab({ documents }: TabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const q = search.trim().toLowerCase();
  const classify = (name: string) => EVIDENCE_GROUPS.find((g) => g.match.test(name.toLowerCase()))?.name ?? "Other Documents";

  const visible = documents.filter((d) => (!q || d.name.toLowerCase().includes(q)) && (filter === "All" || classify(d.name) === filter));
  const groupNames = [...EVIDENCE_GROUPS.map((g) => g.name), "Other Documents"];
  const grouped = groupNames
    .map((name) => ({ name, icon: EVIDENCE_GROUPS.find((g) => g.name === name)?.icon ?? FileText, docs: visible.filter((d) => classify(d.name) === name) }))
    .filter((g) => g.docs.length > 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Section title="Evidence Repository" description="Every verified document supporting the case, organized by type. Preview, inspect insights, or download.">
        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full bg-white border border-line rounded-lg pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white border border-line rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand transition-colors">
            <option value="All">All Types</option>
            {groupNames.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>

        {grouped.length === 0 ? (
          <div className="lg-card flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-8 h-8 text-soft mb-3" strokeWidth={1.75} />
            <p className="text-sm font-medium text-ink">No documents match</p>
            <p className="secondary-text mt-1">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.name}>
                <div className="flex items-center gap-2 mb-3">
                  <g.icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  <h3 className="card-title">{g.name}</h3>
                  <span className="pill pill-neutral">{g.docs.length}</span>
                </div>
                <div className="lg-card divide-y divide-line">
                  {g.docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                        <FileTypeIcon name={d.name} className="w-4 h-4 text-deep" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink truncate">{d.name}</div>
                        <div className="mono-ref flex items-center gap-2"><FileTypeTag name={d.name} />{d.source} · {d.date}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button title="Preview" className="p-2 rounded-lg text-[#5B6B78] hover:text-deep hover:bg-tint transition-colors"><Eye className="w-4 h-4" strokeWidth={1.75} /></button>
                        <button title="Insights" className="p-2 rounded-lg text-[#5B6B78] hover:text-deep hover:bg-tint transition-colors"><Lightbulb className="w-4 h-4" strokeWidth={1.75} /></button>
                        <button title="Download" className="p-2 rounded-lg text-[#5B6B78] hover:text-deep hover:bg-tint transition-colors"><Download className="w-4 h-4" strokeWidth={1.75} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Tab 7 — Intelligence ──────────────────────────────────────────────────────
// Litigation intelligence dashboard: coverage & deadline posture, the settlement
// corridor, an AI valuation brief, comparable verdicts, a negligence audit, and
// attorney trial-prep directives — all built from the existing case model.

export const POLICY_LIMIT = 2_000_000;

// ── Corridor simulation — AI processing steps, context graph, and result ──
const CORRIDOR_STEPS = [
  "Reading verified case evidence…",
  "Mapping negligence findings…",
  "Loading jurisdiction & venue…",
  "Analyzing insurance coverage…",
  "Searching comparable verdicts…",
  "Building legal context graph…",
  "Computing settlement corridor…",
  "Selecting optimal litigation strategy…",
];

// Context-graph nodes (positions in % of the panel) and the links between them.
const GRAPH_NODES: { label: string; x: number; y: number }[] = [
  { label: "Case Evidence", x: 50, y: 12 },
  { label: "Negligence", x: 16, y: 32 },
  { label: "Damages", x: 84, y: 32 },
  { label: "Insurance Policy", x: 13, y: 64 },
  { label: "Jurisdiction", x: 50, y: 47 },
  { label: "Historical Cases", x: 87, y: 64 },
  { label: "Settlement Strategy", x: 50, y: 84 },
];
const GRAPH_EDGES: [number, number][] = [[0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [4, 6], [0, 1], [0, 2], [3, 6], [5, 6]];

// Simulation output — the actuarial loss corridor.
const CORRIDOR_RESULT = {
  rapid: 242_175,
  recommended: 1_775_950,
  maximum: 2_663_925,
  confidence: 94,
  matchedCases: 12,
};

// The AI's reasoning behind the recommended strategy — the factors it weighed.
const VALUATION_BRIEF: { label: string; icon: any; text: string }[] = [
  { label: "Damages", icon: DollarSign, text: "Verified economic damages plus permanent, MRI-documented injuries support a high non-economic multiplier." },
  { label: "Liability", icon: Scale, text: "Officer fault determination and a corroborated red-light violation leave little room to contest fault." },
  { label: "Jurisdiction", icon: MapPin, text: "Cook County venue trends plaintiff-favorable for commercial-carrier intersection collisions." },
  { label: "Precedent Matches", icon: Gavel, text: "Three closely-matched local verdicts cluster near the recommended value, anchoring the corridor." },
  { label: "Policy Limits", icon: ShieldCheck, text: "Confirmed $2.0M commercial policy makes a full policy-informed recovery realistic and collectible." },
];

// Local comparable verdicts / settlements matched to this case profile. `labels`
// are the short category chips shown above each card.
type ComparableFilterKey = "injuryType" | "severity" | "jurisdiction" | "violation" | "legalStatute" | "caseType";

type ComparableVerdict = {
  caseName: string;
  amount: number;
  summary: string;
  matchScore: number;
  labels: string[];
  tags: string[];
  whyThisMatters: string;
  similarityBreakdown: { label: string; contribution: number; explanation: string }[];
  filterValues: Record<ComparableFilterKey, string>;
  jurisdictionState: string;
};

const COMPARABLE_FILTERS: { key: ComparableFilterKey; label: string; allLabel: string }[] = [
  { key: "injuryType", label: "Injury Type", allLabel: "All injury types" },
  { key: "severity", label: "Severity", allLabel: "All severity levels" },
  { key: "jurisdiction", label: "Jurisdiction", allLabel: "All jurisdictions" },
  { key: "violation", label: "Violation", allLabel: "All violations" },
  { key: "legalStatute", label: "Legal Statute", allLabel: "All statutes" },
  { key: "caseType", label: "Case Type", allLabel: "All case types" },
];

export const COMPARABLE_VERDICTS: ComparableVerdict[] = [
  {
    caseName: "Reyes v. Interstate Freight Lines",
    amount: 1_750_000,
    summary: "Commercial truck entered a controlled intersection against the signal; plaintiff sustained multi-level cervical herniations requiring ongoing care.",
    matchScore: 94,
    labels: ["Commercial Vehicle", "Cervical Injury"],
    tags: ["Red-light violation", "Commercial vehicle", "Cervical injury", "Cook County"],
    whyThisMatters: "This precedent is a strong match because the liability narrative, cervical injury pattern, and venue profile align closely with the current case and support a policy-informed settlement corridor.",
    similarityBreakdown: [
      { label: "Jurisdiction", contribution: 18, explanation: "Same Cook County jurisdiction" },
      { label: "Injury Type", contribution: 22, explanation: "Cervical injury pattern" },
      { label: "Injury Severity", contribution: 20, explanation: "Severe, ongoing impairment and care" },
      { label: "Liability", contribution: 16, explanation: "Strong red-light violation evidence" },
      { label: "Long-Term Impact", contribution: 10, explanation: "Similar long-term medical impact" },
      { label: "Case Context", contribution: 8, explanation: "Comparable commercial vehicle matter" },
    ],
    filterValues: { injuryType: "Cervical Injury", severity: "Severe", jurisdiction: "Cook County", violation: "Red-light violation", legalStatute: "Commercial vehicle", caseType: "Commercial Vehicle" },
    jurisdictionState: "Illinois",
  },
  {
    caseName: "Donovan v. Metro Cartage Co.",
    amount: 1_420_000,
    summary: "Failure-to-yield collision with a delivery vehicle; disputed liability resolved on the responding officer's fault determination.",
    matchScore: 89,
    labels: ["Commercial Vehicle", "Disputed Liability"],
    tags: ["Failure to yield", "Officer fault", "Disputed liability"],
    whyThisMatters: "This case is useful because it reflects a comparable commercial-carrier crash with a disputed liability posture, showing how a strong liability narrative can still support a meaningful recovery.",
    similarityBreakdown: [
      { label: "Jurisdiction", contribution: 12, explanation: "Comparable venue profile" },
      { label: "Injury Type", contribution: 18, explanation: "Comparable collision injury pattern" },
      { label: "Injury Severity", contribution: 17, explanation: "Meaningful injury with ongoing care" },
      { label: "Liability", contribution: 17, explanation: "Officer fault determination" },
      { label: "Long-Term Impact", contribution: 14, explanation: "Comparable recovery implications" },
      { label: "Case Context", contribution: 11, explanation: "Similar commercial-carrier crash" },
    ],
    filterValues: { injuryType: "Delivery Vehicle Collision", severity: "Moderate", jurisdiction: "Not specified", violation: "Failure to yield", legalStatute: "Officer fault", caseType: "Commercial Vehicle" },
    jurisdictionState: "Illinois",
  },
  {
    caseName: "Whitfield v. Prairie Logistics",
    amount: 1_180_000,
    summary: "Intersection crash producing permanent impairment; carrier policy limits framed the settlement corridor.",
    matchScore: 85,
    labels: ["Permanent Impairment", "Policy-Limit"],
    tags: ["Permanent impairment", "Policy-limit demand", "MVA"],
    whyThisMatters: "This precedent is relevant because it demonstrates how permanent impairment and policy-limit exposure can shape settlement leverage in a similar commercial vehicle matter.",
    similarityBreakdown: [
      { label: "Jurisdiction", contribution: 11, explanation: "Comparable venue profile" },
      { label: "Injury Type", contribution: 16, explanation: "Comparable impairment pattern" },
      { label: "Injury Severity", contribution: 19, explanation: "Permanent impairment" },
      { label: "Liability", contribution: 14, explanation: "Comparable liability posture" },
      { label: "Long-Term Impact", contribution: 15, explanation: "Similar lasting medical impact" },
      { label: "Case Context", contribution: 10, explanation: "Similar policy-limit MVA context" },
    ],
    filterValues: { injuryType: "Permanent Impairment", severity: "Severe", jurisdiction: "Not specified", violation: "Policy-limit demand", legalStatute: "Policy-limit demand", caseType: "Motor Vehicle" },
    jurisdictionState: "Illinois",
  },
];

// Attorney action checklist generated from case intelligence.
const TRIAL_DIRECTIVES: { title: string; icon: any; items: string[] }[] = [
  { title: "Recommended Depositions", icon: MessageSquare, items: ["Defendant commercial driver", "Responding officer (fault determination)", "Corroborating eyewitness", "Carrier corporate representative"] },
  { title: "Expert Witnesses", icon: User, items: ["Accident reconstructionist", "Treating neurosurgeon", "Life-care planner", "Vocational economist"] },
  { title: "Discovery Priorities", icon: Search, items: ["Driver qualification & hours-of-service logs", "Telematics / ELD and dashcam data", "Carrier maintenance & training records", "Intersection signal-timing records"] },
  { title: "Trial Preparation", icon: ClipboardList, items: ["Prepare demonstrative reconstruction exhibits", "Draft motions in limine on comparative fault", "Assemble the medical-chronology exhibit binder", "Develop jury themes on commercial-carrier negligence"] },
];

export function DemandPackageTab({ model, goTo, onGenerateDemand }: TabProps) {
  // "Generated From" label + numeric estimate for whichever strategy is active
  // when a demand package is generated (used by both Generate Demand CTAs below).
  const strategyStageLabel: Record<"negotiation" | "settlement" | "trial", string> = {
    negotiation: "Negotiation Strategy",
    settlement: "Settlement Strategy",
    trial: "Trial Strategy",
  };
  const consumption = Math.round((model.recommendedSettlement / POLICY_LIMIT) * 100);
  const dashboard = [
    { icon: ShieldCheck, label: "Policy Coverage", value: formatUSD(POLICY_LIMIT), sub: "Commercial auto liability limit" },
    { icon: DollarSign, label: "Verified Economic Damages", value: formatUSD(model.economicTotal), sub: "Documented & reconciled" },
    { icon: SlidersHorizontal, label: "Coverage Consumption", value: `${consumption}%`, sub: "of available policy limit", bar: consumption },
    { icon: Calendar, label: "Filing Deadline", value: "Feb 14, 2028", sub: "Statute of limitations · ≈19 mo left" },
  ];

  // The three strategy paths the AI weighed — Settlement (recommended) sits in the middle.
  const strategyOptions = [
    { key: "Negotiation", label: "Rapid Exit Strategy", icon: MessageSquare, value: `${formatCompact(model.estimatedLow)} – ${formatCompact(model.recommendedSettlement)}`, desc: "Trade demands to close above the corridor midpoint.", recommended: false },
    { key: "Settlement", label: "Median Target (Recommended)", icon: DollarSign, value: formatCompact(model.recommendedSettlement), desc: "Resolve pre-suit at the policy-informed value — strongest risk-adjusted recovery.", recommended: true },
    { key: "Trial", label: "Max Litigation Strategy", icon: Gavel, value: formatCompact(POLICY_LIMIT), desc: "Highest exposure, but added cost and timeline risk.", recommended: false },
  ];

  const supportingFindings = [
    {
      title: "Duty & Breach Established",
      confidence: 96,
      summary: "The duty of care was clearly established and the record shows repeated breaches through unsafe operation, failure to preserve safe conditions, and disregard for known roadway hazards.",
      takeaways: ["Duty of care is well documented.", "Operational breaches are clearly traceable.", "Liability themes remain straightforward and persuasive."],
    },
    {
      title: "Direct Medical Link",
      confidence: 94,
      summary: "The negligence sequence directly aligns with the plaintiff's injuries, with documented clinical deterioration and ongoing treatment that ties the harm to the incident rather than to pre-existing conditions alone.",
      takeaways: ["Injury causation is strongly supported.", "Medical records reinforce a direct link.", "The damages narrative is well anchored in evidence."],
    },
    {
      title: "Regulatory Violations Confirmed",
      confidence: 95,
      summary: "Traffic and safety violations materially reinforce the liability case by showing objective statutory and regulatory noncompliance that strengthens the plaintiff's narrative of unreasonable conduct.",
      takeaways: ["Regulatory breaches are confirmed.", "Violations strengthen fault findings.", "The record supports a robust liability argument."],
    },
    {
      title: "Litigation Advantage",
      confidence: 93,
      summary: "Taken together, the negligence findings, medical linkage, and confirmed violations create significant settlement leverage and materially increase defense exposure in a plaintiff-favorable venue.",
      takeaways: ["Settlement leverage is materially stronger.", "Defense exposure is meaningfully elevated.", "The case posture supports an assertive strategy."],
    },
  ];

  // ── Corridor simulation state machine: idle → analyzing → done ──
  const [corridorPhase, setCorridorPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const [corridorStep, setCorridorStep] = useState(0);
  const [showGraph, setShowGraph] = useState(false); // done-state toggle: strategy ↔ context graph
  const [selectedPrecedent, setSelectedPrecedent] = useState<(typeof COMPARABLE_VERDICTS)[number] | null>(null);
  const [precedentChatOpen, setPrecedentChatOpen] = useState(false);
  const [similarityBreakdownOpen, setSimilarityBreakdownOpen] = useState<string | null>(null);
  const [precedentWhyOpen, setPrecedentWhyOpen] = useState<string | null>(null);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseFiltersOpen, setCaseFiltersOpen] = useState(false);
  const [draftCaseFilters, setDraftCaseFilters] = useState<Record<ComparableFilterKey, string>>({
    injuryType: "",
    severity: "",
    jurisdiction: "",
    violation: "",
    legalStatute: "",
    caseType: "",
  });
  const [draftJurisdictionState, setDraftJurisdictionState] = useState("");
  const [jurisdictionState, setJurisdictionState] = useState("");
  const [caseFilters, setCaseFilters] = useState<Record<ComparableFilterKey, string>>({
    injuryType: "",
    severity: "",
    jurisdiction: "",
    violation: "",
    legalStatute: "",
    caseType: "",
  });
  const [supportingFindingsOpen, setSupportingFindingsOpen] = useState<Record<string, boolean>>({});

  const normalizedCaseSearch = caseSearch.trim().toLowerCase();
  const visibleComparableVerdicts = COMPARABLE_VERDICTS.filter((v) => {
    const searchableText = [
      v.caseName,
      v.summary,
      v.whyThisMatters,
      ...v.labels,
      ...v.tags,
      ...Object.values(v.filterValues),
    ].join(" ").toLowerCase();
    const matchesSearch = !normalizedCaseSearch || searchableText.includes(normalizedCaseSearch);
    const matchesFilters = COMPARABLE_FILTERS.every(({ key }) => {
      const selected = caseFilters[key].trim().toLowerCase();
      if (!selected) return true;
      const value = v.filterValues[key].toLowerCase();
      return ["injuryType", "violation", "legalStatute"].includes(key) ? value.includes(selected) : value === selected;
    }) &&
      (!jurisdictionState || v.jurisdictionState === jurisdictionState);
    return matchesSearch && matchesFilters;
  });
  const hasCaseDiscovery = Boolean(normalizedCaseSearch || Object.values(caseFilters).some(Boolean) || jurisdictionState);
  const activeCaseFilters = COMPARABLE_FILTERS.filter(({ key }) => caseFilters[key]);
  const jurisdictionStates = [...new Set(COMPARABLE_VERDICTS.map((v) => v.jurisdictionState))];
  const jurisdictionCounties = draftJurisdictionState
    ? [...new Set(COMPARABLE_VERDICTS.filter((v) => v.jurisdictionState === draftJurisdictionState && v.filterValues.jurisdiction !== "Not specified").map((v) => v.filterValues.jurisdiction))]
    : [];
  const clearCaseFilters = () => {
    const emptyFilters = { injuryType: "", severity: "", jurisdiction: "", violation: "", legalStatute: "", caseType: "" };
    setCaseFilters(emptyFilters);
    setDraftCaseFilters(emptyFilters);
    setJurisdictionState("");
    setDraftJurisdictionState("");
  };

  // Lock background scroll while the precedent drawer is open, so the dimmed
  // backdrop always covers the full viewport regardless of scroll position.
  useEffect(() => {
    document.body.style.overflow = selectedPrecedent ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedPrecedent]);

  const [showStrategyDashboard, setShowStrategyDashboard] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<"negotiation" | "settlement" | "trial">("settlement");
  const openStrategyDashboard = (strategy: "negotiation" | "settlement" | "trial") => {
    setSelectedStrategy(strategy);
    setShowStrategyDashboard(true);
  };
  const closeStrategyDashboard = () => setShowStrategyDashboard(false);
  const strategyProfiles = {
    negotiation: {
      key: "negotiation" as const,
      title: "High-Velocity Pre-Litigation Demurrer Alignment",
      label: "Rapid Exit Strategy",
      heroTitle: "Rapid Exit Strategy (Negotiation)",
      heroSubtitle: "For Estate of Miller vs Logistics Co., the Rapid Exit Strategy bypasses extensive court dockets to target an expedited compromise of $242,175. Suited to clients seeking fast liquidity and avoiding intrusive depositions.",
      summary: "Accept pre-litigation policy cap limits instantly to minimize trial risks and lawyer retainers.",
      recommendation: "Avoid public trial exposure; secure immediate settlement payout within 30–60 days.",
      timeline: "2–3 Months",
      recovery: "$242,175",
      riskLevel: "Very Low (15%)",
      confidence: 92,
      advantage: "Avoid public trial exposure; secure immediate settlement payout within 30–60 days.",
      lever: "Policy occurrence caps; early pre-litigation package release.",
      reasons: ["Avoid public trial exposure", "Fast liquidity strategy", "Minimal deposition burden", "Policy cap leverage"],
      steps: ["Complete demand package", "Release early pre-litigation package", "Leverage policy cap limits", "Close quickly"],
      risks: ["Carrier may resist speed", "Limited ceiling under policy caps", "Need rapid evidence compilation"],
      mitigations: ["Use clear policy cap rationale", "Highlight fast settlement benefit", "Keep demands narrowly focused"],
    },
    settlement: {
      key: "settlement" as const,
      title: "Intermediate Pre-Trial Remediation & Mediation",
      label: "Median Target (Recommended)",
      heroTitle: "Median Target (Recommended)",
      heroSubtitle: "This recommended route leverages strict Care Standard violations to compel the carrier to early mediation, targeting $1,775,950. Balance carrier exhaustion points with clinical healing timelines.",
      summary: "File formal complaints and leverage liability infractions to force early mandatory mediation sessions.",
      recommendation: "Provides strong mediation pressure backed by radiographic medical and wage records.",
      timeline: "6–9 Months",
      recovery: "$1,775,950",
      riskLevel: "Moderate (45%)",
      confidence: 94,
      advantage: "Provides strong mediation pressure backed by radiographic medical and wage records.",
      lever: "Deposition threats; certified rehabilitation diagnostic summaries.",
      reasons: ["Care Standard violations leveraged", "Early mediation pressure", "Strong medical and wage record support", "Balanced recovery timeline"],
      steps: ["Prepare medical and wage dossier", "File formal complaints", "Push for early mediation", "Manage carrier exhaustion"],
      risks: ["Carrier may challenge causation", "Mediation may extend timeline", "Records review delay"],
      mitigations: ["Use strong diagnostic summaries", "Highlight carrier liability infractions", "Keep mediation agenda focused"],
    },
    trial: {
      key: "trial" as const,
      title: "Max Jury Pressure & Exemplary Punitive Multipliers",
      label: "Max Litigation Strategy",
      heroTitle: "Max Litigation Strategy (Trial)",
      heroSubtitle: "A high-pressure litigation action alleging gross negligence and corporate standard omissions for Estate of Miller vs Logistics Co. Focuses on records manipulation or fatigued operators to trigger a $2,663,925 punitive-level model.",
      summary: "Take case to wrongful death or commercial jury trial, pleading gross disregard for full punitive multipliers.",
      recommendation: "Maximizes total recovery using punitive multi-district trial exposure and statutory counts.",
      timeline: "12–24 Months",
      recovery: "$2,663,925",
      riskLevel: "High (85%)",
      confidence: 89,
      advantage: "Maximizes total recovery using punitive multi-district trial exposure and statutory counts.",
      lever: "Audited electronic charting logs; operator hour-of-service fatigue limits.",
      reasons: ["Gross negligence allegation", "High punitive exposure", "Strong trial posture", "Multi-district leverage"],
      steps: ["Prepare trial exhibits", "Audit operator logs", "Build punitive narrative", "Push toward jury exposure"],
      risks: ["High litigation cost", "Extended case duration", "Carrier trial readiness"],
      mitigations: ["Use documentary evidence", "Highlight regulatory breaches", "Focus on jury-impact themes"],
    },
  };
  const roadmapStepsByStrategy = {
    negotiation: [
      {
        number: 1,
        title: "Generate Demand Package",
        description: "Compile verified damages, negligence findings, supporting evidence, and generate the demand package.",
        status: "Ready",
        duration: "20–30 min",
        owner: "Attorney + AI",
        action: "Generate Demand",
      },
      {
        number: 2,
        title: "Issue Policy-Limit Demand",
        description: "Deliver the demand package to the defendant's insurance carrier and begin negotiations.",
        status: "In Progress",
        duration: "1–2 days",
        owner: "Attorney",
        action: "Send Demand",
      },
      {
        number: 3,
        title: "Review Carrier Response",
        description: "Compare the insurer's offer against the AI Settlement Corridor and historical precedent.",
        status: "Waiting",
        duration: "3–7 days",
        owner: "Attorney + AI",
        action: "Review Response",
      },
      {
        number: 4,
        title: "Escalate Strategy",
        description: "If negotiations fail, prepare mediation or transition into litigation based on the selected strategy.",
        status: "Blocked",
        duration: "1–2 weeks",
        owner: "Attorney",
        action: "Prepare Litigation",
      },
    ],
    settlement: [
      {
        number: 1,
        title: "Generate Demand Package",
        description: "Compile verified damages, negligence findings, supporting evidence, and generate the demand package.",
        status: "Completed",
        duration: "20–30 min",
        owner: "Attorney + AI",
        action: "Generate Demand",
      },
      {
        number: 2,
        title: "Issue Policy-Limit Demand",
        description: "Deliver the demand package to the defendant's insurance carrier and begin negotiations.",
        status: "In Progress",
        duration: "1–2 days",
        owner: "Attorney",
        action: "Send Demand",
      },
      {
        number: 3,
        title: "Review Carrier Response",
        description: "Compare the insurer's offer against the AI Settlement Corridor and historical precedent.",
        status: "Waiting",
        duration: "3–7 days",
        owner: "Attorney + AI",
        action: "Review Response",
      },
      {
        number: 4,
        title: "Prepare Mediation Agenda",
        description: "Prepare the mediation strategy and negotiate toward the recommended settlement target.",
        status: "Ready",
        duration: "3–5 days",
        owner: "Attorney",
        action: "Prepare Mediation",
      },
    ],
    trial: [
      {
        number: 1,
        title: "Generate Demand Package",
        description: "Compile verified damages, negligence findings, supporting evidence, and generate the demand package.",
        status: "Completed",
        duration: "20–30 min",
        owner: "Attorney + AI",
        action: "Generate Demand",
      },
      {
        number: 2,
        title: "Issue Policy-Limit Demand",
        description: "Deliver the demand package to the defendant's insurance carrier and begin negotiations.",
        status: "Completed",
        duration: "1–2 days",
        owner: "Attorney",
        action: "Send Demand",
      },
      {
        number: 3,
        title: "Review Carrier Response",
        description: "Compare the insurer's offer against the AI Settlement Corridor and historical precedent.",
        status: "In Progress",
        duration: "3–7 days",
        owner: "Attorney + AI",
        action: "Review Response",
      },
      {
        number: 4,
        title: "Escalate Strategy",
        description: "If negotiations fail, prepare mediation or transition into litigation based on the selected strategy.",
        status: "Waiting",
        duration: "1–2 weeks",
        owner: "Attorney",
        action: "Prepare Litigation",
      },
    ],
  } as const;
  const activeStrategy = strategyProfiles[selectedStrategy];
  const roadmapSteps = roadmapStepsByStrategy[selectedStrategy];
  const strategyOptionMap = { Negotiation: "negotiation" as const, Settlement: "settlement" as const, Trial: "trial" as const };
  const startCorridor = () => { setCorridorStep(0); setShowGraph(false); setCorridorPhase("analyzing"); };

  // Advance one processing step every ~420ms; hand off to "done" at the end.
  useEffect(() => {
    if (corridorPhase !== "analyzing") return;
    if (corridorStep >= CORRIDOR_STEPS.length) {
      const t = setTimeout(() => setCorridorPhase("done"), 550);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCorridorStep((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [corridorPhase, corridorStep]);

  // Graph helpers — nodes appear progressively while analyzing; all lit when done.
  const visibleNodes = corridorPhase === "done" ? GRAPH_NODES.length : corridorPhase === "analyzing" ? Math.min(GRAPH_NODES.length, corridorStep) : GRAPH_NODES.length;
  const matchPct = corridorPhase === "done" ? CORRIDOR_RESULT.confidence : Math.round((Math.min(corridorStep, CORRIDOR_STEPS.length) / CORRIDOR_STEPS.length) * CORRIDOR_RESULT.confidence);

  if (showStrategyDashboard) {
    return (
      <div className="space-y-8">
        <div className="lg-card p-5">
          <div className="relative flex items-center justify-between gap-3">
            <button type="button" onClick={closeStrategyDashboard} className="inline-flex items-center gap-2 text-sm font-medium text-deep hover:text-ink transition-colors">
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Intelligence
            </button>
            <div className="absolute inset-x-0 text-center section-header pointer-events-none">Intelligence Strategy Dashboard</div>
            <div className="secondary-text">Intelligence <span className="mx-1">›</span> Strategy Dashboard</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl bg-ink p-6 text-white">
            <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_0.9fr] gap-6">
              <div>
                <div className="eyebrow text-brand mb-3">Execution Strategy</div>
                <div className="page-title text-white">{activeStrategy.title}</div>
                <p className="text-soft text-sm mt-4 leading-relaxed max-w-2xl">{activeStrategy.heroSubtitle}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="eyebrow text-soft">Primary Advantage</div>
                    <div className="mt-3 text-sm leading-relaxed text-white">{activeStrategy.advantage}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="eyebrow text-soft">Strategic Lever</div>
                    <div className="mt-3 text-sm leading-relaxed text-white">{activeStrategy.lever}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-5">
                <div className="eyebrow text-brand mb-3">Outcome Model</div>
                <div className="card-title text-white">Recommended Outcome</div>
                <div className="kpi-value text-white mt-4">{activeStrategy.recovery}</div>
                <div className="text-sm text-soft mt-3">{activeStrategy.recommendation}</div>
                <button
                  type="button"
                  onClick={() => onGenerateDemand?.(strategyStageLabel[selectedStrategy], Number(activeStrategy.recovery.replace(/[^0-9.]/g, "")))}
                  className="btn btn-primary w-full mt-6 justify-center gap-2"
                >
                  Generate Demand <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.values(strategyProfiles).map((strategy) => {
              const selected = strategy.key === selectedStrategy;
              return (
                <button
                  key={strategy.key}
                  type="button"
                  onClick={() => setSelectedStrategy(strategy.key)}
                  className={`rounded-xl border p-5 text-left transition-all duration-200 ${selected ? "border-brand bg-tint shadow-sm" : "border-line bg-white hover:bg-wash"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="card-title">{strategy.label}</div>
                      <div className="kpi-value mt-3">{strategy.recovery}</div>
                    </div>
                    {strategy.key === "settlement" && (
                      <span className="pill pill-complete shrink-0"><CheckCircle className="w-3 h-3" strokeWidth={1.75} /> Recommended</span>
                    )}
                  </div>
                  <p className="secondary-text mt-4">{strategy.summary}</p>
                  <div className="grid grid-cols-2 gap-3 mt-5 text-sm text-ink">
                    <div className="rounded-xl border border-line bg-offwhite p-3">
                      <div className="eyebrow">Timeline</div>
                      <div className="mt-2 font-semibold">{strategy.timeline}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-offwhite p-3">
                      <div className="eyebrow">Risk Level</div>
                      <div className="mt-2 font-semibold">{strategy.riskLevel}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg-card bg-offwhite p-6">
            <div className="eyebrow text-deep mb-2">Execution Roadmap</div>
            <p className="secondary-text max-w-2xl">A step-by-step execution plan for the selected litigation strategy.</p>
            <div className="space-y-4 mt-6">
              {roadmapSteps.map((step) => (
                <div key={step.number} className="rounded-xl border border-line bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="card-title">{step.title}</div>
                    <span className={`pill shrink-0 ${step.status === "Completed" ? "pill-complete" : step.status === "In Progress" ? "pill-progress" : step.status === "Blocked" ? "pill-risk" : "pill-neutral"}`}>{step.status}</span>
                  </div>
                  <p className="secondary-text mt-3">{step.description}</p>
                  <div className="grid grid-cols-3 gap-3 mt-4 text-sm text-ink">
                    <div className="rounded-xl border border-line bg-offwhite p-3">
                      <div className="eyebrow">Estimated Duration</div>
                      <div className="mt-2 font-semibold">{step.duration}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-offwhite p-3">
                      <div className="eyebrow">Owner</div>
                      <div className="mt-2 font-semibold">{step.owner}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-offwhite p-3">
                      <div className="eyebrow">Next Action</div>
                      <div className="mt-2 font-semibold">{step.action}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg-card p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="eyebrow text-deep mb-3">Potential Risks</div>
              <ul className="space-y-2">
                {activeStrategy.risks.map((risk) => (
                  <li key={risk} className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                    <span className="body-text leading-snug">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="eyebrow text-deep mb-3">Mitigation</div>
              <ul className="space-y-2">
                {activeStrategy.mitigations.map((mitigation) => (
                  <li key={mitigation} className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                    <span className="body-text leading-snug">{mitigation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-10">
      {/* ── 1 · Litigation Strategy Dashboard (case overview) ── */}
      <div className="lg-card p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="section-header">Case Intelligence</h2>
        </div>
        <span className="pill pill-complete shrink-0">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex w-full h-full rounded-full bg-green-500 opacity-75 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-green-500" />
          </span>
          AI Active
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboard.map((c) => (
          <div key={c.label} className="lg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                <c.icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
              </div>
              <span className="eyebrow">{c.label}</span>
            </div>
            <div className="kpi-value">{c.value}</div>
            {typeof c.bar === "number" && (
              <div className="mt-2.5 h-1.5 rounded-full bg-track overflow-hidden">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, c.bar)}%` }} />
              </div>
            )}
            <p className="secondary-text mt-2">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="lg-card p-6 relative overflow-hidden order-1">
        <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-brand" />
        <div className="pl-5">
          <div className="eyebrow text-brand mb-2">STRATEGIC LITIGATION VALUATION BRIEF</div>
          <p className="body-text leading-relaxed">
            This matter anchors <strong className="font-semibold text-ink">high recovery potential</strong> in Cook County because the timeline of negligence is linear and well-documented. For <strong className="font-semibold text-ink">Estate of Miller</strong>, the defensive narrative of pre-existing comorbidities is medically undermined by direct clinical omissions. Symmetrical neglect of rotational safety or sudden motor safety duties triggers <strong className="font-semibold text-ink">high jury outrage factors</strong> in local jurisdictions.
          </p>
        </div>
      </div>

      {/* ── 2 · Strategic Settlement Corridor — interactive AI workflow (idle → analyzing → done) ── */}
      <div className="bg-ink rounded-xl overflow-hidden order-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 items-stretch">

          {/* LEFT panel — idle copy / processing steps / insights found */}
          <div className="lg:col-span-2 p-6 lg:border-r border-white/10">
            {corridorPhase === "idle" && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-brand" strokeWidth={1.75} />
                  <span className="eyebrow text-brand">AI Recommended Strategy</span>
                </div>
                <h2 className="section-header text-white mb-2">Strategic Settlement Corridor</h2>
                <p className="text-soft text-sm leading-relaxed">
                  Run LECO's corridor simulation. The AI reasons across the verified evidence, negligence findings, coverage, and matched precedent to generate the recommended settlement strategy.
                </p>
                <button onClick={startCorridor} className="btn btn-primary gap-2 mt-6">
                  <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} /> Execute Corridor Simulation
                </button>
              </>
            )}

            {corridorPhase === "analyzing" && (
              <>
                <div className="flex items-center gap-1.5 mb-4">
                  <Loader2 className="w-4 h-4 text-brand animate-spin" strokeWidth={1.75} />
                  <span className="eyebrow text-brand">AI Analyzing Case</span>
                </div>
                <div className="space-y-2.5">
                  {CORRIDOR_STEPS.map((s, i) => {
                    const done = i < corridorStep;
                    const active = i === corridorStep;
                    return (
                      <div key={s} className={`flex items-center gap-2.5 text-sm transition-opacity duration-300 ${done || active ? "opacity-100" : "opacity-30"}`}>
                        {done ? (
                          <CheckCircle className="w-4 h-4 text-brand shrink-0" strokeWidth={1.75} />
                        ) : active ? (
                          <Loader2 className="w-4 h-4 text-brand shrink-0 animate-spin" strokeWidth={1.75} />
                        ) : (
                          <Circle className="w-4 h-4 text-white/30 shrink-0" strokeWidth={1.75} />
                        )}
                        <span className={done ? "text-soft" : "text-white"}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {corridorPhase === "done" && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle className="w-4 h-4 text-brand" strokeWidth={1.75} />
                  <span className="eyebrow text-brand">Analysis Complete</span>
                </div>
                <h2 className="section-header text-white mb-3">Insights Found</h2>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5 text-sm text-soft"><CheckCircle className="w-4 h-4 text-brand mt-0.5 shrink-0" strokeWidth={1.75} /><span><span className="text-white font-semibold tabular-nums">{CORRIDOR_RESULT.matchedCases}</span> historical cases matched.</span></li>
                  <li className="flex items-start gap-2.5 text-sm text-soft"><CheckCircle className="w-4 h-4 text-brand mt-0.5 shrink-0" strokeWidth={1.75} /><span><span className="text-white font-semibold tabular-nums">{CORRIDOR_RESULT.confidence}%</span> similarity with comparable verdicts.</span></li>
                  <li className="flex items-start gap-2.5 text-sm text-soft"><CheckCircle className="w-4 h-4 text-brand mt-0.5 shrink-0" strokeWidth={1.75} /><span>Recommended recovery corridor generated.</span></li>
                </ul>
                <div className="flex items-center gap-2 mt-6 flex-wrap">
                  <button onClick={() => openStrategyDashboard("settlement")} className="btn btn-primary gap-2">
                    Open Strategy Dashboard <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* RIGHT panel — idle graph / animated reasoning graph / corridor result */}
          <div className="lg:col-span-3 relative border-t lg:border-t-0 border-white/10 bg-white/[0.03] p-6 min-h-[320px]">

            {/* Match badge — climbs while analyzing */}
            {corridorPhase !== "idle" && !(corridorPhase === "done" && !showGraph) && (
              <div className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-semibold text-white tabular-nums">
                <Sparkles className="w-3 h-3 text-brand" strokeWidth={1.75} /> Match {matchPct}%
              </div>
            )}

            {(corridorPhase === "idle" || corridorPhase === "analyzing" || (corridorPhase === "done" && showGraph)) && (
              <div className="absolute inset-0">
                {/* Edges */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {GRAPH_EDGES.map(([a, b]) => {
                    const na = GRAPH_NODES[a], nb = GRAPH_NODES[b];
                    const on = corridorPhase !== "analyzing" || (a < visibleNodes && b < visibleNodes);
                    return (
                      <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                        stroke="#3FB5D7" strokeWidth={corridorPhase === "idle" ? 0.15 : 0.25}
                        className={`transition-opacity duration-500 ${corridorPhase === "analyzing" ? "animate-pulse" : ""}`}
                        opacity={corridorPhase === "idle" ? 0.15 : on ? 0.45 : 0} vectorEffect="non-scaling-stroke" strokeDasharray={corridorPhase === "analyzing" ? "3 3" : undefined}
                      />
                    );
                  })}
                </svg>

                {/* Floating data particles while analyzing */}
                {corridorPhase === "analyzing" && [
                  { x: 30, y: 24, d: "0s" }, { x: 68, y: 40, d: "0.4s" }, { x: 40, y: 66, d: "0.8s" },
                  { x: 74, y: 74, d: "1.2s" }, { x: 22, y: 52, d: "1.6s" }, { x: 58, y: 20, d: "0.6s" },
                ].map((p, i) => (
                  <span key={i} className="absolute w-1.5 h-1.5 rounded-full bg-brand animate-ping" style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: p.d }} />
                ))}

                {/* Nodes */}
                {GRAPH_NODES.map((n, i) => {
                  const lit = corridorPhase === "idle" ? false : i < visibleNodes;
                  return (
                    <div key={n.label} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-opacity duration-500" style={{ left: `${n.x}%`, top: `${n.y}%`, opacity: corridorPhase === "idle" ? 0.35 : lit ? 1 : 0.15 }}>
                      <span className={`relative flex w-3 h-3 ${lit && corridorPhase === "analyzing" ? "" : ""}`}>
                        {lit && corridorPhase === "analyzing" && <span className="absolute inline-flex w-full h-full rounded-full bg-brand opacity-60 animate-ping" />}
                        <span className={`relative inline-flex w-3 h-3 rounded-full ${lit ? "bg-brand" : "bg-white/30"}`} />
                      </span>
                      <span className={`text-[10px] font-medium whitespace-nowrap ${lit ? "text-white" : "text-white/40"}`}>{n.label}</span>
                    </div>
                  );
                })}

                {corridorPhase === "idle" && (
                  <div className="absolute inset-x-0 bottom-4 text-center text-xs text-white/40">Legal context graph · idle — run the simulation to begin</div>
                )}
              </div>
            )}

            {/* Done — Strategy Options (recommended in the middle) */}
            {corridorPhase === "done" && !showGraph && (
              <div className="h-full flex flex-col justify-center">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="eyebrow text-soft">Strategy Options</div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-semibold text-white tabular-nums">
                    <ShieldCheck className="w-3 h-3 text-brand" strokeWidth={1.75} /> {CORRIDOR_RESULT.confidence}% Confidence
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {strategyOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => openStrategyDashboard(strategyOptionMap[o.key as keyof typeof strategyOptionMap])}
                      className={`rounded-xl p-4 flex flex-col text-left ${o.recommended ? "bg-brand/10 border-2 border-brand" : "bg-white/5 border border-white/10"}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${o.recommended ? "bg-brand" : "bg-white/10"}`}>
                          <o.icon className="w-4 h-4 text-white" strokeWidth={1.75} />
                        </div>
                        {o.recommended && <span className="inline-flex items-center gap-1 rounded-full bg-brand/20 border border-brand/40 px-2 py-0.5 text-[10px] font-semibold text-brand uppercase tracking-wide"><CheckCircle className="w-3 h-3" strokeWidth={1.75} /> Recommended</span>}
                      </div>
                      <div className="text-white font-semibold">{o.label}</div>
                      <div className="text-lg font-bold text-white tabular-nums mt-0.5">{o.value}</div>
                      <p className="text-soft text-xs leading-relaxed mt-1.5 flex-1">{o.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3 · Precedent Analysis — historical cases used ── */}
      <div className="lg-card p-6 order-1">
        <div className="mb-5">
          <h2 className="section-header">Similar Past Cases</h2>
          <p className="secondary-text mt-1 max-w-2xl">AI found historical cases most similar to the current matter to support the recommended litigation strategy.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
            <input
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              placeholder="Search past cases"
              className="w-full bg-white border border-line rounded-lg pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setCaseFiltersOpen((open) => !open)}
            className={`inline-flex items-center justify-center gap-2 bg-white border border-line rounded-lg px-3 py-2.5 text-sm transition-colors ${caseFiltersOpen || hasCaseDiscovery && activeCaseFilters.length > 0 ? "text-deep border-brand" : "text-ink hover:text-deep hover:border-brand"}`}
          >
            <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
            Filters
          </button>
        </div>

        {caseFiltersOpen && (
          <div className="mb-5 rounded-lg border border-line bg-white p-4">
            <div className="eyebrow mb-3">Filter Cases</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <label className="flex items-center gap-3 text-sm">
                <span className="text-[#5B6B78] min-w-28">Injury Type</span>
                <input
                  value={draftCaseFilters.injuryType}
                  onChange={(e) => setDraftCaseFilters((current) => ({ ...current, injuryType: e.target.value }))}
                  placeholder="All injury types"
                  className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
                />
              </label>

              <label className="flex items-center gap-3 text-sm">
                <span className="text-[#5B6B78] min-w-28">Severity</span>
                <select
                  value={draftCaseFilters.severity}
                  onChange={(e) => setDraftCaseFilters((current) => ({ ...current, severity: e.target.value }))}
                  className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">All severity levels</option>
                  {['Mild', 'Moderate', 'Severe', 'Critical'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-3">
                  <span className="text-[#5B6B78] min-w-28">Jurisdiction</span>
                  <select
                    value={draftJurisdictionState}
                    onChange={(e) => {
                      setDraftJurisdictionState(e.target.value);
                      setDraftCaseFilters((current) => ({ ...current, jurisdiction: "" }));
                    }}
                    className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                  >
                    <option value="">Select state</option>
                    {jurisdictionStates.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </label>
                {draftJurisdictionState && (
                  <label className="flex items-center gap-3 pl-[7.5rem]">
                    <span className="sr-only">District / County</span>
                    <select
                      value={draftCaseFilters.jurisdiction}
                      onChange={(e) => setDraftCaseFilters((current) => ({ ...current, jurisdiction: e.target.value }))}
                      className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                    >
                      <option value="">Select district / county</option>
                      {jurisdictionCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <label className="flex items-center gap-3 text-sm">
                <span className="text-[#5B6B78] min-w-28">Violation</span>
                <input
                  value={draftCaseFilters.violation}
                  onChange={(e) => setDraftCaseFilters((current) => ({ ...current, violation: e.target.value }))}
                  placeholder="All violations"
                  className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
                />
              </label>

              <label className="flex items-center gap-3 text-sm">
                <span className="text-[#5B6B78] min-w-28">Legal Statute</span>
                <input
                  value={draftCaseFilters.legalStatute}
                  onChange={(e) => setDraftCaseFilters((current) => ({ ...current, legalStatute: e.target.value }))}
                  placeholder="All statutes"
                  className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
                />
              </label>

              <label className="flex items-center gap-3 text-sm">
                <span className="text-[#5B6B78] min-w-28">Case Type</span>
                <select
                  value={draftCaseFilters.caseType}
                  onChange={(e) => setDraftCaseFilters((current) => ({ ...current, caseType: e.target.value }))}
                  className="min-w-0 flex-1 bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">All case types</option>
                  {['Personal Injury', 'Medical Malpractice', 'Motor Vehicle', 'Commercial Vehicle', 'Wrongful Death'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-line">
              <button
                type="button"
                onClick={clearCaseFilters}
                className="text-sm text-deep hover:text-ink transition-colors"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => { setCaseFilters(draftCaseFilters); setJurisdictionState(draftJurisdictionState); setCaseFiltersOpen(false); }}
                className="text-sm font-semibold text-deep hover:text-ink transition-colors"
              >
                Apply filters
              </button>
            </div>
          </div>
        )}

        {(activeCaseFilters.length > 0 || jurisdictionState) && (
          <div className="mb-5">
            <div className="eyebrow mb-2">Active Filters</div>
            <div className="flex flex-wrap gap-2">
              {jurisdictionState && (
                <button
                  type="button"
                  onClick={() => {
                    setJurisdictionState("");
                    setDraftJurisdictionState("");
                    setCaseFilters((current) => ({ ...current, jurisdiction: "" }));
                    setDraftCaseFilters((current) => ({ ...current, jurisdiction: "" }));
                  }}
                  className="pill pill-neutral hover:text-deep transition-colors"
                >
                  {jurisdictionState} <span aria-hidden="true">×</span>
                </button>
              )}
              {activeCaseFilters.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setCaseFilters((current) => ({ ...current, [key]: "" }));
                    setDraftCaseFilters((current) => ({ ...current, [key]: "" }));
                  }}
                  className="pill pill-neutral hover:text-deep transition-colors"
                >
                  {caseFilters[key]} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="card-title">{hasCaseDiscovery ? "Filtered Cases" : "Recommended Cases"}</h3>
          <p className="secondary-text mt-1 text-xs">
            {hasCaseDiscovery ? "Cases matching your selected search and filter criteria." : "AI-selected cases based on similarity to the current matter."}
          </p>
        </div>

        {visibleComparableVerdicts.length === 0 ? (
          <div className="lg-card flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-ink">No matching cases found.</p>
            <p className="secondary-text mt-1">Try a different search term or adjust your filters.</p>
            <button
              type="button"
              onClick={() => { setCaseSearch(""); clearCaseFilters(); }}
              className="mt-3 text-sm font-semibold text-deep hover:text-ink transition-colors"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleComparableVerdicts.map((v) => {
            const isWhyOpen = precedentWhyOpen === v.caseName;
            return (
              <div key={v.caseName} className="lg-card lg-card-i p-5 flex flex-col">
                <h3 className="card-title leading-snug mb-3">{v.caseName}</h3>
                <div className="text-xl font-bold text-ink tabular-nums mb-2">{formatUSD(v.amount)}</div>
                <div className="text-sm font-medium text-deep mb-3">Final Settlement</div>
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      const breakdownIsOpen = similarityBreakdownOpen === v.caseName;
                      const whyIsOpen = precedentWhyOpen === v.caseName;
                      setPrecedentWhyOpen(null);
                      setSimilarityBreakdownOpen(breakdownIsOpen && !whyIsOpen ? null : v.caseName);
                    }}
                    className="pill pill-complete cursor-pointer hover:text-deep hover:underline transition-colors"
                    aria-expanded={similarityBreakdownOpen === v.caseName}
                  >
                    {v.matchScore}% Match
                  </button>
                  {v.labels.map((l) => (
                    <span key={l} className="pill pill-neutral">{l}</span>
                  ))}
                </div>

                <div className="rounded-xl border border-line overflow-hidden bg-offwhite/70">
                  <button
                    onClick={() => {
                      const shouldOpen = precedentWhyOpen !== v.caseName;
                      setPrecedentWhyOpen(shouldOpen ? v.caseName : null);
                      setSimilarityBreakdownOpen(shouldOpen ? v.caseName : null);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-wash transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">Why this case matters</span>
                    <ChevronDown className={`w-4 h-4 text-deep transition-transform ${isWhyOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                  </button>
                  {isWhyOpen && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-line bg-white/80">
                      <p className="secondary-text leading-relaxed">{v.whyThisMatters}</p>
                    </div>
                  )}
                </div>

                {similarityBreakdownOpen === v.caseName && (
                  <div className="mt-3 rounded-xl border border-line bg-white/80 px-3.5 pb-3.5 pt-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="eyebrow">Similarity Breakdown</span>
                      <span className="text-xs font-bold text-deep tabular-nums">{v.matchScore}% Match</span>
                    </div>
                    <div className="space-y-2.5">
                      {v.similarityBreakdown.map((factor) => (
                        <div key={factor.label}>
                              <div className="text-xs text-[#5B6B78] mb-1">{factor.label}</div>
                          <div className="h-1.5 rounded-full bg-wash overflow-hidden">
                                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, factor.contribution * 3.5)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-line">
                      <div className="eyebrow mb-2">Why this case matches</div>
                      <ul className="space-y-1">
                        {v.similarityBreakdown.map((factor) => (
                          <li key={factor.label} className="text-xs text-[#5B6B78] flex items-start gap-2">
                            <CheckCircle className="w-3.5 h-3.5 text-deep shrink-0 mt-0.5" strokeWidth={1.75} />
                            <span>{factor.explanation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-ink">
                      <span>Overall Match</span>
                      <span className="text-deep tabular-nums">{v.similarityBreakdown.reduce((total, factor) => total + factor.contribution, 0)}%</span>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <div className="eyebrow mb-2">Key Matching Factors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {v.tags.slice(0, 4).map((t) => (
                      <span key={t} className="pill pill-neutral">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-auto pt-4 flex justify-end">
                  <button onClick={() => { setSelectedPrecedent(v); setPrecedentChatOpen(false); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-deep hover:text-ink transition-colors">
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> View Details
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {selectedPrecedent && (
        <>
          <div className="fixed inset-0 bg-ink/40 z-50" onClick={() => setSelectedPrecedent(null)} />
          <div className="fixed top-0 right-0 h-full w-[460px] max-w-[92vw] bg-white shadow-xl z-50 flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <div className="eyebrow mb-1">Precedent Case</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="card-title">{selectedPrecedent.caseName}</h2>
                  <span className="pill pill-complete">{selectedPrecedent.matchScore}% Match</span>
                </div>
              </div>
              <button onClick={() => setSelectedPrecedent(null)} className="p-1.5 hover:bg-tint rounded-lg transition-colors shrink-0"><X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} /></button>
            </div>

            {precedentChatOpen ? (
              <PrecedentChatPanel caseName={selectedPrecedent.caseName} onBack={() => setPrecedentChatOpen(false)} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  <div className="text-xs text-[#5B6B78] flex items-center gap-2.5 flex-wrap">
                    <span>{selectedPrecedent.matchScore}% Match <span className="font-semibold text-ink">•</span> Commercial Vehicle <span className="font-semibold text-ink">•</span> Cervical Injury</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-offwhite p-3.5">
                    <div>
                      <div className="eyebrow mb-0.5">Settlement Outcome</div>
                      <div className="text-xl font-bold text-ink tabular-nums">{formatUSD(selectedPrecedent.amount)}</div>
                      <div className="text-xs text-[#8A98A3] mt-0.5">Resolved through Pre-Trial Settlement</div>
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow mb-1.5">Similarity Drivers</div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="pill pill-neutral">Commercial Vehicle</span>
                      <span className="pill pill-neutral">Commercial Carrier</span>
                      <span className="pill pill-neutral">Cervical Injury</span>
                      <span className="pill pill-neutral">Long-Term Treatment</span>
                      <span className="pill pill-neutral">Cook County</span>
                      <span className="pill pill-neutral">Strong Liability</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-ink border-b border-line bg-tint">
                      <Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Summary
                    </div>
                    <div className="px-3.5 py-3 bg-tint">
                      <div className="eyebrow mb-1.5">Why {selectedPrecedent.matchScore}% Match</div>
                      <p className="secondary-text leading-relaxed">
                        LECO identified this precedent because it closely aligns with Estate of Miller across multiple legal and factual dimensions. Both matters involve catastrophic injuries, clearly documented negligence, strong liability evidence, and long-term medical impact. The comparable jurisdiction and settlement outcome make this case a reliable benchmark for estimating recovery potential and supporting the recommended settlement corridor.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-ink border-b border-line bg-offwhite">
                      <Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Suggestions
                    </div>
                    <div className="px-3.5 py-3 bg-offwhite space-y-2.5">
                      <div className="rounded-lg bg-white border border-line p-2.5">
                        <div className="eyebrow mb-1">Recommended Use</div>
                        <ul className="space-y-1.5 text-sm text-ink">
                          <li>• Support the initial settlement demand with a comparable recovery outcome.</li>
                          <li>• Reference this case when explaining long-term injury valuation.</li>
                          <li>• Strengthen liability discussions using similar negligence findings.</li>
                          <li>• Cite this precedent during negotiation to reinforce the recommended settlement corridor.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line p-4">
                  <button onClick={() => setPrecedentChatOpen(true)} className="btn btn-primary w-full justify-center gap-2">
                    <Bot className="w-4 h-4" strokeWidth={1.75} /> Chat with AI
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── 4 · Supporting Findings — strategic insights derived from negligence & violations ── */}
      <div className="lg-card p-6 order-4">
        <div className="mb-5">
          <h2 className="section-header">Supporting Findings</h2>
          <p className="secondary-text mt-1 max-w-2xl">Insights Derived from Negligence &amp; Violations</p>
          <p className="secondary-text mt-1 max-w-2xl">These case findings increase settlement leverage and strengthen the recommended litigation strategy.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {supportingFindings.map((finding) => {
            const isOpen = supportingFindingsOpen[finding.title] ?? false;
            return (
              <div key={finding.title} className="lg-card p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <div className="w-8 h-8 rounded-lg bg-tint flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-deep" strokeWidth={1.75} />
                    </div>
                    <h3 className="card-title">{finding.title}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-deep tabular-nums">{finding.confidence}%</div>
                    <div className="eyebrow">Confidence</div>
                  </div>
                </div>

                <div className="rounded-xl border border-line overflow-hidden bg-offwhite/70">
                  <button
                    onClick={() => setSupportingFindingsOpen((prev) => ({ ...prev, [finding.title]: !isOpen }))}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-wash transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> AI Summary
                    </span>
                    <ChevronDown className={`w-4 h-4 text-deep transition-transform ${isOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-line bg-white/80">
                      <p className="secondary-text leading-relaxed">{finding.summary}</p>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="eyebrow mb-2">Key Takeaways</div>
                  <ul className="space-y-2">
                    {finding.takeaways.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                        <span className="body-text leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 6 · Litigation & Trial Preparation Directives — the action plan ── */}
      <div className="lg-card p-6 order-5">
        <div className="mb-5">
          <div className="eyebrow text-deep mb-1">Action Plan</div>
          <h2 className="section-header">Litigation &amp; Trial Preparation Directives</h2>
          <p className="secondary-text mt-1 max-w-2xl">These actions are generated from the recommended strategy and the weaknesses identified in the analysis above.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRIAL_DIRECTIVES.map((d) => (
            <div key={d.title} className="lg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                  <d.icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
                </div>
                <h3 className="card-title">{d.title}</h3>
              </div>
              <ul className="space-y-2.5">
                {d.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                    <span className="body-text leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── 7 · Generate Demand CTA ── */}
      <div className="bg-ink rounded-xl px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 order-6">
        <div className="min-w-0">
          <h2 className="section-header text-white">Ready to assemble the demand</h2>
          <p className="text-soft text-sm mt-1 max-w-xl">Compile the recommended strategy, precedent, and findings into an attorney-ready demand package.</p>
        </div>
        <button
          onClick={() => onGenerateDemand?.(strategyStageLabel[selectedStrategy], Number(activeStrategy.recovery.replace(/[^0-9.]/g, "")))}
          className="btn btn-primary gap-2 shrink-0"
        >
          <FileSignature className="w-4 h-4" strokeWidth={1.75} /> Generate Demand
        </button>
      </div>
    </div>
  );
}

// ── Tab 8 — Negotiation ───────────────────────────────────────────────────────

const STRATEGY_POINTS = [
  "Open with the full demand to anchor the negotiation above the projected settlement range.",
  "Lead with objective liability evidence — officer fault determination and red-light violation — to limit comparative-fault arguments.",
  "Hold firm on documented economic damages; treat the non-economic multiplier as the primary negotiable lever.",
  "Reference confirmed policy limits to keep the conversation anchored to an adequate source of recovery.",
];

const COUNTER_OFFERS = [
  { round: "Initial Demand", party: "Plaintiff", amount: 1850000, date: "Jun 12, 2026", status: "Sent" },
  { round: "Carrier Response", party: "Defendant", amount: 720000, date: "Jun 18, 2026", status: "Received" },
  { round: "Counter", party: "Plaintiff", amount: 1650000, date: "Jun 22, 2026", status: "Sent" },
];

const SETTLEMENT_HISTORY = [
  { date: "Jun 12, 2026", event: "Demand package delivered to carrier." },
  { date: "Jun 18, 2026", event: "Carrier responded below the projected range." },
  { date: "Jun 22, 2026", event: "Plaintiff counter issued near recommended value." },
];

export function NegotiationTab({ model }: TabProps) {
  const [notes, setNotes] = useState("");
  return (
    <div className="max-w-4xl space-y-8">
      <Section title="Negotiation" description="Settlement preparation — strategy, offers, and history in one place.">
        {/* Settlement Recommendation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="lg-card p-5">
            <div className="eyebrow mb-1">Recommended Settlement</div>
            <div className="text-2xl font-bold text-ink tabular-nums">{formatUSD(model.recommendedSettlement)}</div>
          </div>
          <div className="lg-card p-5">
            <div className="eyebrow mb-1">Settlement Range</div>
            <div className="text-2xl font-bold text-deep tabular-nums">{formatCompact(model.estimatedLow)} – {formatCompact(model.estimatedHigh)}</div>
          </div>
          <div className="lg-card p-5">
            <div className="eyebrow mb-1">Confidence</div>
            <div className="text-2xl font-bold text-deep tabular-nums">{model.confidence}%</div>
          </div>
        </div>
      </Section>

      <Section title="Negotiation Strategy">
        <div className="lg-card p-6">
          <ul className="space-y-3">
            {STRATEGY_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                <span className="body-text leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Counter Offers">
        <div className="lg-card divide-y divide-line">
          {COUNTER_OFFERS.map((o, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{o.round}</div>
                <div className="mono-ref">{o.party} · {o.date}</div>
              </div>
              <span className={`pill ${o.party === "Plaintiff" ? "pill-neutral" : "pill-progress"} shrink-0`}>{o.status}</span>
              <div className="text-sm font-semibold text-ink tabular-nums w-28 text-right shrink-0">{formatUSD(o.amount)}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <Section title="Negotiation Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Capture negotiation notes, carrier positions, and next steps…"
            rows={6}
            className="w-full bg-white border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand resize-none transition-colors"
          />
        </Section>

        <Section title="Settlement History">
          <div className="relative pl-6 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-line">
            {SETTLEMENT_HISTORY.map((h, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[22px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-brand" />
                <div className="mono-ref mb-0.5">{h.date}</div>
                <div className="body-text">{h.event}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Final Recommended Offer */}
      <div className="bg-ink rounded-xl px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow text-soft mb-1">Final Recommended Offer</div>
          <div className="secondary-text text-soft">Target settlement aligned to the recommended case value</div>
        </div>
        <div className="text-white font-bold tabular-nums shrink-0" style={{ fontSize: "30px", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          {formatUSD(model.recommendedSettlement)}
        </div>
      </div>
    </div>
  );
}

// ── Stage Evidence — which documents support which stage ──────────────────────
// The case has ONE document repository. A stage does not own copies of files;
// it points at the documents its own content already cites, plus anything in
// the repository matching that stage's subject matter. The same MRI can back
// Chronology, Damages, and Intelligence while remaining a single document.

// `evidence` is the long-standing id of the Case Journey stage; the Evidence
// stage added after Violations uses `evidencehub` so existing goTo("evidence")
// callers keep working.
export type StageId =
  | "overview" | "medical" | "economic" | "noneconomic"
  | "liability" | "evidencehub" | "evidence" | "demand" | "negotiation";

// Human label per stage — matches the workspace tab labels.
export const STAGE_LABELS: Record<StageId, string> = {
  overview: "Case Overview",
  medical: "Chronology",
  economic: "Damages Analysis",
  noneconomic: "Negligence",
  liability: "Violations",
  evidencehub: "Evidence",
  evidence: "Case Journey",
  demand: "Intelligence",
  negotiation: "Negotiations",
};

// Repository documents a stage should surface, by subject matter. Applied to the
// uploaded case file so newly added documents reach the right stages on their own.
const STAGE_REPO_MATCH: Record<StageId, RegExp> = {
  // Core case file: primary medical, the incident record, and coverage.
  overview: /(mri|hospital_medical|police|witness|insurance|policy|retainer|intake)/,
  // Treatment and incident timeline.
  medical: /(mri|er_|hospital|medical|therapy|treatment|imaging|discharge|admission|police|dispatch|emergency|claim)/,
  // Economic and medical damages.
  economic: /(mri|er_|bill|invoice|hospital|medical|therapy|treatment|wage|payroll|income|receipt|mileage|life_care|prognosis|impairment)/,
  // Liability and breach of duty.
  noneconomic: /(police|witness|accident|incident|crash|camera|dashcam|vehicle|photo|scene|reconstruction|officer|driver|safety|ems|dispatch)/,
  // Regulatory, citation, inspection, compliance.
  liability: /(citation|violation|inspection|compliance|policy|log|fmcsa|carrier|safety|regulation|standard|permit|officer|police|scene|camera|dashcam|edr|skid|signal)/,
  // The Evidence stage reads the whole case record — it builds its own
  // catalogue from every stage, so this rule is only a fallback.
  evidencehub: /.*/,
  // Filings, claims, correspondence, case preparation.
  evidence: /(claim|insurance|policy|demand|letter|correspondence|filing|court|motion|pleading|wage|medical_records)/,
  // Everything the AI analysis reads from.
  demand: /(mri|hospital|medical|police|witness|wage|insurance|policy|therapy|bill)/,
  // Settlement value and negotiation leverage.
  negotiation: /(demand|letter|settlement|offer|correspondence|insurance|policy|bill|wage|medical|mri)/,
};

// Filenames each stage already cites in its own content. Chronology is computed
// at call time so it also picks up manually added events and their attachments.
function stageCitations(stage: StageId, userChron: ChronEvent[]): string[] {
  switch (stage) {
    case "medical":
      return [...MEDICAL_CHRONOLOGY, ...EVENT_CHRONOLOGY, ...userChron].flatMap((e) => e.evidence);
    case "economic":
      return [
        ...ECONOMIC.flatMap((e) => e.docs),
        ...DAMAGE_EVIDENCE.flatMap((d) => [d.primary, ...d.docs]),
      ];
    case "noneconomic":
      return NEGLIGENCE_PILLARS.flatMap((p) => p.docs);
    case "liability":
      return VIOLATION_CARDS.flatMap((v) => v.evidence);
    case "evidence":
      // The procedural half of the case timeline: investigation, claim, prep, negotiation.
      return EVENT_CHRONOLOGY
        .filter((e) => /Insurance Claim|Case Preparation|Settlement Negotiation|Police Investigation/.test(e.title))
        .flatMap((e) => e.evidence);
    case "negotiation":
      return EVENT_CHRONOLOGY
        .filter((e) => /Settlement Negotiation|Insurance Claim/.test(e.title))
        .flatMap((e) => e.evidence);
    default:
      return [];
  }
}

// Resolve a stage to its supporting documents. Identity is the filename, so a
// document cited by several stages stays one record throughout.
export function stageEvidence(
  stage: StageId,
  documents: CaseDocument[],
  opts: { findings?: AnalysisFinding[]; userChronology?: ChronEvent[] } = {},
): CaseDocument[] {
  const docForFile = buildDocResolver(documents);
  const names: string[] = [];

  // 1 — repository documents whose subject matter belongs to this stage
  const rule = STAGE_REPO_MATCH[stage];
  for (const d of documents) if (rule.test(d.name.toLowerCase())) names.push(d.name);

  // 2 — documents this stage's own content cites
  names.push(...stageCitations(stage, opts.userChronology ?? []));

  // 3 — Intelligence additionally reads from every analysis finding
  if (stage === "demand") {
    for (const f of opts.findings ?? []) names.push(...f.sources, ...f.evidence.map((e) => e.file));
  }

  const seen = new Set<string>();
  return names
    .filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(docForFile);
}

// ── Context-aware AI Insights ─────────────────────────────────────────────────
// The same document means different things in different stages. Preview and
// Insights open the existing Document Workspace unchanged; only the insight
// content is re-framed for the stage the attorney opened it from.

const STAGE_INSIGHT: Record<StageId, { lens: string; points: string[] }> = {
  overview: {
    lens: "how it frames the case as a whole",
    points: [
      "Establishes a core fact the rest of the case is built on.",
      "Corroborated by the other documents in the case file.",
      "No conflict with the recorded case summary.",
    ],
  },
  medical: {
    lens: "what it establishes chronologically",
    points: [
      "Fixes the date and sequence of a documented event.",
      "Treatment findings fall inside the injury window.",
      "Supports causation by tying the injury to the incident date.",
    ],
  },
  economic: {
    lens: "what it contributes to damages",
    points: [
      "Documents injury severity and its treatment impact.",
      "Supports the functional impairment claimed in the damages model.",
      "Carries future-care implications for the projected total.",
    ],
  },
  noneconomic: {
    lens: "what it proves about liability",
    points: [
      "Speaks directly to breach of the duty owed.",
      "Records facts establishing negligence.",
      "No contradiction or gap identified against the other evidence.",
    ],
  },
  liability: {
    lens: "which regulatory duty it engages",
    points: [
      "Ties the conduct to a specific statutory or regulatory standard.",
      "Supports the cited violation with a contemporaneous record.",
      "Usable as an exhibit for the compliance argument.",
    ],
  },
  evidencehub: {
    lens: "what it establishes as evidence",
    points: [
      "Classified and cross-referenced against the rest of the case record.",
      "Linked to the stages that rely on it.",
      "Reviewed for corroboration, contradictions and gaps.",
    ],
  },
  evidence: {
    lens: "where it sits in the procedural history",
    points: [
      "Marks a step in the claim's procedural sequence.",
      "Dated and attributable for the case chronology.",
      "Retained in the file for the record.",
    ],
  },
  demand: {
    lens: "how it feeds the case analysis",
    points: [
      "Read by the AI analysis as a primary source.",
      "Contributes to the confidence attached to the case assessment.",
      "Consistent with the other sources behind the valuation.",
    ],
  },
  negotiation: {
    lens: "what it is worth at the table",
    points: [
      "Supports the asserted settlement position.",
      "Backs the damages figure with documented value.",
      "Adds leverage against a below-range carrier response.",
    ],
  },
};

// AI Insights payload for a document, framed by the stage it was opened from.
// Shape matches what the Document Workspace already renders.
export function stageDocInsights(stage: StageId, doc: CaseDocument) {
  const s = STAGE_INSIGHT[stage];
  return {
    summary: `Reviewed for ${STAGE_LABELS[stage]} — ${s.lens}. ${doc.name} is read here as support for this stage's conclusions.`,
    keyPoints: s.points,
    entities: [
      { label: "Stage", value: STAGE_LABELS[stage] },
      { label: "Source", value: doc.source ?? "Attorney Office" },
      { label: "Date", value: doc.date ?? "—" },
    ],
    supportingDocs: [doc.name],
    confidence: { level: "High", score: 92 },
  };
}
