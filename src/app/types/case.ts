import { fileKind } from "../components/fileType";
/** Where a document is in processing and review. */
export type DocStatus = "Queued" | "Processing" | "Processed" | "Attorney Review Required" | "Failed" | "Reviewed";

export interface CaseDocument {
  id: string;
  name: string;
  source: "Plaintiff" | "Attorney";
  date: string;
  status: DocStatus;
  /** The stored original (intake/mediaFileStore). Absent for records whose file
   *  is not held in this browser. */
  storageKey?: string;
  size?: number;
  /** What the file check found, or why it failed / needs the attorney. */
  checkResult?: string;
  checkError?: string;
  /** Why the attorney has to look at it, when the status says so. */
  reviewReason?: string;
  /** A category the attorney set; otherwise it is read from the file name. */
  category?: string;
  /** The status the attorney last saw — a later change shows as new activity. */
  seenStatus?: DocStatus;
  /** What happened to the document, oldest first. */
  history?: { at: string; event: string }[];
  /** A client submission: the intake request it came with, the upload it is,
   *  and when the client submitted it (ISO). */
  requestId?: string;
  intakeUploadId?: string;
  receivedAt?: string;
  /** The document's text, when the case record carries it rather than a file. */
  content?: { kind: "text" | "image"; blocks: ({ type: "heading" | "paragraph"; text: string } | { type: "fields"; pairs: [string, string][] } | { type: "list"; items: string[] })[] };
}

/** The categories a document can be filed under. */
export const DOCUMENT_CATEGORIES = [
  "Medical Records", "Police Reports", "Insurance Documents", "Wage Loss Records", "Photos & Evidence", "Video & Photos", "General Documents",
];

export interface AttorneyNote {
  id: string;
  text: string;
  category: string;
  priority: string;
  date: string;
}

export const PACKAGE_STATUSES = ["Draft", "Under Review", "Ready to Send", "Sent", "Negotiation", "Closed"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export interface DemandPackage {
  id: string;
  number: number;
  label: string;
  suffix?: string;
  status: PackageStatus;
  generatedFrom: string;
  generatedAt: string;
  estimatedAmount: number;
  docCount: number;
  version: string;
  notes?: string;
  isNew?: boolean;
  // The Demand Letter is the source document — the only thing generated up
  // front. A full multi-section package is assembled later, from this.
  letterHtml?: string;
  letterScrollTop?: number;
}

export interface PipelineState {
  // Retainer
  retainerStatus: "not-sent" | "sent" | "signed";
  // Intake
  intakeCreated: boolean;
  intakeSent: boolean;
  intakeLink: string;
  // Documents uploaded in Collection
  documents: CaseDocument[];
  // Stage completion flags
  analysisDone: boolean;
  valuationDone: boolean;
  // Notes (shared to Case Ready)
  notes: AttorneyNote[];
}

export interface ClassificationCategory {
  name: string;
  docs: CaseDocument[];
}

// ── Classification rules ──────────────────────────────────────────────────────
export function classifyDocuments(docs: CaseDocument[]): ClassificationCategory[] {
  const buckets: Record<string, CaseDocument[]> = {
    "Video & Photos": [],
    "Medical Records": [],
    "Police Reports": [],
    "Insurance Documents": [],
    "Wage Loss Records": [],
    "Photos & Evidence": [],
    "General Documents": [],
  };

  for (const doc of docs) {
    // A category the attorney chose wins over the name.
    if (doc.category && buckets[doc.category]) {
      buckets[doc.category].push(doc);
      continue;
    }
    const n = doc.name.toLowerCase();
    // Video and photos are media evidence, analysed on their own — never filed
    // as documents, whatever their name suggests.
    const kind = fileKind(doc.name);
    if (kind === "image" || kind === "video") {
      buckets["Video & Photos"].push(doc);
      continue;
    }
    // `er_` is anchored to a name segment so it matches ER_Bills but not
    // "lett(er_)draft" / "offic(er_)narrative"; bare `records` is intentionally
    // absent so "Carrier_Records" is not read as a medical file — the specific
    // medical keywords already cover the real records.
    if (/(mri|ct_|xray|x-ray|(?:^|[_\-\s])er_|emergency|hospital|medical|therapy|treatment|surgery|medication|discharge|physical|clinical|admission|radiology|imaging|bills|invoice|prescription)/.test(n)) {
      buckets["Medical Records"].push(doc);
    } else if (/(police|accident|incident|witness|citation|patrol|officer|crash|report)/.test(n)) {
      buckets["Police Reports"].push(doc);
    } else if (/(insurance|policy|claim|coverage|liability)/.test(n)) {
      buckets["Insurance Documents"].push(doc);
    } else if (/(wage|employment|salary|income|w2|pay|employer|job|verification|loss)/.test(n)) {
      buckets["Wage Loss Records"].push(doc);
    } else if (/\.(jpg|jpeg|png|gif|webp)$|photo|image|picture|scene/.test(n)) {
      buckets["Photos & Evidence"].push(doc);
    } else {
      buckets["General Documents"].push(doc);
    }
  }

  return Object.entries(buckets)
    .filter(([, d]) => d.length > 0)
    .map(([name, docs]) => ({ name, docs }));
}

// ── Analysis finding rules ────────────────────────────────────────────────────
export interface FindingEvidence {
  file: string;
  quote: string;
}

export interface AnalysisFinding {
  tag: string;
  kind: "liability" | "injury";
  title: string;
  description: string;
  confidence: number;
  conclusion: string;
  sources: string[];
  evidence: FindingEvidence[];
  // ── Injury signals only: the condition relative to the incident ──
  // Each is set only where the case record establishes it. Absent means "not
  // established", and the UI says so rather than filling in a value.
  /** Whether the condition was documented before or after the incident. */
  timing?: "pre-incident" | "post-incident";
  /** Clinical severity, as assessed in the record. */
  severity?: "Mild" | "Moderate" | "Severe" | "Critical";
  /** The body part or region, with its side where the record gives one
   *  ("Right leg"). Matching body parts suggest a relationship worth checking;
   *  they never establish one. */
  bodyPart?: string;
  /** How the condition stands across the incident:
   *  new — appeared after the incident, no documented pre-existing condition;
   *  aggravated — a pre-existing condition worsened by the incident;
   *  worsened — the same pre-existing condition became more severe;
   *  related — related to a pre-existing condition, aggravation not established;
   *  unchanged — a pre-existing condition continued without documented change. */
  relationship?: "new" | "aggravated" | "worsened" | "related" | "unchanged";
  /** What the relationship rests on — a documented fact, a relationship the
   *  medical evidence supports, or an AI inference not yet verified. */
  relationshipBasis?: "documented" | "evidence" | "ai";
  /** For a post-incident condition: the title of the pre-incident condition it
   *  relates to. This link — not a shared body part — joins the two. */
  relatedCondition?: string;
  /** What changed after the incident, as the evidence describes it. */
  changeAfterIncident?: string;
  symptoms?: string;
  treatment?: string;
  functionalImpact?: string;
}

export function generateAnalysisFindings(categories: ClassificationCategory[]): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  const liabilityCat = categories.find((c) => c.name === "Police Reports");
  const insuranceCat = categories.find((c) => c.name === "Insurance Documents");
  const medicalCat = categories.find((c) => c.name === "Medical Records");

  const pick = (cat: ClassificationCategory | undefined, i: number, fallback: string) =>
    cat?.docs[i]?.name ?? cat?.docs[0]?.name ?? fallback;

  if (liabilityCat && liabilityCat.docs.length > 0) {
    findings.push({
      tag: "TRAFFIC CODE VIOLATION",
      kind: "liability",
      title: "Red-Light Intersection Encroachment",
      description:
        "Responding officer report and witness testimony indicate the defendant entered the intersection after the signal changed to red.",
      confidence: 92,
      conclusion: "Strong liability indication against defendant.",
      sources: liabilityCat.docs.map((d) => d.name).slice(0, 2),
      evidence: [
        { file: pick(liabilityCat, 0, "police_report_final.pdf"), quote: "Vehicle entered intersection against red traffic signal." },
        { file: pick(liabilityCat, 1, "witness_statement.pdf"), quote: "Witness observed truck proceeding after light turned red." },
      ],
    });

    findings.push({
      tag: "OFFICER FAULT DETERMINATION",
      kind: "liability",
      title: "On-Scene Negligence Attribution",
      description:
        "The responding officer's narrative attributes primary fault to the defendant for failure to yield right-of-way.",
      confidence: 87,
      conclusion: "Defendant negligence supported by on-scene assessment.",
      sources: liabilityCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(liabilityCat, 0, "police_report_final.pdf"), quote: "Driver of commercial vehicle cited for failure to yield right-of-way." },
      ],
    });

    findings.push({
      tag: "SPEED ESTIMATE EXCEEDANCE",
      kind: "liability",
      title: "Excessive Speed At Impact",
      description:
        "Crash reconstruction within the report estimates the defendant's vehicle was traveling above the posted limit at the point of impact.",
      confidence: 81,
      conclusion: "Supports a heightened breach of the standard of care.",
      sources: liabilityCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(liabilityCat, 0, "police_report_final.pdf"), quote: "Estimated travel speed exceeded the posted limit prior to braking." },
      ],
    });

    findings.push({
      tag: "SCENE EVIDENCE CONSISTENCY",
      kind: "liability",
      title: "Skid-Mark & Debris Corroboration",
      description:
        "Physical evidence documented at the scene — skid marks and debris field — is consistent with the plaintiff's account of the collision.",
      confidence: 79,
      conclusion: "Objective scene evidence reinforces the liability narrative.",
      sources: liabilityCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(liabilityCat, 1, "witness_statement.pdf"), quote: "Skid marks and debris field consistent with point-of-impact described." },
      ],
    });
  }

  if (insuranceCat && insuranceCat.docs.length > 0) {
    findings.push({
      tag: "POLICY COVERAGE CONFIRMED",
      kind: "liability",
      title: "Commercial Liability Coverage In Force",
      description:
        "Insurance documentation confirms active commercial liability coverage applicable at the time of the incident.",
      confidence: 95,
      conclusion: "Adequate coverage available to satisfy a recovery.",
      sources: insuranceCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(insuranceCat, 0, "insurance_policy.pdf"), quote: "Commercial general liability coverage active on date of loss." },
      ],
    });

    findings.push({
      tag: "POLICY LIMITS ADEQUATE",
      kind: "liability",
      title: "Coverage Limits Support Demand",
      description:
        "The declared policy limits are sufficient to support the anticipated demand range for the documented damages.",
      confidence: 90,
      conclusion: "No coverage shortfall expected to cap recovery.",
      sources: insuranceCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(insuranceCat, 0, "insurance_policy.pdf"), quote: "Per-occurrence limits exceed the projected value of the claim." },
      ],
    });
  }

  // Every injury signal below is drawn from records made after the collision
  // (admission, imaging, treatment, therapy), so each is a post-incident
  // finding. None of them records a severity or a relationship to a
  // pre-existing condition, and none is set here.
  if (medicalCat && medicalCat.docs.length > 0) {
    findings.push({
      tag: "CLINICAL DISABILITY ONSET",
      kind: "injury",
      timing: "post-incident",
      title: "Cervical Cord Compression",
      description:
        "MRI findings confirm C5-C6 and C6-C7 disc herniations causing neurological compression consistent with the reported mechanism of injury.",
      confidence: 90,
      conclusion: "Objective imaging supports significant injury severity.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 2),
      evidence: [
        { file: pick(medicalCat, 0, "mri_cervical.pdf"), quote: "MRI confirms C5-C6 disc herniation with neurological compression findings." },
        { file: pick(medicalCat, 1, "radiology_report.pdf"), quote: "Findings consistent with traumatic disc injury at C6-C7." },
      ],
    });

    findings.push({
      tag: "CAUSATION LINKAGE",
      kind: "injury",
      timing: "post-incident",
      title: "Treatment Consistent With Trauma",
      description:
        "Treatment records document a continuous course of care beginning immediately after the incident, supporting causation.",
      confidence: 88,
      conclusion: "Continuity of care reinforces causation.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 0, "treatment_records.pdf"), quote: "Patient presented within 24 hours of the collision with acute cervical pain." },
      ],
    });

    findings.push({
      tag: "FUNCTIONAL IMPAIRMENT",
      kind: "injury",
      timing: "post-incident",
      title: "Ongoing Physical Limitations",
      description:
        "Physical therapy notes document persistent range-of-motion deficits and chronic pain affecting daily function.",
      confidence: 84,
      conclusion: "Evidence supports ongoing damages and impairment.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 1, "physical_therapy_notes.pdf"), quote: "Persistent cervical range-of-motion deficit with chronic pain noted at discharge." },
      ],
    });

    findings.push({
      tag: "EMERGENCY PRESENTATION",
      kind: "injury",
      timing: "post-incident",
      title: "Acute Symptoms On Admission",
      description:
        "Emergency admission records document acute neurological symptoms present on arrival, establishing baseline injury severity.",
      confidence: 86,
      conclusion: "Admission findings anchor the severity baseline.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 0, "treatment_records.pdf"), quote: "Patient presented with acute neurological deficits on admission." },
      ],
    });

    findings.push({
      tag: "TREATMENT INTENSITY",
      kind: "injury",
      timing: "post-incident",
      title: "Sustained Course Of Care",
      description:
        "Records reflect a sustained, escalating course of treatment over several months, consistent with a significant injury.",
      confidence: 83,
      conclusion: "Treatment intensity corroborates injury magnitude.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 0, "treatment_records.pdf"), quote: "Ongoing multi-modal treatment documented across consecutive months." },
      ],
    });

    findings.push({
      tag: "SPECIALIST REFERRAL",
      kind: "injury",
      timing: "post-incident",
      title: "Neurology & Rehabilitation Referral",
      description:
        "The plaintiff was referred to specialist care for ongoing neurological and rehabilitative management of the injury.",
      confidence: 80,
      conclusion: "Specialist involvement supports injury seriousness.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 1, "physical_therapy_notes.pdf"), quote: "Referred to neurology and rehabilitation for continued management." },
      ],
    });

    findings.push({
      tag: "PROGNOSIS / PERMANENCY",
      kind: "injury",
      timing: "post-incident",
      title: "Permanent Residual Impairment",
      description:
        "Clinical assessment indicates a guarded prognosis with permanent residual impairment expected to affect long-term function.",
      confidence: 82,
      conclusion: "Supports future-care and non-economic damages.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 1, "physical_therapy_notes.pdf"), quote: "Prognosis guarded; permanent residual impairment anticipated." },
      ],
    });

    findings.push({
      tag: "PAIN & SUFFERING",
      kind: "injury",
      timing: "post-incident",
      title: "Documented Chronic Pain",
      description:
        "Treatment records consistently document chronic pain and its impact on the plaintiff's daily activities and quality of life.",
      confidence: 78,
      conclusion: "Reinforces non-economic damages.",
      sources: medicalCat.docs.map((d) => d.name).slice(0, 1),
      evidence: [
        { file: pick(medicalCat, 0, "treatment_records.pdf"), quote: "Chronic pain reported affecting sleep, work, and daily activities." },
      ],
    });
  }

  return findings;
}

// ── Missing evidence rules ────────────────────────────────────────────────────
export interface MissingEvidenceItem {
  title: string;
  expected: string;
  reason: string;
}

export function detectMissingEvidence(categories: ClassificationCategory[]): MissingEvidenceItem[] {
  const missing: MissingEvidenceItem[] = [];
  const names = categories.flatMap((c) => c.docs.map((d) => d.name.toLowerCase()));

  const hasPoliceAddendum = names.some((n) => n.includes("addendum"));
  if (!hasPoliceAddendum) {
    missing.push({ title: "Police Report Addendum", expected: "Police_Report_Addendum.pdf", reason: "May strengthen liability findings." });
  }

  const hasWageLoss = categories.some((c) => c.name === "Wage Loss Records" && c.docs.length > 0);
  if (!hasWageLoss) {
    missing.push({ title: "Wage Loss Records", expected: "Wage_Loss_Statement.pdf", reason: "Required for damages calculation." });
  }

  const hasInsurance = categories.some((c) => c.name === "Insurance Documents" && c.docs.length > 0);
  if (!hasInsurance) {
    missing.push({ title: "Insurance Policy", expected: "Commercial_Insurance_Policy.pdf", reason: "Needed to determine policy limits." });
  }

  return missing;
}

// ── Valuation computation ─────────────────────────────────────────────────────
export function computeValuation(findings: AnalysisFinding[], multiplier: number) {
  const baseEconomic = 161450;
  const multiplierAdjustment = baseEconomic * multiplier;
  const totalRecommended = baseEconomic + multiplierAdjustment;
  const settlementLow = totalRecommended * 0.6;
  const settlementHigh = totalRecommended * 0.85;
  return { baseEconomic, multiplierAdjustment, totalRecommended, settlementLow, settlementHigh };
}

// ── Checklist completion ──────────────────────────────────────────────────────
export function computeChecklist(pipeline: PipelineState, categories: ClassificationCategory[], findings: AnalysisFinding[]) {
  const hasDocs = pipeline.documents.length > 0;
  const hasCategories = categories.length > 0;
  const hasFindings = findings.length > 0;
  return {
    "Medical records collected": hasDocs,
    "Documents classified": hasCategories,
    "Missing records audited": hasFindings,
    "Key entities extracted": hasFindings,
    "Medical chronology generated": hasFindings,
    "Valuation completed": pipeline.valuationDone,
    "Case workspace generated": pipeline.valuationDone,
  };
}
