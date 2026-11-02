import { useEffect, useState } from "react";
import {
  Stethoscope, Receipt, Pill, Siren, Briefcase, ShieldCheck, Scale, Microscope, Landmark, FileText,
  Paperclip, Reply, Forward, Send, ChevronDown, Info, X, Download,
} from "lucide-react";
import { type CaseCtx, type DocRequest, type MailMsg, TONE_PILL, fmtDate, fmtShort, fmtTime, smartReplies, statusLabel, daysTo, isDone } from "./trackerData";
import { sendReply } from "./trackerStore";
import { sampleFile, saveBlob } from "./trackerFiles";

const CAT_ICON: Record<string, typeof FileText> = {
  "Medical records": Stethoscope, "Medical bills & liens": Receipt, "Pharmacy": Pill, "Police & accident reports": Siren,
  "Employment & wages": Briefcase, "Insurance & prior claims": ShieldCheck, "Plaintiff discovery": Scale,
  "Experts & investigations": Microscope, "Court communications": Landmark, "Other": FileText,
};

export function CatIcon({ cat, size = 36 }: { cat: string; size?: number }) {
  const Icon = CAT_ICON[cat] ?? FileText;
  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-tint text-deep shrink-0" style={{ width: size, height: size }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.75} />
    </span>
  );
}

export const Tag = ({ text, tone = "" }: { text: string; tone?: string }) => <span className={`${TONE_PILL[tone] ?? TONE_PILL[""]} whitespace-nowrap`}>{text}</span>;

export function StatusPill({ r }: { r: DocRequest }) {
  const [t, k] = statusLabel(r);
  return <Tag text={t} tone={k} />;
}

export function DueChip({ r }: { r: DocRequest }) {
  if (isDone(r)) return <span className="text-xs font-semibold text-[#15803D] whitespace-nowrap">Done</span>;
  const n = daysTo(r);
  if (n === null) return <span className="text-xs text-[#8A98A3] whitespace-nowrap">Not scheduled</span>;
  const cls = n < 0 ? "text-[#B91C1C]" : n <= 3 ? "text-[#B45309]" : "text-[#5B6B78]";
  return <span className={`text-xs font-semibold whitespace-nowrap ${cls}`}>{n < 0 ? `${-n}d overdue` : n === 0 ? "Due today" : `Due in ${n}d`}</span>;
}

export const Avatar = ({ name }: { name: string }) => (
  <span title={name} className="w-6 h-6 rounded-full bg-ink text-white text-[10px] font-semibold inline-flex items-center justify-center shrink-0">
    {name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
  </span>
);

export const KIND_TONE: Record<string, string> = {
  Request: "acc", Reminder: "warn", Escalation: "crit", "Approval request": "", Approval: "ok", Reply: "acc", Forward: "",
  Draft: "", Acknowledgment: "acc", Response: "ok", "Court notice": "acc", Notice: "warn", Update: "",
};

export const NotConnected = ({ className = "" }: { className?: string }) => (
  <p className={`flex items-start gap-1.5 text-xs text-[#5B6B78] ${className}`}>
    <Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
    Email isn't connected. Messages are records kept in this browser; nothing here is delivered.
  </p>
);

const addr = (n: string, e: string) => n && e ? `${n} <${e}>` : e || `${n || "Unknown"} · no email on file`;

function MailCard({ ctx, m, open, onToggle, onReply, onForward }: { ctx: CaseCtx; m: MailMsg; open: boolean; onToggle: () => void; onReply: () => void; onForward: () => void }) {
  const out = m.dir !== "in";
  const [view, setView] = useState<{ name: string; blob: Blob } | null>(null);
  return (
    <article className={`border border-line rounded-xl bg-white overflow-hidden ${out ? "border-l-[3px] border-l-brand" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-wash">
        <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0 ${out ? "bg-tint text-deep" : "bg-[#F1F3F5] text-ink"}`}>
          {(m.fromN || "?").replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map((x) => x[0]).join("").slice(0, 2) || "?"}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap text-sm">
            <b className="font-semibold text-ink break-words min-w-0">{m.fromN || "Unknown sender"}</b>
            <Tag text={m.kind} tone={KIND_TONE[m.kind]} />
            {m.att.length > 0 && <span className="inline-flex items-center gap-0.5 text-xs text-[#5B6B78]"><Paperclip className="w-3 h-3" />{m.att.length}</span>}
          </span>
          <span className={`block text-xs text-[#5B6B78] mt-0.5 ${open ? "break-words" : "truncate"}`}>
            {open ? `to ${addr(m.toN, m.toE)}` : m.body.replace(/\s+/g, " ").slice(0, 120)}
          </span>
        </span>
        <span className="text-[11px] text-[#5B6B78] text-right whitespace-nowrap tabular-nums">{fmtShort(m.at)}<br />{fmtTime(m.at)}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 sm:pl-[58px] space-y-3">
          <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-[#5B6B78] border-b border-line pb-2.5">
            <dt className="eyebrow leading-[18px]">From</dt><dd className="break-words leading-[18px]">{addr(m.fromN, m.fromE)}</dd>
            <dt className="eyebrow leading-[18px]">To</dt><dd className="break-words leading-[18px]">{addr(m.toN, m.toE)}</dd>
            <dt className="eyebrow leading-[18px]">Subject</dt><dd className="break-words leading-[18px] text-ink">{m.subject}</dd>
            <dt className="eyebrow leading-[18px]">Date</dt><dd className="leading-[18px]">{fmtDate(m.at)}, {fmtTime(m.at)}</dd>
          </dl>
          <div className="whitespace-pre-wrap break-words text-sm text-ink leading-[1.65] max-w-[72ch]">{m.body}</div>
          {m.att.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {m.att.map((a) => m.demo ? (
                <button key={a.name} type="button" title={`View ${a.name}`} onClick={() => setView({ name: a.name, blob: sampleFile(a.name, ctx.caseName, m.fromN) })} className="inline-flex items-center gap-1.5 border border-line rounded-lg px-2.5 py-1.5 text-xs bg-offwhite max-w-full min-w-0 hover:border-brand">
                  <Paperclip className="w-3.5 h-3.5 text-deep shrink-0" /> <span className="mono-ref truncate">{a.name}</span>
                </button>
              ) : (
                <span key={a.name} title={a.name} className="inline-flex items-center gap-1.5 border border-line rounded-lg px-2.5 py-1.5 text-xs bg-offwhite max-w-full min-w-0">
                  <Paperclip className="w-3.5 h-3.5 text-deep shrink-0" /> <span className="mono-ref truncate">{a.name}</span>
                </span>
              ))}
              {view && <FilePreview name={view.name} blob={view.blob} onClose={() => setView(null)} />}
            </div>
          )}
          {m.dir !== "draft" && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {m.dir === "in" && <button type="button" onClick={onReply} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-xs font-semibold text-deep hover:bg-wash"><Reply className="w-3.5 h-3.5" />Reply</button>}
              <button type="button" onClick={onForward} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-xs font-semibold text-deep hover:bg-wash"><Forward className="w-3.5 h-3.5" />Forward</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

interface Compose { src: MailMsg; fwd: boolean; toN: string; toE: string; subject: string; body: string }
const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";

/** A conversation: its messages oldest first, with Reply and Forward. */
export function Thread({ ctx, messages }: { ctx: CaseCtx; messages: MailMsg[] }) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [c, setC] = useState<Compose | null>(null);
  const [err, setErr] = useState("");
  if (!messages.length) return <p className="text-sm text-[#8A98A3]">No messages yet.</p>;
  const lastIn = [...messages].reverse().find((m) => m.dir === "in");
  const start = (src: MailMsg, fwd: boolean) => {
    setErr("");
    setC({
      src, fwd, toN: fwd ? "" : src.fromN, toE: fwd ? "" : src.fromE,
      subject: (fwd ? "Fwd: " : "Re: ") + src.subject.replace(/^(Re: |Fwd: )+/, ""),
      body: fwd ? `\n\n---------- Forwarded message ----------\nFrom: ${addr(src.fromN, src.fromE)}\nDate: ${fmtDate(src.at)}, ${fmtTime(src.at)}\nSubject: ${src.subject}\n\n${src.body}` : "",
    });
  };
  const send = () => {
    if (!c) return;
    if (c.fwd && !c.toN.trim() && !c.toE.trim()) return setErr("Add a recipient.");
    if (c.toE.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.toE.trim())) return setErr("Enter a valid email address.");
    if (!c.body.trim()) return setErr("Write a message first.");
    sendReply(ctx, c.src, c.fwd, { n: c.toN.trim(), e: c.toE.trim() }, c.subject.trim() || c.src.subject, c.body);
    setC(null);
  };
  return (
    <div className="space-y-2">
      {messages.map((m, i) => {
        const open = openIds[m.id] ?? i >= messages.length - 2;
        return <MailCard key={m.id} ctx={ctx} m={m} open={open} onToggle={() => setOpenIds((o) => ({ ...o, [m.id]: !open }))} onReply={() => start(m, false)} onForward={() => start(m, true)} />;
      })}
      {c ? (
        <div className="border border-brand rounded-xl p-3 space-y-2.5 bg-white ring-2 ring-tint">
          <div className="text-sm font-semibold text-ink">{c.fwd ? "Forward" : "Reply"}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block"><span className="eyebrow block mb-1">To (name)</span><input className={input} value={c.toN} onChange={(e) => setC({ ...c, toN: e.target.value })} /></label>
            <label className="block"><span className="eyebrow block mb-1">To (email)</span><input className={input} type="email" value={c.toE} placeholder="name@example.com" onChange={(e) => setC({ ...c, toE: e.target.value })} /></label>
          </div>
          <label className="block"><span className="eyebrow block mb-1">Subject</span><input className={input} value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} /></label>
          {!c.fwd && (
            <div className="flex flex-wrap gap-1.5">
              {smartReplies(c.src.kind).map((t) => (
                <button key={t} type="button" onClick={() => setC({ ...c, body: `${t}\n\nThank you,\n${c.src.toN || "Jennifer Davis"}` })} className="text-left text-xs px-2.5 py-1.5 rounded-full border border-line hover:border-brand hover:bg-wash text-ink">{t.length > 60 ? t.slice(0, 58) + "…" : t}</button>
              ))}
            </div>
          )}
          <textarea className={`${input} min-h-[110px]`} aria-label="Message" value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} />
          {err && <p className="text-xs text-[#B91C1C]">{err}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setC(null)} className="h-8 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint">Cancel</button>
            <button type="button" onClick={send} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold"><Send className="w-3.5 h-3.5" />Record {c.fwd ? "forward" : "reply"}</button>
          </div>
          <NotConnected />
        </div>
      ) : lastIn ? (
        <button type="button" onClick={() => start(lastIn, false)} className="w-full flex items-center gap-2 border border-dashed border-line rounded-xl px-3.5 py-3 text-sm text-[#5B6B78] hover:border-brand hover:text-deep text-left">
          <Reply className="w-4 h-4" /> Reply to {lastIn.fromN || "sender"}…
        </button>
      ) : null}
    </div>
  );
}

export function Collapse({ open }: { open: boolean }) {
  return <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />;
}

/** A centred dialog; Escape or the backdrop closes it. */
export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[calc(100vh-32px)] flex flex-col bg-white rounded-xl shadow-xl border border-line`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <h3 className="text-[15px] font-semibold text-ink truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-tint"><X className="w-4 h-4 text-[#5B6B78]" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-line">{footer}</div>}
      </div>
    </div>
  );
}

/** Shows a document in the page, with a download of the same file. */
export function FilePreview({ name, blob, onClose }: { name: string; blob: Blob; onClose: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  const pdf = blob.type === "application/pdf" || /\.pdf$/i.test(name);
  const img = blob.type.startsWith("image/");
  return (
    <Modal title={name} onClose={onClose} wide footer={
      <button type="button" onClick={() => saveBlob(blob, name)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold"><Download className="w-3.5 h-3.5" />Download</button>
    }>
      {!url ? null : pdf ? <iframe title={name} src={url} className="w-full h-[65vh] rounded-lg border border-line bg-offwhite" />
        : img ? <img src={url} alt={name} className="max-w-full max-h-[65vh] mx-auto rounded-lg border border-line" />
        : <p className="text-sm text-[#5B6B78]">This file type can't be shown here. Download it to open it.</p>}
    </Modal>
  );
}
