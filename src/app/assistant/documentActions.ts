import { EVIDENCE_INTEL } from "../workspace/evidenceData";
import {
  fileName, suggestionsFor, STAGE_SUGGESTIONS,
  type AssistantAnswer, type ContextId, type GlobalSourceId, type WorkStageDef,
} from "./assistantEngine";
import type { AssistantLocation } from "./AssistantContext";

// ── Document actions ──────────────────────────────────────────────────────────
// Explicit verbs the attorney runs against the documents they selected.
// "Suggest tags" is the only one that proposes a change, and it never applies
// it — the panel renders a confirmation the attorney has to accept.

export type DocActionId =
  | "analyze" | "summarize" | "extract" | "compare"
  | "contradictions" | "classify" | "missing" | "insights" | "tags";

export const DOC_ACTIONS: { id: DocActionId; label: string; needsTwo?: boolean; mutates?: boolean }[] = [
  { id: "analyze", label: "Analyze" },
  { id: "summarize", label: "Summarize" },
  { id: "extract", label: "Extract information" },
  { id: "compare", label: "Compare", needsTwo: true },
  { id: "contradictions", label: "Identify contradictions" },
  { id: "classify", label: "Classify" },
  { id: "missing", label: "Identify missing information" },
  { id: "insights", label: "Generate insights" },
  { id: "tags", label: "Suggest tags / categories", mutates: true },
];

const intelFor = (doc: string) => EVIDENCE_INTEL[doc.toLowerCase()];

// A change the assistant proposes but will not apply on its own. Shaped as a
// before/after on one section so the attorney can see exactly what would move.
export interface DocProposal {
  doc: string;
  section: string;
  current: string;
  proposed: string;
}

export function proposalFor(doc: string): DocProposal | null {
  const i = intelFor(doc);
  if (!i) return null;
  const proposed = /mri|xray|imaging|hospital|medical|therapy|er_/i.test(doc)
    ? "Medical Records"
    : /police|officer|witness|dispatch/i.test(doc)
    ? "Police Reports"
    : /insurance|policy|claim/i.test(doc)
    ? "Insurance Documents"
    : /wage|payroll/i.test(doc)
    ? "Wage Loss Records"
    : "General Documents";
  return { doc, section: "Category", current: "General Documents", proposed };
}

export function documentAction(action: DocActionId, docs: string[], stageLabel: string): AssistantAnswer {
  const named = docs.map((d) => fileName(d));
  const withIntel = docs.filter((d) => intelFor(d));

  if (withIntel.length === 0) {
    return {
      headline: `No analysis is on file for the selected document${docs.length === 1 ? "" : "s"}.`,
      points: docs.map((d) => `${fileName(d)} has not been through detailed analysis, so I will not invent findings for it.`),
      citations: named,
      caveat: "Run analysis on the document in the Evidence stage first.",
    };
  }

  switch (action) {
    case "summarize":
      return {
        headline: `Summary of ${named.length} document${named.length === 1 ? "" : "s"} from ${stageLabel}.`,
        points: withIntel.map((d) => `${intelFor(d)!.title} — ${intelFor(d)!.summary}`),
        citations: named,
      };

    case "extract":
      return {
        headline: "Extracted facts from the selected documents.",
        points: withIntel
          .flatMap((d) => intelFor(d)!.keyFacts.map((f) => `${fileName(d)}: ${f.text}${f.verified ? "" : " (AI interpretation)"}`))
          .slice(0, 10),
        citations: named,
        caveat: "Verified facts and AI interpretation are marked separately.",
      };

    case "compare": {
      if (withIntel.length < 2) {
        return { headline: "Select at least two analysed documents to compare.", points: [], citations: named };
      }
      const [a, b] = withIntel;
      return {
        headline: `Comparing ${fileName(a)} and ${fileName(b)}.`,
        points: [
          `${intelFor(a)!.title}: ${intelFor(a)!.summary}`,
          `${intelFor(b)!.title}: ${intelFor(b)!.summary}`,
          `On liability — ${fileName(a)}: ${intelFor(a)!.impact.liability} ${fileName(b)}: ${intelFor(b)!.impact.liability}`,
          `On damages — ${fileName(a)}: ${intelFor(a)!.impact.damages} ${fileName(b)}: ${intelFor(b)!.impact.damages}`,
          `Confidence — ${fileName(a)}: ${intelFor(a)!.confidence.score}%, ${fileName(b)}: ${intelFor(b)!.confidence.score}%.`,
        ],
        citations: named,
      };
    }

    case "contradictions": {
      const found = withIntel.filter((d) => intelFor(d)!.contradictions.length > 0);
      if (found.length === 0) {
        return { headline: "No contradictions are recorded against the selected documents.", points: [], citations: named };
      }
      return {
        headline: `${found.length} of the selected documents carry a recorded discrepancy.`,
        points: found.flatMap((d) =>
          intelFor(d)!.contradictions.map((c) => `${c.source}: "${c.text}" against ${c.against}: "${c.againstText}"`),
        ),
        citations: named,
        caveat: "Flagged to reconcile, not proof that either account is wrong.",
      };
    }

    case "classify":
      return {
        headline: "Classification of the selected documents.",
        points: withIntel.map((d) => {
          const p = proposalFor(d);
          return `${fileName(d)} — ${p?.section}: ${p?.proposed}`;
        }),
        citations: named,
        caveat: "Classification only. Nothing on the documents has been changed.",
      };

    case "missing":
      return {
        headline: "What is missing from the selected documents.",
        points: withIntel.flatMap((d) => intelFor(d)!.gaps.map((g) => `${fileName(d)}: ${g}`)),
        citations: named,
      };

    case "insights":
      return {
        headline: `Insights across ${named.length} selected document${named.length === 1 ? "" : "s"}.`,
        points: withIntel.map(
          (d) => `${intelFor(d)!.title} — ${intelFor(d)!.impact.settlement} Overall impact ${intelFor(d)!.impact.overall}.`,
        ),
        citations: named,
      };

    case "tags":
      return {
        headline: "Proposed tags and categories for the selected documents.",
        points: ["Review the proposal below. Nothing is applied until you confirm it."],
        citations: named,
        caveat: "Legal documents are never modified without your explicit confirmation.",
      };

    case "analyze":
    default:
      return {
        headline: `Analysis of ${named.length} document${named.length === 1 ? "" : "s"} from ${stageLabel}.`,
        points: withIntel.flatMap((d) => [
          `${intelFor(d)!.title} — ${intelFor(d)!.summary}`,
          `Liability: ${intelFor(d)!.impact.liability} Causation: ${intelFor(d)!.impact.causation}`,
          `Confidence ${intelFor(d)!.confidence.level}, ${intelFor(d)!.confidence.score}%.`,
        ]),
        citations: named,
      };
  }
}

// ── Suggestions that follow the working stage ─────────────────────────────────

const INTAKE_SUGGESTIONS: Record<string, string[]> = {
  Collection: ["What documents are still missing?", "Is collection complete?", "What should be collected next?"],
  "Conflict Check": ["Which parties still need a conflict search?", "What case details are missing?", "Which deadlines are unverified?"],
  Analysis: ["What are the strongest findings?", "What evidence needs further analysis?", "Are there contradictions?"],
  Valuation: [
    "Which damages figures are best supported?",
    "What drives the current valuation?",
    "What documentation is missing for damages?",
  ],
  "Case Ready": ["Is the case ready to proceed?", "What still blocks the demand?", "What should the demand emphasise?"],
};

// A chosen working stage drives the suggestions; otherwise the scope does.
export function suggestionsForWork(
  ctx: ContextId,
  loc: AssistantLocation,
  stage: WorkStageDef | null,
  source?: GlobalSourceId,
): string[] {
  if (stage) {
    if (stage.pipeline === "intake") return INTAKE_SUGGESTIONS[stage.id] ?? suggestionsFor(ctx, loc, source);
    const byStage = STAGE_SUGGESTIONS[stage.id];
    if (byStage) return byStage;
  }
  if (ctx === "stage" && !loc.stageId && loc.pipelineStage && INTAKE_SUGGESTIONS[loc.pipelineStage]) {
    return INTAKE_SUGGESTIONS[loc.pipelineStage];
  }
  return suggestionsFor(ctx, loc, source);
}
