import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileSignature, FolderOpen, Settings2, Loader2, CheckCircle, Circle } from "lucide-react";
import type { AnalysisFinding, CaseDocument, DemandPackage } from "../types/case";
import {
  WorkspaceModel,
  OverviewTab, MedicalTimelineTab, EconomicDamagesTab, NonEconomicDamagesTab,
  LiabilityAnalysisTab, EvidenceRepositoryTab, DemandPackageTab, NegotiationTab,
  stageEvidence, stageDocInsights, STAGE_LABELS, EMPTY_USER_CHRONOLOGY,
  type StageId, type UserChronology,
} from "../workspace/WorkspaceTabs";
import { StageEvidenceSection, ViewEvidenceButton } from "../workspace/StageEvidence";
import { EvidenceStageTab } from "../workspace/EvidenceStage";
import { useReportAssistantStage } from "../assistant/AssistantContext";
import { useChronologyOptional } from "../chronology/ChronologyContext";
import { useWorkspaceModel } from "../workspace/useWorkspaceModel";
import { DocumentWorkspaceModal } from "../components/DocumentWorkspace";
import { DemandSpacePage } from "./DemandSpacePage";
import { DemandPackageEditorPage } from "./DemandPackageEditorPage";
import { InsuranceSummaryPage } from "./InsuranceSummaryPage";
import { DefendantAnalysisPage } from "./DefendantAnalysisPage";
import { InsuranceDetailPage } from "./InsuranceDetailPage";

interface CaseWorkspacePageProps {
  caseData?: any;
  analysisFindings?: AnalysisFinding[];
  documents?: CaseDocument[];
  onBackToIntake?: () => void;
  onNavigateToValuation?: () => void;
  /** Stage to open on arrival — used when a Case Ready deliverable links into
   *  a stage it does not itself show. */
  initialTab?: string;
  /** Chronology entries the attorney added by hand, held by the app so the
   *  Case Ready Medical Chronology shows the same entries. */
  userChronology?: UserChronology;
  onUserChronologyChange?: (next: UserChronology) => void;
}

// The workflow stages, numbered in order. Evidence is not among them: it is a
// case-level resource the attorney reaches from the header at any point, not a
// step they work through once.
const TABS = [
  { id: "overview", label: "Case Overview" },
  { id: "insurance", label: "Insurance" },
  { id: "medical", label: "Chronology" },
  { id: "economic", label: "Damages Analysis" },
  { id: "noneconomic", label: "Negligence" },
  { id: "liability", label: "Violations" },
  { id: "evidence", label: "Case Journey" },
  { id: "demand", label: "Intelligence" },
  { id: "negotiation", label: "Negotiations" },
];

// The Evidence workspace, opened from the header rather than the stage bar.
const EVIDENCE_VIEW = "evidencehub";
// The Defendant Analysis, opened from the Case Overview's Defendant tile.
const DEFENDANTS_VIEW = "defendants";

// The Insurance stage: the Insurance Policy Analysis summary, with its Full
// Detailed Analysis opened from it in place.
const INSURANCE_STAGE = "insurance";

// Stages that close with a stage-specific Evidence section. The Evidence
// workspace itself is excluded — it is the evidence surface, so a summary of its
// own evidence at the bottom would be circular. Insurance is excluded too: the
// policy document it reads is already the first thing its page shows.
const STAGE_IDS = TABS.map((t) => t.id).filter((id) => id !== EVIDENCE_VIEW && id !== INSURANCE_STAGE) as StageId[];
// Stages laid out at max-w-4xl — the Evidence section matches their width.
const NARROW_STAGES: StageId[] = ["evidence", "negotiation"];
// Anchor for each stage's own Evidence section, targeted by its View Evidence
// shortcut. Distinct per stage so a link always lands on the right section.
const EVIDENCE_ANCHOR: Record<string, string> = {
  overview: "case-overview-evidence",
  medical: "chronology-evidence",
  economic: "damages-evidence",
  noneconomic: "negligence-evidence",
  liability: "violations-evidence",
  evidence: "case-journey-evidence",
  demand: "intelligence-evidence",
  negotiation: "negotiations-evidence",
};

// Sequential steps shown while the AI drafts the Demand Letter — the only
// document generated up front. A full package is assembled later, from this.
const GENERATE_STEPS = [
  "Reviewing case facts...",
  "Extracting medical chronology...",
  "Calculating economic damages...",
  "Drafting liability narrative...",
  "Building settlement demand...",
  "Formatting legal language...",
  "Generating demand letter...",
];

export function CaseWorkspacePage({ caseData, analysisFindings = [], documents = [], onBackToIntake, onNavigateToValuation, initialTab, userChronology: sharedChronology, onUserChronologyChange }: CaseWorkspacePageProps) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "overview");

  // Which Insurance page is open. Entering the stage always lands on the
  // summary; the detailed analysis is one step in from there.
  const [insuranceDetail, setInsuranceDetail] = useState(false);
  const scrollWorkspaceTop = () => setTimeout(() => document.querySelector("main")?.scrollTo(0, 0), 0);
  const openInsurance = (detail = false) => {
    setInsuranceDetail(detail);
    setActiveTab(INSURANCE_STAGE);
    scrollWorkspaceTop();
  };
  const openTab = (id: string) => {
    if (id === INSURANCE_STAGE) openInsurance();
    else setActiveTab(id);
  };
  // The stage to return to when leaving the Evidence workspace, so the header
  // action behaves like opening a resource rather than navigating away.
  const [lastStage, setLastStage] = useState("overview");
  useEffect(() => {
    if (TABS.some((t) => t.id === activeTab)) setLastStage(activeTab);
  }, [activeTab]);

  // Tell the AI Assistant which stage is open, so its Current Stage scope
  // follows the workspace without the attorney selecting it again.
  useReportAssistantStage(activeTab, TABS.find((t) => t.id === activeTab)?.label);

  // Chronology entries the attorney added by hand. Held here so they survive
  // tab switches and so the Chronology stage's Evidence section can see the
  // documents attached to them.
  const [localChronology, setLocalChronology] = useState<UserChronology>(EMPTY_USER_CHRONOLOGY);
  const userChronology = sharedChronology ?? localChronology;
  const setUserChronology = (update: (prev: UserChronology) => UserChronology) => {
    const next = update(userChronology);
    if (onUserChronologyChange) onUserChronologyChange(next);
    else setLocalChronology(next);
  };

  // ── Stage Evidence — the documents supporting whichever stage is open ──
  const stageId = STAGE_IDS.includes(activeTab as StageId) ? (activeTab as StageId) : null;
  // Events added by the attorney and by the assistant both feed the stages that
  // consume chronology evidence, so an approved AI event is immediately usable
  // everywhere the timeline is read.
  const chronoStore = useChronologyOptional();
  const chronoEvents = [
    ...userChronology.medical,
    ...userChronology.event,
    ...(chronoStore?.additions ?? []).map((a) => ({ evidence: a.evidence } as any)),
  ];
  const evidenceDocs = stageId
    ? stageEvidence(stageId, documents, { findings: analysisFindings, userChronology: chronoEvents })
    : [];
  // Preview and Insights open the existing Document Workspace; the stage only
  // changes how the AI Insights panel frames the document.
  const [evidenceDoc, setEvidenceDoc] = useState<CaseDocument | null>(null);
  const [evidenceView, setEvidenceView] = useState<"preview" | "insights">("preview");
  const openEvidenceDoc = (doc: CaseDocument, view: "preview" | "insights") => {
    setEvidenceDoc(doc);
    setEvidenceView(view);
  };

  // ── Generate Demand → Demand Letter draft → Demand Space workflow ──
  // A full package is never created up front — only the Demand Letter is
  // generated, then opened for the attorney to review and save. The package
  // record itself is created only once that letter is saved.
  const [demandPackages, setDemandPackages] = useState<DemandPackage[]>([]);
  const [genPhase, setGenPhase] = useState<"idle" | "running" | "success">("idle");
  const [genStep, setGenStep] = useState(0);
  const [pendingGen, setPendingGen] = useState<{ strategyLabel: string; amount: number } | null>(null);
  const [letterDraft, setLetterDraft] = useState<DemandPackage | null>(null);

  const startGenerateDemand = (strategyLabel: string, amount: number) => {
    setPendingGen({ strategyLabel, amount });
    setGenStep(0);
    setGenPhase("running");
  };

  // Advance one processing step at a time; hand off to "success" at the end.
  useEffect(() => {
    if (genPhase !== "running") return;
    if (genStep >= GENERATE_STEPS.length) {
      const t = setTimeout(() => setGenPhase("success"), 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGenStep((s) => s + 1), 450);
    return () => clearTimeout(t);
  }, [genPhase, genStep]);

  // After the success beat, open the Demand Letter editor — no package yet.
  useEffect(() => {
    if (genPhase !== "success" || !pendingGen) return;
    const t = setTimeout(() => {
      const number = demandPackages.length + 1;
      setLetterDraft({
        id: `pkg-${number}-${Date.now()}`,
        number,
        label: `Demand #${String(number).padStart(3, "0")}`,
        status: "Draft",
        generatedFrom: pendingGen.strategyLabel,
        generatedAt: `Today • ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
        estimatedAmount: pendingGen.amount,
        docCount: 42,
        version: "0.0",
      });
      setGenPhase("idle");
      setPendingGen(null);
    }, 500);
    return () => clearTimeout(t);
  }, [genPhase, pendingGen, demandPackages.length]);

  // Save Changes in the letter editor: only now does the package come into
  // existence in the Library, then we redirect to Demand Space.
  const finalizeLetterDraft = (html: string, scrollTop: number) => {
    if (!letterDraft) return;
    setDemandPackages((prev) => [
      { ...letterDraft, letterHtml: html, letterScrollTop: scrollTop, version: "1.0", isNew: true },
      ...prev.map((p) => ({ ...p, isNew: false })),
    ]);
    setLetterDraft(null);
    setActiveTab("demandspace");
  };

  const updateDemandPackage = (id: string, patch: Partial<DemandPackage>) => {
    setDemandPackages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  // The same case model the Case Ready deliverables read.
  const model: WorkspaceModel = useWorkspaceModel(caseData);

  // The Case Overview carrier tile opens the Insurance stage.
  const [defendantFocus, setDefendantFocus] = useState<string | undefined>(undefined);
  const openDefendants = (name: string) => { setDefendantFocus(name); setActiveTab(DEFENDANTS_VIEW); scrollWorkspaceTop(); };
  const tabProps = { model, findings: analysisFindings, documents, goTo: openTab, goToValuation: onNavigateToValuation, onGenerateDemand: startGenerateDemand, onOpenInsurance: () => openInsurance(), onOpenDefendants: openDefendants };
  const backToOverview = () => { setActiveTab("overview"); scrollWorkspaceTop(); };

  const renderTab = () => {
    switch (activeTab) {
      case "medical": return (
        <MedicalTimelineTab
          {...tabProps}
          userChronology={userChronology}
          onAddChronology={(kind, ev) =>
            setUserChronology((prev) => ({ ...prev, [kind]: [...prev[kind], ev] }))
          }
        />
      );
      case INSURANCE_STAGE: return insuranceDetail ? (
        <InsuranceDetailPage
          embedded
          caseName={model.caseName}
          onBack={() => openInsurance(false)}
          onBackToAnalysis={backToOverview}
        />
      ) : (
        <InsuranceSummaryPage
          embedded
          caseName={model.caseName}
          caseData={{ caseType: model.caseType, caseSubType: caseData?.caseSubType }}
          documents={documents}
          backLabel="Back to Case Overview"
          onBack={backToOverview}
          onOpenDetail={() => openInsurance(true)}
        />
      );
      case DEFENDANTS_VIEW: return (
        <DefendantAnalysisPage
          embedded
          caseData={{ caseName: model.caseName, caseId: model.caseId, caseType: model.caseType, jurisdiction: model.jurisdiction, defendant: model.defendant }}
          caseRef={model.caseId}
          focusName={defendantFocus}
          backLabel="Back to Case Overview"
          onBack={backToOverview}
        />
      );
      case "economic": return <EconomicDamagesTab {...tabProps} />;
      case "noneconomic": return <NonEconomicDamagesTab {...tabProps} />;
      case "liability": return <LiabilityAnalysisTab {...tabProps} />;
      case "evidencehub": return (
        <EvidenceStageTab
          documents={documents}
          findings={analysisFindings}
          userChronology={userChronology}
          goTo={setActiveTab}
        />
      );
      case "evidence": return <EvidenceRepositoryTab {...tabProps} />;
      case "demand": return <DemandPackageTab {...tabProps} />;
      case "negotiation": return <NegotiationTab {...tabProps} />;
      case "demandspace": return (
        <DemandSpacePage
          model={model}
          packages={demandPackages}
          onUpdatePackage={updateDemandPackage}
          onBack={() => setActiveTab("demand")}
        />
      );
      default: return <OverviewTab {...tabProps} />;
    }
  };

  return (
    <div className="min-h-screen bg-wash">
      {/* ── Sticky header: breadcrumb + title + actions + tabs ── */}
      <div className="sticky top-0 z-40">
      <div className="bg-white border-b border-line">
        <div className="max-w-[1400px] mx-auto px-8 pt-5 pb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-4 secondary-text mb-5">
            <button onClick={onBackToIntake} className="flex items-center gap-1.5 hover:text-ink transition-colors">
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> Case Workspace
            </button>
            <div className="ml-auto flex items-center gap-2 min-w-0">
              <span>Case Workspace</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4]" strokeWidth={1.75} />
              {activeTab === EVIDENCE_VIEW ? (
                <>
                  {/* On the Evidence workspace the case name becomes the way
                      back to the stage the attorney came from. */}
                  <button
                    onClick={() => setActiveTab(lastStage)}
                    className="truncate hover:text-ink transition-colors"
                  >
                    {model.caseName}
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4]" strokeWidth={1.75} />
                  <span className="text-ink font-medium">Evidence</span>
                </>
              ) : (
                <span className="text-ink font-medium truncate">{model.caseName}</span>
              )}
            </div>
          </div>

          {/* Title + actions */}
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="page-title">{model.caseName}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setActiveTab("demandspace")} className={`btn gap-2 ${activeTab === "demandspace" ? "btn-primary" : "btn-secondary"}`}>
                <FileSignature className="w-4 h-4" strokeWidth={1.75} /> Demand Space
              </button>
              {/* Evidence is a case-level resource, reachable from any stage. */}
              <button
                onClick={() => setActiveTab(EVIDENCE_VIEW)}
                className={`btn gap-2 ${activeTab === EVIDENCE_VIEW ? "btn-primary" : "btn-secondary"}`}
              >
                <FolderOpen className="w-4 h-4" strokeWidth={1.75} /> Evidence
              </button>
              <button className="btn btn-secondary gap-2">
                <Settings2 className="w-4 h-4" strokeWidth={1.75} /> Manage Case
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white border-b border-line">
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t, i) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => openTab(t.id)}
                  className={`relative px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
                    active ? "text-brand" : "text-[#5B6B78] hover:text-ink"
                  }`}
                >
                  {i + 1}. {t.label}
                  {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="max-w-[1400px] mx-auto px-8 py-10">
        {/* Quick access down to this stage's own Evidence section. Secondary to
            the stage content, and absent on the Evidence stage itself. */}
        {stageId && evidenceDocs.length > 0 && (
          <div className="flex justify-end mb-4">
            <ViewEvidenceButton />
          </div>
        )}

        {renderTab()}

        {/* Every stage closes with the evidence supporting THAT stage */}
        {stageId && (
          <StageEvidenceSection
            key={stageId}
            stageLabel={STAGE_LABELS[stageId]}
            anchorId={EVIDENCE_ANCHOR[stageId]}
            docs={evidenceDocs}
            narrow={NARROW_STAGES.includes(stageId)}
            onPreview={(d) => openEvidenceDoc(d, "preview")}
            onInsights={(d) => openEvidenceDoc(d, "insights")}
            onDownload={() => {}}
          />
        )}
      </div>

      {/* Stage evidence opens the existing Document Workspace, with AI Insights
          framed by the stage it was opened from */}
      <DocumentWorkspaceModal
        docs={evidenceDoc ? [evidenceDoc] : null}
        initialView={evidenceView}
        insights={evidenceDoc && stageId ? stageDocInsights(stageId, evidenceDoc) : undefined}
        noteContext={stageId ? { contextType: "Stage Evidence", reference: STAGE_LABELS[stageId] } : undefined}
        onClose={() => setEvidenceDoc(null)}
        onDownload={() => {}}
      />

      {/* ── Generate Demand: centered popup with the generating / success sequence ── */}
      {genPhase !== "idle" && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-ink border border-white/10 shadow-2xl p-8 text-center">
            {genPhase === "running" ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-6 h-6 text-brand animate-spin" strokeWidth={1.75} />
                </div>
                <h2 className="page-title text-white">Generating Demand Letter</h2>
                <p className="text-soft text-sm mt-2">Reviewing the case record to draft an attorney-ready demand letter.</p>
                <div className="mt-8 space-y-2.5 text-left">
                  {GENERATE_STEPS.map((label, i) => {
                    const done = i < genStep;
                    const active = i === genStep;
                    return (
                      <div key={label} className={`flex items-center gap-2.5 text-sm transition-opacity duration-300 ${done || active ? "opacity-100" : "opacity-30"}`}>
                        {done ? (
                          <CheckCircle className="w-4 h-4 text-brand shrink-0" strokeWidth={1.75} />
                        ) : active ? (
                          <Loader2 className="w-4 h-4 text-brand shrink-0 animate-spin" strokeWidth={1.75} />
                        ) : (
                          <Circle className="w-4 h-4 text-white/30 shrink-0" strokeWidth={1.75} />
                        )}
                        <span className={done ? "text-soft" : "text-white"}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-7 h-7 text-brand" strokeWidth={1.75} />
                </div>
                <h2 className="page-title text-white">Demand Letter Generated</h2>
                <p className="text-soft text-sm mt-2">Opening the letter for your review...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Demand Letter editor — opens automatically once generation finishes ── */}
      {letterDraft && (
        <DemandPackageEditorPage
          pkg={letterDraft}
          model={model}
          letterOnly
          onClose={() => { setLetterDraft(null); setActiveTab("demandspace"); }}
          onSaveLetter={finalizeLetterDraft}
        />
      )}
    </div>
  );
}
