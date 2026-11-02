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
  const court = suit ? facts.courtName : undefined;
  const place = join(state, county) || facts.caseJurisdiction || undefined;
  const claim = [facts.caseType, facts.caseSubType].filter(Boolean).join(" · ") || undefined;
  const cap = state ? VERIFIED_CAPS[`${state}|${facts.caseType ?? ""}`] : undefined;

  const group = (icon: typeof MapPin, label: string, children: React.ReactNode) => {
    const Icon = icon;
    return (
      <div className="flex items-start gap-2 min-w-0 @lg:px-3 @lg:first:pl-0 @lg:border-l @lg:first:border-l-0 border-line">
        <span className="w-6 h-6 rounded-md bg-tint text-deep inline-flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5B6B78] leading-4">{label}</div>
          {children}
        </div>
      </div>
    );
  };
  const value = "text-[12.5px] leading-[18px] font-semibold text-ink break-words";
  const sub = "text-[11px] leading-4 text-[#5B6B78] break-words";

  return (
    <section aria-labelledby="noneconomic-cap" className="@container rounded-xl border border-line bg-white px-4 py-3">
      <h4 id="noneconomic-cap" className="text-sm font-semibold text-ink leading-5">Jurisdictional Non-Economic Damages Limit</h4>
      <p className="text-xs text-[#5B6B78] leading-4 mt-0.5">State law may limit recoverable non-economic damages. Informational only; it doesn't change the valuation above.</p>
      <div className="grid grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3 gap-x-4 @lg:gap-x-0 gap-y-2.5 mt-2.5">
        {group(MapPin, "Jurisdiction", <>
          <p className={value}>{place ?? <span className="text-[#8A98A3] font-normal">Not provided</span>}</p>
          {court && <p className={sub}>{court}</p>}
        </>)}
        {group(Scale, "Maximum non-economic damages", cap ? <>
          <p className={`${value} tabular-nums`}>{usd(cap.amount)}</p>
          <p className={sub}>{cap.appliesTo}</p>
        </> : <>
          <p className={value}>No applicable cap confirmed{" "}
          <span title={`Attorney review required${claim ? ` for ${claim}` : ""}.`}
            className="inline-flex items-center align-[1px] whitespace-nowrap rounded-full border border-[#FDE6C8] bg-[#FFF7ED] text-[#B45309] text-[10.5px] font-semibold leading-4 px-1.5">Not verified</span></p>
        </>)}
        {group(BookOpen, "Legal reference", cap ? <>
          <p className={value}>{cap.authority}</p>
          <p className={sub}>Verified {cap.verifiedOn}{cap.url && <> · <a href={cap.url} target="_blank" rel="noreferrer" className="font-semibold text-deep hover:text-ink">View Source</a></>}</p>
        </> : <>
          <p className="text-[12.5px] leading-[18px] text-[#8A98A3] break-words">No verified legal source on file</p>
        </>)}
      </div>
      {facts.policyLimits && (
        <p className="text-[11px] leading-4 text-[#8A98A3] mt-2">Policy limit ({facts.policyLimits}) is insurance coverage, not a statutory cap.</p>
      )}
    </section>
  );
}
