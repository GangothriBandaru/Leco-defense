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
      <div className="flex items-start gap-2.5 min-w-0 flex-1 basis-[200px]">
        <span className="w-8 h-8 rounded-lg bg-tint text-deep inline-flex items-center justify-center shrink-0"><Icon className="w-4 h-4" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <div className="eyebrow mb-0.5">{label}</div>
          {children}
        </div>
      </div>
    );
  };
  const muted = (t: string) => <span className="text-[#8A98A3]">{t}</span>;

  return (
    <section aria-labelledby="noneconomic-cap" className="rounded-xl border border-line bg-white p-4 space-y-3">
      <div>
        <h4 id="noneconomic-cap" className="card-title">Jurisdictional Non-Economic Damages Limit</h4>
        <p className="secondary-text mt-0.5">Applicable state law may limit recoverable non-economic damages. Review the jurisdiction and applicable statutory cap before finalizing the valuation.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
        {group(MapPin, "Jurisdiction", <>
          <p className="text-sm font-semibold text-ink break-words">{place ?? muted("Not provided")}</p>
          {court && <p className="text-xs text-[#5B6B78] break-words">{court}</p>}
        </>)}
        {group(Scale, "Maximum non-economic damages", cap ? <>
          <p className="text-sm font-semibold text-ink tabular-nums">{usd(cap.amount)}</p>
          <p className="text-xs text-[#5B6B78]">{cap.appliesTo}</p>
        </> : <>
          <p className="text-sm font-semibold text-ink">No applicable cap confirmed</p>
          <p className="text-xs text-[#5B6B78]">
            <span className="pill pill-progress mr-1">Not verified</span>Attorney review required{claim ? ` for ${claim}` : ""}.
          </p>
        </>)}
        {group(BookOpen, "Legal reference", cap ? <>
          <p className="text-sm font-semibold text-ink break-words">{cap.authority}</p>
          <p className="text-xs text-[#5B6B78]">Verified {cap.verifiedOn}{cap.url && <> · <a href={cap.url} target="_blank" rel="noreferrer" className="font-semibold text-deep hover:text-ink">View Source</a></>}</p>
        </> : <>
          <p className="text-sm text-ink">{muted("No verified legal source on file")}</p>
        </>)}
      </div>
      {facts.policyLimits && (
        <p className="text-xs text-[#5B6B78] border-t border-line pt-2.5">
          The policy limit ({facts.policyLimits}) is the insurance coverage limit, not a statutory cap. This card doesn't change the valuation above.
        </p>
      )}
    </section>
  );
}
