import type { AnalysisFinding, CaseDocument } from "../types/case";
import { VIOLATION_CARDS, stageEvidence, STAGE_LABELS, type StageId } from "../workspace/WorkspaceTabs";
import { EVIDENCE_INTEL } from "../workspace/evidenceData";
import type { AssistantLocation } from "./AssistantContext";

// ── Contexts ──────────────────────────────────────────────────────────────────
// One assistant, five scopes. "Current Stage" follows the page; the rest widen
// deliberately. Every answer states which scope produced it.

export type ContextId = "stage" | "intake" | "workspace" | "case" | "global";

export const CONTEXTS: { id: ContextId; label: string; blurb: string }[] = [
  { id: "stage", label: "Current Stage", blurb: "Only what is on screen right now" },
  { id: "intake", label: "Case Intake Pipeline", blurb: "Collection, Conflict Check, Analysis, Valuation, Case Ready" },
  { id: "workspace", label: "Case Workspace", blurb: "All nine workspace stages" },
  { id: "case", label: "Entire Case", blurb: "Every stage, document and finding" },
  { id: "global", label: "Global", blurb: "Research sources outside this case" },
];

// Global is not one scope but two research sources, neither of which reads the
// case file. The attorney picks which one the assistant should reason from.
export type GlobalSourceId = "precedent" | "public";

export const GLOBAL_SOURCES: { id: GlobalSourceId; label: string; blurb: string }[] = [
  { id: "precedent", label: "Precedent Cases", blurb: "Decided cases and how they were reasoned" },
  { id: "public", label: "Public Database", blurb: "Public records, statutes and filings" },
];

export const globalSourceLabel = (id: GlobalSourceId): string =>
  GLOBAL_SOURCES.find((g) => g.id === id)?.label ?? "Global";

// The attorney can scope the AI to a whole pipeline, the entire case, a global
// research source, or one specific stage in either pipeline.
export type ContextSel =
  | { kind: "current" }
  | { kind: "intake" }
  | { kind: "workspace" }
  | { kind: "case" }
  | { kind: "global"; source: GlobalSourceId }
  | { kind: "stage"; stage: WorkStageDef };

export const CURRENT_CONTEXT: ContextSel = { kind: "current" };

export function contextLabel(sel: ContextSel, loc: AssistantLocation): string {
  switch (sel.kind) {
    case "intake": return "Case Intake Pipeline";
    case "workspace": return "Case Workspace";
    case "case": return "Entire Case";
    case "global": return `${globalSourceLabel(sel.source)} · Global`;
    case "stage": return `${sel.stage.label} · ${sel.stage.pipeline === "intake" ? "Case Intake" : "Case Workspace"}`;
    default: {
      const here = loc.stageLabel || loc.pipelineStage || loc.pageLabel || "Current page";
      return `Current Stage · ${here}`;
    }
  }
}

// How wide the answer engine may read for a given selection.
export function effectiveScope(sel: ContextSel): ContextId {
  switch (sel.kind) {
    case "intake": return "intake";
    case "workspace": return "workspace";
    case "case": return "case";
    case "global": return "global";
    default: return "stage";
  }
}

// The research source behind a global selection, if one is selected.
export function globalSource(sel: ContextSel): GlobalSourceId | undefined {
  return sel.kind === "global" ? sel.source : undefined;
}

// A context pinned to one stage also pins the suggestions to it.
export function pinnedStage(sel: ContextSel): WorkStageDef | null {
  return sel.kind === "stage" ? sel.stage : null;
}

// ── Suggested prompts ─────────────────────────────────────────────────────────
// Shown only while a conversation is empty, so they never clutter the thread.

export const STAGE_SUGGESTIONS: Record<string, string[]> = {
  evidencehub: [
    "What evidence is strongest for liability?",
    "Are there contradictions in the evidence?",
    "What evidence gaps should we address?",
    "How does this evidence affect damages?",
  ],
  medical: [
    "Identify important gaps in the timeline",
    "What events are most important to liability?",
    "Are there conflicting dates?",
  ],
  negotiation: [
    "Summarize our strongest negotiation points",
    "What evidence supports our demand?",
    "What weaknesses could the opposing side use?",
  ],
  economic: [
    "Which damages figures are best supported?",
    "Where is the damages model most exposed?",
    "What documentation is missing for damages?",
  ],
  noneconomic: [
    "What evidence establishes breach of duty?",
    "How strong is causation on the current record?",
    "What would the defense argue against negligence?",
  ],
  liability: [
    "Which violation is best supported by evidence?",
    "What evidence backs the signal violation?",
    "Are any cited violations weakly supported?",
  ],
  overview: [
    "Give me a two-minute briefing on this case",
    "What are the strongest and weakest points?",
    "What should I prioritise next?",
  ],
  evidence: [
    "Summarise the procedural history so far",
    "Which correspondence matters most?",
    "What is still outstanding?",
  ],
  demand: [
    "What drives the current valuation?",
    "How confident is the settlement range?",
    "What would move the valuation upward?",
  ],
};

const CONTEXT_SUGGESTIONS: Record<ContextId, string[]> = {
  stage: ["What am I looking at?", "What matters most here?", "What is missing?"],
  intake: [
    "What is still outstanding in intake?",
    "Are the collected documents sufficient to proceed?",
    "What is the current pipeline status?",
  ],
  workspace: [
    "Compare the negligence findings with the violations identified in the case.",
    "Which stages have the weakest supporting evidence?",
    "Where do the stages contradict each other?",
  ],
  case: [
    "Give me a complete summary of the case and identify the strongest weaknesses in the defense.",
    "What is our theory of liability in one paragraph?",
    "What are the three biggest risks to this case?",
  ],
  global: [
    "What legal principles generally apply to comparative negligence?",
    "How is future medical care usually proven?",
    "What is the standard for admitting accident reconstruction?",
  ],
};

const GLOBAL_SOURCE_SUGGESTIONS: Record<GlobalSourceId, string[]> = {
  precedent: [
    "Which precedents govern comparative negligence?",
    "How have courts treated delayed cervical imaging?",
    "Find decisions on commercial-vehicle signal violations.",
  ],
  public: [
    "What do the public filings show for this carrier?",
    "Which statutes govern signal violations here?",
    "Search the public record for prior claims against the defendant.",
  ],
};

export function suggestionsFor(ctx: ContextId, loc: AssistantLocation, source?: GlobalSourceId): string[] {
  if (ctx === "stage") {
    const byStage = loc.stageId ? STAGE_SUGGESTIONS[loc.stageId] : undefined;
    return byStage ?? CONTEXT_SUGGESTIONS.stage;
  }
  if (ctx === "global" && source) return GLOBAL_SOURCE_SUGGESTIONS[source];
  return CONTEXT_SUGGESTIONS[ctx];
}

// ── Answering ─────────────────────────────────────────────────────────────────
// Answers are assembled from the case record actually on file — the evidence
// analysis and the cited violations — so a citation always points at something
// real. Global scope deliberately uses no case data.

export interface AssistantAnswer {
  headline: string;
  points: string[];
  citations: string[];
  caveat?: string;
}

const analysed = () => Object.entries(EVIDENCE_INTEL);

// Intel is keyed by lowercased filename for identity, but citations must show
// the real filename. Every document appears with its true casing in some
// related[] list, so that is the source for display names.
const CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, intel] of Object.entries(EVIDENCE_INTEL)) {
    map[key] = map[key] ?? key;
    for (const r of intel.related) map[r.toLowerCase()] = r;
  }
  return map;
})();

export const fileName = (key: string) => CANONICAL[key.toLowerCase()] ?? key;

function strongestLiabilityEvidence(): AssistantAnswer {
  const ranked = analysed()
    // "Not relevant" and "Neutral on fault" both mean the item does not speak
    // to liability, however confident its own analysis is.
    .filter(([, i]) => !/^(Not (relevant|assessed)|Neutral)/i.test(i.impact.liability))
    .sort((a, b) => b[1].confidence.score - a[1].confidence.score)
    .slice(0, 4);
  return {
    headline: "Liability rests on the intersection record — the camera footage and the police report carry it.",
    points: ranked.map(
      ([file, i]) => `${i.title} (${fileName(file)}) — ${i.impact.liability} Confidence ${i.confidence.level}, ${i.confidence.score}%.`,
    ),
    citations: ranked.map(([f]) => fileName(f)),
    caveat: "Ranked by the confidence recorded on each analysed item. Evidence still pending analysis is excluded.",
  };
}

function contradictions(): AssistantAnswer {
  const found = analysed().filter(([, i]) => i.contradictions.length > 0);
  if (found.length === 0) {
    return { headline: "No contradictions are recorded in the analysed evidence.", points: [], citations: [] };
  }
  return {
    headline: `${found.length} potential discrepanc${found.length === 1 ? "y is" : "ies are"} recorded in the evidence.`,
    points: found.flatMap(([file, i]) =>
      i.contradictions.map((c) => `${c.source}: "${c.text}" against ${c.against}: "${c.againstText}" — ${fileName(file)}`),
    ),
    citations: found.map(([f]) => fileName(f)),
    caveat: "Flagged as discrepancies to reconcile, not as proof that either account is wrong.",
  };
}

function evidenceGaps(): AssistantAnswer {
  const withGaps = analysed().filter(([, i]) => i.gaps.length > 0);
  const all = withGaps.flatMap(([file, i]) => i.gaps.map((g) => `${g} — ${fileName(file)}`));
  return {
    headline: `${all.length} evidence gaps are recorded across ${withGaps.length} analysed items.`,
    points: all.slice(0, 6),
    citations: withGaps.slice(0, 5).map(([f]) => fileName(f)),
    caveat: all.length > 6 ? `${all.length - 6} further gaps are listed on the individual evidence items.` : undefined,
  };
}

function damagesFromEvidence(): AssistantAnswer {
  const rel = analysed().filter(([, i]) => !/^Not (relevant|assessed)/i.test(i.impact.damages)).slice(0, 5);
  return {
    headline: "Damages rest on the medical record; the liability evidence supports it only indirectly.",
    points: rel.map(([file, i]) => `${i.title} (${fileName(file)}) — ${i.damages}`),
    citations: rel.map(([f]) => fileName(f)),
  };
}

function negligenceVsViolations(): AssistantAnswer {
  return {
    headline: "The negligence findings and the cited violations describe the same conduct from two directions.",
    points: [
      "Negligence frames the conduct as a breach of a duty owed to the plaintiff — duty, breach, causation, harm.",
      `Violations frame that same conduct against specific standards: ${VIOLATION_CARDS.map((v) => v.title).join(", ")}.`,
      "The overlap is deliberate. A statutory violation supports the breach element rather than replacing it.",
      "They diverge on proof: negligence is argued from the whole record, while each violation stands or falls on the evidence cited against it.",
    ],
    citations: VIOLATION_CARDS.flatMap((v) => v.evidence).slice(0, 5),
    caveat: "A statutory violation is evidence of breach. Whether it amounts to negligence per se depends on the jurisdiction.",
  };
}

function caseSummary(loc: AssistantLocation): AssistantAnswer {
  return {
    headline: `${loc.caseName || "This case"} — a motor-vehicle claim with a documented cervical injury and a strong liability record.`,
    points: [
      "Liability: the intersection footage and the police report place the commercial vehicle entering against the signal, with independent witness corroboration.",
      "Causation: imaging within 48 hours of the collision documents C5–C6 and C6–C7 herniations, and treatment runs continuously from the admission onward.",
      "Damages: the medical record, billing and wage-loss documentation support the economic figures, and the therapy record supports permanence.",
      `Violations: ${VIOLATION_CARDS.length} are cited, the strongest being ${VIOLATION_CARDS[0]?.title}.`,
      "Defense weaknesses: no pre-incident cervical imaging excludes prior degeneration, only one independent witness has signed a statement, and the camera footage begins four seconds before impact.",
    ],
    citations: ["police_report_final.pdf", "traffic_camera.mp4", "MRI_Report_2026.pdf", "witness_statement.pdf"],
    caveat: "A summary of the record as it currently stands, not a legal opinion.",
  };
}

function exposures(loc: AssistantLocation): AssistantAnswer {
  return {
    headline: "Where this case is exposed.",
    points: [
      "No pre-incident cervical imaging is on file, leaving room for a prior-degeneration argument.",
      "Only one independent witness has signed a statement.",
      "The intersection footage begins four seconds before impact and does not capture the plaintiff signal head.",
      "The damages model leans on projections for future care, which the defense will test.",
      "Reconstruction conclusions are expert opinion and invite a competing expert.",
    ],
    citations: ["MRI_Report_2026.pdf", "witness_statement.pdf", "traffic_camera.mp4", "Scene_Reconstruction.pdf"],
    caveat: `Drawn from the gaps recorded against ${loc.caseName || "this case"}.`,
  };
}

function globalAnswer(q: string, source: GlobalSourceId): AssistantAnswer {
  const from = source === "precedent"
    ? "Reading precedent cases only — no data from this case file."
    : "Reading the public database only — no data from this case file.";
  if (/comparative negligence|contributory/i.test(q)) {
    return {
      headline: "Comparative negligence apportions responsibility rather than barring recovery outright.",
      points: [
        "Pure comparative jurisdictions reduce recovery by the plaintiff share of fault, however large that share is.",
        "Modified comparative jurisdictions bar recovery once that share crosses a threshold, commonly 50% or 51%.",
        "A small number of jurisdictions retain contributory negligence, where any plaintiff fault defeats the claim.",
        "Apportionment is generally a question for the finder of fact, informed by the evidence of each party conduct.",
      ],
      citations: [],
      caveat: `General principles only; the governing rule depends on the jurisdiction. ${from}`,
    };
  }
  return {
    headline: source === "precedent"
      ? "Ask about a doctrine, a line of authority or how a question has been decided, and I will set out the position from precedent."
      : "Ask about a statute, a filing or a public record, and I will set out what the public database holds.",
    points: [],
    citations: [],
    caveat: `General information, not advice on this matter. ${from}`,
  };
}

function stageAnswer(loc: AssistantLocation, q: string): AssistantAnswer {
  const label = loc.stageLabel ?? loc.pipelineStage ?? loc.pageLabel;
  if (loc.stageId === "medical" || /timeline|chronolog|date/i.test(q)) {
    return {
      headline: `Reading the ${label} stage only.`,
      points: [
        "Treatment runs continuously from the Feb 14 emergency admission through the June follow-up, leaving no gap to argue a break in causation.",
        "The Feb 16 imaging is the hinge — it turns a reported injury into a diagnosed one within 48 hours of the collision.",
        "One timing discrepancy is on record: the police report puts entry at about 9:04 AM, the witness recalls closer to 9:05 AM.",
        "The thinnest stretch is between the Apr 20 re-evaluation and the Jun 5 follow-up, where the record shows least activity.",
      ],
      citations: ["police_report_final.pdf", "witness_statement.pdf", "MRI_Report_2026.pdf", "physical_therapy_notes.pdf"],
    };
  }
  return {
    headline: `Nothing specific on that in ${label} yet — try liability, causation, damages, contradictions or gaps.`,
    points: [],
    citations: [],
  };
}

// Route a question to an answer within the chosen scope.
export function answer(q: string, ctx: ContextId, loc: AssistantLocation, source?: GlobalSourceId): AssistantAnswer {
  if (ctx === "global") return globalAnswer(q, source ?? "precedent");

  if (/contradict|conflict|discrepan|inconsisten/i.test(q)) return contradictions();
  if (/gap|missing|outstanding/i.test(q)) return evidenceGaps();
  if (/negligence.*violation|violation.*negligence|compare/i.test(q)) return negligenceVsViolations();
  // Asking for a summary that also calls out weaknesses wants the summary — it
  // already ends on the defense weaknesses. Only a pure weakness question goes
  // to the exposure list.
  if (/summar|overview|brief|complete|whole case/i.test(q)) return caseSummary(loc);
  if (/weakness|risk|defense|defence|opposing/i.test(q)) return exposures(loc);
  if (/liabilit/i.test(q)) return strongestLiabilityEvidence();
  if (/damage|valuation|quantum|demand|settle|negotiat/i.test(q)) return damagesFromEvidence();

  if (ctx === "stage") return stageAnswer(loc, q);
  if (ctx === "intake") {
    return {
      headline: "Nothing specific on that across intake yet — try what has been collected, what analysis found, or what is still outstanding.",
      points: [],
      citations: [],
    };
  }
  return caseSummary(loc);
}

// ── Work With: stage access ───────────────────────────────────────────────────
// A stage the attorney can pull documents from, in either pipeline. Choosing
// one never navigates the dashboard — it only widens what the assistant can
// reach. Kept deliberately separate from Context, which is reasoning scope.

export interface WorkStageDef { key: string; pipeline: "intake" | "workspace"; id: string; label: string }

export const INTAKE_STAGES = ["Collection", "Conflict Check", "Analysis", "Valuation", "Case Ready"] as const;

export const WORKSPACE_STAGE_IDS: StageId[] = [
  "overview", "medical", "economic", "noneconomic", "liability",
  "evidencehub", "evidence", "demand", "negotiation",
];

export const STAGE_TREE: { pipeline: "intake" | "workspace"; label: string; stages: WorkStageDef[] }[] = [
  {
    pipeline: "intake",
    label: "Case Intake Pipeline",
    stages: INTAKE_STAGES.map((s) => ({ key: `intake:${s}`, pipeline: "intake" as const, id: s, label: s })),
  },
  {
    pipeline: "workspace",
    label: "Case Workspace",
    stages: WORKSPACE_STAGE_IDS.map((id) => ({
      key: `workspace:${id}`, pipeline: "workspace" as const, id, label: STAGE_LABELS[id],
    })),
  },
];

// Documents reachable from a stage. Workspace stages reuse the same stage-scoped
// evidence the workspace itself shows; intake stages read the case file.
export function documentsForStage(
  stage: WorkStageDef | null,
  documents: CaseDocument[],
  findings: AnalysisFinding[],
): CaseDocument[] {
  if (!stage) return documents;
  if (stage.pipeline === "workspace") {
    return stageEvidence(stage.id as StageId, documents, { findings });
  }
  switch (stage.id) {
    case "Collection":
      return documents; // everything collected so far
    case "Analysis": {
      const cited = new Set(findings.flatMap((f) => [...f.sources, ...f.evidence.map((e) => e.file)]).map((n) => n.toLowerCase()));
      const hits = documents.filter((d) => cited.has(d.name.toLowerCase()));
      return hits.length > 0 ? hits : documents;
    }
    case "Valuation":
      return documents.filter((d) => /bill|invoice|wage|payroll|receipt|medical|mri|therapy|hospital/i.test(d.name));
    case "Case Ready":
      return documents.filter((d) => /demand|letter|insurance|policy|medical|wage/i.test(d.name));
    default:
      return documents;
  }
}

export function workStageLabel(stage: WorkStageDef | null, loc: AssistantLocation): string {
  if (stage) return stage.pipeline === "workspace" ? `${stage.label} · Case Workspace` : `${stage.label} · Case Intake`;
  // Falsy checks, not ??: pipelineStage is an empty string on pages outside the
  // intake pipeline, which would otherwise render a blank label.
  return loc.stageLabel || loc.pipelineStage || loc.pageLabel || "Current page";
}

// ── Scope-change notice ───────────────────────────────────────────────────────
// Shown inline in the conversation when the attorney changes scope by hand, so
// the change is never silent and never a popup.

// A short, plain notice shown inline when the reasoning scope actually changes.
// Work With changes never produce a message — they are UI state only.
export function contextChangeNotice(sel: ContextSel, loc: AssistantLocation): AssistantAnswer {
  const label = contextLabel(sel, loc);
  const line =
    sel.kind === "case" ? "You are now chatting with the Entire Case."
    : sel.kind === "global" ? `You are now researching ${globalSourceLabel(sel.source)} — no case data is used.`
    : sel.kind === "intake" ? "You are now chatting with the Case Intake Pipeline."
    : sel.kind === "workspace" ? "You are now chatting with the Case Workspace."
    : `You are now chatting with ${label}.`;
  return { headline: line, points: [], citations: [] };
}

