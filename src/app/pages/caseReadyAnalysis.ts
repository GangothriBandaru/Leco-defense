import { useMemo } from "react";
import type { CaseDocument } from "../types/case";
import { classifyDocuments, generateAnalysisFindings } from "../types/case";
import { liabilityForCase } from "../liability/liabilityData";
import { defendantsForCase } from "../defendants/defendantData";
import { VIOLATION_CARDS } from "../workspace/WorkspaceTabs";
import { buildCaseEvidence } from "../evidence/caseEvidence";
import { deriveDemand } from "../evidence/demandModel";
import { isReferenceCase, referenceDemand } from "../evidence/referenceCase";
import { useCaseDecisions } from "../evidence/decisionStore";
import { useCaseDetails } from "../intake/caseDetailsStore";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { resolveCaseFacts } from "../conflict/caseFacts";
import { useTracker } from "../tracker/trackerStore";

/** The Analysis-stage results Case Ready lists among its deliverables, read
 *  from the same sources and saved decisions the Analysis stage uses. */
export function useAnalysisDeliverables(caseData: any, documents: CaseDocument[]) {
  const caseId: string = caseData?.caseId ?? "PI-2024-001";
  const signals = useMemo(() => generateAnalysisFindings(classifyDocuments(documents)), [documents]);
  // As on the Analysis card: with a liability analysis on record, its defendant
  // elements, plaintiff checks and shared findings; otherwise the liability signals.
  const liabilityRecord = liabilityForCase(caseId);
  const liabilityDefendants = liabilityRecord ? defendantsForCase(caseId) : undefined;
  const liability = liabilityRecord && liabilityDefendants
    ? liabilityDefendants.candidates.reduce((n, c) => n + c.elements.filter((e) => e.kind).length, 0) + liabilityRecord.plaintiff.checks.length + liabilityRecord.sharedFindings.length
    : signals.filter((s) => s.kind === "liability").length;
  const injury = signals.filter((s) => s.kind === "injury").length;

  const evidence = useMemo(() => buildCaseEvidence(caseData, documents), [caseId, caseData?.caseType, caseData?.summary, documents]);
  const decisions = useCaseDecisions(caseId);
  const saved = useCaseDetails(caseId);
  const facts = useMemo(() => resolveCaseFacts(caseData, saved, resolveCasePolicy(caseData, documents)), [caseId, saved, documents]);
  const { requests } = useTracker(caseId);
  const demand = useMemo(() => isReferenceCase(caseId) ? referenceDemand() : deriveDemand(evidence, facts, requests, documents), [caseId, evidence, facts, requests, documents]);

  const conflictsDecided = evidence.conflicts.filter((c) => decisions.items[`conflict:${c.id}`]).length;
  const positionsSet = demand.claims.filter((c) => decisions.items[`claim:${c.id}`]).length;
  return {
    liability, injury, violations: VIOLATION_CARDS.length,
    conflicts: evidence.conflicts.length, conflictsDecided,
    claims: demand.claims.length, positionsSet,
  };
}
