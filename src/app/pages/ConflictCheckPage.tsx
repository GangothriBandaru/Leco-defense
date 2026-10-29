import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { StageNavigator } from "../components/StageNavigator";
import type { CaseDocument } from "../types/case";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { type CaseDetails, saveCaseDetails, useCaseDetails } from "../intake/caseDetailsStore";
import { resolveCaseFacts, join } from "../conflict/caseFacts";
import { type Party, useConflictRecord, partyState, overallState } from "../conflict/conflictStore";
import { CaseIntelligenceSummary } from "../conflict/CaseIntelligenceSummary";
import { ConflictSearch } from "../conflict/ConflictSearch";
import { CaseDetailsForm, validateCaseDetails } from "../conflict/CaseDetailsForm";

type Tab = "conflict" | "details";
const TABS: { key: Tab; label: string }[] = [
  { key: "conflict", label: "Conflict Check" },
  { key: "details", label: "Case Details" },
];

const FIELD_LABEL: Record<string, string> = {
  insuredName: "insured name", insuredType: "insured type", plaintiffName: "plaintiff name", caseStatus: "whether a suit has been filed",
  suitFiledDate: "suit filed date", courtName: "court name",
};

// Unsaved Case Details edits, per case, kept while the app is open so leaving
// Stage 2 and coming back doesn't lose them.
const draftCache = new Map<string, CaseDetails>();

const same = (a: CaseDetails, b: CaseDetails) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CaseDetails>;
  for (const k of keys) if ((a[k] ?? "").trim() !== (b[k] ?? "").trim()) return false;
  return true;
};

/** Stage 2 — Conflict Check & Initial Case Details. */
export function ConflictCheckPage({ caseData, documents, onStageClick, onBackToIntake, onProceedToAnalysis }: {
  caseData: any;
  documents: CaseDocument[];
  onStageClick: (stage: string) => void;
  onBackToIntake: () => void;
  onProceedToAnalysis: () => void;
}) {
  const caseId: string = caseData?.caseId ?? "";
  const saved = useCaseDetails(caseId);
  const policy = useMemo(() => resolveCasePolicy(caseData, documents), [caseData, documents]);
  const facts = useMemo(() => resolveCaseFacts(caseData, saved, policy), [caseData, saved, policy]);

  const [tab, setTab] = useState<Tab>("conflict");
  // The form's working copy lives here, so switching tabs keeps unsaved edits.
  const [draft, setDraft] = useState<CaseDetails>(() => draftCache.get(caseId) ?? facts);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = !same(draft, facts);
  // Saved values that change elsewhere flow into a form with no edits of its own.
  const [base, setBase] = useState(facts);
  useEffect(() => {
    if (same(facts, base)) return;
    setBase(facts);
    if (same(draft, base)) setDraft(facts);
  }, [facts]);
  const errors = validateCaseDetails(draft);
  useEffect(() => {
    if (dirty) draftCache.set(caseId, draft); else draftCache.delete(caseId);
  }, [draft, dirty, caseId]);
  // A reload or closed tab would drop unsaved edits; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    setShowErrors(true);
    if (Object.keys(errors).length) {
      toast("Fix the highlighted fields before saving.");
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>("[aria-invalid=true]");
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 30);
      return;
    }
    const stored = saveCaseDetails(caseId, draft);
    setShowErrors(false);
    toast(stored ? "Case details saved" : "Saved for this session only. The browser didn't store it, so it will be lost on refresh.");
  };
  const discard = () => { setDraft(facts); setShowErrors(false); };

  const record = useConflictRecord(caseId);
  const parties: Party[] = [
    { key: "insured", role: "insured", label: "Insured", name: facts.insuredName ?? "", location: join(facts.insuredState, facts.insuredCountry) || undefined },
    { key: "plaintiff", role: "plaintiff", label: "Plaintiff", name: facts.plaintiffName ?? "", location: join(facts.plaintiffLocation, facts.plaintiffState) || undefined },
    { key: "counsel", role: "counsel", label: "Plaintiff's counsel", name: facts.counselName ?? "", location: facts.counselAddress },
    { key: "firm", role: "firm", label: "Plaintiff's law firm", name: facts.counselFirm ?? "", location: facts.counselAddress },
    { key: "carrier", role: "carrier", label: "Insurance carrier", name: facts.insurerName ?? "", location: facts.insurerJurisdiction },
    ...record.others.map((o): Party => ({ key: `other:${o.id}`, role: "other", label: o.role, name: o.name, details: o.details })),
  ];
  const states = parties.map((p) => partyState(p, record.checks[p.key]));
  const overall = overallState(states);

  // What stops the move to Analysis: the conflict gate, and the required case details as saved.
  const savedErrors = validateCaseDetails(facts);
  const count = (pred: (s: (typeof states)[number]) => boolean) => states.filter(pred).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const blockers = [
    overall === "conflict" && "A conflict is confirmed. The matter can't be opened.",
    count((s) => s === "missing") > 0 && `Add the ${parties.filter((_, i) => states[i] === "missing").map((p) => p.label.toLowerCase()).join(" and ")} name${count((s) => s === "missing") === 1 ? "" : "s"} in Case Details so ${count((s) => s === "missing") === 1 ? "it" : "they"} can be searched.`,
    count((s) => s === "pending") > 0 && `Record the conflict search for ${plural(count((s) => s === "pending"), "party", "parties")}.`,
    count((s) => s === "review") > 0 && `Resolve ${plural(count((s) => s === "review"), "possible match", "possible matches")}.`,
    count((s) => s === "escalated") > 0 && `Record general counsel's decision on ${plural(count((s) => s === "escalated"), "escalated match", "escalated matches")}.`,
    Object.keys(savedErrors).length > 0 && `Save the required case details: ${Object.keys(savedErrors).map((k) => FIELD_LABEL[k] ?? k).join(", ")}.`,
  ].filter(Boolean) as string[];

  const goToDetails = () => {
    setTab("details");
    window.setTimeout(() => {
      const el = document.getElementById(!facts.counselName ? "cd-counselName" : "cd-counselFirm");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    }, 30);
  };

  return (
    <div className="min-h-screen bg-wash">
      <div className="bg-white sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onBackToIntake} className="flex items-center gap-2 secondary-text hover:text-ink transition-colors">
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to Case Intake
            </button>
            <div className="secondary-text ml-auto truncate">
              Case Intake <span className="mx-2">›</span>
              <span className="text-ink font-medium">{caseData?.caseName}</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Conflict Check" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
        <h1 className="text-[24px] font-semibold leading-tight">
          <span className="text-[#5B6B78]">Stage 2 -</span> <span className="text-ink">Conflict Check &amp; Case Details</span>
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)] gap-6 items-start">
          {/* The summary stays in view below the stage bar while the right-hand
              content scrolls; it keeps its own height, capped to the viewport. */}
          <div className="min-w-0 lg:sticky lg:top-[171px] lg:max-h-[calc(100vh-251px)] lg:flex lg:flex-col">
            <CaseIntelligenceSummary d={facts} dirty={dirty} blockers={blockers} onProceed={onProceedToAnalysis} />
          </div>

          <div className="min-w-0 space-y-4">
            <div role="tablist" aria-label="Stage 2" className="lg-card p-1.5 flex items-center gap-1.5"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const next = TABS[(TABS.findIndex((t) => t.key === tab) + 1) % TABS.length].key;
                setTab(next);
                window.setTimeout(() => document.getElementById(`s2-tab-${next}`)?.focus(), 0);
              }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  id={`s2-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls={`s2-panel-${t.key}`}
                  tabIndex={tab === t.key ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                    tab === t.key ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div id="s2-panel-conflict" role="tabpanel" aria-labelledby="s2-tab-conflict" hidden={tab !== "conflict"}>
              <ConflictSearch caseId={caseId} parties={parties} record={record} caseType={facts.caseType} onAddNames={goToDetails} />
            </div>
            <div id="s2-panel-details" role="tabpanel" aria-labelledby="s2-tab-details" hidden={tab !== "details"}>
              <CaseDetailsForm
                draft={draft}
                setDraft={setDraft}
                errors={errors}
                showErrors={showErrors}
                documents={documents}
                dirty={dirty}
                saved={facts}
                onSave={save}
                onDiscard={discard}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}