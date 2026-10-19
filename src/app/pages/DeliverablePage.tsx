import { useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, FileText, Brain, BarChart2 } from "lucide-react";
import { StageNavigator } from "../components/StageNavigator";
import type { AnalysisFinding, CaseDocument } from "../types/case";
import {
  OverviewTab, MedicalTimelineTab, EconomicDamagesTab,
  stageEvidence, stageDocInsights, STAGE_LABELS, EMPTY_USER_CHRONOLOGY,
  type StageId, type UserChronology,
} from "../workspace/WorkspaceTabs";
import { EvidenceStageTab } from "../workspace/EvidenceStage";
import { StageEvidenceSection } from "../workspace/StageEvidence";
import { useWorkspaceModel } from "../workspace/useWorkspaceModel";
import { useChronologyOptional } from "../chronology/ChronologyContext";
import { DocumentWorkspaceModal } from "../components/DocumentWorkspace";

// ── Case Ready → Generated Deliverables ──────────────────────────────────────
// Each deliverable is a dedicated page onto the stage that already produces it,
// reading the same case model, findings, documents and chronology. Nothing here
// holds its own copy of the case: the Medical Chronology IS the Chronology
// stage, the Case Summary IS the Case Overview, and so on — so a change made in
// the stage shows in the deliverable.

export type DeliverableKind = "chronology" | "evidence" | "summary" | "valuation";

export const DELIVERABLES: {
  kind: DeliverableKind;
  title: string;
  category: string;
  description: string;
  date: string;
  icon: any;
  /** The Case Workspace stage the deliverable is drawn from. */
  stage: StageId | null;
}[] = [
  {
    kind: "chronology",
    title: "Medical Chronology",
    category: "Medical",
    description: "Complete treatment timeline from incident through present.",
    date: "Jun 9, 2026",
    icon: ClipboardList,
    stage: "medical",
  },
  {
    kind: "evidence",
    title: "Evidence Structure",
    category: "Liability",
    description: "Organized exhibit map across all verified documents.",
    date: "Jun 9, 2026",
    icon: FileText,
    stage: null,
  },
  {
    kind: "summary",
    title: "Case Summary",
    category: "Overview",
    description: "Attorney-ready narrative summarizing liability and injury findings.",
    date: "Jun 9, 2026",
    icon: Brain,
    stage: "overview",
  },
  {
    kind: "valuation",
    title: "Valuation Analysis",
    category: "Damages",
    description: "Full damage computation with multiplier scenarios.",
    date: "Jun 9, 2026",
    icon: BarChart2,
    stage: "economic",
  },
];

// A workspace stage a deliverable links to → the deliverable showing it, when
// there is one. Any other stage opens in the Case Workspace.
const DELIVERABLE_FOR_TAB: Record<string, DeliverableKind> = {
  medical: "chronology",
  overview: "summary",
  economic: "valuation",
  evidencehub: "evidence",
};

interface DeliverablePageProps {
  kind: DeliverableKind;
  caseData?: any;
  analysisFindings?: AnalysisFinding[];
  documents?: CaseDocument[];
  userChronology?: UserChronology;
  onUserChronologyChange?: (next: UserChronology) => void;
  onBack: () => void;
  onStageClick?: (stageName: string) => void;
  onOpenDeliverable: (kind: DeliverableKind) => void;
  /** Opens the Case Workspace on a stage no deliverable shows. */
  onOpenWorkspaceTab: (tab: string) => void;
  onOpenValuation?: () => void;
  onOpenInsurance?: () => void;
  /** The stage it was opened from — where Back returns. */
  origin?: "analysis" | "case-ready";
}

export function DeliverablePage({
  kind, caseData, analysisFindings = [], documents = [],
  userChronology = EMPTY_USER_CHRONOLOGY, onUserChronologyChange,
  onBack, onStageClick, onOpenDeliverable, onOpenWorkspaceTab, onOpenValuation, onOpenInsurance, origin = "case-ready",
}: DeliverablePageProps) {
  const fromStage = origin === "analysis" ? "Analysis" : "Case Ready";
  const meta = DELIVERABLES.find((d) => d.kind === kind)!;
  const model = useWorkspaceModel(caseData);

  const goTo = (tab: string) => {
    const target = DELIVERABLE_FOR_TAB[tab];
    if (target) onOpenDeliverable(target);
    else onOpenWorkspaceTab(tab);
  };
  const tabProps = {
    model, findings: analysisFindings, documents, goTo,
    goToValuation: onOpenValuation, onOpenInsurance,
  };

  // The stage's own supporting evidence, exactly as the stage closes with it.
  const chronoStore = useChronologyOptional();
  const chronoEvents = [
    ...userChronology.medical,
    ...userChronology.event,
    ...(chronoStore?.additions ?? []).map((a) => ({ evidence: a.evidence } as any)),
  ];
  const stageId = meta.stage;
  const evidenceDocs = stageId
    ? stageEvidence(stageId, documents, { findings: analysisFindings, userChronology: chronoEvents })
    : [];
  const [evidenceDoc, setEvidenceDoc] = useState<CaseDocument | null>(null);
  const [evidenceView, setEvidenceView] = useState<"preview" | "insights">("preview");
  const openEvidenceDoc = (doc: CaseDocument, view: "preview" | "insights") => {
    setEvidenceDoc(doc);
    setEvidenceView(view);
  };

  const renderContent = () => {
    switch (kind) {
      case "chronology":
        return (
          <MedicalTimelineTab
            {...tabProps}
            hideEventChronology
            userChronology={userChronology}
            onAddChronology={(k, ev) =>
              onUserChronologyChange?.({ ...userChronology, [k]: [...userChronology[k], ev] })
            }
          />
        );
      case "evidence":
        return (
          <EvidenceStageTab
            documents={documents}
            findings={analysisFindings}
            userChronology={userChronology}
            goTo={goTo}
          />
        );
      case "summary":
        return <OverviewTab {...tabProps} />;
      case "valuation":
        return <EconomicDamagesTab {...tabProps} />;
    }
  };

  return (
    <div className="min-h-screen bg-wash">
      {/* Breadcrumb — the Case Ready pattern, one level deeper */}
      <div className="bg-white sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 secondary-text hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to {fromStage}
            </button>
            <div className="secondary-text ml-auto flex items-center gap-2 min-w-0">
              <span className="truncate">{model.caseName}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
              <span className="shrink-0">{fromStage}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
              <span className="text-ink font-medium shrink-0">{meta.title}</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage={fromStage} onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Deliverable header — the same chip, title and description as its card */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-tint text-deep mb-3">
            <meta.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {meta.category}
          </div>
          <h1 className="page-title" style={{ fontSize: "24px" }}>{meta.title}</h1>
          <p className="secondary-text mt-1">{meta.description}</p>
        </div>

        {renderContent()}

        {stageId && (
          <StageEvidenceSection
            key={stageId}
            stageLabel={STAGE_LABELS[stageId]}
            anchorId={`${kind}-deliverable-evidence`}
            docs={evidenceDocs}
            onPreview={(d) => openEvidenceDoc(d, "preview")}
            onInsights={(d) => openEvidenceDoc(d, "insights")}
            onDownload={() => {}}
          />
        )}
      </div>

      <DocumentWorkspaceModal
        docs={evidenceDoc ? [evidenceDoc] : null}
        initialView={evidenceView}
        insights={evidenceDoc && stageId ? stageDocInsights(stageId, evidenceDoc) : undefined}
        noteContext={stageId ? { contextType: "Stage Evidence", reference: STAGE_LABELS[stageId] } : undefined}
        onClose={() => setEvidenceDoc(null)}
        onDownload={() => {}}
      />
    </div>
  );
}
