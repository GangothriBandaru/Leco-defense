import { useMemo } from "react";
import { MapPin, Scale, BookOpen } from "lucide-react";
import type { CaseDocument } from "../types/case";
import { useCaseDetails } from "../intake/caseDetailsStore";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { resolveCaseFacts, join } from "../conflict/caseFacts";

/** A statutory cap with the source it was verified against. None is on file
 *  yet: the app has no verified legal-source data, so every case shows the cap
 *  as unconfirmed until one is added here with its authority. */
interface VerifiedCap { amount: number; appliesTo: string; authority: string; verifiedOn: string; url?: string }
const VERIFIED_CAPS: Record<string, VerifiedCap> = {};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Informational only: it never changes the valuation. */
export function JurisdictionalCapCard({ caseData, documents }: { caseData: any; documents: CaseDocument[] }) {
  const saved = useCaseDetails(caseData?.caseId);
  const facts = useMemo(() => resolveCaseFacts(caseData, saved, resolveCasePolicy(caseData, documents)), [caseData, saved, documents]);
  const suit = facts.caseStatus === "Suit";
  const state = (suit ? facts.courtState : undefined) || facts.incidentState || undefined;
  const county = (suit ? facts.courtCounty : undefined) || facts.incidentCounty || undefined;
  const place = join(state, county) || facts.caseJurisdiction || undefined;
  const claim = [facts.caseType, facts.caseSubType].filter(Boolean).join(" · ") || undefined;
  const cap = state ? VERIFIED_CAPS[`${state}|${facts.caseType ?? ""}`] : undefined;

  // Icon and label on one line, the value beneath; columns split by thin rules.
  const group = (icon: typeof MapPin, label: string, children: React.ReactNode) => {
    const Icon = icon;
    return (
      <div className="min-w-0 @xl:px-4 @xl:first:pl-0 @xl:last:pr-0 @xl:border-l @xl:first:border-l-0 border-line">
        <div className="flex items-start @md:items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-tint text-deep inline-flex items-center justify-center shrink-0"><Icon className="w-3 h-3" strokeWidth={2} /></span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.03em] text-[#5B6B78] leading-4 @md:truncate" title={label}>{label}</span>
        </div>
        <div className="mt-1.5">{children}</div>
      </div>
    );
  };
  const value = "text-[13px] leading-[18px] font-semibold text-ink break-words";
  const badge = "inline-flex items-center mt-1 rounded-full border text-[10.5px] font-semibold leading-4 px-1.5";

  return (
    <section aria-labelledby="noneconomic-cap" className="@container rounded-xl border border-line bg-white p-4">
      <h4 id="noneconomic-cap" className="text-sm font-semibold text-ink leading-5">Jurisdictional Non-Economic Damages Limit</h4>
      <div className="grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] @xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-x-4 @xl:gap-x-0 gap-y-3 mt-3 pt-3 border-t border-line">
        {group(MapPin, "Jurisdiction", <p className={value}>{place ?? <span className="text-[#8A98A3] font-normal">Not provided</span>}</p>)}
        {group(Scale, "Maximum Non-Economic Damages", cap ? <>
          <p className={`${value} tabular-nums`}>{usd(cap.amount)}</p>
          <span className={`${badge} border-[#D1FADF] bg-[#ECFDF3] text-[#15803D]`}>Verified</span>
        </> : <>
          <p className={value}>No applicable cap confirmed</p>
          <span title={`Attorney review required${claim ? ` for ${claim}` : ""}.`} className={`${badge} border-[#FDE6C8] bg-[#FFF7ED] text-[#B45309]`}>Not verified</span>
        </>)}
        {group(BookOpen, "Legal Reference", cap ? (
          <p className={value}>{cap.url ? <a href={cap.url} target="_blank" rel="noreferrer" className="text-deep hover:text-ink">{cap.authority}</a> : cap.authority}</p>
        ) : (
          <p className="text-[13px] leading-[18px] text-[#5B6B78] break-words">No verified source on file</p>
        ))}
      </div>
    </section>
  );
}
