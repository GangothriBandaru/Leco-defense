import type { ReactNode } from "react";
import { User, Building2, Shield, Gavel, CalendarDays, Scale, Hourglass, CalendarClock, ArrowRight } from "lucide-react";
import type { CaseDetails } from "../intake/caseDetailsStore";
import { fmtDay, isSuit } from "./caseFacts";

const NOT_PROVIDED = <span className="font-normal text-[#8A98A3]">Not provided</span>;

function Verified({ v }: { v?: string }) {
  return v === "Verified"
    ? <span className="pill pill-complete">Verified</span>
    : <span className="pill pill-progress">Unverified</span>;
}

/** One tile, as the Analysis stage's summary draws them. */
function Tile({ icon: Icon, label, value, children }: { icon: typeof User; label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="lg-zone lg-zone-grey px-3.5 py-2.5 min-w-0">
      <div className="eyebrow flex items-center gap-1.5 mb-1">
        <Icon className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />
        {label}
      </div>
      <p className="text-sm font-semibold text-ink leading-snug break-words">{value || NOT_PROVIDED}</p>
      {children}
    </div>
  );
}
const Note = ({ children }: { children: ReactNode }) => <p className="text-xs text-[#5B6B78] leading-snug mt-0.5 break-words">{children}</p>;

export function CaseIntelligenceSummary({ d, dirty, conflictClear, conflictLabel, onProceed }: {
  d: CaseDetails;
  /** Case Details has edits not yet saved; the summary shows saved values. */
  dirty: boolean;
  conflictClear: boolean;
  conflictLabel: string;
  onProceed: () => void;
}) {
  const suit = isSuit(d);
  const counsel = [d.counselName, d.counselFirm].filter(Boolean).join(" · ");
  const policy = [d.policyNumber, d.policyName].filter(Boolean).join(" · ");
  const venue = [d.courtCounty, d.courtState].filter(Boolean).join(", ");
  const groups = [
    d.insuredName, d.plaintiffName, d.insurerName, d.caseStatus, d.incidentDate,
    suit ? d.courtName : d.caseStatus, d.solDate, suit ? d.answerDueDate : d.caseStatus,
  ];
  const provided = groups.filter(Boolean).length;

  return (
    <div id="case-intelligence" className="lg-card px-5 py-4 flex flex-col min-w-0">
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <h2 className="section-header">Case Intelligence Summary</h2>
        <span className={`pill ${provided === groups.length ? "pill-complete" : "pill-progress"}`}>{provided} of {groups.length} provided</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
        <Tile icon={Building2} label="Insured" value={d.insuredName}>{d.insuredType && <Note>{d.insuredType}</Note>}</Tile>
        <Tile icon={User} label="Plaintiff" value={d.plaintiffName}><Note>{counsel ? `Counsel: ${counsel}` : "Counsel not provided"}</Note></Tile>
        <Tile icon={Shield} label="Insurance" value={d.insurerName}>
          {policy && <Note>{policy}</Note>}
          <Note>{d.policyLimits ? `Limits ${d.policyLimits}` : "Limits not provided"}</Note>
        </Tile>
        <Tile icon={Gavel} label="Case Status" value={d.caseStatus}>
          {suit && <Note>{d.suitFiledDate ? `Filed ${fmtDay(d.suitFiledDate)}` : "Filing date not provided"}</Note>}
        </Tile>
        <Tile icon={CalendarDays} label="Incident" value={fmtDay(d.incidentDate)} />
        <Tile icon={Scale} label="Suit Jurisdiction" value={suit ? d.courtName : d.caseStatus ? <span className="font-normal text-[#5B6B78]">No suit filed</span> : undefined}>
          {suit && venue && <Note>{venue}</Note>}
          {suit && d.courtName && <div className="mt-1"><Verified v={d.jurisdictionVerified} /></div>}
        </Tile>
        <Tile icon={Hourglass} label="Statute of Limitations" value={fmtDay(d.solDate)}>
          {d.solDate && <div className="mt-1"><Verified v={d.solVerified} /></div>}
        </Tile>
        <Tile icon={CalendarClock} label="Answer Due" value={suit ? fmtDay(d.answerDueDate) : d.caseStatus ? <span className="font-normal text-[#5B6B78]">Not applicable, pre-suit</span> : undefined}>
          {suit && d.answerDueDate && <div className="mt-1"><Verified v={d.answerVerified} /></div>}
        </Tile>
      </div>

      {dirty && <p className="text-xs text-[#B45309] mb-2">Case Details has unsaved changes. This summary shows the saved values.</p>}
      <p className="text-xs text-[#5B6B78] mb-2">
        Conflict check: <b className="font-semibold text-ink">{conflictLabel}</b>
        {!conflictClear && " · clear it before moving on to Analysis."}
      </p>
      <button
        type="button"
        onClick={onProceed}
        disabled={!conflictClear}
        className="btn btn-primary gap-2 w-full mt-auto disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Proceed To Analysis
        <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
