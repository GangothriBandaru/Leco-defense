import { useState } from "react";
import { Sparkles } from "lucide-react";

// ── Describe it, then review it ──────────────────────────────────────────────
// The "with AI" panel shared by the add forms (damages, damage factors): the
// attorney describes the record, the form is filled from what the description
// states, and the attorney reviews every field before saving. Nothing is saved
// from here.

export interface DraftResult {
  /** What was filled in. Empty means nothing could be read. */
  filled: string[];
  /** What the description did not settle. */
  needed: string[];
}

export function AiDraftPanel({
  placeholder, onApply, onClose, autoFocus = false,
}: {
  placeholder: string;
  /** Fills the form from the description; returns what it filled and what is missing. */
  onApply: (text: string) => DraftResult;
  onClose: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; needed: string[] } | null>(null);
  const run = () => {
    if (!text.trim()) { setResult({ ok: false, message: "Describe it first.", needed: [] }); return; }
    const r = onApply(text);
    setResult(r.filled.length === 0
      ? { ok: false, message: "Nothing could be read from that description. Fill in the form below, or describe it with the amounts and names written out.", needed: [] }
      : { ok: true, message: `Suggested from your description: ${r.filled.join(", ")}. These are suggestions, not verified case data — review every field before saving.`, needed: r.needed });
  };
  const input = "w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand resize-y";
  return (
    <div className="rounded-xl border border-[#D6F2F7] bg-[#F6FDFF] p-3.5 space-y-2.5">
      <label className="block">
        <span className="eyebrow mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Describe it</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={placeholder} autoFocus={autoFocus} className={input} />
      </label>
      <p className="text-[11px] text-[#8A98A3]">
        Read in this browser from your words only — amounts and documents are taken only when you state them, and only this case's documents can be suggested. Nothing is saved until you save the form.
      </p>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-8 px-2.5 rounded-lg border border-line bg-white text-ink text-xs font-semibold hover:bg-wash">Use the form instead</button>
        <button type="button" onClick={run} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold"><Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} /> Fill the form</button>
      </div>
      {result && (
        <div role={result.ok ? "status" : "alert"} className={`text-xs rounded-lg px-3 py-2 ${result.ok ? "bg-white border border-line text-ink" : "bg-[#FEF2F2] border border-[#FBD5D5] text-[#B91C1C]"}`}>
          <p>{result.message}</p>
          {result.needed.length > 0 && <p className="text-[#B45309] mt-1">Still needed: {result.needed.join("; ")}.</p>}
        </div>
      )}
    </div>
  );
}
