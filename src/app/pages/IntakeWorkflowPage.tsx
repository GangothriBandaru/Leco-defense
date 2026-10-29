import React, { useState, useRef, useEffect, useMemo } from "react";
import { FileTypeIcon, FileTypeTag, fileKind } from "../components/fileType";
import { StageNavigator } from "../components/StageNavigator";
import { CaseSnapshot } from "../components/CaseSnapshot";
import { EditCaseDetailsDialog } from "../components/EditCaseDetailsDialog";
import { useCaseDetails, saveCaseDetails, type CaseDetails } from "../intake/caseDetailsStore";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { Send, Upload, CheckCircle, Circle, ArrowRight, Check, X, FileText, Copy, Download, Eye, Search, ChevronLeft, ChevronDown, Mail, MessageSquare, AlertCircle, AlertTriangle, ListChecks, Bot, Pencil, RefreshCw, Plus, Clock, Info, Trash2, RotateCcw, ClipboardCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { DocActions, DocumentWorkspaceModal, RowActionGroup } from "../components/DocumentWorkspace";
import { EditDocumentDialog, DeleteDocumentDialog } from "../components/DocumentDialogs";
import { PipelineState, CaseDocument, classifyDocuments, detectMissingEvidence, DOCUMENT_CATEGORIES } from "../types/case";
import { putMediaFile, getMediaFile, downloadMediaFile, deleteMediaFile } from "../intake/mediaFileStore";
import {
  checkDocument, NeedsAttorney, DOC_STATUS_PILL, inFilter, mediaDocStatus, processingFinished, isUnseen, now as nowLabel,
  type DocFilter,
} from "../intake/docProcessing";
import {
  useIntakeRequests, createIntakeRequest, updateIntakeRequest, adoptExistingIntakeRequest, removeIntakeRequestFromDashboard, formatShortDate,
  type IntakeRequest, type UploadedDocument,
} from "../intake/intakeRequestStore";
import { RequestLinkRow } from "../intake/RequestLinkRow";
import { Camera, Loader2 } from "lucide-react";
import { VideoPhotoUploadModal, type MediaUploadResult } from "../intake/VideoPhotoUploadModal";
import { MediaEvidencePanel } from "../intake/MediaEvidencePanel";
import { useMediaEvidence, fileStatus as mediaFileStatus } from "../intake/mediaEvidenceStore";
import { MEDIA_OPTIONS, NO_MEDIA, intakeMessageText, selectedMediaOptions, type RequestedMedia } from "../intake/intakeMessage";
import { Video as VideoIcon, ScanLine } from "lucide-react";

// The documents an additional request asks for (unchanged from before).
const ADDITIONAL_DOCS = ["Wage Loss Records", "Employment Records", "Pharmacy Records"];
const MEDIA_ICON = { videos: VideoIcon, scenePhotos: Camera, medicalImages: ScanLine } as const;

function NewBadge() {
  return <span className="pill pill-neutral shrink-0 text-[10px] font-bold tracking-[0.06em]">NEW</span>;
}

// Who intake requests are sent from — the signed-in attorney, as the existing
// request message templates sign them.
const INTAKE_SENDER = { name: "Jennifer Davis", firm: "LexGuard Injury Intel" };

interface IntakeWorkflowPageProps {
  caseData?: {
    caseName: string;
    caseId: string;
    caseType?: string;
    plaintiff: string;
    summary: string;
    plaintiffEmail?: string;
    plaintiffPhone?: string;
    jurisdiction?: string;
    dateOfIncident?: string;
  };
  pipeline: PipelineState;
  onPipelineUpdate: (updates: Partial<PipelineState>) => void;
  /** Updates the case's documents from their latest value. */
  onDocumentsUpdate?: (fn: (docs: CaseDocument[]) => CaseDocument[]) => void;
  onContinue?: () => void;
  onStageClick?: (stageName: string) => void;
  onBackToIntake?: () => void;
  /** Non-zero when the Document Tracker asks for the Documents section. */
  focusDocumentsRequest?: number;
  onFocusDocumentsHandled?: () => void;
}

const documentCategories = [
  { name: "Medical Records", required: true, enabled: true },
  { name: "Police Report", required: true, enabled: true },
  { name: "Insurance Documents", required: true, enabled: true },
  { name: "Wage Loss Records", required: true, enabled: true },
  { name: "Property Damage Photos", required: false, enabled: false },
  { name: "Employment Records", required: false, enabled: false },
];

const allRetainerDocuments = [
  { name: "PI_Retainer_Agreement.pdf", date: "Jun 8, 2026", status: "Sent", source: "Attorney" },
  { name: "Signed_PI_Retainer_Agreement.pdf", date: "Jun 10, 2026", status: "Signed", source: "Plaintiff" },
];

const intakeDocuments = [
  { name: "prakash_medical_records.pdf", source: "Plaintiff", status: "Processed" },
  { name: "MRI_Report_2026.pdf", source: "Plaintiff", status: "Processed" },
  { name: "hospital_invoice.pdf", source: "Plaintiff", status: "Processed" },
  { name: "ER_Bills.pdf", source: "Plaintiff", status: "Processed" },
  { name: "physical_therapy_notes.pdf", source: "Plaintiff", status: "Processed" },
  { name: "medication_list.pdf", source: "Plaintiff", status: "Processing" },
  { name: "police_report_final.pdf", source: "Plaintiff", status: "Processed" },
  { name: "accident_scene_photo_1.jpg", source: "Plaintiff", status: "Processed" },
  { name: "accident_scene_photo_2.jpg", source: "Plaintiff", status: "Processed" },
  { name: "insurance_policy_v2.pdf", source: "Attorney", status: "Processing" },
  { name: "Insurance_Claim_Form.pdf", source: "Attorney", status: "Processed" },
  { name: "employment_verification.pdf", source: "Plaintiff", status: "Processed" },
  { name: "wage_loss_statement.pdf", source: "Plaintiff", status: "Processed" },
  { name: "witness_statement.pdf", source: "Attorney", status: "Processed" },
];

const documentProgress = [
  { name: "Medical Records", complete: true },
  { name: "Insurance Documents", complete: true },
  { name: "Police Report", complete: false },
  { name: "Wage Loss Records", complete: false },
];

const activityLog = [
  { date: "Jun 8", event: "Intake Request Sent" },
  { date: "Jun 20", event: "Follow-up Request Sent" },
];

const retainerTemplates = [
  {
    id: "standard-pi",
    name: "Standard Personal Injury Retainer",
    lastUpdated: "May 15, 2026",
    createdBy: "Legal Team",
  },
  {
    id: "medical-malpractice",
    name: "Medical Malpractice Retainer",
    lastUpdated: "Apr 22, 2026",
    createdBy: "Jennifer Davis",
  },
  {
    id: "wrongful-death",
    name: "Wrongful Death Retainer",
    lastUpdated: "Mar 10, 2026",
    createdBy: "Legal Team",
  },
  {
    id: "truck-accident",
    name: "Truck Accident Retainer",
    lastUpdated: "Feb 5, 2026",
    createdBy: "Michael Chen",
  },
  {
    id: "custom",
    name: "Custom Retainer Agreement",
    lastUpdated: "Jan 12, 2026",
    createdBy: "Legal Team",
  },
];

// Bottom-of-tab navigation: a short "what's next" line + a primary CTA that
// advances to the next tab (or the next stage on the final tab).
function NextStepBox({ text, ctaLabel, onClick }: { text: string; ctaLabel: string; onClick?: () => void }) {
  return (
    <div className="lg-card flex items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0">
        <div className="eyebrow mb-1">Next</div>
        <p className="body-text">{text}</p>
      </div>
      <button
        onClick={onClick}
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold transition-all"
      >
        {ctaLabel} <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function IntakeWorkflowPage({ caseData, pipeline, onPipelineUpdate, onDocumentsUpdate, onContinue, onStageClick, onBackToIntake, focusDocumentsRequest, onFocusDocumentsHandled }: IntakeWorkflowPageProps) {
  // Default case data if none provided
  const defaultCaseData = {
    caseName: "Estate of Miller vs Logistics Co.",
    caseId: "PI-2024-001",
    caseType: "Medical Malpractice",
    caseSubType: "Delayed Treatment",
    plaintiff: "Evelyn Miller",
    summary: "Delayed stroke response and negligent medication management at a memory care facility resulting in severe neurological injury.",
    plaintiffEmail: "evelyn.miller@gmail.com",
    plaintiffPhone: "(555) 123-4567",
    jurisdiction: "Cook County, IL",
    dateOfIncident: "Feb 14, 2026",
  };

  const data = { ...defaultCaseData, ...caseData };

  // The case card: the attorney's saved edits first, then what the case's own
  // insurance document establishes. Nothing else is filled in.
  const savedDetails = useCaseDetails(data.caseId);
  const policy = useMemo(() => resolveCasePolicy(data, pipeline.documents), [data.caseType, pipeline.documents]);
  const cardDetails: CaseDetails = {
    caseName: savedDetails?.caseName ?? data.caseName,
    caseType: savedDetails?.caseType ?? data.caseType,
    insuredName: savedDetails?.insuredName ?? policy.namedInsured,
    insuredEmail: savedDetails?.insuredEmail,
    insuredPhone: savedDetails?.insuredPhone,
    policyName: savedDetails?.policyName ?? policy.policyType,
    policyNumber: savedDetails?.policyNumber ?? policy.policyNo,
    insurerName: savedDetails?.insurerName ?? policy.insurer,
    insurerJurisdiction: savedDetails?.insurerJurisdiction,
  };
  const [editingDetails, setEditingDetails] = useState(false);

  // Default expansion reflects the active blocker: open the Retainer while it is
  // unsigned, otherwise focus the Documents once the case has files. Intake stays
  // collapsed to a single-row summary by default.
  const [accordionOpen, setAccordionOpen] = useState({
    retainer: pipeline.retainerStatus !== "signed",
    request: false,
    documents: pipeline.retainerStatus === "signed" && pipeline.documents.length > 0,
  });
  const toggleAccordion = (key: "retainer" | "request" | "documents") =>
    setAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const [documents, setDocuments] = useState(documentCategories);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [recipientEmail, setRecipientEmail] = useState(data.plaintiffEmail || "");
  const [secureLink] = useState(pipeline.intakeLink);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms">(
    data.plaintiffEmail ? "email" : "sms"
  );
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editableEmail, setEditableEmail] = useState(data.plaintiffEmail || "");
  const [editablePhone, setEditablePhone] = useState(data.plaintiffPhone || "(555) 123-4567");

  const clientPhone = editablePhone;
  const hasEmail = !!data.plaintiffEmail;
  const hasPhone = !!clientPhone;
  const hasContact = hasEmail || hasPhone;

  // Intake requests sent for this case — stored, so they are still here after
  // leaving the case, and each carries its own client link and uploads.
  // Requests removed from the dashboard are kept in the store but not shown.
  const allStoredRequests = useIntakeRequests(data.caseId);
  const storedRequests = useMemo(() => allStoredRequests.filter((r) => !r.removedAt), [allStoredRequests]);
  const [removingReqId, setRemovingReqId] = useState<string | null>(null);

  // Pipeline-derived state (shared)
  const intakeCreated = pipeline.intakeCreated || storedRequests.length > 0;
  const intakeSent = pipeline.intakeSent || storedRequests.length > 0;
  const retainerStatus = pipeline.retainerStatus;

  const setIntakeCreated = (v: boolean) => onPipelineUpdate({ intakeCreated: v });
  const setIntakeSent = (v: boolean) => onPipelineUpdate({ intakeSent: v });
  const setRetainerStatus = (v: "not-sent" | "sent" | "signed") => onPipelineUpdate({ retainerStatus: v });

  // Local retainer UI state
  const [retainerEmail, setRetainerEmail] = useState(data.plaintiffEmail || "");
  const [retainerPhone, setRetainerPhone] = useState("");
  const [retainerSentDate, setRetainerSentDate] = useState("Jun 8, 2026");
  const [retainerSignedDate, setRetainerSignedDate] = useState("");
  const [retainerLink] = useState("https://leco.ai/retainer/RET29...");
  const [showMarkSignedModal, setShowMarkSignedModal] = useState(false);
  const [showSendRetainerModal, setShowSendRetainerModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [agreementUploaded, setAgreementUploaded] = useState(false);
  const [showUploadAgreementModal, setShowUploadAgreementModal] = useState(false);
  const [showGenerateNewRetainerModal, setShowGenerateNewRetainerModal] = useState(false);
  // How the retainer came to be signed, and the signed file when the attorney
  // uploaded one. A file alone never marks it signed — the attorney confirms.
  const [retainerSource, setRetainerSource] = useState<"client" | "attorney">("client");
  const [retainerFile, setRetainerFile] = useState<{ name: string; storageKey: string; size: number } | null>(null);
  const [retainerPickedFile, setRetainerPickedFile] = useState<File | null>(null);
  const [retainerConfirmed, setRetainerConfirmed] = useState(false);
  const [retainerUploadError, setRetainerUploadError] = useState<string | null>(null);
  const today = () => formatShortDate(new Date().toISOString());
  const [demoRetainerState, setDemoRetainerState] = useState<"sent" | "signed">(pipeline.retainerStatus === "signed" ? "signed" : "sent");
  // Retainer versioning — each generated retainer is its own version, newest first.
  type RetainerVersion = { id: number; status: "Awaiting Signature" | "Signed"; recipient: string; template: string; sentDate: string; signedDate?: string; signedDocName?: string; sentDocName?: string };
  const [retainerVersions, setRetainerVersions] = useState<RetainerVersion[]>([]);
  // Status filter for the multi-retainer view (header control). Single retainer keeps the demo toggle.
  const [retainerFilter, setRetainerFilter] = useState<"all" | "Awaiting Signature" | "Signed">("all");
  const [retainerModalMode, setRetainerModalMode] = useState<"initial" | "new-version">("initial");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [retainerMessage, setRetainerMessage] = useState("");
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  // Which view the Document Workspace opens into: "preview" (80/20 doc + action rail)
  // or "insights" (60/40 doc + AI panel).
  const [workspaceView, setWorkspaceView] = useState<"preview" | "insights">("preview");
  const [editingDocName, setEditingDocName] = useState(false);
  const [editDocNameValue, setEditDocNameValue] = useState("");

  // Intake request multi-request state
  type IntakeStatus = "Draft" | "Sent" | "Opened" | "In Progress" | "Partially Completed" | "Completed" | "Expired" | "Cancelled";
  interface IntakeRequestRecord {
    id: string;
    status: IntakeStatus;
    version: number;
    recipient: string;
    deliveryMethod: "email" | "sms";
    requestedDocs: string[];
    created: string;
    lastSent: string;
    lastModified?: string;
    docsReceived?: number;
    missingDocs?: number;
    /** Stored requests only: the client link token and what the client uploaded. */
    token?: string;
    uploads?: UploadedDocument[];
    /** The notes from the client's latest submission, if they wrote any. */
    clientNotes?: string;
    /** The video & photos this request asked for. */
    requestedMedia?: RequestedMedia;
    /** When it was last sent (ISO), for the date and time on the card. */
    lastSentAt?: string;
  }
  const toRecord = (r: IntakeRequest): IntakeRequestRecord => ({
    id: r.id,
    token: r.token,
    status: r.status,
    version: r.version,
    recipient: (r.deliveryMethod === "sms" ? r.recipientPhone : r.recipientEmail) ?? r.plaintiff,
    deliveryMethod: r.deliveryMethod,
    requestedDocs: r.requestedDocs,
    created: formatShortDate(r.createdAt),
    lastSent: formatShortDate(r.lastSentAt),
    lastModified: r.lastModifiedAt ? formatShortDate(r.lastModifiedAt) : undefined,
    docsReceived: r.docsReceived ?? (r.submissions?.length ? r.uploads.length : undefined),
    missingDocs: r.missingDocs,
    uploads: r.uploads,
    clientNotes: [...(r.submissions ?? [])].reverse().find((s) => s.notes)?.notes,
    requestedMedia: r.requestedMedia,
    lastSentAt: r.lastSentAt,
  });
  const intakeRequests: IntakeRequestRecord[] = storedRequests.map(toRecord);
  const tokenOf = (id: string) => storedRequests.find((r) => r.id === id)?.token;
  // Captured once at mount: an existing/progressed case arrives with the intake
  // already sent AND its documents already on file, so its intake response is
  // treated as already received. A brand-new case (no documents yet) starts false
  // and only advances through the real send flow.
  const [intakeAlreadySent] = useState(pipeline.intakeSent && pipeline.documents.length > 0);
  // A case that arrives with its intake request already sent (the sample
  // cases) has that request stored once, as the same REQ-001 its card has
  // always shown — now with its own client link. Never a second request.
  useEffect(() => {
    if (!pipeline.intakeSent || storedRequests.length > 0) return;
    adoptExistingIntakeRequest({
      caseId: data.caseId,
      caseName: data.caseName,
      plaintiff: data.plaintiff,
      sender: INTAKE_SENDER,
      deliveryMethod,
      recipientEmail: hasEmail ? editableEmail : undefined,
      recipientPhone: hasPhone ? editablePhone : undefined,
      requestedDocs: documents.filter((d) => d.enabled).map((d) => d.name),
      instructions: "",
      createdAt: "2026-06-08T12:00:00.000Z",
      ...(intakeAlreadySent
        ? { status: "Completed" as const, docsReceived: 8, missingDocs: 1 }
        : { status: "Sent" as const }),
    });
  }, [data.caseId, pipeline.intakeSent, storedRequests.length]);
  const [intakeOverflowOpen, setIntakeOverflowOpen] = useState<string | null>(null);
  const [intakeModalMode, setIntakeModalMode] = useState<"create" | "modify" | "additional">("create");
  const [activeModifyId, setActiveModifyId] = useState<string | null>(null);
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [showViewSubmissionModal, setShowViewSubmissionModal] = useState(false);
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null);

  // plaintiffActivityDetected is derived after sharedDocs — see below
  const [documentsSubTab, setDocumentsSubTab] = useState<"intake" | "media">("intake");
  const [documentSearch, setDocumentSearch] = useState("");
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  const toggleDocument = (index: number) => {
    const newDocs = [...documents];
    if (!newDocs[index].required) {
      newDocs[index].enabled = !newDocs[index].enabled;
      setDocuments(newDocs);
    }
  };

  const buildNewRequest = (overrides: Partial<IntakeRequestRecord> = {}): IntakeRequestRecord => ({
    id: `REQ-${String((intakeRequests.length + 1)).padStart(3, "0")}`,
    status: "Sent",
    version: 1,
    recipient: recipientEmail || data.plaintiffEmail || data.plaintiff,
    deliveryMethod: deliveryMethod,
    requestedDocs: documents.filter((d) => d.enabled).map((d) => d.name),
    created: "Jun 8, 2026",
    lastSent: "Jun 8, 2026",
    ...overrides,
  });

  // Sending creates a real request for this case: its own ID, secure token and
  // client link, with the recipient, documents and instructions as chosen.
  const recipientFields = () => ({
    deliveryMethod,
    recipientEmail: hasEmail ? editableEmail : undefined,
    recipientPhone: hasPhone ? editablePhone : undefined,
  });
  // The video & photos this request asks for — chosen per request in the
  // modal, stored on the request, and shown as upload areas on its link.
  const [requestedMedia, setRequestedMedia] = useState<RequestedMedia>(NO_MEDIA);
  useEffect(() => {
    if (!showIntakeModal) return;
    if (intakeModalMode === "modify" && activeModifyId) {
      // Modify keeps what that request already asked for.
      setRequestedMedia(storedRequests.find((r) => r.id === activeModifyId)?.requestedMedia ?? NO_MEDIA);
    } else if (intakeModalMode === "additional") {
      // An additional request starts from what earlier requests asked for.
      const asked = storedRequests.map((r) => r.requestedMedia ?? NO_MEDIA);
      setRequestedMedia({
        videos: asked.some((m) => m.videos),
        scenePhotos: asked.some((m) => m.scenePhotos),
        medicalImages: asked.some((m) => m.medicalImages),
      });
    } else {
      setRequestedMedia(NO_MEDIA);
    }
  }, [showIntakeModal]);

  const sendNewRequest = (requestedDocs: string[], media: RequestedMedia = NO_MEDIA) =>
    createIntakeRequest({
      caseId: data.caseId,
      caseName: data.caseName,
      plaintiff: data.plaintiff,
      sender: INTAKE_SENDER,
      ...recipientFields(),
      requestedDocs,
      requestedMedia: media,
      instructions: additionalInstructions.trim(),
    });

  const handleSendRequestFromCard = () => {
    if (!hasContact) { setShowIntakeModal(true); return; }
    setIntakeSent(true);
    setEmailError(false);
    if (storedRequests.length === 0) {
      sendNewRequest(documents.filter((d) => d.enabled).map((d) => d.name));
    }
  };

  const handleSendRequest = () => {
    if (!hasContact) return;
    setIntakeCreated(true);
    setIntakeSent(true);
    setShowIntakeModal(false);
    setEmailError(false);
    const selected = documents.filter((d) => d.enabled).map((d) => d.name);
    const now = new Date().toISOString();
    if (intakeModalMode === "create") {
      sendNewRequest(selected, requestedMedia);
    } else if (intakeModalMode === "modify" && activeModifyId) {
      const token = tokenOf(activeModifyId);
      if (token) {
        updateIntakeRequest(token, (r) => ({
          ...recipientFields(),
          requestedDocs: selected,
          requestedMedia,
          instructions: additionalInstructions.trim(),
          version: r.version + 1,
          lastModifiedAt: now,
          lastSentAt: now,
        }));
      }
    } else if (intakeModalMode === "additional") {
      sendNewRequest(ADDITIONAL_DOCS, requestedMedia);
    }
    setIntakeModalMode("create");
    setActiveModifyId(null);
  };

  const handleModifyRequest = (id: string) => {
    setIntakeModalMode("modify");
    setActiveModifyId(id);
    setEmailError(false);
    setShowIntakeModal(true);
  };

  const handleOpenAdditionalRequest = () => {
    setIntakeModalMode("additional");
    setActiveModifyId(null);
    setShowIntakeModal(true);
  };

  const handleMarkCompleted = (id: string) => {
    const token = tokenOf(id);
    if (token) updateIntakeRequest(token, { status: "Completed", docsReceived: 8, missingDocs: 1 });
  };

  const handleOpenResend = (id: string) => {
    setResendingId(id);
    setShowResendModal(true);
  };

  const handleConfirmResend = () => {
    const token = resendingId ? tokenOf(resendingId) : undefined;
    if (token) updateIntakeRequest(token, { lastSentAt: new Date().toISOString() });
    setShowResendModal(false);
    setResendingId(null);
  };

  const handleCreateAdditionalRequest = () => {
    handleOpenAdditionalRequest();
  };

  const handleCopyLink = () => {
    // Fallback method for when Clipboard API is blocked
    const textArea = document.createElement("textarea");
    textArea.value = secureLink;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
    textArea.remove();
  };

  const handleOpenFollowUp = () => {
    const missing = missingDocuments.join("\n• ");
    setFollowUpMessage(
      `Hello ${data.plaintiff},\n\nWe're still waiting for the following documents to continue processing your case:\n\n• ${missing}\n\nPlease upload them using your secure intake link.\n\nThank you.`
    );
    setShowFollowUpModal(true);
  };

  const handleSendFollowUp = () => {
    setShowFollowUpModal(false);
  };

  const handleOpenSendRetainerModal = () => {
    setRetainerModalMode("initial");
    setRetainerMessage(
      `Hello ${data.plaintiff},\n\nPlease review and sign the attached retainer agreement to begin representation.\n\nThank you.`
    );
    setShowSendRetainerModal(true);
  };

  // Generate New Retainer → opens the same creation flow used during initial setup.
  // Nothing is created until the attorney explicitly clicks "Send Retainer".
  const handleGenerateNewRetainer = () => {
    setRetainerModalMode("new-version");
    setSelectedTemplate("");
    setRetainerMessage(
      `Hello ${data.plaintiff},\n\nPlease review and sign the attached retainer agreement to begin representation.\n\nThank you.`
    );
    setShowSendRetainerModal(true);
  };

  const handleSendRetainer = () => {
    const template = retainerTemplates.find((t) => t.id === selectedTemplate);
    const templateName = template ? template.name : (selectedTemplateName || "Personal Injury Retainer Agreement v1");
    setSelectedTemplateName(templateName);
    const recipient = retainerEmail || data.plaintiffEmail || data.plaintiff;

    if (retainerModalMode === "new-version") {
      // Preserve the existing signed retainer as version #1 and add a new
      // "Awaiting Signature" version above it.
      setRetainerVersions((prev) => {
        const base: RetainerVersion[] = prev.length > 0 ? prev : [{
          id: 1,
          status: "Signed",
          recipient: retainerEmail || data.plaintiffEmail || data.plaintiff,
          template: selectedTemplateName || "Personal Injury Retainer Agreement v1",
          sentDate: retainerSentDate || "Jun 9, 2026",
          signedDate: retainerSignedDate || "Jun 11, 2026",
          signedDocName: "Signed_PI_Retainer.pdf",
          sentDocName: "PI_Retainer_Agreement.pdf",
        }];
        const nextId = Math.max(...base.map((r) => r.id)) + 1;
        return [...base, { id: nextId, status: "Awaiting Signature", recipient, template: templateName, sentDate: today(), sentDocName: "PI_Retainer_Agreement.pdf" }];
      });
      setRetainerStatus("signed");
    } else {
      setRetainerStatus("sent");
      setDemoRetainerState("sent");
      setRetainerSentDate(today());
    }
    setRetainerModalMode("initial");
    setShowSendRetainerModal(false);
  };

  const handlePreviewTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowPreviewModal(true);
  };

  const resetRetainerPick = () => { setRetainerPickedFile(null); setRetainerConfirmed(false); setRetainerUploadError(null); };
  const handleMarkAsSigned = () => {
    resetRetainerPick();
    setShowMarkSignedModal(true);
  };
  const openUploadAgreement = () => { resetRetainerPick(); setShowUploadAgreementModal(true); };

  /** The attorney confirms the retainer is signed — with the signed file when
   *  they upload one, which is stored first. Returns false if nothing changed. */
  const markRetainerSigned = async (file?: File): Promise<boolean> => {
    let stored: { name: string; storageKey: string; size: number } | null = null;
    if (file) {
      try {
        stored = { name: file.name, storageKey: await putMediaFile(file), size: file.size };
      } catch {
        setRetainerUploadError("The file could not be stored in this browser. Nothing was changed.");
        return false;
      }
    }
    const date = today();
    setRetainerStatus("signed");
    setDemoRetainerState("signed");
    setRetainerSignedDate(date);
    setRetainerSource("attorney");
    setRetainerFile(stored);
    setAgreementUploaded(!!stored);
    if (stored) setRetainerDocs((ds) => [...ds, { id: `ret-up-${Date.now()}`, name: stored!.name, date, status: "Signed", source: "Attorney" }]);
    setRetainerVersions((prev) => {
      if (prev.length === 0) return prev;
      const maxId = Math.max(...prev.map((r) => r.id));
      return prev.map((r) => (r.id === maxId ? { ...r, status: "Signed", signedDate: date, signedDocName: stored?.name } : r));
    });
    return true;
  };

  const handleConfirmSigned = async () => {
    if (await markRetainerSigned(retainerPickedFile ?? undefined)) setShowMarkSignedModal(false);
  };

  const handleAddLater = async () => {
    if (await markRetainerSigned()) setShowMarkSignedModal(false);
  };

  const handleUploadAgreement = () => {
    setAgreementUploaded(true);
  };

  const handleResendRetainer = () => {
    setRetainerSentDate(today());
  };

  // Preview and Insights open the same unified Document Workspace into different views:
  // Preview = 80/20 document + action rail; Insights = 60/40 document + AI panel.
  const openDocumentWorkspace = (document: any, view: "preview" | "insights" = "preview") => {
    setSelectedDocument(document);
    setWorkspaceView(view);
    setShowDocumentPreview(true);
    setOpenActionMenu(null);
  };
  const handlePreviewDocument = (document: any) => { if (document?.history) acknowledge(document); openDocumentWorkspace(document, "preview"); };
  const handleOpenInsights = (document: any) => { if (document?.history) acknowledge(document); openDocumentWorkspace(document, "insights"); };

  const handleDownloadDocument = (document: any) => {
    // The stored original, when there is one; records without a stored file
    // offer no download.
    if (document?.storageKey) void downloadMediaFile(document.storageKey, document.name);
    setOpenActionMenu(null);
  };

  // Shared uploaded documents (pipeline state)
  const sharedDocs = pipeline.documents;
  const plaintiffActivityDetected = sharedDocs.length > 0;
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);

  // Documents are updated from their latest value, so a check finishing never
  // overwrites another document's change.
  const updateDocs = (fn: (docs: CaseDocument[]) => CaseDocument[]) =>
    onDocumentsUpdate ? onDocumentsUpdate(fn) : onPipelineUpdate({ documents: fn(sharedDocs) });
  const patchDoc = (id: string, patch: Partial<CaseDocument>, event?: string) =>
    updateDocs((ds) => ds.map((d) => (d.id === id
      ? { ...d, ...patch, history: event ? [...(d.history ?? []), { at: nowLabel(), event }] : d.history }
      : d)));

  /** Runs the file check on a stored document and records the outcome. */
  const runCheck = async (doc: CaseDocument, file: Blob) => {
    patchDoc(doc.id, { status: "Processing", checkError: undefined, checkResult: undefined, reviewReason: undefined }, "File check started");
    try {
      const result = await checkDocument(file, doc.name);
      // A file the system cannot file under a category needs the attorney to decide.
      const category = doc.category ?? classifyDocuments([doc])[0]?.name;
      if (category === "General Documents") {
        patchDoc(doc.id, { status: "Attorney Review Required", checkResult: result, reviewReason: "The category could not be determined from the file name — set its category." }, "Needs attorney review: category not determined");
      } else {
        patchDoc(doc.id, { status: "Processed", checkResult: result }, "File check passed");
      }
    } catch (e) {
      if (e instanceof NeedsAttorney) patchDoc(doc.id, { status: "Attorney Review Required", reviewReason: e.message }, "Needs attorney review: file type not checkable");
      else patchDoc(doc.id, { status: "Failed", checkError: (e as Error).message }, `File check failed: ${(e as Error).message}`);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const existing = new Set(sharedDocs.map((d) => d.name));
    const fresh = files.filter((f) => !existing.has(f.name));
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const newDocs: CaseDocument[] = fresh.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      source: "Attorney",
      date,
      size: f.size,
      status: "Queued",
      history: [{ at: nowLabel(), event: "Uploaded" }],
    }));
    if (newDocs.length > 0) {
      updateDocs((ds) => [...ds, ...newDocs]);
      setUploadedFileNames(newDocs.map((d) => d.name));
      setShowUploadSuccess(true);
      // Store each original, then check it — one at a time per file.
      newDocs.forEach(async (doc, i) => {
        try {
          const storageKey = await putMediaFile(fresh[i]);
          patchDoc(doc.id, { storageKey }, "Original stored in this browser");
          await runCheck(doc, fresh[i]);
        } catch {
          patchDoc(doc.id, { status: "Failed", checkError: "The file could not be stored in this browser" }, "Storing the file failed");
        }
      });
    }
    e.target.value = "";
  };

  /** Retry: the stored original is checked again. */
  const retryDoc = async (doc: CaseDocument) => {
    const blob = await getMediaFile(doc.storageKey).catch(() => undefined);
    if (!blob) {
      patchDoc(doc.id, { status: "Failed", checkError: "The original file is not stored in this browser — upload it again" }, "Retry failed: original not stored");
      return;
    }
    patchDoc(doc.id, { status: "Queued" }, "Retry requested");
    await runCheck(doc, blob);
  };

  // ── Client submissions → case documents ──
  // Each file a client submits through a request becomes one case document,
  // sourced to the client and tied to its request — the same record the
  // Documents tab lists and the request progress reads. Added once; one the
  // attorney deletes is not added again.
  const syncedUploads = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onFile = new Set(sharedDocs.map((d) => d.intakeUploadId).filter(Boolean) as string[]);
    const fresh: { doc: CaseDocument; storageKey?: string }[] = [];
    for (const r of storedRequests) {
      const removed = new Set(r.removedUploadIds ?? []);
      for (const s of r.submissions ?? []) {
        for (const id of s.documentIds) {
          if (onFile.has(id) || removed.has(id) || syncedUploads.current.has(id)) continue;
          const u = r.uploads.find((x) => x.id === id);
          if (!u) continue;
          syncedUploads.current.add(id);
          fresh.push({
            storageKey: u.storageKey,
            doc: {
              id: `intake-${id}`,
              name: u.name,
              source: "Plaintiff",
              date: formatShortDate(s.submittedAt),
              size: u.size,
              status: u.storageKey ? "Queued" : "Failed",
              checkError: u.storageKey ? undefined : "The client's original file was not stored, so it could not be checked — ask the client to upload it again.",
              storageKey: u.storageKey,
              requestId: r.id,
              intakeUploadId: id,
              receivedAt: s.submittedAt,
              history: [{ at: nowLabel(), event: `Received from the client with ${r.id}` }],
            },
          });
        }
      }
    }
    if (fresh.length === 0) return;
    updateDocs((ds) => [...ds, ...fresh.filter((f) => !ds.some((d) => d.intakeUploadId === f.doc.intakeUploadId)).map((f) => f.doc)]);
    fresh.forEach(async (f) => {
      if (!f.storageKey) return;
      const blob = await getMediaFile(f.storageKey).catch(() => undefined);
      if (!blob) {
        patchDoc(f.doc.id, { status: "Failed", checkError: "The client's original file is not stored in this browser." }, "Original not found");
        return;
      }
      await runCheck(f.doc, blob);
    });
  }, [storedRequests, sharedDocs.length]);

  // ── Retainer documents — held on the page; editing changes details only ──
  type RetainerDoc = (typeof allRetainerDocuments)[number] & { id: string };
  const [retainerDocs, setRetainerDocs] = useState<RetainerDoc[]>(() => allRetainerDocuments.map((d, i) => ({ ...d, id: `ret-${i}` })));
  const [retainerEdit, setRetainerEdit] = useState<RetainerDoc | null>(null);
  const [retainerEditError, setRetainerEditError] = useState<string | null>(null);
  const [retainerDelete, setRetainerDelete] = useState<RetainerDoc | null>(null);
  const [retainerDeleteError, setRetainerDeleteError] = useState<string | null>(null);
  /** A Retainer-section row's document as the shared edit / delete dialogs take it. */
  const sectionRetainerDoc = (r: { id: number; signedDocName?: string; signedDate?: string }): RetainerDoc =>
    ({ id: `sec-${r.id}`, name: r.signedDocName ?? "", date: r.signedDate ?? "", status: "Signed", source: retainerSource === "attorney" ? "Attorney" : "Plaintiff" });
  const confirmRetainerDelete = async () => {
    const doc = retainerDelete;
    if (!doc) return;
    if (doc.id.startsWith("sec-")) {
      const vid = Number(doc.id.slice(4));
      // The attorney's uploaded copy is the stored original — remove it too.
      if (retainerSource === "attorney" && retainerFile?.storageKey && retainerFile.name === doc.name) {
        try { await deleteMediaFile(retainerFile.storageKey); }
        catch { setRetainerDeleteError("The stored file could not be removed from this browser. The document was not deleted."); return; }
        setRetainerFile(null);
      }
      setRetainerDocPatch((p) => ({ ...p, [vid]: { removed: true } }));
    } else {
      setRetainerDocs((ds) => ds.filter((d) => d.id !== doc.id));
    }
    setRetainerDeleteError(null);
    setRetainerDelete(null);
  };
  const saveRetainerEdit = () => {
    if (!retainerEdit) return;
    const name = retainerEdit.name.trim();
    if (!name) { setRetainerEditError("A document name is required."); return; }
    if (!/\.[a-z0-9]+$/i.test(name)) { setRetainerEditError("Keep the file extension, for example .pdf."); return; }
    if (retainerDocs.some((d) => d.id !== retainerEdit.id && d.name === name)) { setRetainerEditError("Another retainer document already has that name."); return; }
    if (!retainerEdit.date.trim()) { setRetainerEditError("A date is required."); return; }
    if (retainerEdit.id.startsWith("sec-")) {
      const vid = Number(retainerEdit.id.slice(4));
      setRetainerDocPatch((p) => ({ ...p, [vid]: { ...p[vid], name, date: retainerEdit.date.trim() } }));
      setRetainerEdit(null);
      return;
    }
    setRetainerDocs((ds) => ds.map((d) => (d.id === retainerEdit.id ? { ...d, name, source: retainerEdit.source, date: retainerEdit.date.trim() } : d)));
    setRetainerEdit(null);
  };

  // ── Edit, delete, review ──
  const [editDoc, setEditDoc] = useState<CaseDocument | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", source: "Attorney" as CaseDocument["source"], date: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<CaseDocument | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reviewDoc, setReviewDoc] = useState<CaseDocument | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewCategory, setReviewCategory] = useState("");
  /** The attorney has seen this document's current status. */
  const acknowledge = (doc: CaseDocument) => { if (isUnseen(doc)) patchDoc(doc.id, { seenStatus: doc.status }); };
  const openEdit = (doc: CaseDocument) => {
    acknowledge(doc);
    setEditDoc(doc);
    setEditForm({ name: doc.name, category: doc.category ?? "", source: doc.source, date: doc.date });
    setEditError(null);
  };
  const saveEdit = () => {
    if (!editDoc) return;
    const name = editForm.name.trim();
    if (!name) { setEditError("A document name is required."); return; }
    if (!/\.[a-z0-9]+$/i.test(name)) { setEditError("Keep the file extension, for example .pdf."); return; }
    if (sharedDocs.some((d) => d.id !== editDoc.id && d.name === name)) { setEditError("Another document on this case already has that name."); return; }
    if (!editForm.date.trim()) { setEditError("A date is required."); return; }
    const changed = [
      name !== editDoc.name && "name",
      (editForm.category || undefined) !== editDoc.category && "category",
      editForm.source !== editDoc.source && "source",
      editForm.date.trim() !== editDoc.date && "date",
    ].filter(Boolean);
    // Details only — the stored file and its check stand.
    patchDoc(editDoc.id, { name, category: editForm.category || undefined, source: editForm.source, date: editForm.date.trim() },
      changed.length ? `Details edited: ${changed.join(", ")}` : undefined);
    setEditDoc(null);
  };
  const confirmDelete = async () => {
    if (!deleteDoc) return;
    try {
      if (deleteDoc.storageKey) await deleteMediaFile(deleteDoc.storageKey);
      updateDocs((ds) => ds.filter((d) => d.id !== deleteDoc.id));
      const fromRequest = deleteDoc.intakeUploadId ? storedRequests.find((r) => r.id === deleteDoc.requestId) : undefined;
      if (fromRequest && deleteDoc.intakeUploadId) {
        const uploadId = deleteDoc.intakeUploadId;
        updateIntakeRequest(fromRequest.token, (r) => ({ removedUploadIds: [...(r.removedUploadIds ?? []), uploadId] }));
      }
      setDeleteDoc(null);
    } catch {
      setDeleteError("The stored file could not be removed from this browser. The document was not deleted.");
    }
  };
  const openReview = (doc: CaseDocument) => {
    acknowledge(doc);
    setReviewDoc(doc);
    setReviewNote("");
    setReviewCategory(doc.category ?? "");
  };
  const markReviewed = () => {
    if (!reviewDoc) return;
    const patch: Partial<CaseDocument> = { status: "Reviewed", seenStatus: "Reviewed" };
    if (reviewCategory && reviewCategory !== reviewDoc.category) patch.category = reviewCategory;
    patchDoc(reviewDoc.id, patch, `Reviewed by ${INTAKE_SENDER.name}${patch.category ? ` · category set to ${patch.category}` : ""}${reviewNote.trim() ? ` — ${reviewNote.trim()}` : ""}`);
    setReviewDoc(null);
  };

  // ── Video & photos — one upload flow, opened from the header menu and from
  // every Upload Video & Photos card ──
  const docInputRef = useRef<HTMLInputElement>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  // The one Upload Video & Photos modal, opened from the header menu and from
  // every Upload Video & Photos card.
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const media = useMediaEvidence(data.caseId);
  const mediaFileCount = media.videos.length + media.sets.reduce((n, x) => n + x.files.length, 0);
  const openMediaUpload = () => { setUploadMenuOpen(false); setMediaModalOpen(true); };
  const openDocumentUpload = () => { setUploadMenuOpen(false); docInputRef.current?.click(); };
  const viewMediaEvidence = () => setDocumentsSubTab("media");
  // What the attorney's last video & photo upload actually put on the case.
  const [mediaUploadResult, setMediaUploadResult] = useState<MediaUploadResult | null>(null);
  // "Oct 9, 2026 · 6:15 PM"
  const sentLabel = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };
  // Which document categories satisfy each requested document type.
  const REQUESTED_DOC_CATEGORIES: Record<string, string[]> = {
    "Medical Records": ["Medical Records"],
    "Police Report": ["Police Reports"],
    "Insurance Documents": ["Insurance Documents"],
    "Wage Loss Records": ["Wage Loss Records"],
    "Employment Records": ["Wage Loss Records"],
    "Pharmacy Records": ["Medical Records"],
    "Property Damage Photos": ["Photos & Evidence", "Video & Photos"],
  };
  // The client's answer to one request, from its own records: the documents
  // it sent, the requested types none of them covers, and the submission.
  const answerFor = (req: IntakeRequestRecord) => {
    const stored = storedRequests.find((r) => r.id === req.id);
    if (stored?.submissions?.length) {
      const sentIds = new Set(stored.submissions.flatMap((x) => x.documentIds));
      const docs = stored.uploads.filter((u) => sentIds.has(u.id)).map((u) => u.name);
      const covered = new Set(classifyDocuments(docs.map((n) => ({ id: n, name: n, source: "Plaintiff" as const, date: "", status: "Processed" as const }))).map((c) => c.name));
      const missing = stored.requestedDocs.filter((d) => !(REQUESTED_DOC_CATEGORIES[d] ?? []).some((c) => covered.has(c)));
      const last = stored.submissions[stored.submissions.length - 1];
      return { docs, missing, submittedAt: last.submittedAt, notes: req.clientNotes, confirmed: last.confirmationAccepted };
    }
    // Answered before submissions were recorded (the sample cases): the
    // case's own documents and its missing-evidence check.
    return { docs: sharedDocs.map((d) => d.name), missing: missingEvidence.map((m) => m.title), submittedAt: undefined as string | undefined, notes: undefined as string | undefined, confirmed: undefined as boolean | undefined };
  };
  // The video & photos a client sent through one request, from the media records.
  const receivedMediaFor = (requestId: string) => {
    const videos = media.videos.filter((v) => v.source === "Client" && v.requestId === requestId);
    const sets = media.sets.filter((x) => x.source === "Client" && x.requestId === requestId);
    const photos = sets.reduce((n, x) => n + x.files.length, 0);
    // Processing only while a linked file actually reports it — never assumed.
    const processing =
      videos.some((v) => v.file.analysisStatus === "processing") ||
      sets.some((x) => x.files.some((f) => f.analysisStatus === "processing"));
    return { videos: videos.length, sets: sets.length, photos, files: videos.length + photos, processing };
  };

  // The Upload Video & Photos card — one card, two sizes: a tile beside the
  // intake cards before any request exists, a panel beside Upload Existing
  // Files once one does. Both open the same media upload.
  // What has been uploaded so far, and the way to it.
  const mediaFeedback = mediaFileCount > 0 && (
    <p className="text-xs text-ink" onClick={(e) => e.stopPropagation()}>
      <span className="font-semibold">{media.videos.length} {media.videos.length === 1 ? "video" : "videos"} · {media.sets.length} {media.sets.length === 1 ? "set" : "sets"}</span> on this case.{" "}
      <button onClick={viewMediaEvidence} className="text-xs font-semibold text-deep hover:underline">View media evidence →</button>
    </p>
  );
  const mediaCard = (variant: "tile" | "panel") =>
    variant === "tile" ? (
      <div
        role="button"
        tabIndex={0}
        onClick={openMediaUpload}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMediaUpload(); } }}
        className="lg-card lg-card-i p-8 group text-left cursor-pointer"
      >
        <div className="flex items-start gap-5 flex-wrap sm:flex-nowrap">
          <div className="p-4 bg-tint rounded-xl inline-flex shrink-0">
            <Camera className="w-6 h-6 text-deep" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="card-title">Upload Video &amp; Photos</h3>
              <NewBadge />
            </div>
            <p className="secondary-text">Videos, scene photos and medical images. They are analysed on their own, not read as documents.</p>
            <p className="text-xs text-[#5B6B78]">Examples: Dashcam footage • Phone photos • X-ray or MRI images</p>
            {mediaFeedback}
            <div className="flex items-center gap-2 text-deep font-medium text-sm group-hover:gap-3 transition-all">
              Upload Video &amp; Photos
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="lg-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Camera className="w-4 h-4 text-deep" strokeWidth={1.75} />
          <h3 className="card-title">Upload Video &amp; Photos</h3>
          <NewBadge />
        </div>
        <p className="secondary-text mb-2">Videos, scene photos and medical images. They are analysed on their own, not read as documents.</p>
        <p className="text-xs text-[#5B6B78] mb-4">Examples: Dashcam footage • Phone photos • X-ray or MRI images</p>
        {mediaFeedback && <div className="mb-4">{mediaFeedback}</div>}
        <button
          onClick={openMediaUpload}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-wash transition-all"
        >
          <Camera className="w-4 h-4" strokeWidth={1.75} />
          Upload Video &amp; Photos
          <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    );

  const handleSimulateUpload = (source: "Plaintiff" | "Attorney") => {
    const simulatedBatch: CaseDocument[] = [
      { id: `${Date.now()}-1`, name: "MRI_Report_2026.pdf", source, date: "Jun 9, 2026", status: "Processed" },
      { id: `${Date.now()}-2`, name: "ER_Bills.pdf", source, date: "Jun 9, 2026", status: "Processed" },
      { id: `${Date.now()}-3`, name: "police_report_final.pdf", source, date: "Jun 9, 2026", status: "Processed" },
      { id: `${Date.now()}-4`, name: "physical_therapy_notes.pdf", source, date: "Jun 9, 2026", status: "Processed" },
      { id: `${Date.now()}-5`, name: "insurance_policy_v2.pdf", source: "Attorney", date: "Jun 9, 2026", status: "Processed" },
      { id: `${Date.now()}-6`, name: "witness_statement.pdf", source: "Attorney", date: "Jun 9, 2026", status: "Processed" },
    ];
    const existing = new Set(sharedDocs.map((d) => d.name));
    const newDocs = simulatedBatch.filter((d) => !existing.has(d.name));
    if (newDocs.length > 0) onPipelineUpdate({ documents: [...sharedDocs, ...newDocs] });
  };

  const filteredIntakeDocuments = sharedDocs.filter((doc) =>
    doc.name.toLowerCase().includes(documentSearch.toLowerCase())
  );

  // Classification derived from shared docs
  const classifiedCategories = classifyDocuments(sharedDocs);
  const classifiedCount = classifiedCategories.reduce((n, c) => n + c.docs.length, 0);
  // A file that failed its check does not count as received evidence.
  const missingEvidence = detectMissingEvidence(classifyDocuments(sharedDocs.filter((d) => d.status !== "Failed")));
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const toggleCategory = (name: string) =>
    setExpandedCategories((prev) => ({ ...prev, [name]: prev[name] === false ? true : false }));
  const isCategoryExpanded = (name: string) => expandedCategories[name] !== false;

  // Missing evidence request modal
  const [showMissingRequestModal, setShowMissingRequestModal] = useState(false);
  const [missingCheckedDocs, setMissingCheckedDocs] = useState<Record<string, boolean>>({});
  const [missingDeliveryMethod, setMissingDeliveryMethod] = useState<"email" | "sms">("email");
  const [missingMessageText, setMissingMessageText] = useState("");
  // What the request asks for, and the request it follows up (if any).
  const [missingItems, setMissingItems] = useState<{ title: string; expected?: string }[]>([]);
  const [missingFollowUpOf, setMissingFollowUpOf] = useState<string | undefined>(undefined);
  const [missingError, setMissingError] = useState<string | null>(null);

  const generateMissingMessage = (docs: string[]) =>
    `Hello ${data.plaintiff},\n\nWe are currently reviewing your case and require additional documents to continue our evaluation.\n\nRequested Documents:\n${docs.map((d) => `• ${d}`).join("\n")}\n\nPlease upload the requested documents using your secure intake link.\n\nIf you have any questions or are unable to obtain a document, please contact our office.\n\nThank you,\nJennifer Davis\nLexGuard Injury Intel`;

  const openMissingRequestModal = (items: { title: string; expected?: string }[] = missingEvidence, followUpOf?: string) => {
    const allTitles = items.map((m) => m.title);
    setMissingItems(items);
    setMissingFollowUpOf(followUpOf ?? storedRequests[storedRequests.length - 1]?.id);
    setMissingError(null);
    setMissingDeliveryMethod(data.plaintiffEmail ? "email" : "sms");
    setMissingCheckedDocs(Object.fromEntries(allTitles.map((t) => [t, true])));
    setMissingMessageText(generateMissingMessage(allTitles));
    setShowMissingRequestModal(true);
  };

  const handleMissingDocCheck = (title: string, checked: boolean) => {
    const next = { ...missingCheckedDocs, [title]: checked };
    setMissingCheckedDocs(next);
    const selected = missingItems.filter((m) => next[m.title]).map((m) => m.title);
    setMissingMessageText(generateMissingMessage(selected));
  };

  // Sends the follow-up as a real request — unless one still waiting for the
  // client already asks for the same documents.
  const handleSendMissingRequest = () => {
    const docs = missingItems.filter((m) => missingCheckedDocs[m.title]).map((m) => m.title);
    if (docs.length === 0) return;
    const waiting = storedRequests.find((r) =>
      !(r.submissions?.length) && r.status !== "Completed" && r.status !== "Cancelled" && r.status !== "Expired"
      && docs.every((d) => r.requestedDocs.includes(d)));
    if (waiting) {
      setMissingError(`${waiting.id} already asks for ${docs.length === 1 ? "this document" : "these documents"} and is waiting for the client — resend it instead of creating another request.`);
      return;
    }
    const email = missingDeliveryMethod === "email" ? (editableEmail || data.plaintiffEmail) : undefined;
    const phone = missingDeliveryMethod === "sms" ? editablePhone : undefined;
    if (!email && !phone) { setMissingError("There is no contact on file for this delivery method."); return; }
    const created = createIntakeRequest({
      caseId: data.caseId,
      caseName: data.caseName,
      plaintiff: data.plaintiff,
      sender: INTAKE_SENDER,
      deliveryMethod: missingDeliveryMethod,
      recipientEmail: email,
      recipientPhone: phone,
      requestedDocs: docs,
      requestedMedia: NO_MEDIA,
      instructions: missingMessageText.trim(),
      followUpOf: missingFollowUpOf,
    });
    setIntakeSent(true);
    setProgressReqId(created.id);
    setShowMissingRequestModal(false);
  };

  const selectedMissingTitles = missingItems.filter((m) => missingCheckedDocs[m.title]).map((m) => m.title);

  const handleCopyRetainerLink = () => {
    const textArea = document.createElement("textarea");
    textArea.value = retainerLink;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
    textArea.remove();
  };

  const missingDocuments = documentProgress
    .filter((doc) => !doc.complete)
    .map((doc) => doc.name);

  const allRequiredReceived = documentProgress.every((doc) => doc.complete);

  const requestedDocumentsCount = documents.filter((doc) => doc.enabled).length;

  // ── Retainer versions (effective list drives the section + checklist) ──
  const synthRetainer: RetainerVersion = {
    id: 1,
    status: retainerStatus === "signed" ? "Signed" : "Awaiting Signature",
    recipient: retainerEmail || data.plaintiffEmail || data.plaintiff,
    template: selectedTemplateName || "Personal Injury Retainer Agreement v1",
    sentDate: retainerSentDate || "Jun 9, 2026",
    signedDate: retainerSignedDate || "Jun 11, 2026",
    // Signed by the attorney's confirmation: the file they uploaded, if any.
    signedDocName: retainerSource === "attorney" ? retainerFile?.name : "Signed_PI_Retainer.pdf",
    sentDocName: "PI_Retainer_Agreement.pdf",
  };
  const [retainerDocPatch, setRetainerDocPatch] = useState<Record<number, { name?: string; date?: string; removed?: boolean }>>({});
  const effectiveRetainers: RetainerVersion[] = (retainerVersions.length > 0
    ? retainerVersions
    : retainerStatus !== "not-sent" ? [synthRetainer] : []
  ).map((r) => {
    const patch = retainerDocPatch[r.id];
    if (!patch) return r;
    return { ...r, signedDocName: patch.removed ? undefined : (patch.name ?? r.signedDocName), signedDate: patch.date ?? r.signedDate };
  });
  const newestRetainer = effectiveRetainers.reduce<RetainerVersion | null>((a, b) => (a && a.id > b.id ? a : b), null);

  // ── Collection status — derived entirely from real pipeline/intake state ──
  const retainerSigned = effectiveRetainers.some((r) => r.status === "Signed");
  const intakeResponseReceived = intakeRequests.some((r) => r.status === "Completed")
    || (intakeRequests.length === 0 && intakeAlreadySent);
  const documentsReceived = sharedDocs.length > 0;
  const processingComplete = documentsReceived && sharedDocs.every((d) => processingFinished(d) && d.status !== "Failed");
  // Counted as the Processed filter counts them, so the summary, the filters
  // and the checklist always agree.
  const docsFinishedOk = sharedDocs.filter((d) => inFilter(d.status, "processed")).length;
  const missingDocCount = missingEvidence.length;
  const missingDocNames = missingEvidence.map((m) => m.title);

  // Demo handlers — flip all dependent UI from the per-section header toggles
  const applyDemoRetainer = (state: "sent" | "signed") => {
    setDemoRetainerState(state);
    setRetainerStatus(state === "signed" ? "signed" : "sent");
    if (state === "signed" && !retainerSignedDate) setRetainerSignedDate("Jun 11, 2026");
    // When explicit versions exist, flip the newest version's status.
    setRetainerVersions((prev) => {
      if (prev.length === 0) return prev;
      const maxId = Math.max(...prev.map((r) => r.id));
      return prev.map((r) => r.id === maxId
        ? { ...r, status: state === "signed" ? "Signed" : "Awaiting Signature", signedDate: state === "signed" ? (r.signedDate || "Jun 12, 2026") : r.signedDate, signedDocName: state === "signed" ? (r.signedDocName || "No signed document uploaded") : r.signedDocName }
        : r);
    });
  };

  // ── Status filters ──
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [docSearch, setDocSearch] = useState("");
  // Statuses of what the current Documents sub-tab lists: case documents, or
  // media files by their file check.
  const mediaStatuses = [...media.videos.map((v) => v.file), ...media.sets.flatMap((x) => x.files)].map((f) => mediaDocStatus(mediaFileStatus(f)));
  const listStatuses = documentsSubTab === "media" ? mediaStatuses : sharedDocs.map((d) => d.status);
  const filterCount = (f: DocFilter) => listStatuses.filter((st) => inFilter(st, f)).length;
  // New activity: documents whose current status the attorney has not seen.
  const unseenDocs = sharedDocs.filter(isUnseen);
  const hasNew = (f: DocFilter) => f !== "all" && unseenDocs.some((d) => inFilter(d.status, f));
  const DOC_FILTERS: { key: DocFilter; label: string }[] = [
    { key: "all", label: "All Documents" },
    { key: "processing", label: "Processing" },
    { key: "processed", label: "Processed" },
    { key: "review", label: "Needs Review" },
    { key: "failed", label: "Failed" },
  ];
  const matchesSearch = (name: string) => !docSearch.trim() || name.toLowerCase().includes(docSearch.trim().toLowerCase());
  const visibleDoc = (d: CaseDocument) => inFilter(d.status, docFilter) && matchesSearch(d.name);
  const visibleDocCount = sharedDocs.filter(visibleDoc).length;
  const unseenInFilter = unseenDocs.filter((d) => inFilter(d.status, docFilter));
  const organizedCount = classifiedCategories.filter((c) => c.name !== "General Documents").reduce((n, c) => n + c.docs.length, 0);
  const reviewCount = sharedDocs.filter((d) => d.status === "Attorney Review Required").length;
  const runningCount = sharedDocs.filter((d) => !processingFinished(d)).length;
  const failedCount = sharedDocs.filter((d) => d.status === "Failed").length;

  // ── Received documents: what the plaintiff side sent in ──
  // Plaintiff-sourced case documents only — attorney uploads and media files
  // are not received documents. Senders come from the intake request each
  // submission arrived with, otherwise from the case record.
  const [receivedOpen, setReceivedOpen] = useState(false);
  const receivedDocs = sharedDocs.filter((d) => {
    const kind = fileKind(d.name);
    return d.source === "Plaintiff" && kind !== "image" && kind !== "video";
  });
  const receivedTimes = receivedDocs.map((d) => Date.parse(d.receivedAt ?? d.date)).filter(Number.isFinite);
  const lastReceived = receivedTimes.length
    ? new Date(Math.max(...receivedTimes)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : undefined;
  const receivedFrom = [...new Set(receivedDocs.map((d) =>
    (d.requestId && allStoredRequests.find((r) => r.id === d.requestId)?.plaintiff) || data.plaintiff || "",
  ).filter(Boolean))];
  const receivedSummaryCard = (
    <div id="received-summary" className="bg-white border border-line rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 flex-wrap px-5 py-3">
        <dl className="flex flex-1 flex-wrap items-start gap-y-3 divide-x divide-[#EEF3F6] min-w-0 -ml-5">
          <div className="px-5">
            <dt className="eyebrow mb-1">Received</dt>
            <dd className="text-sm font-semibold text-ink whitespace-nowrap">
              {receivedDocs.length === 0
                ? <span className="font-normal text-[#8A98A3]">Not yet received</span>
                : <>{lastReceived ?? "Received"}{receivedTimes.length > 1 && <span className="font-normal text-[#5B6B78]"> · latest</span>}</>}
            </dd>
          </div>
          <div className="px-5 min-w-0">
            <dt className="eyebrow mb-1">Received From</dt>
            <dd className="text-sm font-semibold text-ink truncate">
              {receivedFrom.length
                ? <>{receivedFrom.join(", ")} <span className="font-normal text-[#5B6B78]">· Plaintiff</span></>
                : <span className="font-normal text-[#8A98A3]">{receivedDocs.length ? "Not recorded" : "—"}</span>}
            </dd>
          </div>
          <div className="px-5">
            <dt className="eyebrow mb-1">Received Documents</dt>
            <dd className="text-sm font-semibold text-ink">{receivedDocs.length}</dd>
          </div>
        </dl>
        <button
          onClick={() => setReceivedOpen((o) => !o)}
          disabled={receivedDocs.length === 0}
          title={receivedDocs.length === 0 ? "No documents have been received yet" : undefined}
          aria-expanded={receivedOpen}
          aria-controls="received-list"
          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-line bg-white text-deep text-xs font-semibold hover:bg-wash transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          {receivedOpen ? "Hide" : "View"}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${receivedOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
        </button>
      </div>
      {receivedOpen && receivedDocs.length > 0 && (
        <ul id="received-list" className="border-t border-line divide-y divide-line">
          {receivedDocs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <span className="flex items-center gap-2 min-w-0 mono-ref text-ink">
                <FileTypeIcon name={doc.name} />
                <span className="truncate">{doc.name}</span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[#5B6B78] whitespace-nowrap hidden sm:inline">{doc.receivedAt ? formatShortDate(doc.receivedAt) : doc.date}</span>
                <span className={`pill whitespace-nowrap ${DOC_STATUS_PILL[doc.status]}`}>
                  {doc.status === "Processing" && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
                  {doc.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // The status filters and search — shown below the processing summary on case
  // evidence, and above the media list.
  const statusFilterBar = sharedDocs.length > 0 || documentsSubTab === "media" ? (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div role="tablist" aria-label="Filter by status" className="flex-1 min-w-0 rounded-xl border border-line bg-white p-1 flex items-center gap-1 overflow-x-auto">
                          {[...DOC_FILTERS, ...(filterCount("reviewed") > 0 || docFilter === "reviewed" ? [{ key: "reviewed" as DocFilter, label: "Reviewed" }] : [])].map((f) => {
                            const on = docFilter === f.key;
                            return (
                              <button
                                key={f.key}
                                role="tab"
                                aria-selected={on}
                                onClick={() => setDocFilter(f.key)}
                                className={`relative flex-1 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                  on ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"
                                }`}
                              >
                                {f.label} <span className={on ? "text-white/80" : "text-[#8A98A3]"}>({filterCount(f.key)})</span>
                                {documentsSubTab !== "media" && hasNew(f.key) && (
                                  <span aria-label="New activity" title="New activity" className={`absolute top-1 right-1.5 w-2 h-2 rounded-full ${on ? "bg-white" : "bg-[#F59E0B]"}`} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {documentsSubTab !== "media" && (
                          <div className="relative w-full sm:w-56">
                            <Search className="w-4 h-4 text-[#8A98A3] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                            <input
                              value={docSearch}
                              onChange={(e) => setDocSearch(e.target.value)}
                              placeholder="Search documents"
                              aria-label="Search documents by name"
                              className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-white text-sm focus:outline-none focus:border-brand"
                            />
                          </div>
                        )}
                      </div>
                      {documentsSubTab !== "media" && unseenInFilter.length > 0 && (
                        <div className="flex justify-end text-xs">
                          <button
                            onClick={() => unseenInFilter.forEach((d) => patchDoc(d.id, { seenStatus: d.status }))}
                            className="font-semibold text-deep hover:underline"
                          >
                            Mark {unseenInFilter.length} as seen
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null;

  // ── Intake request progress — read from the stored request records ──
  // What satisfies a requested document: the categories its files fall under,
  // or, for the missing-evidence items, what that check looks for. A name with
  // no rule is never marked received automatically.
  const REQUIREMENT_MATCH: Record<string, (d: CaseDocument, category: string) => boolean> = {
    ...Object.fromEntries(Object.entries(REQUESTED_DOC_CATEGORIES).map(([k, cats]) => [k, (_d: CaseDocument, c: string) => cats.includes(c)])),
    "Police Report Addendum": (d) => d.name.toLowerCase().includes("addendum"),
    "Insurance Policy": (_d, c) => c === "Insurance Documents",
  };
  const categoryOf = (d: CaseDocument) => d.category ?? classifyDocuments([d]).find((c) => c.docs.length > 0)?.name ?? "General Documents";
  // Fulfilment — has the requested item arrived? Separate from file processing.
  type ReqState = "Received" | "On file" | "Partially received" | "Uploaded, not submitted" | "Not received" | "Not matched";
  // Parts a requirement still needs even once files for it are on file — the
  // case file check names them (a police report without its addendum).
  const REQUIREMENT_PARTS: Record<string, string[]> = {
    "Police Report": ["Police Report Addendum"],
  };
  interface ReqFile { key: string; name: string; at?: string; source: string; status?: CaseDocument["status"]; doc?: CaseDocument }
  interface ReqRow { name: string; kind: "document" | "media"; state: ReqState; files: ReqFile[]; missingParts?: string[]; viaCaseFile?: boolean }
  const REQ_STATE_LABEL: Record<ReqState, string> = {
    Received: "Received", "On file": "Not received", "Partially received": "Partially received", "Uploaded, not submitted": "Not received",
    "Not received": "Not received", "Not matched": "Can't be determined",
  };
  const REQ_STATE_PILL: Record<ReqState, string> = {
    Received: "pill pill-complete", "On file": "pill pill-risk", "Partially received": "pill pill-progress", "Uploaded, not submitted": "pill pill-risk",
    "Not received": "pill pill-risk", "Not matched": "pill pill-neutral",
  };
  const REQ_STATE_NOTE: Partial<Record<ReqState, string>> = {
    "Uploaded, not submitted": "The client has uploaded a file but not submitted it yet.",
    "Not matched": "This item can't be matched to files automatically — check the Documents tab.",
    "Not received": "No file received yet.",
    "On file": "Not received from the client — the file on record is the attorney's own upload.",
  };
  const REQUEST_STATUS_PILL: Record<string, string> = {
    Completed: "pill pill-complete", "Partially received": "pill pill-progress", "In progress": "pill pill-progress",
    Opened: "pill pill-neutral", Sent: "pill pill-neutral", Cancelled: "pill pill-risk", Expired: "pill pill-risk",
  };
  const atLabel = (at?: string) => (!at ? "" : at.includes("T") ? sentLabel(at) : at);

  const progressOf = (r: IntakeRequest) => {
    const submitted = (r.submissions?.length ?? 0) > 0;
    // Answered before submissions were recorded (the sample cases): the
    // case's own documents stand in for the client's answer, labelled as such.
    const legacy = !submitted && r.status === "Completed";
    const sentIds = new Set((r.submissions ?? []).flatMap((s) => s.documentIds));
    const removed = new Set(r.removedUploadIds ?? []);
    const clientDocs = sharedDocs.filter((d) => d.requestId === r.id);
    const pending = r.uploads.filter((u) => !sentIds.has(u.id) && !removed.has(u.id));
    const attorneyDocs = sharedDocs.filter((d) => d.source === "Attorney");
    const fileOf = (d: CaseDocument, source: string): ReqFile => ({ key: d.id, name: d.name, at: d.receivedAt ?? d.date, source, status: d.status, doc: d });
    const rows: ReqRow[] = r.requestedDocs.map((name): ReqRow => {
      const match = REQUIREMENT_MATCH[name];
      if (!match) return { name, kind: "document", state: "Not matched", files: [] };
      const hits = (ds: CaseDocument[]) => ds.filter((d) => match(d, categoryOf(d)));
      if (legacy) {
        // Answered before the app recorded which files came through a request:
        // there is no request-to-file link, so the matching files on the case
        // file fulfil the item, whoever uploaded them, and the row says so.
        // Requests with recorded submissions count only the client's files.
        const fromClient = hits(sharedDocs.filter((d) => d.source === "Plaintiff"));
        const fromAttorney = hits(attorneyDocs);
        const files = [...fromClient.map((d) => fileOf(d, "Client")), ...fromAttorney.map((d) => fileOf(d, "Attorney upload"))];
        return { name, kind: "document", state: files.length ? "Received" : "Not received", files, viaCaseFile: files.length > 0 && fromClient.length === 0 };
      }
      const got = hits(clientDocs);
      if (got.length) return { name, kind: "document", state: "Received", files: got.map((d) => fileOf(d, "Client submission")) };
      const pend = pending.filter((u) => {
        const asDoc: CaseDocument = { id: u.id, name: u.name, source: "Plaintiff", date: "", status: "Queued" };
        return match(asDoc, categoryOf(asDoc));
      });
      if (pend.length) return { name, kind: "document", state: "Uploaded, not submitted", files: pend.map((u) => ({ key: u.id, name: u.name, at: u.uploadedAt, source: "Client upload" })) };
      const onFile = hits(attorneyDocs);
      if (onFile.length) return { name, kind: "document", state: "On file", files: onFile.map((d) => fileOf(d, "Attorney upload")) };
      return { name, kind: "document", state: "Not received", files: [] };
    });
    // A requirement with files on file is still outstanding while a part of it
    // is missing from the case file.
    rows.forEach((row, i) => {
      if (row.state !== "Received") return;
      const parts = (REQUIREMENT_PARTS[row.name] ?? []).filter((t) => missingEvidence.some((m) => m.title === t));
      if (parts.length) rows[i] = { ...row, state: "Partially received", missingParts: parts };
    });
    // The video & photos it asked for, from the media records sent with it.
    for (const o of selectedMediaOptions(r.requestedMedia)) {
      const files: ReqFile[] = o.key === "videos"
        ? media.videos.filter((v) => v.source === "Client" && v.requestId === r.id)
            .map((v) => ({ key: v.id, name: v.file.name, at: v.uploadedAt, source: "Client submission", status: mediaDocStatus(mediaFileStatus(v.file)) }))
        : media.sets.filter((x) => x.source === "Client" && x.requestId === r.id && x.kind === (o.key === "scenePhotos" ? "scene" : "medical"))
            .flatMap((x) => x.files.map((f) => ({ key: `${x.id}-${f.number}`, name: f.name, at: x.uploadedAt, source: "Client submission", status: mediaDocStatus(mediaFileStatus(f)) })));
      rows.push({ name: o.title, kind: "media", state: files.length ? "Received" : "Not received", files });
    }
    const total = rows.length;
    // An item is received only when the client's own files fulfil it.
    const satisfied = rows.filter((x) => x.state === "Received").length;
    const outstanding = rows.filter((x) => x.state !== "Received");
    const pct = total ? Math.round((satisfied / total) * 100) : 0;
    const responded = submitted || legacy;
    const status = r.status === "Cancelled" || r.status === "Expired" ? r.status
      : responded ? (outstanding.length ? "Partially received" : "Completed")
      : pending.length ? "In progress" : r.openedAt ? "Opened" : "Sent";

    // Only what the record holds — nothing assumed, no invented times.
    const recipient = (r.deliveryMethod === "sms" ? r.recipientPhone : r.recipientEmail) ?? r.plaintiff;
    const events: { at?: string; title: string; detail?: string }[] = [];
    events.push({
      at: r.createdAt,
      title: r.followUpOf ? `Follow-up to ${r.followUpOf} created and sent` : "Request created and sent",
      detail: `${r.deliveryMethod === "sms" ? "SMS" : "Email"} to ${recipient} · ${r.requestedDocs.length} ${r.requestedDocs.length === 1 ? "document" : "documents"} requested`,
    });
    if (r.lastModifiedAt) events.push({ at: r.lastModifiedAt, title: `Request modified and re-sent (v${r.version})` });
    if (r.lastSentAt && r.lastSentAt !== r.createdAt && r.lastSentAt !== r.lastModifiedAt) events.push({ at: r.lastSentAt, title: "Request re-sent", detail: "Only the latest re-send is recorded" });
    if (r.openedAt) events.push({ at: r.openedAt, title: "Client opened the request link" });
    const firstUpload = [...r.uploads].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))[0];
    if (firstUpload) events.push({ at: firstUpload.uploadedAt, title: "Client started uploading" });
    (r.submissions ?? []).forEach((s, i) => {
      const m = (s.media?.videoIds.length ?? 0) + (s.media?.setIds.length ?? 0);
      events.push({
        at: s.submittedAt,
        title: i === 0 ? "Documents received" : "Additional documents submitted",
        detail: `${s.documentIds.length} ${s.documentIds.length === 1 ? "file" : "files"}${m ? ` · ${m} video or photo ${m === 1 ? "item" : "items"}` : ""}`,
      });
    });
    storedRequests.filter((x) => x.followUpOf === r.id).forEach((x) =>
      events.push({ at: x.createdAt, title: `Follow-up sent (${x.id})`, detail: x.requestedDocs.join(", ") }));
    if (submitted && status === "Completed") {
      events.push({ at: r.submissions![r.submissions!.length - 1].submittedAt, title: "Request completed", detail: "Every requested item has been received" });
    }
    if (legacy) events.push({ title: "Client response recorded", detail: "Recorded before submissions were tracked, so no time was recorded" });
    events.sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0));
    const notes = [...(r.submissions ?? [])].reverse().find((s) => s.notes)?.notes;
    // The files the client's answer brought: the submitted uploads (or, for an
    // answer recorded before submissions were, the case's documents).
    const receivedFiles = legacy
      ? sharedDocs.map((d) => d.name)
      : r.uploads.filter((u) => sentIds.has(u.id) && !removed.has(u.id)).map((u) => u.name);
    return { rows, total, satisfied, outstanding, pct, status, events, legacy, submitted, responded, recipient, notes, receivedFiles };
  };

  const [progressReqId, setProgressReqId] = useState<string | null>(null);
  const [requestedListOpen, setRequestedListOpen] = useState(false);
  // The response list under Client Has Responded — separate from the request's own list.
  const [receivedListOpen, setReceivedListOpen] = useState(false);
  const currentReq = storedRequests.find((r) => r.id === progressReqId) ?? storedRequests[storedRequests.length - 1];
  const cur = currentReq ? progressOf(currentReq) : null;
  const latestReq = storedRequests[storedRequests.length - 1];
  // Whether a request has actually gone out — a draft has not.
  const sentReq = storedRequests.some((r) => r.status !== "Draft");
  const latestProgress = latestReq ? progressOf(latestReq) : null;
  const openCreateRequest = () => { setIntakeModalMode("create"); setActiveModifyId(null); setEmailError(false); setShowIntakeModal(true); };
  const requestOutstanding = (r: IntakeRequest, pr: ReturnType<typeof progressOf>) =>
    openMissingRequestModal(pr.outstanding.filter((x) => x.kind === "document").flatMap((x) => x.missingParts ?? [x.name]).map((title) => ({ title })), r.id);
  // Missing from the case file and not asked for in any request yet.
  // The missing-evidence check and the request form name some items differently.
  const SAME_REQUIREMENT: Record<string, string[]> = { "Insurance Policy": ["Insurance Documents"], "Wage Loss Records": ["Employment Records"] };
  // A part of a requested requirement is outstanding under that requirement.
  const requestedParts = new Set(storedRequests.flatMap((r) => r.requestedDocs.flatMap((d) => REQUIREMENT_PARTS[d] ?? [])));
  const notYetRequested = missingEvidence.filter((m) => !requestedParts.has(m.title) &&
    !storedRequests.some((r) => [m.title, ...(SAME_REQUIREMENT[m.title] ?? [])].some((t) => r.requestedDocs.includes(t))));

  // ── The Documents processing summary, per sub-tab ──
  // Case evidence: the case documents and their file checks. Media evidence:
  // the media file checks, which have no categories to organise into.
  type SummaryTone = "done" | "running" | "problem" | "idle";
  const summaryOf = (): { tone: SummaryTone; title: string; stats: { label: string; value: number }[]; ready: string; readyOk: boolean } => {
    if (documentsSubTab === "media") {
      const n = mediaStatuses.length;
      // The same rules as the media status filters.
      const count = (f: DocFilter) => mediaStatuses.filter((st) => inFilter(st, f)).length;
      const running = count("processing");
      const done = count("processed");
      const review = count("review");
      const failed = count("failed");
      return {
        tone: n === 0 ? "idle" : failed ? "problem" : running ? "running" : "done",
        title: n === 0 ? "No media files yet"
          : running ? `Checking ${running} media ${running === 1 ? "file" : "files"}`
          : failed ? `${failed} media ${failed === 1 ? "file" : "files"} failed`
          : "Media File Checks Complete",
        stats: [
          { label: "Files", value: n },
          { label: "Checked", value: done },
          { label: "Review", value: review },
          ...(failed ? [{ label: "Failed", value: failed }] : []),
        ],
        ready: n > 0 && !running && !failed && !review ? "Checks complete" : n === 0 ? "No media" : "Not ready",
        readyOk: n > 0 && !running && !failed && !review,
      };
    }
    const n = sharedDocs.length;
    return {
      tone: n === 0 ? "idle" : processingComplete ? "done" : runningCount > 0 ? "running" : "problem",
      title: n === 0 ? "No documents yet"
        : processingComplete ? "Document Processing Complete"
        : runningCount > 0 ? `Processing ${runningCount} ${runningCount === 1 ? "document" : "documents"}`
        : `${failedCount} ${failedCount === 1 ? "document" : "documents"} failed`,
      stats: [
        { label: "Processed", value: docsFinishedOk },
        { label: "Organized", value: organizedCount },
        { label: "Review", value: reviewCount },
        ...(failedCount ? [{ label: "Failed", value: failedCount }] : []),
      ],
      ready: processingComplete ? "Ready For Analysis" : "Not ready",
      readyOk: processingComplete,
    };
  };
  const summary = summaryOf();
  const docsSummary = (
    <div id="docs-summary" className="flex items-center justify-between gap-4 flex-wrap bg-tint border border-[#9BDAEC] rounded-xl px-5 py-3">
      <div className="flex items-center gap-2">
        {summary.tone === "done" ? <CheckCircle className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
          : summary.tone === "running" ? <Loader2 className="w-4 h-4 text-deep shrink-0 animate-spin" strokeWidth={1.75} />
          : summary.tone === "problem" ? <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0" strokeWidth={1.75} />
          : <Info className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />}
        <span className="text-sm font-semibold text-deep">{summary.title}</span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        {summary.stats.map((st) => (
          <div key={st.label} className="text-center">
            <div className={`font-bold ${st.label === "Failed" && st.value ? "text-[#B91C1C]" : "text-ink"}`}>{st.value}</div>
            <div className="text-[#5B6B78]">{st.label}</div>
          </div>
        ))}
        {summary.readyOk
          ? <span className="pill pill-neutral">{summary.ready}</span>
          : <span className="pill bg-[#F1F3F5] text-[#5B6B78] border-line">{summary.ready}</span>}
      </div>
    </div>
  );

  useEffect(() => {
    if (!focusDocumentsRequest) return;
    setDocumentsSubTab("intake");
    setDocFilter("all");
    setDocSearch("");
    window.setTimeout(() => {
      document.getElementById("documents-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    onFocusDocumentsHandled?.();
  }, [focusDocumentsRequest]);

  return (
    <div className="min-h-screen bg-wash">
      {/* Context Header */}
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            {/* Back Navigation */}
            <button
              onClick={onBackToIntake}
              className="flex items-center gap-2 text-sm text-deep hover:text-ink transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to Case Intake
            </button>

            {/* Breadcrumb */}
            <div className="text-sm text-[#5B6B78] ml-auto">
              Case Intake <span className="mx-2">›</span> <span className="text-ink font-medium">{data.caseName}</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Client Intake" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto p-8 space-y-8">
        {/* Page Header + Global Presenter Control */}
        {/* SECTION 1 — Case Snapshot */}
        <div>
          <h1 className="text-[24px] font-semibold text-ink leading-tight tracking-tight mb-4">Stage 1 · Case Discovery</h1>
          <CaseSnapshot
            caseName={cardDetails.caseName ?? data.caseName}
            caseType={cardDetails.caseType}
            caseId={data.caseId}
            summary={data.summary}
            insuredName={cardDetails.insuredName}
            insuredEmail={cardDetails.insuredEmail}
            insuredPhone={cardDetails.insuredPhone}
            policyName={cardDetails.policyName}
            policyNumber={cardDetails.policyNumber}
            insurerName={cardDetails.insurerName}
            insurerJurisdiction={cardDetails.insurerJurisdiction}
            onEdit={() => setEditingDetails(true)}
          />
          {editingDetails && (
            <EditCaseDetailsDialog
              caseId={data.caseId}
              initial={cardDetails}
              onClose={() => setEditingDetails(false)}
              onSave={(next) => {
                saveCaseDetails(data.caseId, next);
                setEditingDetails(false);
              }}
            />
          )}
        </div>

        {/* SECTION 2 — Documents */}
        <div className="space-y-3">
          <input ref={docInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
          <div id="documents-section" className="lg-card overflow-hidden scroll-mt-[150px]">
            <div className="w-full flex items-center justify-between gap-4 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="card-title">Received Documents</span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-deep text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                Upload Documents
                <input type="file" multiple className="hidden" onChange={handleFileInputChange} />
              </label>
            </div>
            <div className="border-t border-line p-6 bg-offwhite">
              <div className="space-y-6">
                {/* UPLOAD SUCCESS FEEDBACK */}
                {showUploadSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-800 mb-1">
                          {uploadedFileNames.length} file{uploadedFileNames.length > 1 ? "s" : ""} uploaded successfully
                        </p>
                        <ul className="space-y-0.5">
                          {uploadedFileNames.map((name) => (
                            <li key={name} className="text-xs text-green-700 font-mono truncate">{name}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        onClick={() => setShowUploadSuccess(false)}
                        className="text-green-400 hover:text-green-600 transition-colors"
                      >
                        <X className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                )}

                {receivedSummaryCard}

                {/* PROCESSING SUMMARY — counted from the selected tab's own records */}
                {docsSummary}

                {/* Documents Sub-Tabs */}
                <div>
                  <div className="flex items-center gap-1 mb-4">
                    {([["intake", "Case evidence"], ["media", "Media evidence"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setDocumentsSubTab(val)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          documentsSubTab === val
                            ? "bg-tint text-deep"
                            : "text-[#5B6B78] hover:text-ink hover:bg-wash"
                        }`}
                      >
                        {label}
                        {val === "media" && <NewBadge />}
                      </button>
                    ))}
                  </div>

                  <div>
                    {documentsSubTab === "media" ? (
                      <>
                        {statusFilterBar}
                        <MediaEvidencePanel caseId={data.caseId} documents={sharedDocs} onUpload={openMediaUpload} statusFilter={docFilter} />
                      </>
                    ) : (
                      <div className="space-y-4">
                        {sharedDocs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 text-center">
                            <Upload className="w-8 h-8 text-[#9BDAEC] mb-3" strokeWidth={1.75} />
                            <p className="text-sm font-medium text-ink mb-1">No evidence has been received yet.</p>
                            <p className="text-xs text-[#5B6B78] mb-4">Upload documents manually or wait for the plaintiff to complete the intake request.</p>
                            <button
                              onClick={() => docInputRef.current?.click()}
                              className="px-4 py-2 bg-brand hover:bg-deep text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              Upload Documents
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Categorized document sections */}
                            {statusFilterBar}

                            {visibleDocCount === 0 && (
                              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-line rounded-xl bg-white">
                                <FileText className="w-8 h-8 text-[#9BDAEC] mb-3" strokeWidth={1.75} />
                                <p className="text-sm text-[#5B6B78]">No documents match {docSearch.trim() ? `"${docSearch.trim()}" in ` : ""}this filter.</p>
                                <button onClick={() => { setDocFilter("all"); setDocSearch(""); }} className="text-xs font-semibold text-deep hover:underline mt-1">Show all documents</button>
                              </div>
                            )}
                            {classifiedCategories.map((rawCategory) => ({ ...rawCategory, docs: rawCategory.docs.filter(visibleDoc), total: rawCategory.docs.length })).filter((c) => c.docs.length > 0).map((category) => (
                              <div key={category.name} className="border border-line rounded-xl overflow-hidden">
                                <button
                                  onClick={() => toggleCategory(category.name)}
                                  className="w-full flex items-center justify-between px-5 py-3 bg-wash hover:bg-tint transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-ink">{category.name}</span>
                                    <span className="text-xs font-medium text-[#5B6B78] bg-white border border-line px-2 py-0.5 rounded-full">{category.docs.length === category.total ? category.total : `${category.docs.length} of ${category.total}`}</span>
                                  </div>
                                  <ChevronDown className={`w-4 h-4 text-[#5B6B78] transition-transform ${isCategoryExpanded(category.name) ? "" : "-rotate-90"}`} strokeWidth={1.75} />
                                </button>
                                {isCategoryExpanded(category.name) && (
                                  <div className="overflow-x-auto">
                                  <table className="w-full min-w-[860px] table-fixed">
                                    {/* The same column widths in every category, so rows line up. */}
                                    <colgroup>
                                      <col />
                                      <col className="w-[64px]" />
                                      <col className="w-[96px]" />
                                      <col className="w-[112px]" />
                                      <col className="w-[200px]" />
                                      <col className="w-[152px]" />
                                    </colgroup>
                                    <thead className="bg-white border-b border-line">
                                      <tr>
                                        <th className="text-left px-5 py-2.5 eyebrow">File Name</th>
                                        <th className="text-left px-5 py-2.5 eyebrow">Type</th>
                                        <th className="text-left px-5 py-2.5 eyebrow">Source</th>
                                        <th className="text-left px-5 py-2.5 eyebrow">Date</th>
                                        <th className="text-left px-5 py-2.5 eyebrow">Status</th>
                                        <th className="text-right px-5 py-2.5 eyebrow">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line bg-white">
                                      {category.docs.map((doc) => {
                                        return (
                                          <tr
                                            key={doc.id}
                                            className="transition-all hover:bg-wash"
                                          >
                                            <td className="px-5 py-3 align-middle">
                                              <span className="flex items-start gap-2 mono-ref text-ink min-w-0">
                                                <FileTypeIcon name={doc.name} />
                                                <span className="min-w-0 [overflow-wrap:anywhere]">{doc.name.split(/(?<=[_.-])/).map((part, i) => <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>)}</span>
                                                {isUnseen(doc) && <span aria-label="New activity" title="New activity" className="w-2 h-2 mt-1.5 rounded-full bg-[#F59E0B] shrink-0" />}
                                              </span>
                                              {(doc.checkError || doc.reviewReason || doc.checkResult) && (
                                                <div className={`text-xs mt-0.5 ${doc.status === "Failed" ? "text-[#B91C1C]" : doc.status === "Attorney Review Required" ? "text-[#B45309]" : "text-[#5B6B78]"}`}>
                                                  {doc.status === "Failed" ? doc.checkError : doc.status === "Attorney Review Required" ? doc.reviewReason : doc.checkResult}
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-5 py-3 align-middle"><FileTypeTag name={doc.name} /></td>
                                            <td className="px-5 py-3 align-middle text-sm text-[#5B6B78]">{doc.source}</td>
                                            <td className="px-5 py-3 align-middle text-sm text-[#5B6B78] whitespace-nowrap">{doc.date}</td>
                                            <td className="px-5 py-3 align-middle">
                                              {/* The status, and the step it calls for — kept here so the
                                                  Actions column is identical on every row. */}
                                              <div className="flex flex-col items-start gap-1.5">
                                                <span className={`pill whitespace-nowrap ${DOC_STATUS_PILL[doc.status]}`}>
                                                  {doc.status === "Processing" && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
                                                  {doc.status}
                                                </span>
                                                  {doc.status === "Failed" && (
                                                    <button onClick={() => void retryDoc(doc)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[#FDE6C8] text-[#B45309] text-xs font-semibold hover:bg-[#FFF7ED]">
                                                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Retry
                                                    </button>
                                                  )}
                                                  {docFilter === "review" && doc.status === "Attorney Review Required" && (
                                                    <button onClick={() => openReview(doc)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${doc.status === "Attorney Review Required" ? "border-[#FDE6C8] text-[#B45309] hover:bg-[#FFF7ED]" : "border-line text-deep hover:bg-tint"}`}>
                                                      <ClipboardCheck className="w-3.5 h-3.5" strokeWidth={1.75} /> Review
                                                    </button>
                                                  )}
                                              </div>
                                            </td>
                                            <td className="px-5 py-3 align-middle">
                                              <RowActionGroup name={doc.name} onEdit={() => openEdit(doc)} onDelete={() => { setDeleteDoc(doc); setDeleteError(null); }}>
                                                  <DocActions
                                                    size="row"
                                                    onPreview={() => handlePreviewDocument(doc)}
                                                    onInsights={() => handleOpenInsights(doc)}
                                                    onDownload={() => handleDownloadDocument(doc)}
                                                    disabled={{
                                                      insights: !processingFinished(doc) ? "Available once processing finishes" : doc.status === "Failed" ? "Processing failed — retry first" : undefined,
                                                      download: doc.history && !doc.storageKey ? "The original file is not stored in this browser" : !doc.history ? "The original file is not stored in this prototype" : undefined,
                                                    }}
                                                  />
                                              </RowActionGroup>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                  </div>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Evidence completeness confirmation (gaps are surfaced by the alert above) */}
                {documentsSubTab === "intake" && sharedDocs.length > 0 && missingEvidence.length === 0 && (
                  <div className="lg-card p-6">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-3" strokeWidth={1.75} />
                      <p className="text-sm font-semibold text-ink mb-1">No Missing Evidence Identified</p>
                      <p className="text-xs text-[#5B6B78]">All expected evidence has been received and processed.</p>
                      <span className="mt-3 pill pill-complete">
                        <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Evidence Collection Complete
                      </span>
                    </div>
                  </div>
                )}
              </div>
              </div>
          </div>
          <NextStepBox
            text="Documents collected. Continue to Stage 2 to analyze the evidence and build the case."
            ctaLabel="Proceed to Analysis"
            onClick={onContinue}
          />
        </div>{/* end section 2 — documents */}
      </div>{/* end page container */}

      {/* Intake Form Modal */}
      {/* Upload Video & Photos — one modal for every entry point */}
      <VideoPhotoUploadModal
        open={mediaModalOpen}
        caseId={data.caseId}
        uploadedBy={INTAKE_SENDER.name}
        onClose={() => setMediaModalOpen(false)}
        onViewMedia={viewMediaEvidence}
        onUploaded={setMediaUploadResult}
      />

      {showIntakeModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="section-header">
                  {intakeModalMode === "modify" ? "Modify Intake Request" : intakeModalMode === "additional" ? "Create Additional Document Request" : "Create Intake Request"}
                </h2>
                <button
                  onClick={() => setShowIntakeModal(false)}
                  className="p-2 hover:bg-tint rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Delivery Method */}
              <div>
                <h3 className="card-title mb-3">Send To</h3>
                {!hasContact ? (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" strokeWidth={1.75} />
                    <p className="text-sm text-amber-700">
                      No contact information is available for this client. Please update client contact information before sending an intake request.
                    </p>
                  </div>
                ) : (
                  <div className="border border-line rounded-xl divide-y divide-line">
                    {hasEmail && (
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-wash transition-colors">
                        <input
                          type="radio"
                          name="intakeDelivery"
                          value="email"
                          checked={deliveryMethod === "email"}
                          onChange={() => setDeliveryMethod("email")}
                          className="w-4 h-4 accent-brand cursor-pointer"
                        />
                        <Mail className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink mb-0.5">Email</div>
                          {editingEmail ? (
                            <input
                              type="email"
                              value={editableEmail}
                              onChange={(e) => setEditableEmail(e.target.value)}
                              autoFocus
                              className="w-full text-xs border border-brand rounded-md px-2 py-1 text-ink focus:outline-none"
                            />
                          ) : (
                            <div className="text-xs text-[#5B6B78]">{editableEmail}</div>
                          )}
                        </div>
                        {editingEmail ? (
                          <button
                            onClick={() => setEditingEmail(false)}
                            className="text-xs font-medium text-deep hover:text-ink shrink-0 transition-colors"
                          >
                            Done
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingEmail(true)}
                            className="text-xs font-medium text-deep hover:text-ink shrink-0 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                    {hasPhone && (
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-wash transition-colors">
                        <input
                          type="radio"
                          name="intakeDelivery"
                          value="sms"
                          checked={deliveryMethod === "sms"}
                          onChange={() => setDeliveryMethod("sms")}
                          className="w-4 h-4 accent-brand cursor-pointer"
                        />
                        <MessageSquare className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink mb-0.5">SMS</div>
                          {editingPhone ? (
                            <input
                              type="tel"
                              value={editablePhone}
                              onChange={(e) => setEditablePhone(e.target.value)}
                              autoFocus
                              className="w-full text-xs border border-brand rounded-md px-2 py-1 text-ink focus:outline-none"
                            />
                          ) : (
                            <div className="text-xs text-[#5B6B78]">{editablePhone}</div>
                          )}
                        </div>
                        {editingPhone ? (
                          <button
                            onClick={() => setEditingPhone(false)}
                            className="text-xs font-medium text-deep hover:text-ink shrink-0 transition-colors"
                          >
                            Done
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingPhone(true)}
                            className="text-xs font-medium text-deep hover:text-ink shrink-0 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Previously Requested — only for additional mode */}
              {intakeModalMode === "additional" && (
                <div className="lg-zone p-4">
                  <h3 className="text-sm font-semibold text-ink mb-3">Previously Requested</h3>
                  <div className="space-y-1.5">
                    {(intakeRequests[0]?.requestedDocs ?? documents.filter((d) => d.enabled).map((d) => d.name)).map((doc) => (
                      <div key={doc} className="flex items-center gap-2 text-sm text-[#5B6B78]">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" strokeWidth={1.75} /> {doc}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Required Documents */}
              <div>
                <h3 className="card-title mb-4">
                  {intakeModalMode === "additional" ? "Additional Documents to Request" : "Required Documents"}
                </h3>
                <div className="space-y-3">
                  {documents.map((doc, index) => (
                    <div key={doc.name} className="flex items-center gap-3">
                      <button
                        onClick={() => toggleDocument(index)}
                        disabled={doc.required}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          doc.enabled
                            ? "bg-brand border-brand"
                            : "bg-white border-line hover:border-soft"
                        } ${doc.required ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {doc.enabled && <Check className="w-3 h-3 text-white" strokeWidth={1.75} />}
                      </button>
                      <span className={`text-sm ${doc.enabled ? "text-ink" : "text-[#5B6B78]"}`}>
                        {doc.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video & Photos — optional; each ticked kind gets its own upload area on the link */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="card-title">Video &amp; Photos</h3>
                  <span className="text-sm text-[#5B6B78]">(optional)</span>
                  <NewBadge />
                </div>
                <p className="secondary-text mb-4">
                  Tick what you want the client to send. The link will show a separate upload area for each, and the message below is updated to ask for them. The client can add as many videos as they have, several sets of photos and several scans.
                </p>
                <div className="space-y-2.5">
                  {MEDIA_OPTIONS.map((o) => {
                    const on = requestedMedia[o.key];
                    const Icon = MEDIA_ICON[o.key];
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => setRequestedMedia((m) => ({ ...m, [o.key]: !m[o.key] }))}
                        className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                          on ? "border-brand bg-tint" : "border-line bg-white hover:border-soft"
                        }`}
                      >
                        <span className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${on ? "bg-brand border-brand" : "bg-white border-line"}`}>
                          {on && <Check className="w-3 h-3 text-white" strokeWidth={1.75} />}
                        </span>
                        <Icon className="w-4 h-4 text-deep shrink-0 mt-0.5" strokeWidth={1.75} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium ${on ? "text-ink" : "text-ink"}`}>{o.title}</span>
                          <span className="block text-xs text-[#5B6B78] mt-0.5">{o.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Additional Instructions */}
              <div>
                <h3 className="card-title mb-4">Additional Instructions</h3>
                <textarea
                  rows={4}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Provide any additional information or supporting documents that may help evaluate your claim."
                  className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand resize-none transition-all"
                />
              </div>

              {/* Message Preview — exactly what the client's link will say */}
              <div>
                <h3 className="card-title mb-4">Message Preview</h3>
                <div className="lg-zone lg-zone-grey p-4 text-sm text-ink leading-relaxed whitespace-pre-line">
                  {intakeMessageText({
                    plaintiff: data.plaintiff,
                    senderName: INTAKE_SENDER.name,
                    senderFirm: INTAKE_SENDER.firm,
                    docs: intakeModalMode === "additional" ? ADDITIONAL_DOCS : documents.filter((d) => d.enabled).map((d) => d.name),
                    media: requestedMedia,
                    instructions: additionalInstructions,
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowIntakeModal(false); setEmailError(false); setIntakeModalMode("create"); setActiveModifyId(null); }}
                className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleSendRequest}
                disabled={!hasContact}
                className="bg-brand hover:bg-deep text-white border-0 gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {intakeModalMode === "modify" ? "Save Changes" : intakeModalMode === "additional" ? "Send Request" : "Send Request"}
                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resend Confirmation Modal */}
      {showResendModal && (() => {
        const req = intakeRequests.find((r) => r.id === resendingId) ?? intakeRequests[0];
        return (
          <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-line">
                <h2 className="card-title">Resend Intake Request</h2>
                <button onClick={() => setShowResendModal(false)} className="p-1.5 hover:bg-tint rounded-lg transition-colors">
                  <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
              {req && (
                <div className="p-6 space-y-4">
                  <p className="secondary-text">This will resend the existing intake request to the recipient below.</p>
                  <div className="lg-zone divide-y divide-line">
                    <div className="px-4 py-3"><div className="eyebrow mb-0.5">Recipient</div><div className="text-sm font-semibold text-ink">{req.recipient}</div></div>
                    <div className="px-4 py-3"><div className="eyebrow mb-0.5">Delivery Method</div><div className="text-sm font-semibold text-ink capitalize">{req.deliveryMethod}</div></div>
                    <div className="px-4 py-3"><div className="eyebrow mb-0.5">Requested Documents</div><div className="text-sm font-semibold text-ink">{req.requestedDocs.join(", ")}</div></div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 px-6 py-4 bg-wash border-t border-line">
                <button onClick={() => setShowResendModal(false)} className="px-4 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-all">Cancel</button>
                <button onClick={handleConfirmResend} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-deep transition-all flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} /> Resend Request
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View Submission Modal */}
      {showViewSubmissionModal && (() => {
        // The answer to exactly this request, from its own records.
        const req = intakeRequests.find((r) => r.id === viewingSubmissionId);
        if (!req) return null;
        const answer = answerFor(req);
        const got = receivedMediaFor(req.id);
        const requested = req.requestedDocs.length;
        const completion = requested > 0 ? Math.round(((requested - Math.min(answer.missing.length, requested)) / requested) * 100) : 100;
        return (
          <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-sm overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-5 border-b border-line shrink-0">
                <div>
                  <h2 className="card-title">Submission Details</h2>
                  <p className="mono-ref mt-0.5">
                    {req.id} · {answer.submittedAt ? `Submitted ${sentLabel(answer.submittedAt)}` : "Submission date not on record"}
                  </p>
                </div>
                <button onClick={() => setShowViewSubmissionModal(false)} className="p-1.5 hover:bg-tint rounded-lg transition-colors">
                  <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Documents Received", value: String(answer.docs.length), color: "text-ink" },
                    { label: "Missing Documents", value: String(answer.missing.length), color: answer.missing.length ? "text-amber-600" : "text-ink" },
                    { label: "Completion", value: `${completion}%`, color: completion === 100 ? "text-green-600" : "text-amber-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-wash border border-line rounded-xl p-4 text-center">
                      <div className={`kpi-value ${color} mb-1`}>{value}</div>
                      <div className="text-xs text-[#5B6B78]">{label}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3">Received Documents</h3>
                  {answer.docs.length > 0 ? (
                    <div className="border border-line rounded-xl divide-y divide-line">
                      {answer.docs.map((doc) => (
                        <div key={doc} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileTypeIcon name={doc} className="w-4 h-4 text-[#5B6B78] shrink-0" />
                            <span className="mono-ref text-ink truncate">{doc}</span>
                            <FileTypeTag name={doc} />
                          </div>
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" strokeWidth={1.75} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="secondary-text">No documents were sent with this submission.</p>}
                </div>
                {answer.missing.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-2">Still Missing</h3>
                    <ul className="space-y-1">
                      {answer.missing.map((m) => <li key={m} className="text-sm text-amber-700">• {m}</li>)}
                    </ul>
                  </div>
                )}
                {got.files > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-2">Video &amp; Photos</h3>
                    <p className="secondary-text">
                      {got.videos} {got.videos === 1 ? "video" : "videos"} · {got.sets} photo {got.sets === 1 ? "set" : "sets"} ({got.photos} {got.photos === 1 ? "photo" : "photos"}){" "}
                      <button onClick={() => { setShowViewSubmissionModal(false); viewMediaEvidence(); }} className="font-semibold text-deep hover:underline">View in Media evidence →</button>
                    </p>
                  </div>
                )}
                {answer.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-2">Client Notes</h3>
                    <p className="text-sm text-ink whitespace-pre-line">{answer.notes}</p>
                  </div>
                )}
                {answer.confirmed && (
                  <p className="text-xs text-[#5B6B78] flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" strokeWidth={1.75} /> The client confirmed the documents are accurate and relevant to their case.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 bg-wash border-t border-line shrink-0">
                <button onClick={() => setShowViewSubmissionModal(false)} className="px-4 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-all">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="section-header">Send Follow-up Request</h2>
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="p-2 hover:bg-tint rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Recipient */}
              <div>
                <h3 className="card-title mb-2">Recipient</h3>
                <div className="text-sm text-ink">{recipientEmail}</div>
              </div>

              {/* Missing Documents */}
              <div>
                <h3 className="card-title mb-3">Missing Documents</h3>
                <div className="space-y-2">
                  {missingDocuments.map((doc) => (
                    <div key={doc} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded border bg-brand border-brand flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={1.75} />
                      </div>
                      <span className="text-sm text-ink">{doc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <h3 className="card-title mb-3">Message</h3>
                <textarea
                  rows={8}
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink focus:outline-none focus:border-brand resize-none transition-all"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleSendFollowUp}
                className="bg-brand hover:bg-deep text-white border-0"
              >
                Send Follow-up
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Retainer Modal */}
      {showSendRetainerModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="section-header">Send Retainer Agreement</h2>
                  <p className="secondary-text mt-1">
                    Select a retainer template and send it to the plaintiff for signature.
                  </p>
                </div>
                <button
                  onClick={() => setShowSendRetainerModal(false)}
                  className="p-2 hover:bg-tint rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Recipient Information */}
              <div>
                <h3 className="card-title mb-4">Recipient Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Plaintiff Name</label>
                    <input
                      type="text"
                      value={data.plaintiff}
                      disabled
                      className="w-full bg-wash border border-line rounded-lg px-4 py-3 text-sm text-[#5B6B78] cursor-not-allowed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-2">Recipient Email</label>
                      <input
                        type="email"
                        value={retainerEmail}
                        onChange={(e) => setRetainerEmail(e.target.value)}
                        className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink focus:outline-none focus:border-brand transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink mb-2">Recipient Phone</label>
                      <input
                        type="tel"
                        value={retainerPhone}
                        onChange={(e) => setRetainerPhone(e.target.value)}
                        placeholder="+1 (555) 123-4567"
                        className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Retainer Template */}
              <div>
                <h3 className="card-title mb-4">Retainer Template</h3>
                <div className="space-y-3">
                  {retainerTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`border rounded-xl p-4 transition-all cursor-pointer ${
                        selectedTemplate === template.id
                          ? "border-brand bg-tint"
                          : "border-line hover:border-soft bg-white"
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selectedTemplate === template.id
                                  ? "border-brand bg-brand"
                                  : "border-line bg-white"
                              }`}
                            >
                              {selectedTemplate === template.id && (
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-ink mb-1">{template.name}</div>
                            <div className="flex items-center gap-4 text-xs text-[#5B6B78]">
                              <span>Last Updated: {template.lastUpdated}</span>
                              <span>•</span>
                              <span>Created By: {template.createdBy}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewTemplate(template.id);
                          }}
                          className="px-3 py-1.5 text-sm font-medium text-deep hover:bg-tint rounded-lg transition-colors"
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional Message */}
              <div>
                <h3 className="card-title mb-2">
                  Message to Plaintiff <span className="text-[#5B6B78] font-normal">(Optional)</span>
                </h3>
                <textarea
                  rows={5}
                  value={retainerMessage}
                  onChange={(e) => setRetainerMessage(e.target.value)}
                  placeholder={`Hello ${data.plaintiff},\n\nPlease review and sign the attached retainer agreement to begin representation.\n\nThank you.`}
                  className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink placeholder:text-[#5B6B78] focus:outline-none focus:border-brand resize-none transition-all"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSendRetainerModal(false)}
                className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleSendRetainer}
                disabled={!selectedTemplate || !retainerEmail}
                className="bg-brand hover:bg-deep text-white border-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Retainer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="section-header">Preview Retainer Agreement</h2>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="p-2 hover:bg-tint rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="p-8">
              <div className="bg-white border border-line rounded-lg p-8 max-w-3xl mx-auto">
                {/* Firm Branding */}
                <div className="text-center mb-8">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-ink rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">LG</span>
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-bold text-ink">LexGuard</div>
                      <div className="text-xs text-deep">Injury Intel</div>
                    </div>
                  </div>
                  <div className="text-sm text-[#5B6B78]">123 Legal Ave, Suite 100</div>
                  <div className="text-sm text-[#5B6B78]">Chicago, IL 60601</div>
                  <div className="text-sm text-[#5B6B78]">contact@lexguard.law</div>
                </div>

                {/* Agreement Content */}
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-ink mb-4 text-center">
                    RETAINER AGREEMENT FOR LEGAL SERVICES
                  </h3>
                  <div className="space-y-4 text-sm text-ink">
                    <p>
                      This Retainer Agreement ("Agreement") is entered into on{" "}
                      <span className="font-semibold">[Date]</span> by and between{" "}
                      <span className="font-semibold">LexGuard Legal Group</span> ("Attorney") and{" "}
                      <span className="font-semibold">{data.plaintiff}</span> ("Client").
                    </p>
                    <p className="font-semibold">1. SCOPE OF REPRESENTATION</p>
                    <p>
                      Attorney agrees to represent Client in connection with a personal injury claim arising from
                      incidents described in the case summary. Attorney will provide legal advice, investigate the
                      claim, negotiate with insurance companies, and if necessary, file a lawsuit.
                    </p>
                    <p className="font-semibold">2. ATTORNEY'S FEES</p>
                    <p>
                      Client agrees to pay Attorney a contingency fee equal to 33.33% (one-third) of any recovery
                      obtained through settlement or judgment. If no recovery is obtained, Client owes no attorney
                      fees.
                    </p>
                    <p className="font-semibold">3. COSTS AND EXPENSES</p>
                    <p>
                      Client is responsible for all case-related costs and expenses, including filing fees, expert
                      witness fees, deposition costs, and investigation expenses. These costs will be deducted from
                      any recovery before calculating attorney's fees.
                    </p>
                    <p className="text-[#5B6B78] italic">[Additional terms and conditions...]</p>
                  </div>
                </div>

                {/* Signature Section */}
                <div className="border-t border-line pt-6 mt-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <div className="text-sm font-semibold text-ink mb-4">CLIENT SIGNATURE</div>
                      <div className="border-b-2 border-line mb-2 h-12"></div>
                      <div className="text-xs text-[#5B6B78]">Signature</div>
                      <div className="mt-4">
                        <div className="border-b border-line mb-1 h-8"></div>
                        <div className="text-xs text-[#5B6B78]">Date</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink mb-4">ATTORNEY SIGNATURE</div>
                      <div className="border-b-2 border-line mb-2 h-12"></div>
                      <div className="text-xs text-[#5B6B78]">Signature</div>
                      <div className="mt-4">
                        <div className="border-b border-line mb-1 h-8"></div>
                        <div className="text-xs text-[#5B6B78]">Date</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-end">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-white border border-line hover:bg-wash text-ink rounded-lg text-sm font-medium transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missing Document Request Modal */}
      {showMissingRequestModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-line shrink-0">
              <div>
                <h2 className="section-header">Missing Document Request</h2>
                <p className="text-xs text-[#5B6B78] mt-0.5">Review and approve before sending to client</p>
              </div>
              <button onClick={() => setShowMissingRequestModal(false)} className="p-2 hover:bg-tint rounded-lg transition-colors">
                <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Missing Documents */}
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">Missing Documents</h3>
                <p className="text-xs text-[#5B6B78] mb-3">Uncheck any document you do not want to request.</p>
                <div className="border border-line rounded-xl divide-y divide-line">
                  {missingItems.map((item) => (
                    <label key={item.title} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-wash transition-colors">
                      <input
                        type="checkbox"
                        checked={!!missingCheckedDocs[item.title]}
                        onChange={(e) => handleMissingDocCheck(item.title, e.target.checked)}
                        className="w-4 h-4 rounded border-line accent-brand"
                      />
                      <div>
                        <div className="text-sm text-ink">{item.title}</div>
                        {item.expected && <div className="text-xs text-[#5B6B78] font-mono">{item.expected}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                {selectedMissingTitles.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2">Select at least one document to send a request.</p>
                )}
              </div>

              {/* Contact Method */}
              <div>
                <h3 className="text-sm font-semibold text-ink mb-3">Send To</h3>
                <div className="border border-line rounded-xl divide-y divide-line">
                  {data.plaintiffEmail && (
                    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-wash transition-colors">
                      <input type="radio" name="missingDelivery" value="email" checked={missingDeliveryMethod === "email"} onChange={() => setMissingDeliveryMethod("email")} className="w-4 h-4 accent-brand" />
                      <Mail className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                      <div>
                        <div className="text-sm text-ink">Email</div>
                        <div className="text-xs text-[#5B6B78]">{data.plaintiffEmail}</div>
                      </div>
                    </label>
                  )}
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-wash transition-colors">
                    <input type="radio" name="missingDelivery" value="sms" checked={missingDeliveryMethod === "sms"} onChange={() => setMissingDeliveryMethod("sms")} className="w-4 h-4 accent-brand" />
                    <MessageSquare className="w-4 h-4 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                    <div>
                      <div className="text-sm text-ink">SMS</div>
                      <div className="text-xs text-[#5B6B78]">{data.plaintiffPhone || editablePhone}</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Message Preview */}
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">Message Preview</h3>
                <p className="text-xs text-[#5B6B78] mb-3">This message was generated automatically. You may edit it before sending.</p>
                <textarea
                  value={missingMessageText}
                  onChange={(e) => setMissingMessageText(e.target.value)}
                  rows={10}
                  className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink leading-relaxed focus:outline-none focus:border-brand transition-colors resize-none bg-wash"
                />
              </div>
            </div>

            {missingError && <p role="alert" className="px-6 pb-3 text-sm text-[#B91C1C]">{missingError}</p>}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line shrink-0">
              <Button onClick={() => setShowMissingRequestModal(false)} className="bg-white border border-line text-ink hover:bg-wash">
                Cancel
              </Button>
              <Button
                disabled={selectedMissingTitles.length === 0}
                onClick={handleSendMissingRequest}
                className="bg-brand hover:bg-deep text-white border-0 gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" strokeWidth={1.75} />
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document Workspace — unified Preview + Insights modal */}
      {editDoc && (
        <EditDocumentDialog
          doc={editDoc}
          otherNames={sharedDocs.filter((d) => d.id !== editDoc.id).map((d) => d.name)}
          onSave={(patch, changed) => {
            // Details only — the stored file and its check stand.
            patchDoc(editDoc.id, patch, changed.length ? `Details edited: ${changed.join(", ")}` : undefined);
            setEditDoc(null);
          }}
          onClose={() => setEditDoc(null)}
        />
      )}

      {deleteDoc && (
        <DeleteDocumentDialog doc={deleteDoc} error={deleteError} onConfirm={() => void confirmDelete()} onClose={() => setDeleteDoc(null)} />
      )}

      {retainerEdit && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setRetainerEdit(null)}>
          <div role="dialog" aria-modal="true" aria-label="Edit retainer document details" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="card-title">Edit retainer document details</h2>
              <button onClick={() => setRetainerEdit(null)} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <span className="eyebrow block mb-1">Document name</span>
                <input value={retainerEdit.name} onChange={(e) => setRetainerEdit({ ...retainerEdit, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="eyebrow block mb-1">Source</span>
                  <select value={retainerEdit.source} onChange={(e) => setRetainerEdit({ ...retainerEdit, source: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand">
                    <option value="Plaintiff">Plaintiff</option>
                    <option value="Attorney">Attorney</option>
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow block mb-1">Date</span>
                  <input value={retainerEdit.date} onChange={(e) => setRetainerEdit({ ...retainerEdit, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
                </label>
              </div>
              <p className="text-xs text-[#5B6B78]">Details only — the agreement itself and its signing status ({retainerEdit.status}) are not changed here.</p>
              {retainerEditError && <p role="alert" className="text-sm text-[#B91C1C]">{retainerEditError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
              <button onClick={() => setRetainerEdit(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={saveRetainerEdit} className="btn btn-primary">Save changes</button>
            </div>
          </div>
        </div>
      )}

      {removingReqId && (() => {
        const r = storedRequests.find((x) => x.id === removingReqId);
        if (!r) return null;
        const sent = r.status !== "Draft";
        const answered = (r.submissions?.length ?? 0) > 0 || r.status === "Completed";
        const confirm = () => {
          removeIntakeRequestFromDashboard(r.token, INTAKE_SENDER.name);
          // Show the newest remaining request rather than the removed one.
          if (progressReqId === r.id) setProgressReqId(null);
          setRemovingReqId(null);
        };
        return (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setRemovingReqId(null)}>
            <div role="alertdialog" aria-modal="true" aria-label={`Delete ${r.id}`} className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-5 space-y-2">
                <h2 className="card-title flex items-center gap-2"><Trash2 className="w-4 h-4 text-[#B91C1C]" strokeWidth={1.75} /> Delete {r.id}?</h2>
                {sent && <p className="body-text">This request has already been sent. Removing it from the dashboard will not recall the email or remove the copy the client has already received.</p>}
                <p className="text-xs text-[#5B6B78]">
                  Only {r.id} is removed from this dashboard{answered ? "; the documents the client submitted stay on the case" : ""}. Its record is kept, and the client link is not revoked.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
                <button onClick={() => setRemovingReqId(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={confirm} className="btn bg-[#B91C1C] border border-[#B91C1C] text-white hover:bg-[#991B1B]">Delete request</button>
              </div>
            </div>
          </div>
        );
      })()}

      {retainerDelete && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setRetainerDelete(null)}>
          <div role="alertdialog" aria-modal="true" aria-label="Delete retainer document" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 space-y-2">
              <h2 className="card-title flex items-center gap-2"><Trash2 className="w-4 h-4 text-[#B91C1C]" strokeWidth={1.75} /> Delete this retainer document?</h2>
              <p className="body-text"><span className="mono-ref text-ink">{retainerDelete.name}</span> will be removed from Retainer documents. This cannot be undone.</p>
              {retainerDelete.status === "Signed" && <p className="text-xs text-[#B45309]">This is the signed agreement. Deleting the file does not change the retainer's signing status on this case.</p>}
              {retainerDeleteError && <p role="alert" className="text-sm text-[#B91C1C]">{retainerDeleteError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
              <button onClick={() => setRetainerDelete(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void confirmRetainerDelete()} className="btn bg-[#B91C1C] border border-[#B91C1C] text-white hover:bg-[#991B1B]">Delete document</button>
            </div>
          </div>
        </div>
      )}

      {reviewDoc && (() => {
        const live = sharedDocs.find((d) => d.id === reviewDoc.id) ?? reviewDoc;
        return (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={() => setReviewDoc(null)}>
            <div role="dialog" aria-modal="true" aria-label="Review document" className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-line">
                <div className="min-w-0">
                  <div className="eyebrow mb-0.5">Review document</div>
                  <h2 className="card-title mono-ref text-ink break-words">{live.name}</h2>
                </div>
                <button onClick={() => setReviewDoc(null)} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg shrink-0"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2"><span className="eyebrow">Status</span><span className={`pill ${DOC_STATUS_PILL[live.status]}`}>{live.status}</span></div>
                {live.reviewReason && (
                  <div className="rounded-lg border border-[#FDE6C8] bg-[#FFF7ED] p-3">
                    <div className="eyebrow text-[#B45309] mb-0.5">What needs your decision</div>
                    <p className="text-sm text-ink">{live.reviewReason}</p>
                  </div>
                )}
                {live.checkResult && <p className="text-sm text-[#5B6B78]"><span className="eyebrow mr-1.5">File check</span>{live.checkResult}</p>}
                <label className="block">
                  <span className="eyebrow block mb-1">Category</span>
                  <select value={reviewCategory} onChange={(e) => setReviewCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand">
                    <option value="">From the file name ({classifyDocuments([{ ...live, category: undefined }])[0]?.name})</option>
                    {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow block mb-1">Review note (optional)</span>
                  <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" placeholder="What you checked or decided" />
                </label>
                {(live.history?.length ?? 0) > 0 && (
                  <div>
                    <div className="eyebrow mb-1">History</div>
                    <ul className="space-y-0.5">
                      {live.history!.map((h, i) => <li key={i} className="text-xs text-[#5B6B78]"><span className="mono-ref mr-1.5">{h.at}</span>{h.event}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
                <button onClick={() => { setReviewDoc(null); handlePreviewDocument(live); }} className="btn btn-secondary">Open document</button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setReviewDoc(null)} className="btn btn-secondary">Cancel</button>
                  <button onClick={markReviewed} className="btn btn-primary">Mark as reviewed</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <DocumentWorkspaceModal
        docs={showDocumentPreview && selectedDocument ? [selectedDocument] : null}
        initialView={workspaceView}
        onClose={() => { setShowDocumentPreview(false); setSelectedDocument(null); }}
        onDownload={() => handleDownloadDocument(selectedDocument)}
      />

      {/* Upload Agreement Modal */}
      {showUploadAgreementModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-line">
              <h2 className="card-title">Upload Signed Agreement</h2>
              <button onClick={() => setShowUploadAgreementModal(false)} className="p-1.5 hover:bg-tint rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="secondary-text">Upload a signed copy of the retainer agreement to attach it to this case.</p>
              <label className="block border-2 border-dashed border-line rounded-xl p-8 text-center hover:border-soft transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-[#9BDAEC] mx-auto mb-3" strokeWidth={1.75} />
                <p className="text-sm font-medium text-ink mb-1">{retainerPickedFile ? retainerPickedFile.name : "Choose the signed file"}</p>
                <p className="text-xs text-[#5B6B78]">PDF, JPG, PNG up to 20MB</p>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={(e) => { setRetainerPickedFile(e.target.files?.[0] ?? null); setRetainerUploadError(null); }} />
              </label>
              <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
                <input type="checkbox" checked={retainerConfirmed} onChange={(e) => setRetainerConfirmed(e.target.checked)} className="mt-0.5 accent-[#3FB5D7]" />
                I confirm this is the agreement signed by the client.
              </label>
              {retainerUploadError && <p role="alert" className="text-sm text-[#B91C1C]">{retainerUploadError}</p>}
            </div>
            <div className="flex items-center justify-between px-6 py-4 bg-wash border-t border-line">
              <button
                onClick={() => { setShowUploadAgreementModal(false); }}
                className="text-sm text-deep hover:text-ink transition-colors"
              >
                Add Later
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowUploadAgreementModal(false)} className="px-4 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-all">
                  Cancel
                </button>
                <button
                  disabled={!retainerPickedFile || !retainerConfirmed}
                  title={!retainerPickedFile ? "Choose the signed file first" : !retainerConfirmed ? "Confirm it is the signed agreement" : undefined}
                  onClick={async () => { if (retainerPickedFile && await markRetainerSigned(retainerPickedFile)) setShowUploadAgreementModal(false); }}
                  className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-deep transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Upload File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate New Retainer Confirmation Modal */}
      {showGenerateNewRetainerModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-line">
              <h2 className="card-title">Generate New Retainer</h2>
              <button onClick={() => setShowGenerateNewRetainerModal(false)} className="p-1.5 hover:bg-tint rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" strokeWidth={1.75} />
                <p className="text-sm text-amber-800">A signed retainer agreement already exists for this case.</p>
              </div>
              <p className="text-sm text-[#5B6B78]">Generating a new retainer will <strong>not</strong> replace or modify the signed agreement. A new retainer request will be created and tracked separately.</p>
              <p className="text-sm text-[#5B6B78]">The original signed agreement will remain preserved.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 bg-wash border-t border-line">
              <button onClick={() => setShowGenerateNewRetainerModal(false)} className="px-4 py-2 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-all">
                Cancel
              </button>
              <button
                onClick={() => { setShowGenerateNewRetainerModal(false); handleOpenSendRetainerModal(); }}
                className="px-4 py-2 bg-ink hover:bg-deep text-white rounded-lg text-sm font-medium transition-all"
              >
                Generate New Retainer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Signed Modal */}
      {showMarkSignedModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="section-header">Mark Retainer as Signed</h2>
                  <p className="secondary-text mt-1">
                    Use this option if the retainer agreement was completed outside LECO.
                  </p>
                </div>
                <button
                  onClick={() => setShowMarkSignedModal(false)}
                  className="p-2 hover:bg-tint rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div>
                <h3 className="card-title mb-2">
                  Upload Agreement <span className="text-[#5B6B78] font-normal">(Optional)</span>
                </h3>
                <label className="block border-2 border-dashed border-line rounded-xl p-8 text-center hover:border-soft hover:bg-tint/50 transition-all cursor-pointer">
                  <Upload className="w-12 h-12 text-[#5B6B78] mx-auto mb-4" strokeWidth={1.75} />
                  <div className="mb-2 text-sm font-medium text-ink">{retainerPickedFile ? retainerPickedFile.name : "Browse Files"}</div>
                  <p className="text-xs text-[#5B6B78]">
                    Supported: PDF, DOCX, JPG, PNG
                  </p>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={(e) => { setRetainerPickedFile(e.target.files?.[0] ?? null); setRetainerUploadError(null); }} />
                </label>
                {retainerUploadError && <p role="alert" className="text-sm text-[#B91C1C] mt-2">{retainerUploadError}</p>}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={handleAddLater}
                className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors"
              >
                Add Later
              </button>
              <Button
                onClick={handleConfirmSigned}
                className="bg-brand hover:bg-deep text-white border-0"
              >
                Confirm Signed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
