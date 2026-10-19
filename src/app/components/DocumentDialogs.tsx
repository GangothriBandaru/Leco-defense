import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { DOCUMENT_CATEGORIES, type CaseDocument } from "../types/case";

// ── Edit and delete a case document ──────────────────────────────────────────
// One pair of dialogs wherever case documents are listed (Collection, Analysis
// evidence), so editing and deleting behave the same everywhere.

export interface DocumentDetailsPatch {
  name: string;
  category?: string;
  source: CaseDocument["source"];
  date: string;
}

/** Edits a document's details only — never its stored file or its check. */
export function EditDocumentDialog({
  doc, otherNames, onSave, onClose,
}: {
  doc: CaseDocument;
  /** The other documents' names on the case, which this one must not repeat. */
  otherNames: string[];
  /** Saves; `changed` names the fields that moved, for the history. */
  onSave: (patch: DocumentDetailsPatch, changed: string[]) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: doc.name, category: doc.category ?? "", source: doc.source, date: doc.date });
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const name = form.name.trim();
    if (!name) { setError("A document name is required."); return; }
    if (!/\.[a-z0-9]+$/i.test(name)) { setError("Keep the file extension, for example .pdf."); return; }
    if (otherNames.includes(name)) { setError("Another document on this case already has that name."); return; }
    if (!form.date.trim()) { setError("A date is required."); return; }
    const changed = [
      name !== doc.name && "name",
      (form.category || undefined) !== doc.category && "category",
      form.source !== doc.source && "source",
      form.date.trim() !== doc.date && "date",
    ].filter(Boolean) as string[];
    onSave({ name, category: form.category || undefined, source: form.source, date: form.date.trim() }, changed);
  };
  const input = "w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand";
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Edit document details" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="card-title">Edit document details</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block">
            <span className="eyebrow block mb-1">Document name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
          </label>
          <label className="block">
            <span className="eyebrow block mb-1">Category</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
              <option value="">From the file name (automatic)</option>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow block mb-1">Source</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as CaseDocument["source"] })} className={input}>
                <option value="Plaintiff">Plaintiff</option>
                <option value="Attorney">Attorney</option>
              </select>
            </label>
            <label className="block">
              <span className="eyebrow block mb-1">Date</span>
              <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
            </label>
          </div>
          <p className="text-xs text-[#5B6B78]">Changing details keeps the stored file and its check — nothing is reprocessed.</p>
          {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} className="btn btn-primary">Save changes</button>
        </div>
      </div>
    </div>
  );
}

/** Confirms deleting a document; the page does the deletion. */
export function DeleteDocumentDialog({
  doc, error, onConfirm, onClose,
}: {
  doc: CaseDocument;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-label="Delete document" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 space-y-2">
          <h2 className="card-title flex items-center gap-2"><Trash2 className="w-4 h-4 text-[#B91C1C]" strokeWidth={1.75} /> Delete this document?</h2>
          <p className="body-text"><span className="mono-ref text-ink">{doc.name}</span> will be removed from this case{doc.storageKey ? ", and its stored file deleted from this browser" : ""}. This cannot be undone.</p>
          {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn bg-[#B91C1C] border border-[#B91C1C] text-white hover:bg-[#991B1B]">Delete document</button>
        </div>
      </div>
    </div>
  );
}
