import type { ReactNode } from "react";
import { User, Building2, Shield, Gavel, CalendarDays, Scale, Hourglass, CalendarClock, ArrowRight } from "lucide-react";
import type { CaseDetails } from "../intake/caseDetailsStore";
import { fmtDay, isSuit, daysUntil, join } from "./caseFacts";

const MUTED = (t = "Not provided") => <span className="font-normal text-[#8A98A3]">{t}</span>;

/** One tile, as the Analysis stage's summary draws them. */
function Tile({ icon: Icon, label, value, children }: { icon: typeof User; label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="lg-zone lg-zone-grey px-3.5 py-2.5 min-w-0">
      <div className="eyebrow flex items-center gap-1.5 mb-1">
        <Icon className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
        {label}
      </div>
      <p className="text-sm font-semibold text-ink leading-snug break-words">{value || MUTED()}</p>
      {children && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}
/** A secondary line: "Type Corporation", or "Type Not provided". */
const Line = ({ k, v }: { k: string; v?: ReactNode }) => (
  <p className="text-xs leading-snug break-words"><span className="text-[#5B6B78]">{k}</span> <span className="text-ink">{v || MUTED()}</span></p>
);

/** Deadline status, worked out only from a verified date. */
function Deadline({ date, verified }: { date?: string; verified?: string }) {
  if (!date) return null;
  if (verified !== "Verified") return <p className="text-xs leading-snug"><span className="pill pill-progress">Unverified</span> <span className="text-[#5B6B78]">· status not calculated</span></p>;
  const n = daysUntil(date) ?? 0;
  const [text, tone] = n < 0 ? [`Passed ${-n} day${n === -1 ? "" : "s"} ago`, "pill-risk"] : n === 0 ? ["Due today", "pill-risk"] : [`${n} day${n === 1 ? "" : "s"} left`, n <= 14 ? "pill-progress" : "pill-complete"];
  return <p className="text-xs leading-snug"><span className="pill pill-complete">Verified</span> <span className={`pill ${tone}`}>{text}</span></p>;
}

/** The fields that count toward "n of 8 provided": each group's key fact. A
 *  pre-suit case has no court or answer deadline, so those count once the
 *  status is recorded as pre-suit. */
export function summaryCompleteness(d: CaseDetails) {
  const pre = d.caseStatus === "Pre-suit";
  const groups = [d.insuredName, d.plaintiffName, d.insurerName, d.caseStatus, d.incidentDate, pre || d.courtName, d.solDate, pre || d.answerDueDate];
  return { provided: groups.filter(Boolean).length, total: groups.length };
}

export function CaseIntelligenceSummary({ d, dirty, blockers, onProceed }: {
  d: CaseDetails;
  /** Case Details has edits not yet saved; the summary shows saved values. */
  dirty: boolean;
  /** What stops the case moving on to Analysis; empty when nothing does. */
  blockers: string[];
  onProceed: () => void;
}) {
  const suit = isSuit(d);
  const pre = d.caseStatus === "Pre-suit";
  const { provided, total } = summaryCompleteness(d);
  const contact = (...v: (string | undefined)[]) => v.filter(Boolean).join(" · ") || undefined;

  return (
    <div id="case-intelligence" className="lg-card px-5 py-4 flex flex-col min-w-0">
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <h2 className="section-header">Case Intelligence Summary</h2>
        <span className={`pill ${provided === total ? "pill-complete" : "pill-progress"}`} title="Counts each group once its key fact is saved">{provided} of {total} provided</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5 mb-3">
        <Tile icon={Building2} label="Insured" value={d.insuredName}>
          <Line k="Type" v={d.insuredType} />
          <Line k="Contact" v={contact(d.insuredContact, d.insuredEmail, d.insuredPhone)} />
          <Line k="Location" v={join(d.insuredState, d.insuredCountry) || undefined} />
        </Tile>
        <Tile icon={User} label="Plaintiff" value={d.plaintiffName}>
          <Line k="Counsel" v={d.counselName} />
          <Line k="Firm" v={d.counselFirm} />
          <Line k="Contact" v={contact(d.counselEmail, d.counselPhone)} />
        </Tile>
        <Tile icon={Shield} label="Insurance" value={d.insurerName}>
          <Line k="Policy no." v={d.policyNumber} />
          <Line k="Type" v={d.policyName} />
          <Line k="Limits" v={d.policyLimits} />
        </Tile>
        <Tile icon={Gavel} label="Case Status" value={d.caseStatus}>
          <Line k="Suit filed" v={suit ? "Yes" : pre ? "No" : undefined} />
          {suit && <Line k="Filed on" v={fmtDay(d.suitFiledDate)} />}
        </Tile>
        <Tile icon={CalendarDays} label="Incident" value={fmtDay(d.incidentDate)}>
          <Line k="Type" v={d.incidentType || d.caseType} />
          <Line k="Location" v={join(d.incidentLocation, d.incidentCounty, d.incidentState) || undefined} />
        </Tile>
        <Tile icon={Scale} label="Suit Jurisdiction" value={pre ? <span className="font-normal text-[#5B6B78]">Not applicable · pre-suit</span> : d.courtName}>
          {!pre && <>
            <Line k="State" v={d.courtState} />
            <Line k="County" v={d.courtCounty} />
            <Line k="Jurisdiction" v={d.suitJurisdiction} />
          </>}
        </Tile>
        <Tile icon={Hourglass} label="Statute of Limitations" value={fmtDay(d.solDate)}>
          <Deadline date={d.solDate} verified={d.solVerified} />
        </Tile>
        <Tile icon={CalendarClock} label="Answer Due" value={pre ? <span className="font-normal text-[#5B6B78]">Not applicable · pre-suit</span> : fmtDay(d.answerDueDate)}>
          {!pre && <Deadline date={d.answerDueDate} verified={d.answerVerified} />}
        </Tile>
      </div>

      {dirty && <p className="text-xs text-[#B45309] mb-2">Case Details has unsaved changes. This summary shows the saved values.</p>}
      {blockers.length > 0 && (
        <div className="mb-2.5 text-xs text-[#5B6B78]">
          <p className="font-semibold text-ink mb-1">Before moving on to Analysis:</p>
          <ul className="list-disc pl-4 space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      <button
        type="button"
        onClick={onProceed}
        disabled={blockers.length > 0}
        className="btn btn-primary gap-2 w-full mt-auto disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Proceed To Analysis
        <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
