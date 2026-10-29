import type { ReactNode } from "react";
import type { CaseDetails } from "../intake/caseDetailsStore";
import type { CaseDocument } from "../types/case";
import { Field, input, inputError, CASE_TYPES } from "../components/EditCaseDetailsDialog";
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

function Section({ letter, title, sub, children }: { letter: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`cd-sec-${letter}`} className="lg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line">
        <div className="eyebrow">Section {letter}</div>
        <h2 id={`cd-sec-${letter}`} className="section-header mt-0.5">{title}</h2>
        <p className="secondary-text mt-0.5">{sub}</p>
      </div>
      <div className="px-6 py-5 space-y-6">{children}</div>
    </section>
  );
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-4">
    <h3 className="card-title">{title}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

export function CaseDetailsForm({ draft, setDraft, errors, showErrors, documents, dirty, onSave, onDiscard }: {
  draft: CaseDetails;
  setDraft: (fn: (d: CaseDetails) => CaseDetails) => void;
  errors: Errors;
  showErrors: boolean;
  documents: CaseDocument[];
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const val = (k: K) => draft[k] ?? "";
  const set = (k: K) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const err = (k: K) => (showErrors ? errors[k] : undefined);
  const cls = (k: K) => `${input} ${err(k) ? inputError : ""}`;

  const text = (k: K, label: string, opts: { required?: boolean; placeholder?: string; type?: string; full?: boolean } = {}) => (
    <div className={opts.full ? "sm:col-span-2" : ""}>
      <Field label={label} required={opts.required} error={err(k)} htmlFor={`cd-${k}`}>
        <input id={`cd-${k}`} type={opts.type ?? "text"} value={val(k)} onChange={set(k)} placeholder={opts.placeholder} aria-invalid={!!err(k)} className={cls(k)} />
      </Field>
    </div>
  );
  const select = (k: K, label: string, options: string[], opts: { required?: boolean; placeholder?: string } = {}) => {
    const list = val(k) && !options.includes(val(k)) ? [val(k), ...options] : options;
    return (
      <Field label={label} required={opts.required} error={err(k)} htmlFor={`cd-${k}`}>
        <select id={`cd-${k}`} value={val(k)} onChange={set(k)} aria-invalid={!!err(k)} className={cls(k)}>
          <option value="">{opts.placeholder ?? "Select..."}</option>
          {list.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    );
  };
  const area = (k: K, label: string, placeholder: string) => (
    <div className="sm:col-span-2">
      <Field label={label} htmlFor={`cd-${k}`}>
        <textarea id={`cd-${k}`} rows={3} value={val(k)} onChange={set(k)} placeholder={placeholder} className={input} />
      </Field>
    </div>
  );

  const org = !!draft.insuredType && draft.insuredType !== "Individual";
  const suit = isSuit(draft);
  const picked = new Set((draft.demandDocs ?? "").split("\n").filter(Boolean));
  const toggleDoc = (name: string) => setDraft((d) => {
    const s = new Set((d.demandDocs ?? "").split("\n").filter(Boolean));
    s.has(name) ? s.delete(name) : s.add(name);
    return { ...d, demandDocs: [...s].join("\n") };
  });

  return (
    <div className="space-y-5 min-w-0">
      <Section letter="A" title="Insured Details" sub="Who we defend.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {text("insuredName", org ? "Organization name" : "Insured name", { required: true, placeholder: org ? "e.g. Logistics Co." : "Full legal name" })}
          {select("insuredType", "Insured type", INSURED_TYPES, { required: true })}
          {org && text("insuredContact", "Contact person", { placeholder: "Name and title", full: true })}
          {text("insuredEmail", "Contact email", { type: "email", placeholder: "name@example.com" })}
          {text("insuredPhone", "Phone number", { type: "tel", placeholder: "+1 (555) 000-0000" })}
          {text("insuredAddress", "Address", { placeholder: "Street, city, ZIP", full: true })}
          {text("insuredState", "State", { placeholder: "e.g. Illinois" })}
          {text("insuredCountry", "Country", { placeholder: "e.g. United States" })}
          {text("insuredJurisdiction", "Jurisdiction", { placeholder: "Where the insured is based, e.g. Cook County, IL", full: true })}
        </div>
      </Section>

      <Section letter="B" title="Insurance and Policy Information" sub="The coverage behind the insured.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {text("insurerName", "Insurance company", { placeholder: "e.g. Sentinel Casualty Insurance" })}
          {text("policyNumber", "Policy number", { placeholder: "e.g. CGL-0000-00" })}
          {text("policyName", "Policy type", { placeholder: "e.g. Commercial General Liability" })}
          {text("policyLimits", "Policy limits", { placeholder: "e.g. $1,000,000 per occurrence / $2,000,000 aggregate" })}
          {text("insurerJurisdiction", "Insurer jurisdiction", { placeholder: "e.g. Illinois" })}
          {area("coverageNotes", "Additional policy details", "Reservation of rights, exclusions, other insurance")}
        </div>
      </Section>

      <Section letter="C" title="Plaintiff and Counsel Details" sub="Keep the plaintiff's own details apart from their lawyer's.">
        <Group title="Plaintiff">
          {text("plaintiffName", "Plaintiff name", { required: true, placeholder: "Full legal name" })}
          {text("plaintiffLocation", "Location", { placeholder: "City where the plaintiff lives" })}
          {text("plaintiffEmail", "Email", { type: "email", placeholder: "name@example.com" })}
          {text("plaintiffPhone", "Phone number", { type: "tel", placeholder: "+1 (555) 000-0000" })}
          {text("plaintiffState", "State", { placeholder: "e.g. Illinois" })}
          {text("plaintiffCounty", "County", { placeholder: "e.g. Cook County" })}
          {text("plaintiffJurisdiction", "Plaintiff jurisdiction", { placeholder: "e.g. Cook County, IL", full: true })}
        </Group>
        <Group title="Plaintiff's counsel">
          {text("counselName", "Counsel name", { placeholder: "Attorney of record" })}
          {text("counselFirm", "Law firm", { placeholder: "Firm name" })}
          {text("counselEmail", "Counsel email", { type: "email", placeholder: "name@firm.com" })}
          {text("counselPhone", "Counsel phone number", { type: "tel", placeholder: "+1 (555) 000-0000" })}
          {text("counselAddress", "Counsel address", { placeholder: "Street, city, ZIP", full: true })}
        </Group>
      </Section>

      <Section letter="D" title="Legal and Incident Details" sub="What happened, where the case sits, and the deadlines that follow.">
        <Group title="Incident">
          {text("incidentType", "Incident type", { placeholder: "e.g. Fall, vehicle collision" })}
          {select("caseType", "Case type", CASE_TYPES)}
          {text("incidentDate", "Incident date", { type: "date" })}
          {text("incidentLocation", "Incident location", { placeholder: "Where it happened" })}
          {text("incidentState", "Incident state", { placeholder: "e.g. Illinois" })}
          {text("incidentCounty", "Incident county", { placeholder: "e.g. Cook County" })}
          {text("jurisdictionalLimits", "Incident jurisdiction or court limits", { placeholder: "e.g. Law Division, over $30,000", full: true })}
        </Group>
        <div className="space-y-4">
          <h3 className="card-title">Suit</h3>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <fieldset>
              <legend className="block text-sm font-semibold text-[#0F1E2B] mb-2">Suit filed? <span className="text-red-500">*</span></legend>
              <div className="grid grid-cols-2 gap-1.5 w-56 rounded-xl border border-line bg-white p-1" role="radiogroup" aria-label="Suit filed?">
                {[["Suit", "Yes"], ["Pre-suit", "No"]].map(([v, l]) => (
                  <label key={v} className={`text-center px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand ${draft.caseStatus === v ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"}`}>
                    <input type="radio" name="cd-caseStatus" value={v} checked={draft.caseStatus === v} onChange={set("caseStatus")} className="sr-only" />{l}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <div className="block text-sm font-semibold text-[#0F1E2B] mb-2">Case status</div>
              <p className="h-[42px] flex items-center text-sm" aria-live="polite">{draft.caseStatus ? <span className="pill pill-neutral">{draft.caseStatus}</span> : <span className="text-[#8A98A3]">Set by the answer to Suit filed?</span>}</p>
            </div>
          </div>
          {err("caseStatus") && <p role="alert" className="text-xs text-[#B91C1C]">{err("caseStatus")}</p>}
          {suit ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {text("suitFiledDate", "Suit filed date", { type: "date", required: true })}
              {text("courtName", "Court name", { required: true, placeholder: "e.g. Circuit Court of Cook County" })}
              {text("courtLocation", "Court location", { placeholder: "Courthouse address or city" })}
              {text("suitJurisdiction", "Suit jurisdiction", { placeholder: "e.g. Law Division, Cook County, IL" })}
              {text("courtState", "Court state", { placeholder: "e.g. Illinois" })}
              {text("courtCounty", "Court county", { placeholder: "e.g. Cook County" })}
              {select("jurisdictionVerified", "Jurisdiction verification", VERIFY, { placeholder: "Not checked" })}
            </div>
          ) : (
            <p className="text-sm text-[#5B6B78]">{draft.caseStatus === "Pre-suit" ? "No suit filed. Court details and the answer deadline apply once it is." : "Answer Suit filed? to see the suit fields."}</p>
          )}
        </div>
        <Group title="Deadlines & governing law">
          {text("solDate", "Statute of limitations deadline", { type: "date" })}
          {select("solVerified", "SOL verification", VERIFY, { placeholder: "Not checked" })}
          {suit && text("answerDueDate", "Answer due date", { type: "date" })}
          {suit && select("answerVerified", "Answer due verification", VERIFY, { placeholder: "Not checked" })}
          {text("governingLaw", "Governing law", { placeholder: "e.g. Illinois law" })}
          {text("caseJurisdiction", "Governing state, county or court", { placeholder: "e.g. Cook County, IL" })}
        </Group>
      </Section>
      <Section letter="E" title="Demands & Exposure" sub="What the plaintiff is asking for, against what is available.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {text("demandAmount", "Demand amount (USD)", { placeholder: "e.g. 250,000" })}
          {text("demandDate", "Demand date", { type: "date" })}
          {select("demandStatus", "Demand status", DEMAND_STATUSES)}
          <div>
            <div className="block text-sm font-semibold text-[#0F1E2B] mb-2">Applicable policy limits</div>
            <p className="text-sm text-ink min-h-[46px] flex items-center">{draft.policyLimits || <span className="text-[#8A98A3]">Not provided. Add them under Insurance.</span>}</p>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="block text-sm font-semibold text-[#0F1E2B] mb-2">Supporting documents <span className="text-[#5B6B78] font-normal">(Optional)</span></legend>
            {documents.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {documents.map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm cursor-pointer hover:border-[#CBD7DE] min-w-0">
                    <input type="checkbox" checked={picked.has(doc.name)} onChange={() => toggleDoc(doc.name)} className="w-4 h-4 accent-[#3FB5D7] shrink-0" />
                    <span className="mono-ref truncate">{doc.name}</span>
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-[#8A98A3]">No documents on this case yet.</p>}
          </fieldset>
          {area("exposureNotes", "Demand history & exposure notes", "Prior demands, offers, and anything that shapes exposure")}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 lg-card px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <span className={`text-sm ${dirty ? "text-[#B45309] font-semibold" : "text-[#5B6B78]"}`} role="status">
          {dirty ? "Unsaved changes" : "No unsaved changes"}
          {showErrors && Object.keys(errors).length > 0 && <span className="text-[#B91C1C] font-normal"> · {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? "" : "s"} to fix</span>}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onDiscard} disabled={!dirty} className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Discard changes</button>
          <button type="button" onClick={onSave} disabled={!dirty} className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed">Save case details</button>
        </div>
      </div>
    </div>
  );
}
