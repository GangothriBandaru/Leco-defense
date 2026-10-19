import { useState } from "react";
import { FileTypeIcon, FileTypeTag } from "../components/fileType";
import { StageNavigator } from "../components/StageNavigator";
import { ChevronLeft, ChevronRight, CheckCircle, ArrowRight, DollarSign, Shield, AlertCircle, Sparkles, ChevronDown, FileText, Eye, X, ChevronUp, Plus, Pencil, Trash2, History, UserPlus } from "lucide-react";
import { Button } from "../components/ui/button";
import { AnalysisFinding, type CaseDocument } from "../types/case";
import { DocumentWorkspaceModal, RowMenu } from "../components/DocumentWorkspace";
import { AiDraftPanel } from "../components/AiDraftPanel";
import { downloadTextFile, safeFileName } from "../components/downloadText";
import { draftDamageFromText, draftFactorFromText } from "../damages/damageDraft";
import {
  useDamagesOptional, attorneyActor, formatDamageUSD, DAMAGE_FIELD_LABEL, DAMAGE_PROVENANCE_LABEL, DAMAGE_SEED,
  type DamageItem, type DamageBucket, type FieldChange,
} from "../damages/DamagesContext";
import {
  useFactorsOptional, attorneyFactorActor, SEVERITY_RANGE, FACTOR_SEED,
  type FactorItem, type Severity,
} from "../damages/FactorsContext";
import {
  DamageForm, DeleteDamageDialog, DamageHistoryDrawer, draftOf, blankDraft, parseDocs, parseMoney, type DamageDraft,
  FactorProvenanceBadge, DeleteFactorDialog, FactorHistoryDrawer, draftOfFactor, blankFactorDraft, draftRange, type FactorDraft,
  CURRENT_USER,
} from "../workspace/WorkspaceTabs";

interface ValuationPageProps {
  caseData?: {
    caseName: string;
    caseId: string;
    plaintiff: string;
    summary: string;
    jurisdiction?: string;
  };
  analysisFindings?: AnalysisFinding[];
  /** The case's documents — the only ones a drafted damage can cite. */
  documents?: CaseDocument[];
  onStageClick?: (stageName: string) => void;
  onBackToIntake?: () => void;
  onReturnToAnalysis?: () => void;
  onProceedToCaseReady?: () => void;
}

// The damages and factors come from the shared stores (DamagesContext,
// FactorsContext) — the same record the Damages Analysis stage and the AI
// Assistant read and write — so an edit anywhere shows here.

/** A damage as this page's rows and evidence drawer use it. */
type ValItem = { id: string; label: string; value: number; category: string; docCount: number; reasoning: string; docs: string[] };
const toVal = (d: DamageItem): ValItem => ({
  id: d.id, label: d.label, value: d.amount, category: d.category,
  docCount: Math.max(d.docCount, d.docs.length), reasoning: d.reasoning, docs: d.docs,
});

// Factors that justify the recommended valuation strategy (shown as compact chips).
const keyFactors = ["Clear Liability", "Severe Injuries", "Strong Evidence", "Favorable Jurisdiction"];

// Severity tag → pill class. Mirrors the LECO status-pill palette
// (risk = red, progress = amber, neutral = teal, complete = green).
const SEVERITY_PILL: Record<string, string> = {
  Critical: "pill pill-risk",
  High: "pill pill-progress",
  Moderate: "pill pill-neutral",
  Low: "pill pill-complete",
};

// A factor's multiplier band, as the factor rows show it.
const fmtX = (m: number) => `${Number(m.toFixed(2))}×`;
const bandOf = (f: FactorItem) => `${fmtX(f.range[0])}–${fmtX(f.range[1])}`;

/** The AI analysis on file for a factor — keyed by the name it was first given,
 *  so a rename keeps it. Factors the attorney adds have none. */
const seedNameOf = (f: FactorItem) => FACTOR_SEED.find((s) => s.id === f.id)?.category;

const multiplierPrecedentCases = [
  { caseName: "Reyes v. Interstate Freight Lines", matchScore: 94, settlementValue: 1_750_000, analysis: ["Similar injury severity and permanent impairment", "Comparable long-term functional impact", "Comparable liability profile", "Settlement value provides a useful valuation reference"] },
  { caseName: "Donovan v. Metro Cartage Co.", matchScore: 89, settlementValue: 1_420_000, analysis: ["Comparable injury and ongoing care profile", "Similar commercial-carrier liability context", "Settlement value supports the selected valuation range"] },
  { caseName: "Whitfield v. Prairie Logistics", matchScore: 85, settlementValue: 1_180_000, analysis: ["Permanent impairment provides a relevant severity comparison", "Comparable long-term medical impact", "Settlement value helps anchor the lower end of the range"] },
];

const precedentValuationRelevance: Record<string, string> = {
  "Pain & Suffering": "Comparable precedent settlements support positioning this factor within the 2×–3× range, with the upper end supported by the persistent suffering and lasting impact observed in similar matters.",
  "Emotional Distress": "Comparable outcomes provide supporting context for the 1×–1.5× range, particularly where ongoing treatment and documented psychological effects are present.",
  "Quality of Life": "The historical settlement range supports the 1×–1.5× positioning because comparable matters reflect lasting limitations and reduced independence.",
  "Cognitive Impairment": "Comparable precedent settlements support the 2×–3× range, with severe, objectively documented functional effects supporting the upper end.",
  "Physical Impairment": "The precedent range supports the selected multiplier by showing how permanent mobility restrictions and ongoing care influence valuation.",
  "Dignity & Independence": "Comparable settlements provide supporting context for the selected range where lasting dependence affects everyday autonomy.",
  "Family Relationship Impact": "The historical outcomes support the selected range where lasting impairment creates a documented caregiving and relationship burden.",
};

// AI Multiplier Analysis reasoning for each damage factor
interface DamageFactorReasoning {
  whyMultiplier: string;
  injuryProfile: { affectedArea: string; injury: string };
  injurySeverityImpact: { intensity: string; explanation: string };
  jurisdictionAnalysis: { venue: string; comparableCases: string; localTrend: string };
  negligenceViolations: { breach: string; causation: string; violations: string };
  recommendedRange: string;
  aiRecommendation: string;
}

const damageFactorReasonings: Record<string, DamageFactorReasoning> = {
  "Pain & Suffering": {
    whyMultiplier: "The multiplier reflects the severity and persistence of the plaintiff's pain, supported by medical records and the lasting impact on daily life.",
    injuryProfile: {
      affectedArea: "Brain / Neurological System",
      injury: "Ischemic stroke with permanent neurological damage",
    },
    injurySeverityImpact: {
      intensity: "Severe",
      explanation: "Significant and persistent physical suffering resulting from permanent neurological injury and ongoing medical treatment.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Similar injury and liability cases were considered to benchmark the valuation range.",
      localTrend: "Comparable outcomes in this jurisdiction support the selected multiplier range.",
    },
    negligenceViolations: {
      breach: "Documented failures in medication management and emergency response strengthen liability.",
      causation: "The delayed response is medically linked to the severity of the resulting neurological injury.",
      violations: "Multiple documented care and protocol violations increase liability exposure and support a higher valuation range.",
    },
    recommendedRange: "2×–3×",
    aiRecommendation: "The evidence supports a 2×–3× range, with the factor positioned toward the upper end because of the severity and lasting impact of the injury.",
  },
  "Emotional Distress": {
    whyMultiplier: "Documented mental-health symptoms and psychological impact justify a significant multiplier reflecting ongoing emotional suffering.",
    injuryProfile: {
      affectedArea: "Mental Health / Psychological",
      injury: "Post-traumatic stress disorder with diagnosed anxiety and depression",
    },
    injurySeverityImpact: {
      intensity: "High",
      explanation: "Substantial emotional suffering documented by clinical evaluations, affecting daily functioning and interpersonal relationships.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Comparable cases with documented PTSD support a 1×–1.5× range for emotional distress.",
      localTrend: "Illinois courts recognize mental-health damages when corroborated by professional evaluation.",
    },
    negligenceViolations: {
      breach: "Inadequate emergency protocols contributed to prolonged patient distress during medical crisis.",
      causation: "The negligent handling of the medical emergency directly caused the onset of traumatic stress symptoms.",
      violations: "Failure to follow standard care procedures in the acute phase increased psychological harm.",
    },
    recommendedRange: "1×–1.5×",
    aiRecommendation: "Mental-health evaluations support a 1×–1.5× multiplier, reflecting significant but not permanent psychological impact.",
  },
  "Quality of Life": {
    whyMultiplier: "Loss of independence and inability to engage in prior activities justify a substantial non-economic damages multiplier.",
    injuryProfile: {
      affectedArea: "Functional Capacity / Activities of Daily Living",
      injury: "Permanent reduction in mobility and independence requiring adaptive strategies",
    },
    injurySeverityImpact: {
      intensity: "High",
      explanation: "Documented loss of ability to perform prior leisure activities, work-related tasks, and independent self-care.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Similar permanent functional impairments in comparable cases support a 1×–1.5× range.",
      localTrend: "Established precedent in Illinois recognizes quality-of-life damages for permanent disability.",
    },
    negligenceViolations: {
      breach: "Delayed medical intervention contributed to greater functional impairment than might otherwise have occurred.",
      causation: "The breach directly caused permanent loss of independence in activities the plaintiff previously enjoyed.",
      violations: "Standard care protocols were not followed in the initial assessment and treatment phases.",
    },
    recommendedRange: "1×–1.5×",
    aiRecommendation: "Functional assessments support a 1×–1.5× multiplier for this category given the permanent nature of the impairment.",
  },
  "Cognitive Impairment": {
    whyMultiplier: "Measurable neuropsychological deficits, particularly in memory and processing speed, justify a critical severity rating and higher multiplier.",
    injuryProfile: {
      affectedArea: "Neuropsychological / Cognitive Function",
      injury: "Ischemic stroke causing measurable deficits in executive function, memory, and processing speed",
    },
    injurySeverityImpact: {
      intensity: "Severe",
      explanation: "Neuropsychological testing documents statistically significant cognitive decline affecting work performance and complex decision-making.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Ischemic stroke cases with documented cognitive deficits typically support 2×–3× multipliers for cognitive impairment.",
      localTrend: "Illinois courts heavily weight objective neuropsychological testing results in valuation.",
    },
    negligenceViolations: {
      breach: "Failure to recognize and respond to acute neurological symptoms allowed the stroke to progress.",
      causation: "Delayed intervention is directly linked to the extent and permanence of the cognitive deficits observed.",
      violations: "Multiple protocol violations in emergency response and neurological assessment.",
    },
    recommendedRange: "2×–3×",
    aiRecommendation: "Neuropsychological testing strongly supports a 2×–3× multiplier given the objective, measurable cognitive decline.",
  },
  "Physical Impairment": {
    whyMultiplier: "Permanent restrictions in mobility and physical function, documented by imaging and clinical findings, justify a significant multiplier.",
    injuryProfile: {
      affectedArea: "Musculoskeletal / Mobility",
      injury: "Permanent mobility restrictions and reduced range of motion requiring ongoing physical management",
    },
    injurySeverityImpact: {
      intensity: "High",
      explanation: "Imaging studies confirm structural changes and clinical examination verifies measurable, permanent limitations in physical capability.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Comparable cases with permanent physical impairment support a 1×–1.5× multiplier.",
      localTrend: "Illinois recognizes permanent physical impairment as a significant component of non-economic damages.",
    },
    negligenceViolations: {
      breach: "Inadequate treatment protocols in the acute phase contributed to worsening of physical outcomes.",
      causation: "The negligent care directly resulted in greater permanent impairment than appropriate standard care would have caused.",
      violations: "Failure to follow evidence-based rehabilitation protocols in the acute recovery phase.",
    },
    recommendedRange: "1×–1.5×",
    aiRecommendation: "Imaging and clinical findings support a 1×–1.5× multiplier for the documented permanent physical impairment.",
  },
  "Dignity & Independence": {
    whyMultiplier: "Dependence on caregiving for self-care tasks represents a moderate but meaningful reduction in personal autonomy and dignity.",
    injuryProfile: {
      affectedArea: "Personal Autonomy / Activities of Daily Living",
      injury: "Reduced ability to perform self-care activities independently, requiring assistive care",
    },
    injurySeverityImpact: {
      intensity: "Moderate",
      explanation: "While significant, the reliance on assistance for specific self-care tasks is measurable but managed through adaptive strategies.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Comparable cases with moderate functional dependence support a 0.5×–1× range.",
      localTrend: "Illinois courts recognize loss of dignity and independence as distinct from pain and suffering.",
    },
    negligenceViolations: {
      breach: "Inadequate discharge planning and follow-up care contributed to preventable dependence.",
      causation: "The negligent care limited the plaintiff's ability to regain independence as compared to appropriate rehabilitation.",
      violations: "Failure to provide adequate supportive care planning during recovery.",
    },
    recommendedRange: "0.5×–1×",
    aiRecommendation: "The documented need for assistive care supports a 0.5×–1× multiplier, reflecting moderate impact on autonomy.",
  },
  "Family Relationship Impact": {
    whyMultiplier: "Documented impact on family dynamics and caregiver burden, though not permanent separation, justifies a moderate multiplier.",
    injuryProfile: {
      affectedArea: "Family / Interpersonal Relationships",
      injury: "Altered family dynamics and increased caregiver responsibilities affecting household relationships",
    },
    injurySeverityImpact: {
      intensity: "Moderate",
      explanation: "Family statements and caregiver assessments document meaningful but manageable changes in household roles and relationships.",
    },
    jurisdictionAnalysis: {
      venue: "Cook County, Illinois",
      comparableCases: "Similar cases with documented caregiver burden support a 0.5×–1× multiplier.",
      localTrend: "Illinois courts recognize loss of consortium and caregiver burden as compensable non-economic damages.",
    },
    negligenceViolations: {
      breach: "The negligent care resulted in greater disability, increasing caregiving burden beyond what standard care would have produced.",
      causation: "The severity of the plaintiff's condition—caused by the negligent care—directly caused the family impact.",
      violations: "Inadequate consideration of rehabilitation needs contributed to prolonged family burden.",
    },
    recommendedRange: "0.5×–1×",
    aiRecommendation: "Family documentation supports a 0.5×–1× multiplier for the caregiver burden and relationship impact.",
  },
};

// Historic Case Benchmark data
const historicCaseBenchmarkData = {
  caseCount: 3,
  precedentCase: {
    matchPercentage: 94,
    caseTitle: "Reyes v. Interstate Freight Lines",
    jurisdiction: "Cook County, Illinois",
    injuryType: "Cervical spine injury",
    injuryIntensity: "Severe — permanent impairment",
    settlementValue: 1750000,
  },
  similarityFactors: [
    "Same Jurisdiction",
    "Severe Injury",
    "Strong Liability",
    "Long-Term Impact",
  ],
  similarityExplanation: "High similarity based on jurisdiction, injury severity, liability profile, and long-term impact.",
  negligenceLiability: {
    liabilityStrength: "Strong",
    primaryFinding: "Defendant's documented failure to meet the applicable standard of care contributed to the plaintiff's injury.",
    jurisdiction: "Cook County, Illinois",
    legalAuthority: "Illinois medical-malpractice requirements",
    statuteCode: "735 ILCS 5/2-622",
    legalRelevance: "The statute establishes procedural requirements for covered medical-malpractice actions, including review of the case by a qualified health professional and a written report supporting a reasonable and meritorious claim.",
    violations: [
      "Documented breach of applicable standard of care",
      "Delayed treatment / response",
      "Failure to follow applicable medical protocols",
      "Supporting medical records identified",
    ],
  },
};

// Where the exploration slider starts. The recommended figures come from the
// factors on file, not from this.
const baseMultiplier = 9;

function formatCurrency(n: number) {
  return "$" + n.toLocaleString("en-US");
}

// Compact dollars (e.g. $1.45M, $137K) — keeps ranges from overflowing.
function formatCompactUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return "$" + Math.round(n).toLocaleString("en-US");
}

// Show a value as a ±15% range instead of an exact figure.
const RANGE_LOW = 0.85;
const RANGE_HIGH = 1.15;
function formatRange(n: number) {
  return `${formatCompactUSD(n * RANGE_LOW)} – ${formatCompactUSD(n * RANGE_HIGH)}`;
}

// Show a multiplier as a ±1 range (e.g. 9 → "8× – 10×").
function multiplierRange(m: number) {
  return `${Number(Math.max(0, m - 1).toFixed(2))}× – ${Number((m + 1).toFixed(2))}×`;
}

// Pad named docs up to `count` with realistic placeholder names.
function padDocs(names: string[], category: string, count: number): string[] {
  const slug = category.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const out = [...names];
  let n = out.length + 1;
  while (out.length < count) { out.push(`${slug}_${String(n).padStart(2, "0")}.pdf`); n++; }
  return out;
}

// Stable string hash → non-negative int, so per-document amounts/dates are
// deterministic across renders (no jitter when the drawer re-renders).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

type DocLine = { name: string; amount: number; aiSummary: string; billingPeriod: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Build an itemized, evidence-backed breakdown for an economic damage category.
// Amounts are deterministic and reconcile EXACTLY to the verified category total.
function buildDocBreakdown(item: { value: number; category: string; docCount: number; docs: string[] }): DocLine[] {
  const files = padDocs(item.docs, item.category, item.docCount);
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
      billingPeriod: `${MONTHS[m]} ${startDay} – ${MONTHS[m]} ${endDay}, 2026`,
    };
  });
}

/** The damage form in a popup — the same form, fields and validation as
 *  before. Closes only on Cancel, a save, or the close button. With
 *  `aiDocuments`, it also offers Create with AI. */
function DamageFormModal({
  heading, bucket, draft, setDraft, saveLabel, onSave, onCancel, onDelete, onHistory, aiDocuments, startWithAI = false,
}: {
  heading: string;
  bucket: DamageBucket;
  draft: DamageDraft;
  setDraft: (d: DamageDraft) => void;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onHistory?: () => void;
  aiDocuments?: string[];
  startWithAI?: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(startWithAI);
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4">
      <div role="dialog" aria-modal="true" aria-label={heading} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-sm">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-line shrink-0">
          <h2 className="card-title">{heading}</h2>
          <div className="flex items-center gap-2">
            {aiDocuments && (
              <button type="button" onClick={() => setAiOpen((o) => !o)} aria-expanded={aiOpen} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-line bg-white text-deep text-xs font-semibold hover:bg-tint transition-colors">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Create with AI
              </button>
            )}
            <button onClick={onCancel} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {aiOpen && aiDocuments && (
            <AiDraftPanel
              autoFocus
              placeholder={bucket === "economic"
                ? "Describe the damage — e.g. Add medical expenses of $12,500 for emergency treatment, supported by the hospital invoice."
                : "Describe the damage — e.g. Add loss of enjoyment of $10,000 for missed family events."}
              onApply={(text) => {
                const r = draftDamageFromText(text, aiDocuments, bucket);
                const set = Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v !== undefined));
                setDraft({ ...draft, ...set });
                return r;
              }}
              onClose={() => setAiOpen(false)}
            />
          )}
          <DamageForm
            bucket={bucket}
            title="Damage details"
            draft={draft}
            setDraft={setDraft}
            onCancel={onCancel}
            onSave={onSave}
            saveLabel={saveLabel}
            onDelete={onDelete}
            onHistory={onHistory}
          />
        </div>
      </div>
    </div>
  );
}

/** Add or edit a damage factor — the fields the factor model holds. The
 *  multiplier rule stays the store's: the recommended multiplier is the sum of
 *  the factors' multipliers. */
function FactorFormModal({
  factor, overall, onSave, onDelete, onHistory, onClose, withAI = false,
}: {
  /** Absent when adding. */
  factor?: FactorItem;
  /** Open with the Create with AI panel showing. */
  withAI?: boolean;
  /** The recommended multiplier now, for the preview. */
  overall: number;
  /** Saves; returns an error to show, or null. */
  onSave: (draft: FactorDraft, multiplier: number, note: string) => string | null;
  onDelete?: () => void;
  onHistory?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FactorDraft>(() => (factor ? draftOfFactor(factor) : blankFactorDraft()));
  const [mult, setMult] = useState(() => String(factor ? factor.multiplier : SEVERITY_RANGE.Moderate[0]));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(withAI && !factor);
  const m = Number(mult);
  const after = Number.isFinite(m) ? overall - (factor?.multiplier ?? 0) + m : overall;
  const input = "w-full px-3 py-2 rounded-lg border border-line text-sm text-ink focus:outline-none focus:border-brand transition-colors";
  const submit = () => {
    const lo = Number(draft.rangeLow), hi = Number(draft.rangeHigh);
    if (!draft.name.trim()) { setError("Enter the factor name."); return; }
    if (!draft.rangeLow.trim() || !draft.rangeHigh.trim() || !Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < 0) { setError("Enter a multiplier range of non-negative numbers."); return; }
    if (lo > hi) { setError("The range's low end is above its high end."); return; }
    if (!mult.trim() || !Number.isFinite(m) || m < 0) { setError("Enter the factor's multiplier as a non-negative number."); return; }
    setError(onSave(draft, m, note.trim()));
  };
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={factor ? "Edit damage factor" : "Add damage factor"} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-line shrink-0">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <h2 className="card-title">{factor ? "Edit Damage Factor" : "Add Damage Factor"}</h2>
            {factor && <FactorProvenanceBadge provenance={factor.provenance} />}
          </div>
          <div className="flex items-center gap-2">
            {!factor && (
              <button type="button" onClick={() => setAiOpen((o) => !o)} aria-expanded={aiOpen} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-line bg-white text-deep text-xs font-semibold hover:bg-tint transition-colors">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Create with AI
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
          </div>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {aiOpen && (
            <AiDraftPanel
              autoFocus
              placeholder="Describe the factor — e.g. Add a factor for Disfigurement, moderate severity, multiplier of 0.75, because of visible surgical scarring, supported by the post-operative photos."
              onApply={(text) => {
                const r = draftFactorFromText(text);
                const f = r.fields;
                setDraft((d) => ({
                  ...d,
                  name: f.name ?? d.name,
                  description: f.description ?? d.description,
                  severity: f.severity ?? d.severity,
                  rangeLow: f.rangeLow ?? d.rangeLow,
                  rangeHigh: f.rangeHigh ?? d.rangeHigh,
                }));
                if (f.multiplier) setMult(f.multiplier);
                if (f.note) setNote(f.note);
                return r;
              }}
              onClose={() => setAiOpen(false)}
            />
          )}
          <label className="block">
            <span className="eyebrow block mb-1">Factor name *</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Enter factor name" className={input} />
          </label>
          <label className="block">
            <span className="eyebrow block mb-1">Supporting rationale</span>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} placeholder="Describe how this factor affects the case..." className={`${input} resize-y`} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow block mb-1">Severity</span>
              <select
                value={draft.severity}
                onChange={(e) => {
                  const severity = e.target.value as Severity;
                  const [lo, hi] = SEVERITY_RANGE[severity];
                  // A severity offers its band; the attorney can still set their own.
                  setDraft({ ...draft, severity, rangeLow: String(lo), rangeHigh: String(hi) });
                }}
                className={input}
              >
                {(Object.keys(SEVERITY_RANGE) as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div>
              <span className="eyebrow block mb-1">Multiplier range</span>
              <div className="flex items-center gap-1.5">
                <input type="number" step="0.05" min="0" aria-label="Range low" value={draft.rangeLow} onChange={(e) => setDraft({ ...draft, rangeLow: e.target.value })} className={`${input} tabular-nums`} />
                <span className="text-xs text-[#8A98A3] shrink-0">–</span>
                <input type="number" step="0.05" min="0" aria-label="Range high" value={draft.rangeHigh} onChange={(e) => setDraft({ ...draft, rangeHigh: e.target.value })} className={`${input} tabular-nums`} />
              </div>
            </div>
          </div>
          <label className="block">
            <span className="eyebrow block mb-1">Multiplier contribution</span>
            <input type="number" step="0.05" min="0" value={mult} onChange={(e) => setMult(e.target.value)} className={`${input} tabular-nums`} />
            <span className="block text-[11px] text-[#8A98A3] mt-1">
              The recommended multiplier is the sum of the factors: {fmtX(overall)} now, {fmtX(Math.max(0, after))} with this {factor ? "change" : "factor"}.
              {factor && factor.multiplier !== factor.aiMultiplier && ` AI recommended ${fmtX(factor.aiMultiplier)} for this factor.`}
            </span>
          </label>
          <div>
            <span className="eyebrow block mb-1">Supporting evidence</span>
            <p className="text-xs text-[#5B6B78]">
              {factor
                ? `${factor.docCount} supporting ${factor.docCount === 1 ? "document" : "documents"} on file — kept as they are.`
                : "None yet. Evidence is linked when the factor is assessed against case documents."}
            </p>
          </div>
          <label className="block">
            <span className="eyebrow block mb-1">Note (recorded in the history)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason for this change..." className={`${input} resize-none`} />
          </label>
          {error && <p role="alert" className="text-sm text-[#B42318]">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            {onHistory && (
              <button onClick={onHistory} className="inline-flex items-center gap-1.5 text-xs font-semibold text-deep hover:text-ink transition-colors">
                <History className="w-3.5 h-3.5" strokeWidth={1.75} /> History
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318] hover:text-[#96200F] transition-colors">
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Delete damage factor
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button onClick={submit} className="btn btn-primary">{factor ? "Save Changes" : "Add Damage Factor"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ValuationPage({ caseData, analysisFindings = [], documents = [], onStageClick, onBackToIntake, onReturnToAnalysis, onProceedToCaseReady }: ValuationPageProps) {
  const [multiplier, setMultiplier] = useState(baseMultiplier);
  // Damage Factors accordion — collapsed by default.
  const [damageFactorsOpen, setDamageFactorsOpen] = useState(false);
  // Track which damage factor's reasoning panel is expanded (null means none)
  const [expandedReasoningFactorIndex, setExpandedReasoningFactorIndex] = useState<number | null>(null);
  const [expandedPrecedentCases, setExpandedPrecedentCases] = useState(false);
  const [expandedLegalFramework, setExpandedLegalFramework] = useState(false);
  // Economic line items: which rows have their reasoning card expanded, the row
  // whose details drawer is open, and the preview/insights modal view.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpandedRows((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [drawerItem, setDrawerItem] = useState<ValItem | null>(null);
  const [drawerDocsOpen, setDrawerDocsOpen] = useState(false);
  // Which itemized document rows are expanded (keyed by file name).
  const [expandedDocRows, setExpandedDocRows] = useState<Set<string>>(new Set());
  const toggleDocRow = (name: string) =>
    setExpandedDocRows((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const openDrawer = (item: ValItem) => { setDrawerItem(item); setDrawerDocsOpen(false); setExpandedDocRows(new Set()); };
  const [wsView, setWsView] = useState<"preview" | "insights" | null>(null);
  // When a single row's "Preview Document" is used, focus that file in the workspace.
  const [wsFocus, setWsFocus] = useState<string | null>(null);
  // Itemized, amount-attributed breakdown for the open category (sums to its total).
  const breakdown = drawerItem ? buildDocBreakdown(drawerItem) : [];
  const verifiedTotal = breakdown.reduce((a, d) => a + d.amount, 0);
  const drawerDocs = drawerItem
    ? padDocs(drawerItem.docs, drawerItem.category, drawerItem.docCount).map((name) => ({
        id: name, name, source: "Attorney Office", date: "Jun 8, 2026", status: "Processed", category: drawerItem.category,
      }))
    : [];
  // Reorder so a row-focused document opens first in the workspace tabs.
  const orderedDrawerDocs = wsFocus
    ? [...drawerDocs.filter((d) => d.name === wsFocus), ...drawerDocs.filter((d) => d.name !== wsFocus)]
    : drawerDocs;

  const defaultCaseData = {
    caseName: "Estate of Miller vs Logistics Co.",
    caseId: "PI-2024-001",
    plaintiff: "Evelyn Miller",
    summary: "Motor vehicle accident resulting in cervical disc herniation and ongoing physical therapy.",
    jurisdiction: "Cook County, IL",
  };

  const data = { ...defaultCaseData, ...caseData };

  // ── The damage record and the factors, live ──
  const damagesStore = useDamagesOptional();
  const factorsStore = useFactorsOptional();
  const damageItems = damagesStore?.items ?? DAMAGE_SEED;
  const economicItems = damageItems.filter((d) => d.bucket === "economic");
  const nonEconomicItems = damageItems.filter((d) => d.bucket === "noneconomic");
  const factors = factorsStore?.factors ?? FACTOR_SEED;
  // The existing valuation rules, as the Damages Analysis stage applies them:
  // the recommended multiplier is the sum of the factors' multipliers, applied
  // to the economic damages on file; itemised non-economic damages are added.
  const baseEconomic = economicItems.reduce((s, d) => s + d.amount, 0);
  const nonEconomicItemsTotal = nonEconomicItems.reduce((s, d) => s + d.amount, 0);
  const recommendedMultiplier = factors.reduce((s, f) => s + f.multiplier, 0);
  const baseMult = baseEconomic * recommendedMultiplier + nonEconomicItemsTotal;
  const baseTotal = baseEconomic + baseMult;

  const actor = attorneyActor(CURRENT_USER);
  const factorActor = attorneyFactorActor(CURRENT_USER);
  const REASON = "Changed by attorney on the Case Valuation stage.";
  const [addingTo, setAddingTo] = useState<DamageBucket | null>(null);
  const [addDraft, setAddDraft] = useState<DamageDraft>(() => blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DamageDraft>(() => blankDraft());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const deletingDamage = damageItems.find((d) => d.id === deletingId) ?? null;
  const historyDamage = damageItems.find((d) => d.id === historyId) ?? null;

  const [damageAI, setDamageAI] = useState(false);
  const openAdd = (bucket: DamageBucket, withAI = false) => { setEditingId(null); setAddDraft(blankDraft()); setDamageAI(withAI); setAddingTo(bucket); };
  const editingDamage = damageItems.find((d) => d.id === editingId) ?? null;
  const docNames = documents.map((d) => d.name);

  // One damage, as a plain-text record.
  const downloadDamage = (d: DamageItem) => {
    const trail = damagesStore?.historyFor(d.id) ?? [];
    downloadTextFile(`Damage_${safeFileName(d.label)}.txt`, [
      `${data.caseName} — ${d.bucket === "economic" ? "economic" : "non-economic"} damage`,
      "",
      `Damage: ${d.label}`,
      `Amount: ${formatDamageUSD(d.amount)}`,
      ...(d.bucket === "economic" ? [`Category: ${d.group}${d.subcategory ? ` › ${d.subcategory}` : ""}`] : []),
      `Damage type: ${d.category || "Not set"}`,
      `Status: ${d.verified ? "Verified" : "Not yet verified"} · ${DAMAGE_PROVENANCE_LABEL[d.provenance]}${d.addedBy ? ` by ${d.addedBy}` : ""}`,
      "",
      `Description: ${d.description || "None"}`,
      `Supporting information: ${d.reasoning || "None"}`,
      `Supporting documents (${d.docs.length}): ${d.docs.length ? d.docs.join(", ") : "None"}`,
      ...(d.notes ? [`Notes: ${d.notes}`] : []),
      "",
      `History (${trail.length}):`,
      ...(trail.length ? trail.map((h) => `  - ${h.at} · ${h.changedBy} · ${h.action}${h.field ? ` ${h.field}: ${h.previous} → ${h.next}` : ""}`) : ["  No changes recorded"]),
      "",
      `Downloaded ${new Date().toLocaleString("en-US")}`,
    ]);
  };
  const openEdit = (d: DamageItem) => { setAddingTo(null); setEditDraft(draftOf(d)); setEditingId(d.id); };

  // Only what changed is written and recorded — the same diff the Damages
  // Analysis stage makes, through the same store operation.
  const saveEdit = (item: DamageItem, draft: DamageDraft) => {
    if (!damagesStore) return;
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
    if (item.bucket === "economic") {
      next.group = draft.group;
      next.subcategory = draft.subcategory || undefined;
      note(DAMAGE_FIELD_LABEL.group, item.group, draft.group);
      note("Subcategory", item.subcategory ?? "", draft.subcategory);
    }
    // A changed document list changes the count, never below what it lists.
    if (next.docs!.length !== item.docs.length) {
      next.docCount = Math.max(item.docCount - item.docs.length, 0) + next.docs!.length;
    }
    if (changes.length > 0) damagesStore.updateDamage(item.id, next, changes, actor, REASON);
    setEditingId(null);
  };

  const addDamage = () => {
    if (!damagesStore || !addingTo) return;
    const docs = parseDocs(addDraft.docs);
    damagesStore.createDamage(
      {
        id: `damage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: addDraft.label.trim(),
        bucket: addingTo,
        group: addDraft.group,
        subcategory: addingTo === "economic" ? addDraft.subcategory || undefined : undefined,
        amount: parseMoney(addDraft.amount),
        description: addDraft.description,
        category: addDraft.category.trim() || addDraft.label.trim(),
        reasoning: addDraft.reasoning,
        notes: addDraft.notes.trim() || undefined,
        docs,
        docCount: docs.length,
        iconKey: "receipt",
        // Added by hand and not yet reconciled against the evidence.
        verified: false,
      },
      actor,
      REASON,
    );
    setAddingTo(null);
  };

  const confirmDeleteDamage = () => {
    if (!damagesStore || !deletingDamage) return;
    damagesStore.deleteDamage(deletingDamage.id, actor, REASON);
    setDeletingId(null);
    setEditingId(null);
  };

  // One damage row: the existing expandable line, with Edit beside the amount;
  // in edit mode, the shared damage form in its place.
  const damageRow = (d: DamageItem) => {
    const item = toVal(d);
    const open = expandedRows.has(d.id);
    const hasDocs = item.docs.length > 0;
    return (
      <div key={d.id} className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => toggleRow(d.id)} aria-expanded={open} className="flex items-center gap-1.5 text-left min-w-0">
            <span className="body-text sm:w-[170px] shrink-0">{item.label}</span>
            {d.provenance !== "system" && (
              <span className="pill pill-neutral shrink-0">
                {d.provenance.startsWith("ai") ? <Sparkles className="w-3 h-3" strokeWidth={1.75} /> : <UserPlus className="w-3 h-3" strokeWidth={1.75} />}
                {DAMAGE_PROVENANCE_LABEL[d.provenance]}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-[#5B6B78] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-medium text-ink tabular-nums">{formatCurrency(item.value)}</span>
            {damagesStore && (
              <RowMenu name={d.label} onEdit={() => openEdit(d)} onDelete={() => setDeletingId(d.id)} onDownload={() => downloadDamage(d)} />
            )}
          </div>
        </div>
        {open && (
          <div className="mt-2.5 ml-[22px] rounded-xl border border-line bg-offwhite p-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="secondary-text">{item.reasoning || "No supporting information recorded."}</p>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[#5B6B78]">
                <FileText className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                {hasDocs
                  ? `We considered ${item.docs[0]}${item.docCount > 1 ? ` and ${item.docCount - 1}+ more documents` : ""}.`
                  : "No supporting documents are attached yet."}
              </div>
              {d.notes && <p className="secondary-text mt-1.5">Note: {d.notes}</p>}
            </div>
            {hasDocs && (
              <button onClick={() => openDrawer(item)} className="shrink-0 text-sm font-semibold text-deep hover:text-ink transition-colors whitespace-nowrap">
                View details →
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Factors ──
  const [factorForm, setFactorForm] = useState<{ factor?: FactorItem; ai?: boolean } | null>(null);
  // One factor, as a plain-text record.
  const downloadFactor = (f: FactorItem) => {
    const trail = factorsStore?.historyFor(f.id) ?? [];
    downloadTextFile(`Damage_Factor_${safeFileName(f.category)}.txt`, [
      `${data.caseName} — non-economic damage factor`,
      "",
      `Factor: ${f.category}`,
      `Severity: ${f.severity}`,
      `Multiplier range: ${bandOf(f)}`,
      `Multiplier contribution: ${fmtX(f.multiplier)}${f.multiplier !== f.aiMultiplier ? ` (AI recommended ${fmtX(f.aiMultiplier)})` : ""}`,
      `Origin: ${f.provenance}${f.addedBy ? ` · ${f.addedBy}` : ""}`,
      "",
      `Supporting rationale: ${f.rationale || "None recorded"}`,
      `Supporting evidence: ${f.docCount} ${f.docCount === 1 ? "document" : "documents"} · ${f.evidence.strength} (${f.evidence.primaryRecords} primary records, ${f.evidence.expertOpinions} expert opinions, ${f.evidence.witnessStatements} witness statements)`,
      "",
      `History (${trail.length}):`,
      ...(trail.length ? trail.map((h) => `  - ${h.at} · ${h.changedBy} · ${h.action}${h.previous || h.next ? `: ${h.previous ?? ""} → ${h.next ?? ""}` : ""}${h.reason ? ` · ${h.reason}` : ""}`) : ["  No changes recorded"]),
      "",
      `Downloaded ${new Date().toLocaleString("en-US")}`,
    ]);
  };
  const [deletingFactorId, setDeletingFactorId] = useState<string | null>(null);
  const [factorHistoryId, setFactorHistoryId] = useState<string | null>(null);
  const deletingFactor = factors.find((f) => f.id === deletingFactorId) ?? null;
  const factorHistoryItem = factors.find((f) => f.id === factorHistoryId) ?? null;

  const saveFactor = (draft: FactorDraft, mult: number, note: string): string | null => {
    if (!factorsStore || !factorForm) return "Factors cannot be changed here.";
    const range = draftRange(draft);
    const name = draft.name.trim();
    const existing = factorForm.factor;
    if (factors.some((f) => f.id !== existing?.id && f.category.toLowerCase() === name.toLowerCase())) return "A factor with that name is already on the case.";
    if (!existing) {
      factorsStore.createFactor(
        {
          id: `factor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          category: name,
          rationale: draft.description.trim(),
          severity: draft.severity,
          // An added factor has no AI recommendation; its own position is recorded as both.
          aiMultiplier: mult, aiRange: range,
          multiplier: mult, range,
          confidence: 0,
          docCount: 0,
          drivers: [],
          aiReasoning: draft.description.trim() || `${name} was added by the attorney and has no AI analysis on file yet.`,
          evidence: { strength: "Limited", primaryRecords: 0, expertOpinions: 0, witnessStatements: 0, medicalQuality: "Limited" },
          defense: { argument: "No defense analysis is on file for this factor yet.", strength: "Moderate", rebuttal: "Add supporting evidence to develop a rebuttal." },
          suggestion: { evidence: "Supporting documentation", why: "Evidence on file would let the AI assess this factor.", multiplierGain: 0 },
        },
        factorActor,
        note || undefined,
      );
    } else {
      factorsStore.updateFactor(existing.id, { category: name, rationale: draft.description, severity: draft.severity, multiplier: mult, range }, factorActor, note || undefined);
    }
    setFactorForm(null);
    return null;
  };
  const confirmDeleteFactor = () => {
    if (!factorsStore || !deletingFactor) return;
    factorsStore.deleteFactor(deletingFactor.id, factorActor);
    setDeletingFactorId(null);
    setFactorForm(null);
  };

  // The "Recommended" valuation summary is pinned to LECO's recommended multiplier
  // (baseMultiplier). The interactive slider below is an exploration tool only and
  // does not alter the recommended figures.

  // Key valuation factors that justify the currently selected multiplier zone
  const valuationFactors =
    multiplier < 5
      ? {
          posture: "Conservative",
          factors: ["Early Settlement Goal", "Reduced Trial Risk", "Faster Resolution", "Liability Largely Undisputed"],
        }
      : multiplier < 11
      ? {
          posture: "Recommended",
          factors: ["Clear Liability", "Severe Injuries", "Strong Evidence", "Favorable Jurisdiction"],
        }
      : {
          posture: "Aggressive",
          factors: ["Egregious Negligence", "Permanent Impairment", "Punitive Exposure", "Trial-Ready Evidence"],
        };

  return (
    <>
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

      <StageNavigator currentStage="Valuation" onStageClick={onStageClick} />

      {addingTo && (
        <DamageFormModal
          heading={addingTo === "economic" ? "Add Economic Damage" : "Add Non-Economic Damage"}
          bucket={addingTo}
          draft={addDraft}
          setDraft={setAddDraft}
          saveLabel="Save Damage"
          onSave={addDamage}
          onCancel={() => setAddingTo(null)}
          aiDocuments={docNames}
          startWithAI={damageAI}
        />
      )}
      {editingDamage && (
        <DamageFormModal
          heading={editingDamage.bucket === "economic" ? "Edit Economic Damage" : "Edit Non-Economic Damage"}
          bucket={editingDamage.bucket}
          draft={editDraft}
          setDraft={setEditDraft}
          saveLabel="Save Changes"
          onSave={() => saveEdit(editingDamage, editDraft)}
          onCancel={() => setEditingId(null)}
          onDelete={() => setDeletingId(editingDamage.id)}
          onHistory={() => setHistoryId(editingDamage.id)}
        />
      )}
      {deletingDamage && (
        <DeleteDamageDialog item={deletingDamage} onCancel={() => setDeletingId(null)} onConfirm={confirmDeleteDamage} />
      )}
      {historyDamage && damagesStore && (
        <DamageHistoryDrawer item={historyDamage} entries={damagesStore.historyFor(historyDamage.id)} onClose={() => setHistoryId(null)} />
      )}
      {factorForm && (
        <FactorFormModal
          factor={factorForm.factor}
          withAI={!!factorForm.ai}
          overall={recommendedMultiplier}
          onSave={saveFactor}
          onDelete={factorForm.factor ? () => setDeletingFactorId(factorForm.factor!.id) : undefined}
          onHistory={factorForm.factor ? () => setFactorHistoryId(factorForm.factor!.id) : undefined}
          onClose={() => setFactorForm(null)}
        />
      )}
      {deletingFactor && (
        <DeleteFactorDialog
          factor={deletingFactor}
          impact={`The recommended multiplier would go from ${fmtX(recommendedMultiplier)} to ${fmtX(recommendedMultiplier - deletingFactor.multiplier)}. Its supporting evidence stays on the case file.`}
          onCancel={() => setDeletingFactorId(null)}
          onConfirm={confirmDeleteFactor}
        />
      )}
      {factorHistoryItem && factorsStore && (
        <FactorHistoryDrawer factor={factorHistoryItem} entries={factorsStore.historyFor(factorHistoryItem.id)} onClose={() => setFactorHistoryId(null)} />
      )}

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">

        {analysisFindings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-tint rounded-xl flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8 text-deep" strokeWidth={1.75} />
            </div>
            <h2 className="section-header mb-2">Valuation is unavailable until analysis has been completed</h2>
            <p className="body-text mb-6 max-w-sm">LECO needs liability and injury signals from the Analysis stage before computing case value.</p>
            <Button onClick={onReturnToAnalysis} className="btn btn-primary">
              Return to Analysis
            </Button>
          </div>
        )}

        {analysisFindings.length > 0 && (<>

        {/* Page Header */}
        <div>
          <h1 className="page-title" style={{ fontSize: "24px" }}>Stage 3 - Case Valuation</h1>
        </div>

        {/* ── VALUATION SUMMARY ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* LEFT — Damage Computation (single card; Economic / Non-Economic tabs + total) */}
          <div className="lg:col-span-2 lg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
              <h2 className="section-header">Damage Computation</h2>
            </div>

            {/* Three stacked sections: Economic · Non-Economic · Total */}
            <div className="space-y-5">

              {/* 1 — Economic Damages */}
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="bg-tint px-5 py-3 border-b border-line flex items-center justify-between gap-3">
                  <h3 className="card-title">Economic Damages</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="pill pill-progress">Verified</span>
                    {damagesStore && (
                      <>
                        <button onClick={() => openAdd("economic")} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand transition-colors">
                          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="p-5">
                  <div className="divide-y divide-line">
                    {economicItems.length === 0 && <p className="secondary-text py-3">No economic damages on file.</p>}
                    {economicItems.map(damageRow)}
                  </div>
                  <div className="mt-3 pt-3 border-t-2 border-line flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">Economic Damages Subtotal</span>
                    <span className="text-lg font-bold text-ink tabular-nums">{formatCurrency(baseEconomic)}</span>
                  </div>
                </div>
              </div>

              {/* 2 — Non-Economic Damages */}
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="bg-tint px-5 py-3 border-b border-line flex items-center justify-between gap-3">
                  <h3 className="card-title">Non-Economic Damages</h3>
                  {damagesStore && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openAdd("noneconomic")} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand transition-colors">
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-5 space-y-6">
                  {/* Itemised non-economic damages — added to the multiplier-derived figure */}
                  {nonEconomicItems.length > 0 && (
                    <div className="rounded-xl border border-line p-4">
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <h4 className="card-title">Itemised Non-Economic Damages</h4>
                        <span className="text-sm font-bold text-ink tabular-nums shrink-0">{formatCurrency(nonEconomicItemsTotal)}</span>
                      </div>
                      <div className="divide-y divide-line">{nonEconomicItems.map(damageRow)}</div>
                      <p className="secondary-text mt-2.5">Itemised amounts are added to the multiplier-derived estimate below.</p>
                    </div>
                  )}
                  {/* Top metrics — sky-blue brand cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-tint border border-[#D6F2F7] rounded-xl p-4">
                      <div className="eyebrow mb-1">Recommended Multiplier</div>
                      <div className="text-2xl font-bold text-deep tabular-nums">{multiplierRange(recommendedMultiplier)}</div>
                    </div>
                    <div className="bg-tint border border-[#D6F2F7] rounded-xl p-4">
                      <div className="eyebrow mb-1">Estimated Non-Economic Damages</div>
                      <div className="text-2xl font-bold text-ink tabular-nums">{formatRange(baseMult)}</div>
                    </div>
                  </div>

                  {/* Recommended Valuation Strategy — full-width explanation */}
                  <div className="bg-[#F6FDFF] border border-[#D6F2F7] rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
                      <span className="eyebrow text-deep">Recommended Valuation Strategy</span>
                    </div>
                    <p className="body-text">
                      LECO recommends applying a <strong className="font-semibold text-ink">{multiplierRange(recommendedMultiplier)} multiplier</strong> to estimate{" "}
                      <strong className="font-semibold text-ink">Non-Economic Damages</strong> based on the verified case evidence and overall case strength.
                    </p>
                  </div>

                  {/* Damage Factors — collapsible breakdown of what the multiplier covers */}
                  <div className="border border-line rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 pr-4 hover:bg-wash transition-colors">
                    <button
                      onClick={() => setDamageFactorsOpen((v) => !v)}
                      aria-expanded={damageFactorsOpen}
                      className="flex-1 min-w-0 flex items-center justify-between gap-4 pl-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="card-title">Damage Factors</span>
                          <span className="text-xs font-semibold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2 py-0.5 tabular-nums">
                            {factors.length}
                          </span>
                        </div>
                        <p className="secondary-text mt-0.5">
                          Factors contributing to the recommended {multiplierRange(recommendedMultiplier)} multiplier.
                        </p>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-[#5B6B78] shrink-0 transition-transform duration-200 ${damageFactorsOpen ? "" : "-rotate-90"}`}
                        strokeWidth={1.75}
                      />
                    </button>
                    {factorsStore && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { setDamageFactorsOpen(true); setFactorForm({}); }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:border-brand hover:bg-tint transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Add Damage Factor
                        </button>
                      </div>
                    )}
                    </div>

                    {damageFactorsOpen && (
                      <div className="border-t border-line divide-y divide-[#EAF1F4]">
                        {factors.length === 0 && <p className="secondary-text px-4 py-4">No damage factors on file.</p>}
                        {factors.map((f, idx) => {
                          const isReasoningOpen = expandedReasoningFactorIndex === idx;
                          const seedName = seedNameOf(f);
                          const reasoning = seedName ? damageFactorReasonings[seedName] : undefined;
                          return (
                            <div key={f.id}>
                              {/* Damage Factor Row */}
                              <div className="px-4 py-4 flex gap-4">
                                {/* LEFT: Factor name + severity badge + description */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-sm font-semibold text-ink">{f.category}</span>
                                    <span className={SEVERITY_PILL[f.severity]}>{f.severity}</span>
                                    {f.provenance !== "ai-generated" && <FactorProvenanceBadge provenance={f.provenance} />}
                                  </div>
                                  <p className="secondary-text text-sm">{f.rationale || "No rationale recorded."}</p>
                                </div>

                                {/* RIGHT: Multiplier + MULTIPLIER label + View reasoning */}
                                <div className="flex flex-col items-end justify-start shrink-0 gap-1.5">
                                  <div className="flex items-start gap-1">
                                    <div className="text-right">
                                      <div className="text-sm font-semibold text-ink tabular-nums">{bandOf(f)}</div>
                                      <div className="text-[10px] uppercase tracking-wide text-[#8A98A3]">Multiplier</div>
                                    </div>
                                    {factorsStore && (
                                      <RowMenu name={f.category} onEdit={() => setFactorForm({ factor: f })} onDelete={() => setDeletingFactorId(f.id)} onDownload={() => downloadFactor(f)} />
                                    )}
                                  </div>
                                  {reasoning && (
                                    <button
                                      onClick={() => setExpandedReasoningFactorIndex(isReasoningOpen ? null : idx)}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink transition-colors whitespace-nowrap"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                                      View reasoning
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Expanded reasoning panel */}
                              {isReasoningOpen && reasoning && (
                                <div className="px-4 py-3 bg-offwhite border-t border-[#EAF1F4]">
                                  <div className="rounded-xl border border-line bg-white overflow-hidden flex flex-col">
                                    {/* Sticky Header */}
                                    <button
                                      onClick={() => setExpandedReasoningFactorIndex(null)}
                                      className="sticky top-0 z-10 w-full flex items-center justify-between gap-2 bg-white border-b border-line px-5 py-3 hover:bg-wash transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
                                        <h4 className="text-sm font-bold text-ink">AI Multiplier Analysis</h4>
                                      </div>
                                      <ChevronUp className="w-4 h-4 text-[#5B6B78]" strokeWidth={2} />
                                    </button>

                                    {/* Scrollable content */}
                                    <div className="p-5 space-y-4 overflow-y-auto max-h-[500px]">
                                      {/* Why this multiplier? */}
                                      <div>
                                        <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-1.5">Why {reasoning.recommendedRange}?</p>
                                        <p className="text-sm text-[#5B6B78] leading-relaxed">{reasoning.whyMultiplier}</p>
                                      </div>

                                      {/* Evidence sections */}
                                      <div className="space-y-3.5 pt-2">
                                        {/* Injury Profile */}
                                        <div className="rounded-lg bg-[#F6FDFF] border border-[#D6F2F7] p-3">
                                          <p className="text-xs font-bold text-deep uppercase tracking-wide mb-1.5">Injury Profile</p>
                                          <div className="space-y-1.5">
                                            <div className="text-xs">
                                              <span className="font-semibold text-[#5B6B78]">Affected Area:</span>
                                              <span className="text-[#5B6B78] ml-1">{reasoning.injuryProfile.affectedArea}</span>
                                            </div>
                                            <div className="text-xs">
                                              <span className="font-semibold text-[#5B6B78]">Injury:</span>
                                              <span className="text-[#5B6B78] ml-1">{reasoning.injuryProfile.injury}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Injury Severity & Impact */}
                                        <div className="rounded-lg bg-[#F6FDFF] border border-[#D6F2F7] p-3">
                                          <p className="text-xs font-bold text-deep uppercase tracking-wide mb-1.5">Injury Severity & Impact</p>
                                          <div className="space-y-1.5">
                                            <div className="text-xs">
                                              <span className="font-semibold text-[#5B6B78]">Intensity:</span>
                                              <span className="text-[#5B6B78] ml-1">{reasoning.injurySeverityImpact.intensity}</span>
                                            </div>
                                            <div className="text-xs">
                                              <span className="font-semibold text-[#5B6B78]">Explanation:</span>
                                              <span className="text-[#5B6B78] ml-1">{reasoning.injurySeverityImpact.explanation}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Precedent Case Analysis */}
                                        <div className="rounded-lg bg-[#F6FDFF] border border-[#D6F2F7] p-3 space-y-4">
                                          <p className="text-xs font-bold text-deep uppercase tracking-wide">Precedent Case Analysis</p>

                                          <div>
                                            <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-2">Precedent Cases Considered</p>
                                            <div className="space-y-2.5">
                                              {multiplierPrecedentCases.map((precedent) => (
                                                <div key={precedent.caseName} className="flex items-start justify-between gap-3 text-xs">
                                                  <span className="font-semibold text-[#5B6B78]">{precedent.caseName}</span>
                                                  <span className="text-right shrink-0 text-[#5B6B78]">
                                                    <span className="font-semibold text-deep">{precedent.matchScore}% Match</span>
                                                    <span className="block">Settlement Value: {formatCurrency(precedent.settlementValue)}</span>
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="border-t border-[#D6F2F7] pt-3">
                                            <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-2">Historical Settlement Outcomes</p>
                                            <div className="flex items-center justify-between gap-2 text-xs font-bold text-ink tabular-nums">
                                              {multiplierPrecedentCases.map((precedent) => <span key={precedent.caseName}>{formatCompactUSD(precedent.settlementValue)}</span>)}
                                            </div>
                                            <div className="mt-2 text-xs text-[#5B6B78]">
                                              <span className="font-semibold">Historical Range:</span> {formatCompactUSD(Math.min(...multiplierPrecedentCases.map((precedent) => precedent.settlementValue)))} – {formatCompactUSD(Math.max(...multiplierPrecedentCases.map((precedent) => precedent.settlementValue)))}
                                            </div>
                                          </div>

                                          <div className="border-t border-[#D6F2F7] pt-3">
                                            <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-2">Settlement & Valuation Context</p>
                                            <div className="space-y-2.5">
                                              <div className="text-xs text-[#5B6B78]">
                                                <div className="font-semibold text-ink">Reyes v. Interstate Freight Lines</div>
                                                <div className="mt-1">Settlement Value: $1,750,000 · Match: 94%</div>
                                                <div className="mt-1">Valuation Context: Strong precedent for severe, permanent impairment cases.</div>
                                              </div>
                                              <div className="text-xs text-[#5B6B78]">
                                                <div className="font-semibold text-ink">Donovan v. Metro Cartage Co.</div>
                                                <div className="mt-1">Settlement Value: $1,420,000 · Match: 89%</div>
                                                <div className="mt-1">Valuation Context: Supports the mid-to-upper valuation range for comparable injury and liability circumstances.</div>
                                              </div>
                                              <div className="text-xs text-[#5B6B78]">
                                                <div className="font-semibold text-ink">Whitfield v. Prairie Logistics</div>
                                                <div className="mt-1">Settlement Value: $1,180,000 · Match: 85%</div>
                                                <div className="mt-1">Valuation Context: Provides a lower-end historical reference for permanent impairment cases.</div>
                                              </div>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-[#D6F2F7]">
                                              <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-1.5">Historical Settlement Range</p>
                                              <p className="text-sm font-bold text-ink tabular-nums">$1.18M – $1.75M</p>
                                              <p className="text-xs text-[#5B6B78] leading-relaxed mt-1.5">Historical precedent supports the current valuation range based on comparable injury severity, permanence, and case circumstances.</p>
                                            </div>
                                          </div>

                                          <div className="border-t border-[#D6F2F7] pt-3">
                                            <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-2">Case-Level Analysis</p>
                                            <div className="space-y-3">
                                              {multiplierPrecedentCases.map((precedent) => (
                                                <div key={precedent.caseName}>
                                                  <p className="text-xs font-semibold text-ink mb-1">{precedent.caseName}</p>
                                                  <ul className="space-y-1">
                                                    {precedent.analysis.map((item) => (
                                                      <li key={item} className="text-xs text-[#5B6B78] flex items-start gap-1.5">
                                                        <span className="text-deep">•</span><span>{item}</span>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="border-t border-[#D6F2F7] pt-3">
                                            <p className="text-xs font-semibold text-[#5B6B78] uppercase tracking-wide mb-1.5">Valuation Relevance</p>
                                            <p className="text-xs text-[#5B6B78] leading-relaxed">{precedentValuationRelevance[seedName ?? ""]}</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Recommended Range */}
                                      <div className="rounded-lg bg-tint border border-[#D6F2F7] p-3">
                                        <p className="text-xs font-bold text-deep uppercase tracking-wide mb-1.5">Recommended Range</p>
                                        <p className="text-sm font-bold text-ink tabular-nums">{reasoning.recommendedRange}</p>
                                      </div>

                                      {/* AI Recommendation */}
                                      <div>
                                        <p className="text-xs font-bold text-deep uppercase tracking-wide mb-1.5">AI Recommendation</p>
                                        <p className="text-sm text-[#5B6B78] leading-relaxed italic">{reasoning.aiRecommendation}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Summary — combined factors → recommended multiplier → non-economic estimate */}
                        <div className="bg-tint px-4 py-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-[#5B6B78]">Recommended Multiplier</span>
                            <span className="text-sm font-bold text-ink tabular-nums">{multiplierRange(recommendedMultiplier)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-[#5B6B78]">Estimated Non-Economic Damages</span>
                            <span className="text-sm font-bold text-ink tabular-nums">{formatRange(baseMult)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recommendation Factors — why 9× was recommended */}
                  <div>
                    <div className="eyebrow mb-3">Recommendation Factors</div>
                    <div className="flex flex-wrap gap-2">
                      {keyFactors.map((f) => (
                        <span key={f} className="pill pill-neutral">
                          <CheckCircle className="w-4 h-4" strokeWidth={1.75} />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 — Total Recommended Value (slim) */}
              <div className="bg-ink rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="eyebrow text-soft mb-1">Total Recommended Value</div>
                  <div className="font-mono text-xs text-soft tabular-nums truncate">
                    {formatCurrency(baseEconomic)} <span className="text-brand">+</span> {formatRange(baseMult)}
                  </div>
                </div>
                <div className="text-white font-bold tabular-nums shrink-0" style={{ fontSize: "24px", lineHeight: 1.1, letterSpacing: "-0.01em" }}>
                  {formatRange(baseTotal)}
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT — Settlement Estimate (sticky, offset below the sticky breadcrumb + stage nav) */}
          <div className="lg:col-span-1 lg-card p-6 sticky top-[160px]">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
              <h2 className="section-header">Settlement Estimate</h2>
            </div>

            <div className="space-y-5">
              <div>
                <div className="eyebrow mb-1">Recommended Settlement Value</div>
                <div className="text-ink font-bold tabular-nums" style={{ fontSize: "26px", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {formatRange(baseTotal)}
                </div>
              </div>

              <div className="border-t border-line pt-5">
                <div className="eyebrow mb-1">Recommended Multiplier</div>
                <div className="text-2xl font-bold text-deep tabular-nums">{multiplierRange(recommendedMultiplier)}</div>
              </div>

              <div className="border-t border-line pt-5">
                <div className="eyebrow mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-deep" strokeWidth={1.75} />
                  <span className="text-sm font-semibold text-deep">Valuation Completed</span>
                </div>
              </div>

              <div className="border-t border-line pt-5">
                <Button
                  onClick={onProceedToCaseReady}
                  className="w-full btn btn-primary gap-2"
                >
                  Proceed To Case Ready
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── PRECEDENT CASES ── */}
        <div className="lg-card p-6">
          <div>
            <h2 className="section-header mb-1">Precedent Cases</h2>
            <p className="secondary-text mb-4">Comparable cases that help benchmark the recommended valuation.</p>

            {/* Collapsed state */}
            {!expandedPrecedentCases && (
              <>
                <p className="text-sm text-ink font-semibold mb-3">Comparable cases based on jurisdiction, injury severity, liability, and long-term impact.</p>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-bold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2.5 py-1">94% Highest Match</span>
                  <span className="pill pill-neutral text-xs">{historicCaseBenchmarkData.caseCount} Comparable Cases</span>
                </div>
                <button
                  onClick={() => setExpandedPrecedentCases(true)}
                  className="text-sm text-deep hover:text-ink transition-colors inline-flex items-center gap-1 group"
                >
                  <span className="font-semibold">View precedent cases</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
                </button>
              </>
            )}

            {/* Expanded precedent cases */}
            {expandedPrecedentCases && (
              <div className="mt-4 pt-4 border-t border-line space-y-6">
                {/* Primary Precedent Case */}
                <div>
                  <h3 className="card-title mb-3">Primary Precedent Case</h3>
                  <div className="rounded-lg border border-line bg-offwhite p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-deep bg-tint border border-[#D6F2F7] rounded-full px-2.5 py-1 inline-block mb-2">
                          {historicCaseBenchmarkData.precedentCase.matchPercentage}% Match
                        </div>
                        <div className="text-sm font-bold text-ink">{historicCaseBenchmarkData.precedentCase.caseTitle}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-semibold text-[#5B6B78] text-xs">Jurisdiction</span>
                        <div className="text-ink">{historicCaseBenchmarkData.precedentCase.jurisdiction}</div>
                      </div>
                      <div>
                        <span className="font-semibold text-[#5B6B78] text-xs">Injury Type</span>
                        <div className="text-ink">{historicCaseBenchmarkData.precedentCase.injuryType}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-[#5B6B78] text-xs">Injury Intensity</span>
                        <div className="text-ink">{historicCaseBenchmarkData.precedentCase.injuryIntensity}</div>
                      </div>
                    </div>
                    <div className="border-t border-line pt-3">
                      <span className="text-xs font-semibold text-[#5B6B78]">Settlement Value</span>
                      <div className="text-lg font-bold text-ink tabular-nums">{formatCurrency(historicCaseBenchmarkData.precedentCase.settlementValue)}</div>
                    </div>
                  </div>
                </div>

                {/* Why This Case Matches */}
                <div className="border-t border-line pt-6">
                  <h3 className="card-title mb-3">Why This Case Matches</h3>
                  <div className="space-y-2 text-sm">
                    {historicCaseBenchmarkData.similarityFactors.map((factor, idx) => (
                      <div key={idx} className="flex gap-3">
                        <CheckCircle className="w-4 h-4 text-deep shrink-0 mt-0.5" strokeWidth={1.75} />
                        <span className="text-ink">{factor}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-[#5B6B78] mt-3">{historicCaseBenchmarkData.similarityExplanation}</p>
                </div>

                {/* Similarity Score */}
                <div className="border-t border-line pt-6">
                  <h3 className="card-title mb-2">Similarity Score</h3>
                  <div className="text-lg font-bold text-deep tabular-nums mb-2">{historicCaseBenchmarkData.precedentCase.matchPercentage}% Match</div>
                  <p className="text-sm text-[#5B6B78]">High similarity based on jurisdiction, injury severity, liability profile, and long-term impact.</p>
                </div>

                {/* Negligence & Violations */}
                <div className="border-t border-line pt-6">
                  <h3 className="card-title mb-3">Negligence & Violations</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex gap-4">
                      <span className="font-semibold text-[#5B6B78] w-32 shrink-0">Liability Strength</span>
                      <span className="text-ink">{historicCaseBenchmarkData.negligenceLiability.liabilityStrength}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="font-semibold text-[#5B6B78] w-32 shrink-0">Primary Finding</span>
                      <span className="text-ink">{historicCaseBenchmarkData.negligenceLiability.primaryFinding}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedLegalFramework(!expandedLegalFramework)}
                    className="mt-3 text-sm text-deep hover:text-ink transition-colors inline-flex items-center gap-1 group"
                  >
                    <span className="font-semibold">View legal framework</span>
                    <ArrowRight className={`w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform ${expandedLegalFramework ? "rotate-90" : ""}`} strokeWidth={2} />
                  </button>

                  {expandedLegalFramework && (
                    <div className="mt-4 pt-4 border-t border-line space-y-3">
                      <div className="text-sm space-y-2">
                        <div className="flex gap-4">
                          <span className="font-semibold text-[#5B6B78] w-32 shrink-0">Jurisdiction</span>
                          <span className="text-ink">{historicCaseBenchmarkData.negligenceLiability.jurisdiction}</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="font-semibold text-[#5B6B78] w-32 shrink-0">Legal Authority</span>
                          <span className="text-ink">{historicCaseBenchmarkData.negligenceLiability.legalAuthority}</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="font-semibold text-[#5B6B78] w-32 shrink-0">Statute / Code</span>
                          <span className="text-ink">{historicCaseBenchmarkData.negligenceLiability.statuteCode}</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-tint border border-[#D6F2F7] p-3">
                        <div className="text-xs font-semibold text-deep mb-1">Legal Relevance</div>
                        <p className="text-xs text-[#5B6B78]">{historicCaseBenchmarkData.negligenceLiability.legalRelevance}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#5B6B78] mb-2">Violations / Legal Findings</div>
                        <ul className="space-y-1">
                          {historicCaseBenchmarkData.negligenceLiability.violations.map((violation, idx) => (
                            <li key={idx} className="text-xs text-ink flex gap-2">
                              <span className="text-deep shrink-0">–</span>
                              <span>{violation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {/* Other Comparable Cases */}
                <div className="border-t border-line pt-6">
                  <h3 className="card-title mb-3">Other Comparable Cases</h3>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-line bg-offwhite p-3 text-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-semibold text-ink">Comparable Case Example</div>
                          <div className="text-xs text-[#5B6B78]">Cook County, Illinois</div>
                        </div>
                        <div className="text-xs font-bold text-deep shrink-0">89% Match</div>
                      </div>
                      <div className="text-xs text-[#5B6B78]">Severe neurological injury · $1.42M</div>
                    </div>
                    <div className="rounded-lg border border-line bg-offwhite p-3 text-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-semibold text-ink">Comparable Case Example</div>
                          <div className="text-xs text-[#5B6B78]">Illinois</div>
                        </div>
                        <div className="text-xs font-bold text-deep shrink-0">86% Match</div>
                      </div>
                      <div className="text-xs text-[#5B6B78]">Permanent neurological impairment · $1.28M</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-[#F6FDFF] border border-[#D6F2F7] p-3">
                  <p className="text-xs text-[#5B6B78] italic">Supporting evidence for valuation benchmarking — does not affect the multiplier calculation.</p>
                </div>

                {expandedPrecedentCases && (
                  <div className="pt-4 border-t border-line">
                    <button
                      onClick={() => setExpandedPrecedentCases(false)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-deep hover:text-ink transition-colors"
                    >
                      <span>Collapse section</span>
                      <span aria-hidden="true">⌃</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── INTERACTIVE MULTIPLIER STRATEGY ── */}
        <div id="multiplier-strategy" className="lg-card p-6 scroll-mt-32">
          <h2 className="section-header mb-1">Interactive Multiplier Strategy</h2>
          <p className="body-text mb-8">Adjust the risk and recovery multiplier to explore case value scenarios.</p>

          {/* Key Valuation Factors */}
          <div className="relative bg-[#F6FDFF] border border-[#D6F2F7] rounded-[10px] p-4 mb-8">
            <div className="flex items-center justify-between mb-2.5">
              <div className="eyebrow">Key Valuation Factors</div>
              <div className="eyebrow text-deep">{valuationFactors.posture} · {multiplier}x</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {valuationFactors.factors.map((factor) => (
                <span key={factor} className="pill pill-neutral">
                  <CheckCircle className="w-4 h-4" strokeWidth={1.75} />
                  {factor}
                </span>
              ))}
            </div>
            {/* Downward tail pointing to the multiplier label below */}
            <div className="absolute left-1/2 -bottom-3 -translate-x-1/2 w-6 h-6 rotate-45 bg-[#F6FDFF] border-r-2 border-b-2 border-[#D6F2F7]" />
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-[#5B6B78] mb-3">
                <span>Conservative (1.5x)</span>
                <span className="text-base font-bold text-deep bg-[#F6FDFF] border border-[#D6F2F7] rounded-lg px-3 py-1">{multiplier}x multiplier</span>
                <span>Aggressive (15x)</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={15}
                step={0.5}
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3FB5D7 0%, #3FB5D7 ${((multiplier - 1.5) / (15 - 1.5)) * 100}%, #EEF3F6 ${((multiplier - 1.5) / (15 - 1.5)) * 100}%, #EEF3F6 100%)`,
                }}
              />
              <div className="flex items-center justify-between text-xs text-[#5B6B78] mt-1">
                <span>1.5x</span>
                <span>6x</span>
                <span>9x</span>
                <span>12x</span>
                <span>15x</span>
              </div>
            </div>

            {/* Scenario cards */}
            <div className="grid grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setMultiplier(3)}
                className={`border rounded-xl p-4 text-center transition-all cursor-pointer hover:border-soft ${multiplier < 5 ? "border-brand bg-tint" : "border-line"}`}
              >
                <div className="eyebrow mb-2">Conservative</div>
                <div className="text-lg font-bold text-ink">{formatRange(baseEconomic + baseEconomic * 3)}</div>
                <div className="mono-ref mt-1">{multiplierRange(3)} multiplier</div>
              </button>
              <button
                type="button"
                onClick={() => setMultiplier(9)}
                className={`border rounded-xl p-4 text-center transition-all cursor-pointer hover:border-soft ${multiplier >= 5 && multiplier < 11 ? "border-brand bg-tint" : "border-line"}`}
              >
                <div className="eyebrow mb-2">Recommended</div>
                <div className="text-lg font-bold text-ink">{formatRange(baseTotal)}</div>
                <div className="mono-ref mt-1">{multiplierRange(recommendedMultiplier)} multiplier</div>
              </button>
              <button
                type="button"
                onClick={() => setMultiplier(12)}
                className={`border rounded-xl p-4 text-center transition-all cursor-pointer hover:border-soft ${multiplier >= 11 ? "border-brand bg-tint" : "border-line"}`}
              >
                <div className="eyebrow mb-2">Aggressive</div>
                <div className="text-lg font-bold text-ink">{formatRange(baseEconomic + baseEconomic * 12)}</div>
                <div className="mono-ref mt-1">{multiplierRange(12)} multiplier</div>
              </button>
            </div>
          </div>
        </div>

        {/* ── PROCEED TO CASE READY ── */}
        <div className="lg-zone p-6 flex items-center justify-between">
          <div>
            <h3 className="card-title mb-1">Ready to proceed?</h3>
            <p className="body-text">Valuation is complete. Advance to Case Ready to prepare the attorney package.</p>
          </div>
          <Button
            onClick={onProceedToCaseReady}
            className="btn btn-primary gap-2"
          >
            Proceed To Case Ready
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Button>
        </div>

        </>)}

      </div>
    </div>

    {/* Economic line-item detail drawer */}
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
              <div className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(drawerItem.value)}</div>
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
                          <span className="text-xs font-semibold text-ink tabular-nums shrink-0">{formatCurrency(doc.amount)}</span>
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
                            onClick={() => { setWsFocus(doc.name); setWsView("preview"); }}
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
                <span className="text-sm font-bold text-ink tabular-nums">{formatCurrency(verifiedTotal)}</span>
              </div>
              <p className="text-[11px] text-[#8A98A3] mt-1.5">Sum of all {drawerItem.docCount} itemized documents · matches the verified {drawerItem.category} total.</p>
            </div>
          </div>

          <div className="border-t border-line p-4 flex items-center gap-2">
            <button onClick={() => { setWsFocus(null); setWsView("preview"); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-line text-ink text-sm font-medium hover:bg-wash transition-colors">
              <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
            </button>
            <button onClick={() => { setWsFocus(null); setWsView("insights"); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-colors">
              <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Insights
            </button>
          </div>
        </div>
      </>
    )}

    {/* Preview / Insights document workspace */}
    <DocumentWorkspaceModal
      docs={wsView && drawerItem ? orderedDrawerDocs : null}
      contextPanel={drawerItem ? { summary: [
        { label: "Category", value: drawerItem.category },
        { label: "Amount", value: formatCurrency(drawerItem.value) },
        { label: "Supporting Documents", value: String(drawerItem.docCount) },
      ] } : undefined}
      initialView={wsView ?? "preview"}
      onClose={() => { setWsView(null); setWsFocus(null); }}
      onDownload={() => {}}
    />
    </>
  );
}
