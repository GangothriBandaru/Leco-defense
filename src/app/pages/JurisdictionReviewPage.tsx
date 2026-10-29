import { useState } from "react";
import {
  ChevronLeft, ChevronRight, ArrowRight, Scale, Gavel, CalendarClock, AlertTriangle,
  CheckCircle, Circle, FileText, HelpCircle, ShieldCheck, Flag, Info,
} from "lucide-react";
import { StageNavigator } from "../components/StageNavigator";
import { useWorkspaceModel } from "../workspace/useWorkspaceModel";
import {
  FORUM_ROWS, FAULT_RULES, faultResult, faultRangeLabel, jurisdictionForCase, deadlineDate,
  formatDate, workingDeadline, initialDecision,
  type CaseJurisdiction, type CandidateForum, type ForumCell, type ForumRowKey,
  type Severity, type AttorneyDecision, type AuditEntry, type Confidence,
} from "../jurisdiction/jurisdictionData";

// ── Attorney Jurisdiction Review ─────────────────────────────────────────────
// Stage 3 Analysis → Jurisdiction. Renders the open case's jurisdiction record
// (jurisdictionData) and holds the attorney's decision on it. The system lays
// out the forums, the fault picture and the deadlines; the attorney decides.

const NA = "Not available";
const REVIEWER = "J. Davis";
const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const SEVERITY_PILL: Record<Severity, string> = { HIGH: "pill-risk", MEDIUM: "pill-progress", LOW: "pill-neutral" };
const CONFIDENCE_PILL: Record<Confidence, string> = { High: "pill-complete", Medium: "pill-neutral", Low: "pill-progress" };

// Status surfaces — the palettes of the existing complete / progress pills.
const SUCCESS_CARD = "rounded-xl border border-[#D1FADF] bg-[#ECFDF3] p-4";
const WARNING_CARD = "rounded-xl border border-[#FDE6C8] bg-[#FFF7ED] p-4";
const WARN_TEXT = "text-[#B45309]";

const TABS = [
  { id: "forums", label: "Forum comparison" },
  { id: "fault", label: "Fault impact" },
  { id: "deadlines", label: "Deadlines" },
  { id: "facts", label: "Facts & sources" },
  { id: "parties", label: "Parties & regimes" },
  { id: "missing", label: "Missing data & assumptions" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface Props {
  caseData?: any;
  decision?: AttorneyDecision;
  onDecisionChange: (next: AttorneyDecision) => void;
  onBack: () => void;
  onStageClick?: (stageName: string) => void;
}

// ── Shared pieces ────────────────────────────────────────────────────────────

const th = "text-left px-4 py-3 eyebrow border-b border-line";

function BarredPill() {
  return <span className="pill pill-risk">Barred</span>;
}

function CellValue({ cell }: { cell: ForumCell }) {
  return (
    <span className={`text-sm font-medium leading-snug ${cell.tone === "warning" ? WARN_TEXT : "text-ink"}`}>
      {cell.value}
      {cell.uncertain && <span className={`${WARN_TEXT} font-semibold`} title="Uncertain">?</span>}
    </span>
  );
}

function Muted({ value }: { value: string | null | undefined }) {
  return value ? <>{value}</> : <span className="text-[#8A98A3]">{NA}</span>;
}

/** The fault result for a rule across the client-fault estimate. */
function resultOverRange(record: CaseJurisdiction, rule: CandidateForum["appliedRule"]) {
  const e = record.fault.estimate;
  if (!e) return null;
  const lo = faultResult(rule, e.low);
  const hi = faultResult(rule, e.high);
  if (lo.barred && hi.barred) return { barred: true, label: "Barred" };
  if (!lo.barred && !hi.barred) return { barred: false, label: `${100 - e.high}–${100 - e.low}% of damages` };
  return { barred: false, label: `Barred above ${e.low}%` };
}

// ── Tab 1 — Forum comparison ─────────────────────────────────────────────────

function ForumComparison({ record }: { record: CaseJurisdiction }) {
  const e = record.fault.estimate;
  const rowLabel = (key: ForumRowKey, label: string) =>
    key === "resultAtFault" && e ? `Result at ${faultRangeLabel(e)} client fault` : label;

  const cell = (f: CandidateForum, key: ForumRowKey) => {
    if (key === "resultAtFault") {
      const r = resultOverRange(record, f.appliedRule);
      if (!r) return <CellValue cell={{ value: "Not available — no client-fault estimate", tone: "warning" }} />;
      return r.barred ? <BarredPill /> : <CellValue cell={{ value: r.label }} />;
    }
    if (key === "deadline") {
      const row = record.deadlines.find((d) => d.id === f.deadlineId);
      if (!row) return <CellValue cell={{ value: NA, tone: "warning" }} />;
      return <CellValue cell={{ value: formatDate(deadlineDate(row)), uncertain: row.status === "Uncertain" }} />;
    }
    return <CellValue cell={f.cells[key]} />;
  };

  return (
    <div className="space-y-3">
      <p className="secondary-text">
        Each column is a place the case could be filed. Rules come from the likely governing law under that forum's choice-of-law approach.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        {/* Fixed proportions: the labels take a third, the forums share the
            rest and wrap. Only below ~520px does the table scroll, inside
            its own frame. */}
        <table className="w-full min-w-[520px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[30%]" />
            {record.forums.map((f) => <col key={f.id} />)}
          </colgroup>
          <thead>
            <tr className="bg-wash">
              <th className={`${th} sticky left-0 z-10 bg-wash`}>&nbsp;</th>
              {record.forums.map((f) => (
                <th key={f.id} className="text-left px-4 py-3 border-b border-l border-line align-top break-words">
                  <div className="text-sm font-semibold text-ink">{f.title}</div>
                  <div className="text-xs text-[#5B6B78] font-normal mt-0.5">{f.court}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {FORUM_ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-white text-left px-4 py-3 align-top text-sm font-medium text-[#5B6B78]">
                  {rowLabel(r.key, r.label)}
                </th>
                {record.forums.map((f) => (
                  <td key={f.id} className="px-4 py-3 align-top border-l border-line break-words">{cell(f, r.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#5B6B78]">
        Each rule links to its citation and last-verified date in the live system. The system shows options only; it does not recommend a forum.
      </p>
    </div>
  );
}

// ── Tab 2 — Fault impact ─────────────────────────────────────────────────────

function FaultImpact({ record }: { record: CaseJurisdiction }) {
  const [fault, setFault] = useState(10);
  const e = record.fault.estimate;
  const laws = new Set(record.forums.map((f) => f.cells.governingLaw.value));
  const rules = new Set(record.forums.map((f) => f.appliedRule));
  const law = [...laws][0];

  return (
    <div className="space-y-5">
      <p className="secondary-text">
        How the client's share of fault affects recovery under the rule each forum would likely apply. Fault is decided by a jury, so the estimate is a range.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="lg-zone lg-zone-grey p-4">
          <div className="eyebrow mb-1.5">Client fault estimate</div>
          {e ? (
            <>
              <div className="kpi-value" style={{ fontSize: "26px" }}>{faultRangeLabel(e)}</div>
              <p className="text-xs text-[#5B6B78] mt-1">From {e.source} · confidence: {e.confidence}</p>
            </>
          ) : (
            <>
              <div className={`text-base font-semibold ${WARN_TEXT}`}>{NA}</div>
              <p className="text-xs text-[#5B6B78] mt-1">The liability analysis has not estimated a client share of fault.</p>
            </>
          )}
        </div>
        <div className="lg-zone lg-zone-grey p-4">
          <div className="eyebrow mb-1.5">Evidence</div>
          <ul className="space-y-1">
            {record.fault.evidence.map((ev) => (
              <li key={ev} className="text-sm text-ink leading-snug">{ev}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Test a fault level */}
      <div className="rounded-xl border border-line bg-white p-4">
        <label htmlFor="fault-level" className="card-title block">Test a client fault level: {fault}%</label>
        <input
          id="fault-level"
          type="range"
          min={0}
          max={70}
          value={fault}
          onChange={(ev) => setFault(Number(ev.target.value))}
          className="w-full mt-3 accent-[#3FB5D7]"
        />
        <div className="flex items-center justify-between text-xs text-[#5B6B78] mt-1">
          <span>0%</span>
          <span>Estimate {e ? faultRangeLabel(e) : NA}</span>
          <span>70%</span>
        </div>
      </div>

      <div>
        <h4 className="card-title mb-2">Result by forum at {fault}% client fault</h4>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[600px] border-collapse">
            <thead><tr className="bg-wash">{["Forum", "Forum's own rule", "Rule likely applied", "Result"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="bg-white">
              {record.forums.map((f) => {
                const r = faultResult(f.appliedRule, fault);
                return (
                  <tr key={f.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{f.title}<div className="text-xs font-normal text-[#5B6B78]">{f.court}</div></td>
                    <td className="px-4 py-3 text-sm text-ink">{f.ownRuleLabel}</td>
                    <td className="px-4 py-3 text-sm text-ink">{f.appliedRuleLabel}</td>
                    <td className="px-4 py-3">{r.barred ? <BarredPill /> : <span className="text-sm font-semibold text-ink">{r.label}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="card-title mb-2">Reference: every fault rule at {fault}% client fault</h4>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[600px] border-collapse">
            <thead><tr className="bg-wash">{["Rule", "How it works", "Example states", "Result"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="bg-white">
              {FAULT_RULES.map((rule) => {
                const r = faultResult(rule.id, fault);
                return (
                  <tr key={rule.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{rule.name}</td>
                    <td className="px-4 py-3 text-sm text-ink">{rule.how}</td>
                    <td className="px-4 py-3 text-sm text-[#5B6B78]">{rule.examples}</td>
                    <td className="px-4 py-3">{r.barred ? <BarredPill /> : <span className="text-sm font-semibold text-ink">{r.label}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#5B6B78] mt-2">Example states come from the rule table and must be verified.</p>
      </div>

      <div>
        <h4 className="card-title mb-2">Exceptions that can save the claim under contributory negligence</h4>
        {record.fault.exceptions.length > 0 ? (
          <div className="space-y-2">
            {record.fault.exceptions.map((x) => (
              <div key={x.name} className="rounded-xl border border-line bg-white p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{x.name}</span>
                  <span className={`pill ${x.status === "POSSIBLE" ? "pill-progress" : "pill-neutral"}`}>{x.status}</span>
                </div>
                <p className="body-text leading-relaxed mt-1">{x.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="secondary-text">{record.fault.exceptionsNote ?? "None identified."}</p>
        )}
      </div>

      {laws.size === 1 && rules.size === 1 && (
        <div className="rounded-xl bg-[#F6FDFF] border border-[#D6F2F7] p-4 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-deep shrink-0 mt-0.5" strokeWidth={1.75} />
          <p className="body-text leading-relaxed">
            <strong className="font-semibold text-ink">Choice of law: not debatable here.</strong>{" "}
            All {record.forums.length === 2 ? "both" : record.forums.length} forums likely apply {law} law, so changing forums does not change the fault rule.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab 3 — Deadlines ────────────────────────────────────────────────────────

function Deadlines({ record }: { record: CaseJurisdiction }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="secondary-text">One row per forum and claim. Select a row to see how the deadline was calculated.</p>
      <div className="rounded-xl border border-line divide-y divide-line bg-white">
        {record.deadlines.map((d) => {
          const expanded = open === d.id;
          const uncertain = d.status === "Uncertain";
          return (
            <div key={d.id}>
              <button
                onClick={() => setOpen(expanded ? null : d.id)}
                aria-expanded={expanded}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_130px_100px_150px_60px] items-center gap-3 px-4 py-3 text-left hover:bg-wash transition-colors"
              >
                <span className="text-sm font-semibold text-ink">{d.forum} · {d.claim}</span>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {formatDate(deadlineDate(d))}{uncertain && <span className={WARN_TEXT}>?</span>}
                </span>
                <span className="hidden md:block"><span className={`pill ${uncertain ? "pill-progress" : "pill-neutral"}`}>{d.status}</span></span>
                <span className="hidden md:block text-xs text-[#5B6B78]">Confidence: <span className="font-semibold text-ink">{d.confidence}</span></span>
                <span className="hidden md:block text-xs font-semibold text-deep text-right">{expanded ? "Hide" : "Details"}</span>
              </button>
              {expanded && (
                <dl className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2 bg-wash border-t border-line pt-3">
                  {[
                    ["Start date", d.startLabel],
                    ["Period", d.periodLabel],
                    ["Adjustments", d.adjustments],
                    ["Rule source", d.ruleSource],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="eyebrow pt-0.5">{k}</dt>
                      <dd className="text-sm text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 4 — Facts & sources ──────────────────────────────────────────────────

function Facts({ record }: { record: CaseJurisdiction }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[720px] border-collapse">
        <thead><tr className="bg-wash">{["Field", "Value", "Source", "Confidence", "Verified"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="bg-white">
          {record.facts.map((f) => (
            <tr key={f.field} className="border-b border-line last:border-b-0 align-top">
              <td className="px-4 py-3 text-sm text-[#5B6B78]">{f.field}</td>
              <td className="px-4 py-3 text-sm font-semibold text-ink"><Muted value={f.value} /></td>
              <td className="px-4 py-3 text-sm text-ink"><Muted value={f.source} /></td>
              <td className="px-4 py-3">{f.confidence ? <span className={`pill ${CONFIDENCE_PILL[f.confidence]}`}>{f.confidence}</span> : <span className="text-sm text-[#8A98A3]">—</span>}</td>
              <td className="px-4 py-3 text-sm">
                {f.verified
                  ? <span className="inline-flex items-center gap-1 text-[#15803D] font-semibold"><CheckCircle className="w-3.5 h-3.5" strokeWidth={2} /> Yes</span>
                  : <span className={`${WARN_TEXT} font-semibold`}>No{f.verifiedNote ? ` (${f.verifiedNote})` : ""}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab 5 — Parties & regimes ────────────────────────────────────────────────

function PartiesAndRegimes({ record }: { record: CaseJurisdiction }) {
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] border-collapse">
          <thead><tr className="bg-wash">{["Party", "Role · type", "Citizenship", "Basis", "Diversity"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="bg-white">
            {record.parties.map((p) => (
              <tr key={p.name} className="border-b border-line last:border-b-0 align-top">
                <td className="px-4 py-3 text-sm font-semibold text-ink">{p.name}</td>
                <td className="px-4 py-3 text-sm text-ink">{p.roleType}</td>
                <td className={`px-4 py-3 text-sm ${p.citizenshipWarn ? `${WARN_TEXT} font-semibold` : "text-ink"}`}><Muted value={p.citizenship} /></td>
                <td className="px-4 py-3 text-sm text-ink"><Muted value={p.basis} /></td>
                <td className="px-4 py-3 text-sm">
                  {p.diversity === "Unconfirmed" ? <span className="pill pill-progress">Unconfirmed</span>
                    : p.diversity === "Diverse" ? <span className="pill pill-complete">Diverse</span>
                    : p.diversity === "Not diverse" ? <span className="pill pill-risk">Not diverse</span>
                    : <span className="text-[#8A98A3]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg-zone lg-zone-grey p-4">
        <div className="eyebrow mb-1.5">Special regimes and immunities</div>
        <p className="body-text leading-relaxed">{record.specialRegimes}</p>
      </div>
    </div>
  );
}

// ── Tab 6 — Missing data & assumptions ───────────────────────────────────────

function MissingData({ record }: { record: CaseJurisdiction }) {
  return (
    <div className="space-y-3">
      {record.assumptions.map((a) => (
        <div key={a.title} className="rounded-xl border border-line bg-white p-4">
          <span className={`pill ${a.kind === "MISSING" ? "pill-risk" : "pill-neutral"}`}>{a.kind}</span>
          <h4 className="card-title mt-2">{a.title}</h4>
          <p className="body-text leading-relaxed mt-1">{a.detail}</p>
        </div>
      ))}
    </div>
  );
}

// ── Attorney decision entry point ────────────────────────────────────────────
// A compact button beside the page heading, so the attorney knows from the
// start that a decision is needed — and where it stands. It leads to the one
// Attorney Decision panel in the workspace; it is not a second form.

function DecisionCta({ decision, onGo }: { decision: AttorneyDecision; onGo: () => void }) {
  const state = {
    open: { label: "Attorney Decision Required", badge: "Action required", tone: "bg-[#FFF7ED] text-[#B45309] border-[#FDE6C8]" },
    "needs-info": { label: "Attorney Decision Pending", badge: "More info requested", tone: "bg-[#FFF7ED] text-[#B45309] border-[#FDE6C8]" },
    escalated: { label: "Attorney Decision Pending", badge: "Escalated", tone: "bg-[#FFF7ED] text-[#B45309] border-[#FDE6C8]" },
    approved: { label: "View Attorney Decision", badge: "Approved", tone: "bg-[#ECFDF3] text-[#15803D] border-[#D1FADF]" },
  }[decision.status];
  return (
    <button
      onClick={onGo}
      className="inline-flex items-center justify-center flex-wrap gap-2 max-w-full pl-3.5 pr-3 py-2 bg-brand hover:bg-deep text-white rounded-lg text-sm font-semibold transition-colors"
    >
      {state.label}
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold ${state.tone}`}>
        {decision.status === "approved"
          ? <CheckCircle className="w-3 h-3" strokeWidth={2} />
          : <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" aria-hidden />}
        {state.badge}
      </span>
      <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
    </button>
  );
}

// ── Attorney decision ────────────────────────────────────────────────────────

function DecisionPanel({
  record, decision, onChange, highlight,
}: { record?: CaseJurisdiction; decision: AttorneyDecision; onChange: (next: AttorneyDecision) => void; highlight?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  // Changing the governing law, forums or deadline after approval sends the
  // decision back for sign-off; the change is logged.
  const set = (patch: Partial<AttorneyDecision>) => {
    setError(null);
    const reopens = decision.status === "approved" && ("governingLaw" in patch || "forums" in patch || "deadlineConfirmed" in patch);
    onChange(reopens
      ? { ...decision, ...patch, status: "open", audit: [...decision.audit, { at: now(), action: "Changed after approval — returned for sign-off" }] }
      : { ...decision, ...patch });
  };

  const finding = record?.governingLaw.finding ?? null;
  const working = workingDeadline(record);
  const overridden = !!finding && !!decision.governingLaw && decision.governingLaw !== finding;
  const forumTitle = (id: string) => record?.forums.find((f) => f.id === id)?.title ?? id;

  const stamp = () => ({ reviewer: REVIEWER, decidedAt: now() });

  const approve = () => {
    if (!decision.deadlineConfirmed) return setError("Confirm the working deadline before approving.");
    if (decision.forums.length === 0) return setError("Choose at least one forum to plan around.");
    if (!decision.governingLaw) return setError("Choose the governing law before approving.");
    if (overridden && !decision.reason.trim()) return setError("Give the reason for changing the system finding before approving.");
    const s = stamp();
    const audit: AuditEntry[] = [
      ...(overridden ? [{ at: s.decidedAt, action: "Governing law overridden", from: finding!, to: decision.governingLaw, reason: decision.reason.trim() }] : []),
      { at: s.decidedAt, action: "Approved and calendared deadlines", detail: `${decision.forums.map(forumTitle).join(", ")} · ${formatDate(working?.iso)}` },
    ];
    onChange({ ...decision, ...s, status: "approved", audit: [...decision.audit, ...audit] });
    setError(null);
  };
  const needsInfo = () => {
    const s = stamp();
    onChange({ ...decision, ...s, status: "needs-info", audit: [...decision.audit, { at: s.decidedAt, action: "Needs more info" }] });
    setError(null);
  };
  const escalate = () => {
    const s = stamp();
    onChange({ ...decision, ...s, status: "escalated", audit: [...decision.audit, { at: s.decidedAt, action: "Escalated" }] });
    setError(null);
  };

  const tasks = (record?.assumptions ?? []).filter((a) => a.kind === "MISSING" && a.task).map((a) => a.task!);
  const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand transition-colors disabled:bg-wash disabled:text-[#5B6B78]";

  return (
    <div
      id="attorney-decision"
      tabIndex={-1}
      aria-label="Attorney decision"
      className={`lg-card p-5 space-y-5 scroll-mt-[170px] outline-none transition-shadow duration-500 ${highlight ? "ring-2 ring-brand ring-offset-2 ring-offset-wash" : ""}`}
    >
      <h3 className="section-header">Attorney decision</h3>

      {/* Governing law */}
      <div>
        <label className="eyebrow block mb-1.5" htmlFor="governing-law">Governing law</label>
        <select id="governing-law" value={decision.governingLaw} onChange={(ev) => set({ governingLaw: ev.target.value })} className={field}>
          {!finding && <option value="">Not yet determined</option>}
          {(record?.governingLawOptions ?? []).map((o) => (
            <option key={o} value={o}>{o === finding ? `${o} (system finding)` : o}</option>
          ))}
        </select>
        {!finding && <p className={`text-xs ${WARN_TEXT} mt-1`}>Attorney review required — no system finding yet.</p>}
      </div>

      {/* Forums */}
      <div>
        <div className="eyebrow mb-1.5">Forums to plan around</div>
        {record && record.forums.length > 0 ? (
          <div className="space-y-2">
            {record.forums.map((f) => {
              const on = decision.forums.includes(f.id);
              return (
                <label key={f.id} className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors cursor-pointer ${on ? "border-brand bg-tint" : "border-line bg-white hover:border-soft"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                   
                    onChange={() => set({ forums: on ? decision.forums.filter((x) => x !== f.id) : [...decision.forums, f.id] })}
                    className="mt-0.5 accent-[#3FB5D7]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{f.title}</span>
                    <span className="block text-xs text-[#5B6B78]">{f.court}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : <p className="text-sm text-[#8A98A3]">No candidate forums determined yet — needs attorney review.</p>}
      </div>

      {/* Working deadline */}
      <div>
        <div className="eyebrow mb-1.5">Working deadline</div>
        {working ? (
          <label className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors cursor-pointer ${decision.deadlineConfirmed ? "border-brand bg-tint" : "border-line bg-white hover:border-soft"}`}>
            <input
              type="checkbox"
              checked={decision.deadlineConfirmed}
             
              onChange={(ev) => set({ deadlineConfirmed: ev.target.checked })}
              className="mt-0.5 accent-[#3FB5D7]"
            />
            <span className="text-sm font-semibold text-ink">
              Confirm {formatDate(working.iso)} ({finding ?? "governing law"}, {working.row.years} yrs)
            </span>
          </label>
        ) : (
          <p className={`text-sm font-semibold ${WARN_TEXT}`}>Uncertain — attorney review required</p>
        )}
      </div>

      {/* Override reason */}
      <div>
        <label className="eyebrow block mb-1.5" htmlFor="override-reason">
          Override reason <span className="normal-case tracking-normal text-[#8A98A3]">(required for any change)</span>
        </label>
        <textarea
          id="override-reason"
          rows={3}
          value={decision.reason}
         
          onChange={(ev) => set({ reason: ev.target.value })}
          placeholder="Explain any change from the system finding"
          className={`${field} resize-y`}
        />
        {overridden && (
          <p className="text-xs text-ink mt-1">
            Governing law: {finding} → {decision.governingLaw} <span className="text-[#5B6B78]">· system finding kept on record</span>
          </p>
        )}
      </div>

      {/* Status of the last action */}
      {decision.status === "approved" && (
        <div className={SUCCESS_CARD}>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#15803D]"><CheckCircle className="w-4 h-4" strokeWidth={2} /> Approved</div>
          <p className="text-sm text-ink mt-1.5">Governing law: {decision.governingLaw}. Forums: {decision.forums.map(forumTitle).join(", ")}.</p>
          <p className="text-sm text-ink">Deadline {formatDate(working?.iso)} calendared with reminders and sent to urgency triage.</p>
          {overridden && <p className="text-sm text-ink">Override from the system finding ({finding}): {decision.reason.trim()}</p>}
          <p className="text-xs text-[#5B6B78] mt-1.5">Reviewer: {decision.reviewer} · {decision.decidedAt}</p>
        </div>
      )}
      {decision.status === "needs-info" && (
        <div className={WARNING_CARD}>
          <div className={`text-sm font-semibold ${WARN_TEXT}`}>Needs more info</div>
          <p className="text-sm text-ink mt-1.5">Follow-up tasks created: {tasks.length ? tasks.join(", ") : "none listed"}.</p>
          <p className="text-xs text-[#5B6B78] mt-1.5">Reviewer: {decision.reviewer} · {decision.decidedAt}</p>
        </div>
      )}
      {decision.status === "escalated" && (
        <div className={WARNING_CARD}>
          <div className={`text-sm font-semibold ${WARN_TEXT}`}>Escalated</div>
          <p className="text-sm text-ink mt-1.5">Sent to supervising attorney with all flags attached.</p>
          <p className="text-xs text-[#5B6B78] mt-1.5">Reviewer: {decision.reviewer} · {decision.decidedAt}</p>
        </div>
      )}

      {/* Actions — always available: approval is a status, not an end state,
          so the attorney can re-approve, ask for more information or escalate. */}
      <div className="space-y-2">
        {error && (
          <p role="alert" className="rounded-lg border border-[#FBD5D5] bg-[#FEF2F2] px-3 py-2 text-sm font-medium text-[#B91C1C] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} /> {error}
          </p>
        )}
        <button onClick={approve} className="btn btn-primary w-full gap-2">
          <CalendarClock className="w-4 h-4" strokeWidth={1.75} /> Approve and calendar deadlines
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={needsInfo} className="btn btn-secondary gap-1.5">
            <HelpCircle className="w-4 h-4" strokeWidth={1.75} /> Needs more info
          </button>
          <button onClick={escalate} className="btn btn-secondary gap-1.5">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} /> Escalate
          </button>
        </div>
      </div>

      <p className="text-xs text-[#5B6B78] leading-relaxed flex items-start gap-1.5 pt-3 border-t border-line">
        <ShieldCheck className="w-3.5 h-3.5 text-deep shrink-0 mt-px" strokeWidth={1.75} />
        Every override is logged with its reason. Any later change to a deadline sends this case back for sign-off.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function JurisdictionReviewPage({ caseData, decision: stored, onDecisionChange, onBack, onStageClick }: Props) {
  const model = useWorkspaceModel(caseData);
  const caseRef = caseData?.caseId ?? model.caseId;
  const record = jurisdictionForCase(caseRef);
  const decision = stored ?? initialDecision(record);
  const [tab, setTab] = useState<TabId>("forums");
  // Bring the one Attorney Decision panel into view and mark it briefly.
  const [highlightDecision, setHighlightDecision] = useState(false);
  const goToDecision = () => {
    const el = document.getElementById("attorney-decision");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
    setHighlightDecision(true);
    window.setTimeout(() => setHighlightDecision(false), 1800);
  };

  const working = workingDeadline(record);
  const flags = [...(record?.flags ?? [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts = (["HIGH", "MEDIUM", "LOW"] as Severity[]).map((s) => ({ s, n: flags.filter((f) => f.severity === s).length }));

  const caseName = caseData?.caseName ?? model.caseName;

  const renderTab = () => {
    if (!record) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-14">
          <Scale className="w-8 h-8 text-soft mb-3" strokeWidth={1.75} />
          <p className="text-sm font-medium text-ink">No jurisdiction analysis on record for this case yet.</p>
          <p className="secondary-text mt-1">Needs attorney review.</p>
        </div>
      );
    }
    switch (tab) {
      case "forums": return <ForumComparison record={record} />;
      case "fault": return <FaultImpact record={record} />;
      case "deadlines": return <Deadlines record={record} />;
      case "facts": return <Facts record={record} />;
      case "parties": return <PartiesAndRegimes record={record} />;
      case "missing": return <MissingData record={record} />;
    }
  };

  return (
    <div className="min-h-screen bg-wash">
      {/* Breadcrumb — the Analysis stage's own, one level deeper */}
      <div className="bg-white sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 secondary-text hover:text-ink transition-colors">
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to Analysis
            </button>
            <div className="secondary-text ml-auto flex items-center gap-2 min-w-0">
              <span className="shrink-0">Case Intake</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
              <span className="truncate">{caseName}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BA8B4] shrink-0" strokeWidth={1.75} />
              <span className="text-ink font-medium shrink-0">Attorney Jurisdiction Review</span>
            </div>
          </div>
        </div>
      </div>

      <StageNavigator currentStage="Analysis" onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="page-title" style={{ fontSize: "24px" }}>Jurisdiction &amp; SOL Review</h1>
            <p className="secondary-text mt-1">Where the case can be filed, which law governs it, and the deadline to file — for the attorney to confirm.</p>
          </div>
          <DecisionCta decision={decision} onGo={goToDecision} />
        </div>

        {/* Case overview on the left, held in place while the workspace on the
            right scrolls with the page — the dashboard's Case Snapshot layout. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-6 items-start">
          {/* ── LEFT — case overview, then the attorney decision. No height cap
              or scroll area of its own: it is taller than most windows, so it
              scrolls with the page and nothing in it is ever cut off. ── */}
          <aside className="space-y-4 min-w-0">
            <div className="lg-card p-4 space-y-3">
              <div>
                <h3 className="card-title mb-1.5">Case Overview</h3>
                <h2 className="text-base font-semibold text-ink leading-snug">{caseName}</h2>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                {[
                  { label: "Plaintiff", value: caseData?.plaintiff ?? model.plaintiff },
                  { label: "Defendant", value: record?.defendant ?? null },
                  { label: "Jurisdiction", value: caseData?.jurisdiction ?? model.jurisdiction },
                  { label: "Date of incident", value: record ? formatDate(record.incidentDate) : null },
                ].map((f) => (
                  <div key={f.label} className="lg-zone lg-zone-grey px-3 py-2">
                    <dt className="eyebrow mb-0.5">{f.label}</dt>
                    <dd className="text-sm font-semibold text-ink break-words"><Muted value={f.value} /></dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center gap-1.5 flex-wrap">
                {record?.governingLaw.finding
                  ? <span className="pill pill-neutral"><Gavel className="w-3.5 h-3.5" strokeWidth={1.75} /> Governing law: {record.governingLaw.finding} · system finding</span>
                  : <span className="pill pill-progress"><Gavel className="w-3.5 h-3.5" strokeWidth={1.75} /> Governing law not yet determined</span>}
                {record && <span className="pill pill-neutral">{record.governingLaw.confidence} confidence</span>}
                {decision.status === "approved"
                  ? <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Attorney approved</span>
                  : <span className="pill pill-progress">Needs attorney review</span>}
              </div>

              <div className="lg-zone px-3.5 py-3">
                <div className="eyebrow flex items-center gap-1.5 mb-1.5"><CalendarClock className="w-4 h-4 text-deep" strokeWidth={1.75} /> Working deadline</div>
                {working ? (
                  <>
                    <div className="kpi-value" style={{ fontSize: "22px" }}>{formatDate(working.iso)}</div>
                    <p className="text-xs text-[#5B6B78] mt-1">
                      {working.row.periodLabel} from {formatDate(working.row.start)} · {working.row.confidence} confidence · {decision.status === "approved" ? "confirmed" : "uncertain until confirmed"}
                    </p>
                  </>
                ) : (
                  <div className={`text-base font-semibold ${WARN_TEXT}`}>Needs attorney review</div>
                )}
              </div>
              {/* Each way the case connects to a state, with that state's
                  limitations period and deadline only where the review has
                  analysed them. Candidates, not confirmed forums. */}
              <div className="pt-1 space-y-2">
                <div className="eyebrow flex items-center gap-1.5"><Scale className="w-4 h-4 text-deep" strokeWidth={1.75} /> Jurisdictions &amp; Statutes of Limitations</div>
                {(record?.connections ?? []).length === 0 && (
                  <p className="text-xs text-[#5B6B78]">Not available — attorney review required.</p>
                )}
                {(record?.connections ?? []).map((c, i, all) => {
                  const label = { plaintiff: "Plaintiff's location", defendant: "Defendant's location", incident: "Incident location" }[c.type];
                  const row = c.deadlineId ? record?.deadlines.find((d) => d.id === c.deadlineId) : undefined;
                  const sameAs = c.state ? all.slice(0, i).find((p) => p.state === c.state) : undefined;
                  const confirmed = !!row && row.working && decision.status === "approved" && decision.deadlineConfirmed;
                  const status = !c.state ? "Not available" : confirmed ? "Confirmed" : !row ? "Needs attorney review" : row.status === "Uncertain" ? "Needs attorney review" : "Provisional";
                  const pill = { Confirmed: "pill-complete", Provisional: "pill-neutral", "Needs attorney review": "pill-progress", "Not available": "bg-[#F1F3F5] text-[#5B6B78] border-line" }[status];
                  return (
                    <div key={c.type} className="lg-zone lg-zone-grey px-3 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="eyebrow">{label}</span>
                        <span className={`pill shrink-0 ${pill}`}>{status}</span>
                      </div>
                      {c.state ? (
                        <>
                          <div className="text-sm font-semibold text-ink leading-snug">{c.state} · {c.location}</div>
                          {sameAs ? (
                            <p className="text-xs text-[#5B6B78]">Same state as the {sameAs.type} location — same limitations rule.</p>
                          ) : row ? (
                            <dl className="text-xs space-y-0.5">
                              <div className="flex gap-1.5"><dt className="text-[#5B6B78] shrink-0">Limitations:</dt><dd className="text-ink">{row.periodLabel} · {row.ruleSource}</dd></div>
                              <div className="flex gap-1.5"><dt className="text-[#5B6B78] shrink-0">Deadline:</dt><dd className="text-ink">{formatDate(deadlineDate(row))} · {confirmed ? "confirmed" : "provisional"} · runs from {formatDate(row.start)}, incident date unconfirmed</dd></div>
                            </dl>
                          ) : (
                            <p className="text-xs text-[#B45309]">Limitations period not yet analysed for this state.</p>
                          )}
                        </>
                      ) : (
                        <div className="text-sm font-semibold text-[#5B6B78]">Not available — attorney review required</div>
                      )}
                      <p className="text-xs text-[#5B6B78] leading-snug">{c.basis}</p>
                      {c.source && (
                        <button
                          onClick={() => { setTab(c.source!.tab); document.querySelector("[role=tablist]")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                          className="text-xs text-deep underline underline-offset-2 decoration-[#9BDAEC] hover:decoration-deep text-left"
                        >
                          {c.source.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <DecisionPanel record={record} decision={decision} onChange={onDecisionChange} highlight={highlightDecision} />
          </aside>

          {/* ── RIGHT — flags, then the six tabs ── */}
          <div className="min-w-0 space-y-6">
            {/* Flags, most severe first */}
            <div className="lg-card p-6">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h3 className="section-header flex items-center gap-2"><Flag className="w-5 h-5 text-deep" strokeWidth={1.75} /> Flags</h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {counts.filter((c) => c.n > 0).map((c) => (
                    <span key={c.s} className={`pill ${SEVERITY_PILL[c.s]}`}>{c.n} {c.s}</span>
                  ))}
                </div>
              </div>
              {flags.length === 0 ? (
                <p className="secondary-text">No material jurisdiction flags identified yet.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {flags.map((f) => (
                    <div key={f.id} className="rounded-xl border border-line bg-white p-4 min-w-0">
                      <div className="flex items-start gap-2 mb-1.5">
                        <span className={`pill ${SEVERITY_PILL[f.severity]} shrink-0`}>{f.severity}</span>
                        <h4 className="card-title leading-snug">{f.title}</h4>
                      </div>
                      <p className="body-text leading-relaxed">{f.detail}</p>
                      {f.sources.length > 0 && (
                        <p className="text-xs text-[#5B6B78] mt-2 flex items-start gap-1.5">
                          <FileText className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
                          <span className="min-w-0 break-words">{f.sources.join(" · ")}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* The six tabs. The attorney decision, in the left column, keeps its
                values whichever tab is open. */}
            <div>
              <div className="lg-card p-6 min-w-0">
                <div role="tablist" className="flex items-center gap-2 flex-wrap mb-5">
                  {TABS.map((t) => {
                    const on = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setTab(t.id)}
                        className={`px-3.5 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${
                          on ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {renderTab()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
