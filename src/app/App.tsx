import { useState, useEffect, useRef } from "react";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardTopbar } from "./components/DashboardTopbar";
import { GlobalCaseRepoPage } from "./pages/GlobalCaseRepoPage";
import { ClientsPage } from "./pages/ClientsPage";
import { CommunicationPage } from "./pages/CommunicationPage";
import { DemandLibraryPage } from "./pages/DemandLibraryPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { CaseIntakePage } from "./pages/CaseIntakePage";
import { IntakeWorkflowPage } from "./pages/IntakeWorkflowPage";
import { ClassificationPage } from "./pages/ClassificationPage";
import { AnalysisPage, type AnalysisDetail } from "./pages/AnalysisPage";
import { InsuranceSummaryPage } from "./pages/InsuranceSummaryPage";
import { InsuranceDetailPage } from "./pages/InsuranceDetailPage";
import { ValuationPage } from "./pages/ValuationPage";
import { CaseReadyPage } from "./pages/CaseReadyPage";
import { CaseWorkspacePage } from "./pages/CaseWorkspacePage";
import { DeliverablePage, type DeliverableKind } from "./pages/DeliverablePage";
import { JurisdictionReviewPage } from "./pages/JurisdictionReviewPage";
import { DefendantAnalysisPage } from "./pages/DefendantAnalysisPage";
import type { AttorneyDecision } from "./jurisdiction/jurisdictionData";
import { EMPTY_USER_CHRONOLOGY, type UserChronology } from "./workspace/WorkspaceTabs";
import { NotesProvider } from "./notes/NotesContext";
import { FloatingNotes } from "./components/FloatingNotes";
import { AssistantProvider } from "./assistant/AssistantContext";
import { ChronologyProvider } from "./chronology/ChronologyContext";
import { DamagesProvider } from "./damages/DamagesContext";
import { FactorsProvider } from "./damages/FactorsContext";
import { PillarsProvider } from "./workspace/PillarsContext";
import { ViolationsProvider } from "./workspace/ViolationsContext";
import { AssistantLauncher, AssistantPanel, AssistantMain } from "./assistant/AiAssistant";
import {
  PipelineState, CaseDocument, AttorneyNote,
  classifyDocuments, generateAnalysisFindings
} from "./types/case";

const INITIAL_PIPELINE: PipelineState = {
  retainerStatus: "not-sent",
  intakeCreated: false,
  intakeSent: false,
  intakeLink: "https://leco.ai/intake/ABX29...",
  documents: [],
  analysisDone: false,
  valuationDone: false,
  notes: [],
};

const EXISTING_CASE_DOCUMENTS: CaseDocument[] = [
  { id: "ec-1", name: "MRI_Report_2026.pdf", source: "Plaintiff", date: "Jun 1, 2026", status: "Processed" },
  { id: "ec-2", name: "ER_Bills.pdf", source: "Plaintiff", date: "Jun 1, 2026", status: "Processed" },
  { id: "ec-3", name: "hospital_medical_records.pdf", source: "Plaintiff", date: "Jun 1, 2026", status: "Processed" },
  { id: "ec-4", name: "police_report_final.pdf", source: "Plaintiff", date: "Jun 2, 2026", status: "Processed" },
  { id: "ec-5", name: "physical_therapy_notes.pdf", source: "Plaintiff", date: "Jun 3, 2026", status: "Processed" },
  { id: "ec-6", name: "insurance_policy_v2.pdf", source: "Attorney", date: "Jun 2, 2026", status: "Processed" },
  { id: "ec-7", name: "witness_statement.pdf", source: "Attorney", date: "Jun 3, 2026", status: "Processed" },
  { id: "ec-8", name: "wage_loss_statement.pdf", source: "Plaintiff", date: "Jun 4, 2026", status: "Processed" },
];

function buildPipelineForCase(caseData: any): PipelineState {
  const stage: string = caseData?.stage ?? "";
  const isNew = !stage || stage === "New" || stage === "Client Intake";

  if (isNew) return INITIAL_PIPELINE;

  // Any case that has progressed past the initial stage already has retainer + intake sent
  const hasDocs = ["Classification", "Analysis", "Valuation", "Ready For Review"].includes(stage);
  const analysisDone = ["Valuation", "Ready For Review"].includes(stage);
  const valuationDone = stage === "Ready For Review";

  return {
    retainerStatus: "signed",
    intakeCreated: true,
    intakeSent: true,
    intakeLink: "https://leco.ai/intake/ABX29...",
    documents: hasDocs ? EXISTING_CASE_DOCUMENTS : [],
    analysisDone,
    valuationDone,
    notes: [],
  };
}

export default function App() {
  const [activePage, setActivePage] = useState("intake");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Section of the stage page to land on when returning from a sub-page.
  const [returnToSection, setReturnToSection] = useState<string | undefined>(undefined);
  // The insurance pages are shared by Analysis and Case Ready; this is the
  // stage they were opened from, and the one they return to.
  // (The Case Workspace shows the same pages as its own Insurance stage.)
  const [insuranceOrigin, setInsuranceOrigin] = useState<"analysis" | "case-ready">("analysis");
  // The Case Ready deliverable open on its own page, and the workspace stage to
  // land on when a deliverable links into one it does not show.
  const [deliverable, setDeliverable] = useState<DeliverableKind>("chronology");
  // Which stage a deliverable was opened from, and which findings set an
  // Analysis findings page shows.
  const [deliverableOrigin, setDeliverableOrigin] = useState<"analysis" | "case-ready">("case-ready");
  const [analysisDetail, setAnalysisDetail] = useState<AnalysisDetail>("liability");
  const [workspaceTab, setWorkspaceTab] = useState<string | undefined>(undefined);
  // Chronology entries the attorney added by hand — held here so the Case
  // Workspace's Chronology and the Medical Chronology deliverable share them.
  const [userChronology, setUserChronology] = useState<UserChronology>(EMPTY_USER_CHRONOLOGY);
  // The attorney's jurisdiction decision per case, kept while the app is open
  // so leaving the review and coming back keeps the decision and its history.
  const [jurisdictionDecisions, setJurisdictionDecisions] = useState<Record<string, AttorneyDecision>>({});
  const caseKey = selectedCase?.caseId ?? "";
  // The Defendant Analysis is shared by Analysis and Case Ready; this is the
  // stage it was opened from, the one it returns to, and the defendant to select.
  const [defendantOrigin, setDefendantOrigin] = useState<"analysis" | "case-ready">("analysis");
  const [defendantFocus, setDefendantFocus] = useState<string | undefined>(undefined);
  const openDefendantsFrom = (origin: "analysis" | "case-ready", focus?: string) => {
    setDefendantOrigin(origin);
    setDefendantFocus(focus);
    setActivePage("defendants");
  };
  const backToDefendantOrigin = () => {
    setReturnToSection(defendantOrigin === "case-ready" ? "defendant-deliverable" : "case-intelligence");
    setActivePage(defendantOrigin);
  };
  const jurisdictionDecision = jurisdictionDecisions[caseKey];
  const openDeliverable = (kind: DeliverableKind, origin: "analysis" | "case-ready" = "case-ready") => {
    setDeliverable(kind);
    setDeliverableOrigin(origin);
    setActivePage("deliverable");
    document.querySelector("main")?.scrollTo(0, 0);
  };
  const backToCaseReady = () => {
    setReturnToSection("generated-deliverables");
    setActivePage("case-ready");
  };
  const openAnalysisDetail = (d: AnalysisDetail) => {
    setAnalysisDetail(d);
    setActivePage("analysis-detail");
  };
  const backToAnalysis = () => {
    setReturnToSection("analysis-deliverables");
    setActivePage("analysis");
  };
  // Browser Back from an Analysis sub-page returns to Analysis: entering one
  // adds a history entry; leaving it in the app takes that entry back off.
  const onAnalysisSubpage = activePage === "analysis-detail" || (activePage === "deliverable" && deliverableOrigin === "analysis");
  const subpageEntry = useRef(false);
  const backToAnalysisRef = useRef(backToAnalysis);
  backToAnalysisRef.current = backToAnalysis;
  useEffect(() => {
    if (onAnalysisSubpage && !subpageEntry.current) {
      window.history.pushState({ lecoSubpage: true }, "");
      subpageEntry.current = true;
    } else if (!onAnalysisSubpage && subpageEntry.current) {
      subpageEntry.current = false;
      if (window.history.state?.lecoSubpage) window.history.back();
    }
  }, [onAnalysisSubpage]);
  useEffect(() => {
    const onPop = () => {
      if (!subpageEntry.current) return;
      subpageEntry.current = false;
      backToAnalysisRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openWorkspace = (tab?: string) => {
    setWorkspaceTab(tab);
    setActivePage("workspace");
    setSidebarCollapsed(true);
  };
  const openInsurancePage = (page: "insurance" | "insurance-detail") => setActivePage(page);
  const openInsuranceFrom = (origin: "analysis" | "case-ready") => {
    setInsuranceOrigin(origin);
    setActivePage("insurance");
  };
  const backToInsuranceOrigin = () => {
    setReturnToSection(insuranceOrigin === "case-ready" ? "insurance-deliverable" : "analysis-deliverables");
    setActivePage(insuranceOrigin);
  };
  const INSURANCE_BACK_LABEL = {
    analysis: "Back to Analysis",
    "case-ready": "Back to Case Ready",
  } as const;
  // A return target applies to that one return only.
  useEffect(() => {
    if (activePage !== "analysis" && activePage !== "case-ready") setReturnToSection(undefined);
    // The insurance pages are full pages, so each opens at the top of the
    // scrolling main area rather than wherever the previous page was left.
    if (activePage === "insurance" || activePage === "insurance-detail" || activePage === "deliverable" || activePage === "jurisdiction" || activePage === "defendants" || activePage === "analysis-detail") {
      document.querySelector("main")?.scrollTo(0, 0);
    }
  }, [activePage]);

  const updatePipeline = (updates: Partial<PipelineState>) => {
    setPipeline((prev) => ({ ...prev, ...updates }));
  };

  // Derived state used across stages
  const categories = classifyDocuments(pipeline.documents);
  const analysisFindings = generateAnalysisFindings(categories);

  const handleOpenWorkflow = (caseData: any) => {
    setSelectedCase(caseData);
    setUserChronology(EMPTY_USER_CHRONOLOGY);
    setPipeline(buildPipelineForCase(caseData));
    setActivePage("workflow");
    setSidebarCollapsed(true);
  };

  // Opening the Case Workspace (from the Global Cases page) always lands on a
  // fully-processed, review-ready case so every tab has populated content.
  const handleOpenWorkspace = (caseData: any) => {
    setSelectedCase(caseData);
    setUserChronology(EMPTY_USER_CHRONOLOGY);
    setPipeline(buildPipelineForCase({ stage: "Ready For Review" }));
    openWorkspace();
  };

  // Navigating via the sidebar always returns to a top-level page, so expand it.
  const handleNavigate = (page: string) => {
    setActivePage(page);
    setSidebarCollapsed(false);
  };

  const handleStageNavigation = (stageName: string) => {
    const map: Record<string, string> = {
      "Client Intake": "workflow",
      Analysis: "analysis",
      Valuation: "valuation",
      "Case Ready": "case-ready",
    };
    if (map[stageName]) setActivePage(map[stageName]);
  };

  const renderPage = () => {
    switch (activePage) {
      case "workflow":
        return (
          <IntakeWorkflowPage
            caseData={selectedCase}
            pipeline={pipeline}
            onPipelineUpdate={updatePipeline}
            onDocumentsUpdate={(fn) => setPipeline((prev) => ({ ...prev, documents: fn(prev.documents) }))}
            onContinue={() => setActivePage("analysis")}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
          />
        );
      case "classification":
        return (
          <ClassificationPage
            caseData={selectedCase}
            documents={pipeline.documents}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
            onProceedToAnalysis={() => setActivePage("analysis")}
          />
        );
      case "analysis":
        return (
          <AnalysisPage
            caseData={selectedCase}
            documents={pipeline.documents}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
            onProceedToValuation={() => {
              updatePipeline({ analysisDone: true });
              setActivePage("valuation");
            }}
            onOpenInsurance={() => openInsuranceFrom("analysis")}
            onOpenJurisdiction={() => setActivePage("jurisdiction")}
            onOpenDefendants={(name) => openDefendantsFrom("analysis", name)}
            governingLaw={jurisdictionDecision?.status === "approved" ? jurisdictionDecision.governingLaw : undefined}
            scrollToSection={returnToSection}
            onOpenDetail={openAnalysisDetail}
            onDocumentsUpdate={(fn) => setPipeline((prev) => ({ ...prev, documents: fn(prev.documents) }))}
            onOpenChronology={() => openDeliverable("chronology", "analysis")}
          />
        );
      case "analysis-detail":
        return (
          <AnalysisPage
            caseData={selectedCase}
            documents={pipeline.documents}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
            onProceedToValuation={() => {
              updatePipeline({ analysisDone: true });
              setActivePage("valuation");
            }}
            onOpenInsurance={() => openInsuranceFrom("analysis")}
            onOpenJurisdiction={() => setActivePage("jurisdiction")}
            onOpenDefendants={(name) => openDefendantsFrom("analysis", name)}
            governingLaw={jurisdictionDecision?.status === "approved" ? jurisdictionDecision.governingLaw : undefined}
            detail={analysisDetail}
            onBackToAnalysis={backToAnalysis}
            onOpenDetail={openAnalysisDetail}
            onDocumentsUpdate={(fn) => setPipeline((prev) => ({ ...prev, documents: fn(prev.documents) }))}
            onOpenChronology={() => openDeliverable("chronology", "analysis")}
          />
        );
      case "jurisdiction":
        return (
          <JurisdictionReviewPage
            key={caseKey}
            caseData={selectedCase}
            decision={jurisdictionDecision}
            onDecisionChange={(next) => setJurisdictionDecisions((prev) => ({ ...prev, [caseKey]: next }))}
            onBack={() => setActivePage("analysis")}
            onStageClick={handleStageNavigation}
          />
        );
      case "defendants":
        return (
          <DefendantAnalysisPage
            caseData={selectedCase}
            caseRef={selectedCase?.caseId ?? "PI-2024-001"}
            jurisdictionDecision={jurisdictionDecision}
            focusName={defendantFocus}
            stage={defendantOrigin === "case-ready" ? "Case Ready" : "Analysis"}
            backLabel={defendantOrigin === "case-ready" ? "Back to Case Ready" : "Back to Analysis"}
            onBack={backToDefendantOrigin}
            onStageClick={handleStageNavigation}
          />
        );
      case "insurance":
        return (
          <InsuranceSummaryPage
            caseName={selectedCase?.caseName ?? "Case"}
            caseData={selectedCase}
            documents={pipeline.documents}
            backLabel={INSURANCE_BACK_LABEL[insuranceOrigin]}
            onBack={backToInsuranceOrigin}
            onOpenDetail={() => openInsurancePage("insurance-detail")}
          />
        );
      case "insurance-detail":
        return (
          <InsuranceDetailPage
            caseName={selectedCase?.caseName ?? "Case"}
            onBack={() => openInsurancePage("insurance")}
            onBackToAnalysis={backToInsuranceOrigin}
          />
        );
      case "valuation":
        return (
          <ValuationPage
            caseData={selectedCase}
            documents={pipeline.documents}
            analysisFindings={analysisFindings}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
            onReturnToAnalysis={() => setActivePage("analysis")}
            onProceedToCaseReady={() => {
              updatePipeline({ valuationDone: true });
              setActivePage("case-ready");
            }}
          />
        );
      case "case-ready":
        return (
          <CaseReadyPage
            caseData={selectedCase}
            pipeline={pipeline}
            onPipelineUpdate={updatePipeline}
            onStageClick={handleStageNavigation}
            onBackToIntake={() => setActivePage("intake")}
            onOpenWorkspace={() => openWorkspace()}
            onOpenInsurance={() => openInsuranceFrom("case-ready")}
            onOpenDeliverable={openDeliverable}
            onOpenDefendants={() => openDefendantsFrom("case-ready")}
            scrollToSection={returnToSection}
          />
        );
      case "deliverable":
        return (
          <DeliverablePage
            key={deliverable}
            kind={deliverable}
            caseData={selectedCase}
            analysisFindings={analysisFindings}
            documents={pipeline.documents}
            userChronology={userChronology}
            onUserChronologyChange={setUserChronology}
            onBack={deliverableOrigin === "analysis" ? backToAnalysis : backToCaseReady}
            origin={deliverableOrigin}
            onStageClick={handleStageNavigation}
            onOpenDeliverable={(k) => openDeliverable(k, deliverableOrigin)}
            onOpenWorkspaceTab={(tab) => openWorkspace(tab)}
            onOpenValuation={() => setActivePage("valuation")}
            onOpenInsurance={() => openInsuranceFrom("case-ready")}
          />
        );
      case "workspace":
        return (
          <CaseWorkspacePage
            key={workspaceTab ?? "overview"}
            initialTab={workspaceTab}
            userChronology={userChronology}
            onUserChronologyChange={setUserChronology}
            caseData={selectedCase}
            analysisFindings={analysisFindings}
            documents={pipeline.documents}
            onBackToIntake={() => setActivePage("intake")}
            onNavigateToValuation={() => setActivePage("valuation")}
          />
        );
      case "intake":
        return <CaseIntakePage onOpenWorkflow={handleOpenWorkflow} />;
      case "cases":
        return <GlobalCaseRepoPage onOpenWorkspace={handleOpenWorkspace} />;
      case "clients":
        return <ClientsPage />;
      case "communication":
        return <CommunicationPage />;
      case "demands":
        return <DemandLibraryPage />;
      case "templates":
        return <TemplatesPage />;
      default:
        return <CaseIntakePage onOpenWorkflow={handleOpenWorkflow} />;
    }
  };

  // Map the active page to the intake-pipeline stage the Notes button reports.
  const STAGE_BY_PAGE: Record<string, string> = {
    workflow: "Collection",
    classification: "Collection",
    analysis: "Analysis",
    jurisdiction: "Analysis",
    defendants: defendantOrigin === "analysis" ? "Analysis" : "Case Ready",
    insurance: insuranceOrigin === "analysis" ? "Analysis" : "Case Ready",
    "insurance-detail": insuranceOrigin === "analysis" ? "Analysis" : "Case Ready",
    valuation: "Valuation",
    "case-ready": "Case Ready",
    deliverable: "Case Ready",
    workspace: "Case Ready",
  };
  const currentStage = STAGE_BY_PAGE[activePage] ?? "";
  const currentCaseName = selectedCase?.caseName ?? "";
  // Human label for wherever the attorney currently is, for the assistant.
  const PAGE_LABEL: Record<string, string> = {
    intake: "Case Intake", workflow: "Case Intake", classification: "Classification",
    analysis: "Analysis", jurisdiction: "Attorney Jurisdiction Review", defendants: "Defendant Analysis", valuation: "Valuation", "case-ready": "Case Ready", deliverable: "Case Ready",
    workspace: "Case Workspace", cases: "Case Workspace", clients: "Clients",
    communication: "Communication", demands: "Demand Letters", templates: "Templates",
  };

  return (
    <ChronologyProvider>
    <DamagesProvider>
    <FactorsProvider>
    <PillarsProvider>
    <ViolationsProvider>
    <NotesProvider caseName={currentCaseName} stage={currentStage}>
      <AssistantProvider
        page={activePage}
        pageLabel={PAGE_LABEL[activePage] ?? "Dashboard"}
        caseName={currentCaseName}
        pipelineStage={currentStage}
        documents={pipeline.documents}
        findings={analysisFindings}
      >
      <div className="h-screen bg-gray-50 flex overflow-hidden">
        <DashboardSidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardTopbar assistant={<AssistantLauncher />} />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <AssistantMain>{renderPage()}</AssistantMain>
            <AssistantPanel />
          </div>
        </div>
      </div>
      <FloatingNotes />
      </AssistantProvider>
    </NotesProvider>
    </ViolationsProvider>
    </PillarsProvider>
    </FactorsProvider>
    </DamagesProvider>
    </ChronologyProvider>
  );
}
