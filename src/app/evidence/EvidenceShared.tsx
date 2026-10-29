import { useState, type ReactNode } from "react";
import { Quote, Sparkles, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { OWNERS } from "../tracker/trackerData";
import type { Source, Statement, Severity, Effect, ClaimStatus, Note } from "./caseEvidence";
import { type Decision, recordDecision, when } from "./decisionStore";

export const SEVERITY_PILL: Record<Severity, string> = { Critical: "pill-risk", Major: "pill-progress", Minor: "pill-neutral" };
export const EFFECT_PILL: Record<Effect, string> = { "Helps defense": "pill-complete", "Hurts defense": "pill-risk", "Disputed experts": "pill-neutral", Mixed: "pill-neutral" };
export const STATUS_PILL: Record<ClaimStatus, string> = { Supported: "pill-complete", "Partially supported": "pill-progress", Contradicted: "pill-risk", Unsupported: "pill-risk" };
export const Badge = ({ cls, children }: { cls: string; children: ReactNode }) => <span className={`pill ${cls} whitespace-nowrap`}>{children}</span>;

/** Underline tabs inside a workspace card, brand cyan when selected. */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: [T, string, number?][]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="lg-card p-1.5 flex items-center gap-1.5 overflow-x-auto"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = tabs.findIndex(([k]) => k === value), n = tabs.length;
        const next = tabs[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n][0];
        onChange(next);
        window.setTimeout(() => document.getElementById(`tab-${label}-${next}`)?.focus(), 0);
      }}>
      {tabs.map(([k, l, n]) => (
        <button key={k} id={`tab-${label}-${k}`} type="button" role="tab" aria-selected={value === k} tabIndex={value === k ? 0 : -1} onClick={() => onChange(k)}
          className={`flex-1 min-w-max px-4 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${value === k ? "bg-brand text-white shadow-sm" : "text-[#5B6B78] hover:text-ink hover:bg-wash"}`}>
          {l}{n !== undefined && <span className={`text-[11px] rounded-full px-1.5 tabular-nums ${value === k ? "bg-white/25" : "bg-track"}`}>{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** A quoted statement and where it came from. */
export function StatementCard({ s, src }: { s: Statement; src?: Source }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-[#5B6B78] mb-1.5 flex-wrap">
        <FileText className="w-3.5 h-3.5 text-deep shrink-0" strokeWidth={1.75} />
        <span className="font-semibold text-ink">{src?.type ?? "Source"}</span>
        <span className="mono-ref break-all">{src?.title}</span>
      </div>
      <blockquote className="text-sm text-ink leading-relaxed border-l-2 border-[#9BDAEC] pl-3 break-words">“{s.text}”</blockquote>
      <div className="text-xs text-[#5B6B78] mt-1.5 break-words">
        {s.where}{src?.date ? ` · ${src.date}` : ""}{src?.author ? ` · ${src.author}` : ""}
      </div>
    </div>
  );
}

/** Source facts and analysis, kept visibly apart. */
export function Notes({ notes }: { notes: Note[] }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
          {n.basis === "source"
            ? <Quote className="w-3.5 h-3.5 text-deep mt-1 shrink-0" strokeWidth={1.75} aria-label="From the records" />
            : <Sparkles className="w-3.5 h-3.5 text-[#8A98A3] mt-1 shrink-0" strokeWidth={1.75} aria-label="Analysis" />}
          <span><span className="sr-only">{n.basis === "source" ? "From the records: " : "Analysis: "}</span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}
export const NotesLegend = () => (
  <p className="flex items-center gap-3 text-xs text-[#5B6B78] flex-wrap">
    <span className="inline-flex items-center gap-1"><Quote className="w-3 h-3 text-deep" />From the records</span>
    <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#8A98A3]" />Analysis, for attorney review</span>
  </p>
);

const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";

/** Choose, assign, note, record. Nothing is recorded until Record decision. */
export function DecisionPanel({ caseId, itemKey, title, options, needsOwner, current, compact }: {
  caseId: string; itemKey: string; title: string; options: string[];
  /** Choices that need a follow-up owner. */
  needsOwner: string[];
  current?: Decision; compact?: boolean;
}) {
  const [editing, setEditing] = useState(!current);
  const [choice, setChoice] = useState(current?.choice ?? "");
  const [owner, setOwner] = useState(current?.owner ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [tried, setTried] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const errs = { choice: !choice ? "Choose a decision." : undefined, owner: needsOwner.includes(choice) && !owner ? "Assign the follow-up." : undefined };
  const submit = () => {
    setTried(true);
    if (errs.choice || errs.owner) return;
    const stored = recordDecision(caseId, itemKey, { choice, owner, note });
    toast(stored ? "Decision recorded" : "Decision recorded for this session only. The browser didn't save it.");
    setEditing(false); setTried(false);
  };
  const id = `dec-${itemKey.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-[#9BDAEC] bg-[#F6FDFF] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 id={`${id}-t`} className="card-title">{title}</h4>
        {current ? <Badge cls="pill-complete">Decided</Badge> : <Badge cls="pill-progress">Open</Badge>}
      </div>
      {!editing && current ? (
        <div className="space-y-2 text-sm">
          <p className="text-ink"><b className="font-semibold">{current.choice}</b>{current.owner && <span className="text-[#5B6B78]"> · follow-up: {current.owner}</span>}</p>
          {current.note && <p className="text-ink whitespace-pre-wrap break-words">{current.note}</p>}
          <p className="text-xs text-[#5B6B78]">Recorded by {current.by}, {when(current.at)}</p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button type="button" onClick={() => setHistOpen(!histOpen)} aria-expanded={histOpen} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">
              History ({current.history.length}) <ChevronDown className={`w-3.5 h-3.5 transition-transform ${histOpen ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash">Revisit decision</button>
          </div>
          {histOpen && (
            <ol className="space-y-1 text-xs text-[#5B6B78]">
              {[...current.history].reverse().map((h, i) => <li key={i}>{when(h.at)} · <span className="text-ink">{h.choice}</span>{h.owner ? ` · ${h.owner}` : ""} · {h.by}</li>)}
            </ol>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <fieldset>
            <legend className="sr-only">{title}</legend>
            <div className={`grid gap-1.5 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`} role="radiogroup" aria-label={title}>
              {options.map((o) => (
                <label key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${choice === o ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
                  <input type="radio" name={id} value={o} checked={choice === o} onChange={() => setChoice(o)} className="accent-[#3FB5D7]" />{o}
                </label>
              ))}
            </div>
            {tried && errs.choice && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{errs.choice}</p>}
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor={`${id}-owner`} className="eyebrow block mb-1">Assign follow-up to{needsOwner.includes(choice) && <span className="text-[#B91C1C]"> *</span>}</label>
              <select id={`${id}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
                <option value="">No follow-up</option>
                {OWNERS.map((o) => <option key={o.n} value={o.n}>{o.n}</option>)}
              </select>
              {tried && errs.owner && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{errs.owner}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-note`} className="eyebrow block mb-1">Attorney note</label>
              <textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reasoning, what to ask, what to watch for" className={input} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {current && <button type="button" onClick={() => { setEditing(false); setChoice(current.choice); setOwner(current.owner ?? ""); setNote(current.note ?? ""); setTried(false); }} className="h-8 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint">Cancel</button>}
            <button type="button" onClick={submit} className="inline-flex items-center h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold">Record decision</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <Icon className="w-7 h-7 text-[#9BDAEC] mx-auto mb-2" strokeWidth={1.5} />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="text-sm text-[#5B6B78] mt-1 max-w-md mx-auto">{children}</p>}
    </div>
  );
}
