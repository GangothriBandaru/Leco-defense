import type { ReactNode } from "react";
import type { CaseDetails } from "../intake/caseDetailsStore";
import type { CaseDocument } from "../types/case";
import { Building2, User, Scale } from "lucide-react";
import { CASE_TYPES } from "../components/EditCaseDetailsDialog";
import { isSuit } from "./caseFacts";

type K = keyof CaseDetails;
export type Errors = Partial<Record<K, string>>;

const INSURED_TYPES = ["Individual", "LLC", "Corporation", "Partnership", "Government", "NGO", "Other"];
const DEMAND_STATUSES = ["No demand received", "Demand received", "Time-limited demand", "Under review", "Responded", "Withdrawn"];
const VERIFY = ["Unverified", "Verified"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneOk = (v: string) => /^[+()\-.\s\d]+$/.test(v) && v.replace(/\D/g, "").length >= 7;
const moneyOk = (v: string) => /^\$?\s?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(v.trim());
const today = () => new Date().toISOString().slice(0, 10);

/** Field checks for the Case Details form; suit fields only count once a suit is filed. */
export function validateCaseDetails(d: CaseDetails): Errors {
  const e: Errors = {};
  const v = (k: K) => (d[k] ?? "").trim();
  if (!v("insuredName")) e.insuredName = "Insured name is required.";
  if (!v("insuredType")) e.insuredType = "Choose the insured type.";
  if (!v("plaintiffName")) e.plaintiffName = "Plaintiff name is required.";
  if (!v("caseStatus")) e.caseStatus = "Answer whether a suit has been filed.";
  for (const k of ["insuredEmail", "plaintiffEmail", "counselEmail"] as K[]) if (v(k) && !EMAIL.test(v(k))) e[k] = "Enter a valid email address.";
  for (const k of ["insuredPhone", "plaintiffPhone", "counselPhone"] as K[]) if (v(k) && !phoneOk(v(k))) e[k] = "Enter a valid phone number.";
  if (v("demandAmount") && !moneyOk(v("demandAmount"))) e.demandAmount = "Enter an amount, e.g. 250,000.";
  if (v("incidentDate") && v("incidentDate") > today()) e.incidentDate = "The incident date can't be in the future.";
  if (v("demandDate") && v("incidentDate") && v("demandDate") < v("incidentDate")) e.demandDate = "The demand can't predate the incident.";
  if (isSuit(d)) {
    if (!v("suitFiledDate")) e.suitFiledDate = "Enter the date the suit was filed.";
    else if (v("incidentDate") && v("suitFiledDate") < v("incidentDate")) e.suitFiledDate = "The suit can't be filed before the incident.";
    if (!v("courtName")) e.courtName = "Enter the court.";
    if (v("answerDueDate") && v("suitFiledDate") && v("answerDueDate") < v("suitFiledDate")) e.answerDueDate = "The answer can't be due before the suit was filed.";
  }
  return e;
}

// The three sections and the fields each holds, for error and change badges.
export type SectionKey = "insured" | "plaintiff" | "legal";
export const SECTION_FIELDS: Record<SectionKey, K[]> = {
  insured: ["insuredName", "insuredType", "insuredContact", "insuredEmail", "insuredPhone", "insuredAddress", "insuredState", "insuredCountry", "insuredJurisdiction", "insurerName", "policyNumber", "policyName", "policyLimits", "coverageNotes"],
  plaintiff: ["plaintiffName", "plaintiffLocation", "plaintiffEmail", "plaintiffPhone", "counselName", "counselFirm", "counselEmail", "counselPhone", "counselAddress", "plaintiffState", "plaintiffCounty", "plaintiffJurisdiction"],
  legal: ["incidentType", "caseType", "incidentDate", "incidentLocation", "incidentState", "incidentCounty", "jurisdictionalLimits", "caseStatus", "suitFiledDate", "courtName", "courtLocation", "suitJurisdiction", "courtState", "courtCounty", "jurisdictionVerified", "solDate", "solVerified", "answerDueDate", "answerVerified", "governingLaw", "caseJurisdiction", "demandAmount", "demandDate", "demandStatus", "demandDocs", "exposureNotes"],
};
const SECTIONS: { key: SectionKey; label: string; icon: typeof User; sub: string }[] = [
  { key: "insured", label: "Insured & Insurance", icon: Building2, sub: "Who we defend, how to reach them, and the coverage behind them." },
  { key: "plaintiff", label: "Plaintiff & Counsel", icon: User, sub: "The plaintiff's own details, kept apart from their lawyer's." },
  { key: "legal", label: "Legal & Incident", icon: Scale, sub: "What happened, where the case sits, deadlines and demands." },
];
export const sectionOf = (k: string): SectionKey => (Object.keys(SECTION_FIELDS) as SectionKey[]).find((s) => SECTION_FIELDS[s].includes(k as K)) ?? "insured";

// Compact controls: the dashboard's input styling at a shorter height.
const ctl = "w-full h-10 bg-white border border-line rounded-lg px-3 text-sm text-[#0F1E2B] placeholder:text-[#8A98A3] focus:outline-none focus:border-brand transition-colors";
const ctlErr = "border-[#B91C1C] focus:border-[#B91C1C]";

function F({ id, label, required, error, full, children }: { id: string; label: string; required?: boolean; error?: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="block text-[13px] font-semibold text-[#0F1E2B] mb-1.5">{label}{required && <span className="text-[#B91C1C]"> *</span>}</label>
      {children}
      {error && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{error}</p>}
    </div>
  );
}
const Sub = ({ children }: { children: ReactNode }) => <h3 className="sm:col-span-2 eyebrow pt-1">{children}</h3>;
const Divider = () => <div className="sm:col-span-2 border-t border-line my-1" />;

export function CaseDetailsForm({ draft, setDraft, errors, showErrors, saved, documents, dirty, onSave, onDiscard, section, setSection }: {
  draft: CaseDetails;
  setDraft: (fn: (d: CaseDetails) => CaseDetails) => void;
  errors: Errors;
  showErrors: boolean;
  /** The saved values, to mark sections with unsaved edits. */
  saved: CaseDetails;
  documents: CaseDocument[];
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  section: SectionKey;
  setSection: (s: SectionKey) => void;
}) {
  const val = (k: K) => draft[k] ?? "";
  const set = (k: K) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const err = (k: K) => (showErrors ? errors[k] : undefined);
  const id = (k: K) => `cd-${k}`;

  const text = (k: K, label: string, o: { required?: boolean; placeholder?: string; type?: string; full?: boolean } = {}) => (
    <F id={id(k)} label={label} required={o.required} error={err(k)} full={o.full}>
      <input id={id(k)} type={o.type ?? "text"} value={val(k)} onChange={set(k)} placeholder={o.placeholder} aria-invalid={!!err(k)} className={`${ctl} ${err(k) ? ctlErr : ""}`} />
    </F>
  );
  const select = (k: K, label: string, options: string[], o: { required?: boolean; placeholder?: string; full?: boolean } = {}) => {
    const list = val(k) && !options.includes(val(k)) ? [val(k), ...options] : options;
    return (
      <F id={id(k)} label={label} required={o.required} error={err(k)} full={o.full}>
        <select id={id(k)} value={val(k)} onChange={set(k)} aria-invalid={!!err(k)} className={`${ctl} ${err(k) ? ctlErr : ""}`}>
          <option value="">{o.placeholder ?? "Select..."}</option>
          {list.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </F>
    );
  };
  const area = (k: K, label: string, placeholder: string) => (
    <F id={id(k)} label={label} full>
      <textarea id={id(k)} rows={2} value={val(k)} onChange={set(k)} placeholder={placeholder} className={`${ctl} h-auto py-2 resize-y`} />
    </F>
  );

  const org = !!draft.insuredType && draft.insuredType !== "Individual";
  const suit = isSuit(draft);
  const picked = new Set((draft.demandDocs ?? "").split("\n").filter(Boolean));
  const toggleDoc = (name: string) => setDraft((d) => {
    const s = new Set((d.demandDocs ?? "").split("\n").filter(Boolean));
    s.has(name) ? s.delete(name) : s.add(name);
    return { ...d, demandDocs: [...s].join("\n") };
  });
  const changed = (s: SectionKey) => SECTION_FIELDS[s].some((k) => (draft[k] ?? "").trim() !== (saved[k] ?? "").trim());
  const errorsIn = (s: SectionKey) => (showErrors ? Object.keys(errors).filter((k) => sectionOf(k) === s).length : 0);
  const save = () => {
    // Open the first section with a problem, so the highlighted field is visible.
    const first = (Object.keys(errors) as K[])[0];
    if (first) setSection(sectionOf(first));
    onSave();
  };
  const meta = SECTIONS.find((s) => s.key === section)!;
  const totalErrors = showErrors ? Object.keys(errors).length : 0;

  return (
    <div className="space-y-4 min-w-0">
      <div role="tablist" aria-label="Case Details sections" className="lg-card p-1.5 grid grid-cols-3 gap-1.5"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = SECTIONS.findIndex((s) => s.key === section);
          const next = SECTIONS[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3].key;
          setSection(next);
          window.setTimeout(() => document.getElementById(`cd-sec-${next}`)?.focus(), 0);
        }}>
        {SECTIONS.map((s) => {
          const on = section === s.key, n = errorsIn(s.key);
          return (
            <button key={s.key} id={`cd-sec-${s.key}`} type="button" role="tab" aria-selected={on} aria-controls="cd-panel" tabIndex={on ? 0 : -1} onClick={() => setSection(s.key)}
              className={`relative min-w-0 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${on ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"}`}>
              <s.icon className="w-4 h-4 shrink-0 hidden sm:block" strokeWidth={1.75} />
              <span className="truncate">{s.label}</span>
              {n > 0 ? <span className={`text-[11px] rounded-full px-1.5 tabular-nums ${on ? "bg-white text-[#B91C1C]" : "bg-[#FEF2F2] text-[#B91C1C]"}`} aria-label={`${n} to fix`}>{n}</span>
                : changed(s.key) && <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-white" : "bg-[#B45309]"}`} aria-label="Unsaved changes" />}
            </button>
          );
        })}
      </div>

      <section id="cd-panel" role="tabpanel" aria-labelledby={`cd-sec-${section}`} className="lg-card">
        <div className="px-6 pt-5 pb-4 border-b border-line">
          <h2 className="section-header">{meta.label}</h2>
          <p className="secondary-text mt-0.5">{meta.sub}</p>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
          {section === "insured" && <>
            <Sub>Insured</Sub>
            {text("insuredName", org ? "Organization name" : "Insured name", { required: true, placeholder: org ? "e.g. Logistics Co." : "Full legal name" })}
            {select("insuredType", "Insured type", INSURED_TYPES, { required: true })}
            {org && text("insuredContact", "Contact person", { placeholder: "Name and title", full: true })}
            {text("insuredEmail", "Contact email", { type: "email", placeholder: "name@example.com" })}
            {text("insuredPhone", "Phone number", { type: "tel", placeholder: "+1 (555) 000-0000" })}
            {text("insuredAddress", "Address", { placeholder: "Street, city, ZIP", full: true })}
            {text("insuredState", "State", { placeholder: "e.g. Illinois" })}
            {text("insuredCountry", "Country", { placeholder: "e.g. United States" })}
            {text("insuredJurisdiction", "Jurisdiction", { placeholder: "Where the insured is based, e.g. Cook County, IL", full: true })}
            <Divider />
            <Sub>Insurance and policy</Sub>
            {text("insurerName", "Insurance company", { placeholder: "e.g. Sentinel Casualty Insurance" })}
            {text("policyNumber", "Policy number", { placeholder: "e.g. CGL-0000-00" })}
            {text("policyName", "Policy type", { placeholder: "e.g. Commercial General Liability" })}
            {text("policyLimits", "Policy limits", { placeholder: "e.g. $1,000,000 / $2,000,000" })}
            {area("coverageNotes", "Additional policy details", "Reservation of rights, exclusions, other insurance")}
          </>}

          {section === "plaintiff" && <>
            <Sub>Plaintiff</Sub>
            {text("plaintiffName", "Plaintiff name", { required: true, placeholder: "Full legal name" })}
            {text("plaintiffLocation", "Plaintiff location", { placeholder: "City where the plaintiff lives" })}
            {text("plaintiffEmail", "Plaintiff email", { type: "email", placeholder: "name@example.com" })}
            {text("plaintiffPhone", "Plaintiff phone", { type: "tel", placeholder: "+1 (555) 000-0000" })}
            {text("plaintiffState", "Plaintiff state", { placeholder: "e.g. Illinois" })}
            {text("plaintiffCounty", "Plaintiff county", { placeholder: "e.g. Cook County" })}
            {text("plaintiffJurisdiction", "Plaintiff jurisdiction", { placeholder: "e.g. Cook County, IL", full: true })}
            <Divider />
            <Sub>Plaintiff's counsel</Sub>
            {text("counselName", "Counsel name", { placeholder: "Attorney of record" })}
            {text("counselFirm", "Law firm", { placeholder: "Firm name" })}
            {text("counselEmail", "Counsel email", { type: "email", placeholder: "name@firm.com" })}
            {text("counselPhone", "Counsel phone", { type: "tel", placeholder: "+1 (555) 000-0000" })}
            {text("counselAddress", "Counsel address", { placeholder: "Street, city, ZIP", full: true })}
          </>}

          {section === "legal" && <>
            <Sub>Incident</Sub>
            {text("incidentType", "Incident type", { placeholder: "e.g. Fall, vehicle collision" })}
            {select("caseType", "Case type", CASE_TYPES)}
            {text("incidentDate", "Incident date", { type: "date" })}
            {text("incidentLocation", "Incident location", { placeholder: "Where it happened" })}
            {text("incidentState", "Incident state", { placeholder: "e.g. Illinois" })}
            {text("incidentCounty", "Incident county", { placeholder: "e.g. Cook County" })}
            {text("jurisdictionalLimits", "Incident jurisdiction or court limits", { placeholder: "e.g. Law Division, over $30,000", full: true })}
            <Divider />
            <Sub>Suit</Sub>
            <fieldset className="min-w-0">
              <legend className="block text-[13px] font-semibold text-[#0F1E2B] mb-1.5">Suit filed? <span className="text-[#B91C1C]">*</span></legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-white p-0.5 h-10" role="radiogroup" aria-label="Suit filed?">
                {[["Suit", "Yes"], ["Pre-suit", "No"]].map(([v, l]) => (
                  <label key={v} className={`flex items-center justify-center rounded-md text-sm font-semibold cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand ${draft.caseStatus === v ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"}`}>
                    <input type="radio" name="cd-caseStatus" value={v} checked={draft.caseStatus === v} onChange={set("caseStatus")} className="sr-only" />{l}
                  </label>
                ))}
              </div>
              {err("caseStatus") && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{err("caseStatus")}</p>}
            </fieldset>
            <div>
              <div className="block text-[13px] font-semibold text-[#0F1E2B] mb-1.5">Case status</div>
              <p className="h-10 flex items-center text-sm" aria-live="polite">{draft.caseStatus ? <span className="pill pill-neutral">{draft.caseStatus}</span> : <span className="text-[#8A98A3]">Set by Suit filed?</span>}</p>
            </div>
            {suit ? <>
              {text("suitFiledDate", "Suit filed date", { type: "date", required: true })}
              {text("courtName", "Court name", { required: true, placeholder: "e.g. Circuit Court of Cook County" })}
              {text("courtLocation", "Court location", { placeholder: "Courthouse address or city" })}
              {text("suitJurisdiction", "Suit jurisdiction", { placeholder: "e.g. Law Division" })}
              {text("courtState", "Court state", { placeholder: "e.g. Illinois" })}
              {text("courtCounty", "Court county", { placeholder: "e.g. Cook County" })}
              {select("jurisdictionVerified", "Jurisdiction verification", VERIFY, { placeholder: "Not checked" })}
            </> : (
              <p className="sm:col-span-2 text-sm text-[#5B6B78]">{draft.caseStatus === "Pre-suit" ? "No suit filed. Court details and the answer deadline apply once it is; anything entered earlier is kept." : "Answer Suit filed? to see the suit fields."}</p>
            )}
            <Divider />
            <Sub>Deadlines and governing law</Sub>
            {text("solDate", "Statute of limitations deadline", { type: "date" })}
            {select("solVerified", "SOL verification", VERIFY, { placeholder: "Not checked" })}
            {suit && text("answerDueDate", "Answer due date", { type: "date" })}
            {suit && select("answerVerified", "Answer due verification", VERIFY, { placeholder: "Not checked" })}
            {text("governingLaw", "Governing law", { placeholder: "e.g. Illinois law" })}
            {text("caseJurisdiction", "Governing state, county or court", { placeholder: "e.g. Cook County, IL" })}
            <Divider />
            <Sub>Demand</Sub>
            {text("demandAmount", "Demand amount (USD)", { placeholder: "e.g. 250,000" })}
            {text("demandDate", "Demand date", { type: "date" })}
            {select("demandStatus", "Demand status", DEMAND_STATUSES)}
            <div>
              <div className="block text-[13px] font-semibold text-[#0F1E2B] mb-1.5">Policy limits</div>
              <p className="h-10 flex items-center text-sm text-ink">{draft.policyLimits || <span className="text-[#8A98A3]">Set under Insured &amp; Insurance</span>}</p>
            </div>
            <fieldset className="sm:col-span-2 min-w-0">
              <legend className="block text-[13px] font-semibold text-[#0F1E2B] mb-1.5">Supporting documents</legend>
              {documents.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {documents.map((doc) => {
                    const on = picked.has(doc.name);
                    return (
                      <label key={doc.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer max-w-full focus-within:ring-2 focus-within:ring-brand ${on ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleDoc(doc.name)} className="sr-only" />
                        <span className="mono-ref truncate">{doc.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-[#8A98A3]">No documents on this case yet.</p>}
            </fieldset>
            {area("exposureNotes", "Demand history and exposure notes", "Prior demands, offers, and anything that shapes exposure")}
          </>}
        </div>

        <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-line rounded-b-xl px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className={`text-sm ${dirty ? "text-[#B45309] font-semibold" : "text-[#5B6B78]"}`} role="status">
            {dirty ? "Unsaved changes" : "All changes saved"}
            {totalErrors > 0 && <span className="text-[#B91C1C] font-normal"> · {totalErrors} field{totalErrors === 1 ? "" : "s"} to fix</span>}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onDiscard} disabled={!dirty} className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Discard Changes</button>
            <button type="button" onClick={save} disabled={!dirty} className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed">Save Case Details</button>
          </div>
        </div>
      </section>
    </div>
  );
}