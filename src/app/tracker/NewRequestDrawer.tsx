import { useEffect, useState } from "react";
import { X, Plus, Check, ArrowRight, Send, Clock } from "lucide-react";
import { type CaseCtx, TAX, METHODS, CHANNELS, OWNERS, APPROVAL_THRESHOLD, taxOf, dateRanges, addDays, today, fmtDate, iso, money } from "./trackerData";
import { createRequest } from "./trackerStore";
import { CatIcon, Avatar, NotConnected } from "./TrackerShared";

interface Form {
  cat: string; type: string; othertype: string; to: string; docs: string[]; other: string;
  range: string; method: string; channel: string; owner: string; cost: string; auto: boolean;
}

const input = "w-full bg-white border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`;
const tileCls = (on: boolean) => `rounded-xl border bg-white transition-colors ${on ? "border-brand ring-2 ring-tint" : "border-line hover:border-[#CBD7DE]"}`;

/** Recipients suggested from the case record itself. */
function suggestions(ctx: CaseCtx) {
  const out: { label: string; set: Partial<Form> }[] = [];
  if (ctx.plaintiff) out.push({ label: `${ctx.plaintiff} (plaintiff, through counsel)`, set: { cat: "Plaintiff discovery", type: "Interrogatories", docs: ["Interrogatory answers"], method: "Discovery request", channel: "Email" } });
  if (ctx.insurer) out.push({ label: `${ctx.insurer} (claim file)`, set: { cat: "Insurance & prior claims", type: "Claims database", docs: ["Complete claim file", "Recorded statements"], method: "Request to adjuster", channel: "Email" } });
  if (ctx.jurisdiction) out.push({ label: `Clerk of court, ${ctx.jurisdiction}`, set: { cat: "Court communications", type: "Court records", docs: ["Docket and pleadings"], method: "Vendor order", channel: "Email" } });
  return out;
}

export function NewRequestDrawer({ ctx, onClose, onCreated }: { ctx: CaseCtx; onClose: () => void; onCreated: (id: string, msg: string) => void }) {
  const ranges = dateRanges(ctx);
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [f, setF] = useState<Form>({
    cat: TAX[0][0], type: "", othertype: "", to: "", docs: TAX[0][2].slice(0, 2), other: "",
    range: ranges[0], method: "Subpoena", channel: CHANNELS[0], owner: OWNERS[0].n, cost: "0", auto: true,
  });
  const set = (p: Partial<Form>) => { setErr(""); setF((x) => ({ ...x, ...p })); };
  const tax = taxOf(f.cat);
  const type = f.type || tax[1][0];
  const due = fmtDate(iso(addDays(today(), METHODS[f.method] ?? 14)));
  const needsApproval = (+f.cost || 0) > APPROVAL_THRESHOLD;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const next = () => {
    if (step === 1 && !f.to.trim()) return setErr("Add who you're requesting from.");
    if (step === 1 && type === "Other" && !f.othertype.trim()) return setErr("Describe the request type.");
    if (step === 2 && !f.docs.length && !f.other.trim()) return setErr("Pick at least one document or describe the records.");
    setStep(step + 1);
  };
  const submit = (mode: "draft" | "send") => {
    if (!f.to.trim()) { setStep(1); return setErr("Add who you're requesting from."); }
    if (mode === "send" && !f.docs.length && !f.other.trim()) { setStep(2); return setErr("Pick at least one document or describe the records."); }
    const id = createRequest(ctx, {
      cat: f.cat, type: type === "Other" ? f.othertype.trim() || "Other" : type, to: f.to.trim(),
      docs: [...f.docs, ...(f.other.trim() ? [f.other.trim()] : [])], range: f.range.trim() || ranges[0],
      method: f.method, channel: f.channel, owner: f.owner, cost: Math.max(0, +f.cost || 0), auto: f.auto,
    }, mode);
    onCreated(id, mode === "draft" ? "Draft saved" : needsApproval ? "Approval request recorded" : "Request recorded as sent. Email isn't connected, so send the letter yourself.");
  };

  const sug = suggestions(ctx);
  let body: React.ReactNode;
  if (step === 1) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">What kind of records?</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TAX.map(([cat, , docs]) => (
            <button key={cat} type="button" aria-pressed={cat === f.cat} onClick={() => set({ cat, type: "", docs: docs.slice(0, 2) })} className={`${tileCls(cat === f.cat)} flex flex-col items-center gap-2 px-2 py-3 text-xs font-semibold text-ink text-center`}>
              <CatIcon cat={cat} size={32} />{cat}
            </button>
          ))}
        </div>
        <span className="block text-xs text-[#5B6B78]">Type within {f.cat}</span>
        <div className="flex flex-wrap gap-1.5">
          {[...tax[1], ...(tax[1].includes("Other") ? [] : ["Other"])].map((y) => (
            <button key={y} type="button" aria-pressed={type === y} onClick={() => set({ type: y })} className={chip(type === y)}>{y}</button>
          ))}
        </div>
        {type === "Other" && <input className={input} value={f.othertype} onChange={(e) => set({ othertype: e.target.value })} placeholder="Describe the type, for example: School records" aria-label="Request type" />}
      </section>
      <section className="space-y-2.5">
        <label htmlFor="nr-to" className="text-sm font-semibold text-ink">Who are you requesting from?</label>
        <input id="nr-to" autoFocus className={`${input} text-[15px]`} value={f.to} onChange={(e) => set({ to: e.target.value })} placeholder="Provider, agency, employer, or party" autoComplete="off" />
        {sug.length > 0 && (
          <>
            <span className="block text-xs text-[#5B6B78]">Suggested from this case</span>
            <div className="flex flex-wrap gap-1.5">
              {sug.map((g) => (
                <button key={g.label} type="button" onClick={() => set({ to: g.label, ...g.set })} className={chip(f.to === g.label)}><Plus className="w-3 h-3" />{g.label}</button>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
  if (step === 2) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Which documents?</span>
        <div className="flex flex-wrap gap-1.5">
          {tax[2].map((d) => {
            const on = f.docs.includes(d);
            return <button key={d} type="button" aria-pressed={on} onClick={() => set({ docs: on ? f.docs.filter((x) => x !== d) : [...f.docs, d] })} className={chip(on)}>{on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{d}</button>;
          })}
        </div>
        <label htmlFor="nr-other" className="block text-xs text-[#5B6B78]">Anything else</label>
        <input id="nr-other" className={input} value={f.other} onChange={(e) => set({ other: e.target.value })} placeholder="Optional: describe other records" />
      </section>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Time period</span>
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((x) => <button key={x} type="button" aria-pressed={f.range === x} onClick={() => set({ range: x })} className={chip(f.range === x)}>{x}</button>)}
        </div>
        <input className={input} value={f.range} onChange={(e) => set({ range: e.target.value })} aria-label="Custom date range" />
      </section>
    </>
  );
  if (step === 3) body = (
    <>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">How will you request it?</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.keys(METHODS).map((m) => (
            <button key={m} type="button" aria-pressed={m === f.method} onClick={() => set({ method: m })} className={`${tileCls(m === f.method)} text-left px-3 py-2.5`}>
              <b className="block text-sm font-semibold text-ink">{m}</b><span className="text-xs text-[#5B6B78]">Response in {METHODS[m]} days</span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2.5">
        <span className="text-sm font-semibold text-ink">Send by</span>
        <div className="flex flex-wrap gap-1.5">{CHANNELS.map((x) => <button key={x} type="button" aria-pressed={x === f.channel} onClick={() => set({ channel: x })} className={chip(x === f.channel)}>{x}</button>)}</div>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <span className="text-sm font-semibold text-ink">Owner</span>
          <div className="flex flex-wrap gap-1.5">{OWNERS.map((o) => <button key={o.n} type="button" aria-pressed={o.n === f.owner} onClick={() => set({ owner: o.n })} className={chip(o.n === f.owner)}><Avatar name={o.n} />{o.n}</button>)}</div>
        </div>
        <label className="space-y-2.5 block"><span className="text-sm font-semibold text-ink">Estimated cost ($)</span>
          <input className={input} type="number" min={0} value={f.cost} onChange={(e) => set({ cost: e.target.value })} />
        </label>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-wash border border-line rounded-xl px-3.5 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink"><Clock className="w-4 h-4 text-deep" />Response due <b>{due}</b></span>
        <label className="inline-flex items-center gap-2 cursor-pointer text-ink">
          Automatic reminders
          <input type="checkbox" role="switch" checked={f.auto} onChange={(e) => set({ auto: e.target.checked })} className="w-4 h-4 accent-[#3FB5D7]" />
        </label>
      </div>
      {needsApproval && (
        <div className="rounded-xl px-3.5 py-3 text-sm bg-[#FFF7ED] border border-[#FDE6C8] text-[#854F0B]">
          <b className="block">Needs carrier approval</b>Over {money(APPROVAL_THRESHOLD)}, so the carrier must approve before the request goes out. An approval request is recorded instead.
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-deep">Preview the request letter</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed bg-offwhite border border-line rounded-xl p-3.5 text-ink font-sans">
{`To: ${f.to || "[recipient]"}\nRe: ${ctx.caseName}${ctx.caseId ? ` · ${ctx.caseId}` : ""}\n\nPlease produce, for ${f.range}:\n${[...f.docs, ...(f.other ? [f.other] : [])].map((d) => "• " + d).join("\n") || "• [documents]"}\n\nPlease respond by ${due}.\n${f.owner} · LexGuard Injury Intel`}
        </pre>
      </details>
      <NotConnected />
    </>
  );

  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-[70]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="nr-title" className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-[560px] bg-white shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <div className="eyebrow text-deep">Step {step} of 3 · {["Recipient", "Documents", "Delivery"][step - 1]}</div>
            <h2 id="nr-title" className="section-header mt-0.5">New document request</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-tint"><X className="w-5 h-5 text-[#5B6B78]" /></button>
        </div>
        <div className="h-[3px] bg-track mx-6 rounded-full overflow-hidden"><span className="block h-full bg-brand transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {body}
          {err && <p role="alert" className="text-sm text-[#B91C1C]">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-line">
          {step > 1
            ? <button type="button" onClick={() => { setErr(""); setStep(step - 1); }} className="h-9 px-4 rounded-lg border border-line text-sm font-semibold text-ink hover:bg-wash">Back</button>
            : <button type="button" onClick={() => submit("draft")} className="h-9 px-4 rounded-lg border border-line text-sm font-semibold text-ink hover:bg-wash">Save as draft</button>}
          {step < 3
            ? <button type="button" onClick={next} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold">Continue <ArrowRight className="w-4 h-4" /></button>
            : <button type="button" onClick={() => submit("send")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold"><Send className="w-4 h-4" />{needsApproval ? "Request approval" : "Send request"}</button>}
        </div>
      </aside>
    </>
  );
}
