import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import type { CaseDetails } from "../intake/caseDetailsStore";

const CASE_TYPES = [
  "Motor Vehicle Accident",
  "Truck Accident",
  "Slip & Fall",
  "Medical Malpractice",
  "Workplace Injury",
  "Wrongful Death",
  "Product Liability",
  "Other",
];

const input =
  "w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-[#0F1E2B] placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-all";
const inputError = "border-[#B91C1C] focus:border-[#B91C1C]";

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#0F1E2B] mb-2">
        {label} {required ? <span className="text-red-500">*</span> : <span className="text-[#5B6B78] font-normal">(Optional)</span>}
      </label>
      {children}
      {error && <p className="text-xs text-[#B91C1C] mt-1.5">{error}</p>}
    </div>
  );
}

export function EditCaseDetailsDialog({
  initial,
  caseId,
  onSave,
  onClose,
}: {
  initial: CaseDetails;
  caseId: string;
  onSave: (next: CaseDetails) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CaseDetails>(initial);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof CaseDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const email = form.insuredEmail?.trim() ?? "";
  const errors = {
    caseName: !form.caseName?.trim() ? "Case name is required." : undefined,
    insuredEmail: email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : undefined,
  };
  const valid = !errors.caseName && !errors.insuredEmail;

  const handleSave = () => {
    setSubmitted(true);
    if (valid) onSave(form);
  };

  // A case type not in the list (from an existing record) stays selectable.
  const caseTypes = form.caseType && !CASE_TYPES.includes(form.caseType) ? [form.caseType, ...CASE_TYPES] : CASE_TYPES;

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-case-details-title"
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-line px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="edit-case-details-title" className="section-header">Edit Case Details</h2>
              <p className="secondary-text mt-1">Update the case, insured and insurer information for <span className="mono-ref">{caseId}</span>.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-tint rounded-lg transition-colors">
              <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Case Name" required error={submitted ? errors.caseName : undefined}>
              <input autoFocus type="text" value={form.caseName ?? ""} onChange={set("caseName")} className={`${input} ${submitted && errors.caseName ? inputError : ""}`} />
            </Field>
            <Field label="Case Type">
              <select value={form.caseType ?? ""} onChange={set("caseType")} className={input}>
                <option value="">Select type...</option>
                {caseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <div className="space-y-4 pt-4 border-t border-line">
            <h3 className="card-title">Insured</h3>
            <Field label="Insured Name">
              <input type="text" value={form.insuredName ?? ""} onChange={set("insuredName")} placeholder="e.g. Logistics Co." className={input} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Insured Email" error={submitted ? errors.insuredEmail : undefined}>
                <input type="email" value={form.insuredEmail ?? ""} onChange={set("insuredEmail")} placeholder="e.g. claims@insured.com" className={`${input} ${submitted && errors.insuredEmail ? inputError : ""}`} />
              </Field>
              <Field label="Insured Phone">
                <input type="tel" value={form.insuredPhone ?? ""} onChange={set("insuredPhone")} placeholder="e.g. +1 (555) 000-0000" className={input} />
              </Field>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-line">
            <h3 className="card-title">Insurer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Policy Name">
                <input type="text" value={form.policyName ?? ""} onChange={set("policyName")} placeholder="e.g. Commercial General Liability" className={input} />
              </Field>
              <Field label="Insurer Jurisdiction">
                <input type="text" value={form.insurerJurisdiction ?? ""} onChange={set("insurerJurisdiction")} placeholder="e.g. Illinois" className={input} />
              </Field>
              <Field label="Insurer">
                <input type="text" value={form.insurerName ?? ""} onChange={set("insurerName")} placeholder="e.g. Sentinel Casualty Insurance" className={input} />
              </Field>
              <Field label="Policy No.">
                <input type="text" value={form.policyNumber ?? ""} onChange={set("policyNumber")} placeholder="e.g. CGL-0000-00" className={input} />
              </Field>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-line px-6 py-4 rounded-b-xl flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
          <Button
            onClick={handleSave}
            disabled={submitted && !valid}
            className="bg-brand hover:bg-deep text-white border-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
